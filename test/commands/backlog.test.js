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
import { cmdBacklog } from '../../lib/commands/backlog.js';
import { saveConfig } from '../../lib/state.js';

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

// ── FB-SCOPE-BLIND-0724 — scope-honest list ───────────────────────────────────
// (openBacklogCount was removed: dead export with a third, divergent open-predicate.)

describe('scope-honest backlog list (FB-SCOPE-BLIND-0724)', () => {
  function addFeatureBacklog(dir, name, openCount) {
    const featDir = path.join(dir, 'features', name);
    fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
    saveConfig(featDir, { projectName: name, artifactsDir: 'spec' });
    const items = Array.from({ length: openCount }, (_, i) => ({
      id: `BL-00${i + 1}`, title: `item ${i + 1}`, priority: 'P2', status: 'open',
    }));
    fs.writeFileSync(path.join(featDir, 'spec', 'BACKLOG.json'),
      JSON.stringify({ schemaVersion: '1', items }, null, 2));
  }

  it('empty root list names feature scopes holding open items, with the scoped command', () => {
    const dir = setup();
    addFeatureBacklog(dir, 'backend', 4);
    const out = capture(() => cmdBacklog(makeCtx(dir, [])));
    assert.match(out, /No open backlog items\./);
    assert.match(out, /open in features: backend 4/);
    assert.match(out, /aitri feature backlog backend/);
  });

  it('multiple feature scopes → generic <name> pointer', () => {
    const dir = setup();
    addFeatureBacklog(dir, 'backend', 2);
    addFeatureBacklog(dir, 'grid-ux', 1);
    const out = capture(() => cmdBacklog(makeCtx(dir, [])));
    assert.match(out, /backend 2 · grid-ux 1/);
    assert.match(out, /aitri feature backlog <name>/);
  });

  it('no hint when features hold no open items', () => {
    const dir = setup();
    addFeatureBacklog(dir, 'backend', 0);
    const out = capture(() => cmdBacklog(makeCtx(dir, [])));
    assert.match(out, /No open backlog items\./);
    assert.ok(!out.includes('open in features'), 'must not hint when nothing is open elsewhere');
  });

  it('no hint in feature scope — the scope is already explicit', () => {
    const dir = setup();
    addFeatureBacklog(dir, 'backend', 0);
    addFeatureBacklog(dir, 'other', 3);
    const featDir = path.join(dir, 'features', 'backend');
    const out = capture(() => cmdBacklog({ ...makeCtx(featDir, []), featureRoot: dir, scopeName: 'backend' }));
    assert.match(out, /No open backlog items\./);
    assert.ok(!out.includes('open in features'), 'feature-scoped list must not cross-hint');
  });

  it('list "open" = not closed — a hand-written status stays visible (snapshot parity)', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'A', '--priority', 'P1', '--problem', 'P']));
    cmdBacklog(makeCtx(dir, ['add', '--title', 'B', '--priority', 'P2', '--problem', 'P']));
    cmdBacklog(makeCtx(dir, ['done', 'BL-001']));
    // Hand-edit a status outside the CLI vocabulary — snapshot counts it open (!== closed);
    // the list must agree or status/list contradict each other again.
    const fp = path.join(dir, 'spec', 'BACKLOG.json');
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    data.items.find(i => i.id === 'BL-002').status = 'deferred';
    fs.writeFileSync(fp, JSON.stringify(data, null, 2));
    const out = capture(() => cmdBacklog(makeCtx(dir, [])));
    assert.match(out, /BL-002.*\[deferred\]/, 'non-open non-closed status is visible AND tagged');
    assert.match(out, /1 open · 1 closed/);
  });

  it('a hand-written "Closed" is case-folded — not counted or listed as open', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'A', '--priority', 'P1', '--problem', 'P']));
    const fp = path.join(dir, 'spec', 'BACKLOG.json');
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    data.items[0].status = 'Closed';
    fs.writeFileSync(fp, JSON.stringify(data, null, 2));
    const out = capture(() => cmdBacklog(makeCtx(dir, [])));
    assert.match(out, /No open backlog items\./);
    assert.match(out, /0 open · 1 closed|No open/);
  });
});

