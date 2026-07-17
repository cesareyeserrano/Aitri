/**
 * Tests for lib/snapshot.js — buildProjectSnapshot() + helpers.
 * All fixtures live in os.tmpdir() and are cleaned after each test.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import path   from 'node:path';
import os     from 'node:os';

import { saveConfig, hashResultsFile } from '../lib/state.js';
import { getBlockingBugs } from '../lib/commands/bug.js';
import {
  buildProjectSnapshot,
  buildPipelineEntry,
  daysSince,
  detectUncountedChanges,
  SNAPSHOT_VERSION,
} from '../lib/snapshot.js';
import { execSync } from 'node:child_process';

const MS_PER_DAY = 86_400_000;

// ── Fixture helpers ──────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-snapshot-test-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function writeSpec(dir, filename, content) {
  const spec = path.join(dir, 'spec');
  fs.mkdirSync(spec, { recursive: true });
  fs.writeFileSync(path.join(spec, filename), content);
}

function writeJsonSpec(dir, filename, data) {
  writeSpec(dir, filename, JSON.stringify(data, null, 2));
}

/**
 * Build a realistic root project with all 5 core phases approved, verify passed,
 * and artifacts present. Used as the base for deployable-related tests.
 */
function seedDeployableRoot(dir, overrides = {}) {
  saveConfig(dir, {
    projectName:     'demo',
    aitriVersion:    '0.1.76',
    artifactsDir:    'spec',
    approvedPhases:  [1, 2, 3, 4, 5],
    completedPhases: [1, 2, 3, 4, 5],
    verifyPassed:    true,
    verifySummary:   { passed: 10, failed: 0, skipped: 0, total: 10 },
    ...overrides,
  });
  writeJsonSpec(dir, '01_REQUIREMENTS.json', {
    project_name: 'demo',
    functional_requirements:     [{ id: 'FR-001', priority: 'MUST', type: 'logic', title: 'Do the thing', acceptance_criteria: ['AC1'] }],
    non_functional_requirements: [],
    user_stories: [],
  });
  writeSpec(dir, '02_SYSTEM_DESIGN.md', '# System Design\n\nLine 1\nLine 2\n');
  writeJsonSpec(dir, '03_TEST_CASES.json', { test_cases: [] });
  writeJsonSpec(dir, '04_BUILD_REPORT.json', {
    modules: [], files_created: ['a.js'], setup_commands: [], technical_debt: [],
  });
  writeJsonSpec(dir, '04_TEST_RESULTS.json', {
    summary: { passed: 10, failed: 0, skipped: 0, total: 10 },
    fr_coverage: [{ fr_id: 'FR-001', status: 'covered', tests_passing: 3, tests_failing: 0 }],
  });
  writeJsonSpec(dir, '05_TRACEABILITY.json', { requirement_compliance: [] });
  fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Idea\n');
}

// ── daysSince() ──────────────────────────────────────────────────────────────

describe('daysSince()', () => {
  it('returns null for falsy or invalid input', () => {
    assert.equal(daysSince(null), null);
    assert.equal(daysSince(undefined), null);
    assert.equal(daysSince('not-a-date'), null);
  });

  it('computes floor days from ISO string', () => {
    const now = Date.UTC(2026, 3, 17); // 2026-04-17
    const past = new Date(now - 10 * MS_PER_DAY).toISOString();
    assert.equal(daysSince(past, now), 10);
  });

  it('accepts ms epoch input', () => {
    const now = Date.now();
    assert.equal(daysSince(now - 3 * MS_PER_DAY, now), 3);
  });

  it('floors negatives to 0 (future timestamps)', () => {
    const now = Date.now();
    assert.equal(daysSince(now + 5 * MS_PER_DAY, now), 0);
  });
});

// ── buildProjectSnapshot — basic ─────────────────────────────────────────────

describe('buildProjectSnapshot()', () => {
  it('throws when .aitri does not exist', () => {
    const dir = tmpDir();
    try {
      assert.throws(() => buildProjectSnapshot(dir), /Not an Aitri project/);
    } finally { cleanup(dir); }
  });

  it('returns snapshot with SNAPSHOT_VERSION and generatedAt', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      const snap = buildProjectSnapshot(dir, { now: Date.UTC(2026, 3, 17) });
      assert.equal(snap.snapshotVersion, SNAPSHOT_VERSION);
      assert.equal(snap.generatedAt, '2026-04-17T00:00:00.000Z');
    } finally { cleanup(dir); }
  });

  it('fresh project → all phases not_started, nextAction is run-phase requirements', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'fresh', artifactsDir: 'spec' });
      const snap = buildProjectSnapshot(dir);
      const root = snap.pipelines.find(p => p.scopeType === 'root');
      assert.ok(root);
      const core = root.phases.filter(p => !p.optional);
      assert.equal(core.length, 5);
      for (const p of core) assert.equal(p.status, 'not_started');
      assert.equal(snap.nextActions[0].command, 'aitri run-phase requirements');
    } finally { cleanup(dir); }
  });

  it('ADV-29: requirements approved + UX FRs present → next action is run-phase ux, not architecture', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'uxproj', artifactsDir: 'spec', approvedPhases: [1], completedPhases: [1] });
      writeJsonSpec(dir, '01_REQUIREMENTS.json', {
        project_name: 'uxproj',
        functional_requirements: [
          { id: 'FR-001', title: 'Screen', priority: 'MUST', type: 'ux', acceptance_criteria: ['x'] },
        ],
        non_functional_requirements: [],
      });
      const snap = buildProjectSnapshot(dir);
      const cmds = snap.nextActions.map(a => a.command);
      assert.ok(cmds.includes('aitri run-phase ux'),
        'ladder must agree with the approve-1 message and steer to the UX phase');
      assert.ok(!cmds.includes('aitri run-phase architecture'),
        'must NOT point straight at architecture when UX is required');
    } finally { cleanup(dir); }
  });

  it('ADV-29: UX in progress → next action is complete ux, not a run-phase loop', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'uxip', artifactsDir: 'spec', approvedPhases: [1], completedPhases: [1] });
      writeJsonSpec(dir, '01_REQUIREMENTS.json', {
        project_name: 'uxip',
        functional_requirements: [{ id: 'FR-001', title: 'Screen', priority: 'MUST', type: 'ux', acceptance_criteria: ['x'] }],
        non_functional_requirements: [],
      });
      writeSpec(dir, '01_UX_SPEC.md', '# UX\n');   // artifact on disk → ux in_progress
      const snap = buildProjectSnapshot(dir);
      const cmds = snap.nextActions.map(a => a.command);
      assert.ok(cmds.includes('aitri complete ux'), 'an in-progress UX phase must route to complete ux');
      assert.ok(!cmds.includes('aitri run-phase ux'), 'must NOT loop back to run-phase ux once UX has started');
    } finally { cleanup(dir); }
  });

  it('ADV-29: UX completed → next action is approve ux', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'uxdone', artifactsDir: 'spec', approvedPhases: [1], completedPhases: [1, 'ux'] });
      writeJsonSpec(dir, '01_REQUIREMENTS.json', {
        project_name: 'uxdone',
        functional_requirements: [{ id: 'FR-001', title: 'Screen', priority: 'MUST', type: 'ux', acceptance_criteria: ['x'] }],
        non_functional_requirements: [],
      });
      writeSpec(dir, '01_UX_SPEC.md', '# UX\n');
      const snap = buildProjectSnapshot(dir);
      const cmds = snap.nextActions.map(a => a.command);
      assert.ok(cmds.includes('aitri approve ux'), 'a completed UX phase must route to approve ux');
      assert.ok(!cmds.includes('aitri run-phase ux'), 'must NOT loop back to run-phase ux');
    } finally { cleanup(dir); }
  });

  it('ADV-29: UX approved → ladder proceeds to architecture', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'uxok', artifactsDir: 'spec', approvedPhases: [1, 'ux'], completedPhases: [1, 'ux'] });
      writeJsonSpec(dir, '01_REQUIREMENTS.json', {
        project_name: 'uxok',
        functional_requirements: [{ id: 'FR-001', title: 'Screen', priority: 'MUST', type: 'ux', acceptance_criteria: ['x'] }],
        non_functional_requirements: [],
      });
      writeSpec(dir, '01_UX_SPEC.md', '# UX\n');
      const snap = buildProjectSnapshot(dir);
      const cmds = snap.nextActions.map(a => a.command);
      assert.ok(cmds.includes('aitri run-phase architecture'), 'once UX is approved, architecture is next');
      assert.ok(!cmds.includes('aitri run-phase ux') && !cmds.includes('aitri complete ux'),
        'must not re-steer to the UX phase once it is approved');
    } finally { cleanup(dir); }
  });

  it('ADV-29: no UX FRs → ladder steers to architecture as before', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'noux', artifactsDir: 'spec', approvedPhases: [1], completedPhases: [1] });
      writeJsonSpec(dir, '01_REQUIREMENTS.json', {
        project_name: 'noux',
        functional_requirements: [{ id: 'FR-001', title: 'Logic', priority: 'MUST', type: 'core', acceptance_criteria: ['x'] }],
        non_functional_requirements: [],
      });
      const snap = buildProjectSnapshot(dir);
      const cmds = snap.nextActions.map(a => a.command);
      assert.ok(cmds.includes('aitri run-phase architecture'), 'no UX FRs → architecture is next');
      assert.ok(!cmds.includes('aitri run-phase ux'), 'must not steer to UX when no UX FRs exist');
    } finally { cleanup(dir); }
  });

  it('reflects approved/completed/in_progress/not_started per phase', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'mid', artifactsDir: 'spec',
        approvedPhases:  [1, 2],
        completedPhases: [1, 2, 3],
      });
      writeJsonSpec(dir, '03_TEST_CASES.json', { test_cases: [] });
      writeJsonSpec(dir, '04_BUILD_REPORT.json', { files_created: ['x'], technical_debt: [] });
      const snap = buildProjectSnapshot(dir);
      const phases = snap.pipelines[0].phases.filter(p => !p.optional);
      const byKey = Object.fromEntries(phases.map(p => [p.key, p.status]));
      assert.equal(byKey[1], 'approved');
      assert.equal(byKey[2], 'approved');
      assert.equal(byKey[3], 'completed');   // completed but not approved, artifact present
      assert.equal(byKey[4], 'in_progress'); // artifact present, not tracked
      assert.equal(byKey[5], 'not_started');
    } finally { cleanup(dir); }
  });

  it('no-op loop guard survives event-log eviction via lastVerifyRun (state-hunt #3)', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'g', artifactsDir: 'spec',
        approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
        verifyPassed: false,
        // The verify-run event was evicted by the 20-event cap, but the
        // first-class field persists the all-skip result.
        lastVerifyRun: { passed: 0, failed: 0, skipped: 3, manual: 0, at: '2026-01-01T00:00:00.000Z' },
        events: [],
      });
      writeJsonSpec(dir, '03_TEST_CASES.json', { test_cases: [] });
      writeJsonSpec(dir, '04_BUILD_REPORT.json', { files_created: ['x'], technical_debt: [] });
      const snap = buildProjectSnapshot(dir);
      const cmds = snap.nextActions.map(a => a.command);
      assert.ok(cmds.includes('aitri verify-complete'),
        'guard must route to verify-complete from lastVerifyRun even with no verify-run event');
      assert.ok(!cmds.includes('aitri verify-run'),
        'must NOT re-loop to verify-run after an all-skip run');
    } finally { cleanup(dir); }
  });

  it('all-manual seed → next action is tc verify, not a verify-run loop (FB-MULTI-0619 #2)', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'm', artifactsDir: 'spec',
        approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
        verifyPassed: false,
        // verify-run seeded manual results: all manual-pending, nothing automated.
        lastVerifyRun: { passed: 0, failed: 0, skipped: 0, manual: 4, at: '2026-01-01T00:00:00.000Z' },
        events: [],
      });
      writeJsonSpec(dir, '03_TEST_CASES.json', { test_cases: [] });
      writeJsonSpec(dir, '04_BUILD_REPORT.json', { files_created: ['x'], technical_debt: [] });
      const snap = buildProjectSnapshot(dir);
      const cmds = snap.nextActions.map(a => a.command);
      assert.ok(cmds.includes('aitri tc verify'),
        'pending manual TCs (0 automated) must route to tc verify, not loop on verify-run');
      assert.ok(!cmds.includes('aitri verify-run'),
        'must NOT re-loop to verify-run when there is no automated runner to re-run');
    } finally { cleanup(dir); }
  });

  it('marks phase.drift = true when driftPhases includes the key', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'drift', artifactsDir: 'spec',
        approvedPhases: [1, 2],
        driftPhases:    ['2'],
      });
      const snap = buildProjectSnapshot(dir);
      const p2 = snap.pipelines[0].phases.find(p => p.key === 2);
      assert.equal(p2.drift, true);
      assert.equal(snap.health.deployable, false);
      assert.ok(snap.health.driftPresent.some(d => d.scope === 'root' && d.phase === 'architecture'));
    } finally { cleanup(dir); }
  });
});

