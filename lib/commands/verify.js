/**
 * Module: Command — verify + verify-complete
 * Purpose: verify-run: execute real tests, auto-parse TC results from output, write 04_TEST_RESULTS.json.
 *          verify-complete: gate — validates 04_TEST_RESULTS.json, unlocks Phase 5.
 *          verify: disabled — redirects to verify-run.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { loadConfig, saveConfig, readArtifact, readArtifactFile, artifactPath, appendEvent, writeLastSession, atomicWrite, hashResultsFile } from '../state.js';
import { buildProjectSnapshot, topNextAction } from '../snapshot.js';

// §3.10 / Windows (rc.64 adopter): npm-family launchers are `.cmd` shims on Windows,
// and `spawn()` with `shell:false` cannot resolve a bare "npm"/"npx" (it ENOENTs).
// Map the known shims to their `.cmd` on win32 so project-declared gate/test commands
// actually run — WITHOUT switching to `shell:true` (which would reintroduce injection
// surface + the DEP0190 args+shell deprecation). node/dotnet/python/go resolve as
// `.exe` and are left untouched. No-op on POSIX, so POSIX behaviour is unchanged.
const WIN_SHIMS = new Set(['npm', 'npx', 'yarn', 'pnpm', 'pnpx']);

// Default ceiling (ms) for how long the automated test run may take before Aitri
// kills it as hung. It is a hang-catcher, NOT a speed target — its only job is to
// stop a runaway/hung runner from freezing the CLI forever. The failure is
// asymmetric: too-low kills a healthy-but-slow suite (a phantom regression), while
// too-high just delays killing a genuinely hung process — so the default is set
// generously (15 min) and a slow suite raises it via 04_BUILD_REPORT.json#
// test_runner_timeout_ms. Hitting it is reported as a timeout to raise, never as a
// failing suite (see the kill guard in cmdVerifyRun).
export const RUNNER_TIMEOUT_DEFAULT_MS = 900000;

// Capture-buffer ceiling (bytes) for the test-runner spawn. spawnSync's default is
// 1 MiB — a verbose runner (`pytest -v`, `node --test`, `vitest --reporter verbose`)
// blows past it, at which point Node KILLS the child (ENOBUFS) and TRUNCATES stdout.
// The truncated output was then parsed as if the run finished, so TC markers past the
// cut vanished → those TCs went `skipped` → verifyPassed flipped false: the same
// phantom regression the timeout guard exists to prevent, on a healthy-but-loud suite.
// Raise it well past any realistic test log so a heavy suite is never killed for volume.
export const RUNNER_MAX_BUFFER = 64 * 1024 * 1024;
export function resolveWinBin(bin) {
  if (process.platform !== 'win32' || typeof bin !== 'string') return bin;
  if (/\.[a-z0-9]+$/i.test(bin)) return bin; // already has an extension
  return WIN_SHIMS.has(bin.toLowerCase()) ? `${bin}.cmd` : bin;
}
import { readStdinSync } from '../read-stdin.js';
import { autoVerifyBugs, getBlockingBugs, promptAndRegisterBugs, assertBugsReadable } from './bug.js';
import { scopeTokens } from '../scope.js';
// Canonical TC-id grammar lives in lib/tc-id.js (single source of truth, shared
// with the Phase 3 authoring gate). Re-exported here so existing importers and
// tests keep their `verify.js` import path.
import { extractTCId } from '../tc-id.js';
import { isMustRequirement, activeSecurityNfrs } from '../requirements.js';
export { extractTCId };
// Pure verdict extractor; phaseReview.js imports only personas/render/context —
// no path back to verify.js, so this is cycle-free.
import { extractReviewVerdict } from '../phases/phaseReview.js';


// Pure result parsers & derivations live in lib/verify-parsers.js (UPLAN-0703 B9 —
// the ~660-line stack-agnostic parser matrix, extracted for independent review). Imported
// for internal use AND re-exported here so every existing `verify.js` importer/test path is
// unchanged.
import {
  parseRunnerOutput, parseVitestOutput, parsePytestOutput, parsePlaywrightOutput,
  parseGoOutput, parseTrxResults, parseJUnitXmlResults, parseXmlResults, resolveResultFiles,
  buildFRCoverage, buildACCoverage, scanTestContent, scanAssertionDensity,
  parseCoverageOutput, injectCoverageFlag, findMultiTCIdLines, hasShellChain
} from '../verify-parsers.js';
export {
  parseRunnerOutput, parseVitestOutput, parsePytestOutput, parsePlaywrightOutput,
  parseGoOutput, parseTrxResults, parseJUnitXmlResults, parseXmlResults, resolveResultFiles,
  buildFRCoverage, buildACCoverage, scanTestContent, scanAssertionDensity,
  parseCoverageOutput, injectCoverageFlag, findMultiTCIdLines, hasShellChain
};


/**
 * Run the project-declared code-quality gates (lint, type-check, security, …).
 *
 * Aitri does not implement analyzers — zero-dep, stack-agnostic. It runs the
 * command each gate declares in 04_BUILD_REPORT.json#quality_gates
 * and judges the result by EXIT CODE (0 = pass), exactly like it already runs
 * the project's test_runner. This is the orchestrate-don't-bundle pattern (per
 * ADR-037): the project brings its own `eslint`/`tsc`/`ruff`/`mypy`/`go vet`/
 * `gosec`, Aitri executes it and gates the pipeline on the outcome.
 *
 * A gate whose binary is missing (ENOENT) is `error` — it could not certify the
 * code, so a `required` error blocks just like a fail (a declared-but-uninstalled
 * gate is a setup defect, not a silent pass).
 *
 * @param {Array<{name?: string, command: string, required?: boolean}>} gates
 * @param {string} dir
 * @returns {Array<{name: string, command: string, required: boolean, status: 'pass'|'fail'|'error', exit_code: number|null, output?: string}>}
 */
export function runQualityGates(gates, dir) {
  const out = [];
  for (const g of (Array.isArray(gates) ? gates : [])) {
    if (!g || typeof g.command !== 'string' || !g.command.trim()) continue;
    const required = g.required !== false; // default true — a declared gate is meant to gate
    const name     = (typeof g.name === 'string' && g.name.trim()) || g.command.trim().split(/\s+/)[0];
    const parts    = g.command.trim().split(/\s+/);
    // Per-gate timeout (additive `timeout_ms`, default 5 min). Slow gates — mutation
    // testing, full integration/e2e suites — routinely exceed the default and would
    // otherwise be killed and mis-read as a code failure. The project raises it on the
    // gates that need it; absent the field, behavior is unchanged.
    const timeoutMs = (typeof g.timeout_ms === 'number' && g.timeout_ms > 0) ? g.timeout_ms : 300000;
    const r = spawnSync(resolveWinBin(parts[0]), parts.slice(1), { cwd: dir, encoding: 'utf8', timeout: timeoutMs, shell: false });
    let status, exit_code, note = '';
    if (r.error?.code === 'ENOENT') {
      status = 'error'; exit_code = null;   // binary not installed — a setup defect, not a code fail
    } else if (r.error?.code === 'ENOBUFS') {
      // Overflowed the capture buffer — raising timeout_ms cannot fix this; say what
      // actually happened (same misattribution class as the timeout-vs-crash split below).
      status = 'error'; exit_code = null;
      note = `[aitri] gate output overflowed the capture buffer and the run was killed — reduce the gate's output (quiet/summary flags, log to a file) and re-run.`;
    } else if (r.signal || r.error?.code === 'ETIMEDOUT') {
      // killed at timeoutMs — surface as `error`, not `fail`, so a too-short timeout
      // reads as "raise timeout_ms", not "the code failed the check".
      status = 'error'; exit_code = null;
      note = `[aitri] gate did not finish within ${timeoutMs}ms — raise "timeout_ms" on this gate if it legitimately needs longer (e.g. mutation testing).`;
    } else if (r.error) {
      // spawn failed for a non-kill reason (EACCES on a non-executable script, EPERM, …) —
      // NOT a timeout. Diagnosing this as "did not finish" would be the same misattribution
      // class FB-COVERAGE-GATE-0715 fixed one branch over: say what actually happened.
      status = 'error'; exit_code = null;
      note = `[aitri] gate could not start: ${r.error.code || r.error.message} — check the command is executable and the path is correct.`;
    } else {
      exit_code = r.status ?? 1;
      status = exit_code === 0 ? 'pass' : 'fail';
    }
    const text = [r.stdout || '', r.stderr || '', note].filter(Boolean).join('\n').trim();
    out.push({ name, command: g.command, required, status, exit_code, ...(text ? { output: text.slice(-600) } : {}) });
  }
  return out;
}

/**
 * True if any declared quality_gate is a mutation-testing gate. Mutation is the only
 * mechanical signal that catches a fake pass (a test green without exercising real
 * code — the Ledger seam). Detection is by tool signature in the gate name/command
 * (Stryker, pitest, mutmut, cosmic-ray, *mutesting, infection) so verify-run can nudge
 * a project that has automated tests but declares none. Heuristic, never a gate: a
 * false negative just shows the ignorable nudge; a false positive just suppresses it.
 *
 * @param {Array<{name?: string, command?: string}>} gates
 * @returns {boolean}
 */
export function hasMutationGate(gates) {
  return (Array.isArray(gates) ? gates : [])
    .some(g => g && /mutat|stryker|pitest|mutmut|cosmic[\s_-]?ray|mutesting|infection/i.test(`${g.name || ''} ${g.command || ''}`));
}

/**
 * True if any declared quality_gate runs Playwright (FB-VERIFY-BLINDSPOTS-0710).
 * Used by the double-execution nudge: when a project both declares a Playwright gate
 * AND has playwright.config.* (which triggers the auto-run), the e2e suite executes
 * twice per verify-run — and the gate's 5-min default timeout (vs the runner's 15)
 * turns a long suite into a misleading `error` red.
 *
 * @param {Array} gates - manifest quality_gates
 * @returns {boolean}
 */
export function hasPlaywrightGate(gates) {
  return (Array.isArray(gates) ? gates : [])
    .some(g => g && /playwright/i.test(`${g.name || ''} ${g.command || ''}`));
}

/**
 * True if the project declares any FR that gives the target a runnable UI surface
 * (type ux/visual). This is the reliable mechanical proxy for "this target boots and
 * serves screens" — the case where a green suite can still ship an app that 500s on
 * first boot (the budget/SMOKE-RUN seam). Headless services have no such FR type and
 * are intentionally NOT flagged (the nudge stays a UI-target backstop, not a blanket).
 *
 * @param {object} requirements - parsed 01_REQUIREMENTS.json
 * @returns {boolean}
 */
export function hasUISurfaceFRs(requirements) {
  const frs = requirements?.functional_requirements;
  // ux/visual/audio is the canonical UI-surface FR set across the codebase
  // (snapshot.js, approve.js, phase4.js, phaseUX.js, phase1/3.js) — an audio
  // web app serves screens too, so it must not slip past the smoke nudge.
  return (Array.isArray(frs) ? frs : [])
    .some(fr => ['ux', 'visual', 'audio'].includes(String(fr?.type || '').toLowerCase()));
}

/**
 * True if any declared quality_gate looks like it boots and exercises the running app
 * (smoke / e2e / health-check). Detection is by signature in the gate name/command —
 * smoke commands are arbitrary (curl, playwright, a project script), so this is a loose
 * heuristic, never a gate. Per the same philosophy as hasMutationGate: a false negative
 * just shows the ignorable nudge; a false positive just suppresses it. Erring toward
 * showing the nudge is the safe side, so the match set stays focused on strong
 * app-execution signals.
 *
 * @param {Array<{name?: string, command?: string}>} gates
 * @returns {boolean}
 */
export function hasAppExecutingGate(gates) {
  return (Array.isArray(gates) ? gates : []).some(g => {
    if (!g) return false;
    const name = String(g.name || '');
    const cmd  = String(g.command || '');
    // Generic intent tokens (smoke / e2e / health-check) match in the gate NAME only — a
    // gate NAMED "smoke" is deliberate, whereas "e2e" appearing as an incidental path
    // segment in a lint command (eslint src/e2e/**) must NOT falsely suppress the nudge
    // (suppression is the unsafe direction). supertest is intentionally absent: it runs
    // the app in-process (no real boot), exactly the gap the nudge exists to flag.
    if (/\bsmoke|\be2e\b|end[\s_-]?to[\s_-]?end|health[\s_-]?check/i.test(name)) return true;
    // Distinctive app-exercising tool signatures match anywhere (name or command).
    return /playwright|cypress|newman|selenium|puppeteer|testcontainers|\bcurl\b|\bwget\b/i.test(`${name} ${cmd}`);
  });
}

/**
 * Quality-gate commands run WITHOUT a shell (runQualityGates → spawnSync, shell:false), so a command
 * is a single executable + args. An inline chain ("npm start && curl ...") passes "&&"/"curl" as
 * literal arguments and only the first program runs — a multi-step gate (especially a smoke gate that
 * boots the app then probes it) then silently mis-runs. Returns the names of gates whose command
 * carries a standalone shell operator, so verify-run can advise moving the steps into a script.
 * Advisory only (erring toward showing, like the other nudges).
 *
 * @param {Array<{name?: string, command?: string}>} gates
 * @returns {string[]} names of offending gates
 */
