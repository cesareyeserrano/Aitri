/**
 * Tests for M1 (MULTI-TEAM-0722 / ADR-085, 2.2.0-rc.7) — the verify verdict binds to
 * the code tree it certified.
 *
 * `verify-run` stamps `verifyRanRef` (HEAD) + `verifyRanDirty` (uncommitted behavioral
 * files) as SHARED fields; the snapshot derives `verify.refState`; `stale`/`unreachable`
 * block deployable (reasons `verify_stale_ref`/`verify_ref_unreachable`) and emit a
 * P5 verify-run rung. `unbound` (non-git / pre-M1) degrades to pre-M1 behavior —
 * pinned here so the degradation can never silently become a block.
 *
 * The reproduced defect this closes (study `_multi-team-study-0804.md` R3): a merged,
 * never-verified tree read "deployable Ready" because `verifyPassed` is sticky and the
 * per-machine reconcile baseline auto-stamps at merged HEAD on fresh checkouts.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import path   from 'node:path';
import os     from 'node:os';
import { execFileSync } from 'node:child_process';

import { saveConfig, loadConfig } from '../lib/state.js';
import { buildProjectSnapshot, captureVerifyRef, verifyRefFreshness, verifyRefRootCtx } from '../lib/snapshot.js';
import { cmdVerifyRun } from '../lib/commands/verify.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-verify-ref-test-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
}
function initGit(dir) {
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t.co');
  git(dir, 'config', 'user.name', 'T');
  // A globally enabled commit signing would break every fixture commit (including the ones a
  // spawned runner makes mid-verify) with a misleading assertion — the same guard the
  // snapshot and reconcile suites use.
  git(dir, 'config', 'commit.gpgsign', 'false');
}
function commitAll(dir, msg) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', msg);
  return git(dir, 'rev-parse', 'HEAD');
}

/** All-approved, verify-passed root with artifacts on disk (deployable-shaped). */
function seedVerifiedRoot(dir, overrides = {}) {
  fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  const w = (f, c) => fs.writeFileSync(path.join(dir, 'spec', f), c);
  w('01_REQUIREMENTS.json', JSON.stringify({
    project_name: 'm1', functional_requirements: [{ id: 'FR-001', priority: 'MUST', title: 't', acceptance_criteria: ['AC'] }],
    non_functional_requirements: [], user_stories: [],
  }));
  w('02_SYSTEM_DESIGN.md', '# Design\n\nx\ny\n');
  w('03_TEST_CASES.json', JSON.stringify({ test_cases: [] }));
  w('04_BUILD_REPORT.json', JSON.stringify({ files_created: ['lib/a.js'] }));
  w('04_TEST_RESULTS.json', JSON.stringify({
    summary: { passed: 1, failed: 0, skipped: 0, total: 1 },
    fr_coverage: [{ fr_id: 'FR-001', status: 'covered', tests_passing: 1, tests_failing: 0 }],
  }));
  w('05_TRACEABILITY.json', JSON.stringify({ requirement_compliance: [] }));
  fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Idea\n');
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'lib', 'a.js'), '// a\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.aitri.local\n');
  saveConfig(dir, {
    projectName: 'm1', aitriVersion: '2.2.0-rc.7', artifactsDir: 'spec',
    approvedPhases: [1, 2, 3, 4, 5], completedPhases: [1, 2, 3, 4, 5],
    verifyPassed: true, verifySummary: { passed: 1, failed: 0, skipped: 0, total: 1 },
    ...overrides,
  });
}