// ── FB-BACKLOG-AMEND-0909 — an item stops being immutable after creation ─────
// Owner field case: with no mutator, agents hand-edited BACKLOG.json (appended to
// `problem`, replaced `acceptance`, wrote status "done"), and the hand-written status
// made 5 closed items count as open in status/--json/Hub. `note` (append-only log) +
// `update` (Entry-Standard fields) close the incentive; B8 parity + the status warning
// close the drift.

function readItems(dir) {
  return JSON.parse(fs.readFileSync(backlogFile(dir), 'utf8')).items;
}

function captureStderr(fn) {
  let out = '';
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stderr.write = orig; }
  return out;
}

describe('backlog note (FB-BACKLOG-AMEND-0909)', () => {
  it('appends dated entries to log[] in order, stamps updatedAt, and show prints them', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'Grow me', '--priority', 'P2', '--problem', 'seed']));
    cmdBacklog(makeCtx(dir, ['note', 'BL-001', '--text', 'first finding']));
    cmdBacklog(makeCtx(dir, ['note', 'BL-001', '--text', 'second finding']));
    const [item] = readItems(dir);
    assert.equal(item.log.length, 2);
    assert.equal(item.log[0].text, 'first finding');
    assert.equal(item.log[1].text, 'second finding');
    assert.match(item.log[0].at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(item.updatedAt, item.log[1].at);
    assert.equal(item.problem, 'seed', 'note must not touch the original fields');
    const out = capture(() => cmdBacklog(makeCtx(dir, ['show', 'BL-001'])));
    assert.ok(out.includes('Log (2)'));
    assert.ok(out.indexOf('first finding') < out.indexOf('second finding'));
    const listOut = capture(() => cmdBacklog(makeCtx(dir, ['list'])));
    assert.ok(listOut.includes('2 notes'));
  });

  it('refuses a missing id, an unknown id, and empty text', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'x', '--priority', 'P3', '--problem', 'y']));
    assert.throws(() => cmdBacklog(makeCtx(dir, ['note'])), /Provide an item ID/);
    assert.throws(() => cmdBacklog(makeCtx(dir, ['note', 'BL-009', '--text', 'z'])), /not found/);
    assert.throws(() => cmdBacklog(makeCtx(dir, ['note', 'BL-001'])), /--text is required/);
    assert.throws(() => cmdBacklog(makeCtx(dir, ['note', 'BL-001', '--text', '   '])), /--text is required/);
    assert.equal(readItems(dir)[0].log, undefined, 'a refused note must not create an empty log');
  });

  it('is allowed on a closed item (post-mortem notes)', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'x', '--priority', 'P3', '--problem', 'y']));
    cmdBacklog(makeCtx(dir, ['done', 'BL-001']));
    cmdBacklog(makeCtx(dir, ['note', 'BL-001', '--text', 'closed because superseded']));
    const [item] = readItems(dir);
    assert.equal(item.status, 'closed');
    assert.equal(item.log.length, 1);
  });
});

