/**
 * Tests for RECONCILE-FRAME-0908 (2.2.0-rc.11) — reconcile's git readers judge paths
 * in the PIPELINE frame, not the raw REPO frame.
 *
 * The defect: `git diff --name-only` / `git status --porcelain` answer in repo-relative
 * paths, while `isAitriStatePath()` matches prefixes relative to the project root
 * (artifactsDir, layoutRoot, features/). Whenever the frames diverge — a project whose
 * root is a repo SUBDIR, or a feature pipeline under `aitri/features/<name>/` — Aitri's
 * OWN `.aitri` and artifacts were classified as project code. That is not cosmetic: it
 * manufactures off-pipeline drift out of Aitri's own writes, and the reconcile cycle then
 * never closes —
 *
 *   reconcile (drift found) → clears verifyPassed
 *   → --resolve refuses: "verify has not passed"
 *   → verify-run/complete → they rewrite `.aitri` + 04_TEST_RESULTS.json
 *   → --resolve refuses: "uncommitted behavioral changes: .aitri"
 *   → commit them (as the gate demands) → that commit IS fresh drift → repeat forever.
 *
 * rc.7 (ADR-085 / M1) built the normalization but wired it only into the verify-ref
 * binding; its own header named this livelock. rc.11 promotes it to lib/git-frame.js and
 * migrates the three reconcile-side readers. These tests pin BOTH the helpers and the
 * command-level wiring — a helper-only pin would not have caught the rc.8 wiring gap.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import path   from 'node:path';
import os     from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { saveConfig, loadConfig } from '../lib/state.js';
import { buildProjectSnapshot }   from '../lib/snapshot.js';
import { gitShowPrefix, isBehavioralInFrame, toPipelinePath } from '../lib/git-frame.js';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'aitri.js');

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-rec-frame-')); }
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}
function initGit(dir) {
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t.co');
  git(dir, 'config', 'user.name', 'T');
}
function commitAll(repo, msg) {
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', msg);
  return git(repo, 'rev-parse', 'HEAD');
}
/** Run the real CLI in `dir`; returns stdout+stderr regardless of exit code (non-TTY stdin,
 *  like CI). Both streams matter: the `verifyPassed cleared` notice is stderr on a 0 exit. */
function cli(dir, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  return (r.stdout || '').toString() + (r.stderr || '').toString();
}

/**
 * Phase-4-approved project with a contained layout, verify green, reconcile baseline
 * stamped at HEAD. `proj` may be the repo root or any subdir of it.
 */
function seedProject(repo, proj) {
  const A = 'aitri/product/spec';
  fs.mkdirSync(path.join(proj, A), { recursive: true });
  const w = (f, c) => fs.writeFileSync(path.join(proj, A, f), c);
  w('01_REQUIREMENTS.json', JSON.stringify({
    project_name: 'p', user_stories: [{ id: 'US-001' }],
    functional_requirements: [{ id: 'FR-001', priority: 'MUST', title: 't', acceptance_criteria: ['AC'] }],
    non_functional_requirements: [],
  }));
  w('02_SYSTEM_DESIGN.md', '# Design\n\nx\n');
  w('03_TEST_CASES.json', JSON.stringify({ test_cases: [{ id: 'TC-001h', requirement_id: 'FR-001', type: 'unit' }] }));
  w('04_BUILD_REPORT.json', JSON.stringify({ files_created: ['src/mig.js'] }));
  w('04_CODE_REVIEW.md', '# Review\n');
  w('04_TEST_RESULTS.json', JSON.stringify({
    summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
    results: [{ tc_id: 'TC-001h', status: 'pass' }],
    fr_coverage: [{ fr_id: 'FR-001', status: 'covered', tests_passing: 1, tests_failing: 0 }],
  }));
  fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'src', 'mig.js'), 'export const v = 1;\n');
  fs.writeFileSync(path.join(repo, '.gitignore'), '.aitri.local\n');
  saveConfig(proj, {
    projectName: 'p', aitriVersion: '2.2.0-rc.11',
    artifactsDir: A, layoutRoot: 'aitri',
    currentPhase: 4, approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
    verifyPassed: true, verifySummary: { total: 1, passed: 1, failed: 0 },
  });
  const head = commitAll(repo, 'base');
  const cfg = loadConfig(proj);
  cfg.reconcileState = { baseRef: head, method: 'git', status: 'resolved', lastRun: new Date().toISOString() };
  saveConfig(proj, cfg);
  return head;
}

