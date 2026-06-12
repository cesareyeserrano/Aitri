/**
 * Tests: aitri backlog
 * Covers: add item, list (open/all), done, ID generation, invalid inputs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initFlatProject } from '../fixtures.js';
import { cmdBacklog, openBacklogCount } from '../../lib/commands/backlog.js';

const ROOT_DIR = path.resolve(process.cwd());

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-backlog-'));
}

function setup() {
  const dir = tmpDir();
  initFlatProject({ dir, rootDir: ROOT_DIR, err: (m) => { throw new Error(m); }, VERSION: '0.1.64' });
  return dir;
}

function makeCtx(dir, args) {
  const flagValue = (flag) => {
    const i = args.indexOf(flag);
    return (i !== -1 && i + 1 < args.length) ? args[i + 1] : null;
  };
  return { dir, args, flagValue, err: (m) => { throw new Error(m); } };
}

function capture(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

function backlogFile(dir) {
  return path.join(dir, 'spec', 'BACKLOG.json');
}

// ── add ───────────────────────────────────────────────────────────────────────

describe('backlog add', () => {
  it('creates BACKLOG.json with one open item', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'Fix auth', '--priority', 'P1', '--problem', 'Login breaks on mobile']));
    const data = JSON.parse(fs.readFileSync(backlogFile(dir), 'utf8'));
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].id, 'BL-001');
    assert.equal(data.items[0].title, 'Fix auth');
    assert.equal(data.items[0].priority, 'P1');
    assert.equal(data.items[0].problem, 'Login breaks on mobile');
    assert.equal(data.items[0].status, 'open');
    assert.ok(data.items[0].createdAt);
  });

  it('auto-increments IDs', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'Item A', '--priority', 'P2', '--problem', 'Prob A']));
    cmdBacklog(makeCtx(dir, ['add', '--title', 'Item B', '--priority', 'P3', '--problem', 'Prob B']));
    const data = JSON.parse(fs.readFileSync(backlogFile(dir), 'utf8'));
    assert.equal(data.items[0].id, 'BL-001');
    assert.equal(data.items[1].id, 'BL-002');
  });

  it('stores optional fr_id', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'T', '--priority', 'P2', '--problem', 'P', '--fr', 'FR-003']));
    const data = JSON.parse(fs.readFileSync(backlogFile(dir), 'utf8'));
    assert.equal(data.items[0].fr_id, 'FR-003');
  });

  it('rejects missing --title', () => {
    const dir = setup();
    assert.throws(
      () => cmdBacklog(makeCtx(dir, ['add', '--priority', 'P1', '--problem', 'Something'])),
      /--title is required/
    );
  });

  it('rejects missing --priority', () => {
    const dir = setup();
    assert.throws(
      () => cmdBacklog(makeCtx(dir, ['add', '--title', 'T', '--problem', 'P'])),
      /--priority is required/
    );
  });

  it('rejects invalid priority', () => {
    const dir = setup();
    assert.throws(
      () => cmdBacklog(makeCtx(dir, ['add', '--title', 'T', '--priority', 'high', '--problem', 'P'])),
      /Invalid priority/
    );
  });

  it('accepts lowercase priority (normalizes to uppercase)', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'T', '--priority', 'p2', '--problem', 'P']));
    const data = JSON.parse(fs.readFileSync(backlogFile(dir), 'utf8'));
    assert.equal(data.items[0].priority, 'P2');
  });
});

// ── list ──────────────────────────────────────────────────────────────────────

describe('backlog list', () => {
  it('shows "no open items" when backlog is empty', () => {
    const dir = setup();
    const out = capture(() => cmdBacklog(makeCtx(dir, [])));
    assert.ok(out.includes('No open backlog items'));
  });

  it('lists open items', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'My task', '--priority', 'P2', '--problem', 'Some problem']));
    const out = capture(() => cmdBacklog(makeCtx(dir, ['list'])));
    assert.ok(out.includes('My task'));
    assert.ok(out.includes('P2'));
    assert.ok(out.includes('BL-001'));
  });

  it('--all shows closed items too', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'Open item', '--priority', 'P2', '--problem', 'P']));
    cmdBacklog(makeCtx(dir, ['add', '--title', 'Closed item', '--priority', 'P3', '--problem', 'P']));
    cmdBacklog(makeCtx(dir, ['done', 'BL-002']));

    const outOpen = capture(() => cmdBacklog(makeCtx(dir, ['list'])));
    assert.ok(!outOpen.includes('Closed item'), 'closed item should not appear in default list');

    const outAll = capture(() => cmdBacklog(makeCtx(dir, ['list', '--all'])));
    assert.ok(outAll.includes('Closed item'), 'closed item should appear with --all');
  });
});

// ── done ──────────────────────────────────────────────────────────────────────

describe('backlog done', () => {
  it('marks item as closed with closedAt timestamp', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'Fix it', '--priority', 'P1', '--problem', 'Bug']));
    cmdBacklog(makeCtx(dir, ['done', 'BL-001']));
    const data = JSON.parse(fs.readFileSync(backlogFile(dir), 'utf8'));
    assert.equal(data.items[0].status, 'closed');
    assert.ok(data.items[0].closedAt);
  });

  it('errors if id not found', () => {
    const dir = setup();
    assert.throws(
      () => cmdBacklog(makeCtx(dir, ['done', 'BL-999'])),
      /not found/
    );
  });

  it('is idempotent — already closed does not throw', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'T', '--priority', 'P3', '--problem', 'P']));
    cmdBacklog(makeCtx(dir, ['done', 'BL-001']));
    assert.doesNotThrow(() => cmdBacklog(makeCtx(dir, ['done', 'BL-001'])));
  });
});

// ── rich Entry-Standard fields (additive) ──────────────────────────────────────

describe('backlog add — optional Entry-Standard detail', () => {
  it('stores files/behavior/decisions/acceptance when provided', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, [
      'add', '--title', 'Rich item', '--priority', 'P2', '--problem', 'P',
      '--files', 'lib/x.js, test/x.test.js',
      '--behavior', 'returns 200 on valid token',
      '--decisions', 'string field, not array',
      '--acceptance', 'unit test asserts the 200',
    ]));
    const item = JSON.parse(fs.readFileSync(backlogFile(dir), 'utf8')).items[0];
    assert.equal(item.files, 'lib/x.js, test/x.test.js');
    assert.equal(item.behavior, 'returns 200 on valid token');
    assert.equal(item.decisions, 'string field, not array');
    assert.equal(item.acceptance, 'unit test asserts the 200');
  });

  it('omits the rich fields entirely when not provided (additive — old shape preserved)', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'Plain', '--priority', 'P3', '--problem', 'P']));
    const item = JSON.parse(fs.readFileSync(backlogFile(dir), 'utf8')).items[0];
    assert.ok(!('files' in item));
    assert.ok(!('behavior' in item));
    assert.ok(!('acceptance' in item));
  });
});

// ── show ────────────────────────────────────────────────────────────────────────

describe('backlog show', () => {
  it('prints one item with its detail fields', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, [
      'add', '--title', 'Auth fix', '--priority', 'P1', '--problem', 'Login breaks',
      '--files', 'lib/auth.js', '--acceptance', 'TC passes',
    ]));
    const out = capture(() => cmdBacklog(makeCtx(dir, ['show', 'BL-001'])));
    assert.ok(out.includes('BL-001'));
    assert.ok(out.includes('Auth fix'));
    assert.ok(out.includes('Login breaks'));
    assert.ok(out.includes('lib/auth.js'));
    assert.ok(out.includes('TC passes'));
  });

  it('errors when the id is missing or not found', () => {
    const dir = setup();
    assert.throws(() => cmdBacklog(makeCtx(dir, ['show'])), /Provide an item ID/);
    assert.throws(() => cmdBacklog(makeCtx(dir, ['show', 'BL-999'])), /not found/);
  });
});

// ── openBacklogCount ──────────────────────────────────────────────────────────

describe('openBacklogCount', () => {
  it('returns null when no BACKLOG.json exists', () => {
    const dir = setup();
    const config = { artifactsDir: 'spec' };
    assert.equal(openBacklogCount(dir, config), null);
  });

  it('returns correct count of open items', () => {
    const dir = setup();
    const config = { artifactsDir: 'spec' };
    cmdBacklog(makeCtx(dir, ['add', '--title', 'A', '--priority', 'P1', '--problem', 'P']));
    cmdBacklog(makeCtx(dir, ['add', '--title', 'B', '--priority', 'P2', '--problem', 'P']));
    cmdBacklog(makeCtx(dir, ['done', 'BL-001']));
    assert.equal(openBacklogCount(dir, config), 1);
  });
});
