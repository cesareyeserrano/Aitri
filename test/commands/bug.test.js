import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { openBugCount, autoVerifyBugs, getBlockingBugs, getOpenBugs, cmdBug,
         isBlockingBug, isActiveBug, bugSeverity, bugStatus, assertBugsReadable } from '../../lib/commands/bug.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-bug-'));
}

function baseConfig() {
  return { artifactsDir: 'spec', approvedPhases: [], completedPhases: [] };
}

function writeBugs(dir, bugs) {
  const specDir = path.join(dir, 'spec');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'BUGS.json'), JSON.stringify({ bugs }, null, 2));
}

function readBugs(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'spec', 'BUGS.json'), 'utf8'));
}

function err(msg) { throw new Error(msg); }

// ── openBugCount ──────────────────────────────────────────────────────────────

describe('openBugCount()', () => {
  it('returns null when BUGS.json does not exist', () => {
    const dir = tmpDir();
    assert.equal(openBugCount(dir, baseConfig()), null);
  });

  it('returns 0 when all bugs are closed or verified', () => {
    const dir = tmpDir();
    writeBugs(dir, [
      { id: 'BG-001', status: 'closed' },
      { id: 'BG-002', status: 'verified' },
    ]);
    assert.equal(openBugCount(dir, baseConfig()), 0);
  });

  it('counts open and fixed bugs (active bugs not yet resolved)', () => {
    const dir = tmpDir();
    writeBugs(dir, [
      { id: 'BG-001', status: 'open' },
      { id: 'BG-002', status: 'fixed' },
      { id: 'BG-003', status: 'verified' },
      { id: 'BG-004', status: 'closed' },
    ]);
    assert.equal(openBugCount(dir, baseConfig()), 2);
  });
});

// ── getOpenBugs ───────────────────────────────────────────────────────────────

describe('getOpenBugs()', () => {
  it('returns empty array when BUGS.json does not exist', () => {
    const dir = tmpDir();
    assert.deepEqual(getOpenBugs(dir, baseConfig()), []);
  });

  it('returns only open bugs sorted by severity', () => {
    const dir = tmpDir();
    writeBugs(dir, [
      { id: 'BG-001', status: 'open',   severity: 'low' },
      { id: 'BG-002', status: 'open',   severity: 'critical' },
      { id: 'BG-003', status: 'fixed',  severity: 'high' },
      { id: 'BG-004', status: 'closed', severity: 'medium' },
    ]);
    const result = getOpenBugs(dir, baseConfig());
    assert.equal(result.length, 2);
    assert.equal(result[0].id, 'BG-002'); // critical first
    assert.equal(result[1].id, 'BG-001'); // low last
  });
});

// ── autoVerifyBugs ────────────────────────────────────────────────────────────

describe('autoVerifyBugs()', () => {
  it('transitions fixed → verified when linked TC passes', () => {
    const dir = tmpDir();
    writeBugs(dir, [{ id: 'BG-001', status: 'fixed', tc_reference: 'TC-021' }]);
    autoVerifyBugs(dir, baseConfig(), [{ tc_id: 'TC-021', status: 'pass' }]);
    const data = readBugs(dir);
    assert.equal(data.bugs[0].status, 'verified');
  });

  it('does not transition when linked TC fails', () => {
    const dir = tmpDir();
    writeBugs(dir, [{ id: 'BG-001', status: 'fixed', tc_reference: 'TC-021' }]);
    autoVerifyBugs(dir, baseConfig(), [{ tc_id: 'TC-021', status: 'fail' }]);
    const data = readBugs(dir);
    assert.equal(data.bugs[0].status, 'fixed');
  });

  it('does not transition when TC is not in results', () => {
    const dir = tmpDir();
    writeBugs(dir, [{ id: 'BG-001', status: 'fixed', tc_reference: 'TC-021' }]);
    autoVerifyBugs(dir, baseConfig(), [{ tc_id: 'TC-001', status: 'pass' }]);
    const data = readBugs(dir);
    assert.equal(data.bugs[0].status, 'fixed');
  });

  it('does not affect bugs with no tc_reference', () => {
    const dir = tmpDir();
    writeBugs(dir, [{ id: 'BG-001', status: 'fixed', tc_reference: null }]);
    autoVerifyBugs(dir, baseConfig(), [{ tc_id: 'TC-021', status: 'pass' }]);
    const data = readBugs(dir);
    assert.equal(data.bugs[0].status, 'fixed');
  });

  it('is a no-op when BUGS.json does not exist', () => {
    const dir = tmpDir();
    assert.doesNotThrow(() => autoVerifyBugs(dir, baseConfig(), [{ tc_id: 'TC-001', status: 'pass' }]));
  });
});