describe('captureVerifyRef()', () => {
  it('clean git tree → { ref: HEAD, dirty: false }', () => {
    const dir = tmpDir();
    try {
      initGit(dir);
      fs.writeFileSync(path.join(dir, 'a.js'), '// a\n');
      const head = commitAll(dir, 'base');
      const stamp = captureVerifyRef(dir, {});
      assert.deepEqual(stamp, { ref: head, dirty: false });
    } finally { cleanup(dir); }
  });

  it('uncommitted BEHAVIORAL change → dirty: true; docs-only dirt → dirty: false', () => {
    const dir = tmpDir();
    try {
      initGit(dir);
      fs.writeFileSync(path.join(dir, 'a.js'), '// a\n');
      commitAll(dir, 'base');
      fs.writeFileSync(path.join(dir, 'NOTES.md'), 'docs churn\n');   // non-behavioral
      assert.equal(captureVerifyRef(dir, {}).dirty, false);
      fs.writeFileSync(path.join(dir, 'a.js'), '// changed\n');        // behavioral
      assert.equal(captureVerifyRef(dir, {}).dirty, true);
    } finally { cleanup(dir); }
  });

  it('a working tree whose porcelain output exceeds 1 MiB still stamps (no silent ENOBUFS → lost binding)', () => {
    const dir = tmpDir();
    try {
      initGit(dir);
      fs.writeFileSync(path.join(dir, 'a.js'), '// a\n');
      const head = commitAll(dir, 'base');
      // ~8000 untracked, non-ignored files under a long dir name ≈ 1.3 MiB of `status -z`
      // output — past Node's execFileSync default buffer (a leftover report/coverage tree).
      const big = path.join(dir, 'r'.repeat(150));
      fs.mkdirSync(big);
      for (let i = 0; i < 8000; i++) fs.writeFileSync(path.join(big, `f${i}.js`), '');
      const stamp = captureVerifyRef(dir, {});
      assert.ok(stamp, 'a large untracked tree must not make the stamp read fail');
      assert.equal(stamp.ref, head);
      assert.equal(stamp.dirty, true);
    } finally { cleanup(dir); }
  });

  it('non-git dir → null (no stamp — degradation, never an error)', () => {
    const dir = tmpDir();
    try {
      assert.equal(captureVerifyRef(dir, {}), null);
    } finally { cleanup(dir); }
  });
});

describe('verifyRefFreshness()', () => {
  it('no stamp → unbound (no git calls); stamped ref in a non-git dir → unreachable (refuse-not-pass)', () => {
    const dir = tmpDir();
    try {
      assert.equal(verifyRefFreshness(dir, {}), 'unbound');
      assert.equal(verifyRefFreshness(dir, { verifyRanRef: 'a'.repeat(40), verifyRanDirty: true }), 'unreachable');
    } finally { cleanup(dir); }
  });

  it('ref == HEAD → fresh; docs-only commit after → still fresh; behavioral commit after → stale', () => {
    const dir = tmpDir();
    try {
      initGit(dir);
      fs.writeFileSync(path.join(dir, 'a.js'), '// a\n');
      const ref = commitAll(dir, 'base');
      assert.equal(verifyRefFreshness(dir, { verifyRanRef: ref }), 'fresh');
      fs.writeFileSync(path.join(dir, 'NOTES.md'), 'docs\n');
      commitAll(dir, 'docs only');
      assert.equal(verifyRefFreshness(dir, { verifyRanRef: ref }), 'fresh', 'docs-only commits must not stale the verdict');
      fs.writeFileSync(path.join(dir, 'a.js'), '// changed\n');
      commitAll(dir, 'behavioral');
      assert.equal(verifyRefFreshness(dir, { verifyRanRef: ref }), 'stale');
    } finally { cleanup(dir); }
  });

  it('dirty stamp + later BEHAVIORAL commit → stale, not dirty (dirty must not ride forever)', () => {
    const dir = tmpDir();
    try {
      initGit(dir);
      fs.writeFileSync(path.join(dir, 'a.js'), '// a\n');
      const ref = commitAll(dir, 'base');
      // Dirty stamp while HEAD == ref → dirty (warn-class)
      assert.equal(verifyRefFreshness(dir, { verifyRanRef: ref, verifyRanDirty: true }), 'dirty');
      // Behavioral commit after the stamp → the diff outranks the dirty flag
      fs.writeFileSync(path.join(dir, 'a.js'), '// moved on\n');
      commitAll(dir, 'behavioral after dirty stamp');
      assert.equal(verifyRefFreshness(dir, { verifyRanRef: ref, verifyRanDirty: true }), 'stale',
        'a dirty verdict with behavioral commits since must go stale (deploy-blocking), never stay warn-only');
    } finally { cleanup(dir); }
  });

  it('unreachable SHA → unreachable (refuse-not-pass, never fresh)', () => {
    const dir = tmpDir();
    try {
      initGit(dir);
      fs.writeFileSync(path.join(dir, 'a.js'), '// a\n');
      commitAll(dir, 'base');
      assert.equal(verifyRefFreshness(dir, { verifyRanRef: 'deadbeef'.repeat(5) }), 'unreachable');
    } finally { cleanup(dir); }
  });
});