// ── C5a — drift next-action steers by drift kind (rehash vs human approve) ────
// `approve` is isTTY-gated and hard-blocks an agent. Bookkeeping drift (artifact
// matches git HEAD) routes to `rehash` (agent-runnable); a real content change —
// or git unavailable — routes to `approve` with a human-terminal note.
describe('nextActions — drift kind steering (C5a)', () => {
  function initGitRepo(dir) {
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email "t@t"', { cwd: dir });
    execSync('git config user.name "t"', { cwd: dir });
    execSync('git add -A && git commit -q -m "init"', { cwd: dir });
  }

  it('bookkeeping drift (artifact matches git HEAD) → rehash, not approve', () => {
    const dir = tmpDir();
    try {
      writeSpec(dir, '02_SYSTEM_DESIGN.md', '# System Design\n\nLine 1\nLine 2\n');
      saveConfig(dir, {
        projectName: 'drift', artifactsDir: 'spec',
        approvedPhases: [1, 2], driftPhases: ['2'],
      });
      initGitRepo(dir);   // artifact committed → git diff HEAD is empty
      const snap = buildProjectSnapshot(dir);
      const action = snap.nextActions.find(a => a.priority === 2);
      assert.ok(action, 'a priority-2 drift action must exist');
      assert.equal(action.command, 'aitri rehash architecture');
      assert.match(action.reason, /bookkeeping/i);
    } finally { cleanup(dir); }
  });

  it('real content change → approve with human-terminal note', () => {
    const dir = tmpDir();
    try {
      writeSpec(dir, '02_SYSTEM_DESIGN.md', '# System Design\n\nLine 1\nLine 2\n');
      saveConfig(dir, {
        projectName: 'drift', artifactsDir: 'spec',
        approvedPhases: [1, 2], driftPhases: ['2'],
      });
      initGitRepo(dir);
      // Edit the artifact AFTER committing → git diff HEAD is non-empty.
      writeSpec(dir, '02_SYSTEM_DESIGN.md', '# System Design\n\nLine 1\nLine 2\nEDITED\n');
      const snap = buildProjectSnapshot(dir);
      const action = snap.nextActions.find(a => a.priority === 2);
      assert.ok(action, 'a priority-2 drift action must exist');
      assert.equal(action.command, 'aitri approve architecture');
      assert.match(action.reason, /human terminal/i);
    } finally { cleanup(dir); }
  });

  it('git unavailable → conservative approve (human terminal), never rehash', () => {
    const dir = tmpDir();   // not a git repo
    try {
      writeSpec(dir, '02_SYSTEM_DESIGN.md', '# System Design\n\nLine 1\nLine 2\n');
      saveConfig(dir, {
        projectName: 'drift', artifactsDir: 'spec',
        approvedPhases: [1, 2], driftPhases: ['2'],
      });
      const snap = buildProjectSnapshot(dir);
      const action = snap.nextActions.find(a => a.priority === 2);
      assert.ok(action, 'a priority-2 drift action must exist');
      assert.equal(action.command, 'aitri approve architecture');
      assert.match(action.reason, /human terminal/i);
    } finally { cleanup(dir); }
  });

  it('untracked artifact (never committed) → approve, NOT rehash', () => {
    const dir = tmpDir();
    try {
      writeSpec(dir, '02_SYSTEM_DESIGN.md', '# System Design\n\nLine 1\nLine 2\n');
      saveConfig(dir, {
        projectName: 'drift', artifactsDir: 'spec',
        approvedPhases: [1, 2], driftPhases: ['2'],
      });
      // git repo, but the artifact is NOT committed (untracked). `git diff HEAD`
      // would be empty (false-clean) — the tracked-check must prevent rehash.
      execSync('git init -q', { cwd: dir });
      execSync('git config user.email "t@t"', { cwd: dir });
      execSync('git config user.name "t"', { cwd: dir });
      const snap = buildProjectSnapshot(dir);
      const action = snap.nextActions.find(a => a.priority === 2);
      assert.ok(action, 'a priority-2 drift action must exist');
      assert.equal(action.command, 'aitri approve architecture',
        'untracked artifact must not be treated as bookkeeping-clean');
    } finally { cleanup(dir); }
  });

  it('feature-scope bookkeeping drift → feature rehash command', () => {
    const dir = tmpDir();
    try {
      // Root pipeline (clean, fully approved) so only the feature drifts.
      seedDeployableRoot(dir);
      const featDir = path.join(dir, 'features', 'billing');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(featDir, 'spec', '02_SYSTEM_DESIGN.md'), '# Feat Design\n\nx\ny\n');
      saveConfig(featDir, {
        projectName: 'billing', artifactsDir: 'spec',
        approvedPhases: [1, 2], driftPhases: ['2'],
      });
      initGitRepo(dir);   // commits root + feature artifact together
      const snap = buildProjectSnapshot(dir);
      const action = snap.nextActions.find(a => a.scope === 'feature:billing' && a.priority === 2);
      assert.ok(action, 'a feature priority-2 drift action must exist');
      assert.equal(action.command, 'aitri feature rehash billing architecture');
    } finally { cleanup(dir); }
  });
});

// ── C5b — in_progress next-action: re-derive (cascade-reset) vs complete ──────
// An artifact reset by a cascade (real upstream change) must be RE-DERIVED with
// the new context (`run-phase`); `complete` would only re-validate and could
// launder a stale downstream artifact. A genuinely mid-authored phase (never
// approved) still routes to `complete`.
describe('nextActions — cascade-reset vs mid-authoring in_progress (C5b)', () => {
  function seedPhase2InProgress(dir, extra = {}) {
    // Phase 1 approved; phase 2 artifact on disk but NOT approved/completed → in_progress.
    saveConfig(dir, {
      projectName: 'p', artifactsDir: 'spec',
      approvedPhases: [1], completedPhases: [1],
      ...extra,
    });
    writeJsonSpec(dir, '01_REQUIREMENTS.json', {
      project_name: 'p',
      functional_requirements:     [{ id: 'FR-001', priority: 'MUST', type: 'logic', title: 't', acceptance_criteria: ['AC1'] }],
      non_functional_requirements: [], user_stories: [],
    });
    writeSpec(dir, '02_SYSTEM_DESIGN.md', '# Design\n\nx\ny\n');
  }

  it('cascade-pending in_progress phase → run-phase (re-derive), not complete', () => {
    const dir = tmpDir();
    try {
      seedPhase2InProgress(dir, { cascadedPhases: ['2'] });
      const snap = buildProjectSnapshot(dir);
      const p2 = snap.pipelines[0].phases.find(p => p.key === 2);
      assert.equal(p2.cascadePending, true, 'phase 2 must be flagged cascadePending');
      const action = snap.nextActions.find(a => a.command.includes('architecture'));
      assert.equal(action.command, 'aitri run-phase architecture');
      assert.match(action.reason, /upstream change|re-run/i);
    } finally { cleanup(dir); }
  });

  it('mid-authoring in_progress phase (no cascade mark) → complete (regression lock)', () => {
    const dir = tmpDir();
    try {
      seedPhase2InProgress(dir);   // no cascadedPhases
      const snap = buildProjectSnapshot(dir);
      const p2 = snap.pipelines[0].phases.find(p => p.key === 2);
      assert.equal(p2.cascadePending, false);
      const action = snap.nextActions.find(a => a.command.includes('architecture'));
      assert.equal(action.command, 'aitri complete architecture');
    } finally { cleanup(dir); }
  });
});

// ── Deployability / health ───────────────────────────────────────────────────

