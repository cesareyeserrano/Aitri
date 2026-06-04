/**
 * Module: Command — verify + verify-complete
 * Purpose: verify-run: execute real tests, auto-parse TC results from output, write 04_TEST_RESULTS.json.
 *          verify-complete: gate — validates 04_TEST_RESULTS.json, unlocks Phase 5.
 *          verify: disabled — redirects to verify-run.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { loadConfig, saveConfig, readArtifact, artifactPath, appendEvent, writeLastSession } from '../state.js';
import { readStdinSync } from '../read-stdin.js';
import { autoVerifyBugs, getBlockingBugs, promptAndRegisterBugs } from './bug.js';
import { scopeTokens } from '../scope.js';
import { buildProjectSnapshot } from '../snapshot.js';
// Canonical TC-id grammar lives in lib/tc-id.js (single source of truth, shared
// with the Phase 3 authoring gate). Re-exported here so existing importers and
// tests keep their `verify.js` import path.
import { extractTCId } from '../tc-id.js';
export { extractTCId };
// Pure verdict extractor; phaseReview.js imports only personas/render/context —
// no path back to verify.js, so this is cycle-free.
import { extractReviewVerdict } from '../phases/phaseReview.js';

/**
 * Parse test runner output for TC-XXX pass/fail markers.
 * Detects lines matching: ✔ TC-XXX or ✖ TC-XXX (node:test format)
 * TC IDs support alphanumeric suffixes and multi-segment namespaces
 * (TC-001, TC-020b, TC-FE-001h, TC-API-USER-010f).
 * @param {string} output - Combined stdout+stderr from test runner
 * @returns {Map<string, {status: 'pass'|'fail', notes: string}>}
 */
// Status precedence when one TC id appears more than once in runner output
// (parametrized pytest, repeated it() blocks, a retried test). A `fail` must
// win even if a passing occurrence printed first — first-occurrence-wins
// silently masked the failure as a pass, crediting a TC (and its FR) as green
// while a real assertion was failing. Higher rank wins; equal rank keeps the
// first (preserving its notes). Only pass/fail/skip are produced by parsers.
const STATUS_RANK = { fail: 3, pass: 2, skip: 1 };

function recordDetected(detected, tcId, entry) {
  if (!tcId) return;
  const prior = detected.get(tcId);
  if (prior && (STATUS_RANK[prior.status] ?? 0) >= (STATUS_RANK[entry.status] ?? 0)) return;
  detected.set(tcId, entry);
}

export function parseRunnerOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = /[✔✖]/.exec(line);
    if (!marker) continue;
    const tcId = extractTCId(line);
    if (!tcId) continue;

    if (marker[0] === '✔') {
      // node:test prints `✔ … # TODO` for a todo (unimplemented) test — the ✔
      // marker is present but it is NOT a real pass. Treat it as skip so an
      // unimplemented placeholder named after a TC is never credited green.
      const status = /#\s*TODO\b/.test(line) ? 'skip' : 'pass';
      recordDetected(detected, tcId, { status, notes: line.trim() });
    } else {
      // Capture error context from following lines
      const errorContext = [];
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const l = lines[j].trim();
        if (l && (l.includes('AssertionError') || l.includes('Error') || l.startsWith('at '))) {
          errorContext.push(l);
          if (errorContext.length >= 2) break;
        }
      }
      recordDetected(detected, tcId, {
        status: 'fail',
        notes: [line.trim(), ...errorContext].join(' | ').slice(0, 400),
      });
    }
  }

  return detected;
}

/**
 * Parse Vitest / Jest test runner output for TC-XXX pass/fail markers.
 * Vitest verbose uses ✓ (U+2713) for pass and × (U+00D7) or ✕ (U+2715) for fail.
 * Jest verbose uses the same symbols.
 * Requires verbose output: `vitest run --reporter verbose` or `jest --verbose`
 * @param {string} output - Combined stdout+stderr from test runner
 * @returns {Map<string, {status: 'pass'|'fail', notes: string}>}
 */
