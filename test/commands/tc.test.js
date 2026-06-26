import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cmdTC, parseGuidedAnswer } from '../../lib/commands/tc.js';

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

describe('parseGuidedAnswer() — guided checklist input, EOF-safe (FB-MULTI-0619 #4)', () => {
  it('treats a 0-byte read (closed stdin / Ctrl-D) as eof, not a re-prompt', () => {
    // The bug: re-prompting on '' busy-spins forever because readStdinSync returns
    // '' with no EAGAIN at EOF. 'eof' lets the loop break instead of spinning.
    assert.equal(parseGuidedAnswer(''), 'eof');
  });
  it('maps p/f/s (any case, leading char, trailing input) to the letter', () => {
    assert.equal(parseGuidedAnswer('p\n'), 'p');
    assert.equal(parseGuidedAnswer('F'), 'f');
    assert.equal(parseGuidedAnswer('  s  '), 's');
    assert.equal(parseGuidedAnswer('pass'), 'p');
  });
  it('returns null (re-prompt) for a blank Enter or an invalid key — NOT eof', () => {
    assert.equal(parseGuidedAnswer('\n'), null);   // blank Enter: a real byte was read
    assert.equal(parseGuidedAnswer('   '), null);
    assert.equal(parseGuidedAnswer('x'), null);
  });
});

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

  it('summary buckets partition the results: passed+failed+skipped+manual === total (FB-MULTI-0619 #3)', () => {
    const dir = makeDir();
    writeResults(dir, [
      { tc_id: 'TC-001h', status: 'pass', notes: '' },
      { tc_id: 'TC-002f', status: 'manual', notes: '' },
    ]);
    // Verifying a manual TC must move it into `passed`, NOT leave it double-counted
    // in `manual` (the contract bug: a verified manual TC was counted in both).
    cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'pass', '--notes', 'ok']));
    const s = readResults(dir).summary;
    assert.equal(s.manual, 0, 'a verified manual TC is no longer status:"manual" — not counted in manual');
    assert.equal(s.manual_verified, 1, 'manual_verified separately tracks it (overlaps passed)');
    assert.equal(s.passed + s.failed + s.skipped + s.manual, 2, 'buckets must sum to total');
  });

  it('recomputes fr_coverage so it does not contradict the summary (FB-MULTI-0619 #2)', () => {
    const dir = makeDir();
    // The artifacts recomputeFRCoverage needs: TC→FR map + FR ids.
    fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'must-have' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-002f', requirement_id: 'FR-001', automation: 'manual', expected_result: 'r' }],
    }));
    // Stale fr_coverage as verify-run seeded it (manual, 0 passing).
    writeResults(dir, [{ tc_id: 'TC-002f', status: 'manual', notes: '' }], { manual: 1 });
    let d0 = readResults(dir);
    d0.fr_coverage = [{ fr_id: 'FR-001', tests_passing: 0, tests_failing: 0, tests_skipped: 0, tests_manual: 1, status: 'manual' }];
    fs.writeFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), JSON.stringify(d0));

    cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'pass', '--notes', 'verified by hand']));

    const d = readResults(dir);
    const fr = d.fr_coverage.find(f => f.fr_id === 'FR-001');
    assert.equal(d.summary.passed, 1, 'summary reflects the verification');
    assert.equal(fr.tests_passing, 1, 'fr_coverage must be recomputed, not left at 0 passing');
    assert.equal(fr.status, 'covered', 'FR is now covered by the verified manual TC — no contradiction with the summary');
  });

  it('recomputes ac_coverage on tc verify — a verified FAIL flips the AC to uncovered (R3-8)', () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'MUST' }],
      user_stories: [{ requirement_id: 'FR-001', acceptance_criteria: [{ id: 'AC-001-1', text: 'login works' }] }],
    }));
    fs.writeFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-001m', requirement_id: 'FR-001', ac_id: 'AC-001-1', automation: 'manual', expected_result: 'r' }],
    }));
    // Pending manual result + ac_coverage present (as verify-run seeds it for structured ACs).
    writeResults(dir, [{ tc_id: 'TC-001m', status: 'manual', notes: '' }], { manual: 1 });
    const d0 = readResults(dir);
    d0.ac_coverage = [{ ac_id: 'AC-001-1', fr_id: 'FR-001', tests_passing: 0, tests_failing: 0, tests_skipped: 0, tests_manual: 1, status: 'manual' }];
    fs.writeFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), JSON.stringify(d0));

    // The human verifies the AC's only test as FAIL. Before R3-8, ac_coverage stayed "manual"
    // (treated as covered) and the build shipped; tc verify now recomputes it to "uncovered".
    cmdTC(makeCtx(dir, ['verify', 'TC-001m', '--result', 'fail', '--notes', 'login broken']));

    const d = readResults(dir);
    const ac = d.ac_coverage.find(a => a.ac_id === 'AC-001-1');
    assert.equal(ac.status, 'uncovered', 'ac_coverage must be recomputed to reflect the verified FAIL');
    assert.equal(ac.tests_failing, 1);
  });

  it('allows re-verification of already-verified TC', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-002f', status: 'pass', notes: 'first run', verified_manually: true, verified_at: '2026-01-01T00:00:00Z' }]);
    cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'fail', '--notes', 're-checked: actually fails']));
    const d = readResults(dir);
    assert.equal(d.results[0].status, 'fail');
    assert.equal(d.results[0].notes, 're-checked: actually fails');
  });

  it('errors if --notes is missing', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-002f', status: 'manual', notes: '' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'pass'])),
      /--notes is required/
    );
  });

  it('errors if --notes is empty string', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-002f', status: 'manual', notes: '' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'pass', '--notes', ''])),
      /--notes is required/
    );
  });

  it('errors if TC not found', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-001h', status: 'pass', notes: '' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-999x', '--result', 'pass', '--notes', 'observed behavior'])),
      /not found/
    );
  });

  it('errors if TC is not manual', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-001h', status: 'pass', notes: '' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-001h', '--result', 'pass', '--notes', 'observed behavior'])),
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
      () => cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'skip', '--notes', 'observed'])),
      /pass.*fail/
    );
  });

  it('no TC ID enters guided mode (no longer an error) — empty results = nothing to verify', () => {
    const dir = makeDir();
    writeResults(dir, []);
    const out = captureStdout(() => cmdTC(makeCtx(dir, ['verify'])));
    assert.match(out, /No pending manual TCs/);
  });

  it('errors on unknown sub-command', () => {
    const dir = makeDir();
    assert.throws(
      () => cmdTC(makeCtx(dir, ['list'])),
      /Unknown tc sub-command/
    );
  });

});