describe('health.deployable', () => {
  it('is true when all core approved + verify passed + no drift + no bugs + version ok', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      assert.equal(snap.health.deployable, true);
      assert.deepEqual(snap.health.deployableReasons, []);
    } finally { cleanup(dir); }
  });

  // ── UPLAN-0703 B3: run-binding re-check against disk ──────────────────────
  // Helper: stamp the seeded results file so its binding is 'bound'.
  function stampRoot(dir) {
    const rp = path.join(dir, 'spec', '04_TEST_RESULTS.json');
    const cp = path.join(dir, '.aitri');
    const cfg = JSON.parse(fs.readFileSync(cp, 'utf8'));
    cfg.verifyResultsHash = hashResultsFile(fs.readFileSync(rp, 'utf8'));
    fs.writeFileSync(cp, JSON.stringify(cfg));
  }

  it('B3: resultsBinding is "bound" and deploy stays open when the stamped file is unchanged', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      stampRoot(dir);
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      const root = snap.pipelines.find(p => p.scopeType === 'root');
      assert.equal(root.verify.resultsBinding, 'bound');
      assert.equal(snap.health.deployable, true);
    } finally { cleanup(dir); }
  });

  it('B3: a results file edited after the run → mismatch blocks deploy though verifyPassed is sticky-true', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);        // verifyPassed: true
      stampRoot(dir);                 // bind it
      // Rewrite the results file AFTER the run — the sticky flag would hide this.
      const rp = path.join(dir, 'spec', '04_TEST_RESULTS.json');
      const res = JSON.parse(fs.readFileSync(rp, 'utf8'));
      res.summary = { passed: 999, failed: 0, skipped: 0, total: 999 };
      fs.writeFileSync(rp, JSON.stringify(res));
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      const root = snap.pipelines.find(p => p.scopeType === 'root');
      assert.equal(root.verify.resultsBinding, 'mismatch');
      assert.equal(root.verify.passed, true, 'the sticky flag is still true — the point is health no longer trusts it alone');
      assert.equal(snap.health.deployable, false);
      assert.ok(snap.health.deployableReasons.some(r => r.type === 'results_tampered'));
    } finally { cleanup(dir); }
  });

  it('B3: a stamped-but-deleted results file → missing-file blocks deploy', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      stampRoot(dir);
      fs.rmSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'));
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      const root = snap.pipelines.find(p => p.scopeType === 'root');
      assert.equal(root.verify.resultsBinding, 'missing-file');
      assert.equal(snap.health.deployable, false);
      assert.ok(snap.health.deployableReasons.some(r => r.type === 'results_missing'));
    } finally { cleanup(dir); }
  });

  it('B3 follow-up: a terminal feature (5/5, verify passed) with a tampered results file blocks root deploy', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      stampRoot(dir);
      // Terminal feature, verify passed, results file bound then edited after its run.
      const featDir = path.join(dir, 'features', 'sneaky');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      const featResults = JSON.stringify({ summary: { passed: 4, failed: 0, total: 4 }, fr_coverage: [], results: [] });
      fs.writeFileSync(path.join(featDir, 'spec', '04_TEST_RESULTS.json'), featResults);
      saveConfig(featDir, {
        projectName: 'sneaky', artifactsDir: 'spec',
        approvedPhases: [1, 2, 3, 4, 5], completedPhases: [1, 2, 3, 4, 5],
        verifyPassed: true, verifySummary: { passed: 4, failed: 0, total: 4 },
        verifyResultsHash: hashResultsFile(featResults),
      });
      // Post-run rewrite of the feature's results file.
      fs.writeFileSync(path.join(featDir, 'spec', '04_TEST_RESULTS.json'),
        JSON.stringify({ summary: { passed: 999, failed: 0, total: 999 }, fr_coverage: [], results: [] }));
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      const feat = snap.pipelines.find(p => p.scopeName === 'sneaky');
      assert.equal(feat.verify.resultsBinding, 'mismatch');
      assert.equal(snap.health.deployable, false);
      const reason = snap.health.deployableReasons.find(r => r.type === 'feature_results_tampered');
      assert.ok(reason, 'feature_results_tampered reason must be present');
      assert.deepEqual(reason.features, ['sneaky']);
    } finally { cleanup(dir); }
  });

  it('B7: an approved artifact deleted from disk blocks deploy (artifact_missing) though approval stands', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      stampRoot(dir);
      fs.rmSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'));
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      const root = snap.pipelines.find(p => p.scopeType === 'root');
      const p1 = root.phases.find(p => p.key === 1);
      assert.equal(p1.status, 'approved', 'the approval state fact is preserved — existence is reported separately');
      assert.equal(p1.exists, false);
      assert.equal(snap.health.deployable, false);
      const reason = snap.health.deployableReasons.find(r => r.type === 'artifact_missing');
      assert.ok(reason, 'artifact_missing reason must be present');
      assert.match(reason.message, /01_REQUIREMENTS\.json/);
      // The P2 next-action must stay inside the documented severity enum
      // (STATUS_JSON.md: info|warn|critical) — rc.149 shipped an out-of-contract 'blocker' here.
      const action = snap.nextActions.find(a => a.priority === 2 && a.command === 'aitri validate');
      assert.ok(action, 'artifact_missing must surface a priority-2 next-action');
      assert.equal(action.severity, 'critical');
      for (const a of snap.nextActions)
        assert.ok(['info', 'warn', 'critical'].includes(a.severity),
          `nextActions severity '${a.severity}' is outside the documented enum (${a.command})`);
    } finally { cleanup(dir); }
  });

  it('B3: a stamp-less legacy project keeps its prior deployable verdict (no-stamp is not a new block)', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);        // no stamp written
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      const root = snap.pipelines.find(p => p.scopeType === 'root');
      assert.equal(root.verify.resultsBinding, 'no-stamp');
      assert.equal(snap.health.deployable, true, 'health does not retroactively block a stamp-less project — B1 owns that gate at verify-complete');
    } finally { cleanup(dir); }
  });

  it('is false with verify_not_passed when verify has not passed', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir, { verifyPassed: false, verifySummary: null });
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      assert.equal(snap.health.deployable, false);
      assert.ok(snap.health.deployableReasons.some(r => r.type === 'verify_not_passed'));
    } finally { cleanup(dir); }
  });

  it('is false when blocking bugs exist', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      writeJsonSpec(dir, 'BUGS.json', {
        bugs: [{ id: 'BG-001', title: 'crash', severity: 'critical', status: 'open' }],
      });
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      assert.equal(snap.health.deployable, false);
      assert.equal(snap.health.blockedByBugs, true);
      assert.equal(snap.bugs.blocking, 1);
      assert.ok(snap.health.deployableReasons.some(r => r.type === 'blocking_bugs'));
    } finally { cleanup(dir); }
  });

  it('is false when reconcileState is pending', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir, { reconcileState: { status: 'pending' } });
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      assert.equal(snap.health.deployable, false);
      assert.ok(snap.health.deployableReasons.some(r => r.type === 'reconcile_pending'));
    } finally { cleanup(dir); }
  });

  it('stays true when a terminal-state feature has verify passed', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      const featDir = path.join(dir, 'features', 'ok');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      saveConfig(featDir, {
        projectName:     'ok',
        artifactsDir:    'spec',
        approvedPhases:  [1, 2, 3, 4, 5],
        completedPhases: [1, 2, 3, 4, 5],
        verifyPassed:    true,
        verifySummary:   { passed: 4, failed: 0, total: 4 },
      });
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      assert.equal(snap.health.deployable, true);
      assert.ok(!snap.health.deployableReasons.some(r => r.type === 'feature_verify_failed'));
    } finally { cleanup(dir); }
  });

  it('is false with feature_verify_failed when a feature at 5/5 has verify failed', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      const featDir = path.join(dir, 'features', 'frontend-remediation');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      saveConfig(featDir, {
        projectName:     'frontend-remediation',
        artifactsDir:    'spec',
        approvedPhases:  [1, 2, 3, 4, 5],
        completedPhases: [1, 2, 3, 4, 5],
        verifyPassed:    false,
        verifySummary:   { passed: 0, failed: 44, total: 44 },
      });
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      assert.equal(snap.health.deployable, false);
      const reason = snap.health.deployableReasons.find(r => r.type === 'feature_verify_failed');
      assert.ok(reason, 'feature_verify_failed reason must be present');
      assert.deepEqual(reason.features, ['frontend-remediation']);
      assert.ok(reason.message.includes('frontend-remediation'));
    } finally { cleanup(dir); }
  });

  it('does not block on features still in progress (phases < 5/5, verify failed)', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      const featDir = path.join(dir, 'features', 'wip');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      saveConfig(featDir, {
        projectName:     'wip',
        artifactsDir:    'spec',
        approvedPhases:  [1, 2, 3],
        completedPhases: [1, 2, 3],
        verifyPassed:    false,
        verifySummary:   { passed: 2, failed: 3, total: 5 },
      });
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      assert.equal(snap.health.deployable, true, 'WIP feature must not block root deploy');
      assert.ok(!snap.health.deployableReasons.some(r => r.type === 'feature_verify_failed'));
    } finally { cleanup(dir); }
  });
});

// ── Version mismatch ─────────────────────────────────────────────────────────

describe('version handling', () => {
  it('nextAction[0] is adopt --upgrade on version mismatch', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir, { aitriVersion: '0.1.50' });
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      assert.equal(snap.project.versionMismatch, true);
      assert.equal(snap.nextActions[0].command, 'aitri adopt --upgrade');
      assert.equal(snap.nextActions[0].priority, 1);
    } finally { cleanup(dir); }
  });

  it('versionMissing is true when project has no aitriVersion but cliVersion is given', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'no-version', artifactsDir: 'spec' });
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      assert.equal(snap.project.versionMissing, true);
      assert.ok(snap.nextActions.some(a => a.command === 'aitri adopt --upgrade'));
    } finally { cleanup(dir); }
  });
});

// ── Features ─────────────────────────────────────────────────────────────────

describe('feature sub-pipelines', () => {
  it('discovers features and aggregates their state', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'root', artifactsDir: 'spec' });
      const featDir = path.join(dir, 'features', 'payments');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      saveConfig(featDir, { projectName: 'payments', artifactsDir: 'spec', approvedPhases: [1] });

      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.pipelines.length, 2);
      const feature = snap.pipelines.find(p => p.scopeType === 'feature');
      assert.equal(feature.scope, 'feature:payments');
      assert.equal(feature.scopeName, 'payments');
      assert.ok(feature.phases.find(p => p.key === 1).status === 'approved');
      assert.equal(snap.health.activeFeatures, 1);
    } finally { cleanup(dir); }
  });

  it('silently ignores orphan feature directories (no .aitri)', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'root', artifactsDir: 'spec' });
      fs.mkdirSync(path.join(dir, 'features', 'orphan'), { recursive: true });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.pipelines.length, 1);
      assert.equal(snap.pipelines[0].scopeType, 'root');
    } finally { cleanup(dir); }
  });

  it('aggregates requirements across pipelines', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir);
      const featDir = path.join(dir, 'features', 'auth');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      saveConfig(featDir, { projectName: 'auth', artifactsDir: 'spec' });
      writeJsonSpec(featDir, '01_REQUIREMENTS.json', {
        project_name: 'auth',
        functional_requirements:     [{ id: 'FR-A1', priority: 'MUST', type: 'security', title: 'JWT' }],
        non_functional_requirements: [],
        user_stories: [],
      });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.requirements.total, 2);
      assert.ok(snap.requirements.openFRs.some(fr => fr.id === 'FR-001' && fr.scope === 'root'));
      assert.ok(snap.requirements.openFRs.some(fr => fr.id === 'FR-A1'  && fr.scope === 'feature:auth'));
    } finally { cleanup(dir); }
  });

  it('aggregates bugs across pipelines', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'root', artifactsDir: 'spec' });
      writeJsonSpec(dir, 'BUGS.json', { bugs: [{ id: 'BG-001', title: 'x', severity: 'low', status: 'open' }] });

      const featDir = path.join(dir, 'features', 'foo');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      saveConfig(featDir, { projectName: 'foo', artifactsDir: 'spec' });
      writeJsonSpec(featDir, 'BUGS.json', { bugs: [{ id: 'BG-010', title: 'crash', severity: 'critical', status: 'open' }] });

      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.bugs.total, 2);
      assert.equal(snap.bugs.open, 2);
      assert.equal(snap.bugs.blocking, 1);
      assert.equal(snap.bugs.byPipeline['root'], 1);
      assert.equal(snap.bugs.byPipeline['feature:foo'], 1);
    } finally { cleanup(dir); }
  });
});

// ── Bugs payload (Hub per-severity, 2026-05-12) ──────────────────────────────
// Closes BACKLOG "Pre-promotion findings" P2: status --json bugs payload too
// narrow — Hub cannot derive per-severity counts or open IDs from documented
// contract. aggregateBugs internal shape was rich but status.js:308 filtered
// to {total, open, blocking}; new bySeverity + openIds fields are additive.