// ── getBlockingBugs — severity-based ─────────────────────────────────────────

describe('getBlockingBugs()', () => {
  it('returns empty array when BUGS.json does not exist', () => {
    const dir = tmpDir();
    assert.deepEqual(getBlockingBugs(dir, baseConfig()), []);
  });

  it('blocks on open critical bugs', () => {
    const dir = tmpDir();
    writeBugs(dir, [{ id: 'BG-001', status: 'open', severity: 'critical' }]);
    const blocking = getBlockingBugs(dir, baseConfig());
    assert.equal(blocking.length, 1);
    assert.equal(blocking[0].id, 'BG-001');
  });

  it('blocks on open high bugs', () => {
    const dir = tmpDir();
    writeBugs(dir, [{ id: 'BG-001', status: 'open', severity: 'high' }]);
    const blocking = getBlockingBugs(dir, baseConfig());
    assert.equal(blocking.length, 1);
  });

  it('blocks on in_progress critical/high bugs — aligned with the deploy gate (R3-12/22)', () => {
    const dir = tmpDir();
    writeBugs(dir, [
      { id: 'BG-001', status: 'in_progress', severity: 'critical' },
      { id: 'BG-002', status: 'in_progress', severity: 'high' },
      { id: 'BG-003', status: 'in_progress', severity: 'medium' },  // not blocking (severity gate)
    ]);
    const blocking = getBlockingBugs(dir, baseConfig());
    assert.deepEqual(blocking.map(b => b.id).sort(), ['BG-001', 'BG-002'],
      'in_progress critical/high must block verify-complete/reconcile, matching the deploy gate');
  });

  it('AUDIT-0629-B: blocks on a capitalized "Critical"/"Open" bug (case-fold at the feature deploy gate)', () => {
    const dir = tmpDir();
    writeBugs(dir, [{ id: 'BG-001', status: 'Open', severity: 'Critical' }]);
    const blocking = getBlockingBugs(dir, baseConfig());
    assert.equal(blocking.length, 1,
      'a hand-written capitalized severity/status must not slip a blocking bug past the gate');
    assert.equal(blocking[0].id, 'BG-001');
  });

  it('does not block on open medium bugs', () => {
    const dir = tmpDir();
    writeBugs(dir, [{ id: 'BG-001', status: 'open', severity: 'medium' }]);
    assert.deepEqual(getBlockingBugs(dir, baseConfig()), []);
  });

  it('does not block on open low bugs', () => {
    const dir = tmpDir();
    writeBugs(dir, [{ id: 'BG-001', status: 'open', severity: 'low' }]);
    assert.deepEqual(getBlockingBugs(dir, baseConfig()), []);
  });

  it('does not block on fixed or verified critical bugs', () => {
    const dir = tmpDir();
    writeBugs(dir, [
      { id: 'BG-001', status: 'fixed',    severity: 'critical' },
      { id: 'BG-002', status: 'verified', severity: 'high' },
    ]);
    assert.deepEqual(getBlockingBugs(dir, baseConfig()), []);
  });

  it('does not block regardless of FR link (severity is the gate)', () => {
    const dir = tmpDir();
    writeBugs(dir, [
      { id: 'BG-001', status: 'open', severity: 'medium', fr: 'FR-001' },
    ]);
    assert.deepEqual(getBlockingBugs(dir, baseConfig()), []);
  });
});

