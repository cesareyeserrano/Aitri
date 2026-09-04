/**
 * Tests: dispatch capture goes through temp FILES, not pipes (DISPATCH-PIPE-0903)
 *
 * Field defect (T-Ledger, measured 2026-08-28): `spawnSync` with piped stdio does not
 * return when the child EXITS — it returns when the LAST holder of the pipe closes it.
 * An e2e suite that starts an app server leaves that server holding the inherited pipe,
 * so a run that finished in 2 minutes held the CLI until the 15-minute timeout, was then
 * reported as a KILLED dispatch, and every e2e TC recorded as `skipped`: a green
 * verify-run that accredited nothing. The same pipe imposes a ceiling — past it Node
 * KILLS the child (ENOBUFS) and truncates, so a loud-but-healthy suite or gate read as an
 * `error` it never was. The gates were still on Node's 1 MiB default.
 *
 * What is pinned here is BOTH halves of the change — the fix AND the rigor it must not
 * trade away:
 *   - a survivor holding stdout no longer stalls the dispatch, and its TCs ARE accredited
 *   - a real test FAILURE is still recorded as a failure through the new path
 *   - a gate's real exit code is judged in both directions, however loud the gate is
 *   - an output past the read cap still REFUSES (no partial credit, no phantom regression)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdVerifyRun, runQualityGates, spawnCaptured, readCappedFd, RUNNER_MAX_BUFFER } from '../lib/commands/verify.js';

const isWin = process.platform === 'win32';

function silent(fn) {
  const origLog = console.log; const origErr = process.stderr.write;
  console.log = () => {}; process.stderr.write = () => true;
  try { return fn(); } finally { console.log = origLog; process.stderr.write = origErr; }
}

/** Minimal project whose runner is a shell script we control. */
function seedProject(dir, runnerBody, { timeoutMs = 10000 } = {}) {
  fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
    projectName: 'p', artifactsDir: 'spec',
    approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
  }));
  fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
    functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'MUST' }],
  }));
  fs.writeFileSync(path.join(dir, 'spec/03_TEST_CASES.json'), JSON.stringify({
    test_cases: [
      { id: 'TC-001h', title: 'happy', requirement_id: 'FR-001', type: 'unit', expected_result: 'r', automation: 'automated' },
    ],
  }));
  fs.writeFileSync(path.join(dir, 'spec/04_BUILD_REPORT.json'), JSON.stringify({
    files_created: ['src/x.js'], technical_debt: [],
    test_runner: './runner.sh', test_files: ['runner.sh'],
    test_runner_timeout_ms: timeoutMs,
  }));
  const runner = path.join(dir, 'runner.sh');
  fs.writeFileSync(runner, runnerBody);
  fs.chmodSync(runner, 0o755);
}

function runVerify(dir) {
  let errMsg = null;
  silent(() => {
    try {
      cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { errMsg = m; throw new Error(m); } });
    } catch (e) { if (errMsg === null) throw e; }
  });
  return errMsg;
}