const uncounted = (proj) => buildProjectSnapshot(proj, { cliVersion: '2.2.0-rc.11' }).reconcile.uncountedFiles;
const nextCmd   = (proj) => buildProjectSnapshot(proj, { cliVersion: '2.2.0-rc.11' }).nextActions[0]?.command;

// ── The livelock, at the command level ────────────────────────────────────────

describe('reconcile path frame — project root is a repo SUBDIR (monorepo)', () => {
  it('LIVELOCK PIN: committing Aitri\'s own state + artifacts is never off-pipeline drift', () => {
    const repo = tmpDir();
    try {
      initGit(repo);
      const proj = path.join(repo, 'app');
      fs.mkdirSync(proj, { recursive: true });
      seedProject(repo, proj);
      assert.equal(gitShowPrefix(proj), 'app/', 'precondition: the frames diverge');

      // Aitri's own writes (what verify-run + --resolve produce), then the handoff commit
      // the working-tree gate demands. Before rc.11 this commit re-opened the cycle.
      fs.writeFileSync(path.join(proj, 'aitri/product/spec/04_TEST_RESULTS.json'),
        JSON.stringify({ summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
                         results: [{ tc_id: 'TC-001h', status: 'pass' }] }));
      const cfg = loadConfig(proj); cfg.approvedPhases = [1, 2, 3, 4, 'ux']; saveConfig(proj, cfg);
      commitAll(repo, 'handoff: aitri state + artifacts');

      assert.equal(uncounted(proj), 0,
        'Aitri\'s own `.aitri`/artifacts must not count as project drift');
      assert.notEqual(nextCmd(proj), 'aitri reconcile',
        'the ladder must not route to reconcile for Aitri\'s own writes');
      assert.match(cli(proj, 'reconcile'), /No code changes detected outside pipeline/);
      assert.equal(loadConfig(proj).verifyPassed, true,
        'a no-op reconcile must not clear the verify verdict (the first rung of the livelock)');
    } finally { cleanup(repo); }
  });

  it('real project code IS still detected, and its path is emitted in the pipeline frame', () => {
    const repo = tmpDir();
    try {
      initGit(repo);
      const proj = path.join(repo, 'app');
      fs.mkdirSync(proj, { recursive: true });
      seedProject(repo, proj);

      fs.writeFileSync(path.join(proj, 'src', 'mig.js'), 'export const v = 2; // fix\n');
      commitAll(repo, 'fix migration bug');

      assert.equal(uncounted(proj), 1, 'genuine code drift must still be counted');
      assert.equal(nextCmd(proj), 'aitri reconcile');

      const out = cli(proj, 'reconcile');
      const fileList = out.slice(out.indexOf('Files changed outside the pipeline'), out.indexOf('## Code changes'));
      assert.match(fileList, /^- src\/mig\.js$/m,
        'the briefing lists the PIPELINE-relative path (a repo-relative one is not a valid pathspec from the project dir)');
      assert.doesNotMatch(fileList, /app\/src/,
        'the raw repo frame must not leak into the classification list');
      assert.match(out, /export const v = 2/,
        'the diff must render — a repo-relative pathspec silently matched nothing from a subdir');
      assert.deepEqual(loadConfig(proj).reconcileState.pendingFiles, ['src/mig.js']);
    } finally { cleanup(repo); }
  });

  it('WIRING PIN: the working-tree gate ignores Aitri\'s own uncommitted state', () => {
    const repo = tmpDir();
    try {
      initGit(repo);
      const proj = path.join(repo, 'app');
      fs.mkdirSync(proj, { recursive: true });
      seedProject(repo, proj);

      fs.writeFileSync(path.join(proj, 'src', 'mig.js'), 'export const v = 2;\n');
      commitAll(repo, 'fix');
      cli(proj, 'reconcile');                       // → pending, clears verifyPassed
      const c = loadConfig(proj); c.verifyPassed = true; saveConfig(proj, c);   // verify re-run green

      // Uncommitted Aitri writes ONLY — exactly what verify-run leaves behind.
      fs.writeFileSync(path.join(proj, 'aitri/product/spec/04_TEST_RESULTS.json'), '{"summary":{"total":1,"passed":1,"failed":0}}');
      const out = cli(proj, 'reconcile', '--resolve');
      assert.doesNotMatch(out, /uncommitted behavioral changes/,
        'Aitri\'s own artifacts must never trip the working-tree gate');
      assert.match(out, /Cannot resolve non-interactively/,
        'the mechanical gates must pass and hand off to the human TTY gate');
    } finally { cleanup(repo); }
  });

  it('MIGRATION PIN: rc.10 repo-relative pendingFiles do not read as grown drift', () => {
    const repo = tmpDir();
    try {
      initGit(repo);
      const proj = path.join(repo, 'app');
      fs.mkdirSync(proj, { recursive: true });
      seedProject(repo, proj);

      fs.writeFileSync(path.join(proj, 'src', 'mig.js'), 'export const v = 2;\n');
      commitAll(repo, 'fix');

      // Simulate a project that entered pending under rc.10: REPO-relative pendingFiles.
      const c = loadConfig(proj);
      c.reconcileState = { ...c.reconcileState, status: 'pending', pendingFiles: ['app/src/mig.js'] };
      c.verifyPassed = true;                       // verify re-run green while pending
      saveConfig(proj, c);

      const out = cli(proj, 'reconcile');
      assert.doesNotMatch(out, /NEW off-pipeline change/,
        'a carried-over file must not read as new merely because the frame changed');
      assert.equal(loadConfig(proj).verifyPassed, true,
        'the upgrade must not clear a genuinely fresh verify verdict');
      const rs = loadConfig(proj).reconcileState;
      assert.deepEqual(rs.pendingFiles, ['src/mig.js'], 'the set is rewritten in the new frame');
      assert.equal(rs.pendingFilesFrame, 'pipeline', 'and stamped with the frame marker');

      // Once stamped, growth detection is STRICT again — no permanent alias (adversarial D2a:
      // a subtree dir named like the project basename must not mask a genuinely new file).
      fs.mkdirSync(path.join(proj, 'app', 'src'), { recursive: true });
      fs.writeFileSync(path.join(proj, 'app', 'src', 'mig.js'), '// nested twin\n');
      commitAll(repo, 'twin');
      const c2 = loadConfig(proj);
      c2.reconcileState = { ...c2.reconcileState, pendingFiles: ['app/src/mig.js'], pendingFilesFrame: 'pipeline' };
      c2.verifyPassed = true; saveConfig(proj, c2);
      assert.match(cli(proj, 'reconcile'), /NEW off-pipeline change/,
        'src/mig.js is new drift even though "app/src/mig.js" (a real nested twin) is known');
      assert.equal(loadConfig(proj).verifyPassed, false);
    } finally { cleanup(repo); }
  });

  it('QUOTING PIN (adversarial D1): a non-ASCII path arrives raw, never C-quoted', () => {
    const repo = tmpDir();
    try {
      initGit(repo);
      const proj = path.join(repo, 'app');
      fs.mkdirSync(proj, { recursive: true });
      seedProject(repo, proj);
      // A feature named `café` — git's default core.quotePath would emit
      // "app/aitri/features/caf\303\251/…", which fails every prefix match.
      const feat = path.join(proj, 'aitri', 'features', 'café');
      fs.mkdirSync(path.join(feat, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(feat, '.aitri'), '{}');
      fs.writeFileSync(path.join(feat, 'spec', '01_REQUIREMENTS.json'), '{}');
      fs.writeFileSync(path.join(proj, 'src', 'mig.js'), 'export const v = 2;\n');
      commitAll(repo, 'feature café + fix');

      assert.equal(uncounted(proj), 1, 'only src/mig.js counts — the café feature is Aitri state');
      const out = cli(proj, 'reconcile');
      assert.match(out, /Files changed outside the pipeline:\*\* 1/);
      assert.doesNotMatch(out, /caf\\303|:\/"/, 'no C-quoted or :/-mangled path may reach the operator');
      assert.deepEqual(loadConfig(proj).reconcileState.pendingFiles, ['src/mig.js']);

      // The working-tree gate reads the same raw form (uncommitted café artifact only).
      const c = loadConfig(proj); c.verifyPassed = true; saveConfig(proj, c);
      fs.writeFileSync(path.join(feat, 'spec', '01_REQUIREMENTS.json'), '{"v":2}');
      assert.match(cli(proj, 'reconcile', '--resolve'), /Cannot resolve non-interactively/);
    } finally { cleanup(repo); }
  });

  it('LEGACY REPO-ROOT PIN: an unstamped set is still trusted where frames coincide', () => {
    const repo = tmpDir();
    try {
      initGit(repo);
      seedProject(repo, repo);
      fs.writeFileSync(path.join(repo, 'src', 'mig.js'), 'export const v = 2;\n');
      commitAll(repo, 'fix');
      fs.writeFileSync(path.join(repo, 'src', 'other.js'), '// new\n');
      commitAll(repo, 'more drift');
      const c = loadConfig(repo);
      c.reconcileState = { ...c.reconcileState, status: 'pending', pendingFiles: ['src/mig.js'] }; // rc.10, no marker
      c.verifyPassed = true; saveConfig(repo, c);
      assert.match(cli(repo, 'reconcile'), /NEW off-pipeline change/,
        'at the repo root the rc.10 frame IS the pipeline frame — growth must still clear');
      assert.equal(loadConfig(repo).verifyPassed, false);
    } finally { cleanup(repo); }
  });
});

// ── The other diverging frame: a feature pipeline in the DEFAULT contained layout ──

describe('reconcile path frame — feature pipeline under aitri/features/<name>/', () => {
  it('a feature\'s own .aitri + spec are state, not behavioral drift', () => {
    const repo = tmpDir();
    try {
      initGit(repo);
      const feat = path.join(repo, 'aitri', 'features', 'f1');
      fs.mkdirSync(path.join(feat, 'spec'), { recursive: true });
      seedProject(repo, repo);                       // root pipeline at the repo root
      saveConfig(feat, {
        projectName: 'f1', aitriVersion: '2.2.0-rc.11', artifactsDir: 'spec',
        approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
      });
      fs.writeFileSync(path.join(feat, 'spec', '04_TEST_RESULTS.json'), '{"summary":{}}');
      const head = commitAll(repo, 'feature base');
      const fcfg = loadConfig(feat);
      fcfg.reconcileState = { baseRef: head, method: 'git', status: 'resolved', lastRun: new Date().toISOString() };
      saveConfig(feat, fcfg);

      // The feature's own handoff commit — repo-relative `aitri/features/f1/…`
      fs.writeFileSync(path.join(feat, 'spec', '04_TEST_RESULTS.json'), '{"summary":{"total":1}}');
      commitAll(repo, 'feature handoff');
      assert.match(cli(feat, 'reconcile'), /No code changes detected outside pipeline/,
        'a feature\'s own artifacts must not read as off-pipeline drift in its own scope');
    } finally { cleanup(repo); }
  });
});

// ── Regression parity: the frames already agreed at the repo root ──────────────

describe('reconcile path frame — repo root (parity: behavior must not change)', () => {
  it('project == repo root: Aitri writes ignored, code counted, path unchanged', () => {
    const repo = tmpDir();
    try {
      initGit(repo);
      seedProject(repo, repo);
      assert.equal(gitShowPrefix(repo), '', 'precondition: frames agree');

      fs.writeFileSync(path.join(repo, 'aitri/product/spec/04_TEST_RESULTS.json'), '{"summary":{"total":1}}');
      commitAll(repo, 'aitri writes');
      assert.equal(uncounted(repo), 0);

      fs.writeFileSync(path.join(repo, 'src', 'mig.js'), 'export const v = 3;\n');
      commitAll(repo, 'code');
      assert.equal(uncounted(repo), 1);
      assert.deepEqual(
        (cli(repo, 'reconcile').match(/^- .*$/m) || [])[0], '- src/mig.js');
    } finally { cleanup(repo); }
  });
});

// ── Helper-level pins (lib/git-frame.js is the SSoT) ───────────────────────────

describe('isBehavioralInFrame() / toPipelinePath()', () => {
  const cfg = { artifactsDir: 'aitri/product/spec', layoutRoot: 'aitri' };

  it('re-frames in-subtree paths before filtering', () => {
    assert.equal(isBehavioralInFrame('app/.aitri', 'app/', cfg, null), false);
    assert.equal(isBehavioralInFrame('app/aitri/product/spec/04_TEST_RESULTS.json', 'app/', cfg, null), false);
    assert.equal(isBehavioralInFrame('app/src/mig.js', 'app/', cfg, null), true);
  });

  it('keeps the repo-root case byte-identical to the raw filters', () => {
    assert.equal(isBehavioralInFrame('.aitri', '', cfg, null), false);
    assert.equal(isBehavioralInFrame('aitri/product/spec/x.json', '', cfg, null), false);
    assert.equal(isBehavioralInFrame('src/mig.js', '', cfg, null), true);
  });

  it('out-of-subtree paths stay conservative (code still counts) and are pathspec-anchored', () => {
    assert.equal(isBehavioralInFrame('other/lib.js', 'app/', cfg, null), true);
    assert.equal(toPipelinePath('other/lib.js', 'app/'), ':/other/lib.js');
    assert.equal(toPipelinePath('app/src/mig.js', 'app/'), 'src/mig.js');
    assert.equal(toPipelinePath('src/mig.js', ''), 'src/mig.js');
  });
});

// ── bug.files_changed shares the frame (adversarial D3) ────────────────────────

describe('bug close — files_changed trail is frame-aware', () => {
  it('a subdir project never lists its own .aitri/artifacts in the bug trail', async () => {
    const { gitDiffNames, isAitriStateInFrame, toPipelinePath } = await import('../lib/git-frame.js');
    const repo = tmpDir();
    try {
      initGit(repo);
      const proj = path.join(repo, 'app');
      fs.mkdirSync(proj, { recursive: true });
      const base = seedProject(repo, proj);
      fs.writeFileSync(path.join(proj, 'src', 'mig.js'), 'export const v = 2;\n');
      fs.writeFileSync(path.join(proj, 'NOTES.md'), 'docs stay in a bug trail\n');
      const head = commitAll(repo, 'fix + docs');
      const cfg = loadConfig(proj); cfg.approvedPhases = [1, 2, 3, 4, 'ux']; saveConfig(proj, cfg);   // a SHARED .aitri write
      const head2 = commitAll(repo, 'aitri state');
      const prefix = 'app/';
      const trail = gitDiffNames(proj, `${base}..${head2}`)
        .filter(f => !isAitriStateInFrame(f, prefix, loadConfig(proj)))
        .map(f => toPipelinePath(f, prefix));
      assert.deepEqual(trail.sort(), ['NOTES.md', 'src/mig.js'],
        'docs are kept (trail, not gate); Aitri state is dropped; paths are pipeline-relative');
      assert.ok(head && head2);
    } finally { cleanup(repo); }
  });
});
