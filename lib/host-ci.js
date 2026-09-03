/**
 * Module: host-ci
 * Purpose: Read-only, pull-based readout of the hosting platform's CI run state,
 *          orchestrated through the PROJECT'S OWN host CLI (`gh`) — never bundled,
 *          never a daemon (CI-VISIBILITY-0906, ADR-087; the WATCH-0718 tombstone
 *          stands: no long-running process in a passive zero-dep CLI).
 *
 *          Field evidence this exists for: two consumer projects carried RED security
 *          workflows for weeks/months (one since June) — the gates fired correctly in
 *          Actions, but nothing in the operator's terminal loop ever showed them, so
 *          they rotted unattended. This module makes that state visible at the moments
 *          the operator already asks "am I ready?" (plain `validate`, `audit security`).
 *
 *          ADVISORY ONLY — never blocks, never mutates, GETs only. A red run does not
 *          mechanically imply a broken build (a scheduled dependency-audit job failing
 *          is exactly the evidenced case), so the judgment stays human; the mechanical
 *          answer for "this check must gate" is declaring it as a project quality_gate.
 *
 *          Degradation is silent-with-reason: no git remote / no `gh` / not
 *          authenticated / offline / timeout all return { checked: false, reason } —
 *          never an error, never an exit-code change.
 */

import { execFileSync } from 'node:child_process';

const PROBE_TIMEOUT_MS = 8000;   // gh over a slow network must never hang validate

function run(execFn, cmd, cmdArgs, dir, timeoutMs) {
  return execFn(cmd, cmdArgs, {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: timeoutMs,
  }).toString().trim();
}

/**
 * Resolve the default branch of origin, degrading to the current branch.
 * `origin/HEAD` may be unset on old clones — that is fine, the current branch is
 * an honest fallback (the operator validates the branch they stand on).
 */
function resolveBranch(execFn, dir, timeoutMs) {
  try {
    const ref = run(execFn, 'git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], dir, timeoutMs);
    if (ref.startsWith('origin/')) return ref.slice('origin/'.length);
  } catch { /* fall through */ }
  try {
    return run(execFn, 'git', ['rev-parse', '--abbrev-ref', 'HEAD'], dir, timeoutMs) || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} dir project root
 * @param {{ execFn?: Function, timeoutMs?: number }} [opts] execFn injectable for tests
 * @returns {{ checked: true, branch: string, failing: Array<{workflow: string, lastRunAt: string|null, event: string|null}>, workflows: number }
 *          | { checked: false, reason: 'no-git'|'no-branch'|'no-gh'|'gh-failed'|'no-runs' }}
 */
export function readHostCiStatus(dir, { execFn = execFileSync, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  try {
    run(execFn, 'git', ['rev-parse', '--git-dir'], dir, timeoutMs);
  } catch {
    return { checked: false, reason: 'no-git' };
  }

  const branch = resolveBranch(execFn, dir, timeoutMs);
  // 'HEAD' = detached head with origin/HEAD unset — there is no branch to query, say so
  // honestly instead of asking gh about a branch literally named HEAD. The '-' guard is
  // defense-in-depth (a hostile clone CAN name a ref '--repo=evil/repo'; today the value
  // position after --branch makes it inert under pflag parsing, but this pins the
  // property against any future refactor that moves the branch to a positional arg).
  if (!branch || branch === 'HEAD' || branch.startsWith('-')) {
    return { checked: false, reason: 'no-branch' };
  }

  let raw;
  try {
    // Read-only listing; --branch scopes to the branch that ships. 30 runs is enough
    // to see every workflow's latest verdict without paginating.
    raw = run(execFn, 'gh',
      ['run', 'list', '--branch', branch, '--limit', '30',
        '--json', 'workflowName,conclusion,createdAt,event,status'],
      dir, timeoutMs);
  } catch {
    // gh missing, unauthenticated, offline, non-GitHub remote, or timed out —
    // all the same honest answer: not checked.
    return { checked: false, reason: 'no-gh' };
  }

  let runs;
  try { runs = JSON.parse(raw); } catch { return { checked: false, reason: 'gh-failed' }; }
  if (!Array.isArray(runs) || runs.length === 0) return { checked: false, reason: 'no-runs' };

  // Newest-first from gh: the FIRST run per workflow WITH A VERDICT decides. In-progress
  // runs have no verdict; neither do cancelled/skipped/neutral/action_required — all fall
  // through to the previous decided run. RED is not only 'failure' (rc.9 adversarial
  // find): a workflow whose latest run TIMED OUT or failed at startup is red in the
  // Actions UI, and counting it "green" is an affirmative false green — the exact rot
  // class this module exists to surface.
  const RED = new Set(['failure', 'timed_out', 'startup_failure']);
  const latestByWorkflow = new Map();
  for (const r of runs) {
    const name = r && typeof r.workflowName === 'string' ? r.workflowName : null;
    if (!name || latestByWorkflow.has(name)) continue;
    if (r.status && r.status !== 'completed') continue;
    if (r.conclusion !== 'success' && !RED.has(r.conclusion)) continue;  // not a verdict
    latestByWorkflow.set(name, r);
  }
  if (latestByWorkflow.size === 0) return { checked: false, reason: 'no-runs' };

  const failing = [];
  for (const [workflow, r] of latestByWorkflow) {
    if (RED.has(r.conclusion)) {
      failing.push({
        workflow,
        lastRunAt: typeof r.createdAt === 'string' ? r.createdAt : null,
        event: typeof r.event === 'string' ? r.event : null,
      });
    }
  }
  return { checked: true, branch, failing, workflows: latestByWorkflow.size };
}

/**
 * Render the advisory lines for plain `validate` output. Pure — testable without gh.
 * Every state prints at least one line: green is one quiet confirmation, not-checked
 * is one honest note — because an unnamed unchecked dimension reads as covered (the
 * Ultron lesson) — and failing states carry the detail + the quality_gate teaching.
 */
export function formatHostCiLines(state) {
  if (!state || state.checked === false) {
    const why = {
      'no-git':    'not a git repository',
      'no-branch': 'no branch resolved',
      'no-gh':     'host CLI (gh) unavailable, unauthenticated, or offline',
      'gh-failed': 'host CLI returned unparseable output',
      'no-runs':   'no completed workflow runs found',
    }[state?.reason] || 'unknown';
    return [`  CI (host): not checked — ${why}`];
  }
  if (state.failing.length === 0) {
    return [`  CI (host): ✓ ${state.workflows} workflow(s) green on ${state.branch}`];
  }
  const lines = [`  ⚠️  CI (host): ${state.failing.length} of ${state.workflows} workflow(s) FAILING on ${state.branch} — advisory, does not block:`];
  for (const f of state.failing) {
    const when = f.lastRunAt ? ` (last run ${f.lastRunAt.slice(0, 10)}${f.event ? `, ${f.event}` : ''})` : '';
    lines.push(`     ✗ ${f.workflow}${when}`);
  }
  lines.push(`     A red gate nobody watches protects no one — fix it, or bring the check into the`);
  lines.push(`     verify spine as a declared quality_gate so it blocks HERE instead of rotting there.`);
  return lines;
}