describe('aggregateBugs() — bySeverity + openIds (2026-05-12)', () => {
  it('counts open + in_progress per severity; excludes fixed/closed', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      writeJsonSpec(dir, 'BUGS.json', {
        bugs: [
          { id: 'BG-001', severity: 'critical', status: 'open' },
          { id: 'BG-002', severity: 'high',     status: 'in_progress' },
          { id: 'BG-003', severity: 'medium',   status: 'open' },
          { id: 'BG-004', severity: 'low',      status: 'open' },
          { id: 'BG-005', severity: 'critical', status: 'fixed' },   // excluded (active-only)
          { id: 'BG-006', severity: 'high',     status: 'verified' }, // excluded
          { id: 'BG-007', severity: 'medium',   status: 'closed' },   // excluded
        ],
      });
      const snap = buildProjectSnapshot(dir);
      assert.deepEqual(snap.bugs.bySeverity, { critical: 1, high: 1, medium: 1, low: 1 },
        'bySeverity counts active-only (open + in_progress); fixed/verified/closed excluded');
      assert.equal(snap.bugs.blocking, 2, 'blocking still counts critical+high active');
    } finally { cleanup(dir); }
  });

  it('openIds lists active bug IDs sorted ascending', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      writeJsonSpec(dir, 'BUGS.json', {
        bugs: [
          { id: 'BG-039', severity: 'medium', status: 'open' },
          { id: 'BG-037', severity: 'low',    status: 'open' },
          { id: 'BG-100', severity: 'high',   status: 'closed' },  // excluded
        ],
      });
      const snap = buildProjectSnapshot(dir);
      assert.deepEqual(snap.bugs.openIds, ['BG-037', 'BG-039'],
        'openIds sorted ascending; closed/fixed excluded');
    } finally { cleanup(dir); }
  });

  it('empty BUGS.json → bySeverity all zero + openIds empty array', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      const snap = buildProjectSnapshot(dir);
      assert.deepEqual(snap.bugs.bySeverity, { critical: 0, high: 0, medium: 0, low: 0 });
      assert.deepEqual(snap.bugs.openIds, []);
      assert.deepEqual(snap.bugs.parseErrors, [], 'no bug file anywhere → no parse errors (rc.158)');
    } finally { cleanup(dir); }
  });

  it('rc.158: a corrupt BUGS.json is flagged in bugs.parseErrors instead of silently counting zero', () => {
    // INTEG-0704 #2: the display surface degrades malformed → [] by design (rc.149 — the
    // GATES refuse), but degrading silently left a machine consumer (Hub) unable to tell
    // "no bugs" from "corrupt bug file" while health could read deployable.
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'root', artifactsDir: 'spec' });
      writeSpec(dir, 'BUGS.json', '{ "bugs": [ { "id": "BG-001", broken');  // exists, unreadable

      const featDir = path.join(dir, 'features', 'ok');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      saveConfig(featDir, { projectName: 'ok', artifactsDir: 'spec' });
      writeJsonSpec(featDir, 'BUGS.json', { bugs: [{ id: 'BG-010', title: 'real', severity: 'critical', status: 'open' }] });

      const snap = buildProjectSnapshot(dir);
      assert.deepEqual(snap.bugs.parseErrors, ['root'], 'the corrupt scope is named; readable scopes are not');
      assert.equal(snap.bugs.byPipeline['root'], 0, 'counters still degrade to zero — the flag is the signal, not a guess');
      assert.equal(snap.bugs.blocking, 1, 'readable pipelines keep counting');
    } finally { cleanup(dir); }
  });

  it('rc.158: shape corruption (valid JSON, non-array collection) is flagged like syntax corruption; {} is not', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'root', artifactsDir: 'spec' });
      writeJsonSpec(dir, 'BUGS.json', { bugs: 42 });   // parses fine, hides everything
      let snap = buildProjectSnapshot(dir);
      assert.deepEqual(snap.bugs.parseErrors, ['root'], 'a non-array collection hides bugs exactly like invalid JSON');
      writeJsonSpec(dir, 'BUGS.json', {});             // absent collection key = legitimately empty
      snap = buildProjectSnapshot(dir);
      assert.deepEqual(snap.bugs.parseErrors, [], 'an empty object stays a legitimate empty list');
    } finally { cleanup(dir); }
  });

  it('unknown severity values do not crash and do not increment any counter', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      writeJsonSpec(dir, 'BUGS.json', {
        bugs: [
          { id: 'BG-001', severity: 'trivial', status: 'open' }, // not a documented level
          { id: 'BG-002', severity: 'high',    status: 'open' },
        ],
      });
      const snap = buildProjectSnapshot(dir);
      assert.deepEqual(snap.bugs.bySeverity, { critical: 0, high: 1, medium: 0, low: 0 },
        'unknown severities are silently dropped from the breakdown');
      // Still surfaces in openIds (active by status, even if severity unknown)?
      // Decision: NO — bySeverity gates the openIds push. If severity is unknown,
      // the bug is not in the per-severity bucket and not in openIds either.
      assert.deepEqual(snap.bugs.openIds, ['BG-002']);
    } finally { cleanup(dir); }
  });

  it('AUDIT-0629-B: a capitalized "Critical"/"Open" bug still counts as blocking (deploy-gate case-fold)', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      // BUGS.json is a documented artifact agents/tools write directly — a hand-written capitalized
      // severity/status must not false-pass the deploy gate (blocking=0 → deployable).
      writeJsonSpec(dir, 'BUGS.json', {
        bugs: [{ id: 'BG-001', severity: 'Critical', status: 'Open' }],
      });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.bugs.blocking, 1,
        'a capitalized critical/open bug is still blocking');
      assert.equal(snap.bugs.bySeverity.critical, 1, 'normalized into the lowercase bucket');
      assert.deepEqual(snap.bugs.openIds, ['BG-001']);
      // list[] must also be normalized so list[] consumers (resume's "Open Bugs" section, Hub) stay
      // consistent with the counters — a raw "Open"/"Critical" made resume self-contradict.
      assert.equal(snap.bugs.list[0].status, 'open', 'list[] status normalized');
      assert.equal(snap.bugs.list[0].severity, 'critical', 'list[] severity normalized');
    } finally { cleanup(dir); }
  });

  it('AUDIT-0629-G: the root snapshot gate and getBlockingBugs agree on the SAME bugs (shared predicate)', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      // Battery mixing casing, severity, status. The feature gate (getBlockingBugs) and the root
      // snapshot gate now share isBlockingBug, so they must return the SAME blocking count — locks
      // the consolidation against a future re-divergence (the R3-12/AUDIT-0629-B failure mode).
      writeJsonSpec(dir, 'BUGS.json', { bugs: [
        { id: 'BG-001', severity: 'Critical', status: 'Open' },        // blocking (capitalized)
        { id: 'BG-002', severity: 'high',     status: 'in_progress' }, // blocking
        { id: 'BG-003', severity: 'critical', status: 'fixed' },       // inactive → not blocking
        { id: 'BG-004', severity: 'medium',   status: 'open' },        // not severe → not blocking
        { id: 'BG-005', severity: 'HIGH',     status: 'open' },        // blocking (caps)
      ] });
      const snap = buildProjectSnapshot(dir);
      const viaFeatureGate = getBlockingBugs(dir, { artifactsDir: 'spec' }).length;
      assert.equal(snap.bugs.blocking, 3, 'three blocking bugs, case-insensitive');
      assert.equal(viaFeatureGate, snap.bugs.blocking,
        'feature gate and root snapshot gate must agree — both filter through isBlockingBug');
    } finally { cleanup(dir); }
  });

  it('AUDIT-0629-D: a null element in events[] does not crash the snapshot', () => {
    const dir = tmpDir();
    try {
      // Valid JSON (coerceArrayFields lets it through — events IS an array), but a null element.
      // Exercises BOTH access sites: the driftReapprovals filter (always runs) and the
      // verify-run reverse scan (runs because no lastVerifyRun is set). Must not throw.
      saveConfig(dir, {
        projectName: 'x', artifactsDir: 'spec', approvedPhases: [1],
        events: [
          { event: 'verify-run', passed: 2, failed: 0, skipped: 0, manual: 0 },
          { event: 'approved', phase: 1, afterDrift: true, at: '2026-01-01' },
          null,
        ],
      });
      const snap = buildProjectSnapshot(dir);
      assert.ok(snap, 'snapshot built despite a null event element');
    } finally { cleanup(dir); }
  });

  it('feature-scoped bugs roll up into project-wide bySeverity + openIds', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'root', artifactsDir: 'spec' });
      writeJsonSpec(dir, 'BUGS.json', {
        bugs: [{ id: 'BG-001', severity: 'high', status: 'open' }],
      });
      const featDir = path.join(dir, 'features', 'auth');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      saveConfig(featDir, { projectName: 'auth', artifactsDir: 'spec' });
      writeJsonSpec(featDir, 'BUGS.json', {
        bugs: [{ id: 'BG-002', severity: 'low', status: 'in_progress' }],
      });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.bugs.bySeverity.high, 1);
      assert.equal(snap.bugs.bySeverity.low, 1);
      assert.deepEqual(snap.bugs.openIds, ['BG-001', 'BG-002']);
    } finally { cleanup(dir); }
  });
});

// ── Audit freshness ──────────────────────────────────────────────────────────

describe('audit freshness', () => {
  it('audit.exists = false when AUDIT_REPORT.md is absent', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.audit.exists, false);
      assert.equal(snap.audit.stalenessDays, null);
    } finally { cleanup(dir); }
  });

  // 3.3 #1 (UX-PRO-0707): the "run evaluative audit" advisory must NOT nag from minute zero —
  // there is nothing to audit before the pipeline produces a phase. It appears once there is.
  it('no "aitri audit" advisory on a fresh project (no phase done)', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      const snap = buildProjectSnapshot(dir);
      assert.ok(!snap.nextActions.some(a => a.command === 'aitri audit'),
        'audit nag is suppressed until there is pipeline progress');
    } finally { cleanup(dir); }
  });

  it('"aitri audit" advisory returns once a phase is completed', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec', completedPhases: [1] });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.audit.exists, false);
      assert.ok(snap.nextActions.some(a => a.command === 'aitri audit'),
        'once there is progress, the missing-audit advisory is legitimate');
    } finally { cleanup(dir); }
  });

  it('staleAudit = true when mtime is older than threshold', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      writeSpec(dir, 'AUDIT_REPORT.md', '# Audit');
      const auditPath = path.join(dir, 'spec', 'AUDIT_REPORT.md');
      const oldDate = new Date(Date.now() - 90 * MS_PER_DAY);
      fs.utimesSync(auditPath, oldDate, oldDate);
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.audit.exists, true);
      assert.ok(snap.audit.stalenessDays >= 89);
      assert.equal(snap.health.staleAudit, true);
    } finally { cleanup(dir); }
  });

  it('staleAudit = false when audit is fresh', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      writeSpec(dir, 'AUDIT_REPORT.md', '# Audit');
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.health.staleAudit, false);
    } finally { cleanup(dir); }
  });

  it('R3-11: finds AUDIT_REPORT.md in the project root when artifactsDir is unset (legacy layout)', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x' });   // no artifactsDir → root-artifact project
      fs.writeFileSync(path.join(dir, 'AUDIT_REPORT.md'), '# Audit');
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.audit.exists, true, 'audit in root must be detected, not looked for under spec/');
    } finally { cleanup(dir); }
  });

  it('audit.lastAt prefers persisted auditLastAt over file mtime', () => {
    const dir = tmpDir();
    try {
      // Persisted timestamp: 5 days ago. File mtime: 90 days ago (simulates a
      // fresh clone of an older audit). Snapshot must trust the persisted value.
      const fiveDaysAgo  = new Date(Date.now() - 5  * MS_PER_DAY).toISOString();
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec', auditLastAt: fiveDaysAgo });
      writeSpec(dir, 'AUDIT_REPORT.md', '# Audit');
      const auditPath = path.join(dir, 'spec', 'AUDIT_REPORT.md');
      const oldDate   = new Date(Date.now() - 90 * MS_PER_DAY);
      fs.utimesSync(auditPath, oldDate, oldDate);

      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.audit.exists, true);
      assert.equal(snap.audit.lastAt, fiveDaysAgo);
      assert.ok(snap.audit.stalenessDays <= 6);
      assert.equal(snap.health.staleAudit, false);
    } finally { cleanup(dir); }
  });

  it('audit.lastAt falls back to file mtime when auditLastAt is absent', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      writeSpec(dir, 'AUDIT_REPORT.md', '# Audit');
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.audit.exists, true);
      assert.ok(snap.audit.lastAt, 'lastAt should fall back to mtime');
    } finally { cleanup(dir); }
  });
});

// ── Verify freshness ─────────────────────────────────────────────────────────

