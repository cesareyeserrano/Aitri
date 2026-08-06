/**
 * Tests for GATE-SCOPE-BLIND-0805 (ADR-086, 2.2.0-rc.8) — root mechanical gates
 * aggregate blocking bugs across ALL scopes.
 *
 * Before: root `verify-complete` and `reconcile --resolve` read only root BUGS.json,
 * while the snapshot deploy gate aggregated cross-scope — an in-progress critical
 * FEATURE bug let root verify-complete flip `verifyPassed` (and Phase 5's sealing path
 * gates on `verifyPassed` alone) while status said blocked. The asymmetry is
 * deliberate and pinned here: feature gates stay scope-local (root bugs never block a
 * feature's own verification).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import path   from 'node:path';
import os     from 'node:os';

import { saveConfig, hashResultsFile } from '../lib/state.js';
import { getBlockingBugs, getBlockingBugsAllScopes } from '../lib/commands/bug.js';
import { cmdVerifyComplete } from '../lib/commands/verify.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-gate-scope-test-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
function writeBugs(base, artifactsDir, bugs) {
  const d = path.join(base, artifactsDir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'BUGS.json'), JSON.stringify({ schemaVersion: '1', bugs }, null, 2));
}
const CRIT = (id, title) => ({ id, title, severity: 'critical', status: 'open' });
const LOW  = (id, title) => ({ id, title, severity: 'low', status: 'open' });

function seedRoot(dir) {
  saveConfig(dir, { projectName: 'gs', artifactsDir: 'spec', approvedPhases: [1] });
}
function seedFeature(dir, name) {
  const featDir = path.join(dir, 'features', name);
  fs.mkdirSync(featDir, { recursive: true });
  saveConfig(featDir, { projectName: name, artifactsDir: 'spec', approvedPhases: [1] });
  return featDir;
}
const err = (msg) => { throw new Error(msg); };

describe('getBlockingBugsAllScopes()', () => {
  it('aggregates root + feature blockers with scope provenance', () => {
    const dir = tmpDir();
    try {
      seedRoot(dir);
      writeBugs(dir, 'spec', [CRIT('BG-001', 'root crash'), LOW('BG-002', 'cosmetic')]);
      const f = seedFeature(dir, 'pay');
      writeBugs(f, 'spec', [CRIT('BG-001', 'feature leak')]);
      const out = getBlockingBugsAllScopes(dir, { artifactsDir: 'spec' }, err);
      assert.deepEqual(out.map(o => [o.scope, o.bug.id, o.bug.title]), [
        ['root', 'BG-001', 'root crash'],
        ['feature:pay', 'BG-001', 'feature leak'],
      ]);
    } finally { cleanup(dir); }
  });

  it('THE 0805 CASE: clean root + critical FEATURE bug → root gate input is non-empty', () => {
    const dir = tmpDir();
    try {
      seedRoot(dir);   // no root BUGS.json at all
      const f = seedFeature(dir, 'pay');
      writeBugs(f, 'spec', [{ id: 'BG-007', title: 'in-progress critical', severity: 'critical', status: 'in_progress' }]);
      const out = getBlockingBugsAllScopes(dir, { artifactsDir: 'spec' }, err);
      assert.equal(out.length, 1);
      assert.equal(out[0].scope, 'feature:pay');
      assert.equal(out[0].scopeName, 'pay');
      // The pre-0805 input set (scope-local) would have been empty — pin the contrast:
      assert.equal(getBlockingBugs(dir, { artifactsDir: 'spec' }).length, 0);
    } finally { cleanup(dir); }
  });

  it('FEATURE gates stay scope-local: a root critical bug never enters the feature input set', () => {
    const dir = tmpDir();
    try {
      seedRoot(dir);
      writeBugs(dir, 'spec', [CRIT('BG-001', 'root crash')]);
      const f = seedFeature(dir, 'pay');   // feature has no bugs
      assert.equal(getBlockingBugs(f, { artifactsDir: 'spec' }).length, 0,
        'the feature gate input (getBlockingBugs on the feature dir) must not see root bugs');
    } finally { cleanup(dir); }
  });

  it('B8 per scope: an unreadable FEATURE BUGS.json refuses instead of silently dropping its blockers', () => {
    const dir = tmpDir();
    try {
      seedRoot(dir);
      const f = seedFeature(dir, 'pay');
      fs.mkdirSync(path.join(f, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(f, 'spec', 'BUGS.json'), '{ not json');
      assert.throws(() => getBlockingBugsAllScopes(dir, { artifactsDir: 'spec' }, err),
        /malformed JSON/);
    } finally { cleanup(dir); }
  });

  it('no features dir / orphan feature dirs (no .aitri) → root-only input, no crash', () => {
    const dir = tmpDir();
    try {
      seedRoot(dir);
      writeBugs(dir, 'spec', [CRIT('BG-001', 'root crash')]);
      fs.mkdirSync(path.join(dir, 'features', 'half-created'), { recursive: true }); // no .aitri
      const out = getBlockingBugsAllScopes(dir, { artifactsDir: 'spec' }, err);
      assert.deepEqual(out.map(o => o.scope), ['root']);
    } finally { cleanup(dir); }
  });
});

// ── Wiring pin: cmdVerifyComplete actually consults the aggregate ────────────
// (adversarial find: helper-only tests would stay green if the gate reverted to a
// scope-local read — these exercise the command itself.)

function seedVerifyCompleteFixture(dir) {
  fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  const w = (f, c) => fs.writeFileSync(path.join(dir, f), c);
  w('.aitri', JSON.stringify({
    projectName: 'p', artifactsDir: 'spec',
    approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
  }));
  w('spec/01_REQUIREMENTS.json', JSON.stringify({
    functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
  }));
  w('spec/03_TEST_CASES.json', JSON.stringify({
    test_cases: [{ id: 'TC-001', title: 't', requirement_id: 'FR-001', expected_result: 'r' }],
  }));
  w('spec/04_BUILD_REPORT.json', JSON.stringify({
    files_created: [{ path: 'x.js' }], test_runner: 'node --test',
  }));
  const results = JSON.stringify({
    executed_at: new Date().toISOString(),
    test_runner: 'node --test', exit_code: 0,
    results: [{ tc_id: 'TC-001', status: 'pass' }],
    fr_coverage: [{ fr_id: 'FR-001', tests_passing: 1, tests_failing: 0, tests_skipped: 0, tests_manual: 0, status: 'covered' }],
    summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
  });
  w('spec/04_TEST_RESULTS.json', results);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
  cfg.verifyResultsHash = hashResultsFile(results);
  fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(cfg));
}

function runComplete(opts) {
  const origLog = console.log; const origWrite = process.stderr.write;
  console.log = () => {}; process.stderr.write = () => true;
  try { cmdVerifyComplete({ err: (m) => { throw new Error(m); }, ...opts }); }
  finally { console.log = origLog; process.stderr.write = origWrite; }
}

describe('cmdVerifyComplete — wiring pins', () => {
  it('ROOT verify-complete refuses on a FEATURE blocking bug with scope provenance + scoped fix command', () => {
    const dir = tmpDir();
    try {
      seedVerifyCompleteFixture(dir);
      const f = seedFeature(dir, 'pay');
      writeBugs(f, 'spec', [CRIT('BG-001', 'feature leak')]);
      assert.throws(() => runComplete({ dir }),
        (e) => /feature:pay/.test(e.message) && /aitri feature bug pay fix/.test(e.message)
               && /whole tree ships together/.test(e.message));
    } finally { cleanup(dir); }
  });

  it('ROOT verify-complete passes (no bug refusal) when only NON-blocking feature bugs exist', () => {
    const dir = tmpDir();
    try {
      seedVerifyCompleteFixture(dir);
      const f = seedFeature(dir, 'pay');
      writeBugs(f, 'spec', [LOW('BG-002', 'cosmetic')]);
      runComplete({ dir });   // must not throw
    } finally { cleanup(dir); }
  });

  it('FEATURE verify-complete stays scope-local: refuses on its own bug with the feature-scoped command, ignores root bugs', () => {
    const dir = tmpDir();
    try {
      // Root has a critical bug; the feature is clean → feature gate must NOT refuse on it
      seedVerifyCompleteFixture(dir);
      writeBugs(dir, 'spec', [CRIT('BG-001', 'root crash')]);
      const f = seedFeature(dir, 'pay');
      seedVerifyCompleteFixture(f);
      runComplete({ dir: f, featureRoot: dir, scopeName: 'pay' });   // must not throw

      // Now the feature's own bug → refuse with the feature-scoped fix command
      writeBugs(f, 'spec2', []); // no-op guard against accidental reuse
      writeBugs(f, 'spec', [CRIT('BG-003', 'feature crash')]);
      assert.throws(() => runComplete({ dir: f, featureRoot: dir, scopeName: 'pay' }),
        (e) => /BG-003/.test(e.message) && /aitri feature bug pay fix/.test(e.message));
    } finally { cleanup(dir); }
  });
});
