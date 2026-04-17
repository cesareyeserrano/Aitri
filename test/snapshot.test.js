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
  SNAPSHOT_VERSION,
} from '../lib/snapshot.js';

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