describe('verify freshness (verifyRanAt)', () => {
  it('tests.stalenessDays = null when verifyRanAt is absent', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.tests.stalenessDays, null);
      assert.deepEqual(snap.health.staleVerify, []);
    } finally { cleanup(dir); }
  });

  it('tests.stalenessDays computed from verifyRanAt on root pipeline', () => {
    const dir = tmpDir();
    try {
      const tenDaysAgo = new Date(Date.now() - 10 * MS_PER_DAY).toISOString();
      saveConfig(dir, {
        projectName:  'x',
        artifactsDir: 'spec',
        verifyRanAt:  tenDaysAgo,
      });
      const snap = buildProjectSnapshot(dir);
      assert.ok(snap.tests.stalenessDays >= 9 && snap.tests.stalenessDays <= 11);
      // 10 days is within the 14-day threshold — should NOT be stale
      assert.deepEqual(snap.health.staleVerify, []);
    } finally { cleanup(dir); }
  });

  it('health.staleVerify lists pipelines with verifyRanAt older than 14 days', () => {
    const dir = tmpDir();
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY).toISOString();
      saveConfig(dir, {
        projectName:  'x',
        artifactsDir: 'spec',
        verifyRanAt:  thirtyDaysAgo,
      });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.health.staleVerify.length, 1);
      assert.equal(snap.health.staleVerify[0].scope, 'root');
      assert.ok(snap.health.staleVerify[0].days >= 29);
    } finally { cleanup(dir); }
  });

  it('STALE-VERIFY-1: a terminal+clean pipeline is NOT stale regardless of age', () => {
    const dir = tmpDir();
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY).toISOString();
      // All core phases approved, verify passed, no drift → evidence still holds.
      saveConfig(dir, {
        projectName:    'x',
        artifactsDir:   'spec',
        approvedPhases: [1, 2, 3, 4, 5],
        verifyPassed:   true,
        verifyRanAt:    thirtyDaysAgo,
      });
      const snap = buildProjectSnapshot(dir);
      assert.deepEqual(snap.health.staleVerify, [],
        'a finished, undrifted pipeline must not nag to re-verify by the calendar');
      // And no P7 "refresh before declaring idle" action should be emitted.
      const refreshNudge = snap.nextActions.find(a =>
        /refresh before declaring idle/.test(a.reason || ''));
      assert.equal(refreshNudge, undefined,
        'terminal+clean pipeline should reach idle, not emit a verify-run nudge');
    } finally { cleanup(dir); }
  });

  it('STALE-VERIFY-1: an approved-but-unverified pipeline IS still stale when old', () => {
    const dir = tmpDir();
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY).toISOString();
      // Core approved but verify did NOT pass → still in flux → calendar applies.
      saveConfig(dir, {
        projectName:    'x',
        artifactsDir:   'spec',
        approvedPhases: [1, 2, 3, 4, 5],
        verifyPassed:   false,
        verifyRanAt:    thirtyDaysAgo,
      });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.health.staleVerify.length, 1);
      assert.equal(snap.health.staleVerify[0].scope, 'root');
    } finally { cleanup(dir); }
  });
});

// ── tests.totals / tests.perPipeline aggregation ─────────────────────────────

describe('tests aggregation across pipelines', () => {
  it('tests.totals sums verifySummary across root + features', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName:   'root',
        artifactsDir:  'spec',
        verifySummary: { passed: 30, failed: 0, skipped: 0, manual: 0, total: 30 },
        verifyPassed:  true,
      });
      const featA = path.join(dir, 'features', 'a');
      fs.mkdirSync(path.join(featA, 'spec'), { recursive: true });
      saveConfig(featA, {
        projectName:   'a',
        artifactsDir:  'spec',
        verifySummary: { passed: 53, failed: 8, skipped: 0, manual: 0, total: 61 },
      });
      const featB = path.join(dir, 'features', 'b');
      fs.mkdirSync(path.join(featB, 'spec'), { recursive: true });
      saveConfig(featB, {
        projectName:   'b',
        artifactsDir:  'spec',
        verifySummary: { passed: 20, failed: 0, skipped: 5, manual: 2, total: 27 },
      });

      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.tests.totals.passed,  103);
      assert.equal(snap.tests.totals.failed,  8);
      assert.equal(snap.tests.totals.skipped, 5);
      assert.equal(snap.tests.totals.manual,  2);
      assert.equal(snap.tests.totals.total,   118);
    } finally { cleanup(dir); }
  });

  it('tests.perPipeline lists root + each feature with counts', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName:   'root',
        artifactsDir:  'spec',
        verifySummary: { passed: 10, failed: 0, skipped: 0, total: 10 },
        verifyPassed:  true,
      });
      const featA = path.join(dir, 'features', 'a');
      fs.mkdirSync(path.join(featA, 'spec'), { recursive: true });
      saveConfig(featA, {
        projectName:   'a',
        artifactsDir:  'spec',
        verifySummary: { passed: 4, failed: 1, total: 5 },
      });

      const snap = buildProjectSnapshot(dir);
      const scopes = snap.tests.perPipeline.map(e => e.scope);
      assert.ok(scopes.includes('root'));
      assert.ok(scopes.includes('feature:a'));
      const rootEntry = snap.tests.perPipeline.find(e => e.scope === 'root');
      assert.equal(rootEntry.passed, 10);
      assert.equal(rootEntry.total,  10);
      const featEntry = snap.tests.perPipeline.find(e => e.scope === 'feature:a');
      assert.equal(featEntry.passed, 4);
      assert.equal(featEntry.total,  5);
    } finally { cleanup(dir); }
  });

  it('tests.totals zero across the board when no pipeline has run verify', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.tests.totals.passed, 0);
      assert.equal(snap.tests.totals.total,  0);
      const entry = snap.tests.perPipeline.find(e => e.scope === 'root');
      assert.equal(entry.ran,    false);
      assert.equal(entry.passed, null);
      assert.equal(entry.total,  null);
    } finally { cleanup(dir); }
  });
});

// ── Resilience to malformed input ────────────────────────────────────────────

describe('resilience', () => {
  it('B6: a malformed ROOT .aitri refuses (throws) — same posture as the G-4 conflict case', () => {
    // Pre-B6 loadConfig returned DEFAULTS and the snapshot flagged parseError; but any
    // state-mutating command on that DEFAULTS base then wiped the shared state. The root
    // config being unreadable now refuses everywhere (features keep the tolerated,
    // parseError-flagged path — next test).
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, '.aitri'), '{not valid json');
      assert.throws(() => buildProjectSnapshot(dir), /not valid JSON/,
        'an unreadable root config must refuse, not render a fake-fresh pipeline');
    } finally { cleanup(dir); }
  });

  it('B6: a malformed (non-conflict) FEATURE .aitri is tolerated + flagged, aggregation continues', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'root', artifactsDir: 'spec' });
      const badFeat = path.join(dir, 'features', 'bad');
      fs.mkdirSync(badFeat, { recursive: true });
      fs.writeFileSync(path.join(badFeat, '.aitri'), '{not valid json');
      const snap = buildProjectSnapshot(dir); // must NOT throw
      const bad = snap.pipelines.find(p => p.scope === 'feature:bad');
      assert.equal(bad.parseError, true, 'malformed feature is flagged, not fatal');
      assert.ok(!fs.existsSync(path.join(badFeat, '.aitri.bak')),
        'the read-only tolerated path must not write a backup');
    } finally { cleanup(dir); }
  });

  it('G-4 #1: a conflicted FEATURE .aitri flags parseError and does NOT abort the whole snapshot', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'root', artifactsDir: 'spec' });
      // healthy feature
      const okFeat = path.join(dir, 'features', 'ok');
      fs.mkdirSync(path.join(okFeat, 'spec'), { recursive: true });
      saveConfig(okFeat, { projectName: 'ok', artifactsDir: 'spec', approvedPhases: [1] });
      // conflicted feature — a merge left git markers (raw write, not via saveConfig)
      const badFeat = path.join(dir, 'features', 'bad');
      fs.mkdirSync(badFeat, { recursive: true });
      fs.writeFileSync(path.join(badFeat, '.aitri'),
        '{\n<<<<<<< HEAD\n  "approvedPhases": [1, 2]\n=======\n  "approvedPhases": [1]\n>>>>>>> branch\n}');

      const snap = buildProjectSnapshot(dir); // must NOT throw (was the ship-blocker regression)
      assert.equal(snap.pipelines.length, 3, 'root + both features still present — aggregation continued');
      const bad = snap.pipelines.find(p => p.scope === 'feature:bad');
      assert.equal(bad.parseError, true, 'conflicted feature is flagged, not silently dropped or reset');
      const ok = snap.pipelines.find(p => p.scope === 'feature:ok');
      assert.ok(ok.phases.find(p => p.key === 1).status === 'approved', 'the healthy feature still renders');
      // Pin G-4 specifically (not just "didn't abort"): the conflicted feature must be LEFT INTACT,
      // not reset+backed-up. Without this the test also passes against the old silent-reset path.
      assert.ok(!fs.existsSync(path.join(badFeat, '.aitri.bak')),
        'tolerated conflict must NOT trigger backup-and-reset');
      assert.match(fs.readFileSync(path.join(badFeat, '.aitri'), 'utf8'), /<<<<<<</,
        'the conflicted feature .aitri is left untouched for the operator to resolve');
    } finally { cleanup(dir); }
  });

  it('G-4: a conflicted ROOT .aitri refuses (throws) — project state is unknowable', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, '.aitri'),
        '{\n<<<<<<< HEAD\n  "currentPhase": 2\n=======\n  "currentPhase": 1\n>>>>>>> branch\n}');
      assert.throws(() => buildProjectSnapshot(dir), /unresolved git merge conflict markers/,
        'a conflicted root is not tolerated — it refuses like any other command');
    } finally { cleanup(dir); }
  });

  it('malformed 01_REQUIREMENTS.json does not crash the builder', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      writeSpec(dir, '01_REQUIREMENTS.json', '{broken');
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.requirements.total, 0);
    } finally { cleanup(dir); }
  });

  it('tolerates legacy NFR schema ({title, constraint}) — A1 regression', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'legacy', artifactsDir: 'spec' });
      writeJsonSpec(dir, '01_REQUIREMENTS.json', {
        project_name: 'legacy',
        functional_requirements: [{ id: 'FR-001', priority: 'MUST', title: 'x', acceptance_criteria: ['a'] }],
        non_functional_requirements: [
          { id: 'NFR-001', title: 'Performance', constraint: 'p95 < 200ms' },
        ],
        user_stories: [],
      });
      const snap = buildProjectSnapshot(dir);
      const fr = snap.requirements.openFRs[0];
      const nfr = snap.requirements.openNFRs[0];
      // FR type may be missing in legacy data — must surface as null, not "undefined"
      assert.equal(fr.type, null);
      // NFR legacy fields map to current field names
      assert.equal(nfr.category, 'Performance');
      assert.equal(nfr.requirement, 'p95 < 200ms');
    } finally { cleanup(dir); }
  });

  it('respects custom artifactsDir (not "spec")', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'custom', artifactsDir: 'artifacts' });
      fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'artifacts', '01_REQUIREMENTS.json'), JSON.stringify({
        project_name: 'custom',
        functional_requirements:     [{ id: 'FR-X', priority: 'MUST', type: 'logic', title: 't' }],
        non_functional_requirements: [],
        user_stories: [],
      }));
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.requirements.total, 1);
      assert.equal(snap.requirements.openFRs[0].id, 'FR-X');
    } finally { cleanup(dir); }
  });
});

// ── Next-action ordering ─────────────────────────────────────────────────────

