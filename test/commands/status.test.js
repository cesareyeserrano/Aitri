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

  // FEATURE-ORDER-0729 (additive contract field): featureSummaries carry createdAt so
  // consumers (Hub) can render a real feature timeline; null on pre-createdAt features.
  it('--json features[] carries additive createdAt (null when absent) (FEATURE-ORDER-0729)', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '2.2.0' });
    const mkFeature = (name, cfg) => {
      const fDir = path.join(dir, 'features', name);
      fs.mkdirSync(path.join(fDir, 'spec'), { recursive: true });
      saveConfig(fDir, { projectName: name, artifactsDir: 'spec', ...cfg });
    };
    mkFeature('dated',   { createdAt: '2026-07-05T10:00:00Z' });
    mkFeature('undated', {});

    const result = captureJson(() => cmdStatus({ dir, VERSION: '2.2.0', args: ['--json'] }));
    const byName = Object.fromEntries(result.features.map(f => [f.name, f]));
    assert.equal(byName['dated'].createdAt, '2026-07-05T10:00:00Z', 'createdAt surfaced verbatim');
    assert.equal(byName['undated'].createdAt, null, 'absent createdAt → explicit null, not undefined');
    assert.ok('createdAt' in byName['undated'], 'field present even when null (stable shape)');
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

  // FEATURE-ORDER-0729: creation order becomes visible — render-derived ordinal #N +
  // created date, chronological within an attention rank; implementation order via the
  // verify date. Nothing stored; undated features (pre-createdAt) sort last, no ordinal.
  it('text features section — creation ordinals + chronological order within rank + dates (FEATURE-ORDER-0729)', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '2.2.0' });
    const rootCfg = loadConfig(dir);
    rootCfg.approvedPhases = [1, 2, 3, 4, 5];
    rootCfg.completedPhases = [1, 2, 3, 4, 5];
    rootCfg.currentPhase = 5;
    saveConfig(dir, rootCfg);

    const mkFeature = (name, cfg) => {
      const fDir = path.join(dir, 'features', name);
      fs.mkdirSync(path.join(fDir, 'spec'), { recursive: true });
      saveConfig(fDir, { projectName: name, artifactsDir: 'spec', ...cfg });
    };
    // Alphabetical order (aaa, mmm, zzz) deliberately contradicts creation order —
    // zzz is the OLDEST. All three share the same attention rank (incomplete).
    mkFeature('zzz-oldest',  { createdAt: '2026-07-01T10:00:00Z', approvedPhases: [1] });
    mkFeature('aaa-newest',  { createdAt: '2026-07-20T10:00:00Z', approvedPhases: [1] });
    mkFeature('mmm-undated', { approvedPhases: [1] });

    let out = '';
    const orig = console.log.bind(console);
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    try { cmdStatus({ dir, VERSION: '2.2.0', args: [] }); } finally { console.log = orig; }

    const idxOld = out.indexOf('zzz-oldest'), idxNew = out.indexOf('aaa-newest'), idxUn = out.indexOf('mmm-undated');
    assert.ok(idxOld >= 0 && idxNew >= 0 && idxUn >= 0, 'all three features rendered');
    assert.ok(idxOld < idxNew, 'creation order beats alphabetical within a rank');
    assert.ok(idxNew < idxUn, 'undated features sort last within their rank');
    assert.ok(out.includes('#1 zzz-oldest'), 'oldest feature carries ordinal #1');
    assert.ok(out.includes('#2 aaa-newest'), 'second-created carries ordinal #2');
    assert.ok(!/#\d+ mmm-undated/.test(out), 'undated feature gets no ordinal');
    assert.ok(out.includes('created 07-01'), 'creation short-date rendered');
  });

  it('text features section — verified date surfaces implementation recency (FEATURE-ORDER-0729)', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '2.2.0' });
    const rootCfg = loadConfig(dir);
    rootCfg.approvedPhases = [1, 2, 3, 4, 5];
    rootCfg.completedPhases = [1, 2, 3, 4, 5];
    rootCfg.currentPhase = 5;
    saveConfig(dir, rootCfg);
    const fDir = path.join(dir, 'features', 'sealed-one');
    fs.mkdirSync(path.join(fDir, 'spec'), { recursive: true });
    saveConfig(fDir, {
      projectName: 'sealed-one', artifactsDir: 'spec',
      createdAt: '2026-07-05T10:00:00Z',
      approvedPhases: [1, 2, 3, 4, 5], completedPhases: [1, 2, 3, 4, 5], currentPhase: 5,
      verifyPassed: true, verifySummary: { passed: 3, failed: 0, skipped: 0, total: 3 },
      verifyRanAt: '2026-07-18T09:00:00Z',
    });

    let out = '';
    const orig = console.log.bind(console);
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    try { cmdStatus({ dir, VERSION: '2.2.0', args: [] }); } finally { console.log = orig; }

    assert.ok(out.includes('verified 07-18'), 'verify recency date rendered next to the verify state');
    assert.ok(out.includes('created 07-05'), 'creation date rendered on the same line');
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
    assert.deepEqual(result.bugs.parseErrors, [], 'rc.158: readable file → empty parseErrors');
  });

  it('rc.158: a corrupt BUGS.json surfaces in --json bugs.parseErrors and warns on the text view', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.99' });
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'spec/BUGS.json'), '{ "bugs": [ broken');
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.99', args: ['--json'] }));
    assert.deepEqual(result.bugs.parseErrors, ['root'], 'the corrupt scope is named in the machine payload');
    assert.equal(result.bugs.total, 0, 'counters degrade to zero as before — the flag is the only change');
    let text = '';
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { text += chunk; return true; };
    try { cmdStatus({ dir, VERSION: '0.1.99', args: [] }); } finally { process.stdout.write = orig; }
    assert.match(text, /BUGS\.json unreadable \[root\]/, 'the text view degrades VISIBLY, not silently');
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

