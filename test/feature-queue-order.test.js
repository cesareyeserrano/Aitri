/**
 * Tests for FEATURE-QUEUE-0722 (2.2.0-rc.5) — deterministic proposal order in the
 * next-action ladder's work rungs, and the createdAt source guard.
 *
 * Before: P5/P6 (and P7 stale-verify) emission iterated `pipelines` in readdirSync
 * order — the tie for the TOP proposal fell to directory order: arbitrary
 * (alphabetical-ish, not intentional) and non-deterministic across filesystems.
 * Now: work rungs iterate proposalOrder() — root first, then features oldest-first
 * (createdAt asc, scopeName tiebreak), undated features AFTER dated by name — the
 * same rule the status Features render uses.
 *
 * createdAt is normalized to string-or-null at buildPipelineEntry (the rc.2 crash
 * class fixed at the SOURCE): a numeric/garbage createdAt in hand-edited committed
 * .aitri must degrade to undated for every snapshot consumer, never crash the sort.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import path   from 'node:path';
import os     from 'node:os';

import { saveConfig } from '../lib/state.js';
import { buildProjectSnapshot, buildPipelineEntry, proposalOrder } from '../lib/snapshot.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-queue-order-test-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/** Root at phase-2 work + N features, each mid-pipeline so every one emits a P6 action. */
function seedRootWithFeatures(dir, features) {
  saveConfig(dir, {
    projectName: 'demo', aitriVersion: '2.2.0-rc.5', artifactsDir: 'spec',
    approvedPhases: [1], completedPhases: [1],
  });
  for (const f of features) {
    const featDir = path.join(dir, 'features', f.name);
    fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
    saveConfig(featDir, {
      projectName: f.name, artifactsDir: 'spec',
      approvedPhases: [1], completedPhases: [1],
      ...(f.createdAt !== undefined ? { createdAt: f.createdAt } : {}),
    });
  }
}

function featureP6Order(snap) {
  return snap.nextActions
    .filter(a => a.priority === 6 && a.scope.startsWith('feature:'))
    .map(a => a.scope.slice('feature:'.length));
}

describe('proposalOrder() — unit', () => {
  const pl = (scopeType, scopeName, createdAt) => ({ scopeType, scopeName, createdAt });

  it('root first, then features oldest-first by createdAt', () => {
    const order = proposalOrder([
      pl('feature', 'alpha', '2026-03-01T00:00:00.000Z'),
      pl('root',    'root',  null),
      pl('feature', 'zeta',  '2026-01-01T00:00:00.000Z'),
      pl('feature', 'mid',   '2026-02-01T00:00:00.000Z'),
    ]);
    assert.deepEqual(order.map(p => p.scopeName), ['root', 'zeta', 'mid', 'alpha']);
  });

  it('undated features come AFTER dated ones, alphabetical among themselves (status render rule)', () => {
    const order = proposalOrder([
      pl('feature', 'bbb',   null),
      pl('feature', 'young', '2026-05-01T00:00:00.000Z'),
      pl('feature', 'aaa',   null),
    ]);
    assert.deepEqual(order.map(p => p.scopeName), ['young', 'aaa', 'bbb']);
  });

  it('equal createdAt ties break by scopeName — deterministic under scripted same-second inits', () => {
    const t = '2026-04-01T12:00:00.000Z';
    const order = proposalOrder([pl('feature', 'b', t), pl('feature', 'a', t)]);
    assert.deepEqual(order.map(p => p.scopeName), ['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = [pl('feature', 'z', '2026-01-01T00:00:00.000Z'), pl('root', 'root', null)];
    const before = input.map(p => p.scopeName);
    proposalOrder(input);
    assert.deepEqual(input.map(p => p.scopeName), before);
  });
});

describe('createdAt source guard — buildPipelineEntry', () => {
  it('numeric/garbage createdAt in hand-edited .aitri degrades to null at the snapshot source', () => {
    const dir = tmpDir();
    try {
      saveConfig(dir, { projectName: 'x', artifactsDir: 'spec', createdAt: '2026-01-01T00:00:00.000Z' });
      // Hand-edit: replace with a number (the rc.2 crash class)
      const raw = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
      raw.createdAt = 20260731;
      fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(raw, null, 2));
      const entry = buildPipelineEntry(dir, 'root');
      assert.equal(entry.createdAt, null);
    } finally { cleanup(dir); }
  });
});

describe('ladder work rungs — proposal order (integration)', () => {
  it('P6 feature ties resolve oldest-created first, not alphabetical', () => {
    const dir = tmpDir();
    try {
      seedRootWithFeatures(dir, [
        { name: 'alpha', createdAt: '2026-03-01T00:00:00.000Z' },
        { name: 'zeta',  createdAt: '2026-01-01T00:00:00.000Z' },
        { name: 'mid',   createdAt: '2026-02-01T00:00:00.000Z' },
      ]);
      const snap = buildProjectSnapshot(dir);
      assert.deepEqual(featureP6Order(snap), ['zeta', 'mid', 'alpha']);
      // Root's own phase work still precedes every feature's
      const p6 = snap.nextActions.filter(a => a.priority === 6);
      assert.equal(p6[0].scope, 'root');
    } finally { cleanup(dir); }
  });

  it('a garbage createdAt does not crash the snapshot and lands the feature in the undated tail', () => {
    const dir = tmpDir();
    try {
      seedRootWithFeatures(dir, [
        { name: 'aaa-broken', createdAt: '2026-01-01T00:00:00.000Z' },
        { name: 'young',      createdAt: '2026-06-01T00:00:00.000Z' },
      ]);
      // Corrupt aaa-broken's createdAt AFTER init (hand-edit class)
      const cfgPath = path.join(dir, 'features', 'aaa-broken', '.aitri');
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      raw.createdAt = { bogus: true };
      fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));

      const snap = buildProjectSnapshot(dir);   // must not throw
      // Despite being alphabetically first AND actually oldest, the corrupted
      // feature is undated → it queues after every dated feature.
      assert.deepEqual(featureP6Order(snap), ['young', 'aaa-broken']);
    } finally { cleanup(dir); }
  });

  it('all-undated features (pre-createdAt projects) keep a deterministic name order', () => {
    const dir = tmpDir();
    try {
      seedRootWithFeatures(dir, [{ name: 'bravo' }, { name: 'alpha' }]);
      const snap = buildProjectSnapshot(dir);
      assert.deepEqual(featureP6Order(snap), ['alpha', 'bravo']);
    } finally { cleanup(dir); }
  });

  it('P2 drift ties resolve in proposal order too — the whole ladder shares one tie rule (adversarial find)', () => {
    const dir = tmpDir();
    try {
      seedRootWithFeatures(dir, [
        { name: 'alpha', createdAt: '2026-03-01T00:00:00.000Z' },
        { name: 'zeta',  createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
      // Mark an approved phase drifted in BOTH features → two priority-2 actions tie.
      for (const name of ['alpha', 'zeta']) {
        const cfgPath = path.join(dir, 'features', name, '.aitri');
        const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        raw.driftPhases = ['1'];
        fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
      }
      const snap = buildProjectSnapshot(dir);
      const p2 = snap.nextActions
        .filter(a => a.priority === 2 && a.scope.startsWith('feature:'))
        .map(a => a.scope.slice('feature:'.length));
      assert.deepEqual(p2, ['zeta', 'alpha']);   // oldest-created first, not alphabetical
    } finally { cleanup(dir); }
  });
});
