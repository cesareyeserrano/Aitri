/**
 * Tests: lib/format.js + the color/stream contract it enforces (UX-PRO-0707 Batch 2).
 *
 * The genuine tier-1 defect 2.1 fixed: color was emitted UNCONDITIONALLY (help.js was
 * the only ANSI emitter and checked neither isTTY nor NO_COLOR), so piped/agent-read
 * output carried escape codes. format.js owns the single color-on predicate + SGR emitter;
 * these pins keep help colorless off-TTY and keep --json stdout byte-clean. The source-wide
 * "no ANSI literals outside format.js" pin lives in test/format-pin.test.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { useColor, sgr, divider } from '../lib/format.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'aitri.js');
const ESC = /\x1b\[/;

function run(args, cwd, envOverrides = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, ...envOverrides },
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

describe('format — unit', () => {
  it('useColor() is false when NO_COLOR is set', () => {
    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    try { assert.equal(useColor(), false); }
    finally { if (prev === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = prev; }
  });

  it('useColor() is false when stdout is not a TTY (the test runner case)', () => {
    // stdout.isTTY is undefined under the runner → predicate must be false, not truthy.
    assert.equal(useColor(), !!process.stdout.isTTY && !process.env.NO_COLOR);
    assert.ok(useColor() === false || process.stdout.isTTY);
  });

  it('sgr() returns the empty string when color is off', () => {
    const prev = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    try {
      assert.equal(sgr('1'), '');
      assert.equal(sgr('38;5;75'), '');
    } finally { if (prev === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = prev; }
  });

  it('divider() renders the requested width of the rule char', () => {
    assert.equal(divider(5), '─────');
    assert.equal(divider(), '─'.repeat(60));
  });
});

describe('format — color gating pins (the root fix)', () => {
  it('NO_COLOR=1 aitri help emits zero ANSI escape codes', () => {
    const dir = tmp('aitri-fmt-nocolor-');
    try {
      const { code, stdout } = run(['help'], dir, { NO_COLOR: '1' });
      assert.equal(code, 0);
      assert.doesNotMatch(stdout, ESC, 'NO_COLOR help must be escape-code free');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('piped (non-TTY) aitri help emits zero ANSI escape codes', () => {
    // spawnSync pipes stdout → isTTY is false → color must be off even without NO_COLOR.
    const dir = tmp('aitri-fmt-piped-');
    try {
      const { code, stdout } = run(['help'], dir);
      assert.equal(code, 0);
      assert.doesNotMatch(stdout, ESC, 'piped help must be escape-code free');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('help no longer claims "in cyan" (prose that lies once color is stripped)', () => {
    const dir = tmp('aitri-fmt-cyan-');
    try {
      const { stdout } = run(['help'], dir);
      assert.doesNotMatch(stdout, /in cyan/, 'color-naming prose removed');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('format — --json stdout purity pins', () => {
  it('status --json stdout is byte-clean (no ANSI), diagnostics stay off stdout', () => {
    const dir = tmp('aitri-fmt-json-');
    try {
      run(['init'], dir);
      const { code, stdout } = run(['status', '--json'], dir);
      assert.equal(code, 0);
      assert.doesNotMatch(stdout, ESC, 'status --json stdout must be escape-code free');
      assert.doesNotThrow(() => JSON.parse(stdout), 'status --json stdout must parse as JSON');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
