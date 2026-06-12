/**
 * Tests: flat → contained layout migration (LAYOUT-1 Phase C, rc.78)
 * Covers: every refuse gate (already contained, not aitri, custom artifactsDir,
 * no git, dirty tree, container collision), the move plan, the executed
 * migration end-to-end (tree, config, agent-file regeneration, feature
 * survival), the root-artifact ('' artifactsDir) variant, and the adopt
 * --layout dry-run wrapper.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { loadConfig } from '../lib/state.js';
import { planLayoutMigration, executeLayoutMigration } from '../lib/upgrade/layout-migration.js';
import { cmdAdopt } from '../lib/commands/adopt.js';
import { cmdFeature } from '../lib/commands/feature.js';
import { buildProjectSnapshot } from '../lib/snapshot.js';
import { initFlatProject } from './fixtures.js';

const ROOT_DIR = path.resolve(process.cwd());

function tmpDir() {
  // realpathSync: macOS tmpdir is a /var → /private/var symlink; git resolves it.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-layoutmig-')));
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function git(dir, cmd) {
  return execSync(`git ${cmd}`, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
}

function gitCommitAll(dir, msg = 'snapshot') {
  git(dir, 'add -A');
  git(dir, `-c user.email=t@t -c user.name=t commit -m "${msg}" --no-gpg-sign`);
}

/** Flat project fixture inside a committed git repo. */
function flatGitProject({ withFeature = false, rootArtifacts = false } = {}) {
  const dir = tmpDir();
  git(dir, 'init -q');
  initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.75' });
  writeFile(dir, 'idea_context/mockup.png', 'x');
  writeFile(dir, 'src/index.js', 'export const x = 1;');
  if (rootArtifacts) {
    // Simulate a pre-v0.1.20 root-artifact project: artifactsDir ''.
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
    cfg.artifactsDir = '';
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(cfg, null, 2));
    fs.rmSync(path.join(dir, 'spec'), { recursive: true, force: true });
    writeFile(dir, '01_REQUIREMENTS.json', '{}');
    writeFile(dir, 'BUGS.json', '{"bugs":[]}');
  } else {
    writeFile(dir, 'spec/01_REQUIREMENTS.json', '{}');
  }
  if (withFeature) {
    writeFile(dir, 'features/pay/.aitri', JSON.stringify({
      projectName: 'pay', artifactsDir: 'spec', approvedPhases: [], completedPhases: [], aitriVersion: '2.0.0-rc.75',
    }));
    writeFile(dir, 'features/pay/FEATURE_IDEA.md', '# pay');
    writeFile(dir, 'features/pay/spec/01_REQUIREMENTS.json', '{}');
  }
  gitCommitAll(dir);
  return dir;
}

function captureAll(fn) {
  let stdout = '';
  let stderr = '';
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const origLog = console.log.bind(console);
  process.stdout.write = (chunk) => { stdout += chunk; return true; };
  process.stderr.write = (chunk) => { stderr += chunk; return true; };
  console.log = (...a) => { stdout += a.join(' ') + '\n'; };
  try { fn(); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    console.log = origLog;
  }
  return { stdout, stderr };
}

// ── plan gates ────────────────────────────────────────────────────────────────

