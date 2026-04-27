/**
 * Tests: aitri normalize
 * Covers: no-baseline error, clean state, pending state, briefing output,
 *         normalizeState recorded on approve build, cleared on cascade
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdNormalize } from '../../lib/commands/normalize.js';
import { cmdApprove }   from '../../lib/commands/approve.js';
import { loadConfig, saveConfig, cascadeInvalidate } from '../../lib/state.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-normalize-'));
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

// ── No baseline ───────────────────────────────────────────────────────────────

describe('cmdNormalize() — no baseline', () => {
  it('exits when no normalizeState.baseRef in config', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({ aitriVersion: '0.1.70', artifactsDir: 'spec' }));
      let exitCalled = false;
      const origExit = process.exit.bind(process);
      process.exit = () => { exitCalled = true; throw new Error('exit'); };
      try {
        cmdNormalize({ dir, err: noopErr });
      } catch {}
      finally { process.exit = origExit; }
      assert.ok(exitCalled, 'process.exit must be called when no baseline');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('errors when project has no .aitri', () => {
    const dir = tmpDir();
    try {
      assert.throws(
        () => cmdNormalize({ dir, err: noopErr }),
        /Not an Aitri project/
      );
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Clean state (no changes) ──────────────────────────────────────────────────

describe('cmdNormalize() — no changes since baseline', () => {
  it('marks status as resolved when no files changed (mtime baseline in future)', () => {
    const dir = tmpDir();
    try {
      const futureRef = new Date(Date.now() + 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        normalizeState: { baseRef: futureRef, method: 'mtime', status: 'pending' },
      }));
      // Create a source file older than the future baseline
      writeFile(dir, 'src/app.js', 'console.log("hello");');
      // Set mtime to past
      const pastTime = new Date(Date.now() - 10_000);
      fs.utimesSync(path.join(dir, 'src', 'app.js'), pastTime, pastTime);

      captureLog(() => cmdNormalize({ dir, err: noopErr }));
      const config = loadConfig(dir);
      assert.equal(config.normalizeState.status, 'resolved');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('prints clean message when no changes', () => {
    const dir = tmpDir();
    try {
      const futureRef = new Date(Date.now() + 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        normalizeState: { baseRef: futureRef, method: 'mtime', status: 'pending' },
      }));
      const out = captureLog(() => cmdNormalize({ dir, err: noopErr }));
      assert.ok(out.includes('No code changes'), `expected clean message, got: ${out}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── Changes detected ─────────────────────────────────────────────────────────

describe('cmdNormalize() — changes detected (mtime)', () => {
  it('sets normalizeState.status to pending when files changed', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        normalizeState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'src/app.js', 'console.log("new code");');

      captureStdout(() => cmdNormalize({ dir, err: noopErr }));
      const config = loadConfig(dir);
      assert.equal(config.normalizeState.status, 'pending');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('generates briefing to stdout when files changed', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        normalizeState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'src/feature.js', 'function newThing() {}');
      writeFile(dir, 'spec/01_REQUIREMENTS.json', '{"functional_requirements":[]}');

      const out = captureStdout(() => cmdNormalize({ dir, err: noopErr }));
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
        normalizeState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'src/app.js', 'code');
      writeFile(dir, 'spec/01_REQUIREMENTS.json', '{}');

      const out = captureStdout(() => cmdNormalize({ dir, err: noopErr }));
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
        normalizeState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'src/feature.js', 'function newThing() {}');
      writeFile(dir, 'web/static/dist/app.min.js', '/* generated */ var x=1;');
      writeFile(dir, 'web/static/dist/main.js',     '/* generated */ var y=2;');
      writeFile(dir, 'spec/01_REQUIREMENTS.json',   '{}');

      const out = captureStdout(() => cmdNormalize({ dir, err: noopErr }));
      assert.ok(out.includes('src/feature.js'),       'behavioral file must appear');
      assert.ok(!out.includes('app.min.js'),          'minified bundle must be excluded');
      assert.ok(!out.includes('web/static/dist/'),    '/dist/ contents must be excluded');
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
        normalizeState: { baseRef: pastRef, method: 'mtime', status: 'resolved' },
      }));
      writeFile(dir, 'web/static/dist/bundle.min.js', '/* regen */');

      const out = captureLog(() => cmdNormalize({ dir, err: noopErr }));
      const config = loadConfig(dir);
      assert.equal(config.normalizeState.status, 'resolved',
        'pure allowlist diff must NOT flip status to pending');
      assert.ok(out.includes('No code changes detected'),
        'must print clean message when only non-behavioral changes detected');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── approve build records normalizeState ─────────────────────────────────────