describe('nextActions ordering', () => {
  it('priorities are ascending (1 is highest)', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir, {
        aitriVersion: '0.1.50',                    // priority 1 — version mismatch
        driftPhases:  ['2'],                        // priority 2 — drift
        reconcileState: { status: 'pending' },      // priority 4 — reconcile
      });
      writeJsonSpec(dir, 'BUGS.json', {            // priority 3 — blocking bug
        bugs: [{ id: 'BG-001', title: 'x', severity: 'high', status: 'open' }],
      });
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      const priorities = snap.nextActions.map(a => a.priority);
      const sorted = [...priorities].sort((a, b) => a - b);
      assert.deepEqual(priorities, sorted, 'nextActions must be sorted by priority');
      assert.equal(snap.nextActions[0].priority, 1);
    } finally { cleanup(dir); }
  });

  // ── alpha.12 — no-op verify-run loop guard ─────────────────────────────────
  // When Phase 4 is approved and verify-run produced 0 passed + 0 failed +
  // ≥1 skipped (skeleton tests, missing markers, no real implementation),
  // re-running verify-run is a no-op. resume must route to verify-complete
  // instead, where the actionable diagnostic ("All N skipped — at least 1
  // must pass") lives. Generalises across any project — surfaced by Ultron
  // canary on a feature whose Phase 4 was approved with skeleton-only manifest.
  describe('Phase 4 approved + verify-run all-skip → verify-complete', () => {
    function seedPhase4Approved(dir, events) {
      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        approvedPhases:  [1, 2, 3, 4],
        completedPhases: [1, 2, 3, 4],
        verifyRanAt: '2026-04-29T14:55:47.563Z',
        events,
      });
      writeJsonSpec(dir, '01_REQUIREMENTS.json', {
        project_name: 'p',
        functional_requirements:     [{ id: 'FR-001', priority: 'MUST', type: 'logic', title: 't', acceptance_criteria: ['AC1'] }],
        non_functional_requirements: [], user_stories: [],
      });
      writeSpec(dir, '02_SYSTEM_DESIGN.md', '# d\n');
      writeJsonSpec(dir, '03_TEST_CASES.json', { test_cases: [] });
      writeJsonSpec(dir, '04_BUILD_REPORT.json', { files_created: ['x'], technical_debt: [] });
    }

    it('routes to verify-complete when last verify-run was 0/0/skipped', () => {
      const dir = tmpDir();
      try {
        seedPhase4Approved(dir, [
          { at: '2026-04-29T14:55:47.563Z', event: 'verify-run', phase: 'verify',
            passed: 0, failed: 0, skipped: 78, manual: 0 },
        ]);
        const snap = buildProjectSnapshot(dir);
        const action = snap.nextActions.find(a => a.priority === 5);
        assert.ok(action, 'expected a priority-5 verify next-action');
        assert.equal(action.command, 'aitri verify-complete');
        assert.match(action.reason, /verify-run produced 0 passed \/ 78 skipped/);
        assert.equal(action.severity, 'warn');
      } finally { cleanup(dir); }
    });

    it('still recommends verify-run when verify never ran', () => {
      const dir = tmpDir();
      try {
        saveConfig(dir, {
          projectName: 'p', artifactsDir: 'spec',
          approvedPhases:  [1, 2, 3, 4],
          completedPhases: [1, 2, 3, 4],
        });
        writeJsonSpec(dir, '01_REQUIREMENTS.json', {
          project_name: 'p',
          functional_requirements:     [{ id: 'FR-001', priority: 'MUST', type: 'logic', title: 't', acceptance_criteria: ['AC1'] }],
          non_functional_requirements: [], user_stories: [],
        });
        writeSpec(dir, '02_SYSTEM_DESIGN.md', '# d\n');
        writeJsonSpec(dir, '03_TEST_CASES.json', { test_cases: [] });
        writeJsonSpec(dir, '04_BUILD_REPORT.json', { files_created: ['x'], technical_debt: [] });
        const snap = buildProjectSnapshot(dir);
        const action = snap.nextActions.find(a => a.priority === 5);
        assert.ok(action);
        assert.equal(action.command, 'aitri verify-run');
        assert.equal(action.reason, 'Phase 4 approved — Aitri now re-runs the tests independently (the build report is agent-attested)');
      } finally { cleanup(dir); }
    });

    // FB-APPROVE-VERIFY-LEGIBILITY-0715: at phase 4 the approve recommendation must state
    // it is build-phase review (not final sign-off) and that Aitri re-verifies after.
    it('recommends approve 4 with the build-phase (not product) clarification', () => {
      const dir = tmpDir();
      try {
        saveConfig(dir, {
          projectName: 'p', artifactsDir: 'spec',
          approvedPhases:  [1, 2, 3],
          completedPhases: [1, 2, 3, 4],
        });
        writeJsonSpec(dir, '01_REQUIREMENTS.json', {
          project_name: 'p',
          functional_requirements:     [{ id: 'FR-001', priority: 'MUST', type: 'logic', title: 't', acceptance_criteria: ['AC1'] }],
          non_functional_requirements: [], user_stories: [],
        });
        writeSpec(dir, '02_SYSTEM_DESIGN.md', '# d\n');
        writeJsonSpec(dir, '03_TEST_CASES.json', { test_cases: [] });
        writeJsonSpec(dir, '04_BUILD_REPORT.json', { files_created: ['x'], technical_debt: [] });
        const snap = buildProjectSnapshot(dir);
        const action = snap.nextActions.find(a => /approve (4|build)\b/.test(a.command));
        assert.ok(action, 'approve 4 must be recommended when phase 4 is completed-unapproved');
        assert.match(action.reason, /approve the BUILD PHASE/);
        assert.match(action.reason, /re-runs the tests independently after/);
      } finally { cleanup(dir); }
    });

    it('still recommends verify-run when last run had failures (re-run may help)', () => {
      const dir = tmpDir();
      try {
        seedPhase4Approved(dir, [
          { at: '2026-04-29T14:55:47.563Z', event: 'verify-run', phase: 'verify',
            passed: 5, failed: 2, skipped: 0, manual: 0 },
        ]);
        const snap = buildProjectSnapshot(dir);
        const action = snap.nextActions.find(a => a.priority === 5);
        assert.equal(action.command, 'aitri verify-run');
      } finally { cleanup(dir); }
    });

    it('routes to tc verify (not a verify-run loop) when last run was all-manual (FB-MULTI-0619 #2)', () => {
      const dir = tmpDir();
      try {
        seedPhase4Approved(dir, [
          { at: '2026-04-29T14:55:47.563Z', event: 'verify-run', phase: 'verify',
            passed: 0, failed: 0, skipped: 0, manual: 3 },
        ]);
        const snap = buildProjectSnapshot(dir);
        const action = snap.nextActions.find(a => a.priority === 5);
        // All-manual (0 automated) has no runner to re-run — the next step is human
        // verification, not looping back to verify-run.
        assert.equal(action.command, 'aitri tc verify');
      } finally { cleanup(dir); }
    });

    it('feature scope produces aitri feature verify-complete', () => {
      const dir = tmpDir();
      try {
        saveConfig(dir, { projectName: 'root', artifactsDir: 'spec' });
        const featDir = path.join(dir, 'features', 'billing');
        fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
        seedPhase4Approved(featDir, [
          { at: '2026-04-29T14:55:47.563Z', event: 'verify-run', phase: 'verify',
            passed: 0, failed: 0, skipped: 12, manual: 0 },
        ]);
        const snap = buildProjectSnapshot(dir);
        const action = snap.nextActions.find(a => a.scope === 'feature:billing');
        assert.ok(action);
        assert.equal(action.command, 'aitri feature verify-complete billing');
      } finally { cleanup(dir); }
    });
  });

  it('feature scope produces aitri feature commands', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'root', artifactsDir: 'spec' });
      const featDir = path.join(dir, 'features', 'billing');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      saveConfig(featDir, { projectName: 'billing', artifactsDir: 'spec' });
      const snap = buildProjectSnapshot(dir);
      const featureAction = snap.nextActions.find(a => a.scope === 'feature:billing');
      assert.ok(featureAction, 'feature action must exist');
      assert.match(featureAction.command, /^aitri feature run-phase billing /);
    } finally { cleanup(dir); }
  });
});

// ── detectUncountedChanges() ─────────────────────────────────────────────────

