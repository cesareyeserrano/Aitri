/**
 * Tests: aitri status --json
 * Covers: JSON schema, phase status values, drift flag, driftPhases array, nextAction, versionMismatch
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initFlatProject } from '../fixtures.js';
import { cmdStatus } from '../../lib/commands/status.js';
import { loadConfig, saveConfig } from '../../lib/state.js';

const ROOT_DIR = path.resolve(process.cwd());

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-status-'));
}

function captureJson(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return JSON.parse(out);
}

describe('cmdStatus --json', () => {
  it('returns valid JSON with required top-level fields', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    assert.ok(typeof result.project === 'string');
    assert.ok(typeof result.dir === 'string');
    assert.ok(Array.isArray(result.phases));
    assert.ok(Array.isArray(result.driftPhases));
    assert.ok(typeof result.nextAction === 'string');
    assert.ok(typeof result.allComplete === 'boolean');
    assert.ok(typeof result.inHub === 'boolean');
    assert.ok(typeof result.rejections === 'object');
  });

  // health.driftPresent + health.staleVerify have been part of the documented
  // health contract (STATUS_JSON.md) since v0.1.77 but were never emitted — a
  // consumer reading them got undefined. Guard that they are present.
  it('health emits the full documented field set incl. driftPresent + staleVerify', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    for (const k of ['deployable', 'deployableReasons', 'staleAudit', 'blockedByBugs',
                     'activeFeatures', 'versionMismatch', 'driftPresent', 'staleVerify']) {
      assert.ok(k in result.health, `health.${k} must be present in status --json`);
    }
    assert.ok(Array.isArray(result.health.driftPresent));
    assert.ok(Array.isArray(result.health.staleVerify));
  });

  it('driftPhases is empty when no phases have drift', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    assert.deepEqual(result.driftPhases, []);
  });

  it('driftPhases uses stored driftPhases[] field when present (v0.1.58+ path)', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.58' });
    const config = loadConfig(dir);
    config.approvedPhases  = [1];
    config.completedPhases = [1];
    config.driftPhases     = ['1'];  // stored — no artifact hash needed
    saveConfig(dir, config);
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.58', args: ['--json'] }));
    assert.ok(result.driftPhases.includes(1), 'phase 1 should be in driftPhases (from stored field)');
  });

  it('driftPhases contains key of drifted phase', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const specDir = path.join(dir, 'spec');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, '01_REQUIREMENTS.json'), JSON.stringify({ v: 1 }));
    const config = loadConfig(dir);
    config.approvedPhases = [1];
    config.completedPhases = [1];
    config.artifactHashes = { '1': 'stale_hash_not_matching' };
    saveConfig(dir, config);
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    assert.ok(result.driftPhases.includes(1), 'phase 1 should be in driftPhases');
  });

  it('all core phases present with not_started status on fresh project', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    const corePhases = result.phases.filter(p => !p.optional);
    assert.equal(corePhases.length, 5);
    assert.ok(corePhases.every(p => p.status === 'not_started'));
  });

  it('nextAction is aitri run-phase requirements on fresh project', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    assert.equal(result.nextAction, 'aitri run-phase requirements');
    assert.equal(result.allComplete, false);
  });

  it('phase status is approved when phase is in approvedPhases', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const config = loadConfig(dir);
    config.approvedPhases = [1, 2];
    config.completedPhases = [1, 2];
    saveConfig(dir, config);
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    const p1 = result.phases.find(p => p.key === 1);
    const p2 = result.phases.find(p => p.key === 2);
    assert.equal(p1.status, 'approved');
    assert.equal(p2.status, 'approved');
  });

  it('phase status is completed when in completedPhases but not approvedPhases', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const config = loadConfig(dir);
    config.completedPhases = [1];
    saveConfig(dir, config);
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    const p1 = result.phases.find(p => p.key === 1);
    assert.equal(p1.status, 'completed');
  });

  it('drift is true when artifact hash differs from stored hash', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const specDir = path.join(dir, 'spec');
    fs.mkdirSync(specDir, { recursive: true });
    const artifactPath = path.join(specDir, '01_REQUIREMENTS.json');
    fs.writeFileSync(artifactPath, JSON.stringify({ v: 1 }));
    const config = loadConfig(dir);
    config.approvedPhases = [1];
    config.completedPhases = [1];
    config.artifactHashes = { '1': 'deadbeef_wrong_hash' };
    saveConfig(dir, config);
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    const p1 = result.phases.find(p => p.key === 1);
    assert.equal(p1.drift, true);
  });

  it('drift is false when artifact matches stored hash', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const specDir = path.join(dir, 'spec');
    fs.mkdirSync(specDir, { recursive: true });
    const artifactFile = path.join(specDir, '01_REQUIREMENTS.json');
    const content = JSON.stringify({ v: 1 });
    fs.writeFileSync(artifactFile, content);
    import('../../lib/state.js').then(({ hashArtifact }) => {
      const hash = hashArtifact(content);
      const config = loadConfig(dir);
      config.approvedPhases = [1];
      config.completedPhases = [1];
      config.artifactHashes = { '1': hash };
      saveConfig(dir, config);
    });
    // Just verify drift is false when no hash stored (default behavior)
    const config = loadConfig(dir);
    config.approvedPhases = [1];
    config.completedPhases = [1];
    saveConfig(dir, config);
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    const p1 = result.phases.find(p => p.key === 1);
    assert.equal(p1.drift, false);  // no hash stored → no drift
  });

  it('versionMismatch is true when project version differs from CLI version', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.00' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    assert.equal(result.versionMismatch, true);
    assert.equal(result.aitriVersion, '0.1.00');
    assert.equal(result.cliVersion, '0.1.52');
  });

  it('versionMismatch is false when versions match', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    assert.equal(result.versionMismatch, false);
  });

  it('verify phase appears when phase 4 is approved', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const config = loadConfig(dir);
    config.approvedPhases = [1, 2, 3, 4];
    config.completedPhases = [1, 2, 3, 4];
    config.verifyPassed = false;
    saveConfig(dir, config);
    // B7: approved phases must have their artifacts on disk, or artifact_missing outranks
    // the verify-run suggestion this test pins.
    const specDir = path.join(dir, config.artifactsDir || 'spec');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, '01_REQUIREMENTS.json'), '{"functional_requirements":[]}');
    fs.writeFileSync(path.join(specDir, '02_SYSTEM_DESIGN.md'), '# Design\n');
    fs.writeFileSync(path.join(specDir, '03_TEST_CASES.json'), '{"test_cases":[]}');
    fs.writeFileSync(path.join(specDir, '04_BUILD_REPORT.json'), '{"files_created":[]}');
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    const verify = result.phases.find(p => p.key === 'verify');
    assert.ok(verify, 'verify phase should be present');
    assert.equal(verify.status, 'not_run');
    assert.equal(result.nextAction, 'aitri verify-run');
  });

  it('allComplete is true and nextAction is aitri validate when all 5 phases approved and verify passed', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const config = loadConfig(dir);
    config.approvedPhases = [1, 2, 3, 4, 5];
    config.completedPhases = [1, 2, 3, 4, 5];
    config.verifyPassed = true;
    config.verifySummary = { passed: 1, total: 1 };
    saveConfig(dir, config);
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    assert.equal(result.allComplete, true);
    assert.equal(result.nextAction, 'aitri validate');
  });

  it('optional phases absent from output when artifact does not exist', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    const optional = result.phases.filter(p => p.optional);
    assert.equal(optional.length, 0);
  });

  it('tests block emitted with totals + perPipeline aggregation (v0.1.81+)', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.81' });
    const config = loadConfig(dir);
    config.verifyPassed  = true;
    config.verifySummary = { passed: 30, failed: 0, skipped: 0, total: 30 };
    saveConfig(dir, config);

    const featDir = path.join(dir, 'features', 'alpha');
    fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
    saveConfig(featDir, {
      projectName:   'alpha',
      artifactsDir:  'spec',
      verifySummary: { passed: 53, failed: 8, total: 61 },
    });

    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.81', args: ['--json'] }));
    assert.ok(result.tests, 'tests block present');
    assert.equal(result.tests.totals.passed, 83);
    assert.equal(result.tests.totals.total,  91);
    assert.ok(Array.isArray(result.tests.perPipeline));
    const scopes = result.tests.perPipeline.map(e => e.scope);
    assert.ok(scopes.includes('root'));
    assert.ok(scopes.includes('feature:alpha'));
  });

  it('text features section — failing features first, counts shown for both pass and fail (v0.1.83+)', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.83' });

    // Mark root fully approved so features are visible / pipeline rendering is stable
    const rootCfg = loadConfig(dir);
    rootCfg.approvedPhases = [1, 2, 3, 4, 5];
    rootCfg.completedPhases = [1, 2, 3, 4, 5];
    rootCfg.currentPhase = 5;
    rootCfg.verifyPassed = true;
    rootCfg.verifySummary = { passed: 30, failed: 0, skipped: 0, total: 30 };
    saveConfig(dir, rootCfg);

    const mkFeature = (name, cfg) => {
      const fDir = path.join(dir, 'features', name);
      fs.mkdirSync(path.join(fDir, 'spec'), { recursive: true });
      saveConfig(fDir, {
        projectName:    name,
        artifactsDir:   'spec',
        approvedPhases: [1, 2, 3, 4, 5],
        completedPhases:[1, 2, 3, 4, 5],
        currentPhase:   5,
        ...cfg,
      });
    };

    mkFeature('alpha-passed', {
      verifyPassed:  true,
      verifySummary: { passed: 38, failed: 0, skipped: 0, total: 38 },
      verifyRanAt:   new Date().toISOString(),
    });
    mkFeature('beta-failing', {
      verifyPassed:  false,
      verifySummary: { passed: 53, failed: 8, skipped: 0, total: 61 },
      verifyRanAt:   new Date().toISOString(),
    });

    let out = '';
    const orig = console.log.bind(console);
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    try { cmdStatus({ dir, VERSION: '0.1.83', args: [] }); } finally { console.log = orig; }

    // Fix 1: counts shown even when verify failed (alpha.5: pass/fail/deferred bucket format)
    assert.ok(out.includes('verify ❌ (53 ✓ 8 ✗ 0 ⊘)'), 'failed feature must show ❌ with three-bucket counts');
    assert.ok(out.includes('verify ✅ (38 ✓ 0 ✗ 0 ⊘)'), 'passed feature must show ✅ with three-bucket counts');

    // Fix 2: failing feature appears before passing feature
    const idxFailing = out.indexOf('beta-failing');
    const idxPassed  = out.indexOf('alpha-passed');
    assert.ok(idxFailing >= 0 && idxPassed >= 0);
    assert.ok(idxFailing < idxPassed, 'failing features must be sorted before passing ones');
  });

  it('text output unaffected when --json flag absent', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    let out = '';
    const orig = console.log.bind(console);
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    try { cmdStatus({ dir, VERSION: '0.1.52', args: [] }); } finally { console.log = orig; }
    assert.ok(out.includes('Aitri'));
    assert.doesNotThrow(() => { if (out.startsWith('{')) throw new Error('should not be JSON'); });
  });

  // A1 (alpha.3) — upgrade findings count line
  it('shows unresolved upgrade findings line when findings exist', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const cfg = loadConfig(dir);
    cfg.upgradeFindings = [
      { target: '03_TEST_CASES.json', transform: 'TCs with non-canonical requirement (2)', reason: 'multi-FR', recordedAt: '2026-04-24T00:00:00Z' },
      { target: '01_REQUIREMENTS.json', transform: 'NFRs with free-text title (3)', reason: 'free-text', recordedAt: '2026-04-24T00:00:00Z' },
    ];
    saveConfig(dir, cfg);

    let out = '';
    const orig = console.log.bind(console);
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    try { cmdStatus({ dir, VERSION: '0.1.52', args: [] }); } finally { console.log = orig; }
    assert.ok(/upgrade: 2 unresolved findings/.test(out),
      'status must surface count of upgrade findings');
  });

  it('does not show upgrade findings line when none exist', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    let out = '';
    const orig = console.log.bind(console);
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    try { cmdStatus({ dir, VERSION: '0.1.52', args: [] }); } finally { console.log = orig; }
    assert.ok(!/upgrade:.*unresolved finding/.test(out),
      'status must not mention findings when empty');
  });

  // Defect: the per-phase line "deploy Approved" was the only deploy-related
  // signal in text output. When `health.deployable` was false (e.g. version
  // mismatch), the user saw a row of green checks plus a small warning at the
  // top — easy to misread as "ready to ship". Surface deployable explicitly.
  it('shows "deployable Not ready" when deploy gate is blocked by version mismatch', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.50' });
    const cfg = loadConfig(dir);
    cfg.approvedPhases = [1];
    saveConfig(dir, cfg);

    let out = '';
    const orig = console.log.bind(console);
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    try { cmdStatus({ dir, VERSION: '0.1.99', args: [] }); } finally { console.log = orig; }

    assert.ok(/❌\s+deployable\s+Deploy readiness\s+Not ready/.test(out),
      'status text must surface deployable=false next to phase table');
  });

  it('does not show deployable line on a fresh project with no progress', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.99' });
    let out = '';
    const orig = console.log.bind(console);
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    try { cmdStatus({ dir, VERSION: '0.1.99', args: [] }); } finally { console.log = orig; }
    assert.ok(!/deployable\s+Deploy readiness/.test(out),
      'fresh projects with no phase progress should not advertise deployable status');
  });
});

// ── --json bugs payload: bySeverity + openIds (2026-05-12) ───────────────────
// Closes BACKLOG "Pre-promotion findings" P2: Hub cannot derive per-severity
// counts or open IDs from documented contract. Schema additive — old readers
// see total/open/blocking unchanged; new readers opt into bySeverity/openIds.

describe('cmdStatus --json bugs payload', () => {
  function setupBugs(dir, bugs) {
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.99' });
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'spec/BUGS.json'), JSON.stringify({ bugs }, null, 2));
  }

  it('emits bySeverity + openIds alongside legacy total/open/blocking', () => {
    const dir = tmpDir();
    setupBugs(dir, [
      { id: 'BG-037', severity: 'low',    status: 'open' },
      { id: 'BG-039', severity: 'medium', status: 'open' },
    ]);
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.99', args: ['--json'] }));
    // Legacy fields preserved
    assert.equal(result.bugs.total,    2, 'total unchanged');
    assert.equal(result.bugs.open,     2, 'open unchanged');
    assert.equal(result.bugs.blocking, 0, 'blocking unchanged (no critical/high active)');
    // New additive fields
    assert.deepEqual(result.bugs.bySeverity, { critical: 0, high: 0, medium: 1, low: 1 });
    assert.deepEqual(result.bugs.openIds,    ['BG-037', 'BG-039']);
  });

  it('blocking bugs surface in bySeverity AND in legacy blocking counter', () => {
    const dir = tmpDir();
    setupBugs(dir, [
      { id: 'BG-001', severity: 'critical', status: 'open' },
      { id: 'BG-002', severity: 'high',     status: 'in_progress' },
    ]);
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.99', args: ['--json'] }));
    assert.equal(result.bugs.blocking, 2);
    assert.deepEqual(result.bugs.bySeverity, { critical: 1, high: 1, medium: 0, low: 0 });
  });

  it('empty BUGS.json → bySeverity all zero + openIds empty', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.99' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.99', args: ['--json'] }));
    assert.deepEqual(result.bugs.bySeverity, { critical: 0, high: 0, medium: 0, low: 0 });
    assert.deepEqual(result.bugs.openIds, []);
  });
});

// ── Stale verify display (rc.3, narrowed by STALE-VERIFY-1 rc.84) ──────────
//
// rc.3 (Hub canary 2026-05-12): when a pipeline has verifyRanAt > 14 days the
// status display surfaces a staleness count + oldest age + the resolving
// command (verify-run, not the no-op validate loop).
//
// rc.84 (Cesar canary 2026-06-13, STALE-VERIFY-1): a terminal+clean pipeline
// (all core approved + verify passed + no drift) is NO LONGER stale by the
// calendar — its evidence still holds. So the stale line/nudge now applies only
// to in-flux pipelines; a finished feature or shipped root reaches idle and
// stays there.

describe('cmdStatus — stale verify display', () => {
  const MS_PER_DAY = 86_400_000;

  function captureStdout(fn) {
    let out = '';
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { out += chunk; return true; };
    try { fn(); } finally { process.stdout.write = orig; }
    return out;
  }

  function seedDeployable(dir, overrides = {}) {
    saveConfig(dir, {
      projectName:     'demo',
      aitriVersion:    '2.0.0-rc.3',
      artifactsDir:    'spec',
      approvedPhases:  [1, 2, 3, 4, 5],
      completedPhases: [1, 2, 3, 4, 5],
      verifyPassed:    true,
      verifySummary:   { passed: 1, failed: 0, total: 1 },
      ...overrides,
    });
    const spec = path.join(dir, 'spec');
    fs.mkdirSync(spec, { recursive: true });
    fs.writeFileSync(path.join(spec, '01_REQUIREMENTS.json'), JSON.stringify({
      project_name: 'demo',
      functional_requirements: [{ id: 'FR-001', priority: 'MUST', type: 'logic', title: 'Do', acceptance_criteria: ['AC1'] }],
      non_functional_requirements: [],
      user_stories: [],
    }));
    fs.writeFileSync(path.join(spec, '02_SYSTEM_DESIGN.md'), '# Design\n');
    fs.writeFileSync(path.join(spec, '03_TEST_CASES.json'), '{"test_cases":[]}');
    fs.writeFileSync(path.join(spec, '04_BUILD_REPORT.json'), '{"modules":[],"files_created":[],"setup_commands":[],"technical_debt":[]}');
    fs.writeFileSync(path.join(spec, '04_TEST_RESULTS.json'), JSON.stringify({
      summary: { passed: 1, failed: 0, skipped: 0, total: 1 },
      fr_coverage: [{ fr_id: 'FR-001', status: 'covered', tests_passing: 1, tests_failing: 0 }],
    }));
    fs.writeFileSync(path.join(spec, '05_TRACEABILITY.json'), '{"requirement_compliance":[]}');
    fs.writeFileSync(path.join(spec, 'AUDIT_REPORT.md'), '# Audit\n');
  }

  it('prints a "verify: stale" line for an IN-FLUX pipeline with old verifyRanAt', () => {
    // In-flux = not terminal+clean (here: core not fully approved, verify not
    // passed). The calendar staleness still applies while work is unfinished.
    const dir = tmpDir();
    const now   = new Date().toISOString();
    const stale = new Date(Date.now() - 25 * MS_PER_DAY).toISOString();
    seedDeployable(dir, {
      approvedPhases: [1, 2, 3, 4],
      verifyPassed:   false,
      verifyRanAt:    stale,
      auditLastAt:    now,
    });
    const out = captureStdout(() => cmdStatus({ dir, VERSION: '2.0.0-rc.3', args: [] }));
    assert.match(out, /verify:\s+stale on 1 pipeline \(oldest 25 days\) — run: aitri verify-run/);
  });

  it('does not print the line when no pipeline is stale', () => {
    const dir = tmpDir();
    const now = new Date().toISOString();
    seedDeployable(dir, { verifyRanAt: now, auditLastAt: now });
    const out = captureStdout(() => cmdStatus({ dir, VERSION: '2.0.0-rc.3', args: [] }));
    assert.equal(/verify:\s+stale/.test(out), false);
  });

  it('STALE-VERIFY-1: a finished (terminal+clean) project with an OLD verify is NOT stale and reaches idle', () => {
    // The user-reported regression: a deployable project whose verify ran weeks
    // ago must not nag to re-verify by the calendar — nothing it tracks changed.
    const dir = tmpDir();
    const now   = new Date().toISOString();
    const stale = new Date(Date.now() - 30 * MS_PER_DAY).toISOString();
    seedDeployable(dir, { verifyRanAt: stale, auditLastAt: now });
    const out = captureStdout(() => cmdStatus({ dir, VERSION: '2.0.0-rc.3', args: [] }));
    assert.equal(/verify:\s+stale/.test(out), false, 'no stale line for a finished, undrifted project');
    assert.equal(/Next: aitri verify-run/.test(out), false, 'no calendar-driven verify-run nudge');
  });
});
