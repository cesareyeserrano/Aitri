/**
 * Tests for lib/host-ci.js (CI-VISIBILITY-0906, ADR-087, 2.2.0-rc.9) — read-only,
 * pull-based host-CI readout via the project's own `gh`.
 *
 * Contract pinned here: ADVISORY ONLY (formatting never suggests a block), silent
 * degradation with a named reason (never a throw — an unnamed unchecked dimension
 * reads as covered), in-progress runs are not verdicts, and the probe is judged
 * per-workflow on the LATEST completed run only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readHostCiStatus, formatHostCiLines } from '../lib/host-ci.js';

/** Fake execFn: routes by command+args, throws where told. */
function fakeExec(routes) {
  return (cmd, args) => {
    const key = `${cmd} ${args.join(' ')}`;
    for (const [prefix, val] of routes) {
      if (key.startsWith(prefix)) {
        if (val instanceof Error) throw val;
        return Buffer.from(val);
      }
    }
    throw new Error(`unrouted: ${key}`);
  };
}

const GIT_OK      = ['git rev-parse --git-dir', '.git'];
const HEAD_MAIN   = ['git symbolic-ref --short refs/remotes/origin/HEAD', 'origin/main'];

function runsJson(runs) {
  return JSON.stringify(runs);
}

describe('readHostCiStatus()', () => {
  it('all green → checked, zero failing, workflow count right', () => {
    const execFn = fakeExec([
      GIT_OK, HEAD_MAIN,
      ['gh run list', runsJson([
        { workflowName: 'CI', conclusion: 'success', status: 'completed', createdAt: '2026-09-01T00:00:00Z', event: 'push' },
        { workflowName: 'CodeQL', conclusion: 'success', status: 'completed', createdAt: '2026-08-31T00:00:00Z', event: 'schedule' },
        { workflowName: 'CI', conclusion: 'failure', status: 'completed', createdAt: '2026-08-30T00:00:00Z', event: 'push' }, // older — must not count
      ])],
    ]);
    const out = readHostCiStatus('/x', { execFn });
    assert.deepEqual(out, { checked: true, branch: 'main', failing: [], workflows: 2 });
  });

  it('THE FIELD CASE: latest run of one workflow failing → named with date and event', () => {
    const execFn = fakeExec([
      GIT_OK, HEAD_MAIN,
      ['gh run list', runsJson([
        { workflowName: 'Security Gate', conclusion: 'failure', status: 'completed', createdAt: '2026-09-02T23:18:08Z', event: 'pull_request' },
        { workflowName: 'CI', conclusion: 'success', status: 'completed', createdAt: '2026-09-02T23:18:08Z', event: 'pull_request' },
      ])],
    ]);
    const out = readHostCiStatus('/x', { execFn });
    assert.equal(out.checked, true);
    assert.equal(out.failing.length, 1);
    assert.equal(out.failing[0].workflow, 'Security Gate');
    assert.equal(out.failing[0].lastRunAt, '2026-09-02T23:18:08Z');
  });

  it('an IN-PROGRESS latest run is not a verdict — the previous completed run decides', () => {
    const execFn = fakeExec([
      GIT_OK, HEAD_MAIN,
      ['gh run list', runsJson([
        { workflowName: 'CI', conclusion: null, status: 'in_progress', createdAt: '2026-09-02T10:00:00Z', event: 'push' },
        { workflowName: 'CI', conclusion: 'success', status: 'completed', createdAt: '2026-09-01T10:00:00Z', event: 'push' },
      ])],
    ]);
    const out = readHostCiStatus('/x', { execFn });
    assert.deepEqual(out.failing, []);
  });

  it('origin/HEAD unset → falls back to the current branch', () => {
    const execFn = fakeExec([
      GIT_OK,
      ['git symbolic-ref --short refs/remotes/origin/HEAD', new Error('no HEAD')],
      ['git rev-parse --abbrev-ref HEAD', 'feat/x'],
      ['gh run list --branch feat/x', runsJson([
        { workflowName: 'CI', conclusion: 'success', status: 'completed', createdAt: '2026-09-01T00:00:00Z', event: 'push' },
      ])],
    ]);
    const out = readHostCiStatus('/x', { execFn });
    assert.equal(out.branch, 'feat/x');
  });

  it('timed_out and startup_failure are RED, not green (rc.9 adversarial find); cancelled is not a verdict', () => {
    const execFn = fakeExec([
      GIT_OK, HEAD_MAIN,
      ['gh run list', runsJson([
        { workflowName: 'Nightly', conclusion: 'timed_out', status: 'completed', createdAt: '2026-09-01T00:00:00Z', event: 'schedule' },
        { workflowName: 'Deploy', conclusion: 'startup_failure', status: 'completed', createdAt: '2026-09-01T00:00:00Z', event: 'push' },
        { workflowName: 'CI', conclusion: 'cancelled', status: 'completed', createdAt: '2026-09-02T00:00:00Z', event: 'push' },
        { workflowName: 'CI', conclusion: 'success', status: 'completed', createdAt: '2026-09-01T00:00:00Z', event: 'push' },
      ])],
    ]);
    const out = readHostCiStatus('/x', { execFn });
    assert.deepEqual(out.failing.map(f => f.workflow).sort(), ['Deploy', 'Nightly'],
      'timed_out/startup_failure must report as failing, never inflate the green count');
    assert.equal(out.workflows, 3, 'cancelled falls through to the previous decided run');
  });

  it('branch guards: detached HEAD and dash-prefixed refs refuse as no-branch (defense-in-depth)', () => {
    const detached = fakeExec([
      GIT_OK,
      ['git symbolic-ref --short refs/remotes/origin/HEAD', new Error('unset')],
      ['git rev-parse --abbrev-ref HEAD', 'HEAD'],
    ]);
    assert.deepEqual(readHostCiStatus('/x', { execFn: detached }), { checked: false, reason: 'no-branch' });
    const hostile = fakeExec([
      GIT_OK,
      ['git symbolic-ref --short refs/remotes/origin/HEAD', 'origin/--repo=evil/repo'],
    ]);
    assert.deepEqual(readHostCiStatus('/x', { execFn: hostile }), { checked: false, reason: 'no-branch' });
  });

  it('degradations are silent-with-reason, never throws: no-git / no-gh / bad JSON / empty', () => {
    assert.deepEqual(
      readHostCiStatus('/x', { execFn: fakeExec([['git rev-parse --git-dir', new Error('not a repo')]]) }),
      { checked: false, reason: 'no-git' });
    assert.deepEqual(
      readHostCiStatus('/x', { execFn: fakeExec([GIT_OK, HEAD_MAIN, ['gh run list', new Error('gh: not found')]]) }),
      { checked: false, reason: 'no-gh' });
    assert.deepEqual(
      readHostCiStatus('/x', { execFn: fakeExec([GIT_OK, HEAD_MAIN, ['gh run list', 'not json']]) }),
      { checked: false, reason: 'gh-failed' });
    assert.deepEqual(
      readHostCiStatus('/x', { execFn: fakeExec([GIT_OK, HEAD_MAIN, ['gh run list', '[]']]) }),
      { checked: false, reason: 'no-runs' });
  });
});