function gitInit(dir) {
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email a@b.c', { cwd: dir });
  execSync('git config user.name Test',   { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
}
function gitAddCommit(dir, msg) {
  execSync('git add -A',                          { cwd: dir });
  execSync(`git commit -q --no-verify -m "${msg}"`, { cwd: dir });
}
function gitHead(dir) {
  return execSync('git rev-parse HEAD', { cwd: dir }).toString().trim();
}

describe('detectUncountedChanges()', () => {
  it('returns all-null when no reconcile baseline exists', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'p', artifactsDir: 'spec' });
      const pl = buildPipelineEntry(dir, 'root');
      const r = detectUncountedChanges(pl);
      assert.deepEqual(r, { state: null, baseRef: null, method: null, uncountedFiles: null });
    } finally { cleanup(dir); }
  });

  it('preserves status="pending" but does not run git (no double counting)', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'pending', baseRef: 'abc1234', method: 'git' },
      });
      const pl = buildPipelineEntry(dir, 'root');
      const r = detectUncountedChanges(pl);
      assert.equal(r.state, 'pending');
      assert.equal(r.uncountedFiles, null, 'pending state must not trigger detection');
    } finally { cleanup(dir); }
  });

  it('returns uncountedFiles=null for mtime baselines (skipped to keep snapshot cheap)', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'resolved', baseRef: new Date().toISOString(), method: 'mtime' },
      });
      const pl = buildPipelineEntry(dir, 'root');
      const r = detectUncountedChanges(pl);
      assert.equal(r.method, 'mtime');
      assert.equal(r.uncountedFiles, null);
    } finally { cleanup(dir); }
  });

  it('counts source files changed since git baseline (resolved state)', () => {
    const dir = tmpDir();
    try {
      gitInit(dir);
      fs.writeFileSync(path.join(dir, 'a.js'), 'a');
      gitAddCommit(dir, 'init');
      const baseSha = gitHead(dir);

      // Changes after baseline: 2 source files + 1 spec/ file (must be excluded)
      fs.writeFileSync(path.join(dir, 'a.js'), 'a-modified');
      fs.writeFileSync(path.join(dir, 'b.js'), 'b');
      fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), '{}');
      gitAddCommit(dir, 'changes');

      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'resolved', baseRef: baseSha, method: 'git' },
      });
      const pl = buildPipelineEntry(dir, 'root');
      const r = detectUncountedChanges(pl);
      assert.equal(r.state, 'resolved');
      assert.equal(r.method, 'git');
      assert.equal(r.uncountedFiles, 2, 'should exclude spec/ files');
    } finally { cleanup(dir); }
  });

  it('returns uncountedFiles=0 when git baseline matches HEAD', () => {
    const dir = tmpDir();
    try {
      gitInit(dir);
      fs.writeFileSync(path.join(dir, 'a.js'), 'a');
      gitAddCommit(dir, 'init');
      const baseSha = gitHead(dir);

      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'resolved', baseRef: baseSha, method: 'git' },
      });
      const pl = buildPipelineEntry(dir, 'root');
      assert.equal(detectUncountedChanges(pl).uncountedFiles, 0);
    } finally { cleanup(dir); }
  });

  it('returns uncountedFiles=null when git command fails (bad baseRef)', () => {
    const dir = tmpDir();
    try {
      // No git repo — execSync git diff will throw
      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'resolved', baseRef: 'deadbeef', method: 'git' },
      });
      const pl = buildPipelineEntry(dir, 'root');
      assert.equal(detectUncountedChanges(pl).uncountedFiles, null);
    } finally { cleanup(dir); }
  });

  it('excludes non-behavioral files (allowlist) — Ultron canary regression', () => {
    // Regression guard for the cycle reported on Ultron 2026-04-27:
    // a one-line go.mod toolchain bump was counted as off-pipeline drift,
    // forcing a 70KB Code Reviewer briefing for trivial maintenance.
    // After the allowlist filter, build/dep manifests + docs do not count.
    const dir = tmpDir();
    try {
      gitInit(dir);
      fs.writeFileSync(path.join(dir, 'go.mod'),         'module x\n\ngo 1.25.5\n');
      fs.writeFileSync(path.join(dir, 'DEPLOYMENT.md'),  '# Deploy\n');
      fs.writeFileSync(path.join(dir, '.env.example'),   'KEY=value\n');
      gitAddCommit(dir, 'init');
      const baseSha = gitHead(dir);

      // Post-baseline: only non-behavioral changes (mirrors Ultron's case).
      fs.writeFileSync(path.join(dir, 'go.mod'),         'module x\n\ngo 1.25.9\n');
      fs.writeFileSync(path.join(dir, 'DEPLOYMENT.md'),  '# Deploy\n\n## Pi\n');
      fs.writeFileSync(path.join(dir, '.env.example'),   'KEY=value\nNEW_KEY=v\n');
      gitAddCommit(dir, 'cve bumps + docs');

      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'resolved', baseRef: baseSha, method: 'git' },
      });
      const pl = buildPipelineEntry(dir, 'root');
      assert.equal(detectUncountedChanges(pl).uncountedFiles, 0,
        'allowlist files (go.mod, *.md, .env.*) must not count as off-pipeline drift');
    } finally { cleanup(dir); }
  });

  it('counts only behavioral files in mixed change set', () => {
    // One source file + one allowlisted file — count must be 1, not 2.
    const dir = tmpDir();
    try {
      gitInit(dir);
      fs.writeFileSync(path.join(dir, 'main.js'),   'console.log("a");');
      fs.writeFileSync(path.join(dir, 'README.md'), '# Project');
      gitAddCommit(dir, 'init');
      const baseSha = gitHead(dir);

      fs.writeFileSync(path.join(dir, 'main.js'),   'console.log("b");');
      fs.writeFileSync(path.join(dir, 'README.md'), '# Project v2');
      gitAddCommit(dir, 'edits');

      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'resolved', baseRef: baseSha, method: 'git' },
      });
      const pl = buildPipelineEntry(dir, 'root');
      assert.equal(detectUncountedChanges(pl).uncountedFiles, 1,
        'mixed change set must count only the behavioral file');
    } finally { cleanup(dir); }
  });

  it('excludes feature sub-pipeline artifacts — rc.6 reconcile/snapshot symmetry', () => {
    // Regression guard for the Hub canary 2026-05-22 cycle: `aitri reconcile`
    // excluded features/<name>/spec/ (rc.3) but detectUncountedChanges did not,
    // so status/resume stayed stuck reporting "1 file changed outside pipeline"
    // for a feature artifact reconcile had already cleared. The two must agree.
    const dir = tmpDir();
    try {
      gitInit(dir);
      fs.writeFileSync(path.join(dir, 'main.js'), 'console.log("a");');
      gitAddCommit(dir, 'init');
      const baseSha = gitHead(dir);

      // Post-baseline: one root source file (counts) + feature artifacts (must not).
      fs.writeFileSync(path.join(dir, 'main.js'), 'console.log("b");');
      fs.mkdirSync(path.join(dir, 'features', 'hub-web-only', 'spec'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'features', 'hub-web-only', 'spec', '04_TEST_RESULTS.json'), '{}');
      fs.mkdirSync(path.join(dir, 'features', 'hub-web-only', '.aitri'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'features', 'hub-web-only', '.aitri', 'config.json'), '{}');
      gitAddCommit(dir, 'root edit + feature pipeline output');

      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'resolved', baseRef: baseSha, method: 'git' },
      });
      const pl = buildPipelineEntry(dir, 'root');
      assert.equal(detectUncountedChanges(pl).uncountedFiles, 1,
        'feature sub-pipeline artifacts must not count as parent off-pipeline drift');
    } finally { cleanup(dir); }
  });
});

// ── snapshot.reconcile integration ───────────────────────────────────────────

describe('snapshot.reconcile integration', () => {
  it('emits nextAction for uncounted off-pipeline changes (resolved state)', () => {
    const dir = tmpDir();
    try {
      gitInit(dir);
      fs.writeFileSync(path.join(dir, 'a.js'), 'a');
      gitAddCommit(dir, 'init');
      const baseSha = gitHead(dir);
      fs.writeFileSync(path.join(dir, 'b.js'), 'b');
      gitAddCommit(dir, 'add b.js');

      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'resolved', baseRef: baseSha, method: 'git' },
      });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.reconcile.uncountedFiles, 1);
      const action = snap.nextActions.find(a => a.command === 'aitri reconcile');
      assert.ok(action, 'must emit aitri reconcile next-action');
      assert.match(action.reason, /1 file\(s\) changed outside pipeline/);
    } finally { cleanup(dir); }
  });

  it('does not emit a duplicate reconcile action when already pending', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'pending', baseRef: 'abc', method: 'git' },
      });
      const snap = buildProjectSnapshot(dir);
      const normalizeActions = snap.nextActions.filter(a => a.command.startsWith('aitri reconcile'));
      assert.equal(normalizeActions.length, 1, 'pending must not stack with uncounted detection');
    } finally { cleanup(dir); }
  });

  it('pending state suggests --resolve (the closer), not plain reconcile — rc.7 loop fix', () => {
    // Regression guard for the Cesar loop 2026-05-22: pending emitted plain
    // `aitri reconcile`, which never advances the baseline — re-running it is a
    // fixed point. The next-action must point to the command that actually
    // closes the cycle.
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'pending', baseRef: 'abc', method: 'git' },
      });
      const snap = buildProjectSnapshot(dir);
      const action = snap.nextActions.find(a => a.command.startsWith('aitri reconcile'));
      assert.ok(action, 'must emit a reconcile next-action when pending');
      assert.equal(action.command, 'aitri reconcile --resolve',
        'pending must suggest the closer, not the detect-only command');
      assert.equal(action.priority, 4);
      assert.match(action.reason, /resolve to advance the baseline|route any fr-change/);
    } finally { cleanup(dir); }
  });

  it('resolved + uncounted still suggests plain reconcile (classify first) — guard', () => {
    const dir = tmpDir();
    try {
      gitInit(dir);
      fs.writeFileSync(path.join(dir, 'a.js'), 'a');
      gitAddCommit(dir, 'init');
      const baseSha = gitHead(dir);
      fs.writeFileSync(path.join(dir, 'b.js'), 'b');
      gitAddCommit(dir, 'add b.js');

      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'resolved', baseRef: baseSha, method: 'git' },
      });
      const snap = buildProjectSnapshot(dir);
      const action = snap.nextActions.find(a => a.command.startsWith('aitri reconcile'));
      assert.equal(action.command, 'aitri reconcile',
        'resolved+uncounted is the classify step — must not jump to --resolve');
    } finally { cleanup(dir); }
  });

  it('pending with blocking bugs suppresses the reconcile action (--resolve would be refused)', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        reconcileState: { status: 'pending', baseRef: 'abc', method: 'git' },
      });
      writeJsonSpec(dir, 'BUGS.json', {
        bugs: [{ id: 'BG-001', title: 'x', severity: 'high', status: 'open' }],
      });
      const snap = buildProjectSnapshot(dir);
      const normalizeActions = snap.nextActions.filter(a => a.command.startsWith('aitri reconcile'));
      assert.equal(normalizeActions.length, 0,
        'priority-4 reconcile must stay suppressed while blocking bugs exist');
    } finally { cleanup(dir); }
  });
});

// ── buildPipelineEntry direct ────────────────────────────────────────────────

describe('buildPipelineEntry()', () => {
  it('returns null for directory without .aitri', () => {
    const dir = tmpDir();
    try {
      assert.equal(buildPipelineEntry(dir, 'root'), null);
    } finally { cleanup(dir); }
  });

  it('sets scopeType and scopeName correctly for features', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'feat-x', artifactsDir: 'spec' });
      const entry = buildPipelineEntry(dir, 'feature:feat-x');
      assert.equal(entry.scopeType, 'feature');
      assert.equal(entry.scopeName, 'feat-x');
    } finally { cleanup(dir); }
  });
});

// ── A1 (alpha.3): .aitri.upgradeFindings surfaces via nextActions ────────────

describe('nextActions — unresolved upgrade findings (A1)', () => {
  // Findings must drive a priority-3 next-action so operators can not ignore
  // them. Previously the findings only appeared in the upgrade report and
  // scrolled past; the project stayed dirty under a "clean" status view.

  it('emits a P3 action per pipeline with non-empty upgradeFindings', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'x', artifactsDir: 'spec',
        upgradeFindings: [
          { target: '03_TEST_CASES.json', transform: 'TCs with non-canonical requirement (2)', reason: 'multi-FR', recordedAt: '2026-04-24T00:00:00Z' },
        ],
      });
      const snap = buildProjectSnapshot(dir);
      const findingAction = snap.nextActions.find(a => a.reason.includes('unresolved upgrade finding'));
      assert.ok(findingAction, 'must surface findings as next-action');
      assert.equal(findingAction.priority, 3);
      assert.equal(findingAction.severity, 'warn');
      // B1 fix (alpha.3 post-release): root action points to `aitri resume`
      // so the operator sees the full findings section in one hop instead of
      // being bounced through status first.
      assert.equal(findingAction.command, 'aitri resume');
    } finally { cleanup(dir); }
  });

  it('does not emit action when upgradeFindings is empty or absent', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec', upgradeFindings: [] });
      const snap = buildProjectSnapshot(dir);
      const findingAction = snap.nextActions.find(a => a.reason.includes('unresolved upgrade finding'));
      assert.equal(findingAction, undefined);
    } finally { cleanup(dir); }
  });

  it('pipeline entry exposes upgradeFindings array', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'x', artifactsDir: 'spec',
        upgradeFindings: [
          { target: '01_REQUIREMENTS.json', transform: 'NFRs with free-text title', reason: 'needs category', recordedAt: '2026-04-24T00:00:00Z' },
        ],
      });
      const snap = buildProjectSnapshot(dir);
      const root = snap.pipelines.find(p => p.scopeType === 'root');
      assert.equal(root.upgradeFindings.length, 1);
      assert.equal(root.upgradeFindings[0].target, '01_REQUIREMENTS.json');
    } finally { cleanup(dir); }
  });
});

// ── F11: terminal state — suppress P7 `aitri validate` when fully stable ─────

