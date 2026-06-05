/**
 * Module: Command — reconcile
 * Purpose: Detect code changes outside the Aitri pipeline since last build approval,
 *          and generate a briefing for the agent to classify and route each change.
 *
 * Detection:
 *   git-based  — git diff <baseRef>..HEAD --name-only (when git is available)
 *   mtime-based — file modification time vs stored baseline timestamp (fallback)
 *
 * Baseline:
 *   Recorded in .aitri as reconcileState.baseRef when build (phase 4) is approved.
 *   Cleared when phase 4 is cascade-invalidated.
 *
 * State:
 *   reconcileState.status = 'pending'  — changes detected, not yet reconciled
 *   reconcileState.status = 'resolved' — clean (no changes or all reconciled)
 *   Resolved automatically by next approve build.
 */

import fs   from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import { loadConfig, saveConfig, readArtifact, appendEvent, writeLastSession } from '../state.js';
import { getBlockingBugs } from './bug.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/reviewer.js';
import { render } from '../prompts/render.js';
import { readStdinSync } from '../read-stdin.js';
import { isBehavioralFile, isFeaturePipelineArtifact } from '../reconcile-patterns.js';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.nyc_output',
  '__pycache__', '.venv', 'venv', 'target', 'vendor', '.next', '.nuxt',
]);

const SOURCE_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rb', '.java', '.kt', '.rs', '.c', '.cpp', '.h',
  '.cs', '.php', '.swift', '.scala',
]);

// ── Detection helpers ─────────────────────────────────────────────────────────