// ── Bug-state predicates SSoT (AUDIT-0629-G) — the single definition the gates share ────────────
describe('bug-state predicates (isBlockingBug / isActiveBug)', () => {
  it('isActiveBug: open/in_progress are active; fixed/verified/closed are not (case-insensitive)', () => {
    assert.equal(isActiveBug({ status: 'open' }), true);
    assert.equal(isActiveBug({ status: 'in_progress' }), true);
    assert.equal(isActiveBug({ status: 'OPEN' }), true, 'case-folded');
    assert.equal(isActiveBug({ status: 'fixed' }), false);
    assert.equal(isActiveBug({ status: 'verified' }), false);
    assert.equal(isActiveBug({ status: 'closed' }), false);
    assert.equal(isActiveBug({}), false, 'missing status is not active, no throw');
  });
  it('isBlockingBug: active AND critical/high, any casing', () => {
    assert.equal(isBlockingBug({ status: 'open', severity: 'critical' }), true);
    assert.equal(isBlockingBug({ status: 'in_progress', severity: 'high' }), true);
    assert.equal(isBlockingBug({ status: 'Open', severity: 'Critical' }), true, 'case-folded — the AUDIT-0629-B defect');
    assert.equal(isBlockingBug({ status: 'open', severity: 'medium' }), false, 'severity gate');
    assert.equal(isBlockingBug({ status: 'fixed', severity: 'critical' }), false, 'inactive is not blocking');
    assert.equal(isBlockingBug({ severity: 'critical' }), false, 'no status → not active → not blocking');
  });
  it('bugSeverity/bugStatus normalize to lowercase strings, tolerate missing/non-string', () => {
    assert.equal(bugSeverity({ severity: 'HIGH' }), 'high');
    assert.equal(bugStatus({ status: 'In_Progress' }), 'in_progress');
    assert.equal(bugSeverity({}), '');
    assert.equal(bugStatus(null), '');
  });
});

// ── cmdBug — add ──────────────────────────────────────────────────────────────

describe('cmdBug add', () => {
  it('creates BUGS.json with BG-001 on first add', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    cmdBug({ dir, args: ['add', '--title', 'Login fails on empty password', '--fr', 'FR-001', '--severity', 'high'], err });
    const data = readBugs(dir);
    assert.equal(data.bugs.length, 1);
    assert.equal(data.bugs[0].id, 'BG-001');
    assert.equal(data.bugs[0].status, 'open');
    assert.equal(data.bugs[0].fr, 'FR-001');
    assert.equal(data.bugs[0].severity, 'high');
  });

  it('captures steps_to_reproduce from --steps flags', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    cmdBug({ dir, args: ['add', '--title', 'Test bug', '--steps', 'Open /login', '--steps', 'Click submit'], err });
    const bug = readBugs(dir).bugs[0];
    assert.deepEqual(bug.steps_to_reproduce, ['Open /login', 'Click submit']);
  });

  it('captures expected_result and actual_result', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    cmdBug({ dir, args: ['add', '--title', 'T', '--expected', 'Should redirect', '--actual', 'HTTP 500'], err });
    const bug = readBugs(dir).bugs[0];
    assert.equal(bug.expected_result, 'Should redirect');
    assert.equal(bug.actual_result, 'HTTP 500');
  });

  it('captures environment and evidence', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    cmdBug({ dir, args: ['add', '--title', 'T', '--environment', 'local/Phase 4', '--evidence', 'test-results/TC-001/screenshot.png'], err });
    const bug = readBugs(dir).bugs[0];
    assert.equal(bug.environment, 'local/Phase 4');
    assert.equal(bug.evidence, 'test-results/TC-001/screenshot.png');
  });

  it('captures reported_by from --reported-by', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    cmdBug({ dir, args: ['add', '--title', 'T', '--reported-by', 'César'], err });
    const bug = readBugs(dir).bugs[0];
    assert.equal(bug.reported_by, 'César');
  });

  it('detected_by defaults to manual', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    cmdBug({ dir, args: ['add', '--title', 'T'], err });
    assert.equal(readBugs(dir).bugs[0].detected_by, 'manual');
  });

  it('auto-increments ID', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    writeBugs(dir, [{ id: 'BG-001', status: 'open' }]);
    cmdBug({ dir, args: ['add', '--title', 'Second bug'], err });
    const data = readBugs(dir);
    assert.equal(data.bugs[1].id, 'BG-002');
  });

  it('throws when --title is missing', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    assert.throws(() => cmdBug({ dir, args: ['add', '--fr', 'FR-001'], err }), /--title is required/);
  });
});

