/**
 * Tests for FEATURE-INDEX-0909 (2.2.0-rc.12) — creation order rendered where the operator
 * looks: `<features>/INDEX.md`, a derived, gitignored, regenerated view.
 *
 * Pins: same ordinal as status/ladder (one rule), undated-last, idempotent write, no
 * `features/` manufactured for a feature-less project, stale index removed, first-creation
 * gitignore entry (layout-aware, no duplicate header), and the command-level wiring
 * (status text / resume / feature init write it; status --json never does).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import path   from 'node:path';
import os     from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { saveConfig, loadConfig } from '../lib/state.js';
import { buildProjectSnapshot, proposalOrder } from '../lib/snapshot.js';
import { renderFeaturesIndex, writeFeaturesIndex, creationOrdinals, featuresIndexIgnoreEntry, INDEX_BASENAME, INDEX_MARKER } from '../lib/features-index.js';
import { ensureAitriGitignore } from '../lib/gitignore.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI  = path.join(ROOT, 'bin', 'aitri.js');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-feat-index-')); }
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
function cli(dir, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  return { out: (r.stdout || '').toString(), err: (r.stderr || '').toString(), code: r.status };
}

/** Root project (contained layout by default) with N features carrying the given createdAt values. */
function seed(dir, { layoutRoot = 'aitri', features = [] } = {}) {
  const A = layoutRoot ? `${layoutRoot}/product/spec` : 'spec';
  fs.mkdirSync(path.join(dir, A), { recursive: true });
  fs.writeFileSync(path.join(dir, A, '01_REQUIREMENTS.json'), JSON.stringify({
    project_name: 'p', functional_requirements: [], non_functional_requirements: [], user_stories: [],
  }));
  saveConfig(dir, {
    projectName: 'p', aitriVersion: '2.2.0-rc.12', artifactsDir: A, layoutRoot,
    currentPhase: 1, approvedPhases: [1], completedPhases: [1],
  });
  const fdir = path.join(dir, layoutRoot || '', 'features');
  for (const f of features) {
    const d = path.join(fdir, f.name);
    fs.mkdirSync(path.join(d, 'spec'), { recursive: true });
    const cfg = { projectName: f.name, aitriVersion: '2.2.0-rc.12', artifactsDir: 'spec',
                  currentPhase: 0, approvedPhases: f.approved || [], completedPhases: f.approved || [] };
    if (f.createdAt !== undefined) cfg.createdAt = f.createdAt;
    if (f.verified) { cfg.verifyPassed = true; cfg.verifyRanAt = f.verified; cfg.verifySummary = { passed: 3, failed: 0, skipped: 0, total: 3 }; }
    saveConfig(d, cfg);
  }
  return fdir;
}

