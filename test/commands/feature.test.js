/**
 * Tests: aitri feature — sub-pipeline management
 * Covers: init, list, delegation to existing commands, parent context injection
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdFeature, featureDiscard, collectBuiltFiles } from '../../lib/commands/feature.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROOT_DIR = path.resolve(process.cwd());

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-feature-'));
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

function makeErr() {
  const thrown = [];
  return {
    fn: (msg) => { thrown.push(msg); throw new Error(msg); },
    thrown,
  };
}

function makeProjectDir() {
  const dir = tmpDir();
  // Minimal .aitri config so feature commands can find the project
  writeFile(dir, '.aitri', JSON.stringify({
    projectName: 'TestProject',
    artifactsDir: 'spec',
    approvedPhases: [],
    completedPhases: [],
    currentPhase: 0,
  }));
  fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  return dir;
}

// ── feature init ──────────────────────────────────────────────────────────────

describe('aitri feature init', () => {
  let dir;

  before(() => { dir = makeProjectDir(); });
  after(()  => fs.rmSync(dir, { recursive: true, force: true }));

  it('creates features/<name>/ directory', () => {
    const { fn: err } = makeErr();
    captureStdout(() => cmdFeature({ dir, args: ['init', 'add-export'], err, rootDir: ROOT_DIR }));
    assert.ok(fs.existsSync(path.join(dir, 'features', 'add-export')), 'feature dir must exist');
  });

  it('creates FEATURE_IDEA.md from template', () => {
    const ideaPath = path.join(dir, 'features', 'add-export', 'FEATURE_IDEA.md');
    assert.ok(fs.existsSync(ideaPath), 'FEATURE_IDEA.md must be created');
    const content = fs.readFileSync(ideaPath, 'utf8');
    assert.ok(content.includes('## Feature'), 'FEATURE_IDEA.md must have ## Feature section');
  });

  it('creates spec/ subdirectory inside feature dir', () => {
    assert.ok(
      fs.existsSync(path.join(dir, 'features', 'add-export', 'spec')),
      'feature spec/ must be created'
    );
  });

  it('creates feature_context/ folder with a README (rc.37)', () => {
    const ctx = path.join(dir, 'features', 'add-export', 'feature_context');
    assert.ok(fs.existsSync(ctx), 'feature_context/ must be created');
    assert.ok(fs.existsSync(path.join(ctx, 'README.md')), 'feature_context/README.md must exist');
  });

  it('creates .aitri state file with artifactsDir: "spec"', () => {
    const statePath = path.join(dir, 'features', 'add-export', '.aitri');
    assert.ok(fs.existsSync(statePath), '.aitri must be created in feature dir');
    const config = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(config.artifactsDir, 'spec', 'feature state must use spec/ artifacts dir');
    assert.equal(config.projectName, 'add-export', 'feature state must record feature name');
  });

  it('applies the .aitri split per-feature: shared .aitri + per-machine .aitri.local (ADR-045)', () => {
    // The split is dir-agnostic (loadConfig/saveConfig operate on any dir), so a feature
    // sub-pipeline gets the same layout as the root: a committed .aitri + a gitignored
    // .aitri.local. The root .gitignore pattern `.aitri.local` (no slash) covers it at
    // any depth — verified by smoke; this locks the file-creation half permanently.
    const featDir = path.join(dir, 'features', 'add-export');
    assert.ok(fs.existsSync(path.join(featDir, '.aitri.local')), 'feature .aitri.local must exist (split applied)');
    const shared = JSON.parse(fs.readFileSync(path.join(featDir, '.aitri'), 'utf8'));
    assert.ok(!('lastSession' in shared) && !('reconcileState' in shared),
      'per-machine fields must NOT be in the committed feature .aitri');
  });

  it('prints confirmation with run-phase and status instructions', () => {
    const out = captureStdout(() => {
      const { fn: err } = makeErr();
      cmdFeature({ dir, args: ['init', 'another-feature'], err, rootDir: ROOT_DIR });
    });
    assert.ok(out.includes('another-feature'), 'output must mention feature name');
    assert.ok(out.includes('run-phase'), 'output must mention run-phase');
  });

  it('errors if feature already exists', () => {
    const { fn: err } = makeErr();
    assert.throws(
      () => cmdFeature({ dir, args: ['init', 'add-export'], err, rootDir: ROOT_DIR }),
      /already exists/
    );
  });

  it('errors if no .aitri project in dir', () => {
    const emptyDir = tmpDir();
    try {
      const { fn: err } = makeErr();
      assert.throws(
        () => cmdFeature({ dir: emptyDir, args: ['init', 'my-feat'], err, rootDir: ROOT_DIR }),
        /No Aitri project/
      );
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

// ── feature list ──────────────────────────────────────────────────────────────

describe('aitri feature list', () => {
  it('prints "no features" when features/ dir does not exist', () => {
    const dir = makeProjectDir();
    try {
      const out = captureStdout(() => {
        const { fn: err } = makeErr();
        cmdFeature({ dir, args: ['list'], err, rootDir: ROOT_DIR });
      });
      assert.ok(out.includes('No features'), 'must print "No features" message');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists initialized features with phase state', () => {
    const dir = makeProjectDir();
    try {
      const { fn: err } = makeErr();
      captureStdout(() => cmdFeature({ dir, args: ['init', 'feat-a'], err, rootDir: ROOT_DIR }));
      captureStdout(() => cmdFeature({ dir, args: ['init', 'feat-b'], err, rootDir: ROOT_DIR }));

      const out = captureStdout(() => {
        const { fn: err2 } = makeErr();
        cmdFeature({ dir, args: ['list'], err: err2, rootDir: ROOT_DIR });
      });
      assert.ok(out.includes('feat-a'), 'feat-a must appear in list');
      assert.ok(out.includes('feat-b'), 'feat-b must appear in list');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // Ultron canary 2026-04-27 surfaced the silent "No features yet" message
  // when the agent ran `aitri feature list` from a sub-directory of the
  // project. The agent reasonably believed features were lost. The fix:
  // walk parents, name the actual project root.
  it('names project root when invoked from a sub-directory of an Aitri project', () => {
    const dir = makeProjectDir();
    try {
      const { fn: err } = makeErr();
      captureStdout(() => cmdFeature({ dir, args: ['init', 'feat-x'], err, rootDir: ROOT_DIR }));
      // Pretend cwd is a deep sub-dir of the project (no .aitri here, no features/)
      const subDir = path.join(dir, 'spec');

      const out = captureStdout(() => {
        const { fn: err2 } = makeErr();
        cmdFeature({ dir: subDir, args: ['list'], err: err2, rootDir: ROOT_DIR });
      });
      assert.ok(out.includes('cwd is not the project root'),
        'must explain why the cwd-only lookup failed (got: ' + out + ')');
      assert.ok(out.includes(dir),
        'must name the discovered project root (got: ' + out + ')');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps "No features yet" message when no ancestor is an Aitri project', () => {
    const standalone = tmpDir(); // no .aitri anywhere up the tree
    try {
      const out = captureStdout(() => {
        const { fn: err } = makeErr();
        cmdFeature({ dir: standalone, args: ['list'], err, rootDir: ROOT_DIR });
      });
      assert.ok(out.includes('No features yet'),
        'must print original message when no project root is found upward');
      assert.ok(!out.includes('cwd is not the project root'),
        'must NOT print the project-root hint outside an Aitri project');
    } finally {
      fs.rmSync(standalone, { recursive: true, force: true });
    }
  });
});

// ── feature discard (FEAT-DISCARD-0624) ────────────────────────────────────────

function withTTY(value, fn) {
  const orig = process.stdin.isTTY;
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
  try { return fn(); } finally {
    Object.defineProperty(process.stdin, 'isTTY', { value: orig, configurable: true });
  }
}

function withExit(fn) {
  const orig = process.exit;
  let code = null;
  process.exit = (c) => { code = c; throw new Error('__exit__'); };
  try { fn(); } catch (e) { if (e.message !== '__exit__') throw e; } finally { process.exit = orig; }
  return code;
}

describe('aitri feature discard — collectBuiltFiles (the surface)', () => {
  it('returns null when no build report exists (Phase <4)', () => {
    const dir = makeProjectDir();
    try {
      captureStdout(() => cmdFeature({ dir, args: ['init', 'feat'], err: makeErr().fn, rootDir: ROOT_DIR }));
      assert.equal(collectBuiltFiles(path.join(dir, 'features', 'feat'), 'spec'), null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('returns null when the build report names no files', () => {
    const dir = makeProjectDir();
    try {
      captureStdout(() => cmdFeature({ dir, args: ['init', 'feat'], err: makeErr().fn, rootDir: ROOT_DIR }));
      writeFile(dir, 'features/feat/spec/04_BUILD_REPORT.json',
        JSON.stringify({ files_created: [], files_modified: [], test_files: [] }));
      assert.equal(collectBuiltFiles(path.join(dir, 'features', 'feat'), 'spec'), null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('returns the created/modified/test files when the report lists them', () => {
    const dir = makeProjectDir();
    try {
      captureStdout(() => cmdFeature({ dir, args: ['init', 'feat'], err: makeErr().fn, rootDir: ROOT_DIR }));
      writeFile(dir, 'features/feat/spec/04_BUILD_REPORT.json', JSON.stringify({
        files_created:  ['lib/new.js'],
        files_modified: ['lib/existing.js'],
        test_files:     ['test/new.test.js'],
      }));
      const built = collectBuiltFiles(path.join(dir, 'features', 'feat'), 'spec');
      assert.deepEqual(built, {
        created:  ['lib/new.js'],
        modified: ['lib/existing.js'],
        tests:    ['test/new.test.js'],
      });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('returns null (never crashes) on a malformed build report', () => {
    const dir = makeProjectDir();
    try {
      captureStdout(() => cmdFeature({ dir, args: ['init', 'feat'], err: makeErr().fn, rootDir: ROOT_DIR }));
      writeFile(dir, 'features/feat/spec/04_BUILD_REPORT.json', '{not valid json');
      assert.equal(collectBuiltFiles(path.join(dir, 'features', 'feat'), 'spec'), null);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('aitri feature discard — behavior', () => {
  it('[gate] refuses non-interactively and leaves the feature dir intact', () => {
    const dir = makeProjectDir();
    try {
      captureStdout(() => cmdFeature({ dir, args: ['init', 'feat'], err: makeErr().fn, rootDir: ROOT_DIR }));
      const featurePath = path.join(dir, 'features', 'feat');
      const code = withTTY(false, () => withExit(() =>
        cmdFeature({ dir, args: ['discard', 'feat'], err: makeErr().fn, rootDir: ROOT_DIR })));
      assert.equal(code, 1, 'non-interactive discard must exit 1');
      assert.ok(fs.existsSync(featurePath), 'feature dir must survive a blocked discard');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('discard of a non-existent feature errors with the standard not-found message', () => {
    const dir = makeProjectDir();
    try {
      assert.throws(
        () => cmdFeature({ dir, args: ['discard', 'ghost'], err: makeErr().fn, rootDir: ROOT_DIR }),
        /not found/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('confirmed discard deletes the dir and it disappears from feature list', () => {
    const dir = makeProjectDir();
    try {
      // Name chosen NOT to be a substring of "features"/"feature" so the list
      // assertion below can't false-match the "No features yet" message.
      captureStdout(() => cmdFeature({ dir, args: ['init', 'zexport'], err: makeErr().fn, rootDir: ROOT_DIR }));
      const featurePath = path.join(dir, 'features', 'zexport');
      assert.ok(fs.existsSync(featurePath));
      withTTY(true, () => captureStdout(() =>
        featureDiscard(featurePath, 'zexport', dir, makeErr().fn, () => 'y')));
      assert.ok(!fs.existsSync(featurePath), 'feature dir must be deleted');
      const list = captureStdout(() => cmdFeature({ dir, args: ['list'], err: makeErr().fn, rootDir: ROOT_DIR }));
      assert.ok(!list.includes('zexport'), 'discarded feature must not appear in list');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('surfaces the shared files it built and does NOT delete those paths', () => {
    const dir = makeProjectDir();
    try {
      captureStdout(() => cmdFeature({ dir, args: ['init', 'feat'], err: makeErr().fn, rootDir: ROOT_DIR }));
      const featurePath = path.join(dir, 'features', 'feat');
      // A shared file the feature contributed, living OUTSIDE the feature dir.
      writeFile(dir, 'lib/shared.js', 'export const x = 1;');
      writeFile(dir, 'features/feat/spec/04_BUILD_REPORT.json',
        JSON.stringify({ files_created: ['lib/shared.js'], files_modified: [], test_files: [] }));
      const out = withTTY(true, () => captureStdout(() =>
        featureDiscard(featurePath, 'feat', dir, makeErr().fn, () => 'y')));
      assert.ok(out.includes('lib/shared.js'), 'output must name the shared file the feature built');
      assert.ok(out.includes('NOT removed'), 'output must warn the shared files are not removed');
      assert.ok(fs.existsSync(path.join(dir, 'lib', 'shared.js')), 'shared file must NOT be deleted by discard');
      assert.ok(!fs.existsSync(featurePath), 'feature dir is still deleted');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('[security] refuses a path-traversal name and deletes nothing outside the features dir', () => {
    const dir = makeProjectDir();
    try {
      // name ".." resolves featureDir to the project root itself. The guard must
      // refuse BEFORE rmSync, even with TTY + a "y" confirmation.
      const projectRoot = path.join(dir, 'features', '..'); // === dir
      assert.ok(fs.existsSync(dir));
      assert.throws(() => withTTY(true, () =>
        featureDiscard(projectRoot, '..', dir, makeErr().fn, () => 'y')),
        /Invalid feature name/);
      assert.ok(fs.existsSync(dir), 'project dir must survive a traversal attempt');
      assert.ok(fs.existsSync(path.join(dir, '.aitri')), 'project state must survive');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('[security] dispatch path: cmdFeature discard ".." is refused before any delete', () => {
    // Locks the guard/gate PLACEMENT inside cmdFeature's dispatch (the other
    // destructive tests call featureDiscard directly and would miss a regression
    // where the guard is moved or a pre-switch deletion is added). name ".."
    // resolves featureDir to the project root and passes the existsSync check, so
    // the dispatch reaches the discard case — the guard must still refuse.
    const dir = makeProjectDir();
    try {
      assert.throws(() => withTTY(true, () =>
        cmdFeature({ dir, args: ['discard', '..'], err: makeErr().fn, rootDir: ROOT_DIR })),
        /Invalid feature name/);
      assert.ok(fs.existsSync(path.join(dir, '.aitri')), 'project must survive a dispatch-level traversal attempt');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('AUDIT-0629-C: refuses a traversal name for STATE-MUTATING subcommands, not just discard', () => {
    // Before AUDIT-0629 the traversal guard lived only inside discard; `approve ..`/`complete ..`
    // resolved featureDir to the project root, passed existsSync, and WROTE the root .aitri. The
    // guard now sits at the shared resolution point, so every subcommand is refused before dispatch.
    const dir = makeProjectDir();
    try {
      const before = fs.readFileSync(path.join(dir, '.aitri'), 'utf8');
      for (const sub of ['approve', 'complete', 'reject', 'rehash', 'run-phase']) {
        assert.throws(
          () => cmdFeature({ dir, args: [sub, '..', '1'], err: makeErr().fn, rootDir: ROOT_DIR }),
          /Invalid feature name/, `${sub} ".." must be refused`);
      }
      assert.equal(fs.readFileSync(path.join(dir, '.aitri'), 'utf8'), before,
        'the root .aitri must be byte-identical — no subcommand wrote the wrong config');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('AUDIT-0629-C: refuses `feature init ../escape` — init cannot create a pipeline outside features/', () => {
    const dir = makeProjectDir();
    try {
      assert.throws(
        () => cmdFeature({ dir, args: ['init', '../escape'], err: makeErr().fn, rootDir: ROOT_DIR }),
        /Invalid feature name/);
      assert.ok(!fs.existsSync(path.join(dir, '..', 'escape')),
        'no pipeline dir created outside the project');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('cancelling at the prompt deletes nothing and exits 1', () => {
    const dir = makeProjectDir();
    try {
      captureStdout(() => cmdFeature({ dir, args: ['init', 'feat'], err: makeErr().fn, rootDir: ROOT_DIR }));
      const featurePath = path.join(dir, 'features', 'feat');
      const code = withTTY(true, () => withExit(() =>
        captureStdout(() => featureDiscard(featurePath, 'feat', dir, makeErr().fn, () => 'n'))));
      assert.equal(code, 1, 'cancelled discard exits 1');
      assert.ok(fs.existsSync(featurePath), 'feature dir must survive a cancelled discard');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── feature USAGE block ──────────────────────────────────────────────────────

describe('aitri feature — USAGE documents --cmd flag', () => {
  it('USAGE block mentions --cmd flag for verify-run', () => {
    // Reading the source file directly is the cheapest way to assert on USAGE
    // without reproducing the err-throw plumbing. The flag is wired via
    // cmdVerifyRun (verify.js:391), but the operator only finds it if the
    // sub-help documents it.
    const src = fs.readFileSync(
      path.join(ROOT_DIR, 'lib', 'commands', 'feature.js'),
      'utf8'
    );
    assert.ok(/feature verify-run.*--cmd/s.test(src),
      'USAGE block must document --cmd on the verify-run line');
  });
});

// ── feature error handling ────────────────────────────────────────────────────

describe('aitri feature — error handling', () => {
  it('errors when no sub-command is given', () => {
    const dir = makeProjectDir();
    try {
      const { fn: err } = makeErr();
      assert.throws(
        () => cmdFeature({ dir, args: [], err, rootDir: ROOT_DIR }),
        /Usage/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('errors when feature name is missing for non-list sub-commands', () => {
    const dir = makeProjectDir();
    try {
      const { fn: err } = makeErr();
      assert.throws(
        () => cmdFeature({ dir, args: ['status'], err, rootDir: ROOT_DIR }),
        /Usage/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('errors on unknown sub-command', () => {
    const dir = makeProjectDir();
    try {
      const { fn: err } = makeErr();
      // First init a feature so the dir exists
      captureStdout(() => cmdFeature({ dir, args: ['init', 'my-feat'], err, rootDir: ROOT_DIR }));
      const { fn: err2 } = makeErr();
      assert.throws(
        () => cmdFeature({ dir, args: ['frobinate', 'my-feat'], err: err2, rootDir: ROOT_DIR }),
        /Unknown feature sub-command/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('errors when feature dir does not exist for run-phase', () => {
    const dir = makeProjectDir();
    try {
      const { fn: err } = makeErr();
      assert.throws(
        () => cmdFeature({ dir, args: ['run-phase', 'nonexistent', '1'], err, rootDir: ROOT_DIR }),
        /not found/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('errors when FEATURE_IDEA.md is missing before run-phase', () => {
    const dir = makeProjectDir();
    try {
      const { fn: err } = makeErr();
      // Init the feature (creates FEATURE_IDEA.md from template)
      captureStdout(() => cmdFeature({ dir, args: ['init', 'my-feat'], err, rootDir: ROOT_DIR }));
      // Remove FEATURE_IDEA.md to simulate missing file
      fs.unlinkSync(path.join(dir, 'features', 'my-feat', 'FEATURE_IDEA.md'));
      const { fn: err2 } = makeErr();
      assert.throws(
        () => cmdFeature({ dir, args: ['run-phase', 'my-feat', '1'], err: err2, rootDir: ROOT_DIR }),
        /FEATURE_IDEA\.md not found/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── cwd-aware "feature not found" message (rc.5 Cesar canary) ────────────────────
// When `aitri feature <verb> <name>` runs from outside the project root, the
// feature dir resolves against the wrong cwd and reports "not found". The pre-rc.5
// message advised `aitri feature init <name>` — telling the operator to CREATE a
// feature that already exists. The canary agent had to correct the human manually.

describe('aitri feature — cwd-aware not-found message', () => {
  it('names the ancestor project root when cwd is below it (wrong-dir case)', () => {
    const proj = makeProjectDir();
    const subDir = path.join(proj, 'sub');
    fs.mkdirSync(subDir, { recursive: true });
    try {
      const { fn: err } = makeErr();
      assert.throws(
        () => cmdFeature({ dir: subDir, args: ['approve', 'card-x', 'build'], err, rootDir: ROOT_DIR }),
        (e) => /not found/.test(e.message)
            && /Project root:/.test(e.message)
            && e.message.includes(path.resolve(proj))
      );
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });

  it('reconstructs the retry command (verb + name + remaining args)', () => {
    const proj = makeProjectDir();
    const subDir = path.join(proj, 'sub');
    fs.mkdirSync(subDir, { recursive: true });
    try {
      const { fn: err } = makeErr();
      assert.throws(
        () => cmdFeature({ dir: subDir, args: ['approve', 'card-x', 'build'], err, rootDir: ROOT_DIR }),
        /cd .+ && aitri feature approve card-x build/
      );
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });

  it('says "not an Aitri project" when cwd has no .aitri and no ancestor root', () => {
    const dir = tmpDir(); // bare temp dir — no .aitri here or above
    try {
      const { fn: err } = makeErr();
      assert.throws(
        () => cmdFeature({ dir, args: ['approve', 'card-x', 'build'], err, rootDir: ROOT_DIR }),
        (e) => /resolve relative to the current directory/.test(e.message)
            && /not an Aitri project/.test(e.message)
            && !/Project root:/.test(e.message)
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the plain init suggestion when cwd IS the project root and the feature is genuinely missing', () => {
    const dir = makeProjectDir();
    try {
      const { fn: err } = makeErr();
      assert.throws(
        () => cmdFeature({ dir, args: ['approve', 'card-x', 'build'], err, rootDir: ROOT_DIR }),
        (e) => /Run: aitri feature init card-x/.test(e.message)
            && !/Project root:/.test(e.message)
            && !/resolve relative to the current directory/.test(e.message)
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── requirements.md template — PARENT_REQUIREMENTS block ───────────────────────────

import { render } from '../../lib/prompts/render.js';

describe('requirements template — {{#IF_PARENT_REQUIREMENTS}} block', () => {
  it('renders PARENT_REQUIREMENTS block when value provided', () => {
    const output = render('phases/requirements', {
      ROLE: '', CONSTRAINTS: '', REASONING: '', FEEDBACK: '',
      IDEA_MD: 'test idea', DIR: '/tmp', ARTIFACTS_BASE: '/tmp',
      PARENT_REQUIREMENTS: '{"project_name":"Existing"}',
    });
    assert.ok(output.includes('Existing Requirements'), 'block must appear when value is set');
    assert.ok(output.includes('{"project_name":"Existing"}'), 'parent JSON must appear in output');
  });

  it('omits PARENT_REQUIREMENTS block when value is empty', () => {
    const output = render('phases/requirements', {
      ROLE: '', CONSTRAINTS: '', REASONING: '', FEEDBACK: '',
      IDEA_MD: 'test idea', DIR: '/tmp', ARTIFACTS_BASE: '/tmp',
      PARENT_REQUIREMENTS: '',
    });
    assert.ok(!output.includes('Existing Requirements'), 'block must be absent when value is empty');
  });
});

// TPA-4 (third-party adopter): a feature sub-pipeline only scans its own
// feature_context/, so the parent's raw idea_context/ (the original source material)
// never reaches it — if the parent capture was lossy, the feature re-omits the same
// detail. The feature briefing now surfaces the parent idea_context/ as a read-only
// pointer (not a copy).
describe('feature run-phase — surfaces parent idea_context/ (TPA-4)', () => {
  it('points the feature agent at the parent project idea_context/ assets', () => {
    const dir = makeProjectDir();
    try {
      writeFile(dir, 'idea_context/db_schema.txt', '26 tables, FK graph, stored procs');
      const { fn: err } = makeErr();
      captureStdout(() => cmdFeature({ dir, args: ['init', 'add-export'], err, rootDir: ROOT_DIR }));
      const out = captureStdout(() => cmdFeature({ dir, args: ['run-phase', 'add-export', '1'], err, rootDir: ROOT_DIR }));
      assert.ok(/Parent project source material/.test(out), 'feature briefing must point at the parent idea_context/');
      assert.ok(/db_schema\.txt/.test(out), 'must list the parent asset by name');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not add the parent-context pointer when the parent idea_context/ is empty', () => {
    const dir = makeProjectDir();
    try {
      const { fn: err } = makeErr();
      captureStdout(() => cmdFeature({ dir, args: ['init', 'add-export'], err, rootDir: ROOT_DIR }));
      const out = captureStdout(() => cmdFeature({ dir, args: ['run-phase', 'add-export', '1'], err, rootDir: ROOT_DIR }));
      assert.ok(!/Parent project source material/.test(out), 'no pointer when there is nothing to point at');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── feature tc (manual verification in feature scope) ─────────────────────────
// FEAT-PARITY-0620: `aitri feature tc <name> verify|mark-manual` operates on the
// FEATURE's own 03_TEST_CASES.json / 04_TEST_RESULTS.json, not the root's.
describe('aitri feature tc', () => {
  function seedFeature(dir, name) {
    writeFile(dir, path.join('features', name, '.aitri'), JSON.stringify({
      projectName: name, artifactsDir: 'spec',
      approvedPhases: [1, 2, 3, 4], completedPhases: [1, 2, 3, 4],
    }));
    writeFile(dir, path.join('features', name, 'spec', '03_TEST_CASES.json'), JSON.stringify({
      test_cases: [
        { id: 'TC-001f', title: 't', requirement_id: 'FR-001', automation: 'manual', expected_result: 'r' },
        { id: 'TC-002e', title: 't2', requirement_id: 'FR-001', automation: 'automated', expected_result: 'r' },
      ],
    }));
    writeFile(dir, path.join('features', name, 'spec', '04_TEST_RESULTS.json'), JSON.stringify({
      executed_at: new Date().toISOString(), test_runner: null, exit_code: null,
      results: [{ tc_id: 'TC-001f', status: 'manual', notes: 'pending' }],
      fr_coverage: [], summary: { total: 1, passed: 0, failed: 0, skipped: 0, manual: 1, manual_verified: 0 },
    }));
  }
  const featResults = (dir, name) =>
    JSON.parse(fs.readFileSync(path.join(dir, 'features', name, 'spec', '04_TEST_RESULTS.json'), 'utf8'));

  it('verify records the result on the FEATURE\'s 04_TEST_RESULTS.json', () => {
    const dir = makeProjectDir();
    try {
      seedFeature(dir, 'billing');
      const { fn: err } = makeErr();
      captureStdout(() => cmdFeature({ dir, args: ['tc', 'billing', 'verify', 'TC-001f', '--result', 'pass', '--notes', 'checked by hand'], err, rootDir: ROOT_DIR }));
      const entry = featResults(dir, 'billing').results.find(r => r.tc_id === 'TC-001f');
      assert.equal(entry.status, 'pass');
      assert.equal(entry.verified_manually, true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('writes the FEATURE artifacts, NOT the root\'s (parity, not leakage)', () => {
    const dir = makeProjectDir();
    try {
      seedFeature(dir, 'billing');
      // A distinct root results file that must stay untouched.
      const rootResults = { executed_at: 'x', results: [{ tc_id: 'ROOT-1', status: 'manual' }], summary: { total: 1, manual: 1 } };
      writeFile(dir, path.join('spec', '04_TEST_RESULTS.json'), JSON.stringify(rootResults));
      const { fn: err } = makeErr();
      captureStdout(() => cmdFeature({ dir, args: ['tc', 'billing', 'verify', 'TC-001f', '--result', 'pass', '--notes', 'ok'], err, rootDir: ROOT_DIR }));
      const rootAfter = JSON.parse(fs.readFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), 'utf8'));
      assert.deepEqual(rootAfter, rootResults, 'the ROOT results file must be untouched by a feature tc verify');
      assert.equal(featResults(dir, 'billing').results.find(r => r.tc_id === 'TC-001f').status, 'pass');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('the next-step hints self-scope to the feature (not the root form)', () => {
    const dir = makeProjectDir();
    try {
      seedFeature(dir, 'billing');
      const { fn: err } = makeErr();
      const out = captureStdout(() => cmdFeature({ dir, args: ['tc', 'billing', 'verify', 'TC-001f', '--result', 'pass', '--notes', 'ok'], err, rootDir: ROOT_DIR }));
      // After the last manual TC is verified, the hint must point at the FEATURE gate,
      // not `aitri verify-complete` (which from the project root targets the ROOT pipeline).
      assert.match(out, /aitri feature verify-complete billing/);
      assert.doesNotMatch(out, /Run: aitri verify-complete\b/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('mark-manual flips the FEATURE TC and stores manual_reason', () => {
    const dir = makeProjectDir();
    try {
      seedFeature(dir, 'billing');
      const { fn: err } = makeErr();
      captureStdout(() => cmdFeature({ dir, args: ['tc', 'billing', 'mark-manual', 'TC-002e', '--reason', 'needs a physical device'], err, rootDir: ROOT_DIR }));
      const tcs = JSON.parse(fs.readFileSync(path.join(dir, 'features', 'billing', 'spec', '03_TEST_CASES.json'), 'utf8'));
      const tc = tcs.test_cases.find(t => t.id === 'TC-002e');
      assert.equal(tc.automation, 'manual');
      assert.equal(tc.manual_reason, 'needs a physical device');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── feature bug / backlog (per-feature data) ──────────────────────────────────
// FEAT-PARITY-0620 part 2: `aitri feature bug|backlog <name> …` operates on the
// FEATURE's own BUGS.json / BACKLOG.json (in features/<name>/spec/), not the root's.
describe('aitri feature bug / backlog', () => {
  function seedFeatureDir(dir, name) {
    writeFile(dir, path.join('features', name, '.aitri'), JSON.stringify({
      projectName: name, artifactsDir: 'spec', approvedPhases: [], completedPhases: [],
    }));
    fs.mkdirSync(path.join(dir, 'features', name, 'spec'), { recursive: true });
  }

  it('feature bug add writes the FEATURE BUGS.json, not the root', () => {
    const dir = makeProjectDir();
    try {
      seedFeatureDir(dir, 'billing');
      const { fn: err } = makeErr();
      captureStdout(() => cmdFeature({ dir, args: ['bug', 'billing', 'add', '--title', 'login broken', '--severity', 'high'], err, rootDir: ROOT_DIR }));
      const featBugs = path.join(dir, 'features', 'billing', 'spec', 'BUGS.json');
      assert.ok(fs.existsSync(featBugs), 'feature BUGS.json must be created');
      assert.equal(JSON.parse(fs.readFileSync(featBugs, 'utf8')).bugs[0].title, 'login broken');
      assert.ok(!fs.existsSync(path.join(dir, 'spec', 'BUGS.json')), 'root BUGS.json must NOT be touched');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('feature bug usage error self-scopes to the feature form', () => {
    const dir = makeProjectDir();
    try {
      seedFeatureDir(dir, 'billing');
      const { fn: err, thrown } = makeErr();
      try { captureStdout(() => cmdFeature({ dir, args: ['bug', 'billing', 'fix'], err, rootDir: ROOT_DIR })); } catch { /* err throws */ }
      assert.match(thrown[0] || '', /aitri feature bug billing fix/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('feature backlog add writes the FEATURE BACKLOG.json, not the root', () => {
    const dir = makeProjectDir();
    try {
      seedFeatureDir(dir, 'billing');
      const { fn: err } = makeErr();
      captureStdout(() => cmdFeature({ dir, args: ['backlog', 'billing', 'add', '--title', 'defer X', '--priority', 'P2', '--problem', 'Y'], err, rootDir: ROOT_DIR }));
      const featBacklog = path.join(dir, 'features', 'billing', 'spec', 'BACKLOG.json');
      assert.ok(fs.existsSync(featBacklog), 'feature BACKLOG.json must be created');
      assert.equal(JSON.parse(fs.readFileSync(featBacklog, 'utf8')).items[0].title, 'defer X');
      assert.ok(!fs.existsSync(path.join(dir, 'spec', 'BACKLOG.json')), 'root BACKLOG.json must NOT be touched');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('feature backlog unknown-subcommand usage self-scopes', () => {
    const dir = makeProjectDir();
    try {
      seedFeatureDir(dir, 'billing');
      const { fn: err, thrown } = makeErr();
      try { captureStdout(() => cmdFeature({ dir, args: ['backlog', 'billing', 'bogus'], err, rootDir: ROOT_DIR })); } catch { /* err throws */ }
      assert.match(thrown[0] || '', /aitri feature backlog billing/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── feature checkpoint (per-feature session note) ─────────────────────────────
// FEAT-PARITY-0620 part 3: `aitri feature checkpoint <name>` saves the FEATURE's
// own session note (.aitri.local) — paused/resumed with its own narrative.
describe('aitri feature checkpoint', () => {
  function seedFeatureDir(dir, name) {
    writeFile(dir, path.join('features', name, '.aitri'), JSON.stringify({
      projectName: name, artifactsDir: 'spec', approvedPhases: [], completedPhases: [],
    }));
    fs.mkdirSync(path.join(dir, 'features', name, 'spec'), { recursive: true });
  }

  it('--context writes the FEATURE .aitri.local session note, not the root', () => {
    const dir = makeProjectDir();
    try {
      seedFeatureDir(dir, 'billing');
      const { fn: err } = makeErr();
      captureStdout(() => cmdFeature({ dir, args: ['checkpoint', 'billing', '--context', 'on billing: JWT done, error-handling pending'], err, rootDir: ROOT_DIR }));
      const featLocal = path.join(dir, 'features', 'billing', '.aitri.local');
      assert.ok(fs.existsSync(featLocal), 'feature .aitri.local must be written');
      assert.match(fs.readFileSync(featLocal, 'utf8'), /error-handling pending/);
      // The root .aitri.local must not carry the feature's note.
      const rootLocal = path.join(dir, '.aitri.local');
      if (fs.existsSync(rootLocal)) {
        assert.doesNotMatch(fs.readFileSync(rootLocal, 'utf8'), /error-handling pending/);
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('--name saves a snapshot under the FEATURE checkpoints/ (cmdResume on the feature dir works)', () => {
    const dir = makeProjectDir();
    try {
      seedFeatureDir(dir, 'billing');
      const { fn: err } = makeErr();
      let threw = false;
      try { captureStdout(() => cmdFeature({ dir, args: ['checkpoint', 'billing', '--name', 'pre-refactor'], err, rootDir: ROOT_DIR })); }
      catch { threw = true; }
      assert.equal(threw, false, 'feature checkpoint --name must not throw (resume snapshot on the feature dir)');
      const cpDir = path.join(dir, 'features', 'billing', 'checkpoints');
      assert.ok(fs.existsSync(cpDir), 'feature checkpoints/ dir must be created');
      assert.ok(fs.readdirSync(cpDir).some(f => /pre-refactor\.md$/.test(f)), 'named snapshot must be saved under the feature');
      assert.ok(!fs.existsSync(path.join(dir, 'checkpoints')), 'root checkpoints/ must NOT be created');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// AUDIT-COV-FEAT-0625 fork 2 — `aitri feature <name> audit coverage`
describe('aitri feature audit', () => {
  function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-feature-')); }
  function makeProjectDir() {
    const dir = tmpDir();
    writeFile(dir, '.aitri', JSON.stringify({
      projectName: 'TestProject', artifactsDir: 'spec',
      approvedPhases: [], completedPhases: [], currentPhase: 0,
    }));
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    return dir;
  }
  // Seed a feature with a live FEATURE_IDEA.md (pre-approve intent) and feature FRs.
  function seedFeature(dir, name) {
    writeFile(dir, path.join('features', name, '.aitri'), JSON.stringify({
      projectName: name, artifactsDir: 'spec', approvedPhases: [], completedPhases: [],
    }));
    writeFile(dir, path.join('features', name, 'FEATURE_IDEA.md'), 'batch export with a progress bar');
    writeFile(dir, path.join('features', name, 'spec', '01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [{ id: 'FR-009', priority: 'MUST', title: 'export invoices' }],
    }));
  }

  it('`feature audit <name> requirements` produces a feature-scoped coverage briefing', () => {
    const dir = makeProjectDir();
    try {
      seedFeature(dir, 'bulk-export');
      const { fn: err } = makeErr();
      const out = captureStdout(() => cmdFeature({ dir, args: ['audit', 'bulk-export', 'requirements'], err, rootDir: ROOT_DIR }));
      assert.match(out, /Requirements Coverage Audit/);        // coverage template
      assert.match(out, /batch export with a progress bar/);    // FEATURE_IDEA.md intent fed in
      assert.match(out, /bulk-export/);                         // SCOPE_NOTE names the feature
      assert.match(out, /FEATURE sub-pipeline/i);               // feature framing, not root
      assert.match(out, /FR-009/);                              // feature FRs fed in
      // coverageAuditLastAt persisted to the FEATURE .aitri, not the root
      const featCfg = JSON.parse(fs.readFileSync(path.join(dir, 'features', 'bulk-export', '.aitri'), 'utf8'));
      assert.ok(featCfg.coverageAuditLastAt, 'feature .aitri must record coverageAuditLastAt');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('`feature audit <name> coverage` still works as a deprecated alias', () => {
    const dir = makeProjectDir();
    try {
      seedFeature(dir, 'bulk-export');
      const { fn: err } = makeErr();
      const out = captureStdout(() => cmdFeature({ dir, args: ['audit', 'bulk-export', 'coverage'], err, rootDir: ROOT_DIR }));
      assert.match(out, /Requirements Coverage Audit/);         // alias routes to the same audit
      assert.match(out, /FR-009/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('rejects non-requirements audit sub-commands at feature scope', () => {
    const dir = makeProjectDir();
    try {
      seedFeature(dir, 'bulk-export');
      const { fn: err, thrown } = makeErr();
      try { captureStdout(() => cmdFeature({ dir, args: ['audit', 'bulk-export', 'security'], err, rootDir: ROOT_DIR })); }
      catch { /* err throws */ }
      assert.match(thrown[0] || '', /only `audit requirements` is supported/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
