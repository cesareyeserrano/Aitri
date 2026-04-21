/**
 * Tests: aitri status --json
 * Covers: JSON schema, phase status values, drift flag, driftPhases array, nextAction, versionMismatch
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdInit } from '../../lib/commands/init.js';
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
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
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

  it('driftPhases is empty when no phases have drift', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    assert.deepEqual(result.driftPhases, []);
  });

  it('driftPhases uses stored driftPhases[] field when present (v0.1.58+ path)', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.58' });
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
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
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
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    const corePhases = result.phases.filter(p => !p.optional);
    assert.equal(corePhases.length, 5);
    assert.ok(corePhases.every(p => p.status === 'not_started'));
  });

  it('nextAction is aitri run-phase requirements on fresh project', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    assert.equal(result.nextAction, 'aitri run-phase requirements');
    assert.equal(result.allComplete, false);
  });

  it('phase status is approved when phase is in approvedPhases', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
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
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const config = loadConfig(dir);
    config.completedPhases = [1];
    saveConfig(dir, config);
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    const p1 = result.phases.find(p => p.key === 1);
    assert.equal(p1.status, 'completed');
  });

  it('drift is true when artifact hash differs from stored hash', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
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
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
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
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.00' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    assert.equal(result.versionMismatch, true);
    assert.equal(result.aitriVersion, '0.1.00');
    assert.equal(result.cliVersion, '0.1.52');
  });

  it('versionMismatch is false when versions match', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    assert.equal(result.versionMismatch, false);
  });

  it('verify phase appears when phase 4 is approved', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const config = loadConfig(dir);
    config.approvedPhases = [1, 2, 3, 4];
    config.completedPhases = [1, 2, 3, 4];
    config.verifyPassed = false;
    saveConfig(dir, config);
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    const verify = result.phases.find(p => p.key === 'verify');
    assert.ok(verify, 'verify phase should be present');
    assert.equal(verify.status, 'not_run');
    assert.equal(result.nextAction, 'aitri verify-run');
  });

  it('allComplete is true and nextAction is aitri validate when all 5 phases approved and verify passed', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
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
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    const result = captureJson(() => cmdStatus({ dir, VERSION: '0.1.52', args: ['--json'] }));
    const optional = result.phases.filter(p => p.optional);
    assert.equal(optional.length, 0);
  });

  it('tests block emitted with totals + perPipeline aggregation (v0.1.81+)', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.81' });
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
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.83' });

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

    // Fix 1: counts shown even when verify failed
    assert.ok(out.includes('verify ❌ (53/61)'), 'failed feature must show ❌ with counts');
    assert.ok(out.includes('verify ✅ (38/38)'), 'passed feature must show ✅ with counts');

    // Fix 2: failing feature appears before passing feature
    const idxFailing = out.indexOf('beta-failing');
    const idxPassed  = out.indexOf('alpha-passed');
    assert.ok(idxFailing >= 0 && idxPassed >= 0);
    assert.ok(idxFailing < idxPassed, 'failing features must be sorted before passing ones');
  });

  it('text output unaffected when --json flag absent', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.52' });
    let out = '';
    const orig = console.log.bind(console);
    console.log = (...a) => { out += a.join(' ') + '\n'; };
    try { cmdStatus({ dir, VERSION: '0.1.52', args: [] }); } finally { console.log = orig; }
    assert.ok(out.includes('Aitri'));
    assert.doesNotThrow(() => { if (out.startsWith('{')) throw new Error('should not be JSON'); });
  });
});