describe('backlog update (FB-BACKLOG-AMEND-0909)', () => {
  it('sets only the given fields, normalizes priority, stamps updatedAt', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 'Old', '--priority', 'P3', '--problem', 'p', '--acceptance', 'old-acc']));
    const out = capture(() => cmdBacklog(makeCtx(dir, [
      'update', 'BL-001', '--priority', 'p1', '--files', 'lib/a.js', '--acceptance', 'new-acc',
    ])));
    assert.ok(out.includes('updated priority, files, acceptance'));
    const [item] = readItems(dir);
    assert.equal(item.priority, 'P1');
    assert.equal(item.files, 'lib/a.js');
    assert.equal(item.acceptance, 'new-acc');
    assert.equal(item.title, 'Old', 'untouched fields stay');
    assert.equal(item.problem, 'p');
    assert.ok(item.updatedAt);
    assert.equal(item.status, 'open');
  });

  it('covers every Entry-Standard field plus title/problem/fr', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 't', '--priority', 'P2', '--problem', 'p']));
    cmdBacklog(makeCtx(dir, [
      'update', 'BL-001', '--title', 'T2', '--problem', 'P2', '--fr', 'FR-007',
      '--behavior', 'b', '--decisions', 'd',
    ]));
    const [item] = readItems(dir);
    assert.deepEqual(
      [item.title, item.problem, item.fr_id, item.behavior, item.decisions],
      ['T2', 'P2', 'FR-007', 'b', 'd'],
    );
  });

  it('refuses no flags, an invalid priority, an empty value, and --status', () => {
    const dir = setup();
    cmdBacklog(makeCtx(dir, ['add', '--title', 't', '--priority', 'P2', '--problem', 'p']));
    assert.throws(() => cmdBacklog(makeCtx(dir, ['update', 'BL-001'])), /Nothing to update/);
    assert.throws(() => cmdBacklog(makeCtx(dir, ['update', 'BL-001', '--priority', 'P9'])), /Invalid priority/);
    assert.throws(() => cmdBacklog(makeCtx(dir, ['update', 'BL-001', '--files'])), /--files needs a value/);
    assert.throws(() => cmdBacklog(makeCtx(dir, ['update', 'BL-001', '--status', 'closed'])), /--status is not an update field/);
    assert.throws(() => cmdBacklog(makeCtx(dir, ['update'])), /Provide an item ID/);
    assert.throws(() => cmdBacklog(makeCtx(dir, ['update', 'BL-404', '--title', 'x'])), /not found/);
    const [item] = readItems(dir);
    assert.equal(item.status, 'open');
    assert.equal(item.updatedAt, undefined, 'refused updates leave no stamp');
  });
});

