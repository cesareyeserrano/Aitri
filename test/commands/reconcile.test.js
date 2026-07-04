/**
 * Tests: aitri reconcile
 * Covers: no-baseline error, clean state, pending state, briefing output,
 *         reconcileState recorded on approve build, cleared on cascade
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { cmdReconcile, compactTestCases, compactManifest } from '../../lib/commands/reconcile.js';
import { cmdApprove }   from '../../lib/commands/approve.js';
import { loadConfig, saveConfig, cascadeInvalidate } from '../../lib/state.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-reconcile-'));
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function captureStdout(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

function captureLog(fn) {
  let out = '';
  const orig = console.log.bind(console);
  console.log = (...a) => { out += a.join(' ') + '\n'; };
  try { fn(); } finally { console.log = orig; }
  return out;
}

const noopErr = (msg) => { throw new Error(msg); };

// ── N2: proportional briefing — compact projection ──────────────────────────────

describe('compactTestCases() — keeps every TC, drops verbose execution fields', () => {
  // Pretty-printed like the real briefing embeds it — the projection is compared
  // apples-to-apples (both indented), so the size win is from dropped fields, not formatting.
  const full = JSON.stringify({
    test_plan: { strategy: 's' },
    test_cases: [
      { id: 'TC-001h', title: 'Login ok', requirement_id: 'FR-001', user_story_id: 'US-001',
        type: 'unit', scenario: 'happy_path', expected_result: 'returns 200',
        steps: ['a', 'b', 'c'], preconditions: ['x'], test_data: { big: 'payload' },
        given: 'g', when: 'w', then: 't' },
      { id: 'TC-002f', title: 'Login fail', frs: ['FR-001', 'FR-002'], type: 'unit',
        scenario: 'negative', steps: ['lots', 'of', 'steps'], then: 'denied' },
    ],
  }, null, 2);

  it('preserves identity, FR mapping, scenario and expected_result for every TC', () => {
    const out = JSON.parse(compactTestCases(full));
    assert.equal(out.test_cases.length, 2, 'no TC is dropped');
    assert.equal(out.test_cases[0].id, 'TC-001h');
    assert.equal(out.test_cases[0].requirement_id, 'FR-001');
    assert.equal(out.test_cases[0].scenario, 'happy_path');
    assert.equal(out.test_cases[0].expected_result, 'returns 200');
    assert.deepEqual(out.test_cases[1].frs, ['FR-001', 'FR-002'], 'frs[] mapping preserved');
  });

  it('drops steps / given / when / then / test_data / preconditions', () => {
    const text = compactTestCases(full);
    for (const field of ['"steps"', '"preconditions"', '"test_data"', '"given"', '"when"', '"then"']) {
      assert.ok(!text.includes(field), `${field} must be dropped from the projection`);
    }
    assert.ok(text.length < full.length, 'projection is smaller than the full JSON');
  });

  it('falls back to the raw text when input is not parseable JSON', () => {
    assert.equal(compactTestCases('(not available)'), '(not available)');
    assert.equal(compactTestCases('{not json'), '{not json');
  });
});

describe('compactManifest() — keeps build facts, drops irrelevant config', () => {
  const full = JSON.stringify({
    files_created: ['src/a.js'], files_modified: ['src/b.js'], test_files: ['t/a.test.js'],
    test_runner: 'npm test', technical_debt: [{ fr_id: 'FR-001', substitution: 'stub' }],
    quality_gates: [{ name: 'lint', command: 'eslint .' }],
    environment_variables: [{ name: 'X', default: '1' }], setup_commands: ['npm i'],
  });

  it('keeps file lists, test runner/files and technical_debt', () => {
    const out = JSON.parse(compactManifest(full));
    assert.deepEqual(out.files_created, ['src/a.js']);
    assert.deepEqual(out.files_modified, ['src/b.js']);
    assert.equal(out.test_runner, 'npm test');
    assert.equal(out.technical_debt[0].fr_id, 'FR-001');
  });

  it('drops quality_gates, environment_variables and setup_commands', () => {
    const text = compactManifest(full);
    for (const field of ['quality_gates', 'environment_variables', 'setup_commands']) {
      assert.ok(!text.includes(field), `${field} must be dropped`);
    }
  });

  it('falls back to the raw text when not parseable', () => {
    assert.equal(compactManifest('(not available)'), '(not available)');
  });
});

// ── No baseline ───────────────────────────────────────────────────────────────

describe('cmdReconcile() — no baseline', () => {
  it('exits when no reconcileState.baseRef in config', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({ aitriVersion: '0.1.70', artifactsDir: 'spec' }));
      let exitCalled = false;
      const origExit = process.exit.bind(process);
      process.exit = () => { exitCalled = true; throw new Error('exit'); };
      try {
        cmdReconcile({ dir, err: noopErr });
      } catch {}
      finally { process.exit = origExit; }
      assert.ok(exitCalled, 'process.exit must be called when no baseline');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('errors when project has no .aitri', () => {
    const dir = tmpDir();
    try {
      assert.throws(
        () => cmdReconcile({ dir, err: noopErr }),
        /Not an Aitri project/
      );
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Clean state (no changes) ──────────────────────────────────────────────────

describe('cmdReconcile() — no changes since baseline', () => {
  it('marks status as resolved when no files changed (mtime baseline in future)', () => {
    const dir = tmpDir();
    try {
      const futureRef = new Date(Date.now() + 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        reconcileState: { baseRef: futureRef, method: 'mtime', status: 'pending' },
      }));
      // Create a source file older than the future baseline
      writeFile(dir, 'src/app.js', 'console.log("hello");');
      // Set mtime to past
      const pastTime = new Date(Date.now() - 10_000);
      fs.utimesSync(path.join(dir, 'src', 'app.js'), pastTime, pastTime);

      captureLog(() => cmdReconcile({ dir, err: noopErr }));
      const config = loadConfig(dir);
      assert.equal(config.reconcileState.status, 'resolved');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('prints clean message when no changes', () => {
    const dir = tmpDir();
    try {
      const futureRef = new Date(Date.now() + 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        reconcileState: { baseRef: futureRef, method: 'mtime', status: 'pending' },
      }));
      const out = captureLog(() => cmdReconcile({ dir, err: noopErr }));
      assert.ok(out.includes('No code changes'), `expected clean message, got: ${out}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Changes detected ─────────────────────────────────────────────────────────

// ── UPLAN-0703 B4: unreachable baseline ≠ clean; pending clears verifyPassed ─────

describe('cmdReconcile() — B4 unreachable baseline refuses, never reports clean', () => {
  function runExpectExit(fn) {
    let exitCode = null, stderr = '';
    const origExit = process.exit.bind(process);
    const origErr  = process.stderr.write.bind(process.stderr);
    process.exit = (code) => { exitCode = code; throw new Error('exit'); };
    process.stderr.write = (c) => { stderr += c; return true; };
    try { fn(); } catch { /* exit throw */ }
    finally { process.exit = origExit; process.stderr.write = origErr; }
    return { exitCode, stderr };
  }

  it('refuses (exit 1) when a git baseRef cannot be compared and is not a timestamp — no false clean', () => {
    const dir = tmpDir();   // NOT a git repo — the git path is unavailable
    try {
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion: '0.1.70', artifactsDir: 'spec',
        reconcileState: { baseRef: 'deadbeefcafe1234deadbeefcafe1234deadbeef', method: 'git', status: 'resolved' },
      }));
      const { exitCode, stderr } = runExpectExit(() =>
        captureStdout(() => cmdReconcile({ dir, err: noopErr })));
      assert.equal(exitCode, 1, 'an unreachable baseline must refuse, not report clean');
      assert.match(stderr, /baseline is unreachable/i);
      assert.match(stderr, /reconcile --init/);
      const config = loadConfig(dir);
      assert.notEqual(config.reconcileState.status, 'pending', 'state must not be mutated on refusal');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('--init re-baselines over an unreachable baseline (the documented recovery path)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion: '0.1.70', artifactsDir: 'spec',
        approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
        reconcileState: { baseRef: 'deadbeefcafe1234deadbeefcafe1234deadbeef', method: 'git', status: 'resolved' },
      }));
      let stderr = '';
      const origErr = process.stderr.write.bind(process.stderr);
      process.stderr.write = (c) => { stderr += c; return true; };
      try { captureLog(() => cmdReconcile({ dir, args: ['--init'], err: noopErr })); }
      finally { process.stderr.write = origErr; }
      const config = loadConfig(dir);
      assert.notEqual(config.reconcileState.baseRef, 'deadbeefcafe1234deadbeefcafe1234deadbeef', 'baseline must be replaced');
      assert.match(stderr, /unreachable.*re-initializing/is);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

});