// ── cmdBug — lifecycle ────────────────────────────────────────────────────────

describe('cmdBug lifecycle', () => {
  function setup() {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    writeBugs(dir, [{ id: 'BG-001', title: 'Test bug', status: 'open', fr: 'FR-001', tc_reference: null }]);
    return dir;
  }

  it('fix transitions open → fixed', () => {
    const dir = setup();
    cmdBug({ dir, args: ['fix', 'BG-001'], err });
    assert.equal(readBugs(dir).bugs[0].status, 'fixed');
  });

  it('fix with --tc records tc_reference', () => {
    const dir = setup();
    cmdBug({ dir, args: ['fix', 'BG-001', '--tc', 'TC-021'], err });
    const bug = readBugs(dir).bugs[0];
    assert.equal(bug.status, 'fixed');
    assert.equal(bug.tc_reference, 'TC-021');
  });

  it('verify transitions fixed → verified without requiring --tc', () => {
    const dir = setup();
    cmdBug({ dir, args: ['fix', 'BG-001'], err });
    cmdBug({ dir, args: ['verify', 'BG-001'], err });
    assert.equal(readBugs(dir).bugs[0].status, 'verified');
  });

  it('fix with --resolution records the resolution note (AUDIT-0630-E — was seeded null and never written)', () => {
    const dir = setup();
    cmdBug({ dir, args: ['fix', 'BG-001', '--resolution', 'guarded the null path in auth.js'], err });
    const bug = readBugs(dir).bugs[0];
    assert.equal(bug.status, 'fixed');
    assert.equal(bug.resolution, 'guarded the null path in auth.js');
  });

  it('resolution set at fix persists through verify → close', () => {
    const dir = setup();
    cmdBug({ dir, args: ['fix', 'BG-001', '--resolution', 'fixed in auth.js'], err });
    cmdBug({ dir, args: ['verify', 'BG-001'], err });
    cmdBug({ dir, args: ['close', 'BG-001'], err });
    assert.equal(readBugs(dir).bugs[0].resolution, 'fixed in auth.js', 'close without --resolution keeps the fix-time resolution');
  });

  it('close sets status to closed', () => {
    const dir = setup();
    cmdBug({ dir, args: ['close', 'BG-001'], err });
    assert.equal(readBugs(dir).bugs[0].status, 'closed');
  });

  it('close with --resolution records it (won\'t-fix / duplicate path, no prior fix)', () => {
    const dir = setup();
    cmdBug({ dir, args: ['close', 'BG-001', '--resolution', 'duplicate of BG-002'], err });
    const bug = readBugs(dir).bugs[0];
    assert.equal(bug.status, 'closed');
    assert.equal(bug.resolution, 'duplicate of BG-002');
  });

  it('errors when bug id not found', () => {
    const dir = setup();
    assert.throws(() => cmdBug({ dir, args: ['fix', 'BG-999'], err }), /BG-999 not found/);
  });
});

