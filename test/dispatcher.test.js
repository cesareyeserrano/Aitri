/**
 * Tests: bin/aitri.js — dispatcher as a real process (T5, TEST-HARDENING)
 *
 * The dispatcher is thin by invariant (no business logic), but it owns real
 * behavior that only exists at the process boundary: command routing, the
 * bare-invocation default, cwd-based project resolution, the stray-$HOME
 * capture warning, exit codes, and the top-level catch that translates known
 * errors into guidance instead of a raw stack trace. Unit suites import
 * command modules directly and never execute any of it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'aitri.js');

function run(args, cwd, envOverrides = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, ...envOverrides },
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Matches both named frames ("at fn (file:1:1)") and anonymous ones ("at file:///…:1:1").
const NO_STACK = /\n\s+at (?:[\w.<>[\] ]+ \()?(?:file:|node:|\/)/;

describe('dispatcher — routing and defaults', () => {
  it('bare invocation inside a project runs status, not help', () => {
    const dir = tmp('aitri-disp-bare-');
    try {
      run(['init'], dir);
      const { code, stdout } = run([], dir);
      assert.equal(code, 0);
      assert.match(stdout, /📊 Aitri —/, 'must print the status header');
      assert.match(stdout, /requirements/, 'must print the phase table');
      assert.doesNotMatch(stdout, /█████/, 'must NOT print the help banner');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('bare invocation outside a project falls back to help', () => {
    const dir = tmp('aitri-disp-noproj-');
    try {
      const { code, stdout } = run([], dir);
      assert.equal(code, 0);
      assert.match(stdout, /█████/, 'help banner expected outside a project');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('unknown command prints help and exits 0 (current contract: default → help)', () => {
    // Pinning current behavior: a typo'd command is answered with help, exit 0.
    // If this ever becomes exit-non-zero (scriptability), this test must change
    // together with a version bump — it is an observable-output contract.
    const dir = tmp('aitri-disp-unknown-');
    try {
      const { code, stdout } = run(['frobnicate'], dir);
      assert.equal(code, 0);
      assert.match(stdout, /█████/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('--version prints exactly the version line and exits 0', () => {
    const dir = tmp('aitri-disp-ver-');
    try {
      const { code, stdout } = run(['--version'], dir);
      assert.equal(code, 0);
      assert.match(stdout.trim(), /^Aitri v\d+\.\d+\.\d+(?:-[\w.]+)?$/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('commands resolve the project from a subdirectory (upward .aitri search)', () => {
    const dir = tmp('aitri-disp-sub-');
    try {
      run(['init'], dir);
      const sub = path.join(dir, 'src', 'deep');
      fs.mkdirSync(sub, { recursive: true });
      const { code, stdout } = run(['status'], sub);
      assert.equal(code, 0);
      assert.match(stdout, /📊 Aitri —/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('dispatcher — known-error translation (no raw stack traces)', () => {
  it('.aitri with git merge-conflict markers: guidance + exit 1, no stack trace', () => {
    const dir = tmp('aitri-disp-conflict-');
    try {
      run(['init'], dir);
      const cfgPath = path.join(dir, '.aitri');
      const cfg = fs.readFileSync(cfgPath, 'utf8');
      fs.writeFileSync(cfgPath, `<<<<<<< HEAD\n${cfg}=======\n${cfg}>>>>>>> theirs\n`);
      const { code, stderr } = run(['status'], dir);
      assert.equal(code, 1, 'must exit 1 on unresolved conflict');
      assert.match(stderr, /merge conflict/i, 'must name the conflict');
      assert.doesNotMatch(stderr, NO_STACK, 'must not leak a Node stack trace');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('malformed .aitri (invalid JSON): guidance + exit 1, no stack trace', () => {
    const dir = tmp('aitri-disp-badjson-');
    try {
      run(['init'], dir);
      fs.writeFileSync(path.join(dir, '.aitri'), '{ definitely not json');
      const { code, stderr } = run(['status'], dir);
      assert.equal(code, 1, 'must exit 1 on malformed state');
      assert.match(stderr, /not valid JSON/i, 'must name the parse failure');
      assert.doesNotMatch(stderr, NO_STACK, 'must not leak a Node stack trace');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('status outside any project: friendly guidance + exit 1, no stack trace', () => {
    const dir = tmp('aitri-disp-outside-');
    try {
      const { code, stderr } = run(['status'], dir);
      assert.equal(code, 1);
      assert.match(stderr, /isn't an Aitri project yet/);
      assert.match(stderr, /aitri init|adopt scan/);
      assert.doesNotMatch(stderr, NO_STACK);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('dispatcher — stray $HOME capture warning (C2)', () => {
  it('warns on stderr when the upward search lands on a project at $HOME', () => {
    // os.homedir() honors $HOME on POSIX, so a fake home with its own .aitri
    // reproduces the stray-capture scenario without touching the real one.
    // realpathSync matters: on macOS os.tmpdir() is a symlink (/var → /private/var)
    // while process.cwd() is physical — the note compares resolved paths.
    const fakeHome = fs.realpathSync(tmp('aitri-disp-home-'));
    try {
      run(['init'], fakeHome);
      const work = path.join(fakeHome, 'work', 'sub');
      fs.mkdirSync(work, { recursive: true });
      const { code, stderr } = run(['status'], work, { HOME: fakeHome });
      assert.equal(code, 0, 'status still runs against the resolved project');
      assert.match(stderr, /resolved to the project at \$HOME/, 'capture note expected');
      assert.match(stderr, /aitri init/, 'note must point at the fix');
    } finally { fs.rmSync(fakeHome, { recursive: true, force: true }); }
  });

  it('does not warn when the ancestor project is a normal directory (not $HOME)', () => {
    const root = tmp('aitri-disp-anc-');
    try {
      run(['init'], root);
      const sub = path.join(root, 'src');
      fs.mkdirSync(sub, { recursive: true });
      const { code, stderr } = run(['status'], sub);
      assert.equal(code, 0);
      assert.doesNotMatch(stderr, /resolved to the project at \$HOME/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
