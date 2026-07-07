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

  it('plans per-file moves for the undefined and "." root-artifact aliases (Phase-D canaries)', () => {
    for (const alias of [undefined, '.']) {
      const dir = flatGitProject({ rootArtifacts: true });
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'));
        if (alias === undefined) delete cfg.artifactsDir; else cfg.artifactsDir = alias;
        fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(cfg, null, 2));
        gitCommitAll(dir, 'alias');
        const plan = planLayoutMigration(dir);
        assert.equal(plan.ok, true, `alias ${String(alias)} must be migratable`);
        const byFrom = Object.fromEntries(plan.moves.map(m => [m.from, m.to]));
        assert.equal(byFrom['01_REQUIREMENTS.json'], 'aitri/product/spec/01_REQUIREMENTS.json');
        assert.equal(byFrom['spec'], undefined, 'no whole-spec move for root-artifact aliases');
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
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

// ── Phase-D finding #4: NFR-targeted TCs accepted end to end ──────────────────

describe('cross-artifact review accepts NFR-targeted TCs (Phase-D fix)', () => {
  it('a TC with requirement_id NFR-001 passes the cross-artifact check', async () => {
    const { runReview } = await import('../lib/commands/review.js');
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', JSON.stringify({ projectName: 'x', artifactsDir: 'spec', aitriVersion: 'x' }));
      writeFile(dir, 'spec/01_REQUIREMENTS.json', JSON.stringify({
        functional_requirements: [{ id: 'FR-001', title: 't', priority: 'MUST', type: 'logic', acceptance_criteria: ['x'] }],
        non_functional_requirements: [{ id: 'NFR-001', category: 'Performance', requirement: 'fast' }],
      }));
      writeFile(dir, 'spec/03_TEST_CASES.json', JSON.stringify({
        test_cases: [
          { id: 'TC-001h', requirement_id: 'FR-001' },
          { id: 'TC-NFR-001h', requirement_id: 'NFR-001' },
          { id: 'TC-BAD-001h', requirement_id: 'FR-999' },
        ],
      }));
      const { errors } = runReview(dir, { artifactsDir: 'spec' }, 'phase3');
      assert.ok(!errors.some(e => e.includes('NFR-001')), 'NFR target must be accepted');
      assert.ok(errors.some(e => e.includes('FR-999')), 'unknown ids are still rejected');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── rc.82 adversarial-review fixes ────────────────────────────────────────────

describe('rc.82 hardening — migration plan', () => {
  it('a features/ dir with NO .aitri units is left in place (ownership marker)', () => {
    const dir = flatGitProject();
    try {
      writeFile(dir, 'features/login.feature', 'Feature: cucumber, not aitri');
      gitCommitAll(dir, 'bdd');
      const plan = planLayoutMigration(dir);
      assert.equal(plan.ok, true);
      assert.ok(!plan.moves.some(m => m.from === 'features'), 'user-owned features/ must not be claimed');
      assert.ok(plan.notes.some(n => /NO Aitri feature units/.test(n)), 'plan explains why');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('timestamp-suffixed archived seeds are carried by the move plan', () => {
    const dir = flatGitProject();
    try {
      writeFile(dir, 'archive/IDEA.md', '# v1');
      writeFile(dir, 'archive/IDEA-2026-06-01T00-00-00-000Z.md', '# v0');
      gitCommitAll(dir, 'archives');
      const plan = planLayoutMigration(dir);
      const froms = plan.moves.map(m => m.from);
      assert.ok(froms.includes('archive/IDEA.md'));
      assert.ok(froms.includes('archive/IDEA-2026-06-01T00-00-00-000Z.md'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('gitignored files under moved paths are surfaced as a plan note', () => {
    const dir = flatGitProject();
    try {
      writeFile(dir, '.gitignore', 'idea_context/secret.png\n.aitri.local\n.aitri.lock\n');
      writeFile(dir, 'idea_context/secret.png', 'binary-ish');
      gitCommitAll(dir, 'ignore rule');
      const plan = planLayoutMigration(dir);
      assert.equal(plan.ok, true, 'ignored files do not dirty the tree');
      assert.ok(plan.notes.some(n => /gitignored file/.test(n) && n.includes('idea_context/secret.png')),
        'plan must warn that git cannot restore them');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('regenerateAgentFiles keeps user-authored agent files (no Aitri marker)', async () => {
    const { regenerateAgentFiles } = await import('../lib/agent-files.js');
    const dir = flatGitProject();
    try {
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# My own rules\nNever generated by Aitri.\n');
      const cfg = { layoutRoot: 'aitri', artifactsDir: 'aitri/product/spec' };
      const { regenerated, kept } = regenerateAgentFiles(dir, ROOT_DIR, cfg);
      assert.ok(kept.includes('CLAUDE.md'), 'user-authored file is reported as kept');
      assert.equal(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'),
        '# My own rules\nNever generated by Aitri.\n', 'content untouched');
      assert.ok(regenerated.includes('AGENTS.md') || fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8').includes('aitri/product'),
        'Aitri-generated files DO regenerate with the new layout');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('rc.82 hardening — orphan-seed absorb is layout-aware (CONFIRMED finding)', () => {
  it('adopt --upgrade absorbs a contained unit seed (aitri/product/IDEA.md) post-migration', async () => {
    const { runUpgrade } = await import('../lib/upgrade/index.js');
    const dir = tmpDir();
    try {
      // Contained project, Phase 1 approved, seed NOT absorbed (the stranded state).
      writeFile(dir, '.aitri', JSON.stringify({
        projectName: 'x', aitriVersion: '2.0.0-rc.78', layoutRoot: 'aitri',
        artifactsDir: 'aitri/product/spec', approvedPhases: [1], completedPhases: [1],
      }));
      writeFile(dir, 'aitri/product/IDEA.md', '# stranded seed\n');
      writeFile(dir, 'aitri/product/spec/01_REQUIREMENTS.json', '{"project_name":"x","functional_requirements":[]}');
      const orig = process.stdout.write.bind(process.stdout);
      process.stdout.write = () => true;
      try { runUpgrade({ dir, VERSION: '2.0.0-rc.82' }); }
      finally { process.stdout.write = orig; }
      assert.ok(!fs.existsSync(path.join(dir, 'aitri', 'product', 'IDEA.md')), 'seed absorbed from the contained location');
      assert.equal(fs.readFileSync(path.join(dir, 'aitri', 'product', 'archive', 'IDEA.md'), 'utf8'), '# stranded seed\n');
      const reqs = JSON.parse(fs.readFileSync(path.join(dir, 'aitri', 'product', 'spec', '01_REQUIREMENTS.json'), 'utf8'));
      assert.equal(reqs.original_brief, '# stranded seed\n');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('rc.82 hardening — classifier scope/layout awareness', () => {
  it('feature scope detects FEATURE_IDEA.md refs; contained features are scanned', async () => {
    const { classifyIdeaReferences } = await import('../lib/upgrade/idea-ref-classifier.js');
    const dir = tmpDir();
    try {
      // Feature-scope scan (dir = feature dir): FEATURE_IDEA.md ref in a narrative field.
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', 'See FEATURE_IDEA.md for the seed.');
      const r = classifyIdeaReferences(dir, { artifactsDir: 'spec' }, { featureScope: true });
      assert.equal(r.narrative.length, 1, 'FEATURE_IDEA.md ref detected in feature scope');
      const rRoot = classifyIdeaReferences(dir, { artifactsDir: 'spec' });
      assert.equal(rRoot.narrative.length, 0, 'root scope still ignores FEATURE_IDEA.md');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('contained project: feature specs under aitri/features/ are scanned for IDEA.md refs', async () => {
    const { classifyIdeaReferences } = await import('../lib/upgrade/idea-ref-classifier.js');
    const dir = tmpDir();
    try {
      writeFile(dir, 'aitri/features/pay/spec/02_SYSTEM_DESIGN.md', 'grounded in IDEA.md originally');
      const r = classifyIdeaReferences(dir, { layoutRoot: 'aitri', artifactsDir: 'aitri/product/spec' });
      assert.equal(r.narrative.length, 1, 'contained feature spec scanned');
      assert.ok(r.narrative[0].file.startsWith('aitri/features/pay/spec/'), 'fileRel is layout-correct');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('AUDIT-REF-0706 — AUDIT_REPORT.md seed citations are legitimate, not blockers', () => {
  it('root scope: IDEA.md mention in AUDIT_REPORT.md yields no narrative ref', async () => {
    const { classifyIdeaReferences } = await import('../lib/upgrade/idea-ref-classifier.js');
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/AUDIT_REPORT.md', '## Coverage\n- Source: `IDEA.md` — line 3\n');
      const r = classifyIdeaReferences(dir, { artifactsDir: 'spec' });
      assert.equal(r.narrative.length, 0, 'point-in-time advisory record must not block');
      assert.equal(r.frozenCount, 0, 'skip is silent — legitimate citations are not counted');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('feature scope: FEATURE_IDEA.md mention in a feature AUDIT_REPORT.md yields no narrative ref', async () => {
    const { classifyIdeaReferences } = await import('../lib/upgrade/idea-ref-classifier.js');
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/AUDIT_REPORT.md', 'Gap traced to FEATURE_IDEA.md line 2.');
      const r = classifyIdeaReferences(dir, { artifactsDir: 'spec' }, { featureScope: true });
      assert.equal(r.narrative.length, 0, 'feature audit report is the same advisory record');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('other narrative artifacts still block (the gate is intact)', async () => {
    const { classifyIdeaReferences } = await import('../lib/upgrade/idea-ref-classifier.js');
    const dir = tmpDir();
    try {
      writeFile(dir, 'spec/AUDIT_REPORT.md', 'cites IDEA.md legitimately');
      writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', 'runtime doc references IDEA.md');
      const r = classifyIdeaReferences(dir, { artifactsDir: 'spec' });
      assert.equal(r.narrative.length, 1, 'design doc ref still narrative');
      assert.equal(r.narrative[0].file, 'spec/02_SYSTEM_DESIGN.md');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("rc.82 hardening — '.' alias keeps the historical spec/ exclusion", () => {
  it("isAitriStatePath excludes literal spec/ for artifactsDir '.'", async () => {
    const { isAitriStatePath } = await import('../lib/reconcile-patterns.js');
    assert.equal(isAitriStatePath('spec/x.json', { artifactsDir: '.' }), true);
    assert.equal(isAitriStatePath('src/x.js', { artifactsDir: '.' }), false);
  });
});
