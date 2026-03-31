/**
 * Tests: aitri checkpoint — session context + named snapshots
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdCheckpoint } from '../../lib/commands/checkpoint.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-cp-'));
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

const minimalConfig = (overrides = {}) => JSON.stringify({
  projectName: 'TestProject',
  artifactsDir: '',
  approvedPhases: [],
  completedPhases: [],
  ...overrides,
});

const noopErr = (msg) => { throw new Error(msg); };
const makeFlagValue = (flags = {}) => (f) => flags[f] || null;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cmdCheckpoint() — bare (no flags)', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    output = captureStdout(() =>
      cmdCheckpoint({ dir, args: [], flagValue: makeFlagValue(), err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('writes lastSession to .aitri', () => {
    const config = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.ok(config.lastSession, 'lastSession must exist');
    assert.equal(config.lastSession.event, 'checkpoint');
  });

  it('lastSession has timestamp', () => {
    const config = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.ok(config.lastSession.at, 'must have timestamp');
  });

  it('lastSession has agent', () => {
    const config = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.ok(config.lastSession.agent, 'must have agent field');
  });

  it('does not create checkpoints/ directory', () => {
    assert.ok(!fs.existsSync(path.join(dir, 'checkpoints')), 'no checkpoints/ without --name');
  });

  it('prints confirmation', () => {
    assert.ok(output.includes('Checkpoint saved'), 'confirmation must appear');
  });
});

describe('cmdCheckpoint() — --context', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    captureStdout(() =>
      cmdCheckpoint({
        dir, args: ['--context', 'implementing FR-003, JWT done'],
        flagValue: makeFlagValue({ '--context': 'implementing FR-003, JWT done' }),
        err: noopErr,
      })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('saves context to lastSession', () => {
    const config = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.equal(config.lastSession.context, 'implementing FR-003, JWT done');
  });
});

describe('cmdCheckpoint() — --name creates snapshot', () => {
  let dir;
  let fname;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    captureStdout(() =>
      cmdCheckpoint({
        dir, args: ['--name', 'before-phase4-refactor'],
        flagValue: makeFlagValue({ '--name': 'before-phase4-refactor' }),
        err: noopErr,
      })
    );
    const files = fs.readdirSync(path.join(dir, 'checkpoints'));
    fname = files[0];
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('creates checkpoints/ directory', () => {
    assert.ok(fs.existsSync(path.join(dir, 'checkpoints')), 'checkpoints/ must be created');
  });

  it('filename includes the label', () => {
    assert.ok(fname.includes('before-phase4-refactor'), 'label must appear in filename');
  });

  it('filename follows date-label.md pattern', () => {
    const date = new Date().toISOString().slice(0, 10);
    assert.ok(fname === `${date}-before-phase4-refactor.md`, `expected ${date}-before-phase4-refactor.md, got ${fname}`);
  });

  it('snapshot contains resume content', () => {
    const content = fs.readFileSync(path.join(dir, 'checkpoints', fname), 'utf8');
    assert.ok(content.includes('AITRI SESSION RESUME'), 'must contain resume header');
  });

  it('also writes lastSession to .aitri', () => {
    const config = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    assert.ok(config.lastSession, 'lastSession must exist even with --name');
  });
});

describe('cmdCheckpoint() — --list', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    const cpDir = path.join(dir, 'checkpoints');
    fs.mkdirSync(cpDir);
    fs.writeFileSync(path.join(cpDir, '2026-03-01-alpha.md'), '# checkpoint alpha', 'utf8');
    fs.writeFileSync(path.join(cpDir, '2026-03-10-beta.md'),  '# checkpoint beta',  'utf8');
    output = captureStdout(() =>
      cmdCheckpoint({ dir, args: ['--list'], flagValue: makeFlagValue(), err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('lists checkpoint filenames', () => {
    assert.ok(output.includes('2026-03-01-alpha.md'), 'alpha checkpoint must appear');
    assert.ok(output.includes('2026-03-10-beta.md'),  'beta checkpoint must appear');
  });

  it('shows newest first', () => {
    const betaIdx  = output.indexOf('2026-03-10-beta.md');
    const alphaIdx = output.indexOf('2026-03-01-alpha.md');
    assert.ok(betaIdx < alphaIdx, 'newer checkpoint must appear before older one');
  });
});

describe('cmdCheckpoint() — --list with no checkpoints', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    output = captureStdout(() =>
      cmdCheckpoint({ dir, args: ['--list'], flagValue: makeFlagValue(), err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('prints "No checkpoints found"', () => {
    assert.ok(output.includes('No checkpoints'), 'must report no checkpoints gracefully');
  });
});

describe('cmdCheckpoint() — label sanitization', () => {
  let dir;
  let fname;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    captureStdout(() =>
      cmdCheckpoint({
        dir, args: ['--name', 'my label with spaces & special!'],
        flagValue: makeFlagValue({ '--name': 'my label with spaces & special!' }),
        err: noopErr,
      })
    );
    const files = fs.readdirSync(path.join(dir, 'checkpoints'));
    fname = files[0];
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('replaces unsafe characters with dashes in filename', () => {
    assert.ok(!fname.includes(' '), 'spaces must be replaced');
    assert.ok(!fname.includes('!'), 'special chars must be replaced');
    assert.ok(!fname.includes('&'), 'ampersand must be replaced');
  });
});