describe('verify-run dispatch capture (DISPATCH-PIPE-0903)', { skip: isWin }, () => {
  it('a background survivor holding stdout no longer stalls the run — and its TCs ARE accredited', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-cap-'));
    const pidFile = path.join(dir, 'survivor.pid');
    try {
      // The runner finishes instantly but leaves a 60s survivor behind, exactly like an
      // e2e globalSetup that starts an app server. Under pipe capture spawnSync would sit
      // on the pipe for those 60s, blow the 10s timeout and record the TC as skipped.
      seedProject(dir,
        `#!/bin/sh\necho '✔ TC-001h happy'\n( sleep 60 & echo $! > ${pidFile} )\nexit 0\n`,
        { timeoutMs: 10000 });

      const t0 = Date.now();
      const errMsg = runVerify(dir);
      const elapsed = Date.now() - t0;

      assert.equal(errMsg, null, `the run must not be reported as killed — got: ${errMsg}`);
      assert.ok(elapsed < 9000, `dispatch must return when the CHILD exits, not when the survivor does (took ${elapsed}ms)`);

      const d = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8'));
      assert.equal(d.results.find(r => r.tc_id === 'TC-001h')?.status, 'pass',
        'the TC really passed and must be accredited — the old path recorded it as skipped');
    } finally {
      try { process.kill(Number(fs.readFileSync(pidFile, 'utf8').trim()), 'SIGKILL'); } catch { /* already gone */ }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('RIGOR PIN: a real failure is still a failure through the file path (tolerance is only for KILLS)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-capfail-'));
    try {
      seedProject(dir, `#!/bin/sh\necho '× TC-001h happy'\nexit 1\n`);
      // Stale seal from an earlier green run: a failing suite must clear it.
      const cfgPath = path.join(dir, '.aitri');
      const seeded = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      fs.writeFileSync(cfgPath, JSON.stringify({ ...seeded, verifyPassed: true }));
      runVerify(dir);
      const d = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8'));
      assert.equal(d.results.find(r => r.tc_id === 'TC-001h')?.status, 'fail',
        'a failing test must still record as fail');
      assert.equal(d.exit_code, 1, 'the runner exit code is still the real one');
      const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
      assert.equal(cfg.verifyPassed, false, 'a failing suite must not seal verifyPassed');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('RIGOR PIN: output past the read cap REFUSES — never partial credit', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-captrunc-'));
    try {
      // Writes the marker first, then more than the read cap of filler: the TC line falls
      // before the cut, so crediting the tail would silently under-count a healthy suite.
      seedProject(dir,
        `#!/bin/sh\necho '✔ TC-001h happy'\n` +
        `node -e "const b=Buffer.alloc(1024*1024,120);for(let i=0;i<${Math.ceil(RUNNER_MAX_BUFFER / (1024 * 1024)) + 1};i++)process.stdout.write(b)"\nexit 0\n`,
        { timeoutMs: 60000 });
      const errMsg = runVerify(dir);
      assert.match(String(errMsg), /read cap/i, 'an over-cap read must refuse, not credit a tail');
      assert.equal(fs.existsSync(path.join(dir, 'spec/04_TEST_RESULTS.json')), false,
        'nothing is written on refusal — the ADR-068 doctrine is unchanged');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('records per-stage cost (timings) so a doubled stage is visible', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-captime-'));
    try {
      seedProject(dir, `#!/bin/sh\necho '✔ TC-001h happy'\nexit 0\n`);
      runVerify(dir);
      const d = JSON.parse(fs.readFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), 'utf8'));
      assert.equal(typeof d.timings?.total_ms, 'number', 'timings.total_ms is recorded');
      assert.equal(typeof d.timings?.runner_ms, 'number', 'timings.runner_ms is recorded');
      assert.ok(d.timings.total_ms >= d.timings.runner_ms, 'total covers the runner stage');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('quality gates — capture no longer kills a loud gate (DISPATCH-PIPE-0903)', { skip: isWin }, () => {
  const loud = (exit) =>
    `#!/bin/sh\nnode -e "const b=Buffer.alloc(1024*1024,120);for(let i=0;i<3;i++)process.stdout.write(b)"\nexit ${exit}\n`;

  function withGate(body, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-gate-'));
    try {
      const g = path.join(dir, 'gate.sh');
      fs.writeFileSync(g, body); fs.chmodSync(g, 0o755);
      return fn(dir);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }

  it('a gate that prints past the old 1 MiB pipe ceiling now runs to the end and PASSES on exit 0', () => {
    withGate(loud(0), (dir) => {
      const [r] = runQualityGates([{ name: 'loud', command: './gate.sh' }], dir);
      assert.equal(r.status, 'pass', 'a loud gate that exits 0 passed — it must not read as `error`');
      assert.equal(r.exit_code, 0);
      assert.equal(typeof r.duration_ms, 'number', 'per-gate cost is recorded');
    });
  });

  it('RIGOR PIN: the same loud gate still FAILS on a non-zero exit', () => {
    withGate(loud(3), (dir) => {
      const [r] = runQualityGates([{ name: 'loud', command: './gate.sh' }], dir);
      assert.equal(r.status, 'fail', 'volume tolerance must never turn a failing gate green');
      assert.equal(r.exit_code, 3, 'the real exit code is judged');
    });
  });

  it('a gate whose script leaves a background survivor is not held to its timeout', () => {
    // Under pipe capture the survivor holds the inherited pipe, the gate blows its 3s
    // timeout and is recorded `error` — a green check reported as a broken one. This test
    // cannot pass without the file capture, which is what makes it a pin and not decoration.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-gatesurv-'));
    const pidFile = path.join(dir, 'survivor.pid');
    try {
      const g = path.join(dir, 'gate.sh');
      fs.writeFileSync(g, `#!/bin/sh\n( sleep 30 & echo $! > ${pidFile} )\nexit 0\n`);
      fs.chmodSync(g, 0o755);
      const [r] = runQualityGates([{ name: 'survivor', command: './gate.sh', timeout_ms: 3000 }], dir);
      assert.equal(r.status, 'pass', 'the gate exited 0 — a survivor must not turn it into an `error`');
      assert.equal(r.exit_code, 0);
    } finally {
      try { process.kill(Number(fs.readFileSync(pidFile, 'utf8').trim()), 'SIGKILL'); } catch { /* gone */ }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('RIGOR PIN: a gate killed by its timeout is still `error` (a kill is not a pass)', () => {
    withGate(`#!/bin/sh\nsleep 30\n`, (dir) => {
      const [r] = runQualityGates([{ name: 'slow', command: './gate.sh', timeout_ms: 700 }], dir);
      assert.equal(r.status, 'error', 'a killed gate must stay `error`, never pass');
      assert.equal(r.exit_code, null);
    });
  });
});

describe('spawnCaptured() semantics', { skip: isWin }, () => {
  it('captures stdout and stderr separately, keeps the exit code, flags a capped read', () => {
    const r = spawnCaptured('/bin/sh', ['-c', 'echo out; echo err 1>&2; exit 7']);
    assert.equal(r.status, 7);
    assert.equal(r.stdout.trim(), 'out');
    assert.equal(r.stderr.trim(), 'err');
    assert.equal(r.truncated, false);
    assert.equal(r.readFailed, false);
    assert.equal(r.captureMode, 'file', 'the file path is the one in use — a silent fall back to pipes would reintroduce both defects');

    const big = spawnCaptured('/bin/sh', ['-c', 'node -e "process.stdout.write(\'a\'.repeat(5000))"'], { readCap: 1000 });
    assert.equal(big.truncated, true, 'a read past the cap is flagged, never silently short');
    assert.equal(big.stdout.length, 1000, 'the tail is what is kept');
  });

  it('leaves no capture file behind — not even when the process is killed mid-run', () => {
    const before = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('aitri-capture-')).length;
    spawnCaptured('/bin/sh', ['-c', 'echo x']);
    spawnCaptured('/bin/sh', ['-c', 'sleep 30'], { timeout: 400 });
    const after = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('aitri-capture-')).length;
    assert.equal(after, before, 'the capture is unlinked at open time — nothing survives on disk');
  });

  it('readCappedFd: an unreadable capture is `failed`, never an empty run', () => {
    const f = path.join(os.tmpdir(), `aitri-capture-test-${process.pid}.tmp`);
    fs.writeFileSync(f, 'hello');
    const rw = fs.openSync(f, 'r');
    try {
      assert.deepEqual(readCappedFd(rw, 1024), { text: 'hello', truncated: false, failed: false });
    } finally { fs.closeSync(rw); }
    // A write-only fd cannot be read (EBADF) — the distinction that matters: `failed`, not
    // an empty string, because "could not read" must never be credited as "printed nothing".
    const wo = fs.openSync(f, 'a');
    try {
      const r = readCappedFd(wo, 1024);
      assert.equal(r.failed, true, 'a read that could not happen must be flagged, not silently empty');
      assert.equal(r.text, '');
    } finally { fs.closeSync(wo); fs.unlinkSync(f); }
  });

  it('a timeout still kills and reports (the hang-catcher is untouched)', () => {
    const r = spawnCaptured('/bin/sh', ['-c', 'sleep 30'], { timeout: 600 });
    assert.ok(r.signal || r.error, 'a hung child is still killed and surfaced as a kill');
  });
});