describe('planLayoutMigration — refuse gates', () => {
  it('refuses an already-contained project', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({ aitriVersion: 'x', layoutRoot: 'aitri', artifactsDir: 'aitri/product/spec' }));
      const plan = planLayoutMigration(dir);
      assert.equal(plan.ok, false);
      assert.equal(plan.code, 'already-contained');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses a non-Aitri directory', () => {
    const dir = tmpDir();
    try {
      assert.equal(planLayoutMigration(dir).code, 'not-aitri');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses a custom artifactsDir (hand-tuned project)', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({ aitriVersion: 'x', artifactsDir: 'docs/aitri' }));
      assert.equal(planLayoutMigration(dir).code, 'custom-artifacts-dir');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses without a git repository (the recovery contract needs git)', () => {
    const dir = tmpDir();
    try {
      initFlatProject({ dir, rootDir: ROOT_DIR, VERSION: '2.0.0-rc.75' });
      assert.equal(planLayoutMigration(dir).code, 'no-git');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses a dirty working tree (including untracked files)', () => {
    const dir = flatGitProject();
    try {
      writeFile(dir, 'uncommitted.txt', 'x');
      assert.equal(planLayoutMigration(dir).code, 'dirty-tree');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('refuses when an aitri path already exists and is not an empty dir', () => {
    const dir = flatGitProject();
    try {
      writeFile(dir, 'aitri/stray.txt', 'x');
      gitCommitAll(dir, 'stray');
      assert.equal(planLayoutMigration(dir).code, 'container-collision');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── plan content ──────────────────────────────────────────────────────────────

describe('planLayoutMigration — move plan', () => {
  it('plans the full flat → contained move set', () => {
    const dir = flatGitProject({ withFeature: true });
    try {
      const plan = planLayoutMigration(dir);
      assert.equal(plan.ok, true);
      const byFrom = Object.fromEntries(plan.moves.map(m => [m.from, m.to]));
      assert.equal(byFrom['IDEA.md'], 'aitri/product/IDEA.md');
      assert.equal(byFrom['idea_context'], 'aitri/product/idea_context');
      assert.equal(byFrom['BACKLOG.md'], 'aitri/BACKLOG.md');
      assert.equal(byFrom['features'], 'aitri/features');
      assert.equal(byFrom['spec'], 'aitri/product/spec');
      assert.ok(plan.notes.some(n => /content is not rewritten/i.test(n)),
        'plan must flag (not rewrite) hardcoded content paths');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('plans per-file moves for a root-artifact project (artifactsDir "")', () => {
    const dir = flatGitProject({ rootArtifacts: true });
    try {
      const plan = planLayoutMigration(dir);
      assert.equal(plan.ok, true);
      const byFrom = Object.fromEntries(plan.moves.map(m => [m.from, m.to]));
      assert.equal(byFrom['01_REQUIREMENTS.json'], 'aitri/product/spec/01_REQUIREMENTS.json');
      assert.equal(byFrom['BUGS.json'], 'aitri/product/spec/BUGS.json');
      assert.equal(byFrom['spec'], undefined, 'no whole-spec move when artifacts live at the root');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── execution ─────────────────────────────────────────────────────────────────

describe('executeLayoutMigration — end to end', () => {
  it('moves everything, updates config, regenerates agent files; the project still works', () => {
    const dir = flatGitProject({ withFeature: true });
    try {
      const { moved, agentFiles } = executeLayoutMigration(dir, ROOT_DIR);
      assert.ok(moved.length >= 5, 'all flat entries moved');

      // Tree
      assert.ok(fs.existsSync(path.join(dir, 'aitri', 'product', 'IDEA.md')));
      assert.ok(fs.existsSync(path.join(dir, 'aitri', 'product', 'idea_context', 'mockup.png')));
      assert.ok(fs.existsSync(path.join(dir, 'aitri', 'product', 'spec', '01_REQUIREMENTS.json')));
      assert.ok(fs.existsSync(path.join(dir, 'aitri', 'BACKLOG.md')));
      assert.ok(fs.existsSync(path.join(dir, 'aitri', 'features', 'pay', 'spec', '01_REQUIREMENTS.json')));
      assert.ok(!fs.existsSync(path.join(dir, 'IDEA.md')));
      assert.ok(!fs.existsSync(path.join(dir, 'spec')));
      assert.ok(!fs.existsSync(path.join(dir, 'features')));
      assert.ok(fs.existsSync(path.join(dir, 'src', 'index.js')), 'user code untouched');

      // Config
      const cfg = loadConfig(dir);
      assert.equal(cfg.layoutRoot, 'aitri');
      assert.equal(cfg.artifactsDir, 'aitri/product/spec');
      assert.ok((cfg.events || []).some(e => e.event === 'layout_migrated'), 'migration leaves an event');

      // Feature config untouched (feature-relative paths need no rewrite)
      const fcfg = loadConfig(path.join(dir, 'aitri', 'features', 'pay'));
      assert.equal(fcfg.artifactsDir, 'spec');

      // Agent files regenerated with contained paths
      assert.ok(agentFiles.includes('AGENTS.md'));
      const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
      assert.ok(agents.includes('aitri/product/idea_context'), 'regenerated agent files carry contained paths');

      // The migrated project works: snapshot + feature discovery
      const snap = buildProjectSnapshot(dir, { cliVersion: '2.0.0-rc.78' });
      assert.ok(snap.pipelines.find(p => p.scope === 'feature:pay'), 'feature discovered post-migration');
      const { stdout } = captureAll(() =>
        cmdFeature({ dir, args: ['list'], err: (m) => { throw new Error(m); }, rootDir: ROOT_DIR })
      );
      assert.ok(stdout.includes('pay'), 'feature list works post-migration');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('migrates a root-artifact project into aitri/product/spec/', () => {
    const dir = flatGitProject({ rootArtifacts: true });
    try {
      executeLayoutMigration(dir, ROOT_DIR);
      assert.ok(fs.existsSync(path.join(dir, 'aitri', 'product', 'spec', '01_REQUIREMENTS.json')));
      assert.ok(fs.existsSync(path.join(dir, 'aitri', 'product', 'spec', 'BUGS.json')));
      assert.ok(!fs.existsSync(path.join(dir, '01_REQUIREMENTS.json')));
      assert.equal(loadConfig(dir).artifactsDir, 'aitri/product/spec');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('throws (and moves nothing) when a gate fails', () => {
    const dir = flatGitProject();
    try {
      writeFile(dir, 'uncommitted.txt', 'x');   // dirty tree
      assert.throws(() => executeLayoutMigration(dir, ROOT_DIR), /not clean/i);
      assert.ok(fs.existsSync(path.join(dir, 'IDEA.md')), 'nothing moved on refusal');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── adopt wrapper ─────────────────────────────────────────────────────────────

describe('aitri adopt --upgrade --layout (wrapper gates)', () => {
  it('--dry-run prints the plan and moves nothing', () => {
    const dir = flatGitProject();
    try {
      const { stdout } = captureAll(() =>
        cmdAdopt({ dir, args: ['--upgrade', '--layout', '--dry-run'], VERSION: '2.0.0-rc.78', rootDir: ROOT_DIR, err: (m) => { throw new Error(m); } })
      );
      assert.ok(stdout.includes('IDEA.md  →  aitri/product/IDEA.md'), 'plan lists the brief move');
      assert.ok(/dry run — nothing was moved/i.test(stdout));
      assert.ok(fs.existsSync(path.join(dir, 'IDEA.md')), 'nothing moved');
      assert.equal(loadConfig(dir).layoutRoot, undefined, 'config untouched');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('reports already-contained as a no-op success', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({ aitriVersion: 'x', layoutRoot: 'aitri', artifactsDir: 'aitri/product/spec' }));
      const { stdout } = captureAll(() =>
        cmdAdopt({ dir, args: ['--upgrade', '--layout'], VERSION: '2.0.0-rc.78', rootDir: ROOT_DIR, err: (m) => { throw new Error(m); } })
      );
      assert.ok(/nothing to migrate/i.test(stdout));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('surfaces gate failures through err (e.g. dirty tree)', () => {
    const dir = flatGitProject();
    try {
      writeFile(dir, 'uncommitted.txt', 'x');
      assert.throws(
        () => captureAll(() =>
          cmdAdopt({ dir, args: ['--upgrade', '--layout'], VERSION: '2.0.0-rc.78', rootDir: ROOT_DIR, err: (m) => { throw new Error(m); } })
        ),
        /not clean/i
      );
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
