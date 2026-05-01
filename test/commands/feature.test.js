/**
 * Tests: aitri feature — sub-pipeline management
 * Covers: init, list, delegation to existing commands, parent context injection
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdFeature } from '../../lib/commands/feature.js';

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

  it('creates .aitri state file with artifactsDir: "spec"', () => {
    const statePath = path.join(dir, 'features', 'add-export', '.aitri');
    assert.ok(fs.existsSync(statePath), '.aitri must be created in feature dir');
    const config = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(config.artifactsDir, 'spec', 'feature state must use spec/ artifacts dir');
    assert.equal(config.projectName, 'add-export', 'feature state must record feature name');
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