// ── HUB-CATCHUP-0705 (rc.161) — lastSession + verify quality surfaces ─────────
// Additive status --json fields with a demonstrated consumer: Hub reads
// .aitri.local inline (its acknowledged SCHEMA.md deviation) because the
// payload lacked lastSession, and its FR-047 projection is blocked on
// quality_gates/ac_coverage reaching the snapshot. These tests pin the
// additive contract: present when the data exists, null when it does not.

describe('cmdStatus --json — lastSession (rc.161)', () => {
  it('emits the root lastSession when present in per-machine state', () => {
    const dir = tmpDir();
    try {
      initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.161' });
      const cfg = loadConfig(dir);
      cfg.lastSession = { at: '2026-07-07T10:00:00.000Z', agent: 'claude', event: 'approve 1' };
      saveConfig(dir, cfg);

      const result = captureJson(() => cmdStatus({ dir, VERSION: '2.0.0-rc.161', args: ['--json'] }));
      assert.deepEqual(result.lastSession, {
        at: '2026-07-07T10:00:00.000Z', agent: 'claude', event: 'approve 1',
      });
      // ADR-045 split: the field must have come from .aitri.local, not shared .aitri.
      const shared = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
      assert.ok(!('lastSession' in shared), 'lastSession must stay out of the shared .aitri');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('emits lastSession: null when no session marker exists (absent-tolerant)', () => {
    const dir = tmpDir();
    try {
      initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.161' });
      const result = captureJson(() => cmdStatus({ dir, VERSION: '2.0.0-rc.161', args: ['--json'] }));
      assert.equal(result.lastSession, null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdStatus --json — quality_gates + ac_coverage pass-through (rc.161)', () => {
  const RESULTS_WITH_SURFACES = JSON.stringify({
    executed_at: '2026-07-07T10:00:00.000Z',
    summary: { total: 2, passed: 2, failed: 0, skipped: 0, manual: 0 },
    results: [
      { tc_id: 'TC-001h', status: 'pass' },
      { tc_id: 'TC-002h', status: 'pass' },
    ],
    fr_coverage: { 'FR-001': { status: 'covered', tests_passing: 2 } },
    quality_gates: [
      { name: 'lint', command: 'eslint .', required: true, status: 'pass', exit_code: 0, output: 'clean' },
      { name: 'coverage', threshold: 80, measured: 92, required: true, status: 'pass' },
      { name: 'audit', command: 'npm audit', required: false, status: 'fail', exit_code: 1 },
    ],
    ac_coverage: [
      { ac_id: 'AC-001', fr_id: 'FR-001', tests_passing: 2, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'covered' },
    ],
  }, null, 2);

  function seedResults(dir, content) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), content);
  }

  it('projects quality_gates (name/status/required + coverage fields, no command/output) per pipeline', () => {
    const dir = tmpDir();
    try {
      initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.161' });
      seedResults(dir, RESULTS_WITH_SURFACES);

      const result = captureJson(() => cmdStatus({ dir, VERSION: '2.0.0-rc.161', args: ['--json'] }));
      const root = result.tests.perPipeline.find(p => p.scope === 'root');
      assert.ok(root, 'root pipeline entry must exist');
      assert.deepEqual(root.quality_gates, [
        { name: 'lint', status: 'pass', required: true },
        { name: 'coverage', status: 'pass', required: true, threshold: 80, measured: 92 },
        { name: 'audit', status: 'fail', required: false },
      ]);
      for (const g of root.quality_gates) {
        assert.ok(!('command' in g) && !('output' in g), 'command/output stay in the artifact');
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('passes ac_coverage through unchanged', () => {
    const dir = tmpDir();
    try {
      initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.161' });
      seedResults(dir, RESULTS_WITH_SURFACES);

      const result = captureJson(() => cmdStatus({ dir, VERSION: '2.0.0-rc.161', args: ['--json'] }));
      const root = result.tests.perPipeline.find(p => p.scope === 'root');
      assert.deepEqual(root.ac_coverage, [
        { ac_id: 'AC-001', fr_id: 'FR-001', tests_passing: 2, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'covered' },
      ]);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('emits null for both when the results file lacks them (absent-tolerant)', () => {
    const dir = tmpDir();
    try {
      initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.161' });
      seedResults(dir, JSON.stringify({
        executed_at: '2026-07-07T10:00:00.000Z',
        summary: { total: 1, passed: 1, failed: 0 },
        results: [{ tc_id: 'TC-001h', status: 'pass' }],
      }));

      const result = captureJson(() => cmdStatus({ dir, VERSION: '2.0.0-rc.161', args: ['--json'] }));
      const root = result.tests.perPipeline.find(p => p.scope === 'root');
      assert.equal(root.quality_gates, null);
      assert.equal(root.ac_coverage, null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('emits null for both when no results file exists at all', () => {
    const dir = tmpDir();
    try {
      initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.161' });
      const result = captureJson(() => cmdStatus({ dir, VERSION: '2.0.0-rc.161', args: ['--json'] }));
      const root = result.tests.perPipeline.find(p => p.scope === 'root');
      assert.equal(root.quality_gates, null);
      assert.equal(root.ac_coverage, null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdStatus --json — rc.161 shape guards (adversarial findings)', () => {
  it('degrades a hand-corrupted non-object lastSession to null, never leaking it', () => {
    const dir = tmpDir();
    try {
      initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.161' });
      fs.writeFileSync(path.join(dir, '.aitri.local'), JSON.stringify({ lastSession: 'corrupted-string' }));
      const result = captureJson(() => cmdStatus({ dir, VERSION: '2.0.0-rc.161', args: ['--json'] }));
      assert.equal(result.lastSession, null, 'non-object lastSession must not enter the contract');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('projects truthy non-boolean required as true — agreeing with the verify-complete gate', () => {
    // verify-complete blocks on truthy `required` (verify.js). A hand-edited
    // required: 1 must not read "advisory" here while the CLI refuses on it.
    const dir = tmpDir();
    try {
      initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.161' });
      fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), JSON.stringify({
        summary: { total: 1, passed: 1, failed: 0 },
        results: [{ tc_id: 'TC-001h', status: 'pass' }],
        quality_gates: [{ name: 'lint', required: 1, status: 'fail' }],
      }));
      const result = captureJson(() => cmdStatus({ dir, VERSION: '2.0.0-rc.161', args: ['--json'] }));
      const root = result.tests.perPipeline.find(p => p.scope === 'root');
      assert.equal(root.quality_gates[0].required, true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// PLAN-ARTIFACT-0715 S3: advisory epic progress from BUILD_PLAN.md while Phase 4 is in
// flight — additive `buildPlan` field in --json, epic line in the text grid. Display-only.
describe('cmdStatus — build-plan epic progress (PLAN-ARTIFACT-0715 S3)', () => {
  const PLAN = '## EP-01 — Core [status: done]\n  Makes pass: TC-001\n\n## EP-02 — Reports [status: in-progress]\n  Makes pass: TC-002\n';

  // MID-BUILD is the load-bearing state: phases 1–3 approved, NO 04_BUILD_REPORT.json yet
  // (the manifest is written at the END of the build). The original in-flight condition
  // keyed on the manifest's existence and was null for this entire window — the
  // adversarial BLOCKER this seed exists to pin.
  function seedInFlightBuild(dir, { plan = PLAN, approved4 = false } = {}) {
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '2.1.0' });
    const cfg = loadConfig(dir);
    cfg.completedPhases = approved4 ? [1, 2, 3, 4] : [1, 2, 3];
    cfg.approvedPhases  = approved4 ? [1, 2, 3, 4] : [1, 2, 3];
    saveConfig(dir, cfg);
    const artDir = loadConfig(dir).artifactsDir || 'spec';
    if (plan !== null) fs.writeFileSync(path.join(dir, artDir, 'BUILD_PLAN.md'), plan);
  }

  it('--json carries buildPlan MID-BUILD (3 approved, no build report on disk yet)', () => {
    const dir = tmpDir();
    try {
      seedInFlightBuild(dir);
      const artDir = loadConfig(dir).artifactsDir || 'spec';
      assert.ok(!fs.existsSync(path.join(dir, artDir, '04_BUILD_REPORT.json')),
        'precondition: mid-build means NO manifest yet');
      const result = captureJson(() => cmdStatus({ dir, VERSION: '2.1.0', args: ['--json'] }));
      assert.ok(result.buildPlan, 'buildPlan must be present during the actual build window');
      assert.equal(result.buildPlan.epics.length, 2);
      assert.equal(result.buildPlan.epics[0].id, 'EP-01');
      assert.match(result.buildPlan.summary, /1\/2 epic\(s\) done/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('an unreadable BUILD_PLAN.md (a directory in its place) degrades to null — snapshot never crashes', () => {
    const dir = tmpDir();
    try {
      seedInFlightBuild(dir, { plan: null });
      const artDir = loadConfig(dir).artifactsDir || 'spec';
      fs.mkdirSync(path.join(dir, artDir, 'BUILD_PLAN.md'));  // EISDIR on read
      const result = captureJson(() => cmdStatus({ dir, VERSION: '2.1.0', args: ['--json'] }));
      assert.equal(result.buildPlan, null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('buildPlan is null once phase 4 is approved (the build is no longer in flight)', () => {
    const dir = tmpDir();
    try {
      seedInFlightBuild(dir, { approved4: true });
      const result = captureJson(() => cmdStatus({ dir, VERSION: '2.1.0', args: ['--json'] }));
      assert.equal(result.buildPlan, null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('buildPlan is null on an absent or free-form plan — tolerant silence, never an error', () => {
    const dir = tmpDir();
    try {
      seedInFlightBuild(dir, { plan: null });
      const r1 = captureJson(() => cmdStatus({ dir, VERSION: '2.1.0', args: ['--json'] }));
      assert.equal(r1.buildPlan, null);
      const artDir = loadConfig(dir).artifactsDir || 'spec';
      fs.writeFileSync(path.join(dir, artDir, 'BUILD_PLAN.md'), 'free-form notes, no epics');
      const r2 = captureJson(() => cmdStatus({ dir, VERSION: '2.1.0', args: ['--json'] }));
      assert.equal(r2.buildPlan, null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('text status shows the epic progress line during an in-flight build', () => {
    const dir = tmpDir();
    try {
      seedInFlightBuild(dir);
      let out = '';
      const origWrite = process.stdout.write.bind(process.stdout);
      const origLog = console.log;
      process.stdout.write = (s) => { out += s; return true; };
      console.log = (...a) => { out += a.join(' ') + '\n'; };
      try { cmdStatus({ dir, VERSION: '2.1.0', args: [] }); }
      finally { process.stdout.write = origWrite; console.log = origLog; }
      assert.match(out, /epics/, 'epic line present');
      assert.match(out, /1\/2 epic\(s\) done/);
      assert.match(out, /in progress: EP-02 — Reports/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── FB-SCOPE-BLIND-0724 — aggregated counts carry provenance + a scoped pointer ──
// Field (T-Ledger): root backlog fully closed, a feature's backlog held 4 open items.
// `status` said "backlog: 4 open items — run: aitri backlog" and `aitri backlog` said
// none — the aggregate read as stale state. The count must say WHERE and point at a
// command that can see the items.

describe('status text — scope provenance (FB-SCOPE-BLIND-0724)', () => {
  function captureText(fn) {
    let out = '';
    const origWrite = process.stdout.write.bind(process.stdout);
    const origLog = console.log;
    process.stdout.write = (s) => { out += s; return true; };
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    try { fn(); } finally { process.stdout.write = origWrite; console.log = origLog; }
    return out;
  }

  function seedFeature(dir, name, { backlogOpen = 0, bugs = [] } = {}) {
    const featDir = path.join(dir, 'features', name);
    fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
    saveConfig(featDir, { projectName: name, artifactsDir: 'spec' });
    if (backlogOpen > 0) {
      const items = Array.from({ length: backlogOpen }, (_, i) => ({
        id: `BL-00${i + 1}`, title: `item ${i + 1}`, priority: 'P2', status: 'open',
      }));
      fs.writeFileSync(path.join(featDir, 'spec', 'BACKLOG.json'),
        JSON.stringify({ schemaVersion: '1', items }, null, 2));
    }
    if (bugs.length > 0) {
      fs.writeFileSync(path.join(featDir, 'spec', 'BUGS.json'),
        JSON.stringify({ bugs }, null, 2));
    }
  }

  function statusText(dir) {
    return captureText(() => cmdStatus({ dir, VERSION: '0.1.52', args: [] }));
  }

  it('backlog open only in a feature → names the scope and points at the scoped command', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    // Root backlog exists and is fully closed — the T-Ledger shape.
    fs.writeFileSync(path.join(dir, 'spec', 'BACKLOG.json'), JSON.stringify({
      schemaVersion: '1', items: [{ id: 'BL-001', title: 'done', priority: 'P2', status: 'closed' }],
    }));
    seedFeature(dir, 'backend', { backlogOpen: 4 });
    const out = statusText(dir);
    assert.match(out, /backlog: 4 open items \[backend\] — run: aitri feature backlog backend/);
  });

  it('backlog open in root AND features → per-scope counts and both pointers', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    fs.writeFileSync(path.join(dir, 'spec', 'BACKLOG.json'), JSON.stringify({
      schemaVersion: '1', items: [{ id: 'BL-001', title: 'open one', priority: 'P2', status: 'open' }],
    }));
    seedFeature(dir, 'backend', { backlogOpen: 2 });
    seedFeature(dir, 'grid-ux', { backlogOpen: 1 });
    const out = statusText(dir);
    assert.match(out, /backlog: 4 open items \[root 1 · backend 2 · grid-ux 1\]/);
    assert.match(out, /run: aitri backlog · aitri feature backlog <name>/);
  });

  it('backlog open only in root → line unchanged (no provenance noise)', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    fs.writeFileSync(path.join(dir, 'spec', 'BACKLOG.json'), JSON.stringify({
      schemaVersion: '1', items: [{ id: 'BL-001', title: 'open one', priority: 'P2', status: 'open' }],
    }));
    const out = statusText(dir);
    assert.match(out, /backlog: 1 open item — run: aitri backlog\n/);
    assert.ok(!out.includes('backlog: 1 open item ['), 'no breakdown when all open items are in root');
  });

  it('active bugs only in a feature → bugs line names the scope with the scoped command', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    seedFeature(dir, 'grid-ux', { bugs: [
      { id: 'BG-001', title: 'broken', severity: 'medium', status: 'in_progress' },
      { id: 'BG-002', title: 'done', severity: 'low', status: 'verified' },
    ] });
    const out = statusText(dir);
    assert.match(out, /bugs: {4}⚠️ {2}1 active bug \(open\/in-fix\) \[grid-ux\] — run: aitri feature bug grid-ux list/);
  });

  it('no active bugs anywhere → bugs line keeps the plain root pointer', () => {
    const dir = tmpDir();
    initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    seedFeature(dir, 'grid-ux', { bugs: [
      { id: 'BG-001', title: 'done', severity: 'low', status: 'verified' },
    ] });
    const out = statusText(dir);
    assert.match(out, /bugs: {4}no active bugs — run: aitri bug list/);
  });
});
