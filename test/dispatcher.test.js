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

  it('unknown command errors on stderr with a suggestion and exits 1 (UX-PRO-0707 1.1)', () => {
    // A typo'd command is an error, not a help request: exit 1 on stderr, no help dump.
    // This closes the scriptability hole where `aitri verfy-complete` "passed" (exit 0).
    const dir = tmp('aitri-disp-unknown-');
    try {
      const { code, stdout, stderr } = run(['statsu'], dir);
      assert.equal(code, 1, 'unknown command must exit non-zero');
      assert.match(stderr, /Unknown command: "statsu"/, 'stderr names the bad input');
      assert.match(stderr, /Did you mean "status"\?/, 'suggests the nearest command');
      assert.doesNotMatch(stdout, /█████/, 'must NOT dump the help banner to stdout');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('a far-off token errors without a misleading suggestion (UX-PRO-0707 1.1)', () => {
    const dir = tmp('aitri-disp-faroff-');
    try {
      const { code, stderr } = run(['xyzzy'], dir);
      assert.equal(code, 1);
      assert.match(stderr, /Unknown command: "xyzzy"/);
      assert.doesNotMatch(stderr, /Did you mean/, 'nothing close → no suggestion line');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  for (const flag of ['--version', '-v', 'version']) {
    it(`${flag} prints exactly the version line and exits 0 (UX-PRO-0707 1.1)`, () => {
      const dir = tmp('aitri-disp-ver-');
      try {
        const { code, stdout } = run([flag], dir);
        assert.equal(code, 0);
        assert.match(stdout.trim(), /^Aitri v\d+\.\d+\.\d+(?:-[\w.]+)?$/);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
  }

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

  it('run-phase outside a project: guidance + exit 1, no stack, NO phantom .aitri (UX-PRO-0707 1.2)', () => {
    const dir = tmp('aitri-disp-rpnoproj-');
    try {
      const { code, stderr } = run(['run-phase', '1'], dir);
      assert.equal(code, 1, 'must exit 1 in a non-project dir');
      assert.match(stderr, /isn't an Aitri project yet/, 'routes through the not-a-project guidance');
      assert.doesNotMatch(stderr, NO_STACK, 'must not leak a Node stack trace');
      assert.doesNotMatch(stderr, /is short \(0 words\)/, 'no contradictory short-seed warning');
      assert.ok(!fs.existsSync(path.join(dir, '.aitri')), 'must NOT create a phantom .aitri');
      assert.ok(!fs.existsSync(path.join(dir, '.aitri.local')), 'must NOT create a phantom .aitri.local');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('run-phase in a half-created feature (no .aitri) gives feature-scoped guidance (UX-PRO-0707 1.2 adversarial)', () => {
    // An orphan feature dir (FEATURE_IDEA.md written, .aitri not — crash mid `feature init`)
    // must point at `feature init`, NOT the project-level `aitri init`.
    const dir = tmp('aitri-disp-orphanfeat-');
    try {
      run(['init'], dir);
      const featDir = path.join(dir, 'aitri', 'features', 'halfmade');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(featDir, 'FEATURE_IDEA.md'), '## Feature\n');
      const { code, stderr } = run(['feature', 'run-phase', 'halfmade', '1'], dir);
      assert.equal(code, 1);
      assert.match(stderr, /aitri feature init halfmade/, 'feature-scoped guidance');
      assert.doesNotMatch(stderr, NO_STACK, 'no stack trace');
      assert.ok(!fs.existsSync(path.join(featDir, '.aitri')), 'no phantom .aitri written into the orphan');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('run-phase 1 with .aitri but no IDEA.md: actionable message, no stack, no "0 words" warning (UX-PRO-0707 1.2)', () => {
    const dir = tmp('aitri-disp-noidea-');
    try {
      run(['init'], dir);
      for (const f of ['IDEA.md', path.join('product', 'IDEA.md'), path.join('aitri', 'product', 'IDEA.md')]) {
        fs.rmSync(path.join(dir, f), { force: true });
      }
      const { code, stderr } = run(['run-phase', '1'], dir);
      assert.equal(code, 1);
      assert.match(stderr, /Missing required file: IDEA\.md/, 'names the missing seed');
      assert.doesNotMatch(stderr, NO_STACK, 'must not leak a Node stack trace');
      assert.doesNotMatch(stderr, /is short \(0 words\)/, 'suppresses the contradictory short-seed warning when the file is absent');
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

  it('version/help aliases do NOT emit the $HOME capture note (UX-PRO-0707 1.1 adversarial)', () => {
    // The new -v/version/--help/-h aliases are pure-info like their canonical forms and must
    // share the C2 exemption — otherwise they warn where --version/help stay silent.
    const fakeHome = fs.realpathSync(tmp('aitri-disp-homeinfo-'));
    try {
      run(['init'], fakeHome);
      const work = path.join(fakeHome, 'work', 'sub');
      fs.mkdirSync(work, { recursive: true });
      for (const flag of ['-v', 'version', '--help', '-h']) {
        const { stderr } = run([flag], work, { HOME: fakeHome });
        assert.doesNotMatch(stderr, /resolved to the project at \$HOME/,
          `${flag} must not emit the stray-$HOME capture note`);
      }
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

// ── COMMANDS ↔ switch parity (UX-PRO-0707 follow-up) ─────────────────────────
//
// bin/aitri.js keeps the suggestion list (COMMANDS) next to the switch with a
// comment saying "a new command must appear in both" — but nothing enforced it.
// Drift is asymmetric and silent: a case missing from COMMANDS degrades "did you
// mean" quietly; a COMMANDS entry with no case makes the CLI suggest a command
// that then errors as unknown.
describe('dispatcher — COMMANDS suggestion list stays in parity with the switch', () => {
  it('every COMMANDS entry routes, and every named case is suggestable', () => {
    const src = fs.readFileSync(BIN, 'utf8');
    const listMatch = src.match(/const COMMANDS = \[([\s\S]*?)\];/);
    assert.ok(listMatch, 'COMMANDS list must exist in bin/aitri.js');
    const commands = [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const cases = [...src.matchAll(/^\s*case '([^']+)':/gm)].map((m) => m[1]);
    // Pure synonyms live on the case side only — suggesting them adds noise, not routes.
    const ALIASES = new Set(['--help', '-h', '-v', 'version']);
    for (const c of commands) {
      assert.ok(cases.includes(c), `COMMANDS entry "${c}" has no switch case — it would be suggested, then error`);
    }
    for (const c of cases) {
      if (ALIASES.has(c)) continue;
      assert.ok(commands.includes(c), `case "${c}" missing from COMMANDS — typos near it get no suggestion`);
    }
  });
});