describe('cmdReconcile() — B4 entering pending clears the stale verify verdict', () => {
  it('clears verifyPassed + verifySummary and records the reconcile-pending event', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion: '0.1.70', artifactsDir: 'spec',
        verifyPassed: true, verifySummary: { total: 5, passed: 5, failed: 0, skipped: 0 },
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'src/app.js', 'console.log("off-pipeline change");');
      let stderr = '';
      const origErr = process.stderr.write.bind(process.stderr);
      process.stderr.write = (c) => { stderr += c; return true; };
      try { captureStdout(() => cmdReconcile({ dir, err: noopErr })); }
      finally { process.stderr.write = origErr; }
      const config = loadConfig(dir);
      assert.equal(config.reconcileState.status, 'pending');
      assert.equal(config.verifyPassed, false, 'the pre-drift verify verdict must not survive into pending');
      assert.ok(!config.verifySummary, 'verifySummary must be cleared with it');
      assert.match(stderr, /verifyPassed cleared/);
      const ev = (config.events || []).find(e => e.event === 'reconcile-pending');
      assert.ok(ev, 'reconcile-pending event must be recorded');
      assert.equal(ev.verifyPassedCleared, true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('re-running reconcile while ALREADY pending does not re-clear a fresh verify nor re-append the event', () => {
    // Adversarial-pass fix: the clear fires on the TRANSITION into pending only. A re-run
    // against the same unchanged drift (e.g. to re-print the briefing) must not destroy a
    // verify done AFTER the drift, nor churn the 20-capped shared event log.
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion: '0.1.70', artifactsDir: 'spec',
        verifyPassed: true, verifySummary: { total: 5, passed: 5, failed: 0, skipped: 0 },
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'src/app.js', 'off-pipeline change');
      const quietErr = () => { const o = process.stderr.write.bind(process.stderr); process.stderr.write = () => true; return () => { process.stderr.write = o; }; };
      let restore = quietErr();
      try { captureStdout(() => cmdReconcile({ dir, err: noopErr })); } finally { restore(); }
      // Simulate a FRESH verify over the drifted code (postdates the drift).
      const cfg1 = loadConfig(dir);
      assert.equal(cfg1.reconcileState.status, 'pending');
      cfg1.verifyPassed = true;
      cfg1.verifySummary = { total: 5, passed: 5, failed: 0, skipped: 0 };
      saveConfig(dir, cfg1);
      // Re-run reconcile while still pending, same drift.
      restore = quietErr();
      try { captureStdout(() => cmdReconcile({ dir, err: noopErr })); } finally { restore(); }
      const cfg2 = loadConfig(dir);
      assert.equal(cfg2.verifyPassed, true, 'a verify that POSTDATES the drift must survive a reconcile re-run');
      const pendingEvents = (cfg2.events || []).filter(e => e.event === 'reconcile-pending');
      assert.equal(pendingEvents.length, 1, 'only the transition appends the event — re-runs must not churn the capped log');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not touch verify fields when verifyPassed was already false', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion: '0.1.70', artifactsDir: 'spec',
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'src/app.js', 'code');
      captureStdout(() => cmdReconcile({ dir, err: noopErr }));
      const config = loadConfig(dir);
      assert.equal(config.reconcileState.status, 'pending');
      assert.ok(!config.verifyPassed, 'verifyPassed stays falsy');
      const ev = (config.events || []).find(e => e.event === 'reconcile-pending');
      assert.ok(ev, 'the pending event is still recorded');
      assert.ok(!('verifyPassedCleared' in ev), 'no clearing happened, so no clearing flag');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdReconcile() — changes detected (mtime)', () => {
  it('sets reconcileState.status to pending when files changed', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'src/app.js', 'console.log("new code");');

      captureStdout(() => cmdReconcile({ dir, err: noopErr }));
      const config = loadConfig(dir);
      assert.equal(config.reconcileState.status, 'pending');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('generates briefing to stdout when files changed', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'src/feature.js', 'function newThing() {}');
      writeFile(dir, 'spec/01_REQUIREMENTS.json', '{"functional_requirements":[]}');

      const out = captureStdout(() => cmdReconcile({ dir, err: noopErr }));
      assert.ok(out.length > 100, 'briefing must be non-trivial');
      assert.ok(out.includes('src/feature.js'), 'briefing must list the changed file');
      assert.ok(out.includes('Classification'), 'briefing must include classification instructions');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not include spec/ files in the change list', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'src/app.js', 'code');
      writeFile(dir, 'spec/01_REQUIREMENTS.json', '{}');

      const out = captureStdout(() => cmdReconcile({ dir, err: noopErr }));
      assert.ok(!out.includes('spec/01_REQUIREMENTS.json'), 'spec/ files must not appear in change list');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not include allowlisted files (regenerated bundles, /dist/) in the change list (mtime path)', () => {
    // mtime path: SOURCE_EXTS already filters for .js/.go/etc., but .min.js
    // matches and /dist/ paths can contain regular .js. The allowlist filter
    // catches both before the briefing renders.
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'src/feature.js', 'function newThing() {}');
      writeFile(dir, 'web/static/dist/app.min.js', '/* generated */ var x=1;');
      writeFile(dir, 'web/static/dist/main.js',     '/* generated */ var y=2;');
      writeFile(dir, 'spec/01_REQUIREMENTS.json',   '{}');

      const out = captureStdout(() => cmdReconcile({ dir, err: noopErr }));
      assert.ok(out.includes('src/feature.js'),       'behavioral file must appear');
      assert.ok(!out.includes('app.min.js'),          'minified bundle must be excluded');
      assert.ok(!out.includes('web/static/dist/'),    '/dist/ contents must be excluded');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // rc.3 — Hub canary 2026-05-13: after a feature sub-pipeline ships, parent
  // reconcile was listing features/<name>/spec/* and features/<name>/.aitri as
  // outside-pipeline changes against the parent build baseline. They are
  // governed by the feature's own gate, not by the parent — exclude them
  // symmetrically with root spec/ + .aitri. Shared code the feature contributes
  // (lib/, tests/ outside features/) stays in scope and still goes through the
  // operator's --resolve TTY gate.
  it('does not include features/<name>/spec/ or .aitri in the change list (mtime path)', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'lib/collector/snapshot-reader.js', '// shared product code');
      writeFile(dir, 'features/hub-bug-summary-snapshot/spec/01_REQUIREMENTS.json', '{}');
      writeFile(dir, 'features/hub-bug-summary-snapshot/spec/04_TEST_RESULTS.json', '{}');
      writeFile(dir, 'features/hub-bug-summary-snapshot/.aitri', '{"artifactsDir":"spec"}');

      const out = captureStdout(() => cmdReconcile({ dir, err: noopErr }));
      assert.ok(out.includes('lib/collector/snapshot-reader.js'),
        'shared product code under lib/ must appear (parent baseline change)');
      assert.ok(!out.includes('features/hub-bug-summary-snapshot/spec/'),
        'feature spec/ artifacts must NOT appear (governed by feature pipeline)');
      assert.ok(!out.includes('features/hub-bug-summary-snapshot/.aitri'),
        'feature .aitri state must NOT appear (governed by feature pipeline)');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('treats all-allowlist diff as no-op (no pending state) — Ultron canary regression', () => {
    // mtime can detect a .min.js bump (extension is in SOURCE_EXTS) but the
    // allowlist excludes it. Result: status stays 'resolved', no briefing.
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'web/static/dist/bundle.min.js', '/* regen */');

      const out = captureLog(() => cmdReconcile({ dir, err: noopErr }));
      const config = loadConfig(dir);
      assert.equal(config.reconcileState.status, 'resolved',
        'pure allowlist diff must NOT flip status to pending');
      assert.ok(out.includes('No code changes detected'),
        'must print clean message when only non-behavioral changes detected');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── approve build records reconcileState ─────────────────────────────────────

describe('cmdApprove() — records reconcileState on phase 4 approval', () => {
  it('sets reconcileState with resolved status after approve build', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/04_BUILD_REPORT.json', '{"files_created":[],"setup_commands":[]}');
      writeFile(dir, '.aitri', JSON.stringify({
        artifactsDir:   'spec',
        approvedPhases: [1, 2, 3], // upstream must be approved (ordering gate §3.1)
        completedPhases: [4],
      }));
      const origLog = console.log.bind(console);
      console.log = () => {};
      try {
        cmdApprove({ dir, args: ['build'], err: noopErr });
      } finally { console.log = origLog; }

      const config = loadConfig(dir);
      assert.ok(config.reconcileState, 'reconcileState must be set');
      assert.equal(config.reconcileState.status, 'resolved');
      assert.ok(config.reconcileState.baseRef, 'baseRef must be set');
      assert.ok(['git', 'mtime'].includes(config.reconcileState.method), 'method must be git or mtime');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not set reconcileState for other phases', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/01_REQUIREMENTS.json', '{"functional_requirements":[]}');
      writeFile(dir, '.aitri', JSON.stringify({
        artifactsDir:   'spec',
        approvedPhases:  [],
        completedPhases: [1],
      }));
      const origLog = console.log.bind(console);
      console.log = () => {};
      try {
        cmdApprove({ dir, args: ['requirements'], err: noopErr });
      } finally { console.log = origLog; }

      const config = loadConfig(dir);
      assert.ok(!config.reconcileState, 'reconcileState must not be set for non-build phases');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── --resolve flag ───────────────────────────────────────────────────────────

describe('cmdReconcile() --resolve — gates and cycle closure', () => {
  function captureStderr(fn) {
    let out = '';
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { out += chunk; return true; };
    try { fn(); } catch {} finally { process.stderr.write = orig; }
    return out;
  }

  function withExit(fn) {
    const origExit = process.exit.bind(process);
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error('exit'); };
    try { fn(); } catch {} finally { process.exit = origExit; }
    return exitCode;
  }

  it('errors when reconcileState is not pending', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.83',
        artifactsDir:   'spec',
        reconcileState: { baseRef: 'abc123', method: 'git', status: 'resolved' },
      }));
      const stderr = captureStderr(() => {
        withExit(() => cmdReconcile({ dir, args: ['--resolve'], err: noopErr }));
      });
      assert.ok(stderr.includes('Nothing to resolve'), `expected pending guard, got: ${stderr}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('auto-advances baseline when no files changed', () => {
    const dir = tmpDir();
    try {
      const futureRef = new Date(Date.now() + 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.83',
        artifactsDir:   'spec',
        reconcileState: { baseRef: futureRef, method: 'mtime', status: 'pending' },
      }));
      captureLog(() => cmdReconcile({ dir, args: ['--resolve'], err: noopErr }));
      const config = loadConfig(dir);
      assert.equal(config.reconcileState.status, 'resolved');
      const events = config.events || [];
      assert.ok(events.some(e => e.event === 'reconcile-resolved'), 'event must be appended');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('blocks resolve when verifyPassed is false', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.83',
        artifactsDir:   'spec',
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'pending' },
      }));
      writeFile(dir, 'src/app.js', 'console.log("changed");');

      const stderr = captureStderr(() => {
        withExit(() => cmdReconcile({ dir, args: ['--resolve'], err: noopErr }));
      });
      assert.ok(stderr.includes('verify has not passed'), `expected verify gate, got: ${stderr}`);
      const config = loadConfig(dir);
      assert.equal(config.reconcileState.status, 'pending', 'state must not advance on gate failure');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('blocks resolve when open critical/high bugs exist', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.83',
        artifactsDir:   'spec',
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'pending' },
        verifyPassed:   true,
      }));
      writeFile(dir, 'src/app.js', 'console.log("changed");');
      writeFile(dir, 'spec/BUGS.json', JSON.stringify({
        bugs: [{ id: 'BG-001', title: 'critical bug', severity: 'critical', status: 'open' }],
      }));

      const stderr = captureStderr(() => {
        withExit(() => cmdReconcile({ dir, args: ['--resolve'], err: noopErr }));
      });
      assert.ok(stderr.includes('critical/high bug'), `expected bug gate, got: ${stderr}`);
      const config = loadConfig(dir);
      assert.equal(config.reconcileState.status, 'pending');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('blocks resolve in non-TTY mode when changes exist', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.83',
        artifactsDir:   'spec',
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'pending' },
        verifyPassed:   true,
      }));
      writeFile(dir, 'src/app.js', 'console.log("changed");');

      const stderr = captureStderr(() => {
        withExit(() => cmdReconcile({ dir, args: ['--resolve'], err: noopErr }));
      });
      assert.ok(stderr.includes('non-interactively'), `expected TTY gate, got: ${stderr}`);
      const config = loadConfig(dir);
      assert.equal(config.reconcileState.status, 'pending');
    } finally {
      process.stdin.isTTY = origIsTTY;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── --resolve working-tree guard (git baselines, rc.8 / Codex Cesar canary) ──

describe('cmdReconcile() --resolve — uncommitted behavioral working-tree guard', () => {
  function captureStderr(fn) {
    let out = '';
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { out += chunk; return true; };
    try { fn(); } catch {} finally { process.stderr.write = orig; }
    return out;
  }
  function withExit(fn) {
    const origExit = process.exit.bind(process);
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error('exit'); };
    try { fn(); } catch {} finally { process.exit = origExit; }
    return exitCode;
  }
  function gitRepo(dir) {
    const o = { cwd: dir, stdio: 'ignore' };
    execSync('git init -q', o);
    execSync('git config user.email t@t.t', o);
    execSync('git config user.name t', o);
    execSync('git config commit.gpgsign false', o);
  }
  function commitAll(dir, msg) {
    execSync('git add -A', { cwd: dir, stdio: 'ignore' });
    execSync(`git commit -q -m "${msg}"`, { cwd: dir, stdio: 'ignore' });
    return execSync('git rev-parse HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  }

  it('blocks resolve when a behavioral file is uncommitted (git baseline)', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;            // guard fires before the TTY gate
    try {
      gitRepo(dir);
      writeFile(dir, 'src/app.js', 'export const a = 1;\n');
      const base = commitAll(dir, 'base');
      writeFile(dir, 'src/app.js', 'export const a = 2;\n');
      commitAll(dir, 'committed behavioral change');   // base..HEAD has 1 file
      writeFile(dir, 'src/other.js', 'export const b = 3;\n');  // uncommitted (untracked)
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.83',
        artifactsDir:   'spec',
        reconcileState: { baseRef: base, method: 'git', status: 'pending' },
        verifyPassed:   true,
      }));

      const stderr = captureStderr(() => {
        withExit(() => cmdReconcile({ dir, args: ['--resolve'], err: noopErr }));
      });
      assert.ok(stderr.includes('uncommitted behavioral'), `expected tree guard, got: ${stderr}`);
      assert.ok(stderr.includes('src/other.js'), 'lists the uncommitted behavioral file');
      const config = loadConfig(dir);
      assert.equal(config.reconcileState.status, 'pending', 'must not advance the baseline');
    } finally {
      process.stdin.isTTY = origIsTTY;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes the guard when the working tree is clean (reaches the TTY gate)', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;           // stop at the TTY gate → proves guard passed
    try {
      gitRepo(dir);
      writeFile(dir, 'src/app.js', 'export const a = 1;\n');
      const base = commitAll(dir, 'base');
      writeFile(dir, 'src/app.js', 'export const a = 2;\n');
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.83',
        artifactsDir:   'spec',
        reconcileState: { baseRef: base, method: 'git', status: 'pending' },
        verifyPassed:   true,
      }));
      commitAll(dir, 'committed change + aitri');   // tree now clean

      const stderr = captureStderr(() => {
        withExit(() => cmdReconcile({ dir, args: ['--resolve'], err: noopErr }));
      });
      assert.ok(!stderr.includes('uncommitted behavioral'), 'clean tree must pass the guard');
      assert.ok(stderr.includes('non-interactively'), `expected TTY gate after guard, got: ${stderr}`);
    } finally {
      process.stdin.isTTY = origIsTTY;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not apply the guard to mtime baselines (working tree already read)', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      gitRepo(dir);                        // git repo, but baseline method is mtime
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, 'src/app.js', 'export const a = 1;\n');   // uncommitted, recent mtime
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.83',
        artifactsDir:   'spec',
        reconcileState: { baseRef: pastRef, method: 'mtime', status: 'pending' },
        verifyPassed:   true,
      }));

      const stderr = captureStderr(() => {
        withExit(() => cmdReconcile({ dir, args: ['--resolve'], err: noopErr }));
      });
      assert.ok(!stderr.includes('uncommitted behavioral'), 'mtime baseline must skip the git guard');
      assert.ok(stderr.includes('non-interactively'), `expected TTY gate, got: ${stderr}`);
    } finally {
      process.stdin.isTTY = origIsTTY;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── --init escape hatch (A4) ─────────────────────────────────────────────────

describe('cmdReconcile() --init — brownfield baseline escape hatch', () => {

  it('refuses when Phase 4 is not approved', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion: '0.1.70',
        artifactsDir: 'spec',
        approvedPhases: [1, 2, 3],
      }));
      assert.throws(
        () => cmdReconcile({ dir, args: ['--init'], err: noopErr }),
        /Phase 4.*must be approved/
      );
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses when a REACHABLE reconcileState already exists (no silent clobber)', () => {
    // B4 note: the baseline must be reachable for the clobber-refusal to apply — an
    // unreachable one (e.g. a git SHA in a non-git dir) is now the documented --init
    // recovery path and re-initializes instead (covered in the B4 describe above).
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.80',
        artifactsDir:   'spec',
        approvedPhases: [1, 2, 3, 4],
        reconcileState: { baseRef: new Date(Date.now() - 60_000).toISOString(), method: 'mtime', status: 'resolved' },
      }));
      assert.throws(
        () => cmdReconcile({ dir, args: ['--init'], err: noopErr }),
        /already exists/
      );
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('stamps mtime baseline when no git repo', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        approvedPhases: [1, 2, 3, 4],
      }));
      captureLog(() => cmdReconcile({ dir, args: ['--init'], err: noopErr }));
      const cfg = loadConfig(dir);
      assert.ok(cfg.reconcileState);
      assert.equal(cfg.reconcileState.method, 'mtime');
      assert.equal(cfg.reconcileState.status, 'resolved');
      // baseRef must be an ISO timestamp when method is mtime
      assert.ok(!isNaN(new Date(cfg.reconcileState.baseRef).getTime()));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('reconcile auto-establishes a baseline when Phase 4 is approved but none exists (ADR-045)', () => {
    const dir = tmpDir();
    try {
      // Phase 4 approved (shared), but no reconcileState — the fresh-clone / split case,
      // and the old pre-v0.1.80 brownfield case. Auto-inits instead of hinting at --init.
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        approvedPhases: [1, 2, 3, 4],
      }));
      let captured = '';
      const origWrite = process.stderr.write.bind(process.stderr);
      const origLog = console.log;
      process.stderr.write = (chunk) => { captured += chunk; return true; };
      console.log = () => {};
      try { cmdReconcile({ dir, err: noopErr }); } catch {}
      finally {
        process.stderr.write = origWrite;
        console.log = origLog;
      }
      assert.match(captured, /Established a reconcile baseline/);
      assert.ok(loadConfig(dir).reconcileState?.baseRef, 'a baseline was stamped and persisted');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('reconcile without --init keeps original hint when Phase 4 not approved', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        approvedPhases: [1, 2],
      }));
      let captured = '';
      const origWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = (chunk) => { captured += chunk; return true; };
      const origExit = process.exit.bind(process);
      process.exit = () => { throw new Error('exit'); };
      try { cmdReconcile({ dir, err: noopErr }); } catch {}
      finally {
        process.stderr.write = origWrite;
        process.exit = origExit;
      }
      assert.match(captured, /Complete the pipeline to Phase 4 first/);
      assert.doesNotMatch(captured, /reconcile --init/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

});

// ── cascade clears reconcileState ────────────────────────────────────────────

describe('cascadeInvalidate() — clears reconcileState when build is downstream', () => {
  it('deletes reconcileState when cascade reaches phase 4', () => {
    const config = {
      approvedPhases:  [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
      artifactHashes:  {},
      verifyPassed:    true,
      reconcileState:  { baseRef: 'abc123', method: 'git', status: 'resolved' },
    };
    cascadeInvalidate(config, 1); // requirements cascade includes 4
    assert.ok(!config.reconcileState, 'reconcileState must be cleared');
  });

  it('keeps reconcileState when cascade does not reach phase 4', () => {
    const config = {
      approvedPhases:  [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
      artifactHashes:  {},
      reconcileState:  { baseRef: 'abc123', method: 'git', status: 'resolved' },
    };
    cascadeInvalidate(config, 3); // tests cascade: only [4, 5]
    // phase 4 IS downstream of 3, so reconcileState should be cleared
    assert.ok(!config.reconcileState, 'reconcileState must be cleared when 4 is downstream');
  });

  it('keeps reconcileState when only phase 5 is cascaded', () => {
    const config = {
      approvedPhases:  [1, 2, 3, 4, 5],
      completedPhases: [1, 2, 3, 4, 5],
      artifactHashes:  {},
      reconcileState:  { baseRef: 'abc123', method: 'git', status: 'resolved' },
    };
    cascadeInvalidate(config, 4); // build cascade: only [5]
    // phase 4 is NOT downstream of itself, phase 5 is — reconcileState should stay
    assert.ok(!config.reconcileState, 'reconcileState must be cleared because 5 is downstream and 4-or-5 check triggers');
  });
});

// ── R3-15: git baseRef must never be shell-interpreted ───────────────────────────
describe('cmdReconcile() — git baseRef is never shell-interpreted (R3-15 RCE guard)', () => {
  it('does NOT execute a shell payload smuggled in reconcileState.baseRef', () => {
    const dir = tmpDir();
    const run = (c) => execSync(c, { cwd: dir, stdio: 'ignore' });
    run('git init -q'); run('git config user.email a@b'); run('git config user.name A');
    writeFile(dir, 'README', 'x'); run('git add -A'); run('git commit -q -m init');
    const pwned = path.join(dir, 'PWNED');
    // A committed `.aitri` whose git baseRef carries a command-substitution payload. Pre-fix,
    // `git diff ${baseRef}..HEAD` ran via a shell on a plain `aitri reconcile` (and the same
    // shape on `aitri resume`/`status` drift checks) → zero-interaction RCE.
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      aitriVersion: '2.0.0', projectName: 'p', artifactsDir: 'spec',
      approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
      reconcileState: { baseRef: `$(touch ${pwned})`, method: 'git', status: 'resolved' },
    }));
    // git errors on the bogus revision (no shell ran). Post-B4 the unresolvable baseRef is
    // refused as unreachable (process.exit 1) instead of silently falling through — stub the
    // exit; the security assertion is unchanged: the payload must never execute.
    let exitCode = null;
    const origExit = process.exit.bind(process);
    const origErr  = process.stderr.write.bind(process.stderr);
    process.exit = (code) => { exitCode = code; throw new Error('exit'); };
    process.stderr.write = () => true;
    try { captureLog(() => cmdReconcile({ dir, args: [], err: noopErr })); } catch { /* expected */ }
    finally { process.exit = origExit; process.stderr.write = origErr; }
    assert.equal(fs.existsSync(pwned), false, 'baseRef must never reach a shell');
    assert.equal(exitCode, 1, 'an unresolvable baseRef is refused as unreachable (B4), never silently clean');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