export function parseVitestOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tcId = extractTCId(line);
    if (!tcId) continue;
    // Anchor the verdict to the LEADING symbol — a fail line whose title happens
    // to contain a ✓ (e.g. "× TC-001f: rejects the ✓ marker") must not be read
    // as a pass because the glyph appears somewhere in the text.
    if (/^\s*[✓✔]/.test(line)) {
      recordDetected(detected, tcId, { status: 'pass', notes: line.trim() });
    } else if (/^\s*[×✕✗]/.test(line)) {
      const errorContext = [];
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const l = lines[j].trim();
        if (l && (l.includes('Error') || l.includes('Expected') || l.includes('Received'))) {
          errorContext.push(l);
          if (errorContext.length >= 2) break;
        }
      }
      recordDetected(detected, tcId, {
        status: 'fail',
        notes: [line.trim(), ...errorContext].join(' | ').slice(0, 400),
      });
    }
  }
  return detected;
}

/**
 * Parse pytest -v output for TC-XXX pass/fail markers.
 * pytest -v produces lines like:
 *   tests/foo.py::test_TC_001h_description PASSED
 *   tests/foo.py::test_TC_001f_description FAILED
 * TC IDs may use underscores in function names (TC_001h) — reconciled to TC-001h.
 * Requires verbose output: `pytest -v` or `python3 -m pytest -v`
 * @param {string} output - Combined stdout+stderr from pytest
 * @returns {Map<string, {status: 'pass'|'fail', notes: string}>}
 */
export function parsePytestOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tcId = extractTCId(line);
    if (!tcId) continue;
    if (/\bPASSED\b/.test(line)) {
      recordDetected(detected, tcId, { status: 'pass', notes: line.trim() });
    } else if (/\bFAILED\b/.test(line)) {
      // Capture assertion error from following lines
      const errorContext = [];
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const l = lines[j].trim();
        if (l && (l.includes('AssertionError') || l.includes('Error') || l.startsWith('E '))) {
          errorContext.push(l);
          if (errorContext.length >= 2) break;
        }
      }
      recordDetected(detected, tcId, {
        status: 'fail',
        notes: [line.trim(), ...errorContext].join(' | ').slice(0, 400),
      });
    }
  }
  return detected;
}

/**
 * Parse Playwright test runner output for TC-XXX pass/fail markers.
 * Playwright list reporter uses ✓ (U+2713) and format:
 *   ✓  N tests/path/file.spec.js:line:col › TC-XXX: description (Xms)
 *   ✗  N tests/path/file.spec.js:line:col › TC-XXX: description (Xms)
 * @param {string} output - Playwright stdout
 * @returns {Map<string, {status: 'pass'|'fail', notes: string}>}
 */
export function parsePlaywrightOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');
  for (const line of lines) {
    const tcId = extractTCId(line);
    if (!tcId) continue;
    // Anchor the verdict to the leading symbol (see parseVitestOutput) so a ✓ in
    // a failing test's title cannot flip it to pass.
    if (/^\s*[✓✔]/.test(line)) {
      recordDetected(detected, tcId, { status: 'pass', notes: line.trim() });
    } else if (/^\s*[✗✘✖]/.test(line)) {
      recordDetected(detected, tcId, { status: 'fail', notes: line.trim() });
    }
  }
  return detected;
}

/**
 * Parse `go test -v` output for TC-XXX pass/fail/skip markers (alpha.8).
 *
 * Go test format (`go test -v`):
 *   === RUN   TestTC_NM_001h
 *   --- PASS: TestTC_NM_001h (0.00s)
 *   === RUN   TestTC_NM_003e
 *       sample_test.go:23: assertion failed
 *   --- FAIL: TestTC_NM_003e (0.00s)
 *
 * Subtests appear indented (4 spaces) — `    --- PASS: TestX/SubY (...)`.
 * The anchor `^---` (column 0) excludes them by construction; only top-level
 * test results are captured. Parent reports FAIL when any subtest fails.
 *
 * Naming convention (consumed by extractTCId):
 *   func TestTC_NS_NNN<suffix>(t *testing.T)
 *   - `Test` prefix is mandatory in Go (otherwise the runner does not pick it up)
 *   - `TC_NS_001h` after stripping `Test` → extractTCId reconciles _ → -
 *   - Result: `TC-NS-001h` canonical
 *
 * Without `-v` Go only emits FAIL lines for failures (passes are silent).
 * The runner-hint warning at line ~360 surfaces this when test_runner is
 * `go test` without `-v` so the operator can fix the manifest before
 * verify-complete blocks on 0 detected passes.
 *
 * @param {string} output - Combined stdout+stderr from `go test -v`
 * @returns {Map<string, {status: 'pass'|'fail'|'skip', notes: string}>}
 */