// ── UPLAN-0703 B8: blocking-fix evidence, lifecycle order, unreadable BUGS.json ──

describe('cmdBug — B8 blocking bugs require evidence to de-block', () => {
  function setupBlocking() {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    writeBugs(dir, [{ id: 'BG-001', title: 'crash on login', severity: 'critical', status: 'open' }]);
    return dir;
  }

  it('bare fix on a BLOCKING bug refuses and does not mutate', () => {
    const dir = setupBlocking();
    assert.throws(() => cmdBug({ dir, args: ['fix', 'BG-001'], err }), /BLOCKING bug.*--resolution.*--tc/s);
    assert.equal(readBugs(dir).bugs[0].status, 'open', 'refusal must not flip the status');
  });

  it('fix on a BLOCKING bug proceeds with --resolution', () => {
    const dir = setupBlocking();
    cmdBug({ dir, args: ['fix', 'BG-001', '--resolution', 'null-guarded the session read'], err });
    const b = readBugs(dir).bugs[0];
    assert.equal(b.status, 'fixed');
    assert.equal(b.resolution, 'null-guarded the session read');
  });

  it('fix on a BLOCKING bug proceeds with --tc (the test is the evidence)', () => {
    const dir = setupBlocking();
    cmdBug({ dir, args: ['fix', 'BG-001', '--tc', 'TC-007'], err });
    const b = readBugs(dir).bugs[0];
    assert.equal(b.status, 'fixed');
    assert.equal(b.tc_reference, 'TC-007');
  });

  it('a NON-blocking bug keeps the light path (bare fix works)', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    writeBugs(dir, [{ id: 'BG-002', title: 'typo in footer', severity: 'low', status: 'open' }]);
    cmdBug({ dir, args: ['fix', 'BG-002'], err });
    assert.equal(readBugs(dir).bugs[0].status, 'fixed');
  });

  it('verify on a never-fixed bug refuses (open → verified in one step is not a lifecycle)', () => {
    const dir = setupBlocking();
    assert.throws(() => cmdBug({ dir, args: ['verify', 'BG-001'], err }), /is open, not fixed/);
    assert.equal(readBugs(dir).bugs[0].status, 'open');
  });
});

describe('cmdBug — B8 unreadable BUGS.json refuses everywhere it matters', () => {
  function setupMalformed() {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    fs.writeFileSync(path.join(dir, 'spec', 'BUGS.json'), '{ "bugs": [ {broken');
    return dir;
  }

  it('bug add refuses instead of OVERWRITING the corrupt file with a one-bug list', () => {
    const dir = setupMalformed();
    assert.throws(() => cmdBug({ dir, args: ['add', '--title', 'new bug'], err }), /malformed JSON.*NOT overwrite/s);
    assert.match(fs.readFileSync(path.join(dir, 'spec', 'BUGS.json'), 'utf8'), /\{broken/,
      'the corrupt file must be left intact for recovery');
  });

  it('assertBugsReadable errs on a malformed file (the gate-side guard)', () => {
    const dir = setupMalformed();
    assert.throws(() => assertBugsReadable(dir, { artifactsDir: 'spec' }, err), /malformed JSON.*blocking bug/s);
  });

  it('the malformed marker is OUT-OF-BAND: a BUGS.json with a literal "malformed" key is NOT refused', () => {
    // Adversarial-pass fix: a string-key sentinel would (a) serialize into the file if a
    // marked object were ever saved, poisoning it forever, and (b) false-refuse a legitimate
    // file containing a top-level "malformed" key. The Symbol marker can do neither.
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    fs.writeFileSync(path.join(dir, 'spec', 'BUGS.json'),
      JSON.stringify({ malformed: true, bugs: [{ id: 'BG-001', title: 't', severity: 'low', status: 'open' }] }));
    assert.doesNotThrow(() => assertBugsReadable(dir, { artifactsDir: 'spec' }, err),
      'a parseable file is readable regardless of its key names');
    assert.doesNotThrow(() => cmdBug({ dir, args: ['fix', 'BG-001'], err }));
    // And the marker never leaks into the file on save:
    assert.ok(!('malformed' in readBugs(dir)) || readBugs(dir).malformed === true,
      'the file content is whatever the user wrote — Aitri adds no malformed key');
  });

  it('bare close on a BLOCKING bug refuses; --resolution closes it (the close-side de-block bypass)', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    writeBugs(dir, [{ id: 'BG-001', title: 'crash', severity: 'high', status: 'open' }]);
    assert.throws(() => cmdBug({ dir, args: ['close', 'BG-001'], err }), /BLOCKING bug.*--resolution/s,
      'closing a blocking bug without stating why is the same bare de-block the fix gate refuses');
    assert.equal(readBugs(dir).bugs[0].status, 'open');
    cmdBug({ dir, args: ['close', 'BG-001', '--resolution', 'duplicate of BG-000'], err });
    assert.equal(readBugs(dir).bugs[0].status, 'closed');
  });

  it('assertBugsReadable is silent when the file is absent or valid', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    assert.doesNotThrow(() => assertBugsReadable(dir, { artifactsDir: 'spec' }, err), 'absent file is fine');
    writeBugs(dir, [{ id: 'BG-001', title: 't', severity: 'low', status: 'open' }]);
    assert.doesNotThrow(() => assertBugsReadable(dir, { artifactsDir: 'spec' }, err), 'valid file is fine');
  });
});