function writeTestCases(dir, testCases) {
  const d = { test_cases: testCases };
  fs.writeFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), JSON.stringify(d, null, 2));
}

function readTestCases(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), 'utf8'));
}

describe('cmdTC — tc mark-manual', () => {

  it('flips automation to "manual" on a TC with a different automation value', () => {
    const dir = makeDir();
    writeTestCases(dir, [
      { id: 'TC-001h', type: 'unit', automation: 'auto' },
      { id: 'TC-002e', type: 'e2e',  automation: 'auto' },
    ]);
    cmdTC(makeCtx(dir, ['mark-manual', 'TC-002e']));
    const d = readTestCases(dir);
    assert.equal(d.test_cases.find(t => t.id === 'TC-002e').automation, 'manual');
    assert.equal(d.test_cases.find(t => t.id === 'TC-001h').automation, 'auto');
  });

  it('stores manual_reason when --reason is given', () => {
    const dir = makeDir();
    writeTestCases(dir, [{ id: 'TC-002e', type: 'e2e', automation: 'auto' }]);
    cmdTC(makeCtx(dir, ['mark-manual', 'TC-002e', '--reason', 'requires real Microsoft SSO credentials']));
    const tc = readTestCases(dir).test_cases.find(t => t.id === 'TC-002e');
    assert.equal(tc.automation, 'manual');
    assert.equal(tc.manual_reason, 'requires real Microsoft SSO credentials');
  });

  it('nudges (does not block) when marking manual with no --reason', () => {
    const dir = makeDir();
    writeTestCases(dir, [{ id: 'TC-002e', type: 'e2e', automation: 'auto' }]);
    const out = captureStdout(() => cmdTC(makeCtx(dir, ['mark-manual', 'TC-002e'])));
    assert.match(out, /No reason given/);
    assert.equal(readTestCases(dir).test_cases.find(t => t.id === 'TC-002e').automation, 'manual');
  });

  it('can add a reason to an already-manual TC (not a no-op when --reason given)', () => {
    const dir = makeDir();
    writeTestCases(dir, [{ id: 'TC-002e', type: 'e2e', automation: 'manual' }]);
    cmdTC(makeCtx(dir, ['mark-manual', 'TC-002e', '--reason', 'needs a physical device']));
    assert.equal(readTestCases(dir).test_cases.find(t => t.id === 'TC-002e').manual_reason, 'needs a physical device');
  });

  it('adds automation: "manual" when field was absent', () => {
    const dir = makeDir();
    writeTestCases(dir, [{ id: 'TC-002e', type: 'e2e' }]);
    cmdTC(makeCtx(dir, ['mark-manual', 'TC-002e']));
    const d = readTestCases(dir);
    assert.equal(d.test_cases[0].automation, 'manual');
  });

  it('is idempotent — already-manual TC is a no-op', () => {
    const dir = makeDir();
    writeTestCases(dir, [{ id: 'TC-002e', type: 'e2e', automation: 'manual' }]);
    const before = fs.readFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), 'utf8');
    cmdTC(makeCtx(dir, ['mark-manual', 'TC-002e']));
    const after = fs.readFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), 'utf8');
    assert.equal(before, after);
  });

  // TC-DRIFT-0625: explain the by-design Phase-3 drift at the call site, but ONLY when
  // Phase 3 is approved (otherwise no hash is stored → no drift to explain).
  it('explains the by-design Phase-3 drift when Phase 3 is approved', () => {
    const dir = makeDir();
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    cfg.approvedPhases = [3];
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(cfg));
    writeTestCases(dir, [{ id: 'TC-002e', type: 'e2e', automation: 'auto' }]);
    const out = captureStdout(() => cmdTC(makeCtx(dir, ['mark-manual', 'TC-002e'])));
    assert.match(out, /Phase 3 will now show drift — by design/);
    assert.match(out, /aitri rehash 3/);
  });

  // A hand-edited `.aitri` storing approvedPhases as the string "3" still fires the advisory.
  // (loadConfig canonicalises phase arrays "3"→3 before the advisory's compare ever runs, so
  // both the number and string forms reach it as 3 — this asserts that end-to-end path holds.)
  it('explains the drift when Phase 3 is approved as a string "3" (loadConfig canonicalises it)', () => {
    const dir = makeDir();
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    cfg.approvedPhases = ['3'];
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(cfg));
    writeTestCases(dir, [{ id: 'TC-002e', type: 'e2e', automation: 'auto' }]);
    const out = captureStdout(() => cmdTC(makeCtx(dir, ['mark-manual', 'TC-002e'])));
    assert.match(out, /show drift — by design/);
  });

  it('does NOT print the drift explanation when Phase 3 is not approved (no drift to explain)', () => {
    const dir = makeDir(); // approvedPhases: []
    writeTestCases(dir, [{ id: 'TC-002e', type: 'e2e', automation: 'auto' }]);
    const out = captureStdout(() => cmdTC(makeCtx(dir, ['mark-manual', 'TC-002e'])));
    assert.doesNotMatch(out, /show drift — by design/);
  });

  it('does NOT re-stamp artifactHashes[3] — the automation downgrade must surface as drift (R3-24)', () => {
    const dir = makeDir();
    writeTestCases(dir, [{ id: 'TC-002e', type: 'e2e', automation: 'auto' }]);
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    cfg.artifactHashes = { '3': 'hash-of-the-approved-test-cases' };
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(cfg));
    cmdTC(makeCtx(dir, ['mark-manual', 'TC-002e']));
    const after = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    // The stored hash must stay as approved, so the edited 03_TEST_CASES.json now mismatches it
    // → Phase-3 drift → TTY-gated re-approval, instead of silently absorbing the downgrade.
    assert.equal(after.artifactHashes['3'], 'hash-of-the-approved-test-cases');
  });

  it('does NOT add artifactHashes[3] when none was stored', () => {
    const dir = makeDir();
    writeTestCases(dir, [{ id: 'TC-002e', type: 'e2e', automation: 'auto' }]);
    cmdTC(makeCtx(dir, ['mark-manual', 'TC-002e']));
    const after = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.equal((after.artifactHashes || {})['3'], undefined);
  });

  it('BLOCKS downgrading a TC the runner reported as fail/skip without --reason (ADV-0622-05)', () => {
    const dir = makeDir();
    writeTestCases(dir, [{ id: 'TC-003h', type: 'unit', automation: 'auto' }]);
    writeResults(dir, [{ tc_id: 'TC-003h', status: 'fail', notes: 'assertion failed' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['mark-manual', 'TC-003h'])),
      /has a recorded "fail" result/,
      'converting a failing automated test to manual must require --reason (anti-laundering)'
    );
  });

  it('stamps downgraded_from when converting a prior-fail TC with --reason (ADV-0622-05)', () => {
    const dir = makeDir();
    writeTestCases(dir, [{ id: 'TC-003h', type: 'unit', automation: 'auto' }]);
    writeResults(dir, [{ tc_id: 'TC-003h', status: 'fail', notes: 'assertion failed' }]);
    cmdTC(makeCtx(dir, ['mark-manual', 'TC-003h', '--reason', 'needs a real payment gateway']));
    const tcs = JSON.parse(fs.readFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), 'utf8'));
    const tc = tcs.test_cases.find(t => t.id === 'TC-003h');
    assert.equal(tc.automation, 'manual');
    assert.equal(tc.downgraded_from, 'fail', 'the prior verdict is recorded as an audit trail');
  });

  it('errors if TC ID is missing', () => {
    const dir = makeDir();
    writeTestCases(dir, []);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['mark-manual'])),
      /TC ID required/
    );
  });

  it('errors if TC ID not found', () => {
    const dir = makeDir();
    writeTestCases(dir, [{ id: 'TC-001h', type: 'unit', automation: 'auto' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['mark-manual', 'TC-999x'])),
      /not found/
    );
  });

  it('errors if 03_TEST_CASES.json does not exist', () => {
    const dir = makeDir();
    assert.throws(
      () => cmdTC(makeCtx(dir, ['mark-manual', 'TC-001h'])),
      /03_TEST_CASES\.json not found/
    );
  });

  it('errors if 03_TEST_CASES.json is malformed', () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), 'not-json{');
    assert.throws(
      () => cmdTC(makeCtx(dir, ['mark-manual', 'TC-001h'])),
      /malformed JSON/
    );
  });

});