describe('formatHostCiLines()', () => {
  it('failing state renders workflow, date, the quality_gate teaching — and says advisory', () => {
    const lines = formatHostCiLines({
      checked: true, branch: 'main', workflows: 2,
      failing: [{ workflow: 'Security Gate', lastRunAt: '2026-06-16T15:46:31Z', event: 'push' }],
    }).join('\n');
    assert.match(lines, /Security Gate/);
    assert.match(lines, /2026-06-16/);
    assert.match(lines, /advisory, does not block/);
    assert.match(lines, /quality_gate/);
  });

  it('green and not-checked each render exactly one honest line', () => {
    assert.equal(formatHostCiLines({ checked: true, branch: 'main', workflows: 3, failing: [] }).length, 1);
    const nc = formatHostCiLines({ checked: false, reason: 'no-gh' });
    assert.equal(nc.length, 1);
    assert.match(nc[0], /not checked/);
  });
});

// ── Wiring pins: validate calls the probe ONLY in plain text mode ─────────────

import fs   from 'node:fs';
import path from 'node:path';
import os   from 'node:os';
import { cmdValidate } from '../lib/commands/validate.js';

function withCapturedStdout(fn) {
  let out = '';
  const orig = console.log;
  console.log = (...a) => { out += a.join(' ') + '\n'; };
  try { fn(); } finally { console.log = orig; }
  return out;
}

describe('cmdValidate wiring', () => {
  function seed(dir) {
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'v', artifactsDir: 'spec', approvedPhases: [1], completedPhases: [1],
    }));
    fs.writeFileSync(path.join(dir, 'IDEA.md'), '# i\n');
  }

  it('plain validate renders the host-CI advisory from the probe', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hostci-wire-'));
    try {
      seed(dir);
      const out = withCapturedStdout(() => cmdValidate({
        dir, VERSION: 'x', args: [],
        _hostCi: () => ({ checked: true, branch: 'main', workflows: 2,
          failing: [{ workflow: 'Security Gate', lastRunAt: '2026-06-16T00:00:00Z', event: 'push' }] }),
      }));
      assert.match(out, /CI \(host\)/);
      assert.match(out, /Security Gate/);
      assert.match(out, /advisory, does not block/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('--json and --ci NEVER probe (Hub polls --json in cycles; --ci is CI-circular)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hostci-wire2-'));
    try {
      seed(dir);
      let called = 0;
      const spy = () => { called++; return { checked: false, reason: 'no-gh' }; };
      withCapturedStdout(() => { try { cmdValidate({ dir, VERSION: 'x', args: ['--json'], _hostCi: spy }); } catch {} });
      // Plain-text --ci is the REAL pin (rc.9 adversarial find: the first cut only
      // tested --json+--ci, which skipped via --json — a false pin over an
      // unimplemented boundary the ADR called deliberate).
      withCapturedStdout(() => { try { cmdValidate({ dir, VERSION: 'x', args: ['--ci'], _hostCi: spy }); } catch {} });
      withCapturedStdout(() => { try { cmdValidate({ dir, VERSION: 'x', args: ['--json', '--ci'], _hostCi: spy }); } catch {} });
      assert.equal(called, 0, 'the network probe must never run in --json or --ci mode');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); process.exitCode = 0; }
  });
});