describe('nextActions — terminal state (F11)', () => {
  // A project that is deployable AND has a fresh audit on record AND whose
  // verify ran recently has no real next action. Reflexively suggesting
  // `aitri validate` creates the illusion of pending work. The snapshot must
  // emit no P7 action in that case — consumers (status, resume) render their
  // own "idle" message.

  it('suppresses P7 validate when deployable + fresh audit + fresh verify', () => {
    const dir = tmpDir();
    try {
      const now = new Date().toISOString();
      seedDeployableRoot(dir, { verifyRanAt: now, auditLastAt: now });
      writeSpec(dir, 'AUDIT_REPORT.md', '# Audit');
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.health.deployable, true);
      const p7 = snap.nextActions.find(a => a.priority === 7);
      assert.equal(p7, undefined, 'P7 must be suppressed in terminal state');
      const validates = snap.nextActions.filter(a => a.command === 'aitri validate');
      assert.equal(validates.length, 0, 'no validate suggestion in terminal state');
    } finally { cleanup(dir); }
  });

  it('still emits P7 validate when deployable but audit is missing', () => {
    // P9 fires `aitri audit` for missing audit — that is legitimate pending
    // work and the project is not terminal yet. P7 may still fire alongside.
    const dir = tmpDir();
    try {
      const now = new Date().toISOString();
      seedDeployableRoot(dir, { verifyRanAt: now });
      // No AUDIT_REPORT.md — audit.exists=false → not terminal.
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.health.deployable, true);
      assert.equal(snap.audit.exists, false);
      assert.ok(
        snap.nextActions.some(a => a.command === 'aitri validate'),
        'P7 must still fire when no audit exists',
      );
    } finally { cleanup(dir); }
  });

  it('still emits P7 validate when audit exists but is stale', () => {
    const dir = tmpDir();
    try {
      const now = new Date().toISOString();
      seedDeployableRoot(dir, { verifyRanAt: now });
      writeSpec(dir, 'AUDIT_REPORT.md', '# Audit');
      const auditPath = path.join(dir, 'spec', 'AUDIT_REPORT.md');
      const old = new Date(Date.now() - 90 * MS_PER_DAY);
      fs.utimesSync(auditPath, old, old);
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.health.staleAudit, true);
      assert.ok(
        snap.nextActions.some(a => a.command === 'aitri validate'),
        'P7 must still fire when audit is stale',
      );
    } finally { cleanup(dir); }
  });

  it('STALE-VERIFY-1: a terminal+clean root with an OLD verify is NOT stale (no P7)', () => {
    // Supersedes the rc.3 behavior: a deployable root whose verify ran 40 days
    // ago used to emit a P7 verify-run nudge. STALE-VERIFY-1 (Cesar canary
    // 2026-06-13): a root that is all-approved + verify-passed + undrifted has
    // evidence that still holds — nothing it tracks changed — so it is NOT stale
    // and reaches idle. Root staleness while deployable is now impossible by
    // construction (deployable ⟹ terminal+clean ⟹ excluded).
    const dir = tmpDir();
    try {
      const stale = new Date(Date.now() - 40 * MS_PER_DAY).toISOString();
      const now   = new Date().toISOString();
      seedDeployableRoot(dir, { verifyRanAt: stale, auditLastAt: now });
      writeSpec(dir, 'AUDIT_REPORT.md', '# Audit');
      const snap = buildProjectSnapshot(dir);
      assert.deepEqual(snap.health.staleVerify, []);
      assert.equal(snap.nextActions.filter(a => a.priority === 7).length, 0);
      assert.equal(
        snap.nextActions.filter(a => a.command === 'aitri validate').length,
        0,
      );
    } finally { cleanup(dir); }
  });

  it('emits per-feature verify-run when a stale IN-FLUX feature pipeline blocks idle', () => {
    // The P7 verify-run path survives for pipelines that are genuinely stale:
    // in-flux (not terminal+clean) with an old verifyRanAt. The suggested
    // command resolves the staleness (verify-run), never the no-op validate.
    const dir = tmpDir();
    try {
      const now   = new Date().toISOString();
      const stale = new Date(Date.now() - 30 * MS_PER_DAY).toISOString();
      seedDeployableRoot(dir, { verifyRanAt: now, auditLastAt: now });
      writeSpec(dir, 'AUDIT_REPORT.md', '# Audit');

      const featDir = path.join(dir, 'features', 'stale-feat');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      // In-flux: core not fully approved + verify not passed → calendar applies.
      saveConfig(featDir, {
        projectName:     'stale-feat',
        artifactsDir:    'spec',
        approvedPhases:  [1, 2, 3, 4],
        completedPhases: [1, 2, 3, 4],
        verifyPassed:    false,
        verifySummary:   { passed: 4, failed: 0, total: 4 },
        verifyRanAt:     stale,
      });

      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.health.deployable, true);
      assert.equal(snap.health.staleVerify.length, 1);
      assert.equal(snap.health.staleVerify[0].scope, 'feature:stale-feat');

      const p7 = snap.nextActions.filter(a => a.priority === 7);
      assert.equal(p7.length, 1);
      assert.equal(p7[0].command, 'aitri feature verify-run stale-feat');
      assert.equal(p7[0].scope, 'feature:stale-feat');
    } finally { cleanup(dir); }
  });

  it('emits one verify-run action per stale IN-FLUX pipeline when multiple are stale', () => {
    const dir = tmpDir();
    try {
      const now   = new Date().toISOString();
      const stale = new Date(Date.now() - 30 * MS_PER_DAY).toISOString();
      // Root is terminal+clean+fresh → deployable AND not stale (STALE-VERIFY-1).
      seedDeployableRoot(dir, { verifyRanAt: now, auditLastAt: now });
      writeSpec(dir, 'AUDIT_REPORT.md', '# Audit');

      for (const name of ['a', 'b']) {
        const featDir = path.join(dir, 'features', name);
        fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
        // In-flux + stale → flagged; terminal+clean would be excluded.
        saveConfig(featDir, {
          projectName:     name,
          artifactsDir:    'spec',
          approvedPhases:  [1, 2, 3, 4],
          completedPhases: [1, 2, 3, 4],
          verifyPassed:    false,
          verifySummary:   { passed: 2, failed: 0, total: 2 },
          verifyRanAt:     stale,
        });
      }

      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.health.staleVerify.length, 2); // 2 in-flux features; root is fresh+clean
      const p7 = snap.nextActions.filter(a => a.priority === 7);
      assert.equal(p7.length, 2);
      const cmds = p7.map(a => a.command).sort();
      assert.deepEqual(cmds, [
        'aitri feature verify-run a',
        'aitri feature verify-run b',
      ]);
      assert.equal(
        snap.nextActions.filter(a => a.command === 'aitri validate').length,
        0,
      );
    } finally { cleanup(dir); }
  });
});

// ── P1.B (rc.1): suppress P4 reconcile when blocking bugs exist ──────────
// Closes BACKLOG.md "Pre-promotion findings (Codex canary 2026-05-11)" — P1
// downstream. Before this fix, the ladder emitted `aitri reconcile` while the
// command itself refused to --resolve because of open critical/high bugs,
// producing a visible deadlock: ladder → run reconcile → rejected → fix bugs
// → ladder still says run reconcile. Now reconcile is suppressed from
// nextActions when bugs.blocking > 0; the blocking-bug P3 action stays as the
// surfaced next step. Reconcile re-emerges automatically when bugs close.

describe('nextActions — reconcile suppression on blocking bugs (P1 2026-05-12)', () => {
  // Helper: the ladder check at snapshot.js:727 reads pipelines[].reconcileState
  // (per-pipeline 'pending'|null derived at snapshot.js:198), NOT snapshot.reconcile.state
  // (which is the detectUncountedChanges output and is null when baseRef is absent).
  // Asserting on the per-pipeline field is the correct way to verify the ladder's input.
  const rootNormalizeState = (snap) =>
    snap.pipelines.find(p => p.scopeType === 'root')?.reconcileState;

  it('suppresses P4 reconcile-pending when blocking bug is open', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir, {
        reconcileState: { status: 'pending' },
      });
      writeJsonSpec(dir, 'BUGS.json', {
        bugs: [{ id: 'BG-001', title: 'critical thing', severity: 'critical', status: 'open' }],
      });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.bugs.blocking, 1,                'blocking bug present');
      assert.equal(rootNormalizeState(snap), 'pending',  'root reconcileState is pending');
      const normalizeAction = snap.nextActions.find(a => a.command === 'aitri reconcile');
      assert.equal(normalizeAction, undefined,
        'reconcile must NOT be in nextActions while a blocking bug is open');
      assert.ok(snap.nextActions.some(a => a.priority === 3),
        'blocking-bug P3 action must surface instead');
    } finally { cleanup(dir); }
  });

  it('re-emits reconcile once blocking bug is closed', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir, {
        reconcileState: { status: 'pending' },
      });
      writeJsonSpec(dir, 'BUGS.json', {
        bugs: [{ id: 'BG-001', title: 't', severity: 'critical', status: 'closed' }],
      });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.bugs.blocking, 0,                'no blocking bugs');
      assert.equal(rootNormalizeState(snap), 'pending',  'reconcile still pending');
      const normalizeAction = snap.nextActions.find(a => a.command.startsWith('aitri reconcile'));
      assert.ok(normalizeAction, 'reconcile must re-emerge when no blocking bugs');
      assert.equal(normalizeAction.command, 'aitri reconcile --resolve', 'pending re-emerges as the closer');
      assert.equal(normalizeAction.priority, 4);
    } finally { cleanup(dir); }
  });

  it('high + in_progress bug suppresses reconcile (matches reconcile --resolve gate)', () => {
    // reconcile.js:148-157 gate counts severity ∈ {critical, high} AND
    // status ∈ {open, in_progress} as blocking. The ladder must mirror.
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir, {
        reconcileState: { status: 'pending' },
      });
      writeJsonSpec(dir, 'BUGS.json', {
        bugs: [{ id: 'BG-001', title: 't', severity: 'high', status: 'in_progress' }],
      });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.bugs.blocking, 1,
        'in_progress + high counts as blocking (matches reconcile --resolve gate)');
      assert.equal(snap.nextActions.find(a => a.command.startsWith('aitri reconcile')), undefined,
        'reconcile stays out of ladder while high+in_progress blocking bug exists');
    } finally { cleanup(dir); }
  });

  it('low severity + open does NOT suppress reconcile (regression lock)', () => {
    // Low / medium bugs are not blocking — operator can still run reconcile.
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir, {
        reconcileState: { status: 'pending' },
      });
      writeJsonSpec(dir, 'BUGS.json', {
        bugs: [{ id: 'BG-001', title: 't', severity: 'low', status: 'open' }],
      });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.bugs.blocking, 0, 'low severity is not blocking');
      const action = snap.nextActions.find(a => a.command.startsWith('aitri reconcile'));
      assert.ok(action, 'reconcile must surface — low bug is not a deadlock cause');
      assert.equal(action.priority, 4);
    } finally { cleanup(dir); }
  });
});

// ── R3-15: snapshot git values are never shell-interpreted (the `aitri resume`/`status` RCE) ──
describe('buildProjectSnapshot() — git values never reach a shell (R3-15 RCE guard)', () => {
  function initGitRepo(dir) {
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email "t@t"', { cwd: dir });
    execSync('git config user.name "t"', { cwd: dir });
    execSync('git add -A && git commit -q -m init', { cwd: dir });
  }

  it('a malicious reconcile baseRef in committed .aitri does not execute on snapshot', () => {
    const dir = tmpDir();
    try {
      writeSpec(dir, '02_SYSTEM_DESIGN.md', '# d\n');
      const pwned = path.join(dir, 'PWNED');
      saveConfig(dir, {
        projectName: 'rce', artifactsDir: 'spec',
        approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
        reconcileState: { baseRef: `$(touch ${pwned})`, method: 'git', status: 'resolved' },
      });
      initGitRepo(dir);
      buildProjectSnapshot(dir);   // == aitri resume/status → detectUncountedChanges(baseRef)
      assert.equal(fs.existsSync(pwned), false, 'reconcile baseRef must never reach a shell');
    } finally { cleanup(dir); }
  });

  it('a malicious artifactsDir does not execute via the artifact git-clean drift check', () => {
    const dir = tmpDir();
    try {
      const pwned = path.join(dir, 'PWNED2');
      // driftPhases forces the per-phase git-clean check → artifactGitClean(rel from artifactsDir).
      saveConfig(dir, {
        projectName: 'rce', artifactsDir: `$(touch ${pwned})`,
        approvedPhases: [1, 2], driftPhases: ['2'],
      });
      initGitRepo(dir);
      buildProjectSnapshot(dir);   // == aitri resume/status → artifactGitClean(`-- <rel>`)
      assert.equal(fs.existsSync(pwned), false, 'artifactsDir must never reach a shell');
    } finally { cleanup(dir); }
  });
});