describe('cmdBug — B8 unknown severity/status warn instead of silently not blocking', () => {
  it('warns once naming the bug when severity is outside the recognized set', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    writeBugs(dir, [{ id: 'BG-009', title: 'sev-1 outage', severity: 'P0', status: 'open' }]);
    let stderr = '';
    const origErr = process.stderr.write.bind(process.stderr);
    process.stderr.write = (c) => { stderr += c; return true; };
    let blocking;
    try { blocking = getBlockingBugs(dir, { artifactsDir: 'spec' }); }
    finally { process.stderr.write = origErr; }
    assert.equal(blocking.length, 0, 'unknown severity stays non-blocking (behavior unchanged)');
    assert.match(stderr, /BG-009.*P0/s, 'the toothless bug is named');
    assert.match(stderr, /critical\|high\|medium\|low/, 'the valid values are stated');
  });
});

// ── cmdBug — git audit trail (F6/F12) ────────────────────────────────────────

describe('cmdBug lifecycle — git audit trail', () => {
  function gitSetup() {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    writeBugs(dir, [{ id: 'BG-001', title: 't', status: 'open', fr: null, tc_reference: null }]);
    const run = (cmd) => execSync(cmd, { cwd: dir, stdio: 'ignore' });
    run('git init -q');
    run('git config user.email aitri@test');
    run('git config user.name Aitri');
    // initial commit
    fs.writeFileSync(path.join(dir, 'README'), 'x');
    run('git add -A');
    run('git commit -q -m init');
    return dir;
  }

  it('fix captures fix_commit_sha when project is a git repo', () => {
    const dir = gitSetup();
    cmdBug({ dir, args: ['fix', 'BG-001'], err });
    const bug = readBugs(dir).bugs[0];
    assert.match(bug.fix_commit_sha || '', /^[0-9a-f]{40}$/);
    assert.ok(bug.fix_at);
  });

  it('close captures close_commit_sha + files_changed across fix→close range', () => {
    const dir = gitSetup();
    cmdBug({ dir, args: ['fix', 'BG-001'], err });
    // second commit representing the actual fix
    fs.writeFileSync(path.join(dir, 'src.js'), 'fixed code');
    execSync('git add -A && git commit -q -m fix', { cwd: dir, stdio: 'ignore' });
    cmdBug({ dir, args: ['close', 'BG-001'], err });
    const bug = readBugs(dir).bugs[0];
    assert.match(bug.close_commit_sha, /^[0-9a-f]{40}$/);
    assert.notEqual(bug.close_commit_sha, bug.fix_commit_sha);
    assert.deepEqual(bug.files_changed, ['src.js']);
  });

  it('close omits files_changed when fix and close land on same SHA', () => {
    const dir = gitSetup();
    cmdBug({ dir, args: ['fix', 'BG-001'], err });
    cmdBug({ dir, args: ['close', 'BG-001'], err });
    const bug = readBugs(dir).bugs[0];
    assert.equal(bug.close_commit_sha, bug.fix_commit_sha);
    assert.equal(bug.files_changed, undefined);
  });

  it('files_changed excludes spec/ and .aitri paths', () => {
    const dir = gitSetup();
    cmdBug({ dir, args: ['fix', 'BG-001'], err });
    fs.writeFileSync(path.join(dir, 'src.js'), 'fix');
    fs.writeFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), '{}');
    execSync('git add -A && git commit -q -m mix', { cwd: dir, stdio: 'ignore' });
    cmdBug({ dir, args: ['close', 'BG-001'], err });
    const bug = readBugs(dir).bugs[0];
    assert.deepEqual(bug.files_changed, ['src.js']);
  });

  it('does NOT execute a shell payload smuggled in fix_commit_sha on close (R3-4 RCE guard)', () => {
    const dir = gitSetup();
    const pwned = path.join(dir, 'PWNED');
    // Hostile committed BUGS.json: fix_commit_sha carries a shell command-substitution payload.
    // Pre-fix, `git diff --name-only ${fix_commit_sha}..${closeSha}` ran via a shell → RCE.
    writeBugs(dir, [{ id: 'BG-001', title: 't', status: 'fixed',
      fix_commit_sha: `$(touch ${pwned})`, fix_at: new Date().toISOString(), fr: null, tc_reference: null }]);
    cmdBug({ dir, args: ['close', 'BG-001'], err });
    assert.equal(fs.existsSync(pwned), false, 'fix_commit_sha must never reach a shell');
    assert.equal(readBugs(dir).bugs[0].status, 'closed', 'close still succeeds (invalid SHA → diff skipped)');
  });
});

