import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runReview } from '../../lib/commands/review.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-review-'));
}

function writeArtifact(dir, name, obj) {
  const specDir = path.join(dir, 'spec');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, name), JSON.stringify(obj, null, 2));
}

function baseConfig(dir) {
  return { artifactsDir: 'spec', approvedPhases: [], completedPhases: [] };
}

function makeReqs(frs) {
  return { functional_requirements: frs };
}

function makeTCs(tcs) {
  return { test_cases: tcs };
}

function makeResults(results) {
  return { executed_at: new Date().toISOString(), results, fr_coverage: [], summary: {} };
}

// ── Requirements → Test Cases ─────────────────────────────────────────────────

describe('runReview() — Requirements → Test Cases', () => {

  it('returns no errors on clean pipeline', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', makeReqs([
      { id: 'FR-001', priority: 'MUST', title: 'Login' },
    ]));
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([
      { id: 'TC-001', requirement_id: 'FR-001', title: 'Login works', status: 'open' },
    ]));
    const { errors, warnings } = runReview(dir, baseConfig(dir), 'phase3');
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
  });

  it('errors on MUST FR with no active TC', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', makeReqs([
      { id: 'FR-001', priority: 'MUST', title: 'Login' },
    ]));
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([]));
    const { errors } = runReview(dir, baseConfig(dir), 'phase3');
    assert.ok(errors.some(e => e.includes('FR-001') && e.includes('MUST')));
  });

  it('warns on SHOULD FR with no TC', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', makeReqs([
      { id: 'FR-002', priority: 'SHOULD', title: 'Dark mode' },
    ]));
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([]));
    const { errors, warnings } = runReview(dir, baseConfig(dir), 'phase3');
    assert.equal(errors.length, 0);
    assert.ok(warnings.some(w => w.includes('FR-002') && w.includes('SHOULD')));
  });

  it('does not count skip-status TCs as coverage', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', makeReqs([
      { id: 'FR-001', priority: 'MUST', title: 'Login' },
    ]));
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([
      { id: 'TC-001', requirement_id: 'FR-001', title: 'Login', status: 'skip' },
    ]));
    const { errors } = runReview(dir, baseConfig(dir), 'phase3');
    assert.ok(errors.some(e => e.includes('FR-001')));
  });

  it('errors on TC referencing non-existent FR', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', makeReqs([
      { id: 'FR-001', priority: 'MUST', title: 'Login' },
    ]));
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([
      { id: 'TC-001', requirement_id: 'FR-001', title: 'Login', status: 'open' },
      { id: 'TC-002', requirement_id: 'FR-999', title: 'Orphan', status: 'open' },
    ]));
    const { errors } = runReview(dir, baseConfig(dir), 'phase3');
    assert.ok(errors.some(e => e.includes('TC-002') && e.includes('FR-999')));
  });

  it('warns on TC with no requirement_id', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', makeReqs([
      { id: 'FR-001', priority: 'MUST', title: 'Login' },
    ]));
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([
      { id: 'TC-001', requirement_id: 'FR-001', title: 'Login', status: 'open' },
      { id: 'TC-002', title: 'No FR link', status: 'open' },
    ]));
    const { warnings } = runReview(dir, baseConfig(dir), 'phase3');
    assert.ok(warnings.some(w => w.includes('TC-002')));
  });

  it('skips TC→Results check when scope is phase3', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', makeReqs([
      { id: 'FR-001', priority: 'MUST', title: 'Login' },
    ]));
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([
      { id: 'TC-001', requirement_id: 'FR-001', title: 'Login', status: 'open' },
    ]));
    // Write results with orphan entry — should NOT be detected in phase3 scope
    writeArtifact(dir, '04_TEST_RESULTS.json', makeResults([
      { tc_id: 'TC-999', status: 'pass', notes: '' },
    ]));
    const { errors } = runReview(dir, baseConfig(dir), 'phase3');
    assert.ok(!errors.some(e => e.includes('TC-999')));
  });

  it('skips req→TC check when scope is phase5', () => {
    const dir = tmpDir();
    // Requirements with uncovered MUST FR — should NOT be detected in phase5 scope
    writeArtifact(dir, '01_REQUIREMENTS.json', makeReqs([
      { id: 'FR-001', priority: 'MUST', title: 'Login' },
    ]));
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([]));
    writeArtifact(dir, '04_TEST_RESULTS.json', makeResults([]));
    const { errors } = runReview(dir, baseConfig(dir), 'phase5');
    assert.ok(!errors.some(e => e.includes('FR-001')));
  });

  it('returns no findings when 03_TEST_CASES.json is missing (phase3)', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', makeReqs([
      { id: 'FR-001', priority: 'MUST', title: 'Login' },
    ]));
    const { errors, warnings } = runReview(dir, baseConfig(dir), 'phase3');
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
  });

});

// ── Test Cases → Test Results ─────────────────────────────────────────────────

describe('runReview() — Test Cases → Test Results', () => {

  it('returns no findings on clean TC→Results alignment', () => {
    const dir = tmpDir();
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([
      { id: 'TC-001', requirement_id: 'FR-001', title: 'Login', status: 'open' },
    ]));
    writeArtifact(dir, '04_TEST_RESULTS.json', makeResults([
      { tc_id: 'TC-001', status: 'pass', notes: '' },
    ]));
    const { errors, warnings } = runReview(dir, baseConfig(dir), 'phase5');
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
  });

  it('warns on TC with no result entry', () => {
    const dir = tmpDir();
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([
      { id: 'TC-001', requirement_id: 'FR-001', title: 'Login', status: 'open' },
      { id: 'TC-002', requirement_id: 'FR-001', title: 'Logout', status: 'open' },
    ]));
    writeArtifact(dir, '04_TEST_RESULTS.json', makeResults([
      { tc_id: 'TC-001', status: 'pass', notes: '' },
    ]));
    const { warnings } = runReview(dir, baseConfig(dir), 'phase5');
    assert.ok(warnings.some(w => w.includes('TC-002')));
  });

  it('errors on result referencing non-existent TC', () => {
    const dir = tmpDir();
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([
      { id: 'TC-001', requirement_id: 'FR-001', title: 'Login', status: 'open' },
    ]));
    writeArtifact(dir, '04_TEST_RESULTS.json', makeResults([
      { tc_id: 'TC-001', status: 'pass', notes: '' },
      { tc_id: 'TC-999', status: 'pass', notes: '' },
    ]));
    const { errors } = runReview(dir, baseConfig(dir), 'phase5');
    assert.ok(errors.some(e => e.includes('TC-999')));
  });

  it('runs both checks when scope is all', () => {
    const dir = tmpDir();
    writeArtifact(dir, '01_REQUIREMENTS.json', makeReqs([
      { id: 'FR-001', priority: 'MUST', title: 'Login' },
    ]));
    // FR-001 uncovered (req→TC error) AND orphan result (TC→Results error)
    writeArtifact(dir, '03_TEST_CASES.json', makeTCs([]));
    writeArtifact(dir, '04_TEST_RESULTS.json', makeResults([
      { tc_id: 'TC-999', status: 'pass', notes: '' },
    ]));
    const { errors } = runReview(dir, baseConfig(dir), 'all');
    assert.ok(errors.some(e => e.includes('FR-001')));
    assert.ok(errors.some(e => e.includes('TC-999')));
  });

});
