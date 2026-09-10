/**
 * Tests: aitri checkpoint — session context + named snapshots
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdCheckpoint } from '../../lib/commands/checkpoint.js';
import { loadConfig, saveConfig, writeLastSession } from '../../lib/state.js';

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
    const config = loadConfig(dir);
    assert.ok(config.lastSession, 'lastSession must exist');
    assert.equal(config.lastSession.event, 'checkpoint');
  });

  it('lastSession has timestamp', () => {
    const config = loadConfig(dir);
    assert.ok(config.lastSession.at, 'must have timestamp');
  });

  it('lastSession has agent', () => {
    const config = loadConfig(dir);
    assert.ok(config.lastSession.agent, 'must have agent field');
  });

  it('does not create checkpoints/ directory', () => {
    assert.ok(!fs.existsSync(path.join(dir, 'checkpoints')), 'no checkpoints/ without --name');
  });

  it('prints confirmation', () => {
    assert.ok(output.includes('Checkpoint saved'), 'confirmation must appear');
  });

  it('names .aitri.local, not the shared .aitri (ADR-045)', () => {
    // lastSession is a per-machine field → lands in .aitri.local; the shared
    // .aitri is left untouched, so the message must not claim it was saved there.
    assert.ok(output.includes('saved to .aitri.local'), 'must name the per-machine .aitri.local');
  });
});

describe('cmdCheckpoint() — --context', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    output = captureStdout(() =>
      cmdCheckpoint({
        dir, args: ['--context', 'implementing FR-003, JWT done'],
        flagValue: makeFlagValue({ '--context': 'implementing FR-003, JWT done' }),
        err: noopErr,
      })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('saves context to lastSession', () => {
    const config = loadConfig(dir);
    assert.equal(config.lastSession.context, 'implementing FR-003, JWT done');
  });

  it('confirmation names .aitri.local (ADR-045)', () => {
    assert.ok(output.includes('saved to .aitri.local'), 'context message must name the per-machine .aitri.local');
  });
});

// TPA-5 / A9: narrative context must SURVIVE later state transitions. lastSession
// is overwritten by every state-mutating command (so its .context is ephemeral);
// sessionContext persists until explicitly replaced.
describe('cmdCheckpoint() — --context persists across transitions (TPA-5)', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    captureStdout(() =>
      cmdCheckpoint({
        dir, args: ['--context', 'closing Phase-1 escapes; Master Data next'],
        flagValue: makeFlagValue({ '--context': 'closing Phase-1 escapes; Master Data next' }),
        err: noopErr,
      })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('writes the durable sessionContext field with a timestamp', () => {
    const config = loadConfig(dir);
    assert.equal(config.sessionContext?.text, 'closing Phase-1 escapes; Master Data next');
    assert.ok(config.sessionContext?.at, 'sessionContext carries its own timestamp for staleness');
  });

  it('sessionContext survives a subsequent transition that wipes lastSession.context', () => {
    // Simulate the next pipeline action (e.g. approve) overwriting lastSession.
    const config = loadConfig(dir);
    writeLastSession(config, dir, 'approve 1'); // no context arg → lastSession.context cleared
    saveConfig(dir, config);

    const after = loadConfig(dir);
    assert.ok(!after.lastSession.context, 'lastSession.context is ephemeral — wiped by the next action');
    assert.equal(after.sessionContext?.text, 'closing Phase-1 escapes; Master Data next', 'sessionContext must persist');
  });
});

describe('cmdCheckpoint() — --name threads VERSION into the snapshot (R3-26)', () => {
  it('the named snapshot surfaces the version-mismatch nudge when the CLI version differs', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ aitriVersion: '0.0.1' }));
    captureStdout(() =>
      cmdCheckpoint({
        dir, args: ['--name', 'vtest'],
        flagValue: makeFlagValue({ '--name': 'vtest' }),
        err: noopErr, VERSION: '9.9.9',
      })
    );
    const files = fs.readdirSync(path.join(dir, 'checkpoints'));
    const snap = fs.readFileSync(path.join(dir, 'checkpoints', files[0]), 'utf8');
    // Without VERSION threaded to cmdResume the snapshot has cliVersion=undefined → no nudge.
    assert.match(snap, /adopt --upgrade/, 'the named snapshot must surface the version-mismatch nudge');
    fs.rmSync(dir, { recursive: true, force: true });
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
    const config = loadConfig(dir);
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

// ── BUG-STATE-VISIBLE-0909: the narrative is stamped with the counts it was written against ──
describe('cmdCheckpoint() — --context stamps stateAtSave and teaches what does not belong in the narrative', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1, 2, 3, 4] }));
    writeFile(dir, 'BUGS.json', JSON.stringify({ bugs: [
      { id: 'BG-001', title: 'live',    severity: 'low', status: 'open' },
      { id: 'BG-002', title: 'claimed', severity: 'low', status: 'fixed' },
      { id: 'BG-003', title: 'claimed', severity: 'low', status: 'fixed' },
    ] }));
    writeFile(dir, 'BACKLOG.json', JSON.stringify({ items: [
      { id: 'BL-001', title: 'a', priority: 'P2', status: 'open' },
      { id: 'BL-002', title: 'b', priority: 'P2', status: 'closed' },
    ] }));
    output = captureStdout(() =>
      cmdCheckpoint({
        dir, args: ['--context', 'two fixed, one open, BL-001 pending'],
        flagValue: makeFlagValue({ '--context': 'two fixed, one open, BL-001 pending' }),
        err: noopErr,
      })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('sessionContext.stateAtSave carries active/fixed bugs and open backlog (per-machine)', () => {
    const config = loadConfig(dir);
    assert.deepEqual(config.sessionContext.stateAtSave, { activeBugs: 1, fixedBugs: 2, openBacklog: 1 });
    const local = JSON.parse(fs.readFileSync(path.join(dir, '.aitri.local'), 'utf8'));
    assert.ok(local.sessionContext.stateAtSave, 'lives in .aitri.local');
    assert.ok(!JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8')).sessionContext, 'never in the shared .aitri');
  });

  it('prints the state it snapshotted and where open items belong instead', () => {
    assert.match(output, /State at save: 1 open bug\(s\) · 2 fixed awaiting verify · 1 open backlog item\(s\)/);
    assert.match(output, /Open items, hypotheses and pending decisions go to `aitri bug add` \/ `aitri backlog add`/);
    assert.match(output, /re-read as open forever/);
  });

  it('a bare checkpoint (no --context) stamps nothing', () => {
    const d2 = tmpDir();
    writeFile(d2, '.aitri', minimalConfig());
    captureStdout(() => cmdCheckpoint({ dir: d2, args: [], flagValue: makeFlagValue(), err: noopErr }));
    assert.equal(loadConfig(d2).sessionContext ?? null, null);
    fs.rmSync(d2, { recursive: true, force: true });
  });
});