describe('deploy gate + ladder (integration through buildProjectSnapshot)', () => {
  it('R3 closed: merged/post-verify behavioral commit → deployable BLOCKED with verify_stale_ref + P5 verify-run rung', () => {
    const dir = tmpDir();
    try {
      initGit(dir);
      seedVerifiedRoot(dir);
      const ref = commitAll(dir, 'verified state');
      const cfg = loadConfig(dir);
      cfg.verifyRanRef = ref; cfg.verifyRanDirty = false;
      saveConfig(dir, cfg);
      commitAll(dir, 'stamp');
      // Simulate the merge window: behavioral code lands with no new verify run
      fs.writeFileSync(path.join(dir, 'lib', 'merged.js'), '// merged, never verified\n');
      commitAll(dir, 'merge window');

      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.pipelines.find(p => p.scopeType === 'root').verify.refState, 'stale');
      assert.equal(snap.health.deployable, false);
      assert.ok(snap.health.deployableReasons.some(r => r.type === 'verify_stale_ref'));
      const rung = snap.nextActions.find(a => a.command === 'aitri verify-run' && a.priority === 5);
      assert.ok(rung, 'a P5 verify-run rung must route the exit');
    } finally { cleanup(dir); }
  });

  it('unreachable ref → deployable BLOCKED with verify_ref_unreachable', () => {
    const dir = tmpDir();
    try {
      initGit(dir);
      seedVerifiedRoot(dir, { verifyRanRef: 'deadbeef'.repeat(5), verifyRanDirty: false });
      commitAll(dir, 'base');
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.health.deployable, false);
      assert.ok(snap.health.deployableReasons.some(r => r.type === 'verify_ref_unreachable'));
    } finally { cleanup(dir); }
  });

  it('DEGRADATION PIN: no stamp (pre-M1 / non-git) → deployable stays Ready, no new reasons', () => {
    const dir = tmpDir();
    try {
      initGit(dir);
      seedVerifiedRoot(dir);              // no verifyRanRef
      commitAll(dir, 'base');
      fs.writeFileSync(path.join(dir, 'lib', 'later.js'), '// post-verify code\n');
      commitAll(dir, 'later');
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.pipelines.find(p => p.scopeType === 'root').verify.refState, 'unbound');
      assert.equal(snap.health.deployable, true,
        'unbound must degrade to pre-M1 behavior, never block');
      assert.ok(!snap.health.deployableReasons.some(r => String(r.type).startsWith('verify_')));
    } finally { cleanup(dir); }
  });

  it('fresh ref → deployable Ready (the linear commit-then-verify flow pays nothing)', () => {
    const dir = tmpDir();
    try {
      initGit(dir);
      seedVerifiedRoot(dir);
      const ref = commitAll(dir, 'verified state');
      const cfg = loadConfig(dir);
      cfg.verifyRanRef = ref; cfg.verifyRanDirty = false;
      saveConfig(dir, cfg);
      // .aitri changes are state, not behavioral — freshness must ignore them
      commitAll(dir, 'stamp commit');
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.pipelines.find(p => p.scopeType === 'root').verify.refState, 'fresh');
      assert.equal(snap.health.deployable, true);
    } finally { cleanup(dir); }
  });

  it('dirty stamp → warn-class only: refState dirty, deployable NOT blocked by it', () => {
    const dir = tmpDir();
    try {
      initGit(dir);
      seedVerifiedRoot(dir);
      const ref = commitAll(dir, 'base');
      const cfg = loadConfig(dir);
      cfg.verifyRanRef = ref; cfg.verifyRanDirty = true;
      saveConfig(dir, cfg);
      commitAll(dir, 'stamp');
      const snap = buildProjectSnapshot(dir);
      assert.equal(snap.pipelines.find(p => p.scopeType === 'root').verify.refState, 'dirty');
      assert.ok(!snap.health.deployableReasons.some(r => String(r.type).startsWith('verify_stale')));
    } finally { cleanup(dir); }
  });
});