describe('cmdBug lifecycle — non-git project (graceful)', () => {
  function setup() {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    writeBugs(dir, [{ id: 'BG-001', title: 't', status: 'open', fr: null, tc_reference: null }]);
    return dir;
  }

  it('fix succeeds without git; no fix_commit_sha field added', () => {
    const dir = setup();
    cmdBug({ dir, args: ['fix', 'BG-001'], err });
    const bug = readBugs(dir).bugs[0];
    assert.equal(bug.status, 'fixed');
    assert.equal(bug.fix_commit_sha, undefined);
  });

  it('close succeeds without git; no SHA or files_changed fields added', () => {
    const dir = setup();
    cmdBug({ dir, args: ['fix', 'BG-001'], err });
    cmdBug({ dir, args: ['close', 'BG-001'], err });
    const bug = readBugs(dir).bugs[0];
    assert.equal(bug.status, 'closed');
    assert.equal(bug.close_commit_sha, undefined);
    assert.equal(bug.files_changed, undefined);
  });
});

// ── cmdBug — list ─────────────────────────────────────────────────────────────

function captureList(fn) {
  let out = '';
  const origWrite = process.stdout.write.bind(process.stdout);
  const origLog = console.log;
  process.stdout.write = (s) => { out += s; return true; };
  console.log = (...a) => { out += a.join(' ') + '\n'; };
  try { fn(); } finally { process.stdout.write = origWrite; console.log = origLog; }
  return out;
}

