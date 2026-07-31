/**
 * Tests: killed e2e dispatch no longer discards finished unit results
 * (FB-E2E-KILL-0722, ADR-068 Addendum, rc.8)
 *
 * Field defect (T-Ledger): verify-run runs the unit runner first (finished,
 * parsed), then auto-runs Playwright with the same test_runner_timeout_ms.
 * Pre-rc.8 a Playwright KILL called err() → hard exit → 04_TEST_RESULTS.json
 * never written → 211/211 green unit results discarded, deadlocking
 * verify → verify-complete → reconcile --resolve on any project whose e2e
 * cannot run in the current environment (the mark-manual + tc verify
 * --evidence escape needs a bound results file, which the kill destroyed).
 *
 * rc.8 contract, pinned here:
 *   - the finished unit results ARE written; e2e TCs record as skipped
 *   - NONE of the killed dispatch's partial output is parsed (no false pass)
 *   - additive `e2e_run: {runner, status:"killed", reason}` records the kill
 *   - a stale verifyPassed is RESET (Z1 extension) — units-green + e2e-killed
 *     must not let reconcile --resolve ride an earlier full-green seal
 *   - the main runner's own kill behavior is UNCHANGED (ADR-068: refuses, writes nothing)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdVerifyRun } from '../lib/commands/verify.js';

const isWin = process.platform === 'win32';

function seedProject(dir) {
  fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
    projectName: 'p', artifactsDir: 'spec',
    approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
    verifyPassed: true, // stale seal from an earlier full-green run — must be reset
  }));
  fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
    functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'MUST' }],
  }));
  fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
    test_cases: [
      { id: 'TC-001h', title: 'unit happy', requirement_id: 'FR-001', type: 'unit', expected_result: 'r', automation: 'automated' },
      { id: 'TC-001f', title: 'e2e flow',   requirement_id: 'FR-001', type: 'e2e',  expected_result: 'r', automation: 'automated' },
    ],
  }));
  // Unit runner: prints a parseable pass and exits 0, well inside the timeout.
  fs.writeFileSync(path.join(dir, 'runner.js'),
    `console.log('\\u2714 TC-001h unit happy');\n`);
  fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
    files_created: ['src/x.js'], technical_debt: [],
    test_runner: 'node runner.js', test_files: ['runner.js'],
    test_runner_timeout_ms: 3000,
  }));
  // Playwright config triggers the auto-run dispatch.
  fs.writeFileSync(path.join(dir, 'playwright.config.js'), 'module.exports = {};\n');
  // PATH shim: `npx` hangs past the timeout → spawnSync kill (ETIMEDOUT).
  const bin = path.join(dir, 'shim-bin');
  fs.mkdirSync(bin);
  const npx = path.join(bin, 'npx');
  // The shim PRINTS a passing e2e TC line before hanging: if the kill branch ever
  // regresses into parsing the killed dispatch's partial output (the false-pass
  // surface ADR-068 forbids), TC-001f would flip to 'pass' and the skip assertion
  // below catches it. A silent shim could not pin that.
  fs.writeFileSync(npx, `#!/bin/sh\necho '✓ TC-001f e2e flow'\nsleep 30\n`);
  fs.chmodSync(npx, 0o755);
  return bin;
}

function silent(fn) {
  const origLog = console.log; const origErr = process.stderr.write;
  console.log = () => {}; process.stderr.write = () => true;
  try { return fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
}

describe('verify-run — killed e2e dispatch (FB-E2E-KILL-0722)', { skip: isWin }, () => {
  it('persists finished unit results, records e2e_run killed, resets stale verifyPassed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-e2ekill-'));
    const origPath = process.env.PATH;
    try {
      const bin = seedProject(dir);
      process.env.PATH = `${bin}:${origPath}`;
      let errMsg = null;
      silent(() => {
        try {
          cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { errMsg = m; throw new Error(m); } });
        } catch (e) { if (errMsg === null) throw e; }
      });
      assert.equal(errMsg, null, `killed e2e dispatch must not err()-discard the run — got: ${errMsg}`);

      const p = path.join(dir, 'spec/04_TEST_RESULTS.json');
      assert.equal(fs.existsSync(p), true, '04_TEST_RESULTS.json must be written');
      const d = JSON.parse(fs.readFileSync(p, 'utf8'));

      const unit = d.results.find(r => r.tc_id === 'TC-001h');
      const e2e  = d.results.find(r => r.tc_id === 'TC-001f');
      assert.equal(unit?.status, 'pass', 'finished unit result must persist');
      assert.equal(e2e?.status, 'skip', 'killed-dispatch e2e TC records as skipped, never parsed');

      assert.deepEqual(d.e2e_run, { runner: 'playwright', status: 'killed', reason: 'timeout' });
      assert.equal('e2e_exit_code' in d, false, 'a killed dispatch has no exit code — the field must be absent');

      const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
      assert.equal(cfg.verifyPassed, false,
        'Z1 extension: units-green + e2e-killed must reset a stale verifyPassed (no riding an old full-green seal)');
    } finally {
      process.env.PATH = origPath;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('control: with a healthy (instant, exit 0) npx the run records e2e_exit_code and no e2e_run', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-e2eok-'));
    const origPath = process.env.PATH;
    try {
      const bin = seedProject(dir);
      // Overwrite the shim: exits immediately with no e2e TC output.
      fs.writeFileSync(path.join(bin, 'npx'), '#!/bin/sh\nexit 0\n');
      process.env.PATH = `${bin}:${origPath}`;
      silent(() => {
        try { cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { throw new Error(m); } }); }
        catch { /* asserted via file below */ }
      });
      const d = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8'));
      assert.equal('e2e_run' in d, false, 'e2e_run is present ONLY on a killed dispatch');
      assert.equal(d.e2e_exit_code, 0, 'healthy dispatch keeps the rc.171 exit-code record');
    } finally {
      process.env.PATH = origPath;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