export function parseGoOutput(output) {
  const detected = new Map();
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // ^--- (column 0) excludes 4-space-indented subtest lines.
    // [A-Za-z0-9_]+ does not match `/` so subtest paths are also excluded by the char class.
    const m = /^---\s+(PASS|FAIL|SKIP):\s+(Test[A-Za-z0-9_]+)\s+\(/.exec(line);
    if (!m) continue;

    const verdict  = m[1];
    const testName = m[2].slice(4); // strip `Test` prefix
    const tcId     = extractTCId(testName);
    if (!tcId) continue;

    let notes = line.trim();
    let status;
    if (verdict === 'PASS')      status = 'pass';
    else if (verdict === 'SKIP') status = 'skip';
    else {
      status = 'fail';
      // Go prints assertion context BEFORE `--- FAIL:` (between `=== RUN` and the FAIL line).
      // Walk backwards collecting indented lines until a boundary (=== / --- / blank).
      const errorContext = [];
      for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
        const l = lines[j];
        if (/^=== /.test(l) || /^---\s/.test(l) || l === '') break;
        if (/^\s{4}/.test(l)) errorContext.unshift(l.trim());
        if (errorContext.length >= 2) break;
      }
      if (errorContext.length) {
        notes = [line.trim(), ...errorContext].join(' | ').slice(0, 400);
      }
    }
    recordDetected(detected, tcId, { status, notes });
  }
  return detected;
}

/**
 * Build fr_coverage from results + Phase 3 TC→FR mapping.
 * @param {Array} results - TC result objects
 * @param {Array} testCases - Phase 3 test_cases
 * @param {Array} frIds - FR ids from Phase 1
 */
export function buildFRCoverage(results, testCases, frIds) {
  const tcToFRs = {};
  for (const tc of testCases) {
    if (Array.isArray(tc.frs) && tc.frs.length > 0) {
      tcToFRs[tc.id] = tc.frs;
    } else if (tc.requirement_id) {
      tcToFRs[tc.id] = [tc.requirement_id];
    }
  }

  const counters = {};
  for (const id of frIds) {
    counters[id] = { passing: 0, failing: 0, skipped: 0, manual: 0 };
  }
  for (const r of results) {
    const frList = tcToFRs[r.tc_id] || [];
    for (const frId of frList) {
      if (!counters[frId]) continue;
      if (r.status === 'pass')        counters[frId].passing++;
      else if (r.status === 'fail')   counters[frId].failing++;
      else if (r.status === 'manual') counters[frId].manual++;
      else                            counters[frId].skipped++;
    }
  }

  return frIds.map(fr_id => {
    const c = counters[fr_id] || { passing: 0, failing: 0, skipped: 0, manual: 0 };
    let status;
    if (c.passing > 0)                                     status = c.failing > 0 ? 'partial' : 'covered';
    else if (c.failing > 0)                                status = 'uncovered';
    else if (c.manual > 0 && c.skipped === 0)              status = 'manual';
    else                                                   status = 'partial';
    return { fr_id, tests_passing: c.passing, tests_failing: c.failing, tests_skipped: c.skipped, tests_manual: c.manual, status };
  });
}

/**
 * Scan test file content for @aitri-tc markers and count assert calls per TC block.
 * Pure function — testable without filesystem access.
 * @param {string} content - test file content
 * @param {string} relPath - relative path for reporting
 * @returns {Array<{tc_id: string, file: string, assertCount: number}>} TCs with ≤1 assertion
 */