describe('path-frame normalization (rc.7 adversarial BLOCKER — contained layout + monorepo)', () => {
  it('CONTAINED-LAYOUT FEATURE: own spec artifacts are state, not behavioral — no dirty stamp, no stale after the handoff commit', () => {
    const repo = tmpDir();
    try {
      initGit(repo);
      // Root project at repo root, contained layout (the DEFAULT init.js layout)
      fs.writeFileSync(path.join(repo, '.gitignore'), '.aitri.local\n');
      saveConfig(repo, {
        projectName: 'mt', artifactsDir: 'aitri/spec', layoutRoot: 'aitri',
        approvedPhases: [1], completedPhases: [1],
      });
      const featDir = path.join(repo, 'aitri', 'features', 'f1');
      fs.mkdirSync(path.join(featDir, 'spec'), { recursive: true });
      saveConfig(featDir, { projectName: 'f1', artifactsDir: 'spec', approvedPhases: [1] });
      fs.writeFileSync(path.join(repo, 'lib.js'), '// root code\n');
      const rootCtx = verifyRefRootCtx(repo, loadConfig(repo));
      commitAll(repo, 'base');

      // verify-run writes the feature's results file BEFORE stamping — git sees
      // `aitri/features/f1/spec/04_TEST_RESULTS.json` (repo-relative). Without frame
      // normalization this classified behavioral → dirty on EVERY feature verify-run.
      fs.writeFileSync(path.join(featDir, 'spec', '04_TEST_RESULTS.json'), '{"summary":{}}');
      const stamp = captureVerifyRef(featDir, loadConfig(featDir), rootCtx);
      assert.equal(stamp.dirty, false,
        'a feature\'s own spec artifacts must never make its verify stamp dirty');

      // Commit the artifacts (the git-mediated team handoff) → must stay fresh, not
      // livelock into permanent stale.
      const cfg = loadConfig(featDir);
      cfg.verifyRanRef = stamp.ref; cfg.verifyRanDirty = false;
      saveConfig(featDir, cfg);
      commitAll(repo, 'handoff: feature artifacts + state');
      assert.equal(verifyRefFreshness(featDir, loadConfig(featDir), rootCtx), 'fresh',
      'committing the feature\'s own artifacts must not stale its verdict');

      // Root CODE change is still visible from the feature frame (no --relative blindness)
      fs.writeFileSync(path.join(repo, 'lib.js'), '// root code changed\n');
      commitAll(repo, 'root behavioral change');
      assert.equal(verifyRefFreshness(featDir, loadConfig(featDir), rootCtx), 'stale',
        'parent behavioral code changes must stale the feature verdict');
    } finally { cleanup(repo); }
  });

  it('MONOREPO ROOT: project in a repo subdir — spec commits stay fresh, code commits go stale', () => {
    const repo = tmpDir();
    try {
      initGit(repo);
      const proj = path.join(repo, 'app');
      fs.mkdirSync(path.join(proj, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(repo, '.gitignore'), '.aitri.local\n');
      saveConfig(proj, { projectName: 'app', artifactsDir: 'spec', approvedPhases: [1] });
      fs.writeFileSync(path.join(proj, 'a.js'), '// code\n');
      const ref = commitAll(repo, 'base');

      // Uncommitted spec artifact (git path: app/spec/x.json) → state, not dirty
      fs.writeFileSync(path.join(proj, 'spec', '04_TEST_RESULTS.json'), '{}');
      assert.equal(captureVerifyRef(proj, loadConfig(proj)).dirty, false);

      commitAll(repo, 'spec commit');
      assert.equal(verifyRefFreshness(proj, { verifyRanRef: ref }), 'fresh',
        'artifact-only commits must not stale a monorepo root verdict');

      fs.writeFileSync(path.join(proj, 'a.js'), '// changed\n');
      commitAll(repo, 'code commit');
      assert.equal(verifyRefFreshness(proj, { verifyRanRef: ref }), 'stale');
    } finally { cleanup(repo); }
  });
});

// VERIFY-REF-PRERUN-0911 (ADR-085 Addendum 2): the stamp used to be read AFTER the runner,
// the e2e auto-run and the gates — minutes later on a real suite. A commit landing in that
// window became `verifyRanRef` although nothing ran against it, and freshness read `fresh`.
// These pins run the real command with a runner that mutates git WHILE verify-run is running.
describe('verify-run binds the verdict to the commit the run STARTED on (VERIFY-REF-PRERUN-0911)', () => {
  function seedRunProject(dir, runnerBody) {
    initGit(dir);
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.gitignore'), '.aitri.local\n');
    fs.writeFileSync(path.join(dir, 'lib', 'a.js'), '// a\n');
    fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-001', title: 'r', priority: 'MUST' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), JSON.stringify({
      test_cases: [{ id: 'TC-001h', title: 'unit', requirement_id: 'FR-001', type: 'unit', expected_result: 'r', automation: 'automated' }],
    }));
    fs.writeFileSync(path.join(dir, 'spec', '04_BUILD_REPORT.json'), JSON.stringify({
      files_created: ['lib/a.js'], technical_debt: [], test_runner: 'node runner.cjs', test_files: ['runner.cjs'],
    }));
    // The runner does its git mutation mid-dispatch, then prints a parseable pass.
    fs.writeFileSync(path.join(dir, 'runner.cjs'),
      `const { execFileSync } = require('child_process');\nconst fs = require('fs');\n${runnerBody}\nconsole.log('\\u2714 TC-001h unit');\n`);
    saveConfig(dir, { projectName: 'p', artifactsDir: 'spec', approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4] });
    return commitAll(dir, 'base');
  }

  function runVerify(dir) {
    let errMsg = null, stderr = '';
    const origLog = console.log, origErr = process.stderr.write;
    console.log = () => {};
    process.stderr.write = (s) => { stderr += String(s); return true; };
    try {
      cmdVerifyRun({ dir, args: [], flagValue: () => null, err: (m) => { errMsg = m; throw new Error(m); } });
    } catch (e) {
      if (errMsg === null) throw e;
    } finally {
      console.log = origLog; process.stderr.write = origErr;
    }
    assert.equal(errMsg, null, `verify-run must complete — got: ${errMsg}`);
    return stderr;
  }

  it('a behavioral commit made WHILE verify-run runs → the stamp is the start commit, the verdict reads stale, the move is announced', () => {
    const dir = tmpDir();
    try {
      const start = seedRunProject(dir,
        `fs.writeFileSync('lib/late.js', '// committed while verify-run was running');\n` +
        `execFileSync('git', ['add', '-A']);\nexecFileSync('git', ['commit', '-qm', 'mid-run']);`);
      const stderr = runVerify(dir);
      assert.notEqual(git(dir, 'rev-parse', 'HEAD'), start, 'fixture: the runner must have moved HEAD');
      const cfg = loadConfig(dir);
      assert.equal(cfg.verifyRanRef, start,
        'the verdict must bind to the commit the dispatches started from, never to a commit made mid-run');
      assert.equal(verifyRefFreshness(dir, cfg), 'stale',
        'code committed mid-run was never tested — the verdict must not read fresh');
      assert.match(stderr, /HEAD moved while verify-run was running/);
    } finally { cleanup(dir); }
  });

  it('code uncommitted at START and reverted mid-run → dirty (the tests may have seen it), bound to the start commit', () => {
    const dir = tmpDir();
    try {
      const start = seedRunProject(dir, `execFileSync('git', ['checkout', '--', 'lib/a.js']);`);
      fs.writeFileSync(path.join(dir, 'lib', 'a.js'), '// uncommitted when the run starts\n');
      const stderr = runVerify(dir);
      assert.equal(git(dir, 'status', '--porcelain', '--', 'lib'), '', 'fixture: the runner must have reverted the change');
      const cfg = loadConfig(dir);
      assert.equal(cfg.verifyRanRef, start);
      assert.equal(cfg.verifyRanDirty, true,
        'a tree dirty when the run started must stamp dirty even if it is clean when the run ends');
      assert.equal(verifyRefFreshness(dir, cfg), 'dirty');
      assert.doesNotMatch(stderr, /HEAD moved/);
    } finally { cleanup(dir); }
  });

  it('git unreadable at the END of the run → bound to the start commit, dirty, with its own message (not "uncommitted")', () => {
    const dir = tmpDir();
    try {
      const start = seedRunProject(dir, `fs.renameSync('.git', '.git-away');`);
      const stderr = runVerify(dir);
      fs.renameSync(path.join(dir, '.git-away'), path.join(dir, '.git'));
      const cfg = loadConfig(dir);
      assert.equal(cfg.verifyRanRef, start);
      assert.equal(cfg.verifyRanDirty, true, 'an unreadable end state is unknown, and unknown is not clean');
      assert.match(stderr, /Could not read the git state at the end of this run/);
      assert.doesNotMatch(stderr, /UNCOMMITTED/, 'an unreadable tree must not be reported as uncommitted changes');
    } finally { cleanup(dir); }
  });

  it('git unreadable at the START of the run → still bound (to the end commit) as dirty, never silently unbound', () => {
    const dir = tmpDir();
    try {
      const start = seedRunProject(dir, `fs.renameSync('.git-away', '.git');`);
      fs.renameSync(path.join(dir, '.git'), path.join(dir, '.git-away'));
      const stderr = runVerify(dir);
      const cfg = loadConfig(dir);
      assert.equal(cfg.verifyRanRef, start);
      assert.equal(cfg.verifyRanDirty, true);
      assert.equal(verifyRefFreshness(dir, cfg), 'dirty');
      assert.match(stderr, /Could not read the git state at the start of this run/);
    } finally { cleanup(dir); }
  });

  it('control: nothing changes during the run → ref = HEAD, clean, fresh, no move warning', () => {
    const dir = tmpDir();
    try {
      const start = seedRunProject(dir, '');
      const stderr = runVerify(dir);
      const cfg = loadConfig(dir);
      assert.equal(cfg.verifyRanRef, start);
      assert.equal(cfg.verifyRanDirty, false);
      assert.equal(verifyRefFreshness(dir, cfg), 'fresh');
      assert.doesNotMatch(stderr, /HEAD moved/);
    } finally { cleanup(dir); }
  });
});
