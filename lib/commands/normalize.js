/**
 * Module: Command — normalize
 * Purpose: Detect code changes outside the Aitri pipeline since last build approval,
 *          and generate a briefing for the agent to classify and route each change.
 *
 * Detection:
 *   git-based  — git diff <baseRef>..HEAD --name-only (when git is available)
 *   mtime-based — file modification time vs stored baseline timestamp (fallback)
 *
 * Baseline:
 *   Recorded in .aitri as normalizeState.baseRef when build (phase 4) is approved.
 *   Cleared when phase 4 is cascade-invalidated.
 *
 * State:
 *   normalizeState.status = 'pending'  — changes detected, not yet normalized
 *   normalizeState.status = 'resolved' — clean (no changes or all normalized)
 *   Resolved automatically by next approve build.
 */

import fs   from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { loadConfig, saveConfig, readArtifact, appendEvent, writeLastSession } from '../state.js';
import { getBlockingBugs } from './bug.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/reviewer.js';
import { render } from '../prompts/render.js';
import { readStdinSync } from '../read-stdin.js';
import { isBehavioralFile } from '../normalize-patterns.js';

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
    isBehavioralFile(f)
  );
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
  const ns     = config.normalizeState;
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
// Closes the normalize cycle for maintenance changes (refactor / already-registered
// bug-fix) without cascading phase 5. Mechanical gates + human TTY gate back the
// assertion "these changes are accounted for."

function cmdNormalizeResolve({ dir, config, err }) {
  const ns = config.normalizeState;
  if (ns?.status !== 'pending') {
    process.stderr.write(
      `[aitri] Nothing to resolve — normalize is not in pending state.\n` +
      `  Run 'aitri normalize' first to detect changes.\n`
    );
    process.exit(1);
  }

  const { files, currentRef, method } = detectChanges(dir, config);

  if (files.length === 0) {
    config.normalizeState = { baseRef: currentRef, method, status: 'resolved', lastRun: new Date().toISOString() };
    appendEvent(config, 'normalize-resolved', null, { files: 0, method, auto: true });
    writeLastSession(config, dir, 'normalize --resolve');
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
      `\n  Fix and verify these bugs before resolving normalize.\n`
    );
    process.exit(1);
  }

  // Human TTY gate — explicit assertion that all detected changes are
  // refactor or already-registered bug-fix (no fr-change, no new-feature).
  if (!process.stdin.isTTY) {
    process.stderr.write(
      `\n❌ Cannot resolve non-interactively — human confirmation required.\n` +
      `   Run 'aitri normalize --resolve' in your terminal.\n`
    );
    process.exit(1);
  }

  const bar = '─'.repeat(60);
  process.stdout.write(`\n${bar}\n`);
  process.stdout.write(`Normalize — Resolve pending changes\n`);
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
  config.normalizeState = { baseRef: currentRef, method, status: 'resolved', lastRun: new Date().toISOString() };
  appendEvent(config, 'normalize-resolved', null, {
    files: files.length,
    method,
    baseRefFrom: prevRef,
    baseRefTo:   currentRef,
  });
  writeLastSession(config, dir, 'normalize --resolve');
  saveConfig(dir, config);

  console.log(`\n✅ Normalize resolved — baseline advanced (${files.length} file(s) accounted for).`);
}

// ── Command ───────────────────────────────────────────────────────────────────

/**
 * Escape hatch for brownfield projects whose Phase 4 was approved before v0.1.80
 * (when normalizeState was introduced). Stamps a baseline at the current state so
 * subsequent `aitri normalize` can detect post-P4 code drift. See FEEDBACK.md A4.
 *
 * Refuses to run if normalizeState already exists — investigate before clobbering.
 */
function cmdNormalizeInit({ dir, config, err }) {
  if (!(config.approvedPhases || []).includes(4)) {
    err(
      `Cannot --init: Phase 4 (build) must be approved first.\n` +
      `  A normalize baseline classifies code changes that happen *after* build approval;\n` +
      `  it is meaningless before there is an approved build to compare against.`
    );
  }
  if (config.normalizeState?.baseRef) {
    err(
      `normalizeState already exists (baseRef: ${String(config.normalizeState.baseRef).slice(0, 16)}).\n` +
      `  --init refuses to overwrite an existing baseline. To check drift against it:\n\n` +
      `    aitri normalize\n`
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

  config.normalizeState = {
    baseRef,
    method,
    status:  'resolved',
    lastRun: new Date().toISOString(),
  };
  saveConfig(dir, config);

  const label = method === 'git' ? `git commit ${baseRef.slice(0, 8)}` : `timestamp ${baseRef}`;
  console.log(
    `\n✅ Normalize baseline initialized.\n` +
    `   Method:   ${method}\n` +
    `   Base ref: ${label}\n\n` +
    `   From now on, \`aitri normalize\` will report code changes since this point.\n` +
    `   The baseline advances automatically on the next \`aitri approve 4\`.\n`
  );
}

export function cmdNormalize({ dir, args = [], err }) {
  const config = loadConfig(dir);
  if (!config.aitriVersion) err('Not an Aitri project. Run: aitri init');

  if (args.includes('--init')) {
    cmdNormalizeInit({ dir, config, err });
    return;
  }

  const ns = config.normalizeState;
  if (!ns?.baseRef) {
    const phase4Approved = (config.approvedPhases || []).includes(4);
    const hint = phase4Approved
      ? `  This project's Phase 4 was approved before v0.1.80 (when normalizeState was added).\n` +
        `  To stamp a baseline at the current state, run:\n\n    aitri normalize --init\n`
      : `  A baseline is recorded automatically when you approve build (phase 4).\n` +
        `  Complete the pipeline to Phase 4 first.\n`;
    process.stderr.write(`[aitri] No normalize baseline found.\n${hint}`);
    process.exit(1);
  }

  if (args.includes('--resolve')) {
    cmdNormalizeResolve({ dir, config, err });
    return;
  }

  const { files, currentRef, method } = detectChanges(dir, config);

  if (files.length === 0) {
    config.normalizeState = { ...ns, status: 'resolved', lastRun: new Date().toISOString() };
    saveConfig(dir, config);
    console.log('\n✅ No code changes detected outside pipeline since last build approval.');
    return;
  }

  config.normalizeState = {
    baseRef:  ns.baseRef,   // keep original — updated only on next approve build
    method,
    status:   'pending',
    lastRun:  new Date().toISOString(),
  };
  saveConfig(dir, config);

  const artifactsDir  = config.artifactsDir || '';
  const requirements  = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir) || '(not available)';
  const testCases     = readArtifact(dir, '03_TEST_CASES.json',   artifactsDir) || '(not available)';
  const manifest      = readArtifact(dir, '04_IMPLEMENTATION_MANIFEST.json', artifactsDir) || '(not available)';

  const fileList  = files.map(f => `- ${f}`).join('\n');
  const baseLabel = method === 'git'
    ? `git commit ${ns.baseRef.slice(0, 8)}`
    : `last build approval (${ns.baseRef.slice(0, 16)})`;

  const briefing = render('phases/normalize', {
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
  });

  process.stdout.write(briefing + '\n');
}
