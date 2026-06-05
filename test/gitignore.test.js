/**
 * Tests: ensureAitriGitignore (ADR-045) — surgical .gitignore maintenance for the
 * split .aitri layout. Verifies it ignores per-machine state, NOT the shared config,
 * removes the legacy bare-`.aitri`, preserves everything else, and is idempotent.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureAitriGitignore } from '../lib/gitignore.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-gitignore-'));
}
const read = (dir) => fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');

describe('ensureAitriGitignore()', () => {
  it('creates the per-machine entries when no .gitignore exists', () => {
    const dir = tmpDir();
    const { added } = ensureAitriGitignore(dir);
    const g = read(dir);
    assert.ok(g.includes('.aitri.local'));
    assert.ok(g.includes('.aitri.lock'));
    assert.equal(added.length, 2);
  });

  it('removes a legacy bare `.aitri` (it would hide the shared config) + its stale comment', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.gitignore'),
      'node_modules/\n\n# Aitri config (project-specific, not shared)\n.aitri\n');
    const { removedLegacy } = ensureAitriGitignore(dir);
    const g = read(dir);
    assert.equal(removedLegacy, true);
    assert.ok(!/^\.aitri$/m.test(g), 'the bare `.aitri` line must be gone');
    assert.ok(!g.includes('project-specific, not shared'), 'the stale comment must be gone');
    assert.ok(g.includes('.aitri.local'), 'per-machine entry added');
    assert.ok(g.includes('node_modules/'), 'unrelated lines preserved');
  });

  it('does NOT remove `.aitri/`-prefixed lines (only the exact bare line)', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.gitignore'), '.aitri/secret-notes\n');
    ensureAitriGitignore(dir);
    const g = read(dir);
    assert.ok(g.includes('.aitri/secret-notes'), 'a `.aitri/`-prefixed entry must be preserved');
  });

  it('is idempotent — a second run changes nothing', () => {
    const dir = tmpDir();
    ensureAitriGitignore(dir);
    const first = read(dir);
    const res = ensureAitriGitignore(dir);
    assert.equal(read(dir), first, 'second run must not change the file');
    assert.equal(res.added.length, 0);
    assert.equal(res.removedLegacy, false);
  });

  it('preserves an existing file and only appends what is missing', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n.env\n.aitri.local\n');
    ensureAitriGitignore(dir);
    const g = read(dir);
    assert.ok(g.includes('node_modules/') && g.includes('.env'), 'existing lines kept');
    // .aitri.local already present → not duplicated
    assert.equal((g.match(/^\.aitri\.local$/gm) || []).length, 1, 'no duplicate entry');
    assert.ok(g.includes('.aitri.lock'), 'still adds the missing entries');
  });
});