describe('cmdTC — tc verify --evidence (automated TC the runner could not parse)', () => {

  it('rejects an automated (skip) TC without --evidence, naming the escape hatches', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-006h', status: 'skip', notes: 'Not detected.' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-006h', '--result', 'pass', '--notes', 'ran in TRX'])),
      /not a manual TC[\s\S]*--results[\s\S]*--evidence/
    );
  });

  it('records an automated TC as pass when --evidence points to a real file', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-006h', status: 'skip', notes: 'Not detected.' }]);
    const ev = path.join(dir, 'results.trx');
    fs.writeFileSync(ev, '<UnitTestResult testName="N.TC_006h" outcome="Passed"/>');
    cmdTC(makeCtx(dir, ['verify', 'TC-006h', '--result', 'pass', '--notes', 'dotnet test trx', '--evidence', 'results.trx']));
    const d = readResults(dir);
    const entry = d.results.find(r => r.tc_id === 'TC-006h');
    assert.equal(entry.status, 'pass');
    assert.equal(entry.verified_manually, true);
    assert.equal(entry.evidence, 'results.trx');
    assert.equal(d.summary.passed, 1);
  });

  it('errors when --evidence path does not exist', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-006h', status: 'skip', notes: 'Not detected.' }]);
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-006h', '--result', 'pass', '--notes', 'x', '--evidence', 'nope.trx'])),
      /--evidence file not found/
    );
  });

  it('mechanically confirms when --evidence is a TRX that reports the TC as passed', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-006h', status: 'skip', notes: 'Not detected.' }]);
    fs.writeFileSync(path.join(dir, 'r.trx'), '<UnitTestResult testName="N.C.TC_006h_x" outcome="Passed"/>');
    cmdTC(makeCtx(dir, ['verify', 'TC-006h', '--result', 'pass', '--notes', 'trx', '--evidence', 'r.trx']));
    assert.equal(readResults(dir).results.find(r => r.tc_id === 'TC-006h').status, 'pass');
  });

  it('rejects when --evidence (a results file) CONTRADICTS the claimed result', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-006h', status: 'skip', notes: 'Not detected.' }]);
    fs.writeFileSync(path.join(dir, 'r.trx'), '<UnitTestResult testName="N.C.TC_006h_x" outcome="Failed"/>');
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-006h', '--result', 'pass', '--notes', 'x', '--evidence', 'r.trx'])),
      /contradicts --result[\s\S]*reports "fail"/
    );
  });

  it('rejects when --evidence is a results file that does NOT report the TC', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-006h', status: 'skip', notes: 'Not detected.' }]);
    fs.writeFileSync(path.join(dir, 'r.trx'), '<UnitTestResult testName="N.C.TC_999z_other" outcome="Passed"/>');
    assert.throws(
      () => cmdTC(makeCtx(dir, ['verify', 'TC-006h', '--result', 'pass', '--notes', 'x', '--evidence', 'r.trx'])),
      /does not report TC-006h/
    );
  });

  it('a non-results evidence file (plain log) stays the honor-system floor — accepted', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-006h', status: 'skip', notes: 'Not detected.' }]);
    fs.writeFileSync(path.join(dir, 'run.log'), 'I observed the migration boot with 929 docs preserved');
    cmdTC(makeCtx(dir, ['verify', 'TC-006h', '--result', 'pass', '--notes', 'observed', '--evidence', 'run.log']));
    assert.equal(readResults(dir).results.find(r => r.tc_id === 'TC-006h').status, 'pass');
  });

  it('still records a manual TC normally and attaches evidence when given', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-002f', status: 'manual', notes: 'Manual.' }]);
    const ev = path.join(dir, 'log.txt');
    fs.writeFileSync(ev, 'observed parity');
    cmdTC(makeCtx(dir, ['verify', 'TC-002f', '--result', 'pass', '--notes', 'parity ok', '--evidence', 'log.txt']));
    const entry = readResults(dir).results.find(r => r.tc_id === 'TC-002f');
    assert.equal(entry.status, 'pass');
    assert.equal(entry.evidence, 'log.txt');
  });

});