describe('renderFeaturesIndex() — one rule with status and the ladder', () => {
  it('orders by createdAt with name tiebreak, undated last without ordinal, same numbers as creationOrdinals', () => {
    const dir = tmpDir();
    try {
      seed(dir, { features: [
        { name: 'zeta',  createdAt: '2026-07-01T00:00:00.000Z', verified: '2026-07-20T00:00:00.000Z', approved: [1, 2, 3, 4, 5] },
        { name: 'alpha', createdAt: '2026-07-05T00:00:00.000Z' },
        { name: 'beta',  createdAt: '2026-07-05T00:00:00.000Z' },   // same second → name breaks the tie
        { name: 'legacy' },                                          // pre-createdAt → no ordinal, last
      ]});
      const snap = buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' });
      const md = renderFeaturesIndex(snap);
      const rows = md.split('\n').filter(l => /^\| (\d+|—) \|/.test(l));
      assert.deepEqual(rows.map(r => r.split('|')[2].trim()), ['zeta', 'alpha', 'beta', 'legacy']);
      assert.deepEqual(rows.map(r => r.split('|')[1].trim()), ['1', '2', '3', '—']);
      assert.match(rows[0], /2026-07-01 \| 5\/5 \| ✅ [^|]*\| 2026-07-20/);
      assert.match(rows[3], /— \| 0\/5 \| ⬜ not run \| — \|/);

      // The SAME numbers the status render and the ladder use — proposalOrder is the rule.
      const ord = creationOrdinals(snap.pipelines);
      const fromLadder = proposalOrder(snap.pipelines).filter(p => p.scopeType === 'feature' && p.createdAt).map(p => p.scopeName);
      assert.deepEqual([...ord.keys()], fromLadder);
      assert.equal(ord.get('zeta'), 1); assert.equal(ord.get('beta'), 3); assert.equal(ord.has('legacy'), false);
    } finally { cleanup(dir); }
  });

  it('returns null with no features (nothing to index)', () => {
    const dir = tmpDir();
    try {
      seed(dir);
      assert.equal(renderFeaturesIndex(buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' })), null);
    } finally { cleanup(dir); }
  });
});

describe('writeFeaturesIndex() — derived, idempotent, layout-aware', () => {
  it('creates on first write (+ gitignore entry, once), no-ops when unchanged, updates on change, removes when features vanish', () => {
    const dir = tmpDir();
    try {
      const fdir = seed(dir, { features: [{ name: 'a', createdAt: '2026-07-01T00:00:00.000Z' }] });
      const snap = () => buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' });
      const target = path.join(fdir, INDEX_BASENAME);

      const r1 = writeFeaturesIndex(dir, snap(), { quiet: true });
      assert.equal(r1.action, 'created');
      assert.ok(fs.existsSync(target));
      const ignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
      assert.match(ignore, /^aitri\/features\/INDEX\.md$/m, 'layout-aware ignore entry');
      assert.equal((ignore.match(/# Aitri — per-machine state/g) || []).length, 1, 'one Aitri block, no duplicate header');

      const before = fs.statSync(target).mtimeMs;
      assert.equal(writeFeaturesIndex(dir, snap(), { quiet: true }).action, 'unchanged');
      assert.equal(fs.statSync(target).mtimeMs, before, 'unchanged content must not rewrite the file');

      fs.mkdirSync(path.join(fdir, 'b', 'spec'), { recursive: true });
      saveConfig(path.join(fdir, 'b'), { projectName: 'b', aitriVersion: '2.2.0-rc.12', artifactsDir: 'spec', createdAt: '2026-07-02T00:00:00.000Z', approvedPhases: [] });
      assert.equal(writeFeaturesIndex(dir, snap(), { quiet: true }).action, 'updated');
      assert.match(fs.readFileSync(target, 'utf8'), /\| 2 \| b \|/);

      fs.rmSync(path.join(fdir, 'a'), { recursive: true }); fs.rmSync(path.join(fdir, 'b'), { recursive: true });
      assert.equal(writeFeaturesIndex(dir, snap(), { quiet: true }).action, 'removed');
      assert.equal(fs.existsSync(target), false);
    } finally { cleanup(dir); }
  });

  it('never manufactures features/ for a project without features; flat layout uses features/INDEX.md', () => {
    const dir = tmpDir();
    try {
      seed(dir, { layoutRoot: '' });
      assert.equal(writeFeaturesIndex(dir, buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' }), { quiet: true }).action, 'none');
      assert.equal(fs.existsSync(path.join(dir, 'features')), false);
      assert.equal(featuresIndexIgnoreEntry({ layoutRoot: '' }), 'features/INDEX.md');
      assert.equal(featuresIndexIgnoreEntry({ layoutRoot: 'aitri' }), 'aitri/features/INDEX.md');
    } finally { cleanup(dir); }
  });

  it('feature discovery ignores the index file (it is a file, never a phantom feature)', () => {
    const dir = tmpDir();
    try {
      const fdir = seed(dir, { features: [{ name: 'a', createdAt: '2026-07-01T00:00:00.000Z' }] });
      writeFeaturesIndex(dir, buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' }), { quiet: true });
      const names = buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' }).pipelines.filter(p => p.scopeType === 'feature').map(p => p.scopeName);
      assert.deepEqual(names, ['a']);
      assert.ok(fs.existsSync(path.join(fdir, INDEX_BASENAME)));
    } finally { cleanup(dir); }
  });
});

describe('ensureAitriGitignore({ extra }) — extends the existing block in place', () => {
  it('appends the extra entry inside an existing Aitri block from the template, preserving everything else', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n\n# Aitri — per-machine state (the shared .aitri IS committed)\n.aitri.local\n.aitri.lock\n\n# tail comment\n*.log\n');
      const r = ensureAitriGitignore(dir, { extra: ['aitri/features/INDEX.md'] });
      assert.deepEqual(r.added, ['aitri/features/INDEX.md']);
      const lines = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').split('\n');
      const at = lines.indexOf('.aitri.lock');
      assert.equal(lines[at + 1], 'aitri/features/INDEX.md', 'inserted right after the block, not at the tail');
      assert.equal(lines[lines.length - 2], '*.log', 'tail preserved');
      assert.deepEqual(ensureAitriGitignore(dir, { extra: ['aitri/features/INDEX.md'] }).added, [], 'idempotent');
    } finally { cleanup(dir); }
  });
});

describe('command-level wiring', () => {
  it('status (text) and resume write the index; status --json never touches the tree', () => {
    const dir = tmpDir();
    try {
      const fdir = seed(dir, { features: [{ name: 'a', createdAt: '2026-07-01T00:00:00.000Z' }] });
      const target = path.join(fdir, INDEX_BASENAME);

      const j = cli(dir, 'status', '--json');
      assert.equal(j.code, 0);
      assert.equal(fs.existsSync(target), false, '--json is Hub\'s read-only polling surface');

      const s = cli(dir, 'status');
      assert.equal(s.code, 0);
      assert.ok(fs.existsSync(target));
      assert.match(s.err, /INDEX\.md created/);
      assert.match(s.out, /#1 a/);                                   // same ordinal in the terminal

      fs.unlinkSync(target);
      assert.equal(cli(dir, 'resume').code, 0);
      assert.ok(fs.existsSync(target), 'resume regenerates it');
    } finally { cleanup(dir); }
  });

  it('feature init makes the new feature appear in the index immediately, with its ordinal', () => {
    const dir = tmpDir();
    try {
      const fdir = seed(dir, { features: [{ name: 'first', createdAt: '2026-07-01T00:00:00.000Z' }] });
      const r = cli(dir, 'feature', 'init', 'second');
      assert.equal(r.code, 0, r.err);
      const md = fs.readFileSync(path.join(fdir, INDEX_BASENAME), 'utf8');
      assert.match(md, /\| 1 \| first \|/);
      assert.match(md, /\| 2 \| second \|/);
    } finally { cleanup(dir); }
  });
});

// ── Adversarial pins (rc.12 pre-commit pass) ───────────────────────────────────

describe('writeFeaturesIndex() — never touches a file that is not Aitri\'s', () => {
  it('D1: a user INDEX.md in a features/ dir with no valid features is NOT deleted', () => {
    const dir = tmpDir();
    try {
      seed(dir, { layoutRoot: '' });
      fs.mkdirSync(path.join(dir, 'features', 'login'), { recursive: true });        // Cucumber-style, no .aitri
      fs.writeFileSync(path.join(dir, 'features', 'INDEX.md'), '# my own index\n');
      const r = writeFeaturesIndex(dir, buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' }), { quiet: true });
      assert.equal(r.action, 'foreign');
      assert.equal(fs.readFileSync(path.join(dir, 'features', 'INDEX.md'), 'utf8'), '# my own index\n');
    } finally { cleanup(dir); }
  });

  it('D2: a user INDEX.md next to real features is NOT overwritten, and the command says so once', () => {
    const dir = tmpDir();
    try {
      const fdir = seed(dir, { features: [{ name: 'a', createdAt: '2026-07-01T00:00:00.000Z' }] });
      fs.writeFileSync(path.join(fdir, INDEX_BASENAME), '# hand-written\n');
      const r = cli(dir, 'status');
      assert.equal(r.code, 0);
      assert.match(r.err, /not Aitri's \(no marker\) — left untouched/);
      assert.equal(fs.readFileSync(path.join(fdir, INDEX_BASENAME), 'utf8'), '# hand-written\n');
    } finally { cleanup(dir); }
  });

  it('a pre-marker index (the rc.12 draft that reached a live project) is ours: refreshed, not frozen', () => {
    const dir = tmpDir();
    try {
      const fdir = seed(dir, { features: [{ name: 'a', createdAt: '2026-07-01T00:00:00.000Z' }] });
      fs.writeFileSync(path.join(fdir, INDEX_BASENAME), '# Features — in creation order\n\n> Generated by Aitri from each feature\'s `createdAt`.\n| 1 | old |\n');
      const r = writeFeaturesIndex(dir, buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' }), { quiet: true });
      assert.equal(r.action, 'updated');
      assert.ok(fs.readFileSync(path.join(fdir, INDEX_BASENAME), 'utf8').startsWith(INDEX_MARKER));
    } finally { cleanup(dir); }
  });

  it('every index Aitri writes starts with the marker; removal only removes ours', () => {
    const dir = tmpDir();
    try {
      const fdir = seed(dir, { features: [{ name: 'a', createdAt: '2026-07-01T00:00:00.000Z' }] });
      writeFeaturesIndex(dir, buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' }), { quiet: true });
      assert.ok(fs.readFileSync(path.join(fdir, INDEX_BASENAME), 'utf8').startsWith(INDEX_MARKER));
      fs.rmSync(path.join(fdir, 'a'), { recursive: true });
      assert.equal(writeFeaturesIndex(dir, buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' }), { quiet: true }).action, 'removed');
    } finally { cleanup(dir); }
  });
});

describe('writeFeaturesIndex() — ignore before write, always', () => {
  it('D3: if .gitignore cannot be updated, nothing is written (no un-ignored derived file)', () => {
    const dir = tmpDir();
    try {
      const fdir = seed(dir, { features: [{ name: 'a', createdAt: '2026-07-01T00:00:00.000Z' }] });
      fs.mkdirSync(path.join(dir, '.gitignore'));                                     // stands in for EACCES/EROFS
      const r = writeFeaturesIndex(dir, buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' }), { quiet: true });
      assert.equal(r.action, 'skipped');
      assert.equal(fs.existsSync(path.join(fdir, INDEX_BASENAME)), false);
    } finally { cleanup(dir); }
  });

  it('D2/D3: a missing ignore entry is re-ensured on a later UPDATE, not only on first creation', () => {
    const dir = tmpDir();
    try {
      const fdir = seed(dir, { features: [{ name: 'a', createdAt: '2026-07-01T00:00:00.000Z' }] });
      // An index of ours already on disk, but the ignore entry was never added (e.g. an older
      // run, or the user reset .gitignore).
      fs.writeFileSync(path.join(fdir, INDEX_BASENAME), INDEX_MARKER + '\nstale\n');
      fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
      const r = writeFeaturesIndex(dir, buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' }), { quiet: true });
      assert.equal(r.action, 'updated');
      assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /^aitri\/features\/INDEX\.md$/m);
    } finally { cleanup(dir); }
  });

  it('layoutRoot escaping the project (`..`, absolute) → none; nothing written outside', () => {
    const dir = tmpDir();
    try {
      seed(dir, { features: [{ name: 'a', createdAt: '2026-07-01T00:00:00.000Z' }] });
      for (const lr of ['..', path.resolve(dir, '..', 'elsewhere')]) {
        const c = loadConfig(dir); c.layoutRoot = lr; saveConfig(dir, c);
        const r = writeFeaturesIndex(dir, buildProjectSnapshot(dir, { cliVersion: '2.2.0-rc.12' }), { quiet: true });
        assert.equal(r.action, 'none', `layoutRoot=${lr}`);
      }
      assert.equal(fs.existsSync(path.join(dir, '..', 'features', INDEX_BASENAME)), false);
    } finally { cleanup(dir); }
  });
});

describe('ensureAitriGitignore({ extra }) — placement and equivalence (adversarial D6/D1)', () => {
  it('inserts after the last KNOWN Aitri entry, not after the user\'s contiguous lines', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, '.gitignore'), '# Aitri — per-machine state (the shared .aitri IS committed)\n.aitri.local\n.aitri.lock\n.next-smoke/\n.next-e2e/\n');
      ensureAitriGitignore(dir, { extra: ['aitri/features/INDEX.md'] });
      const lines = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').split('\n');
      assert.deepEqual(lines.slice(0, 5), ['# Aitri — per-machine state (the shared .aitri IS committed)', '.aitri.local', '.aitri.lock', 'aitri/features/INDEX.md', '.next-smoke/']);
    } finally { cleanup(dir); }
  });

  it('a slash-anchored equivalent already present counts as present (no duplicate line)', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, '.gitignore'), '.aitri.local\n.aitri.lock\n/aitri/features/INDEX.md\n');
      const r = ensureAitriGitignore(dir, { extra: ['aitri/features/INDEX.md'] });
      assert.deepEqual(r.added, []);
    } finally { cleanup(dir); }
  });
});