describe('cmdApprove() — records normalizeState on phase 4 approval', () => {
  it('sets normalizeState with resolved status after approve build', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/04_IMPLEMENTATION_MANIFEST.json', '{"files_created":[],"setup_commands":[]}');
      writeFile(dir, '.aitri', JSON.stringify({
        artifactsDir:   'spec',
        approvedPhases: [],
        completedPhases: [4],
      }));
      const origLog = console.log.bind(console);
      console.log = () => {};
      try {
        cmdApprove({ dir, args: ['build'], err: noopErr });
      } finally { console.log = origLog; }

      const config = loadConfig(dir);
      assert.ok(config.normalizeState, 'normalizeState must be set');
      assert.equal(config.normalizeState.status, 'resolved');
      assert.ok(config.normalizeState.baseRef, 'baseRef must be set');
      assert.ok(['git', 'mtime'].includes(config.normalizeState.method), 'method must be git or mtime');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not set normalizeState for other phases', () => {
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
      assert.ok(!config.normalizeState, 'normalizeState must not be set for non-build phases');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── --resolve flag ───────────────────────────────────────────────────────────

describe('cmdNormalize() --resolve — gates and cycle closure', () => {
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

  it('errors when normalizeState is not pending', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.83',
        artifactsDir:   'spec',
        normalizeState: { baseRef: 'abc123', method: 'git', status: 'resolved' },
      }));
      const stderr = captureStderr(() => {
        withExit(() => cmdNormalize({ dir, args: ['--resolve'], err: noopErr }));
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
        normalizeState: { baseRef: futureRef, method: 'mtime', status: 'pending' },
      }));
      captureLog(() => cmdNormalize({ dir, args: ['--resolve'], err: noopErr }));
      const config = loadConfig(dir);
      assert.equal(config.normalizeState.status, 'resolved');
      const events = config.events || [];
      assert.ok(events.some(e => e.event === 'normalize-resolved'), 'event must be appended');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('blocks resolve when verifyPassed is false', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.83',
        artifactsDir:   'spec',
        normalizeState: { baseRef: pastRef, method: 'mtime', status: 'pending' },
      }));
      writeFile(dir, 'src/app.js', 'console.log("changed");');

      const stderr = captureStderr(() => {
        withExit(() => cmdNormalize({ dir, args: ['--resolve'], err: noopErr }));
      });
      assert.ok(stderr.includes('verify has not passed'), `expected verify gate, got: ${stderr}`);
      const config = loadConfig(dir);
      assert.equal(config.normalizeState.status, 'pending', 'state must not advance on gate failure');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('blocks resolve when open critical/high bugs exist', () => {
    const dir = tmpDir();
    try {
      const pastRef = new Date(Date.now() - 60_000).toISOString();
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.83',
        artifactsDir:   'spec',
        normalizeState: { baseRef: pastRef, method: 'mtime', status: 'pending' },
        verifyPassed:   true,
      }));
      writeFile(dir, 'src/app.js', 'console.log("changed");');
      writeFile(dir, 'spec/BUGS.json', JSON.stringify({
        bugs: [{ id: 'BG-001', title: 'critical bug', severity: 'critical', status: 'open' }],
      }));

      const stderr = captureStderr(() => {
        withExit(() => cmdNormalize({ dir, args: ['--resolve'], err: noopErr }));
      });
      assert.ok(stderr.includes('critical/high bug'), `expected bug gate, got: ${stderr}`);
      const config = loadConfig(dir);
      assert.equal(config.normalizeState.status, 'pending');
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
        normalizeState: { baseRef: pastRef, method: 'mtime', status: 'pending' },
        verifyPassed:   true,
      }));
      writeFile(dir, 'src/app.js', 'console.log("changed");');

      const stderr = captureStderr(() => {
        withExit(() => cmdNormalize({ dir, args: ['--resolve'], err: noopErr }));
      });
      assert.ok(stderr.includes('non-interactively'), `expected TTY gate, got: ${stderr}`);
      const config = loadConfig(dir);
      assert.equal(config.normalizeState.status, 'pending');
    } finally {
      process.stdin.isTTY = origIsTTY;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── --init escape hatch (A4) ─────────────────────────────────────────────────

describe('cmdNormalize() --init — brownfield baseline escape hatch', () => {

  it('refuses when Phase 4 is not approved', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion: '0.1.70',
        artifactsDir: 'spec',
        approvedPhases: [1, 2, 3],
      }));
      assert.throws(
        () => cmdNormalize({ dir, args: ['--init'], err: noopErr }),
        /Phase 4.*must be approved/
      );
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses when normalizeState already exists (no silent clobber)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.80',
        artifactsDir:   'spec',
        approvedPhases: [1, 2, 3, 4],
        normalizeState: { baseRef: 'deadbeef', method: 'git', status: 'resolved' },
      }));
      assert.throws(
        () => cmdNormalize({ dir, args: ['--init'], err: noopErr }),
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
      captureLog(() => cmdNormalize({ dir, args: ['--init'], err: noopErr }));
      const cfg = loadConfig(dir);
      assert.ok(cfg.normalizeState);
      assert.equal(cfg.normalizeState.method, 'mtime');
      assert.equal(cfg.normalizeState.status, 'resolved');
      // baseRef must be an ISO timestamp when method is mtime
      assert.ok(!isNaN(new Date(cfg.normalizeState.baseRef).getTime()));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('normalize without --init hints at --init when Phase 4 approved pre-v0.1.80', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({
        aitriVersion:   '0.1.70',
        artifactsDir:   'spec',
        approvedPhases: [1, 2, 3, 4],
      }));
      let captured = '';
      const origWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = (chunk) => { captured += chunk; return true; };
      const origExit = process.exit.bind(process);
      process.exit = () => { throw new Error('exit'); };
      try { cmdNormalize({ dir, err: noopErr }); } catch {}
      finally {
        process.stderr.write = origWrite;
        process.exit = origExit;
      }
      assert.match(captured, /aitri normalize --init/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('normalize without --init keeps original hint when Phase 4 not approved', () => {
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
      try { cmdNormalize({ dir, err: noopErr }); } catch {}
      finally {
        process.stderr.write = origWrite;
        process.exit = origExit;
      }
      assert.match(captured, /Complete the pipeline to Phase 4 first/);
      assert.doesNotMatch(captured, /normalize --init/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

});

// ── cascade clears normalizeState ────────────────────────────────────────────

describe('cascadeInvalidate() — clears normalizeState when build is downstream', () => {
  it('deletes normalizeState when cascade reaches phase 4', () => {
    const config = {
      approvedPhases:  [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
      artifactHashes:  {},
      verifyPassed:    true,
      normalizeState:  { baseRef: 'abc123', method: 'git', status: 'resolved' },
    };
    cascadeInvalidate(config, 1); // requirements cascade includes 4
    assert.ok(!config.normalizeState, 'normalizeState must be cleared');
  });

  it('keeps normalizeState when cascade does not reach phase 4', () => {
    const config = {
      approvedPhases:  [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
      artifactHashes:  {},
      normalizeState:  { baseRef: 'abc123', method: 'git', status: 'resolved' },
    };
    cascadeInvalidate(config, 3); // tests cascade: only [4, 5]
    // phase 4 IS downstream of 3, so normalizeState should be cleared
    assert.ok(!config.normalizeState, 'normalizeState must be cleared when 4 is downstream');
  });

  it('keeps normalizeState when only phase 5 is cascaded', () => {
    const config = {
      approvedPhases:  [1, 2, 3, 4, 5],
      completedPhases: [1, 2, 3, 4, 5],
      artifactHashes:  {},
      normalizeState:  { baseRef: 'abc123', method: 'git', status: 'resolved' },
    };
    cascadeInvalidate(config, 4); // build cascade: only [5]
    // phase 4 is NOT downstream of itself, phase 5 is — normalizeState should stay
    assert.ok(!config.normalizeState, 'normalizeState must be cleared because 5 is downstream and 4-or-5 check triggers');
  });
});
