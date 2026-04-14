import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cmdTC } from '../../lib/commands/tc.js';

function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-tc-'));
  fs.mkdirSync(path.join(dir, 'spec'));
  fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec', approvedPhases: [] }));
  return dir;
}

function writeResults(dir, results, summary = {}) {
  const d = {
    executed_at: new Date().toISOString(),
    test_runner: 'pytest -v',
    exit_code: 0,
    results,
    fr_coverage: [],
    summary: { total: results.length, passed: 0, failed: 0, skipped: 0, manual: 0, manual_verified: 0, ...summary },
  };
  fs.writeFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), JSON.stringify(d));
}

function readResults(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), 'utf8'));
}

function makeCtx(dir, args) {
  const err = (msg) => { throw new Error(msg); };
  const flagValue = (flag) => {
    const i = args.indexOf(flag);
    if (i === -1 || i + 1 >= args.length) return null;
    return args[i + 1];
  };
  return { dir, args, flagValue, err };
}

describe('cmdTC — tc verify', () => {

  it('records a manual TC as pass', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-002f', status: 'manual', notes: 'Manual execution required.' }]);
    cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'pass', '--notes', 'verified ok']));
    const d = readResults(dir);
    const entry = d.results.find(r => r.tc_id === 'TC-002f');
    assert.equal(entry.status, 'pass');
    assert.equal(entry.verified_manually, true);
    assert.equal(entry.notes, 'verified ok');
    assert.ok(entry.verified_at);
  });

  it('records a manual TC as fail', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-002f', status: 'manual', notes: '' }]);
    cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'fail', '--notes', 'assertion failed']));
    const d = readResults(dir);
    assert.equal(d.results[0].status, 'fail');
    assert.equal(d.results[0].verified_manually, true);
  });

  it('recomputes summary after verification', () => {
    const dir = makeDir();
    writeResults(dir, [
      { tc_id: 'TC-001h', status: 'pass', notes: '' },
      { tc_id: 'TC-002f', status: 'manual', notes: '' },
    ]);
    cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'pass', '--notes', 'ok']));
    const d = readResults(dir);
    assert.equal(d.summary.passed, 2);
    assert.equal(d.summary.manual_verified, 1);
  });

  it('allows re-verification of already-verified TC', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-002f', status: 'pass', notes: 'first run', verified_manually: true, verified_at: '2026-01-01T00:00:00Z' }]);
    cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'fail', '--notes', 're-checked: actually fails']));
    const d = readResults(dir);
    assert.equal(d.results[0].status, 'fail');
    assert.equal(d.results[0].notes, 're-checked: actually fails');
  });

  it('errors if TC not found', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-001h', status: 'pass', notes: '' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-999x', '--result', 'pass', '--notes', ''])),
      /not found/
    );
  });

  it('errors if TC is not manual', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-001h', status: 'pass', notes: '' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-001h', '--result', 'pass', '--notes', ''])),
      /not a manual TC/
    );
  });

  it('errors if --result is missing', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-002f', status: 'manual', notes: '' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--notes', 'ok'])),
      /--result is required/
    );
  });

  it('errors if --result has invalid value', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-002f', status: 'manual', notes: '' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'skip', '--notes', ''])),
      /pass.*fail/
    );
  });

  it('errors if TC ID is missing', () => {
    const dir = makeDir();
    writeResults(dir, []);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify'])),
      /TC ID required/
    );
  });

  it('errors on unknown sub-command', () => {
    const dir = makeDir();
    assert.throws(
      () => cmdTC(makeCtx(dir, ['list'])),
      /Unknown tc sub-command/
    );
  });

});