function captureStdout(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { out += s; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

describe('cmdTC — tc verify (guided, no TC id)', () => {

  it('errors when 04_TEST_RESULTS.json is missing', () => {
    const dir = makeDir();
    assert.throws(() => cmdTC(makeCtx(dir, ['verify'])), /04_TEST_RESULTS\.json not found/);
  });

  it('says nothing-to-do when there are no pending manual TCs', () => {
    const dir = makeDir();
    writeResults(dir, [{ tc_id: 'TC-001h', status: 'pass', notes: 'auto' }]);
    const out = captureStdout(() => cmdTC(makeCtx(dir, ['verify'])));
    assert.match(out, /No pending manual TCs/);
  });

  it('non-TTY: lists pending manual TCs with what to check, and does NOT modify results', () => {
    const dir = makeDir();
    writeResults(dir, [
      { tc_id: 'TC-005', status: 'manual', notes: 'Manual.' },
      { tc_id: 'TC-001h', status: 'pass', notes: 'auto' },
    ]);
    writeTestCases(dir, [
      { id: 'TC-005', automation: 'manual', title: 'Login via SSO lands in backoffice', expected_result: 'redirect to MS, return, editor role' },
    ]);
    const before = fs.readFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), 'utf8');
    const out = captureStdout(() => cmdTC(makeCtx(dir, ['verify'])));
    assert.match(out, /Pending manual test cases \(1\)/);
    assert.match(out, /TC-005 — Login via SSO lands in backoffice/);
    assert.match(out, /Expected: redirect to MS/);
    assert.match(out, /non-interactive/i);
    // unchanged on disk (no prompting happened)
    assert.equal(fs.readFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), 'utf8'), before);
  });

  it('shows the manual reason in the checklist, and flags TCs lacking one', () => {
    const dir = makeDir();
    writeResults(dir, [
      { tc_id: 'TC-005', status: 'manual', notes: 'm' },
      { tc_id: 'TC-006', status: 'manual', notes: 'm' },
    ]);
    writeTestCases(dir, [
      { id: 'TC-005', automation: 'manual', title: 'SSO login', manual_reason: 'needs real MS credentials' },
      { id: 'TC-006', automation: 'manual', title: 'Mobile layout' },
    ]);
    const out = captureStdout(() => cmdTC(makeCtx(dir, ['verify'])));
    assert.match(out, /Manual because: needs real MS credentials/);
    assert.match(out, /no reason given/);
    assert.match(out, /1 of 2 pending manual TC\(s\) have no stated reason/);
  });

  it('warns when EVERY test case is manual (no automated tests)', () => {
    const dir = makeDir();
    writeResults(dir, [
      { tc_id: 'TC-001', status: 'manual', notes: 'm' },
      { tc_id: 'TC-002', status: 'manual', notes: 'm' },
    ]);
    const out = captureStdout(() => cmdTC(makeCtx(dir, ['verify'])));
    assert.match(out, /All 2 test case\(s\) are manual/);
  });

  it('shows a partial-manual signal when only some TCs are manual', () => {
    const dir = makeDir();
    writeResults(dir, [
      { tc_id: 'TC-001', status: 'manual', notes: 'm' },
      { tc_id: 'TC-002', status: 'pass', notes: 'auto' },
    ]);
    const out = captureStdout(() => cmdTC(makeCtx(dir, ['verify'])));
    assert.match(out, /1 of 2 test case\(s\) rely on manual verification/);
  });

});