export function gatesWithShellOperators(gates) {
  return (Array.isArray(gates) ? gates : [])
    .filter(g => g && typeof g.command === 'string' && hasShellChain(g.command))
    .map(g => (typeof g.name === 'string' && g.name.trim()) || String(g.command).trim().split(/\s+/)[0]);
}

/**
 * True if any declared quality_gate looks like a security check (SEC-THREADING-0722).
 * Same philosophy and calibration as hasAppExecutingGate directly above: loose heuristic,
 * never a gate; suppression is the unsafe direction, so generic intent tokens
 * (sec/security/sast/audit) match in the gate NAME only — "security-rules" appearing as
 * a path segment in a lint command must not falsely suppress the nudge — while
 * distinctive scanner signatures match anywhere in name or command (catches a gate
 * NAMED "lint" that actually runs semgrep).
 *
 * @param {Array<{name?: string, command?: string}>} gates
 * @returns {boolean}
 */
export function hasSecurityGate(gates) {
  return (Array.isArray(gates) ? gates : []).some(g => {
    if (!g) return false;
    const name = String(g.name || '');
    const cmd  = String(g.command || '');
    // Bare "audit" is deliberately NOT a name token: "a11y-audit"/"lighthouse-audit"
    // would falsely suppress (rc.7 adversarial finding). A gate NAMED "audit" that runs
    // a dependency audit is caught by the command signatures below (npm/pip/cargo audit).
    if (/\bsec(?:urity)?\b|\bsast\b/i.test(name)) return true;
    return /semgrep|snyk|bandit|trivy|gitleaks|trufflehog|codeql|gosec|grype|osv[\s_-]?scanner|\bzap\b|dependency[\s_-]?check|brakeman|npm audit|pnpm audit|yarn audit|pip-audit|cargo audit|govulncheck/i.test(`${name} ${cmd}`);
  });
}

/**
 * True if the manifest records a deliberate security-gate omission in technical_debt
 * (SEC-THREADING-0722). Loose on purpose: any debt entry whose string fields mention
 * security counts — the build template teaches the canonical shape (fr_id "SEC-GATE"
 * + a full-sentence reason), but a recorded decision in any phrasing must suppress
 * the nudge (the nudge polices silence, not wording).
 *
 * @param {Array<object>} debt
 * @returns {boolean}
 */
export function hasSecurityDebtEntry(debt) {
  return (Array.isArray(debt) ? debt : []).some(d =>
    d && typeof d === 'object' &&
    Object.values(d).some(v => typeof v === 'string' && /secur|sec[\s_-]?gate/i.test(v))
  );
}

