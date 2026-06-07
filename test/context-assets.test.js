/**
 * Tests: lib/context-assets — shared asset-folder helpers (TPA-3)
 * Covers: listAssets (excludes README/dotfiles, absent folder → []), visualAssets classification.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { listAssets, visualAssets } from '../lib/context-assets.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-ctxassets-'));
}

describe('listAssets()', () => {
  it('returns [] when the folder does not exist', () => {
    const dir = tmpDir();
    assert.deepEqual(listAssets(dir, 'idea_context'), []);
  });

  it('lists asset files, excluding README.md and dotfiles', () => {
    const dir = tmpDir();
    const d = path.join(dir, 'idea_context');
    fs.mkdirSync(d, { recursive: true });
    for (const f of ['README.md', '.DS_Store', 'db_schema.txt', 'mockup.png']) {
      fs.writeFileSync(path.join(d, f), 'x');
    }
    const assets = listAssets(dir, 'idea_context').sort();
    assert.deepEqual(assets, ['db_schema.txt', 'mockup.png']);
  });

  it('returns [] for a folder that only has README.md', () => {
    const dir = tmpDir();
    const d = path.join(dir, 'feature_context');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'README.md'), '# ctx');
    assert.deepEqual(listAssets(dir, 'feature_context'), []);
  });
});

describe('visualAssets()', () => {
  it('classifies images/Figma/PDF/design files as visual', () => {
    const assets = ['db_schema.txt', 'login.png', 'flow.JPG', 'design.fig', 'spec.pdf', 'notes.md', 'app.sketch'];
    assert.deepEqual(
      visualAssets(assets).sort(),
      ['app.sketch', 'design.fig', 'flow.JPG', 'login.png', 'spec.pdf'].sort()
    );
  });

  it('returns [] when no visual assets are present', () => {
    assert.deepEqual(visualAssets(['schema.sql', 'blueprint.md', 'tickets.txt']), []);
  });
});
