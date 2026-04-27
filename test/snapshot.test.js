/**
 * Tests for lib/snapshot.js — buildProjectSnapshot() + helpers.
 * All fixtures live in os.tmpdir() and are cleaned after each test.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import path   from 'node:path';
import os     from 'node:os';

import { saveConfig } from '../lib/state.js';
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
  writeJsonSpec(dir, '04_IMPLEMENTATION_MANIFEST.json', {
    modules: [], files_created: ['a.js'], setup_commands: [], technical_debt: [],
  });
  writeJsonSpec(dir, '04_TEST_RESULTS.json', {
    summary: { passed: 10, failed: 0, skipped: 0, total: 10 },
    fr_coverage: [{ fr_id: 'FR-001', status: 'covered', tests_passing: 3, tests_failing: 0 }],
  });
  writeJsonSpec(dir, '05_PROOF_OF_COMPLIANCE.json', { requirement_compliance: [] });
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

  it('reflects approved/completed/in_progress/not_started per phase', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'mid', artifactsDir: 'spec',
        approvedPhases:  [1, 2],
        completedPhases: [1, 2, 3],
      });
      writeJsonSpec(dir, '03_TEST_CASES.json', { test_cases: [] });
      writeJsonSpec(dir, '04_IMPLEMENTATION_MANIFEST.json', { files_created: ['x'], technical_debt: [] });
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

  it('is false when normalizeState is pending', () => {
    const dir = tmpDir();
    try {
      seedDeployableRoot(dir, { normalizeState: { status: 'pending' } });
      const snap = buildProjectSnapshot(dir, { cliVersion: '0.1.76' });
      assert.equal(snap.health.deployable, false);
      assert.ok(snap.health.deployableReasons.some(r => r.type === 'normalize_pending'));
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

// ── Audit freshness ──────────────────────────────────────────────────────────

describe('audit freshness', () => {
  it('audit.exists = false when AUDIT_REPORT.md is absent', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec' });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.audit.exists, false);
      assert.equal(snap.audit.stalenessDays, null);
      assert.ok(snap.nextActions.some(a => a.command === 'aitri audit'));
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
  it('parseError is true when .aitri is malformed JSON', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, '.aitri'), '{not valid json');
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.pipelines[0].parseError, true);
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
        normalizeState: { status: 'pending' },      // priority 4 — normalize
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
  it('returns all-null when no normalize baseline exists', () => {
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
        normalizeState: { status: 'pending', baseRef: 'abc1234', method: 'git' },
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
        normalizeState: { status: 'resolved', baseRef: new Date().toISOString(), method: 'mtime' },
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
        normalizeState: { status: 'resolved', baseRef: baseSha, method: 'git' },
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
        normalizeState: { status: 'resolved', baseRef: baseSha, method: 'git' },
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
        normalizeState: { status: 'resolved', baseRef: 'deadbeef', method: 'git' },
      });
      const pl = buildPipelineEntry(dir, 'root');
      assert.equal(detectUncountedChanges(pl).uncountedFiles, null);
    } finally { cleanup(dir); }
  });

  it('excludes non-behavioral files (allowlist) — Ultron canary regression', () => {
    // Regression guard for the cycle reported on Ultron 2026-04-27:
    // a one-line go.mod toolchain bump was counted as off-pipeline drift,
    // forcing a 70KB Senior Code Reviewer briefing for trivial maintenance.
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
        normalizeState: { status: 'resolved', baseRef: baseSha, method: 'git' },
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
        normalizeState: { status: 'resolved', baseRef: baseSha, method: 'git' },
      });
      const pl = buildPipelineEntry(dir, 'root');
      assert.equal(detectUncountedChanges(pl).uncountedFiles, 1,
        'mixed change set must count only the behavioral file');
    } finally { cleanup(dir); }
  });
});

// ── snapshot.normalize integration ───────────────────────────────────────────

describe('snapshot.normalize integration', () => {
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
        normalizeState: { status: 'resolved', baseRef: baseSha, method: 'git' },
      });
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.normalize.uncountedFiles, 1);
      const action = snap.nextActions.find(a => a.command === 'aitri normalize');
      assert.ok(action, 'must emit aitri normalize next-action');
      assert.match(action.reason, /1 file\(s\) changed outside pipeline/);
    } finally { cleanup(dir); }
  });

  it('does not emit a duplicate normalize action when already pending', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, {
        projectName: 'p', artifactsDir: 'spec',
        normalizeState: { status: 'pending', baseRef: 'abc', method: 'git' },
      });
      const snap = buildProjectSnapshot(dir);
      const normalizeActions = snap.nextActions.filter(a => a.command === 'aitri normalize');
      assert.equal(normalizeActions.length, 1, 'pending must not stack with uncounted detection');
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

  it('still emits P7 validate when verify is stale', () => {
    const dir = tmpDir();
    try {
      const stale = new Date(Date.now() - 40 * MS_PER_DAY).toISOString();
      const now   = new Date().toISOString();
      seedDeployableRoot(dir, { verifyRanAt: stale, auditLastAt: now });
      writeSpec(dir, 'AUDIT_REPORT.md', '# Audit');
      const snap = buildProjectSnapshot(dir);
      assert.ok(snap.health.staleVerify.length > 0);
      assert.ok(
        snap.nextActions.some(a => a.command === 'aitri validate'),
        'P7 must still fire when verify is stale',
      );
    } finally { cleanup(dir); }
  });
});