describe('backlog file integrity (B8 parity, FB-BACKLOG-AMEND-0909)', () => {
  function corrupt(dir) {
    fs.mkdirSync(path.dirname(backlogFile(dir)), { recursive: true });
    fs.writeFileSync(backlogFile(dir), '{ "items": [ <<<<<<< HEAD');
  }

  it('every mutator refuses on a malformed file and leaves it byte-identical', () => {
    const dir = setup();
    corrupt(dir);
    const before = fs.readFileSync(backlogFile(dir), 'utf8');
    const attempts = [
      ['add', '--title', 't', '--priority', 'P1', '--problem', 'p'],
      ['done', 'BL-001'],
      ['note', 'BL-001', '--text', 'x'],
      ['update', 'BL-001', '--title', 'x'],
    ];
    for (const args of attempts) {
      assert.throws(() => cmdBacklog(makeCtx(dir, args)), /not valid JSON/, `${args[0]} must refuse`);
      assert.equal(fs.readFileSync(backlogFile(dir), 'utf8'), before, `${args[0]} must not write`);
    }
  });

  it('shape corruption is malformed too — never coerced and written back (adversarial fold)', () => {
    const shapes = [
      '{ "items": { "BL-001": { "id": "BL-001", "title": "x" } } }',
      '{ "items": "not a list" }',
      '[ { "id": "BL-001", "title": "x", "status": "open" } ]',
      '42',
    ];
    for (const content of shapes) {
      const dir = setup();
      fs.mkdirSync(path.dirname(backlogFile(dir)), { recursive: true });
      fs.writeFileSync(backlogFile(dir), content);
      assert.throws(() => cmdBacklog(makeCtx(dir, ['add', '--title', 't', '--priority', 'P1', '--problem', 'p'])), /not the expected shape/, content);
      assert.throws(() => cmdBacklog(makeCtx(dir, ['note', 'BL-001', '--text', 'x'])), /not the expected shape/, content);
      assert.equal(fs.readFileSync(backlogFile(dir), 'utf8'), content, `must stay byte-identical: ${content}`);
    }
    // An absent or null `items` is a legitimate empty list, as it always was.
    const dir = setup();
    fs.mkdirSync(path.dirname(backlogFile(dir)), { recursive: true });
    fs.writeFileSync(backlogFile(dir), '{ "schemaVersion": "1" }');
    cmdBacklog(makeCtx(dir, ['add', '--title', 't', '--priority', 'P1', '--problem', 'p']));
    assert.equal(readItems(dir).length, 1);
  });

  it('note refuses a hand-written non-array log instead of overwriting it', () => {
    const dir = setup();
    fs.mkdirSync(path.dirname(backlogFile(dir)), { recursive: true });
    fs.writeFileSync(backlogFile(dir), JSON.stringify({ schemaVersion: '1', items: [
      { id: 'BL-001', title: 'a', priority: 'P2', status: 'open', createdAt: 'x', log: 'narrative written by hand' },
    ] }));
    assert.throws(() => cmdBacklog(makeCtx(dir, ['note', 'BL-001', '--text', 'new'])), /log is not an array/);
    assert.equal(readItems(dir)[0].log, 'narrative written by hand');
  });

  it('list degrades with a warning; show refuses instead of claiming "not found"', () => {
    const dir = setup();
    corrupt(dir);
    const out = capture(() => cmdBacklog(makeCtx(dir, ['list'])));
    assert.ok(out.includes('not valid JSON'));
    assert.throws(() => cmdBacklog(makeCtx(dir, ['show', 'BL-001'])), /not valid JSON/);
  });

  it('warns once on stderr about hand-written statuses (the Ultron "done" case)', () => {
    const dir = setup();
    fs.mkdirSync(path.dirname(backlogFile(dir)), { recursive: true });
    fs.writeFileSync(backlogFile(dir), JSON.stringify({ schemaVersion: '1', items: [
      { id: 'BL-001', title: 'a', priority: 'P2', status: 'done', createdAt: 'x' },
      { id: 'BL-002', title: 'b', priority: 'P2', status: 'Closed', createdAt: 'x' },
      { id: 'BL-003', title: 'c', priority: 'P2', status: 'open', createdAt: 'x' },
    ] }));
    let stdout = '';
    const stderr = captureStderr(() => { stdout = capture(() => cmdBacklog(makeCtx(dir, ['list']))); });
    assert.match(stderr, /1 backlog item\(s\).*unrecognized status/);
    assert.ok(stderr.includes('BL-001: status="done"'));
    assert.ok(!stderr.includes('BL-002'), 'case-folded "Closed" is canonical, not unknown');
    assert.ok(stdout.includes('2 open · 1 closed'), 'the hand-written "done" still counts as open — the warning says so');
    const again = captureStderr(() => capture(() => cmdBacklog(makeCtx(dir, ['list']))));
    assert.equal(again, '', 'warned once per file per process');
  });

  it('done is case-folded: a hand-written "Closed" is not re-stamped', () => {
    const dir = setup();
    fs.mkdirSync(path.dirname(backlogFile(dir)), { recursive: true });
    fs.writeFileSync(backlogFile(dir), JSON.stringify({ schemaVersion: '1', items: [
      { id: 'BL-001', title: 'a', priority: 'P2', status: 'Closed', createdAt: 'x' },
    ] }));
    const out = capture(() => cmdBacklog(makeCtx(dir, ['done', 'BL-001'])));
    assert.ok(out.includes('already closed'));
    const [item] = readItems(dir);
    assert.equal(item.status, 'Closed');
    assert.equal(item.closedAt, undefined);
  });

  it('feature scope: the scoped usage names the scoped command for note/update', () => {
    const dir = setup();
    const featDir = path.join(dir, 'features', 'billing');
    fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
    saveConfig(featDir, { projectName: 'billing', artifactsDir: 'spec' });
    const ctx = { ...makeCtx(featDir, ['bogus']), featureRoot: dir, scopeName: 'billing' };
    assert.throws(() => cmdBacklog(ctx), /aitri feature backlog billing note <id> --text/);
  });
});