export function cmdVerifyRun({ dir, args, flagValue, err, featureRoot, scopeName }) {
  const { verb: sv, arg: sa } = scopeTokens(featureRoot, scopeName);
  const config = loadConfig(dir);
  const artifactsDir = config.artifactsDir || '';
  if (!(config.approvedPhases || []).includes(4)) {
    // Point at the ACTUAL next step from the snapshot (root scope), not "approve 4" —
    // which itself fails when the pipeline is earlier. Feature scope keeps a scope-correct
    // pointer (the snapshot emits root-style commands, so don't cross-wire the prefix).
    const next = featureRoot ? null : topNextAction(dir);
    const hint = next
      ? `\n   Build is not approved yet. Next: ${next.command}${next.reason ? `  (${next.reason})` : ''}`
      : `\n   Run: aitri ${sv}status${sa} to see the current phase and its next step.`;
    err(`Build (Phase 4) must be approved before verify-run.${hint}`);
  }

  const manifestRaw = readArtifact(dir, '04_BUILD_REPORT.json', artifactsDir);
  if (!manifestRaw) err(`Missing 04_BUILD_REPORT.json — complete Phase 4 first.`);

  const testCasesRaw = readArtifact(dir, '03_TEST_CASES.json', artifactsDir);
  if (!testCasesRaw) err(`Missing 03_TEST_CASES.json — complete Phase 3 first.`);

  let manifest, tcs, requirements;
  try { manifest = JSON.parse(manifestRaw); } catch { err('04_BUILD_REPORT.json is malformed JSON'); }
  try { tcs = JSON.parse(testCasesRaw); } catch { err('03_TEST_CASES.json is malformed JSON'); }
  const requirementsRaw = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir);
  try { if (requirementsRaw) requirements = JSON.parse(requirementsRaw); } catch { /* non-fatal */ }

  // Schema precondition: legacy projects (pre-v0.1.x) used `requirement` instead of `requirement_id`
  // on test_cases. Without this guard, buildFRCoverage silently produces an all-zeros fr_coverage
  // and verify-run overwrites 04_TEST_RESULTS.json with broken data. See FEEDBACK.md A2.
  const _tcList = tcs.test_cases || [];
  if (_tcList.length > 0) {
    const hasNewSchema = _tcList.some(tc => tc.requirement_id || Array.isArray(tc.frs));
    if (!hasNewSchema) {
      err(
        `03_TEST_CASES.json uses a legacy schema that this verify-run cannot map to FRs.\n` +
        `  Detected: test cases expose "requirement" (string) but not "requirement_id" or "frs".\n` +
        `  Without the mapping, fr_coverage would be written as all-zeros and overwrite the\n` +
        `  current 04_TEST_RESULTS.json.\n\n` +
        `  Migration: rename "requirement" → "requirement_id" on each test case in\n` +
        `  ${path.join(artifactsDir || 'spec', '03_TEST_CASES.json')}.\n` +
        `  If the value is comma-separated (multi-FR TC), split into one TC per FR or use\n` +
        `  "frs": ["FR-001","FR-002"] instead.`
      );
    }
  }

  // Warn if manifest is missing test_runner or test_files — agent may have forgotten to declare them
  const missingTestRunner = !manifest.test_runner;
  const missingTestFiles  = !Array.isArray(manifest.test_files) || manifest.test_files.length === 0;

  // All-manual project (rc.95, FB-MULTI-0619 #2): every Phase-3 TC is
  // automation:"manual", so there is no automated runner by design (the no_go_zone
  // forbids a suite — complete 4 already waived test_runner/test_files in rc.86).
  // Spawning the default `npm test` would ENOENT on a non-Node stack and exit
  // WITHOUT writing 04_TEST_RESULTS.json, dead-ending `tc verify` ("run verify-run
  // first"). Instead, seed the results file with all TCs manual (no spawn) so the
  // human can record each. An explicit --cmd still runs (the operator asked for a
  // command, e.g. a build gate); only the implicit no-runner case is seeded.
  // Applies to root AND feature scope (FEAT-PARITY-0620): `aitri feature tc <name>
  // verify` now exists to follow the seed, so a feature is no longer walled.
  const _tcAll = tcs.test_cases || [];
  const allManual = _tcAll.length > 0
    && _tcAll.every(tc => tc.automation === 'manual')
    && !flagValue('--cmd');
  // Scope-aware `tc verify` invocation: root → `aitri tc verify`; feature →
  // `aitri feature tc <name> verify` (the name precedes the tc sub-verb, per the
  // `feature <verb> <name> [rest]` grammar — NOT `aitri ${sv}tc verify${sa}`, which
  // would wrongly emit `feature tc verify <name>`).
  const tcVerifyCmd = featureRoot ? `aitri feature tc ${scopeName} verify` : `aitri tc verify`;

  // Resolve test command: --cmd flag > manifest.test_runner > stack-aware fallback.
  // FALLBACK-DEFAULT-0628: the fallback is NOT a blind `npm test`. In a stack-agnostic tool,
  // assuming Node for an undeclared runner silently ENOENTs (or mis-runs) on a Python/Go/.NET
  // project (principle 4). all-manual mode seeds results without spawning, so its value is
  // display-only there — keep the historical `npm test`. When there ARE automated tests to run,
  // fall back to `npm test` only if a package.json is present (a Node project that relied on the
  // implicit default keeps working); otherwise refuse with stack-neutral guidance, never guess Node.
  let testCmd = flagValue('--cmd') || manifest.test_runner;
  if (!testCmd) {
    if (allManual || fs.existsSync(path.join(featureRoot || dir, 'package.json'))) {
      testCmd = 'npm test';
    } else {
      err(
        `No test command to run: 04_BUILD_REPORT.json declares no "test_runner" and no --cmd was given.\n` +
        `Declare your stack's runner in 04_BUILD_REPORT.json#test_runner — e.g. "pytest tests/ -v",\n` +
        `"go test ./...", "dotnet test", "npm test" — or pass --cmd "...". Aitri is stack-agnostic and\n` +
        `does not assume Node.`
      );
    }
  }

  // Auto-detect Python virtualenv: bare 'pytest' won't resolve inside .venv without shell activation.
  // If .venv/bin/pytest (or venv/bin/pytest) exists in the project dir, rewrite the command to use it.
  if (/^pytest\b/.test(testCmd)) {
    const projectRoot = featureRoot || dir;
    const candidates = [
      path.join(projectRoot, '.venv', 'bin', 'pytest'),
      path.join(projectRoot, 'venv',  'bin', 'pytest'),
    ];
    const venvPytest = candidates.find(p => fs.existsSync(p));
    if (venvPytest) {
      testCmd = testCmd.replace(/^pytest/, venvPytest);
      process.stderr.write(`[aitri] Detected virtualenv — using ${venvPytest}\n`);
    }
  }

  // Coverage threshold: instrument the test command for coverage, per runner family.
  // Stack-agnostic — node built-in, go test, pytest-cov, jest, vitest. The coverage
  // tool lives in the project's own env (Aitri orchestrates, does not bundle it).
  // Coverage threshold: the --coverage-threshold flag (ad-hoc) OR a declared
  // coverage gate in the manifest (a quality_gates entry carrying a numeric
  // `threshold` instead of a `command`). The declared gate is the durable form
  // (ADR-037) — it gates the pipeline; the flag is a one-off override.
  const coverageGate = (Array.isArray(manifest.quality_gates) ? manifest.quality_gates : [])
    .find(g => g && typeof g.threshold === 'number');
  const rawThreshold = flagValue('--coverage-threshold');
  const coverageThreshold = rawThreshold !== null ? parseFloat(rawThreshold)
                          : (coverageGate ? coverageGate.threshold : null);
  if (!allManual && coverageThreshold !== null) {
    const inj = injectCoverageFlag(testCmd);
    if (inj.warn) {
      // Recognized runner, but the declared command itself is the problem — nothing was
      // instrumented (the command is never rewritten). Parsing still runs on the output.
      process.stderr.write(`[aitri] Coverage threshold: ${coverageThreshold}% — NOT instrumented.\n[aitri] ⚠ ${inj.warn}\n`);
    } else if (inj.tool) {
      testCmd = inj.cmd;
      process.stderr.write(`[aitri] Coverage threshold: ${coverageThreshold}% (instrumenting via ${inj.tool})\n`);
    } else {
      // Unrecognized runner — still parse, in case test_runner already carries a coverage flag.
      process.stderr.write(
        `[aitri] Coverage threshold ${coverageThreshold}% requested, but the runner "${testCmd.trim().split(/\s+/)[0]}" ` +
        `is not auto-instrumentable. Add the coverage flag to test_runner, or coverage will be reported as not found.\n`
      );
    }
  }

  // Per-project runner timeout (additive `test_runner_timeout_ms`, generous default).
  // Shared by the main runner and the auto-detected Playwright e2e run below.
  const runnerTimeoutMs = (typeof manifest.test_runner_timeout_ms === 'number' && manifest.test_runner_timeout_ms > 0)
    ? manifest.test_runner_timeout_ms
    : RUNNER_TIMEOUT_DEFAULT_MS;

  // Captured before the run so the TRX/JUnit-XML fallback can ignore stale result
  // files written by a previous run (see resolveResultFiles dir-mode freshness guard).
  const runStartMs = Date.now();
  let stdout = '', stderr = '', output = '', exitCode = 0;
  if (allManual) {
    process.stderr.write(
      `[aitri] All ${_tcAll.length} test case(s) are automation:"manual" — no automated runner to run.\n` +
      `[aitri] Seeding 04_TEST_RESULTS.json with manual results. Record each: ${tcVerifyCmd} <TC-ID> --result pass|fail --notes "..."\n` +
      `[aitri] (a human at a terminal can run bare ${tcVerifyCmd} for a guided checklist).\n`
    );
  } else {
    process.stderr.write(`[aitri] Running: ${testCmd}\n`);
    process.stderr.write(`[aitri] Auto-parsing TC results from output (no agent mapping needed)...\n`);

    // Split command into binary + args — shell: false avoids [DEP0190] and injection risk
    const cmdParts = testCmd.trim().split(/\s+/);
    // cwd is the pipeline's own directory: the feature subdir for feature scope,
    // the project root for root scope. Previously this was `featureRoot || dir`,
    // which made feature `verify-run` execute from the parent project root —
    // the canary (Ultron alpha.6) saw 52 of 78 skipped tests come from the
    // parent rather than the feature. Test runners that walk up from cwd to
    // find package.json / config still resolve correctly; what changes is that
    // test discovery is now scoped to the feature, not the parent.
    const result = spawnSync(resolveWinBin(cmdParts[0]), cmdParts.slice(1), {
      cwd: dir,
      encoding: 'utf8',
      timeout: runnerTimeoutMs,
      maxBuffer: RUNNER_MAX_BUFFER,
      shell: false,
    });

    // ENOENT means the runner binary was never found — the test suite did not
    // execute. Continuing past this point would persist a degraded
    // 04_TEST_RESULTS.json (0 passed / N skipped) and flip verifyPassed=false
    // per Z1, surfacing a phantom regression on a project where no test ran.
    // Distinguish "runner crashed before producing output" from "runner ran and
    // produced bad results" — only the second case should mutate state.
    if (result.error?.code === 'ENOENT') {
      const hint = /pytest/.test(cmdParts[0])
        ? `  If using a Python virtualenv, the binary was not found.\n` +
          `  Preferred: set test_runner in 04_BUILD_REPORT.json to a bare\n` +
          `  "pytest <args>" — verify-run auto-detects .venv/ or venv/ at the project\n` +
          `  root and resolves the binary, which stays portable across machines and CI.\n` +
          `  Only if the venv lives elsewhere (poetry, conda, ~/venvs) use an absolute\n` +
          `  path, e.g. aitri ${sv}verify-run${sa} --cmd "/abs/path/to/pytest tests/ -v"\n` +
          `  — note a machine-specific path committed to the manifest will not work in CI.`
        : `  Check that "${cmdParts[0]}" is installed and accessible in PATH.`;
      err(
        `Command not found: "${cmdParts[0]}"\n${hint}\n\n` +
        `04_TEST_RESULTS.json was NOT written and verifyPassed was left unchanged — ` +
        `a missing runner is not the same as a failing test suite.`
      );
    }

    // Any KILL of the runner (timeout, capture-buffer overflow, OOM, OS signal) means
    // the run did not FINISH — it is NOT a failing suite. spawnSync marks a kill with
    // a non-null `signal` or an `error` (ETIMEDOUT / ENOBUFS / …); a normal test
    // FAILURE has neither (signal null, error undefined, status set) and must still be
    // persisted. Like ENOENT, refuse without mutating state: parsing the truncated/
    // partial output would flip verifyPassed=false per Z1 and surface a phantom
    // regression on a healthy-but-heavy suite. Mirrors runQualityGates' `signal ||
    // error` kill check — one signal-based test covers timeout AND buffer AND future
    // kill causes, instead of enumerating error codes.
    if (result.signal || result.error) {
      const timedOut  = result.error && result.error.code === 'ETIMEDOUT';
      const overBuffer = result.error && result.error.code === 'ENOBUFS';
      const reason = timedOut   ? `exceeded its ${runnerTimeoutMs}ms timeout`
                   : overBuffer ? `produced more output than the ${RUNNER_MAX_BUFFER}-byte capture buffer`
                   : `was killed before finishing (${result.error?.code || `signal ${result.signal}`})`;
      const hint = timedOut
        ? `Raise "test_runner_timeout_ms" (milliseconds) in 04_BUILD_REPORT.json if the suite legitimately needs longer — default is ${RUNNER_TIMEOUT_DEFAULT_MS} (15 min).`
        : `This is a killed run, not a failing suite. If it recurs, reduce runner output verbosity or investigate why the process was terminated.`;
      err(
        `Test runner ${reason} and did not finish.\n` +
        `04_TEST_RESULTS.json was NOT written and verifyPassed was left unchanged — ` +
        `a killed runner is not the same as a failing test suite.\n${hint}`
      );
    }

    stdout = result.stdout || '';
    stderr = result.stderr || '';
    output = [stdout, stderr].filter(Boolean).join('\n');
    exitCode = result.status ?? 1;
  }

  // Auto-parse TC results — agent cannot self-report
  const testCaseList = tcs.test_cases || [];
  const detected = parseRunnerOutput(output);

  // Vitest/Jest fallback: if runner is vitest/jest OR node:test parser got 0 TCs, try Vitest parser
  const runnerHint = (manifest.test_runner || testCmd || '').toLowerCase();
  const isVitestOrJest = /vitest|jest/.test(runnerHint);
  if (isVitestOrJest || detected.size === 0) {
    const vitestDetected = parseVitestOutput(output);
    for (const [id, r] of vitestDetected) {
      if (!detected.has(id)) detected.set(id, r);
    }
    if (vitestDetected.size > 0)
      process.stderr.write(`[aitri] Vitest/Jest parser: ${vitestDetected.size} TC(s) detected\n`);
  }

  // §3.8 (rc.64 adopter): the runner exited non-zero AND produced no recognizable TC
  // results. That is almost never "all tests skipped" — the suite likely did not run:
  // a build/compile failure, a crash, an app holding the build output (a running
  // server can lock the binary, e.g. .NET on Windows), or test functions not named
  // after their TC ids. Say so loudly, so the per-TC "rename the function" skip notes
  // below are not mistaken for the real cause. Stack-agnostic — no runner-specific
  // error strings, just exit code + zero detections.
  if (exitCode !== 0 && detected.size === 0) {
    process.stderr.write(
      `\n[aitri] ⚠ The test runner exited non-zero (${exitCode}) and produced NO recognizable TC results.\n` +
      `   This usually means the suite did NOT run — a build/compile failure, a crash, an app holding the\n` +
      `   build output (stop any running server/app and re-run), or test functions not named after their TC\n` +
      `   ids. The per-TC "skip" results below are NOT a real test outcome — read the runner output above and\n` +
      `   fix the cause before trusting verify-run.\n\n`
    );
  }

  // Pytest fallback: if runner is pytest OR still 0 TCs, try pytest -v parser
  const isPytest = /pytest/.test(runnerHint);
  if (isPytest || detected.size === 0) {
    const pytestDetected = parsePytestOutput(output);
    for (const [id, r] of pytestDetected) {
      if (!detected.has(id)) detected.set(id, r);
    }
    if (pytestDetected.size > 0)
      process.stderr.write(`[aitri] pytest parser: ${pytestDetected.size} TC(s) detected\n`);
  }

  // Go fallback (alpha.8): if runner is `go test` OR still 0 TCs, try Go parser.
  // Without `-v` Go only emits `--- FAIL:` lines (passes are silent), so a
  // pass-only run reports nothing detected. Warn when runner-hint matches Go
  // but the `-v` flag is missing — surfaces the gap before verify-complete
  // blocks on 0 passing tests.
  const isGoTest = /\bgo\s+test\b/.test(runnerHint);
  if (isGoTest && !/-v\b/.test(runnerHint)) {
    process.stderr.write(
      `[aitri] Go runner without -v flag: pass markers won't appear in output.\n` +
      `  Update test_runner in 04_BUILD_REPORT.json to "go test ./... -v" so\n` +
      `  --- PASS: lines are emitted and aitri can detect passing TCs.\n`
    );
  }
  if (isGoTest || detected.size === 0) {
    const goDetected = parseGoOutput(output);
    for (const [id, r] of goDetected) {
      if (!detected.has(id)) detected.set(id, r);
    }
    if (goDetected.size > 0)
      process.stderr.write(`[aitri] Go test parser: ${goDetected.size} TC(s) detected\n`);
  }

  // TRX / JUnit-XML structured-result fallback: runners like `dotnet test`, MSTest,
  // NUnit, Maven Surefire / Gradle, jest-junit, or pytest --junitxml write per-test
  // verdicts to a FILE, not parseable stdout — so the stdout parsers above detect
  // nothing and every TC drops to skip (the .NET/Java blocker). Read those files and
  // merge fill-only: the live stdout parsers still win on conflict, and a project
  // whose runner emits no such file is unaffected (additive, stack-agnostic).
  // `--results <file|dir>` is REQUIRED to read a results file — no silent auto-discovery
  // (rc.94, FB-MULTI-0619 #1): hunting the tree could credit a PASS from the wrong file.
  const resultsFlag = flagValue('--results');
  const xmlFiles = resolveResultFiles(dir, resultsFlag, runStartMs);
  if (resultsFlag && xmlFiles.length === 0) {
    process.stderr.write(`[aitri] --results: no fresh TRX/JUnit-XML results found at "${resultsFlag}" (a file present but older than the run start is ignored as stale)\n`);
  }
  if (xmlFiles.length > 0) {
    let xmlCount = 0;
    for (const f of xmlFiles) {
      let xml;
      try { xml = fs.readFileSync(f, 'utf8'); } catch { continue; }
      const parsed = parseXmlResults(xml);
      for (const [id, r] of parsed) {
        if (!detected.has(id)) { detected.set(id, r); xmlCount++; }
      }
    }
    // List the consumed file(s) loudly — the operator must be able to see WHICH file
    // credited the results, so a wrong pointer is caught by eye, not trusted blind.
    if (xmlCount > 0)
      process.stderr.write(`[aitri] TRX/JUnit-XML parser: ${xmlCount} TC(s) detected from ${xmlFiles.join(', ')}\n`);
  }

  // Playwright e2e runner — auto-detected from playwright.config.js/ts presence
  // In feature mode, dir is featureDir; playwright.config.js lives at the project root (featureRoot).
  // --e2e flag kept as no-op for backward compatibility
  let playwrightOutput = '';
  let playwrightExitCode = null;
  const pwRoot = featureRoot || dir;
  const pwConfigJs = path.join(pwRoot, 'playwright.config.js');
  const pwConfigTs = path.join(pwRoot, 'playwright.config.ts');
  const hasPwConfig = fs.existsSync(pwConfigJs) || fs.existsSync(pwConfigTs);
  if (!allManual && hasPwConfig) {
    {
      process.stderr.write(`[aitri] Playwright config detected — running E2E tests automatically...\n`);
      const pwResult = spawnSync(resolveWinBin('npx'), ['playwright', 'test'], {
        cwd: pwRoot,
        encoding: 'utf8',
        timeout: runnerTimeoutMs,
        maxBuffer: RUNNER_MAX_BUFFER,
        shell: false,
      });
      // Same rule as the main runner: a KILL (timeout, buffer overflow, signal) is
      // "did not finish", not failing e2e tests. Refuse rather than merge a partial
      // run — leaving some e2e TCs silently undetected would read as a coverage gap.
      // A normal e2e FAILURE sets neither signal nor error and is handled below.
      if (pwResult.signal || pwResult.error) {
        const timedOut = pwResult.error && pwResult.error.code === 'ETIMEDOUT';
        const reason = timedOut
          ? `exceeded its ${runnerTimeoutMs}ms timeout`
          : `was killed before finishing (${pwResult.error?.code || `signal ${pwResult.signal}`})`;
        err(
          `Playwright E2E run ${reason} and did not finish.\n` +
          `This is a killed run, not failing e2e tests.` +
          (timedOut
            ? ` Raise "test_runner_timeout_ms" (milliseconds) in 04_BUILD_REPORT.json — default is ${RUNNER_TIMEOUT_DEFAULT_MS} (15 min).`
            : ` If it recurs, reduce runner output verbosity or investigate why the process was terminated.`)
        );
      }
      const pwStdout = pwResult.stdout || '';
      const pwStderr = pwResult.stderr || '';
      playwrightOutput = [pwStdout, pwStderr].filter(Boolean).join('\n');
      playwrightExitCode = pwResult.status ?? 1;
      // Use Playwright-specific parser (✓ U+2713, path › TC-XXX format)
      // Main runner wins on conflict
      const pwDetected = parsePlaywrightOutput(playwrightOutput);
      for (const [id, result] of pwDetected) {
        if (!detected.has(id)) detected.set(id, result);
      }
      process.stderr.write(`[aitri] Playwright: ${pwDetected.size} TC(s) detected\n`);
    }
  }

  // SKIP_NOTE wording is conditional on Playwright config presence — only
  // mention "browser environment" when a playwright.config.{js,ts} actually
  // exists. On non-web projects the previous unconditional hint suggested an
  // irrelevant runner. (L2 mensajería, alpha.16.)
  // One universal contract, not a per-stack list: aitri maps a result one of three
  // ways — stdout marker, a JUnit-XML/TRX results file, or recorded evidence. Any
  // runner speaks one of them; aitri does not learn per-stack formats (see ADR-052).
  const SKIP_NOTE = (tc) => {
    const base =
      `Not detected in runner output. Make the result readable one of three ways: ` +
      `(1) name the test after "${tc.id}" so it appears on stdout (e.g. test_${tc.id.replace(/-/g, '_')}_description, # @aitri-tc ${tc.id}); ` +
      `(2) if the runner writes a results FILE, point aitri at it: verify-run --results <file|dir> (JUnit-XML — emitted by most runners — or TRX); ` +
      `(3) record it against evidence: tc verify ${tc.id} --result pass|fail --evidence <path>.`;
    return hasPwConfig
      ? `${base} E2E tests may also require a browser environment.`
      : base;
  };

  // Case-insensitive fallback for a case mismatch between a test function's id
  // and the plan id (test_TC_B1h vs JSON "TC-B1h"). Guard against collisions on
  // BOTH sides: TC-001h and TC-001H are both canonical and differ only by suffix
  // case, so a blind lowercase map would link a plan TC to a *different* TC's
  // result (a false pass). Drop any lowercase key shared by >1 detected id, and
  // (below) refuse the fallback for any lowercase id shared by >1 plan TC.
  const ciDetectedCounts = new Map();
  for (const k of detected.keys()) {
    const lk = k.toLowerCase();
    ciDetectedCounts.set(lk, (ciDetectedCounts.get(lk) || 0) + 1);
  }
  const detectedCI = new Map(
    [...detected]
      .filter(([k]) => ciDetectedCounts.get(k.toLowerCase()) === 1)
      .map(([k, v]) => [k.toLowerCase(), v])
  );
  const planLowerCounts = new Map();
  for (const tc of testCaseList) {
    if (typeof tc.id !== 'string') continue;
    const lk = tc.id.toLowerCase();
    planLowerCounts.set(lk, (planLowerCounts.get(lk) || 0) + 1);
  }

  // Partition manual TCs — automation: 'manual' means a human runs them, not pytest/jest.
  // They should never appear in runner output; marking them 'skip' is incorrect.
  const manualTCIds = new Set(
    testCaseList.filter(tc => tc.automation === 'manual').map(tc => tc.id)
  );

  // VERIFY-TC-VISIBILITY-0706: a runner-output line naming several PLANNED TCs
  // credits only the first — deliberate (one assertion set must not bless N TCs,
  // e.g. a happy-path run crediting a negative TC). The silent drop was the
  // defect: the author learned it only when verify-complete blocked. Warn here —
  // but only for extra ids NOT credited elsewhere in this run (a TC that also
  // has its own test/results entry is fine) and not owed to a manual TC. Honest
  // scope: stdout + e2e output only; a multi-id TRX/JUnit-XML testName still
  // drops its extra ids silently (the Phase 3/4 briefings state the
  // one-id-per-title rule; extend the scan if a real project hits the XML side).
  {
    const planIdSet = new Set(testCaseList.map(tc => tc.id).filter(id => typeof id === 'string'));
    const multiHits = findMultiTCIdLines([output, playwrightOutput].filter(Boolean).join('\n'), planIdSet);
    for (const hit of multiHits) {
      const uncredited = hit.ids.slice(1).filter(id => !detected.has(id) && !manualTCIds.has(id));
      if (uncredited.length === 0) continue;
      process.stderr.write(
        `[aitri] Warning: a runner output line carries ${hit.ids.length} planned TC ids (${hit.ids.join(', ')}) — ` +
        `a single line credits only the first, and ${uncredited.join(', ')} ${uncredited.length === 1 ? 'was' : 'were'} ` +
        `not credited anywhere else in this run. If one test covers several TCs, split it: one test per TC.\n`
      );
    }
  }

  // rc.94 (FB-MULTI-0619 #1): with auto-discovery removed, a file-based runner
  // (dotnet test, Maven, jest-junit, pytest --junitxml) that printed nothing
  // parseable to stdout AND was given no --results yields zero detections — every
  // automated TC would silently drop to skip. Don't leave the operator guessing why:
  // tell them how to point Aitri at the results file (the explicit path is the one
  // that can't credit a PASS from the wrong file). Gated on exitCode === 0 — the
  // runner reported success but we saw nothing, the signature of file-based results.
  // When exit !== 0 the louder "suite did NOT run" warning above already explains it,
  // so this file-runner advice would only mislead a JS build-failure. Suppressed for
  // all-manual projects.
  if (!resultsFlag && exitCode === 0 && detected.size === 0 && (testCaseList.length - manualTCIds.size) > 0) {
    process.stderr.write(
      `\n[aitri] No TC results parsed from runner stdout, and no --results was given.\n` +
      `   If your runner writes results to a FILE (dotnet test --logger trx, Maven Surefire,\n` +
      `   jest-junit, pytest --junitxml), re-run pointing Aitri at it:\n` +
      `     aitri ${sv}verify-run${sa} --results <dir-or-file>   (e.g. --results TestResults/ — dotnet prints "Results File: <path>")\n` +
      `   For a result Aitri still cannot parse, record it against evidence:\n` +
      `     aitri tc verify <TC-ID> --result pass|fail --evidence <path>\n\n`
    );
  }

  const results = testCaseList.map(tc => {
    if (manualTCIds.has(tc.id)) {
      return { tc_id: tc.id, status: 'manual', notes: 'Manual execution required — excluded from automated runner.' };
    }
    const ciOk  = planLowerCounts.get(tc.id.toLowerCase()) === 1; // unambiguous on the plan side
    const entry = detected.get(tc.id) ?? (ciOk ? detectedCI.get(tc.id.toLowerCase()) : undefined);
    return entry
      ? { tc_id: tc.id, status: entry.status, notes: entry.notes }
      : { tc_id: tc.id, status: 'skip', notes: SKIP_NOTE(tc) };
  });

  // Preserve manually-verified TC results from a previous run.
  // aitri tc verify writes verified_manually: true into 04_TEST_RESULTS.json.
  // Without this block, a subsequent verify-run would reset those entries back to 'manual'.
  const prevResultsPath = artifactPath(dir, config, '04_TEST_RESULTS.json');
  if (fs.existsSync(prevResultsPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(prevResultsPath, 'utf8'));
      const prevVerified = new Map(
        (prev.results || [])
          .filter(r => r.verified_manually)
          .map(r => [r.tc_id, r])
      );
      if (prevVerified.size > 0) {
        for (const r of results) {
          const v = prevVerified.get(r.tc_id);
          if (v) {
            r.status            = v.status;
            r.notes             = v.notes;
            r.verified_manually = true;
            r.verified_at       = v.verified_at;
            if (v.evidence) r.evidence = v.evidence;
            // The override's provenance travels WITH the overridden verdict — dropping it
            // here silently defeated the verify-complete override advisory on the ordinary
            // override-then-rerun loop (FB-VERIFY-BLINDSPOTS-0710 adversarial finding).
            if (v.downgraded_from) r.downgraded_from = v.downgraded_from;
          }
        }
        process.stderr.write(`[aitri] Preserved ${prevVerified.size} manually-verified TC(s) from previous run\n`);
      }
    } catch { /* non-fatal — if prev file is corrupt, start fresh */ }
  }

  // Assertion density scan — flag low-confidence TCs before writing results
  const lowConfidence = scanAssertionDensity(manifest.test_files || [], dir);

  // Parse coverage if threshold was requested
  const lineCoverage = coverageThreshold !== null ? parseCoverageOutput(output) : null;
  const coverageFailed = lineCoverage !== null && lineCoverage < coverageThreshold;

  // Build fr_coverage using Phase 3 TC→FR mapping
  const frIds = requirements?.functional_requirements?.map(fr => fr.id)
    || [...new Set(testCaseList.flatMap(tc => Array.isArray(tc.frs) ? tc.frs : [tc.requirement_id]).filter(Boolean))];
  const frCoverage = buildFRCoverage(results, testCaseList, frIds);
  // AC-level coverage (ADR-041 option A) — present only when Phase 1 declares
  // structured acceptance-criterion ids; [] otherwise (additive, no behavior change).
  const acCoverage = buildACCoverage(results, testCaseList, requirements);

  // Classify skipped TCs: e2e type (require browser) vs no marker detected
  const skippedResults = results.filter(r => r.status === 'skip');
  const skippedE2E = skippedResults.filter(r => {
    const tc = testCaseList.find(t => t.id === r.tc_id);
    return tc?.type === 'e2e';
  });
  const skippedNoMarker = skippedResults.filter(r => {
    const tc = testCaseList.find(t => t.id === r.tc_id);
    return tc?.type !== 'e2e';
  });

  const manualVerified = results.filter(r => r.verified_manually === true).length;

  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    skipped: skippedResults.length,
    skipped_e2e: skippedE2E.length,
    skipped_no_marker: skippedNoMarker.length,
    // Count manual by STATUS, like passed/failed/skipped — so the buckets sum to
    // total. A manual TC that was later `tc verify`'d carries status pass/fail
    // (the preservation block above) and is counted there, not double-counted as
    // manual. `manual_verified` separately tracks how many manual TCs were
    // verified. (Was `manualTCIds.size` — declared-manual — which overlapped
    // passed/failed once any manual TC was verified.)
    manual: results.filter(r => r.status === 'manual').length,
    manual_verified: manualVerified,
  };

  // Code-quality gates (ADR-037) — run the project-declared lint/type-check/
  // security/etc. commands and gate on their exit codes. Orchestrated, not
  // bundled (zero-dep). Absent manifest field → no gates → behavior unchanged.
  const qualityGates = runQualityGates(manifest.quality_gates, dir);
  // A declared coverage gate is threshold-based, not command-based (runQualityGates
  // skipped it — no `command`). Judge it here against the measured line coverage:
  // not measurable → error; below threshold → fail; else pass. It then gates like
  // any other quality gate (verifyPassed reset + verify-complete block).
  if (coverageGate) {
    const required = coverageGate.required !== false;
    const name = (typeof coverageGate.name === 'string' && coverageGate.name.trim()) || 'coverage';
    const status = lineCoverage === null ? 'error' : (lineCoverage >= coverageGate.threshold ? 'pass' : 'fail');
    qualityGates.push({
      name, threshold: coverageGate.threshold, measured: lineCoverage, required, status,
      ...(lineCoverage === null ? { output: 'coverage not measured — runner not instrumented or output not parseable' } : {}),
    });
  }
  if (qualityGates.length) {
    process.stderr.write(`[aitri] Code-quality gates:\n`);
    for (const g of qualityGates) {
      const mark = g.status === 'pass' ? '✔' : (g.status === 'error' ? '⚠' : '✖');
      const req  = g.required ? 'required' : 'advisory';
      const detail = g.threshold != null
        ? ` [${g.measured == null ? 'not measured' : `${g.measured}%`} / ${g.threshold}%]`
        : (g.exit_code != null ? ` [exit ${g.exit_code}]` : '');
      process.stderr.write(`  ${mark} ${g.name} (${req}) — ${g.status}${detail}\n`);
    }
  }
  // Fake-pass nudge (A): a mutation gate is the ONLY mechanical signal that catches a
  // test passing green without exercising real code (mock-only / weak asserts — the
  // Ledger seam). It is opt-in and stack-dependent (Stryker/pitest/mutmut/… exist for
  // some stacks, not all), so Aitri never forces it. But when a project HAS automated
  // tests and declares NO mutation gate, surface it once here — visible at verify time,
  // not buried — so turning it on is a conscious choice, never a silent omission.
  if (!allManual && !hasMutationGate(manifest.quality_gates)) {
    process.stderr.write(
      `[aitri] No mutation gate declared. A passing test can still be fake — mocks or weak ` +
      `assertions let code "pass" without exercising real behavior, and that is the one thing ` +
      `Aitri cannot detect from a green run. A mutation gate is the only mechanical check that ` +
      `catches it. If your stack has a tool (Stryker, pitest, mutmut, infection…), declare it in ` +
      `04_BUILD_REPORT.json#quality_gates with a raised "timeout_ms" (mutation is slow). ` +
      `If it does not apply to your stack, ignore this.\n`
    );
  }
  // Double-execution nudge (FB-VERIFY-BLINDSPOTS-0710): a declared Playwright gate PLUS
  // the auto-run means the e2e suite executes twice per verify-run, and the gate's 5-min
  // default timeout (vs the runner's 15) kills a long suite into a misleading `error` red.
  // In a real consumer project that red drove the agent to DELETE the gate. Advisory in the
  // mutation-nudge style; ships coupled with the e2e_exit_code visibility fix so "don't
  // delete the gate" is honest guidance. Never suppress the auto-run — it is the only path
  // that parses/credits e2e TCs (gate output is exit-code-only).
  if (!allManual && hasPwConfig && hasPlaywrightGate(manifest.quality_gates)) {
    process.stderr.write(
      `[aitri] A quality_gate runs Playwright AND Aitri auto-runs it (playwright.config detected) — ` +
      `your e2e suite executes twice per verify-run. Gates also default to a 5-minute timeout (vs the ` +
      `runner's 15), so a long e2e suite dies in the gate as a misleading "error". Fixes: raise ` +
      `"timeout_ms" on that gate, or point it at a scoped/cheaper check. Do NOT just delete the gate: ` +
      `the auto-run only credits TC-id-parsed results and never blocks on an unnamed e2e failure — a ` +
      `required gate blocks on ANY e2e failure and is the stronger guarantee.\n`
    );
  }
  // Smoke-gap nudge (SMOKE-RUN-0625): a UI target whose suite is green can still ship an
  // app that 500s on first boot — the tests never started the running product. Surface it
  // once when the project has UI FRs but no quality_gate that boots/exercises the app.
  // Advisory only (read-only, never blocks); the existence check is a loose heuristic
  // (hasAppExecutingGate) so this can over-fire — phrased as ignorable, like the mutation nudge.
  if (!allManual && hasUISurfaceFRs(requirements) && !hasAppExecutingGate(manifest.quality_gates)) {
    process.stderr.write(
      `[aitri] No app-executing gate declared, but this target has UI requirements. Your tests ` +
      `pass, yet nothing here boots the running app and checks it responds — a build can be green ` +
      `while every route 500s on first boot. If your target serves requests (web app, HTTP API, ` +
      `service), declare a smoke gate in 04_BUILD_REPORT.json#quality_gates that starts the app and ` +
      `asserts its key entry points respond without server errors. If you already have one (or this ` +
      `does not apply), ignore this.\n`
    );
  }
  // Shell-operator trap (SMOKE-GATE-0628): quality_gate commands run WITHOUT a shell (runQualityGates
  // → spawnSync, shell:false), so an inline chain like "npm start && curl ..." passes "&&"/"curl" as
  // literal args and only the first program runs — a smoke/boot-and-probe gate written this way
  // silently mis-runs. Surface it (advisory) so the author moves the steps into a script.
  const chainedGates = gatesWithShellOperators(manifest.quality_gates);
  if (chainedGates.length) {
    process.stderr.write(
      `[aitri] quality_gate(s) ${chainedGates.join(', ')} use a shell operator (&&/||/;/|), but gates ` +
      `run WITHOUT a shell — only the first program runs and the rest is silently skipped. Put multi-step ` +
      `logic (e.g. boot the app, then curl it) in a script file and point the gate's command at it (e.g. ./smoke.sh).\n`
    );
  }
  // Security-gap nudge (SEC-THREADING-0722): the build template declares a security gate
  // EXPECTED when security NFRs exist ("security promises without a mechanical re-check are
  // honor-system only") — but nothing checked it, while UI FRs DID get the smoke-gap nudge
  // above. Fires when active security promises exist (SSoT predicate — explicit exclusions
  // don't count) and neither a security-looking gate nor a recorded technical_debt decision
  // exists. Deliberately NOT guarded by allManual, unlike the mutation/UI nudges: a scanner
  // runs on code and needs no automated test suite — a manual-only project with security
  // NFRs is the weakest posture, exactly the one to nudge. Advisory, phrased ignorable.
  if (requirements && activeSecurityNfrs(requirements).length > 0 &&
      !hasSecurityGate(manifest.quality_gates) && !hasSecurityDebtEntry(manifest.technical_debt)) {
    process.stderr.write(
      `[aitri] This project declares security NFRs, but no quality_gate looks like a security check ` +
      `and no technical_debt entry records why — the declared security promises are re-checked by ` +
      `nothing mechanical. Wire the scanner your stack supports (or a script of exit-code checks) as a ` +
      `quality_gate in 04_BUILD_REPORT.json, or record the deliberate omission in technical_debt ` +
      `(fr_id "SEC-GATE" + the reason, e.g. "covered by CodeQL in CI"). If a declared gate already ` +
      `covers security under another name, ignore this.\n`
    );
  }
  const requiredGateFailed = qualityGates.some(g => g.required && g.status !== 'pass');

  // ADV-0622-36: a `--cmd` flag substitutes the WHOLE runner for this run, so the report's
  // test_runner no longer equals the manifest's declared test_runner. We don't block on the
  // mismatch (--cmd is a legitimate, documented escape hatch — venv pytest, env-specific
  // runners), but we SURFACE it so a reviewer/Hub can see the deploy-gate evidence came from
  // an operator-supplied command, not the committed manifest.
  const cmdOverride      = flagValue('--cmd');
  const runnerOverridden = !allManual && !!cmdOverride && cmdOverride !== manifest.test_runner;
  if (runnerOverridden) {
    process.stderr.write(
      `[aitri] Note: --cmd overrode the manifest test_runner for this run.\n` +
      `  manifest: ${manifest.test_runner || '(none)'}\n  ran:      ${testCmd}\n` +
      `  Recorded as runner_override in 04_TEST_RESULTS.json so the substitution is visible downstream.\n`
    );
  }

  const testResults = {
    executed_at: new Date().toISOString(),
    // All-manual seed: no runner was launched, so recording test_runner:"npm test"
    // (the default) + exit_code:0 would be a fabrication Hub reads as a real run.
    // Record null — honest "no automated runner" (matches the rc.86 manual-mode contract).
    test_runner: allManual ? null : testCmd,
    // Additive (ADV-0622-36): present only when --cmd replaced the manifest test_runner.
    ...(runnerOverridden ? { runner_override: { used: testCmd, manifest_runner: manifest.test_runner || null } } : {}),
    exit_code:   allManual ? null : exitCode,
    // Additive (FB-VERIFY-BLINDSPOTS-0710): the auto-run e2e runner's exit code, stored
    // structurally. It previously lived only in the raw-output markdown, so an e2e test
    // failing OUTSIDE the TC-id naming was invisible to every reader (Hub, verify-complete,
    // the human). Present only when the e2e auto-run fired. Informational, never a gate —
    // the same symmetry as the main runner's exit_code (Aitri keys pass/fail on parsed TCs).
    ...(playwrightExitCode !== null ? { e2e_exit_code: playwrightExitCode, e2e_runner: 'playwright' } : {}),
    results,
    fr_coverage: frCoverage,
    // Additive (ADR-041 option A): per-acceptance-criterion coverage. Present only
    // when Phase 1 declares structured AC ids in user_stories[].acceptance_criteria;
    // absent otherwise so old readers and string-AC projects are unaffected.
    ...(acCoverage.length ? { ac_coverage: acCoverage } : {}),
    summary,
    // Additive (rc.9): measured line coverage when a threshold was requested and a
    // known runner emitted a parseable coverage figure. Absent otherwise.
    ...(lineCoverage !== null ? { line_coverage: lineCoverage } : {}),
    // Additive (rc.9): TCs whose test block has ≤1 assertion — low-confidence tests.
    // Always recorded (possibly empty) so verify-complete can gate on it when the
    // project opts in via config.strictAssertions. See C2.
    low_confidence_tcs: lowConfidence,
    // Additive (ADR-037): per-gate code-quality results. Present only when the
    // manifest declares quality_gates. verify-complete blocks on a required fail.
    ...(qualityGates.length ? { quality_gates: qualityGates } : {}),
  };

  // Surface a runner exit code the parsed TC results don't explain. Aitri keys
  // pass/fail on parsed TCs, so a non-zero exit with zero parsed failures used to be
  // swallowed silently (rc.4 Hub canary: `npm test` exited 1, parsed 27 pass / 0 fail
  // / 5 skip — benign, the skips explained it). Benign OR a real failure the parser
  // missed (a collection/setup error, a crash after the last TC). Either way the
  // divergence deserves a signal — it is informational, not a gate.
  if (exitCode !== 0 && summary.failed === 0) {
    process.stderr.write(
      `[aitri] Note: the test runner exited ${exitCode} (failure) but no failing TCs were parsed ` +
      `(${summary.passed} passed · ${summary.skipped} skipped · ${summary.manual} manual).\n` +
      `  This can be benign (e.g. a runner that exits non-zero when tests are skipped) or a real\n` +
      `  failure outside the parsed TCs (a collection/setup error, or a crash after the last test).\n` +
      `  Review the run output before trusting the result — Aitri keys pass/fail on parsed TCs only.\n`
    );
  }

  // The same divergence signal for the e2e auto-run (FB-VERIFY-BLINDSPOTS-0710): its exit
  // code used to live only in the raw-output markdown, so a Playwright test that fails
  // without a TC id in its title vanished from every decision surface — in a real consumer
  // project that invisibility compounded into deleting the e2e gate. Informational, never
  // a gate — identical symmetry to the main-runner note above.
  if (playwrightExitCode !== null && playwrightExitCode !== 0 && summary.failed === 0) {
    process.stderr.write(
      `[aitri] Note: the Playwright e2e run exited ${playwrightExitCode} (failure) but no failing TCs were parsed.\n` +
      `  An e2e test OUTSIDE the TC-id naming likely failed (or a setup/webServer error occurred).\n` +
      `  Review the "Raw Playwright output" section of the results markdown — Aitri keys pass/fail on parsed TCs only.\n`
    );
  }

  // Warn if all FR coverage is zero but tests passed — signals missing @aitri-tc markers
  const allCoverageZero = frCoverage.every(fr => fr.tests_passing === 0);
  if (allCoverageZero && summary.passed > 0) {
    process.stderr.write(
      `[aitri] Warning: all FR coverage shows 0 passing tests, but ${summary.passed} test(s) passed.\n` +
      `  @aitri-tc markers may be missing from test files.\n` +
      `  Add markers like: // @aitri-tc TC-001  above each test block.\n`
    );
  }

  // Only warn about zero detection if there are automated TCs — all-manual projects legitimately produce no output
  const automatedTCCount = testCaseList.length - manualTCIds.size;
  const zeroTCsDetected = detected.size === 0 && automatedTCCount > 0;

  // Write results automatically — agent does NOT write this file
  const resultsPath = artifactPath(dir, config, '04_TEST_RESULTS.json');
  const resultsJson = JSON.stringify(testResults, null, 2);
  atomicWrite(resultsPath, resultsJson);

  // Run-binding (Finding 1, 2026-06-28): stamp the hash of the file we just wrote so
  // verify-complete can confirm its results came from THIS real execution and were not
  // hand-edited afterward (the "ran verify-run, saw failures, edited to pass" cheat).
  config.verifyResultsHash = hashResultsFile(resultsJson);

  config.verifyRanAt = new Date().toISOString();
  // Persist the last run's counts as a first-class field so the snapshot's no-op
  // loop guard does not depend on the (20-capped) event log — on a busy project
  // the verify-run event can be evicted, which used to silently disable the guard
  // and re-loop recommending verify-run after an all-skip run. Always written.
  config.lastVerifyRun = {
    passed: summary.passed, failed: summary.failed,
    skipped: summary.skipped, manual: summary.manual,
    at: config.verifyRanAt,
  };

  // Z1 (alpha.13) — invalidate stale verifyPassed when this verify-run produced
  // results that would not pass verify-complete. Without this reset, status /
  // resume / validate keep reporting "deployable: ready" based on a previous
  // verify-complete success even after the artifact was rewritten with worse
  // results. Trigger: passed === 0 with skips OR any failures. Healthy results
  // (passed > 0 && failed === 0) leave verifyPassed alone — verify-complete
  // would presumably still pass on the same criteria, no need to force re-run.
  const wouldNotPassComplete =
    (summary.passed === 0 && summary.skipped > 0) || summary.failed > 0 || requiredGateFailed;
  if (wouldNotPassComplete && config.verifyPassed) {
    config.verifyPassed = false;
    delete config.verifySummary;
  }

  appendEvent(config, 'verify-run', 'verify', { passed: summary.passed, failed: summary.failed, skipped: summary.skipped, manual: summary.manual });
  writeLastSession(config, dir, 'verify-run');
  saveConfig(dir, config);

  // Auto-transition fixed → verified for bugs whose linked TC just passed
  autoVerifyBugs(dir, config, results);

  // Prompt to register failing TCs as bugs (TTY only)
  const failedResults = results.filter(r => r.status === 'fail');
  promptAndRegisterBugs(dir, config, failedResults, {
    isPlaywright: hasPwConfig,
    testCaseList,
  });

  process.stderr.write(`[aitri] Auto-detected: ${detected.size} TC(s) total. Written: 04_TEST_RESULTS.json\n`);

  const assertionWarnLines = lowConfidence.length > 0 ? [
    ``,
    `## ⚠ Assertion Density ${config.strictAssertions ? 'BLOCK' : 'Warning'} — ${lowConfidence.length} low-confidence TC(s)`,
    `These TCs have ≤1 assert call in their test block — may not verify real behavior:`,
    ...lowConfidence.map(tc => `  ${tc.tc_id} (${tc.file}) — ${tc.assertCount} assertion(s)`),
    `Review each test: confirm the assertion exercises actual logic, not a constant expression.`,
    config.strictAssertions
      ? `strictAssertions is ON for this project — verify-complete will BLOCK until each TC above has ≥2 real assertions (or the trivial test is fixed).`
      : `This is a warning only. To make it block, set "strictAssertions": true in .aitri (typical on larger projects that want stricter test-quality enforcement).`,
  ] : [];

  const coverageLines = lineCoverage !== null ? [
    ``,
    `## Code Coverage`,
    `  Line coverage: ${lineCoverage.toFixed(2)}%  (threshold: ${coverageThreshold}%)`,
    coverageFailed
      ? `  ⚠ Below threshold — increase test coverage before verify-complete.`
      : `  ✓ Coverage threshold met.`,
  ] : [];

  // Cap raw output to avoid overwhelming the agent briefing
  const OUTPUT_MAX_LINES = 200;
  const outputLines  = (output || '').split('\n');
  const isTruncated  = outputLines.length > OUTPUT_MAX_LINES;
  const displayOutput = isTruncated
    ? outputLines.slice(0, OUTPUT_MAX_LINES).join('\n') +
      `\n... (${outputLines.length - OUTPUT_MAX_LINES} more lines truncated — full output in your terminal)`
    : (output || '(no output)');

  // Suppressed for an all-manual project: it has no test_runner/test_files BY DESIGN
  // (rc.86 waiver), so the "manifest incomplete / fell back to npm test" warning is
  // false there — nothing ran and nothing fell back.
  const manifestWarnLines = (!allManual && (missingTestRunner || missingTestFiles)) ? [
    ``,
    `## ⚠ Manifest Incomplete — Update 04_BUILD_REPORT.json`,
    ...(missingTestRunner ? [
      `  test_runner is missing — aitri verify-run fell back to "npm test".`,
      `  Add the exact command matching your stack to 04_BUILD_REPORT.json:`,
      `    JavaScript: "test_runner": "npm test" | "vitest run --reporter verbose" | "jest --verbose"`,
      `    Python:     "test_runner": "pytest -v"`,
      `    Go:         "test_runner": "go test ./... -v"`,
      `    Rust:       "test_runner": "cargo test -- --nocapture"`,
    ] : []),
    ...(missingTestFiles ? [
      `  test_files is missing or empty — assertion density scan skipped.`,
      `  Add: "test_files": ["<paths to files containing @aitri-tc markers>"]`,
    ] : []),
    `  Fix the manifest so future verify-run runs use the correct command.`,
  ] : [];

  const zeroTCsLines = zeroTCsDetected ? [
    ``,
    `## ⚠ Zero TCs Auto-Detected — All ${testCaseList.length} Test Cases Marked Skip`,
    `aitri verify-run could not match any test output to a TC-XXX id.`,
    `This means tests ran but were not linked to Aitri test cases.`,
    ``,
    `To fix — each test must include TC-XXX in its name and an @aitri-tc marker comment:`,
    ``,
    `  JavaScript (Jest/Mocha/Vitest):`,
    `    it('TC-001: description', () => {`,
    `      // @aitri-tc TC-001`,
    `    });`,
    ``,
    `  Python (pytest):`,
    `    def test_TC_001_description():`,
    `        # @aitri-tc TC-001`,
    ``,
    `  Go:`,
    `    func TestTC001Description(t *testing.T) {`,
    `        // @aitri-tc TC-001`,
    ``,
    `Detection patterns supported:`,
    `  node:test / mocha / TAP:  ✔/✖ TC-XXX in output (test name starts with TC-XXX:)`,
    `  Vitest --reporter verbose: ✓/× TC-XXX in output`,
    `  Jest --verbose:            ✓/✕ TC-XXX in output`,
    `  pytest -v:                 PASSED/FAILED TC-XXX in output`,
    ``,
    `Rename your tests to include the TC id, add the @aitri-tc marker, then re-run verify-run.`,
    `verify-complete will block on 0 passing tests.`,
  ] : [];

  // AC-level coverage surfacing (ADR-041 option A) — only when structured ACs exist.
  // The headline value: a criterion no TC references ('untested') or whose tests do not
  // pass ('uncovered') is named, so "FR-001 covered but AC-001-3 has no test" is visible.
  const untestedAcs = acCoverage.filter(a => a.status === 'untested' || a.status === 'uncovered');
  const acCoverageLines = acCoverage.length
    ? [
        ``,
        `## AC-level coverage (${acCoverage.length} acceptance criteria)`,
        ...(untestedAcs.length
          ? [`  ⚠ ${untestedAcs.length} acceptance criterion(s) without a passing test:`,
             ...untestedAcs.map(a => `    ✖ ${a.ac_id}${a.fr_id ? ` (${a.fr_id})` : ''} — ${a.status}`)]
          : [`  ✔ every acceptance criterion has a passing test`]),
      ]
    : [];

  console.log([
    `# Verify Run — Auto-Parsed Results`,
    ``,
    ...(allManual
      ? [`## Mode: manual — no automated runner (every TC is automation:"manual"); results seeded, not run`, ``]
      : [`## Test command`, `  ${testCmd}`, ``, `## Exit code: ${exitCode} ${exitCode === 0 ? '(success)' : '(failure)'}`, ``]),
    `## Results (auto-detected from runner output)`,
    `  Passed:  ${summary.passed}`,
    `  Failed:  ${summary.failed}`,
    `  Skipped: ${summary.skipped}${summary.skipped > 0 ? ` (${summary.skipped_e2e} ${hasPwConfig ? 'e2e/browser' : 'e2e'}, ${summary.skipped_no_marker} no marker detected)` : ''}`,
    // `manual` counts still-PENDING manual TCs (status:"manual"); `manual_verified`
    // counts already-verified ones (now status pass/fail). They are disjoint, so the
    // verified fraction is manual_verified / (manual + manual_verified) — NOT
    // manual_verified/manual (the two had different denominators, printing nonsense
    // like "2/1 verified" across the lifecycle).
    `  Manual:  ${(summary.manual + (summary.manual_verified || 0)) === 0 ? '0' : `${summary.manual_verified || 0}/${summary.manual + (summary.manual_verified || 0)} verified${summary.manual > 0 ? ` (${summary.manual} pending — run: ${tcVerifyCmd} <TC-ID> --result pass|fail --notes "...")` : ''}`}`,
    ...coverageLines,
    ...zeroTCsLines,
    ...manifestWarnLines,
    ...assertionWarnLines,
    ...acCoverageLines,
    ``,
    `## Raw test output${isTruncated ? ` (first ${OUTPUT_MAX_LINES} of ${outputLines.length} lines)` : ''}`,
    `\`\`\``,
    displayOutput,
    `\`\`\``,
    ...(playwrightOutput ? [
      ``,
      `## Raw Playwright output (exit code: ${playwrightExitCode})`,
      `\`\`\``,
      playwrightOutput,
      `\`\`\``,
    ] : []),
    ``,
    `## 04_TEST_RESULTS.json written automatically`,
    `Results parsed from real runner output — self-reported JSON is not accepted; stdout markers remain the trust floor.`,
    `Detection pattern: ✔/✖ TC-XXX (node:test) and ✓/×/✕ TC-XXX (Vitest/Jest verbose). Auto-detected from runner.`,
    summary.failed > 0
      ? `\n⚠ ${summary.failed} failing test(s) detected. Fix failures before verify-complete.`
      : ``,
    coverageFailed
      ? `⚠ Coverage ${lineCoverage.toFixed(2)}% below threshold ${coverageThreshold}% — fix before verify-complete.`
      : ``,
    ``,
    `## Next step`,
    ...(allManual
      ? [`Verify each manual TC by hand, then gate:`,
         `  ${tcVerifyCmd}                                   (guided checklist, at a terminal)`,
         `  ${tcVerifyCmd} <TC-ID> --result pass|fail --notes "..."   (one at a time / scripted)`,
         `Once verified: aitri ${sv}verify-complete${sa}  (it will not pass until at least the seeded TCs are verified)`]
      : [`Run: aitri ${sv}verify-complete${sa}`]),
  ].join('\n'));
}