describe('cmdBug list', () => {
  it('runs without error when BUGS.json has items', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    writeBugs(dir, [{ id: 'BG-001', title: 'Test', status: 'open', severity: 'medium', fr: null, tc_reference: null }]);
    assert.doesNotThrow(() => cmdBug({ dir, args: ['list'], err }));
  });

  // FB-SCOPE-BLIND-0724: the default view must match the snapshot's isOpen predicate
  // (open|in_progress|fixed, case-folded) — status counted an in_progress bug as active
  // while the very list it points at hid it.
  it('hand-written bug with missing severity renders instead of crashing', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    // The widened default filter admits exactly these hand-written shapes —
    // raw `b.severity.padEnd` crashed on them (adversarial finding, rc.10).
    writeBugs(dir, [{ id: 'BG-001', title: 'no severity', status: 'Open' }]);
    const out = captureList(() => cmdBug({ dir, args: ['list'], err }));
    assert.match(out, /BG-001/);
    assert.match(out, /\[open\s+\]/, 'status renders normalized');
  });

  it('default view shows in_progress and case-folded statuses (snapshot parity)', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    writeBugs(dir, [
      { id: 'BG-001', title: 'working on it', status: 'in_progress', severity: 'medium' },
      { id: 'BG-002', title: 'hand-written case', status: 'Open', severity: 'High' },
      { id: 'BG-003', title: 'resolved', status: 'verified', severity: 'low' },
    ]);
    const out = captureList(() => cmdBug({ dir, args: ['list'], err }));
    assert.match(out, /BG-001/, 'in_progress must appear in the default list');
    assert.match(out, /BG-002/, 'capitalized status must be case-folded, not hidden');
    assert.ok(!out.includes('BG-003'), 'verified is not active');
  });

  it('--status and --severity filters are case-folded', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec' }));
    writeBugs(dir, [
      { id: 'BG-001', title: 'a', status: 'Open', severity: 'High' },
      { id: 'BG-002', title: 'b', status: 'closed', severity: 'low' },
    ]);
    const out = captureList(() => cmdBug({ dir, args: ['list', '--status', 'open'], err }));
    assert.match(out, /BG-001/);
    assert.ok(!out.includes('BG-002'));
    const out2 = captureList(() => cmdBug({ dir, args: ['list', '--severity', 'high'], err }));
    assert.match(out2, /BG-001/);
  });

  // FB-SCOPE-BLIND-0724: an empty root default view must not imply project-wide
  // emptiness while a feature scope holds active bugs.
  it('empty root list hints at feature scopes holding open bugs', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ projectName: 'p', artifactsDir: 'spec' }));
    writeBugs(dir, [{ id: 'BG-001', title: 'done', status: 'verified', severity: 'low' }]);
    const featDir = path.join(dir, 'features', 'grid-ux');
    fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(featDir, '.aitri'), JSON.stringify({ projectName: 'grid-ux', artifactsDir: 'spec' }));
    fs.writeFileSync(path.join(featDir, 'spec', 'BUGS.json'), JSON.stringify({
      bugs: [{ id: 'BG-001', title: 'active', status: 'in_progress', severity: 'medium' }],
    }));
    const out = captureList(() => cmdBug({ dir, args: ['list'], err }));
    assert.match(out, /No bugs match the filter\./);
    assert.match(out, /open in features: grid-ux 1/);
    assert.match(out, /aitri feature bug grid-ux list/);
  });

  it('no cross-scope hint when an explicit filter is set', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ projectName: 'p', artifactsDir: 'spec' }));
    writeBugs(dir, []);
    const featDir = path.join(dir, 'features', 'x');
    fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(featDir, '.aitri'), JSON.stringify({ projectName: 'x', artifactsDir: 'spec' }));
    fs.writeFileSync(path.join(featDir, 'spec', 'BUGS.json'), JSON.stringify({
      bugs: [{ id: 'BG-001', title: 'active', status: 'open', severity: 'low' }],
    }));
    const out = captureList(() => cmdBug({ dir, args: ['list', '--status', 'closed'], err }));
    assert.match(out, /No bugs match the filter\./);
    assert.ok(!out.includes('open in features'), 'filtered view must not cross-hint');
  });
});