function isGitRepo(dir) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: dir, stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function gitCurrentSHA(dir) {
  return execSync('git rev-parse HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
}

// isFeaturePipelineArtifact() lives in reconcile-patterns.js — shared SSoT with
// the snapshot's uncounted-files detector (rc.6 fix). Feature sub-pipeline
// artifacts (features/<name>/spec|.aitri) are governed by the feature's own gate,
// not the parent build baseline, and are excluded symmetrically with root
// spec/ + .aitri. Shared code the feature contributes (lib/, tests/ outside the
// feature dir) stays in scope — the operator confirms it via the --resolve TTY gate.

function gitChangedFiles(dir, baseRef) {
  const out = execSync(
    `git diff ${baseRef}..HEAD --name-only --diff-filter=ACMR`,
    { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }
  ).toString().trim();
  if (!out) return [];
  return out.split('\n').filter(f =>
    f &&
    !f.startsWith('spec/') &&
    !f.startsWith('.aitri') &&
    !f.startsWith('node_modules/') &&
    !isFeaturePipelineArtifact(f) &&
    isBehavioralFile(f)
  );
}

/**
 * Behavioral files with uncommitted changes in the working tree (staged,
 * unstaged, or untracked). Git-only: mtime baselines already read the working
 * tree in detectChanges(), so the working-tree-vs-HEAD asymmetry this guards
 * against does not exist for them — callers must gate on method === 'git'.
 *
 * Fail-open: if git is unavailable or `git status` errors, returns [] (cannot
 * assert dirtiness → must not block).
 *
 * Status semantics mirror the detection's `git diff --diff-filter=ACMR`: only
 * Added / Modified / Renamed / Copied (and untracked, which becomes an Add on
 * commit) can re-trigger reconcile against a freshly-advanced baseline. Pure
 * Deletions are excluded — detection never counts them, so an uncommitted
 * deletion cannot cause the re-trigger this guard prevents.
 *
 * Path scope matches gitChangedFiles(): spec/, .aitri, feature pipeline, and
 * node_modules are excluded; non-behavioral files (docs, manifests) are filtered.
 */
function uncommittedBehavioralChanges(dir) {
  if (!isGitRepo(dir)) return [];
  let out;
  try {
    out = execSync('git status --porcelain --untracked-files=all', {
      cwd: dir, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
  } catch { return []; }

  const files = [];
  for (const line of out.split('\n')) {
    if (line.length < 4) continue;            // "XY p" is the minimum
    const code = line.slice(0, 2);
    const counts = code === '??' || /[AMRC]/.test(code);
    if (!counts) continue;                    // pure deletion / unmerged → skip
    let p = line.slice(3);
    const arrow = p.indexOf(' -> ');
    if (arrow !== -1) p = p.slice(arrow + 4); // rename/copy → the new path
    if (p.startsWith('"') && p.endsWith('"')) {
      try { p = JSON.parse(p); } catch { p = p.slice(1, -1); }
    }
    const f = p.replace(/\\/g, '/');
    if (!f) continue;
    if (f.startsWith('spec/') || f.startsWith('.aitri') || f.startsWith('node_modules/')) continue;
    if (isFeaturePipelineArtifact(f)) continue;
    if (!isBehavioralFile(f)) continue;
    files.push(f);
  }
  return [...new Set(files)];
}

function mtimeChangedFiles(dir, sinceMs) {
  const results = [];
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      const rel  = path.relative(dir, full);
      if (e.isDirectory()) { walk(full); continue; }
      if (!SOURCE_EXTS.has(path.extname(e.name).toLowerCase())) continue;
      if (rel.startsWith('spec/') || rel.startsWith('.aitri')) continue;
      if (isFeaturePipelineArtifact(rel.replace(/\\/g, '/'))) continue;
      if (!isBehavioralFile(rel)) continue;
      try {
        if (fs.statSync(full).mtimeMs > sinceMs) results.push(rel);
      } catch { /* skip unreadable files */ }
    }
  }
  walk(dir);
  return results;
}

function detectChanges(dir, config) {
  const ns     = config.reconcileState;
  const method = ns?.method || 'mtime';

  if (method === 'git' && isGitRepo(dir)) {
    try {
      const currentSHA = gitCurrentSHA(dir);
      if (currentSHA === ns.baseRef) return { files: [], currentRef: currentSHA, method: 'git' };
      const files = gitChangedFiles(dir, ns.baseRef);
      return { files, currentRef: currentSHA, method: 'git' };
    } catch { /* fall through to mtime */ }
  }

  // mtime fallback
  const sinceMs = new Date(ns.baseRef).getTime();
  if (isNaN(sinceMs)) return { files: [], currentRef: ns.baseRef, method: 'mtime' };
  const files = mtimeChangedFiles(dir, sinceMs);
  return { files, currentRef: new Date().toISOString(), method: 'mtime' };
}

// ── Resolve path ──────────────────────────────────────────────────────────────
// Closes the reconcile cycle for maintenance changes (refactor / already-registered
// bug-fix) without cascading phase 5. Mechanical gates + human TTY gate back the
// assertion "these changes are accounted for."

function cmdReconcileResolve({ dir, config, err }) {
  const ns = config.reconcileState;
  if (ns?.status !== 'pending') {
    process.stderr.write(
      `[aitri] Nothing to resolve — reconcile is not in pending state.\n` +
      `  Run 'aitri reconcile' first to detect changes.\n`
    );
    process.exit(1);
  }

  const { files, currentRef, method } = detectChanges(dir, config);

  if (files.length === 0) {
    config.reconcileState = { baseRef: currentRef, method, status: 'resolved', lastRun: new Date().toISOString() };
    appendEvent(config, 'reconcile-resolved', null, { files: 0, method, auto: true });
    writeLastSession(config, dir, 'reconcile --resolve');
    saveConfig(dir, config);
    console.log('\n✅ No pending changes. Baseline advanced to current HEAD.');
    return;
  }

  // Mechanical gate 1: tests must be green against current HEAD
  if (!config.verifyPassed) {
    process.stderr.write(
      `\n❌ Cannot resolve — verify has not passed for current code.\n` +
      `   Run 'aitri verify-run' then 'aitri verify-complete' before resolving.\n` +
      `   Rationale: resolving requires mechanical proof that the spec's tests still pass.\n`
    );
    process.exit(1);
  }

  // Mechanical gate 2: no open critical/high bugs
  const blockers = getBlockingBugs(dir, config);
  if (blockers.length) {
    const list = blockers.map(b => `  ✗ ${b.id} [${b.severity}]: ${b.title}`).join('\n');
    process.stderr.write(
      `\n❌ Cannot resolve — open critical/high bug(s):\n${list}\n` +
      `\n  Fix and verify these bugs before resolving reconcile.\n`
    );
    process.exit(1);
  }

  // Working-tree guard (git baselines only). --resolve stamps the baseline at
  // the current commit, but detection reads `git diff baseRef..HEAD` — committed
  // state only. A behavioral file still in the working tree is invisible to the
  // classification the operator is about to confirm, and re-triggers reconcile
  // the moment it is committed against the just-advanced baseline (the
  // double-cycle reproduced on the Cesar canary via Codex, 2026-05-23). Placed
  // after the verify gate so the message's "verified state" is already true.
  // mtime baselines are exempt: detectChanges() reads the working tree directly.
  if (method === 'git') {
    const uncommitted = uncommittedBehavioralChanges(dir);
    if (uncommitted.length) {
      const list = uncommitted.map(f => `  ✗ ${f}`).join('\n');
      process.stderr.write(
        `\n❌ Cannot resolve — uncommitted behavioral changes in the working tree:\n${list}\n` +
        `\n  Commit them (or 'git stash -u'), then re-run 'aitri reconcile --resolve'.\n` +
        `  Rationale: --resolve stamps the baseline at the current commit. Files still\n` +
        `  in the working tree are not part of that commit, so they re-trigger reconcile\n` +
        `  as soon as you commit them. The baseline must point to the committed state\n` +
        `  that verify validated. If 'verify-run' forced an edit, commit it before resolving.\n`
      );
      process.exit(1);
    }
  }

  // Human TTY gate — explicit assertion that all detected changes are
  // refactor or already-registered bug-fix (no fr-change, no new-feature).
  if (!process.stdin.isTTY) {
    process.stderr.write(
      `\n❌ Cannot resolve non-interactively — human confirmation required.\n` +
      `   Run 'aitri reconcile --resolve' in your terminal.\n`
    );
    process.exit(1);
  }

  const bar = '─'.repeat(60);
  process.stdout.write(`\n${bar}\n`);
  process.stdout.write(`Reconcile — Resolve pending changes\n`);
  process.stdout.write(`${bar}\n\n`);
  process.stdout.write(`Files changed since baseline (${files.length}):\n`);
  for (const f of files) process.stdout.write(`  • ${f}\n`);
  process.stdout.write(
    `\nMechanical gates: ✅ tests passing  ✅ no critical/high open bugs\n\n` +
    `Confirm: every listed file is either a refactor (no observable behavior\n` +
    `change) or a bug-fix already registered and verified in BUGS.json.\n` +
    `If any file is an fr-change or new-feature, STOP and route it through\n` +
    `the pipeline (run-phase requirements or feature init) instead.\n\n` +
    `Proceed? (y/N): `
  );
  const answer = readStdinSync(10).trim().toLowerCase();
  if (answer !== 'y' && answer !== 'yes') {
    process.stderr.write(`\n❌ Resolve cancelled.\n`);
    process.exit(1);
  }

  const prevRef = ns.baseRef;
  config.reconcileState = { baseRef: currentRef, method, status: 'resolved', lastRun: new Date().toISOString() };
  appendEvent(config, 'reconcile-resolved', null, {
    files: files.length,
    method,
    baseRefFrom: prevRef,
    baseRefTo:   currentRef,
  });
  writeLastSession(config, dir, 'reconcile --resolve');
  saveConfig(dir, config);

  console.log(`\n✅ Reconcile resolved — baseline advanced (${files.length} file(s) accounted for).`);
}

// ── Briefing projection (proportional size) ─────────────────────────────────────
// The reconcile briefing used to embed the FULL 01/03/04 JSON — ~70KB on large
// projects (Ultron canary). The original backlog plan ("show only the FRs/TCs that
// reference a changed file") is NOT implementable: the artifact chain carries no
// file→FR mapping — `files_created`/`files_modified` are bare path strings, and no
// FR/TC references a source file (verified against ARTIFACTS.md + a full code sweep).
// So instead of filtering by relevance (which would need data that does not exist and
// risks under-contexting the classification), the briefing keeps EVERY FR and TC — no
// coverage signal dropped — but projects them compactly: classification needs each
// item's identity + FR mapping + intent, not its full execution detail. The verbose
// per-TC fields (steps/given/when/then/test_data/preconditions) are 70-80% of the
// weight and are not needed to decide new-feature / fr-change / bug-fix / refactor.

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Compact 03_TEST_CASES for the briefing: keep `test_plan` + every TC's
 * id/title/FR-mapping/type/scenario/expected_result; drop the verbose execution
 * fields. No TC is removed — coverage context stays intact. Falls back to the raw
 * text if it does not parse or is not the expected shape (never worse than today).
 */
export function compactTestCases(raw) {
  const o = safeParse(raw);
  if (!o || !Array.isArray(o.test_cases)) return raw;
  const slim = {
    ...(o.test_plan ? { test_plan: o.test_plan } : {}),
    test_cases: o.test_cases.map(tc => ({
      id: tc.id,
      title: tc.title,
      ...(Array.isArray(tc.frs) ? { frs: tc.frs } : { requirement_id: tc.requirement_id }),
      ...(tc.user_story_id ? { user_story_id: tc.user_story_id } : {}),
      ...(tc.ac_id ? { ac_id: tc.ac_id } : {}),
      ...(tc.type ? { type: tc.type } : {}),
      ...(tc.scenario ? { scenario: tc.scenario } : {}),
      ...(tc.expected_result ? { expected_result: tc.expected_result } : {}),
    })),
  };
  return JSON.stringify(slim, null, 2);
}

/**
 * Trim 04_BUILD_REPORT for the briefing: keep what was built (file lists, test
 * runner/files, technical_debt with its fr_id) and drop config the drift
 * classification does not use (quality_gates, environment_variables,
 * setup_commands). Falls back to the raw text if it does not parse.
 */
export function compactManifest(raw) {
  const o = safeParse(raw);
  if (!o) return raw;
  const slim = {};
  for (const k of ['files_created', 'files_modified', 'test_files', 'test_runner', 'technical_debt']) {
    if (o[k] !== undefined) slim[k] = o[k];
  }
  return JSON.stringify(slim, null, 2);
}

/**
 * Per-file unified diff for the briefing (git baselines only). Each file's diff is
 * capped at 200 lines, truncation annotated with the command to see the rest.
 * Returns '' for mtime baselines or when git is unavailable — those briefings keep
 * the file list only, exactly as before. Path is passed as an argv element
 * (execFileSync), not interpolated into a shell string.
 */
function buildChangeDiffs(dir, baseRef, files, method) {
  if (method !== 'git' || !isGitRepo(dir)) return '';
  const CAP = 200;
  const blocks = [];
  for (const f of files) {
    let diff;
    try {
      diff = execFileSync('git', ['diff', `${baseRef}..HEAD`, '--', f], {
        cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024,
      }).toString();
    } catch { continue; }
    if (!diff.trim()) continue;
    const lines = diff.split('\n');
    const body = lines.length > CAP
      ? lines.slice(0, CAP).join('\n') +
        `\n... (${lines.length - CAP} more lines — run: git diff ${baseRef.slice(0, 8)}..HEAD -- ${f})`
      : diff.replace(/\n$/, '');
    blocks.push('```diff\n' + body + '\n```');
  }
  return blocks.join('\n\n');
}

// ── Command ───────────────────────────────────────────────────────────────────

/**
 * Escape hatch for brownfield projects whose Phase 4 was approved before v0.1.80
 * (when reconcileState was introduced). Stamps a baseline at the current state so
 * subsequent `aitri reconcile` can detect post-P4 code drift. See FEEDBACK.md A4.
 *
 * Refuses to run if reconcileState already exists — investigate before clobbering.
 */
function cmdReconcileInit({ dir, config, err }) {
  if (!(config.approvedPhases || []).includes(4)) {
    err(
      `Cannot --init: Phase 4 (build) must be approved first.\n` +
      `  A reconcile baseline classifies code changes that happen *after* build approval;\n` +
      `  it is meaningless before there is an approved build to compare against.`
    );
  }
  if (config.reconcileState?.baseRef) {
    err(
      `reconcileState already exists (baseRef: ${String(config.reconcileState.baseRef).slice(0, 16)}).\n` +
      `  --init refuses to overwrite an existing baseline. To check drift against it:\n\n` +
      `    aitri reconcile\n`
    );
  }

  let baseRef, method;
  if (isGitRepo(dir)) {
    try {
      baseRef = gitCurrentSHA(dir);
      method  = 'git';
    } catch {
      // git repo detected but HEAD unreadable (e.g. no commits yet) — fall through
    }
  }
  if (!baseRef) {
    baseRef = new Date().toISOString();
    method  = 'mtime';
  }

  config.reconcileState = {
    baseRef,
    method,
    status:  'resolved',
    lastRun: new Date().toISOString(),
  };
  saveConfig(dir, config);

  const label = method === 'git' ? `git commit ${baseRef.slice(0, 8)}` : `timestamp ${baseRef}`;
  console.log(
    `\n✅ Reconcile baseline initialized.\n` +
    `   Method:   ${method}\n` +
    `   Base ref: ${label}\n\n` +
    `   From now on, \`aitri reconcile\` will report code changes since this point.\n` +
    `   The baseline advances automatically on the next \`aitri approve 4\`.\n`
  );
}

export function cmdReconcile({ dir, args = [], err }) {
  const config = loadConfig(dir);
  if (!config.aitriVersion) err('Not an Aitri project. Run: aitri init');

  if (args.includes('--init')) {
    cmdReconcileInit({ dir, config, err });
    return;
  }

  const ns = config.reconcileState;
  if (!ns?.baseRef) {
    const phase4Approved = (config.approvedPhases || []).includes(4);
    const hint = phase4Approved
      ? `  This project's Phase 4 was approved before v0.1.80 (when reconcileState was added).\n` +
        `  To stamp a baseline at the current state, run:\n\n    aitri reconcile --init\n`
      : `  A baseline is recorded automatically when you approve build (phase 4).\n` +
        `  Complete the pipeline to Phase 4 first.\n`;
    process.stderr.write(`[aitri] No reconcile baseline found.\n${hint}`);
    process.exit(1);
  }

  if (args.includes('--resolve')) {
    cmdReconcileResolve({ dir, config, err });
    return;
  }

  const { files, currentRef, method } = detectChanges(dir, config);

  if (files.length === 0) {
    config.reconcileState = { ...ns, status: 'resolved', lastRun: new Date().toISOString() };
    saveConfig(dir, config);
    console.log('\n✅ No code changes detected outside pipeline since last build approval.');
    return;
  }

  config.reconcileState = {
    baseRef:  ns.baseRef,   // keep original — updated only on next approve build
    method,
    status:   'pending',
    lastRun:  new Date().toISOString(),
  };
  saveConfig(dir, config);

  const artifactsDir  = config.artifactsDir || '';
  const requirements  = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir) || '(not available)';
  const testCases     = compactTestCases(readArtifact(dir, '03_TEST_CASES.json',   artifactsDir) || '(not available)');
  const manifest      = compactManifest(readArtifact(dir, '04_BUILD_REPORT.json', artifactsDir) || '(not available)');
  const changeDiffs   = buildChangeDiffs(dir, ns.baseRef, files, method);

  const fileList  = files.map(f => `- ${f}`).join('\n');
  const baseLabel = method === 'git'
    ? `git commit ${ns.baseRef.slice(0, 8)}`
    : `last build approval (${ns.baseRef.slice(0, 16)})`;

  const briefing = render('phases/reconcile', {
    ROLE,
    CONSTRAINTS,
    REASONING,
    PROJECT_NAME: config.projectName || path.basename(dir),
    FILE_COUNT:   String(files.length),
    FILE_LIST:    fileList,
    BASE_LABEL:   baseLabel,
    REQUIREMENTS: requirements,
    TEST_CASES:   testCases,
    MANIFEST:     manifest,
    DIFFS:        changeDiffs,
  });

  process.stdout.write(briefing + '\n');
}
