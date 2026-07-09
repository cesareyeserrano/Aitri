/**
 * Tests: source-wide pin — ANSI escape emission is single-sourced in lib/format.js.
 *
 * lib/format.js's header promises this pin (UX-PRO-0707 follow-up: the rc.163 header
 * cited it before it existed). Any hand-written escape literal outside format.js
 * bypasses the useColor() gate and can leak color into piped/agent-read output —
 * exactly the tier-1 defect 2.1 fixed. New color must go through sgr()/useColor().
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Escape literals as they appear in SOURCE text (\x1b / \u001b / \033) or a raw ESC byte.
const ANSI_LITERAL = new RegExp(`\\\\x1b|\\\\u001b|\\\\033|${String.fromCharCode(27)}`, 'i');

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return jsFiles(p);
    return e.isFile() && e.name.endsWith('.js') ? [p] : [];
  });
}

describe('format pin — ANSI escape literals live only in lib/format.js', () => {
  it('no escape literal in lib/ or bin/ outside format.js', () => {
    const offenders = [];
    for (const base of ['lib', 'bin']) {
      for (const file of jsFiles(path.join(ROOT, base))) {
        if (path.relative(ROOT, file).replace(/\\/g, '/') === 'lib/format.js') continue;
        if (ANSI_LITERAL.test(fs.readFileSync(file, 'utf8'))) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    assert.deepEqual(
      offenders, [],
      `ANSI escape literals outside lib/format.js — route color through sgr()/useColor(): ${offenders.join(', ')}`
    );
  });

  it('lib/format.js itself still owns an escape literal (the pin scans the real thing)', () => {
    // Guards the pin against silently scanning nothing (e.g. a rename of format.js).
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'format.js'), 'utf8');
    assert.match(src, ANSI_LITERAL);
  });
});