export function scanTestContent(content, relPath = '') {
  const lowConfidence = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Grab the token after the marker and reconcile it through the shared
    // canonical grammar — NOT an ad-hoc `TC-[A-Za-z0-9]+`, which truncated
    // namespaced ids at the second hyphen (`TC-E2E-001h` → `TC-E2E`) and made
    // the assertion-density report name the wrong TC. Same SSoT as extractTCId.
    const markerMatch = lines[i].match(/(?:\/\/|#)\s*@aitri-tc\s+(\S+)/);
    if (!markerMatch) continue;
    const tc_id = extractTCId(markerMatch[1]);
    if (!tc_id) continue;
    const start = Math.max(0, i - 20);
    const end = Math.min(lines.length, i + 40);
    const block = lines.slice(start, end).join('\n');
    // Match JS-style (assert.x / expect()) and Python-style (assert expr) assertions
    const assertMatches = block.match(/\bassert\.\w+\s*\(|\bexpect\s*\(|\bassert\s+[^\s(]/g) || [];
    if (assertMatches.length <= 1) {
      lowConfidence.push({ tc_id, file: relPath, assertCount: assertMatches.length });
    }
  }
  return lowConfidence;
}

/**
 * Scan test files on disk for low-confidence TCs (≤1 assert per TC block).
 * @param {string[]} testFiles - relative paths from manifest.test_files
 * @param {string} dir - project directory
 * @returns {Array<{tc_id: string, file: string, assertCount: number}>}
 */
export function scanAssertionDensity(testFiles, dir) {
  const results = [];
  for (const relPath of (testFiles || [])) {
    const fullPath = path.join(dir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      results.push(...scanTestContent(content, relPath));
    } catch { /* non-fatal — skip unreadable files */ }
  }
  return results;
}

/**
 * Parse line coverage % from a test runner's output, stack-agnostic.
 * Tries each known format in order:
 *   - istanbul table ("All files | XX.XX |"): node built-in --coverage, jest, vitest
 *   - go test -cover ("coverage: XX.X% of statements")
 *   - pytest-cov term report ("TOTAL ... XX%")
 * @param {string} output - combined test runner output
 * @returns {number|null} line coverage percentage, or null if not found
 */
export function parseCoverageOutput(output) {
  if (!output) return null;
  // istanbul / node built-in coverage table — case-insensitive ("all files" / "All files")
  let m = output.match(/all files\s*\|\s*([\d.]+)/i);
  if (m) return parseFloat(m[1]);
  // go test -cover
  m = output.match(/coverage:\s*([\d.]+)%/i);
  if (m) return parseFloat(m[1]);
  // pytest-cov terminal report TOTAL row — last percentage on the line
  m = output.match(/^TOTAL\b[^\n]*?(\d+(?:\.\d+)?)%/m);
  if (m) return parseFloat(m[1]);
  return null;
}

/**
 * Inject a coverage-collection flag into a test command, per runner family.
 * Stack-agnostic: node built-in runner, go test, pytest (pytest-cov), jest, vitest.
 * The coverage tool must already exist in the PROJECT's own environment (e.g.
 * pytest-cov declared in the project's deps) — Aitri orchestrates it via spawn,
 * it does not bundle it. This is the same pattern as the Playwright dispatch and
 * does not touch Aitri's zero-dep runtime invariant.
 * @param {string} testCmd
 * @param {number} nodeMajor - process major version, for the node coverage flag
 * @returns {{cmd: string, tool: string|null}} - tool is the instrumentation label, or null if unrecognized
 */
export function injectCoverageFlag(testCmd, nodeMajor) {
  const cmd = (testCmd || '').trim();
  if (cmd.startsWith('node ')) {
    if (/--coverage\b|--experimental-test-coverage\b/.test(cmd)) return { cmd, tool: 'node' };
    const flag = nodeMajor >= 22 ? '--coverage' : '--experimental-test-coverage';
    return { cmd: 'node ' + flag + ' ' + cmd.slice('node '.length).trim(), tool: flag };
  }
  if (/\bgo\s+test\b/.test(cmd)) {
    if (/\s-cover\b/.test(cmd)) return { cmd, tool: 'go -cover' };
    return { cmd: cmd.replace(/\bgo\s+test\b/, 'go test -cover'), tool: 'go -cover' };
  }
  if (/\bpytest\b/.test(cmd)) {
    if (/--cov\b/.test(cmd)) return { cmd, tool: 'pytest-cov' };
    return { cmd: cmd + ' --cov=. --cov-report=term', tool: 'pytest-cov' };
  }
  if (/\bjest\b/.test(cmd)) {
    if (/--coverage\b/.test(cmd)) return { cmd, tool: 'jest --coverage' };
    return { cmd: cmd + ' --coverage', tool: 'jest --coverage' };
  }
  if (/\bvitest\b/.test(cmd)) {
    if (/--coverage\b/.test(cmd)) return { cmd, tool: 'vitest --coverage' };
    return { cmd: cmd + ' --coverage', tool: 'vitest --coverage' };
  }
  return { cmd, tool: null };
}

/**
 * Run the project-declared code-quality gates (lint, type-check, security, …).
 *
 * Aitri does not implement analyzers — zero-dep, stack-agnostic. It runs the
 * command each gate declares in 04_IMPLEMENTATION_MANIFEST.json#quality_gates
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
    const r = spawnSync(parts[0], parts.slice(1), { cwd: dir, encoding: 'utf8', timeout: 300000, shell: false });
    let status, exit_code;
    if (r.error?.code === 'ENOENT') {
      status = 'error'; exit_code = null;
    } else {
      exit_code = r.status ?? 1;
      status = exit_code === 0 ? 'pass' : 'fail';
    }
    const text = [r.stdout || '', r.stderr || ''].filter(Boolean).join('\n').trim();
    out.push({ name, command: g.command, required, status, exit_code, ...(text ? { output: text.slice(-600) } : {}) });
  }
  return out;
}

export function cmdVerifyRun({ dir, args, flagValue, err, featureRoot, scopeName }) {
  const { verb: sv, arg: sa } = scopeTokens(featureRoot, scopeName);
  const config = loadConfig(dir);
  const artifactsDir = config.artifactsDir || '';
  if (!(config.approvedPhases || []).includes(4)) {
    err(`Phase 4 must be approved before running verify-run.\nRun: aitri ${sv}approve${sa} 4`);
  }

  const manifestRaw = readArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json', artifactsDir);
  if (!manifestRaw) err(`Missing 04_IMPLEMENTATION_MANIFEST.json — complete Phase 4 first.`);

  const testCasesRaw = readArtifact(dir, '03_TEST_CASES.json', artifactsDir);
  if (!testCasesRaw) err(`Missing 03_TEST_CASES.json — complete Phase 3 first.`);

  let manifest, tcs, requirements;
  try { manifest = JSON.parse(manifestRaw); } catch { err('04_IMPLEMENTATION_MANIFEST.json is malformed JSON'); }
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

  // Resolve test command: --cmd flag > manifest.test_runner > npm test
  let testCmd = flagValue('--cmd') || manifest.test_runner || 'npm test';

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
  if (coverageThreshold !== null) {
    const major = parseInt(process.versions.node.split('.')[0], 10);
    const inj = injectCoverageFlag(testCmd, major);
    if (inj.tool) {
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
  const result = spawnSync(cmdParts[0], cmdParts.slice(1), {
    cwd: dir,
    encoding: 'utf8',
    timeout: 300000,
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
        `  Preferred: set test_runner in 04_IMPLEMENTATION_MANIFEST.json to a bare\n` +
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

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = [stdout, stderr].filter(Boolean).join('\n');
  const exitCode = result.status ?? 1;

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
      `  Update test_runner in 04_IMPLEMENTATION_MANIFEST.json to "go test ./... -v" so\n` +
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

  // Playwright e2e runner — auto-detected from playwright.config.js/ts presence
  // In feature mode, dir is featureDir; playwright.config.js lives at the project root (featureRoot).
  // --e2e flag kept as no-op for backward compatibility
  let playwrightOutput = '';
  let playwrightExitCode = null;
  const pwRoot = featureRoot || dir;
  const pwConfigJs = path.join(pwRoot, 'playwright.config.js');
  const pwConfigTs = path.join(pwRoot, 'playwright.config.ts');
  const hasPwConfig = fs.existsSync(pwConfigJs) || fs.existsSync(pwConfigTs);
  if (hasPwConfig) {
    {
      process.stderr.write(`[aitri] Playwright config detected — running E2E tests automatically...\n`);
      const pwResult = spawnSync('npx', ['playwright', 'test'], {
        cwd: pwRoot,
        encoding: 'utf8',
        timeout: 600000,
        shell: false,
      });
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
  const SKIP_NOTE = (tc) => {
    const base =
      `Not detected in test runner output — rename the test function to include "${tc.id}" ` +
      `(e.g. test_${tc.id.replace(/-/g, '_')}_description) and add # @aitri-tc ${tc.id} above it.`;
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
  const requiredGateFailed = qualityGates.some(g => g.required && g.status !== 'pass');

  const testResults = {
    executed_at: new Date().toISOString(),
    test_runner: testCmd,
    exit_code: exitCode,
    results,
    fr_coverage: frCoverage,
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
  fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));

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

  const manifestWarnLines = (missingTestRunner || missingTestFiles) ? [
    ``,
    `## ⚠ Manifest Incomplete — Update 04_IMPLEMENTATION_MANIFEST.json`,
    ...(missingTestRunner ? [
      `  test_runner is missing — aitri verify-run fell back to "npm test".`,
      `  Add the exact command matching your stack to 04_IMPLEMENTATION_MANIFEST.json:`,
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

  console.log([
    `# Verify Run — Auto-Parsed Results`,
    ``,
    `## Test command`,
    `  ${testCmd}`,
    ``,
    `## Exit code: ${exitCode} ${exitCode === 0 ? '(success)' : '(failure)'}`,
    ``,
    `## Results (auto-detected from runner output)`,
    `  Passed:  ${summary.passed}`,
    `  Failed:  ${summary.failed}`,
    `  Skipped: ${summary.skipped}${summary.skipped > 0 ? ` (${summary.skipped_e2e} ${hasPwConfig ? 'e2e/browser' : 'e2e'}, ${summary.skipped_no_marker} no marker detected)` : ''}`,
    `  Manual:  ${summary.manual > 0 ? `${summary.manual_verified}/${summary.manual} verified` : '0'}${summary.manual > 0 && summary.manual_verified < summary.manual ? ` — run: aitri tc verify <TC-ID> --result pass|fail --notes "..."` : ''}`,
    ...coverageLines,
    ...zeroTCsLines,
    ...manifestWarnLines,
    ...assertionWarnLines,
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
    `Results parsed from real runner output — agent self-reporting eliminated.`,
    `Detection pattern: ✔/✖ TC-XXX (node:test) and ✓/×/✕ TC-XXX (Vitest/Jest verbose). Auto-detected from runner.`,
    summary.failed > 0
      ? `\n⚠ ${summary.failed} failing test(s) detected. Fix failures before verify-complete.`
      : ``,
    coverageFailed
      ? `⚠ Coverage ${lineCoverage.toFixed(2)}% below threshold ${coverageThreshold}% — fix before verify-complete.`
      : ``,
    ``,
    `## Next step`,
    `Run: aitri ${sv}verify-complete${sa}`,
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
    err(`04_TEST_RESULTS.json not found.\nRun: aitri ${sv}verify-run${sa}  then save the results file.`);
  }

  let d;
  try { d = JSON.parse(fs.readFileSync(resultsPath, 'utf8')); }
  catch { err('04_TEST_RESULTS.json is malformed JSON — fix and retry.'); }

  const missing = ['executed_at', 'results', 'fr_coverage', 'summary'].filter(k => !d[k]);
  if (missing.length) err(`04_TEST_RESULTS.json missing fields: ${missing.join(', ')}`);
  if (!Array.isArray(d.results) || d.results.length === 0)
    err('results array is empty — at least one TC must be reported');
  if (!Array.isArray(d.fr_coverage) || d.fr_coverage.length === 0)
    err('fr_coverage array is empty — every FR must have a coverage entry');

  // C2 (rc.9): opt-in assertion-density gate. Default behavior is unchanged (warning
  // only). Projects that set "strictAssertions": true in .aitri block here when any TC
  // has ≤1 assertion in its test block — a low-confidence test that may pass without
  // verifying real behavior. The list is recorded by verify-run in low_confidence_tcs.
  if (config.strictAssertions && Array.isArray(d.low_confidence_tcs) && d.low_confidence_tcs.length > 0) {
    const list = d.low_confidence_tcs
      .map(tc => `  ${tc.tc_id} (${tc.file}) — ${tc.assertCount} assertion(s)`)
      .join('\n');
    err(
      `strictAssertions is ON — ${d.low_confidence_tcs.length} low-confidence test case(s) block verify-complete:\n${list}\n\n` +
      `Each TC above has ≤1 assertion in its test block. Add assertions that exercise the real\n` +
      `behavior from the TC's expected_result (not constants or assert.ok(true)), then re-run\n` +
      `aitri ${sv}verify-run${sa}. To disable this gate, remove "strictAssertions" from .aitri.`
    );
  }

  // Code-quality gate (ADR-037): a declared `required` gate that did not pass
  // blocks the pipeline, exactly like a failing test. `advisory` gates
  // (required: false) are surfaced by verify-run but never block here.
  if (Array.isArray(d.quality_gates)) {
    const failedGates = d.quality_gates.filter(g => g && g.required && g.status !== 'pass');
    if (failedGates.length) {
      const list = failedGates.map(g =>
        `  ✗ ${g.name} (${g.command}) — ${g.status}${g.exit_code != null ? ` [exit ${g.exit_code}]` : ''}`
      ).join('\n');
      err(
        `${failedGates.length} required code-quality gate(s) did not pass — fix before Phase 5:\n${list}\n\n` +
        `An "error" status means the gate's tool was not found (declared but not installed).\n` +
        `Fix the code or the toolchain, then re-run aitri ${sv}verify-run${sa}. To make a gate\n` +
        `non-blocking, set "required": false on it in 04_IMPLEMENTATION_MANIFEST.json#quality_gates.`
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
    fs.writeFileSync(resultsPath, JSON.stringify(d, null, 2));
    process.stderr.write(`[aitri] ${failedStubs.length} known gap(s) recorded in 04_TEST_RESULTS.json\n`);
  }

  const uncovered = d.fr_coverage.filter(fr => fr.status === 'uncovered');
  if (uncovered.length) {
    err(`Uncovered FRs — all requirements must have passing tests:\n  ${uncovered.map(f => f.fr_id).join(', ')}`);
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
          e2eIds.has(r.tc_id) && (r.status === 'pass' || r.status === 'manual')
        );
        if (e2eCovered.length === 0) {
          const uncoveredIds = (d.results || [])
            .filter(r => e2eIds.has(r.tc_id) && r.status !== 'pass' && r.status !== 'manual')
            .map(r => r.tc_id);
          const pwRoot = featureRoot || dir;
          const hasPwConfig = fs.existsSync(path.join(pwRoot, 'playwright.config.js')) ||
                              fs.existsSync(path.join(pwRoot, 'playwright.config.ts'));
          const advice = hasPwConfig
            ? `Playwright config detected but no e2e TC passed:\n` +
              `  - Check browser installation: npx playwright install\n` +
              `  - Verify the test files include TC ids (e.g. test('TC-XXX: ...'))\n` +
              `  - Mark TCs that cannot run in this environment with automation: "manual" in 03_TEST_CASES.json`
            : `No e2e runner detected (no playwright.config.{js,ts} at project root). Choose one:\n` +
              `  - Install Playwright: add playwright.config.{js,ts} and write the e2e tests, OR\n` +
              `  - Mark these TCs with automation: "manual" in 03_TEST_CASES.json — they count as covered for FR purposes and can be verified via aitri tc verify, OR\n` +
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

  // Traceability cross-check: every FR from Phase 1 must be in fr_coverage with ≥1 passing test
  const requirements = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir);
  if (requirements) {
    try {
      const reqs = JSON.parse(requirements);
      const phase1FRIds = new Set((reqs.functional_requirements || []).map(fr => fr.id));
      const reportedFRIds = new Set((d.fr_coverage || []).map(fr => fr.fr_id));

      const missingFromCoverage = [...phase1FRIds].filter(id => !reportedFRIds.has(id));
      if (missingFromCoverage.length)
        err(`FR coverage gap — these Phase 1 requirements are missing from fr_coverage:\n  ${missingFromCoverage.join(', ')}\n  Add an entry for every FR in 04_TEST_RESULTS.json fr_coverage.`);

      const uncoveredPhase1 = [...phase1FRIds].filter(id => {
        const entry = (d.fr_coverage || []).find(fr => fr.fr_id === id);
        // FRs with status 'manual' are covered by human execution — don't block on zero automated tests
        return !entry || (entry.tests_passing === 0 && entry.status !== 'manual');
      });
      if (uncoveredPhase1.length)
        err(`Requirement coverage failure — these FRs have zero passing tests:\n  ${uncoveredPhase1.join(', ')}\n  Every requirement from Phase 1 must have ≥1 passing test before Phase 5.`);
    } catch { /* parse error already caught above */ }
  }

  // Block if open bugs are linked to MUST FRs
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