export function cmdVerify({ err }) {
  err(
    `aitri verify is disabled — use aitri verify-run instead.\n\n` +
    `aitri verify allowed agents to self-report test results without real execution (honor system).\n` +
    `aitri verify-run executes the actual test suite and maps results from real runner output.\n\n` +
    `Run: aitri verify-run`
  );
}

export function cmdVerifyComplete({ dir, err, featureRoot, scopeName, VERSION }) {
  const { verb: sv, arg: sa } = scopeTokens(featureRoot, scopeName);
  const config = loadConfig(dir);
  const artifactsDir = config.artifactsDir || '';
  const resultsPath = artifactPath(dir, config, '04_TEST_RESULTS.json');
  if (!fs.existsSync(resultsPath)) {
    // 2.3 (UX-PRO-0707 follow-up): "Run: verify-run" is a dead end when the pipeline is
    // earlier than Phase 4 (verify-run itself refuses) — point at the snapshot's real step.
    const next = featureRoot ? null : topNextAction(dir);
    const hint = next
      ? `\nNext: ${next.command}${next.reason ? `  (${next.reason})` : ''}`
      : `\nRun: aitri ${sv}verify-run${sa}  then save the results file.`;
    err(`04_TEST_RESULTS.json not found.${hint}`);
  }

  let d, resultsContent;
  try { resultsContent = readArtifactFile(resultsPath); d = JSON.parse(resultsContent); }
  catch { err('04_TEST_RESULTS.json is malformed JSON — fix and retry.'); }

  // Run-binding (Finding 1 → UPLAN-0703 B1): the results file must be the one an
  // authorized run produced. verify-run / tc verify stamp `config.verifyResultsHash`
  // with the hash of the file they write. The deploy gate now requires that stamp AND
  // requires the current file to match it:
  //   - absent stamp  → no sanctioned run ever produced this file (the cheapest bypass in
  //     the audit was a hand-written, internally-consistent green results file that no test
  //     ever generated). Previously allowed for backward-compatibility with pre-rc.129
  //     stamp-less projects; that window is closed in the rc channel — such a project runs
  //     verify-run once (or `verify-run --results <file>` over its existing file) and is stamped.
  //   - stamp present but file no longer matches → the file was edited or replaced after the run.
  // Honest ceiling (NOT a claim of unforgeability): a fully-adversarial agent that also
  // rewrites `verifyResultsHash` in `.aitri` to match its fabricated file is not stopped —
  // `.aitri` is writable. This raises the bar from a trivial/accidental pass to a deliberate
  // forgery of a state field the agent is never instructed to touch; it does not make the
  // gate unbypassable.
  if (!config.verifyResultsHash)
    err(
      `No verify-run is recorded for this project — the deploy gate cannot trust an unbound\n` +
      `  04_TEST_RESULTS.json. Run: aitri ${sv}verify-run${sa} (or aitri ${sv}verify-run${sa} --results <file|dir>\n` +
      `  to bind an existing structured runner-output file). A results file produced without a run\n` +
      `  cannot gate deployment.`
    );
  if (hashResultsFile(resultsContent) !== config.verifyResultsHash)
    err(
      `04_TEST_RESULTS.json does not match the last verify-run (results-hash mismatch).\n` +
      `  It was edited or replaced after the tests ran — Aitri will not trust a hand-edited results\n` +
      `  file at the deploy gate. Re-run: aitri ${sv}verify-run${sa} to regenerate it from a real execution.`
    );

  const missing = ['executed_at', 'results', 'fr_coverage', 'summary'].filter(k => !d[k]);
  if (missing.length) err(`04_TEST_RESULTS.json missing fields: ${missing.join(', ')}`);
  if (!Array.isArray(d.results) || d.results.length === 0)
    err('results array is empty — at least one TC must be reported');
  if (!Array.isArray(d.fr_coverage) || d.fr_coverage.length === 0)
    err('fr_coverage array is empty — every FR must have a coverage entry');
  if (typeof d.summary !== 'object' || d.summary === null || Array.isArray(d.summary))
    err('summary must be an object with total/passed/failed/skipped counts — got a non-object value');

  // C2 (rc.9): opt-in assertion-density gate. Default behavior is unchanged (warning
  // only). Projects that set "strictAssertions": true in .aitri block here when any TC
  // has ≤1 assertion in its test block — a low-confidence test that may pass without
  // verifying real behavior. The list is recorded by verify-run in low_confidence_tcs.
  const lowConfTCs = Array.isArray(d.low_confidence_tcs) ? d.low_confidence_tcs : [];
  if (config.strictAssertions && lowConfTCs.length > 0) {
    const list = lowConfTCs
      .map(tc => `  ${tc.tc_id} (${tc.file}) — ${tc.assertCount} assertion(s)`)
      .join('\n');
    err(
      `strictAssertions is ON — ${lowConfTCs.length} low-confidence test case(s) block verify-complete:\n${list}\n\n` +
      `Each TC above has ≤1 assertion in its test block. Add assertions that exercise the real\n` +
      `behavior from the TC's expected_result (not constants or assert.ok(true)), then re-run\n` +
      `aitri ${sv}verify-run${sa}. To disable this gate, remove "strictAssertions" from .aitri.`
    );
  } else if (lowConfTCs.length > 0) {
    // Default (strictAssertions off): SURFACE low-confidence tests at the deploy gate — not
    // only at verify-run — mirroring the MUST-NFR-skip advisory below. A green test with ≤1
    // assertion credits its FR; "green ≠ exercised" deserves a reminder at the moment of
    // deciding to ship, not just when the suite ran. Advisory, never a block (a hard default
    // gate would false-fire on legitimately-terse tests — strictAssertions is the opt-in).
    const list = lowConfTCs.map(tc => `  ${tc.tc_id} (${tc.file}) — ${tc.assertCount} assertion(s)`).join('\n');
    process.stderr.write(
      `[aitri] ⚠ ${lowConfTCs.length} low-confidence test case(s) reached the deploy gate (≤1 assertion — may pass without exercising real behavior):\n${list}\n` +
      `  Not blocking. Confirm each genuinely verifies its expected_result (not constants / assert.ok(true)); ` +
      `set "strictAssertions": true in .aitri to make it a hard gate.\n`
    );
  }

  // Override advisory (FB-VERIFY-BLINDSPOTS-0710): overrides of a prior runner verdict are
  // stamped as `downgraded_from` — by `tc verify` on the RESULTS entry, and by
  // `tc mark-manual` on the TC in 03_TEST_CASES.json (the next verify-run seeds that TC as
  // plain "manual", so a results-only read would miss the equally cheap laundering route:
  // runner fail → mark-manual → hand-verified pass). No decision surface ever read either
  // stamp — in a real consumer project three overrides (with circular evidence) reached
  // deploy unseen. Print-only, mirroring the low-confidence advisory above: Aitri cannot
  // judge evidence quality (an evidence-path guard would be theater — the agent just points
  // elsewhere), but it CAN make the override impossible to miss at the moment of deciding
  // to ship. The human judges; never a block.
  const overriddenResults = (Array.isArray(d.results) ? d.results : []).filter(r => r && r.downgraded_from);
  let manualConversions = [];
  try {
    const tcsForOverrides = JSON.parse(readArtifact(dir, '03_TEST_CASES.json', artifactsDir) || '{}');
    manualConversions = (tcsForOverrides.test_cases || []).filter(tc => tc && tc.downgraded_from);
  } catch { /* non-fatal — advisory only */ }
  if (overriddenResults.length || manualConversions.length) {
    const list = [
      ...overriddenResults.map(r => `  ${r.tc_id} — now "${r.status}", overrode a prior "${r.downgraded_from}" result`),
      ...manualConversions.map(tc => `  ${tc.id} — converted to manual after a prior "${tc.downgraded_from}" result`),
    ].join('\n');
    const n = overriddenResults.length + manualConversions.length;
    process.stderr.write(
      `[aitri] ⚠ ${n} result(s) reached the deploy gate carrying a manual override of a prior runner verdict (downgraded_from on the record):\n${list}\n` +
      `  Not blocking. Review each override's evidence before approving — an override backed by weak or ` +
      `circular evidence ships an unexercised or failing TC as a pass.\n`
    );
  }

  // Code-quality gate (ADR-037): a declared `required` gate that did not pass
  // blocks the pipeline, exactly like a failing test. `advisory` gates
  // (required: false) are surfaced by verify-run but never block here.
  if (Array.isArray(d.quality_gates)) {
    const failedGates = d.quality_gates.filter(g => g && g.required && g.status !== 'pass');
    if (failedGates.length) {
      // Each errored gate carries its own cause (coverage not measurable, timeout kill,
      // missing binary) — surface it per gate. A single hard-coded "tool was not found"
      // sentence misdiagnosed a threshold coverage gate whose runner simply could not be
      // instrumented (FB-COVERAGE-GATE-0715, field report: tool WAS installed).
      const reasonFor = (g) => {
        if (g.status !== 'error') return '';
        const outStr = typeof g.output === 'string' ? g.output : '';
        if (g.threshold != null) {
          return (outStr || 'coverage not measured — runner not instrumented or output not parseable') +
            `\n      Aitri cannot instrument a test_runner that is an npm-script wrapper or chains` +
            `\n      runners (&&). Declare the coverage gate in command mode instead —` +
            `\n      { "name": "coverage", "command": "<your coverage command>", "required": true }` +
            `\n      — the command enforces its own threshold and Aitri gates on its exit code.`;
        }
        const gateNote = outStr.split('\n').find(l => l.includes('gate did not finish within') || l.includes('gate could not start') || l.includes('overflowed the capture buffer'));
        if (gateNote) return gateNote.replace(/^\[aitri\]\s*/, '');
        return `the gate's tool was not found (declared but not installed)`;
      };
      const list = failedGates.map(g => {
        // A threshold coverage gate has no command — label it by its threshold instead
        // of printing "(undefined)" (the exact string the field report quoted).
        const label = g.command ? `(${g.command})` : (g.threshold != null ? `(threshold ${g.threshold}%)` : '');
        const detail = g.threshold != null
          ? ` [${g.measured == null ? 'not measured' : `${g.measured}%`} / ${g.threshold}%]`
          : (g.exit_code != null ? ` [exit ${g.exit_code}]` : '');
        const reason = reasonFor(g);
        return `  ✗ ${g.name} ${label} — ${g.status}${detail}` +
          (reason ? `\n      ↳ ${reason}` : '');
      }).join('\n');
      err(
        `${failedGates.length} required code-quality gate(s) did not pass — fix before Phase 5:\n${list}\n\n` +
        `Fix the code or the toolchain, then re-run aitri ${sv}verify-run${sa}. To make a gate\n` +
        `non-blocking, set "required": false on it in 04_BUILD_REPORT.json#quality_gates.`
      );
    }
  }

  // Opt-in review gate (ADR-034 addendum, ADR-037 follow-up). Default keeps the
  // code-review verdict ADVISORY (per ADR-034 P1). When `.aitri#reviewGate` is
  // true and an 04_CODE_REVIEW.md exists with verdict FAIL, Phase 5 is blocked —
  // a FAIL can no longer be silently ignored. Honor-system: the verdict is
  // agent-written, so this makes a written FAIL binding; it does not judge review
  // quality. Review stays optional — absent review never blocks.
  if (config.reviewGate) {
    const review = readArtifact(dir, '04_CODE_REVIEW.md', artifactsDir);
    if (review) {
      const verdict = extractReviewVerdict(review);
      if (verdict === 'FAIL')
        err(
          `reviewGate is ON — 04_CODE_REVIEW.md verdict is FAIL. Resolve the review's blocking ` +
          `issues and re-run the Code Review phase (or lower the verdict honestly once fixed) ` +
          `before Phase 5. To disable this gate, remove "reviewGate" from .aitri.`
        );
    }
  }

  const testCases = readArtifact(dir, '03_TEST_CASES.json', artifactsDir);
  if (testCases) {
    try {
      const tcs = JSON.parse(testCases);
      const expectedIds = new Set(tcs.test_cases?.map(tc => tc.id) || []);
      const reportedIds = new Set(d.results.map(r => r.tc_id));
      const unreported  = [...expectedIds].filter(id => !reportedIds.has(id));
      if (unreported.length)
        err(`Missing results for: ${unreported.join(', ')}\nEvery TC from Phase 3 must have a result.`);
    } catch { /* parse error already caught above */ }
  }

  // Identify stub TCs (from adopt verify-spec) — they get known-gap prompt instead of hard block
  const stubIds = new Set();
  if (testCases) {
    try {
      const tcsObj = JSON.parse(testCases);
      for (const tc of (tcsObj.test_cases || [])) {
        if (tc.stub === true) stubIds.add(tc.id);
      }
    } catch { /* non-fatal */ }
  }

  const failed      = d.results.filter(r => r.status === 'fail');
  const skippedTCs  = d.results.filter(r => r.status === 'skip');
  const passedTCs   = d.results.filter(r => r.status === 'pass');
  const manualTCs   = d.results.filter(r => r.status === 'manual');

  const failedStubs = failed.filter(r => stubIds.has(r.tc_id));
  const failedReal  = failed.filter(r => !stubIds.has(r.tc_id));

  const failedNoNotes  = failedReal.filter(r => !r.notes?.trim());
  const skippedNoNotes = skippedTCs.filter(r => !r.notes?.trim());
  if (failedNoNotes.length)
    err(`${failedNoNotes.length} failing test(s) have empty notes:\n  ${failedNoNotes.map(r => r.tc_id).join(', ')}`);
  if (skippedNoNotes.length)
    err(`${skippedNoNotes.length} skipped test(s) have empty notes:\n  ${skippedNoNotes.map(r => r.tc_id).join(', ')}`);

  if (skippedTCs.length > 0 && failed.length === 0 && passedTCs.length === 0)
    err(`All ${skippedTCs.length} test(s) are skipped and none passed — at least 1 test must actually run and pass.`);

  // Zero-verification guard (FB-MULTI-0619 #2): a status:"manual" TC is PENDING — a
  // human has not run it yet (verify-run seeds them for an all-manual project). Letting
  // verify-complete pass with only pending manual TCs and ZERO actual pass/fail would
  // green-light deploy with nothing verified — the fake-pass this batch exists to
  // prevent. Require at least one real pass or verification first. (Same principle as
  // the all-skip guard above; narrow — it does not change how a VERIFIED manual TC, or
  // a mix that includes ≥1 pass, is counted.) `tc verify` flips a verified manual TC to
  // status pass, so this clears once the human verifies. Applies to root AND feature
  // scope (FEAT-PARITY-0620): `aitri feature tc <name> verify` now exists to clear it.
  if (manualTCs.length > 0 && failed.length === 0 && passedTCs.length === 0) {
    const tcVerifyCmd = featureRoot ? `aitri feature tc ${scopeName} verify` : `aitri tc verify`;
    err(
      `${manualTCs.length} manual test(s) are seeded but not yet verified, and no test has passed — ` +
      `verify-complete cannot pass with zero verification.\n` +
      `  Verify each by hand:  ${tcVerifyCmd}   (guided checklist, at a terminal)\n` +
      `  or one at a time:      ${tcVerifyCmd} <TC-ID> --result pass|fail --notes "..."`
    );
  }

  if (failedReal.length) {
    const list = failedReal.map(r => `  ✗ ${r.tc_id}${r.notes ? `: ${r.notes}` : ''}`).join('\n');
    err(`${failedReal.length} test(s) failing — fix before proceeding to Phase 5:\n${list}`);
  }

  // Stub TC known-gap handling — prompt human instead of hard block
  if (failedStubs.length) {
    const list = failedStubs.map(r => `  ✗ ${r.tc_id}${r.notes ? ` — ${r.notes.slice(0, 120)}` : ''}`).join('\n');
    process.stdout.write(`\n⚠ ${failedStubs.length} stub TC(s) did not pass (from adopt verify-spec):\n${list}\n`);
    process.stdout.write(`  These represent spec gaps — code may not satisfy these ACs yet.\n`);

    if (!process.stdin.isTTY) {
      err(`Stub TC(s) failing — acknowledge in terminal first.\nRun aitri verify-complete manually to review each gap.`);
    }

    process.stdout.write(`\nMark as known gaps to continue? (y/N): `);
    const answer = readStdinSync(10).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
      process.stderr.write(`\n❌ Verify-complete cancelled — fix the failing stubs or re-run to acknowledge.\n`);
      process.exit(1);
    }

    // Mark known_gap in 04_TEST_RESULTS.json for audit trail
    for (const result of d.results) {
      if (stubIds.has(result.tc_id) && result.status === 'fail') {
        result.known_gap = true;
      }
    }
    const updatedResults = JSON.stringify(d, null, 2);
    atomicWrite(resultsPath, updatedResults);
    // Re-stamp the run-binding hash (Finding 1): this is an authorized edit of the results
    // file by verify-complete itself, so a later verify-complete must not false-block on it.
    // PERSIST the stamp NOW, not at the end of the function (UPLAN-0703 B fix): every err()
    // between here and the final saveConfig exits the process — the disk file would be
    // rewritten while the persisted stamp still matched the pre-rewrite content, leaving the
    // project falsely 'mismatch' ("tampered") on every read surface, locked out of tc verify,
    // and blocked from re-running this very command. The final saveConfig stays (it persists
    // verifyPassed etc.); saveConfig is idempotent on unchanged fields.
    config.verifyResultsHash = hashResultsFile(updatedResults);
    saveConfig(dir, config);
    process.stderr.write(`[aitri] ${failedStubs.length} known gap(s) recorded in 04_TEST_RESULTS.json\n`);
  }

  const uncovered = d.fr_coverage.filter(fr => fr.status === 'uncovered');
  if (uncovered.length) {
    err(`Uncovered FRs — all requirements must have passing tests:\n  ${uncovered.map(f => f.fr_id).join(', ')}`);
  }

  // AC-level coverage gate (ADR-041 option A, rc.49). The finer-grained companion to
  // the uncovered-FR gate above. Declaring structured acceptance criteria in
  // 01_REQUIREMENTS.json (user_stories[].acceptance_criteria with ids) IS the opt-in
  // for AC-level rigor: every declared criterion must have a passing test to reach
  // Phase 5. 'untested' = no test case traces to it via ac_id; 'uncovered' = its
  // test(s) did not pass. No structured ACs → verify-run wrote no ac_coverage → no-op,
  // so string-AC and legacy projects are unaffected. Mechanical enforcement of the
  // criterion-level traceability ac_id was always meant to provide (principle 8).
  if (Array.isArray(d.ac_coverage) && d.ac_coverage.length > 0) {
    const acGaps = d.ac_coverage.filter(a => a.status === 'untested' || a.status === 'uncovered');
    if (acGaps.length) {
      const list = acGaps.map(a => `  ✗ ${a.ac_id}${a.fr_id ? ` (${a.fr_id})` : ''} — ${a.status}`).join('\n');
      err(
        `${acGaps.length} acceptance criterion(s) without a passing test — every declared acceptance ` +
        `criterion must be covered before Phase 5:\n${list}\n\n` +
        `  'untested' = no test case traces to it via ac_id; 'uncovered' = its test(s) did not pass.\n` +
        `  Add or fix a test for each and set its ac_id, then re-run aitri ${sv}verify-run${sa}.\n` +
        `  This gate is active because 01_REQUIREMENTS.json declares structured acceptance criteria.`
      );
    }
  }

  // E2E gate: if Phase 3 has TCs with type "e2e", at least one must be covered —
  // either passed by an e2e runner OR marked automation: "manual" (status: "manual").
  // Manual is the documented escape hatch for projects without an e2e runner;
  // see docs/integrations/ARTIFACTS.md. The advice text branches on whether a
  // Playwright config is present, so the recommendation matches the actual gap.
  if (testCases) {
    try {
      const tcs = JSON.parse(testCases);
      const e2eTCs = (tcs.test_cases || []).filter(tc => tc.type === 'e2e');
      if (e2eTCs.length > 0) {
        const e2eIds = new Set(e2eTCs.map(tc => tc.id));
        const e2eCovered = (d.results || []).filter(r =>
          e2eIds.has(r.tc_id) && r.status === 'pass'
        );
        if (e2eCovered.length === 0) {
          const uncoveredIds = (d.results || [])
            .filter(r => e2eIds.has(r.tc_id) && r.status !== 'pass')
            .map(r => r.tc_id);
          const pwRoot = featureRoot || dir;
          const hasPwConfig = fs.existsSync(path.join(pwRoot, 'playwright.config.js')) ||
                              fs.existsSync(path.join(pwRoot, 'playwright.config.ts'));
          const advice = hasPwConfig
            ? `Playwright config detected but no e2e TC passed:\n` +
              `  - Check browser installation: npx playwright install\n` +
              `  - Verify the test files include TC ids (e.g. test('TC-XXX: ...'))\n` +
              `  - Mark TCs that cannot run here automation: "manual" in 03_TEST_CASES.json, then verify each with 'aitri tc verify' (a pending manual TC does not count)`
            : `No e2e runner detected (no playwright.config.{js,ts} at project root). Choose one:\n` +
              `  - Install Playwright: add playwright.config.{js,ts} and write the e2e tests, OR\n` +
              `  - Mark these TCs automation: "manual" in 03_TEST_CASES.json AND verify each with 'aitri tc verify' — only a verified manual TC counts as covered (a pending one does not), OR\n` +
              `  - Remove the TCs from 03_TEST_CASES.json if they are not real requirements.\n` +
              `Do NOT change the TC type to bypass this gate — the type field describes intent, not runner availability.`;
          err(
            `E2E tests required but none covered — ${e2eTCs.length} E2E TC(s) defined in Phase 3:\n` +
            `  ${uncoveredIds.slice(0, 10).join(', ')}${uncoveredIds.length > 10 ? ` (+${uncoveredIds.length - 10} more)` : ''}\n\n` +
            advice
          );
        }
      }
    } catch { /* parse error already caught above */ }
  }

  // Traceability cross-check: every FR from Phase 1 must be in fr_coverage with ≥1 passing test.
  // The try/catch guards ONLY the JSON.parse — the gate's own err() calls must propagate (they
  // exit the process in production); wrapping them would silently swallow a real coverage failure.
  const requirements = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir);
  if (requirements) {
    let reqs = null;
    try { reqs = JSON.parse(requirements); } catch { /* malformed 01_REQUIREMENTS.json — skip cross-check */ }
    if (reqs) {
      const allFRs = reqs.functional_requirements || [];
      const phase1FRIds = new Set(allFRs.map(fr => fr.id));
      // MUST FRs are the constitutional hard-block set (CLAUDE.md principle 8:
      // "every MUST FR traced to a passing test"). SHOULD/NICE FRs are surfaced as
      // a warning instead — mirroring Phase 3 / `complete 3`, which never hard-block
      // a non-MUST FR for lacking a test. Before this split, verify-complete gated
      // EVERY FR, so a legal SHOULD/NICE FR (waved through Phase 3) dead-ended the
      // deploy gate with no lightweight escape for an agent (finance-dashboard canary
      // 2026-06-05). Convention matches phase3.js (`priority === 'MUST'`).
      const mustFRIds = new Set(allFRs.filter(fr => fr.priority === 'MUST').map(fr => fr.id));
      const reportedFRIds = new Set((d.fr_coverage || []).map(fr => fr.fr_id));

      // Structural completeness: every FR (any priority) must APPEAR in fr_coverage —
      // buildFRCoverage emits one entry per FR, so a gap means a stale/hand-edited
      // 04_TEST_RESULTS.json. This is presence, not a pass gate; unchanged behavior.
      const missingFromCoverage = [...phase1FRIds].filter(id => !reportedFRIds.has(id));
      if (missingFromCoverage.length)
        err(`FR coverage gap — these Phase 1 requirements are missing from fr_coverage:\n  ${missingFromCoverage.join(', ')}\n  Add an entry for every FR in 04_TEST_RESULTS.json fr_coverage.`);

      const isUncovered = (id) => {
        const entry = (d.fr_coverage || []).find(fr => fr.fr_id === id);
        // A MUST FR needs >=1 PASSING test. A *verified* manual TC is recorded status:"pass"
        // (tc verify), so it counts as passing here; a *pending* status:"manual" result (seeded
        // by verify-run, never verified by a human) is NOT covered — exempting it shipped a MUST
        // FR unverified the moment any other test passed (ADV-0622-01 spine false-pass).
        return !entry || entry.tests_passing === 0;
      };

      const uncoveredMust = [...mustFRIds].filter(isUncovered);
      if (uncoveredMust.length)
        err(`Requirement coverage failure — these MUST FRs have zero passing tests:\n  ${uncoveredMust.join(', ')}\n  Every MUST requirement from Phase 1 must have ≥1 passing test before Phase 5.`);

      const uncoveredOptional = [...phase1FRIds].filter(id => !mustFRIds.has(id) && isUncovered(id));
      if (uncoveredOptional.length)
        process.stderr.write(
          `[aitri] ⚠ ${uncoveredOptional.length} SHOULD/NICE FR(s) have no passing test (not blocking): ${uncoveredOptional.join(', ')}\n` +
          `  Phase 3 does not require tests for non-MUST FRs. Add tests if these matter for this release.\n`
        );

      // MUST-NFR visibility (NFR-regression, rc.73) — ADVISORY, never a gate.
      // `complete 3` requires every MUST NFR to have a TC, and a FAILING test hard-blocks
      // above (line ~1264), so a MUST NFR reaches here "without a passing test" only when
      // its test(s) SKIPPED (never ran) — fr_coverage is FR-only, so that is invisible at
      // the deploy gate. Surface it, never block: Aitri cannot tell a forgotten test.skip
      // from an NFR genuinely tested in a separate suite (perf/security), so a hard gate
      // would false-alarm. Print-only — nothing is persisted, so no schema/contract change.
      const mustNFRs = (reqs.non_functional_requirements || []).filter(isMustRequirement);
      if (mustNFRs.length) {
        let nfrTCs = [];
        try { nfrTCs = JSON.parse(testCases || '{}').test_cases || []; } catch { /* non-fatal */ }
        const verified = new Set((d.results || [])
          .filter(r => r.status === 'pass').map(r => r.tc_id));   // pending "manual" is NOT verified (ADV-0622-01)
        const coversNFR = (tc, id) => tc.requirement_id === id || (Array.isArray(tc.frs) && tc.frs.includes(id));
        const unverifiedNFRs = mustNFRs.filter(n => {
          const tcs = nfrTCs.filter(tc => coversNFR(tc, n.id));
          return tcs.length > 0 && !tcs.some(tc => verified.has(tc.id));
        });
        if (unverifiedNFRs.length)
          process.stderr.write(
            `[aitri] ⚠ ${unverifiedNFRs.length} MUST NFR(s) reached the deploy gate without a passing test ` +
            `(their test(s) did not pass — skipped, or a pending manual TC not yet verified): ${unverifiedNFRs.map(n => n.id).join(', ')}\n` +
            `  Not blocking — a skip may mean "tested in a separate suite" OR a forgotten test.skip; Aitri cannot tell.\n` +
            `  Confirm each is genuinely verified before deploy, or un-skip its test.\n`
          );
      }
    }
  }

  // Block on open/in_progress bugs of critical or high severity (getBlockingBugs filters
  // by status + severity — NOT by FR linkage; the bug's `fr` is shown when present but is
  // not what makes it blocking). B8: an unreadable BUGS.json refuses — a parse failure
  // would make every blocking bug vanish from this gate (false green).
  assertBugsReadable(dir, config, err);
  const blockingBugs = getBlockingBugs(dir, config);
  if (blockingBugs.length) {
    const list = blockingBugs.map(b => `  ✗ ${b.id} [${b.severity}]: ${b.title}${b.fr ? ` (${b.fr})` : ''}`).join('\n');
    err(`Open critical/high bug(s) must be resolved before Phase 5:\n${list}\n\nRun: aitri bug fix <id> [--tc TC-NNN]  then  aitri bug verify <id>`);
  }

  config.verifyPassed  = true;
  config.verifySummary = d.summary;
  appendEvent(config, 'verify-complete', 'verify', { passed: d.summary?.passed, failed: d.summary?.failed });
  writeLastSession(config, dir, 'verify-complete');
  saveConfig(dir, config);

  const { total, passed, skipped } = d.summary;
  let tcTypeMap = {};
  try { const tcs = JSON.parse(readArtifact(dir, '03_TEST_CASES.json', artifactsDir) || '{}'); (tcs.test_cases || []).forEach(t => { tcTypeMap[t.id] = t.type; }); } catch { /* non-fatal */ }
  const e2eCount = (d.results || []).filter(r => r.status === 'pass' && tcTypeMap[r.tc_id] === 'e2e').length;
  const e2eNote  = e2eCount > 0 ? ` (${passed - e2eCount} unit + ${e2eCount} e2e)` : '';
  const bar = '─'.repeat(60);
  console.log(`✅ Verify passed — ${passed}/${total} tests passing${e2eNote}${skipped ? `, ${skipped} skipped` : ''}${manualTCs.length > 0 ? `, ${manualTCs.length} manual` : ''}`);
  console.log(`\n${bar}`);

  // Z3 (alpha.13) → alpha.19: next-action emission consumes the snapshot
  // priority ladder so `verify-complete`, `status`, `resume` and `validate`
  // agree on the same `Next:` line. The previous if/else hardcoded
  // "run-phase 5" / "validate" and contradicted `status` whenever the
  // snapshot put a higher-priority action ahead of phase 5 work — the
  // canonical case is reconcile pending after a clean verify-run, where
  // status routes to `aitri reconcile` (priority 4) while verify-complete
  // still pointed at run-phase 5. Surfaced 2026-05-02 PM audit.
  //
  // Feature scope keeps its dedicated branch: feature pipelines don't deploy
  // independently and the alpha.7 scope-token splicing for command emission
  // (`aitri feature <verb> <name> <phase>`) is enforced via cmdStatus on
  // featureCtx, which we delegate to indirectly through the snapshot of the
  // feature root.
  const phase5Approved = (config.approvedPhases || []).map(String).includes('5');
  const isFeatureScope = !!scopeName;
  if (isFeatureScope) {
    // Feature scope: preserve alpha.7 scope-token splicing — the snapshot
    // rooted at featureDir treats the feature as scopeType='root' and would
    // emit unprefixed commands, breaking literal copy-paste. Hardcoded shape
    // matches the alpha.13 behavior the existing canaries already validated.
    if (!phase5Approved) {
      console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);
      console.log(`  aitri ${sv}run-phase${sa} 5\n`);
      console.log(`Do NOT write deployment code, skip Phase 5, or modify any files yet.`);
      console.log(`Phase 5 (Deployment — DevOps Engineer) must run next.`);
      console.log(`The pipeline decides the route. You execute it.`);
    } else {
      console.log(`Verify passed. Run aitri feature status ${scopeName} to see current state.`);
    }
  } else {
    // Root scope: snapshot is the SSoT. Aligns verify-complete with status /
    // resume / validate. cliVersion is threaded through so version-mismatch
    // (priority 1) routes to `aitri adopt --upgrade` here too — `verify` just
    // running does not mean the project is in sync, and surfacing the same P1
    // that status surfaces is the whole point of the SSoT.
    const snapshot = buildProjectSnapshot(dir, { cliVersion: VERSION });
    const top = snapshot.nextActions[0];
    if (top) {
      console.log(`PIPELINE INSTRUCTION — your only next action is:\n`);
      console.log(`  ${top.command}\n`);
      console.log(top.reason);
    } else {
      console.log(`Verify passed. Project is in stable terminal state — every gate has passed.`);
    }
  }
  console.log(bar);
}
