/**
 * Tests: aitri adopt (scan + apply + --upgrade)
 * Covers: scan briefing output, apply plan parsing, phase marking, non-destructive behavior
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdAdopt, scanCodeQuality, scanSecretSignals, scanInfrastructure, scanTestHealth } from '../../lib/commands/adopt.js';
import { cmdInit }  from '../../lib/commands/init.js';
import { loadConfig, saveConfig } from '../../lib/state.js';

const ROOT_DIR = path.resolve(process.cwd());

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-adopt-'));
}

function captureLog(fn) {
  const lines = [];
  const orig = console.log.bind(console);
  console.log = (...a) => lines.push(a.join(' '));
  try { fn(); } finally { console.log = orig; }
  return lines.join('\n');
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
  return { fn: (msg) => { thrown.push(msg); throw new Error(msg); }, thrown };
}

function writeArtifact(dir, subdir, name, content = '{}') {
  const d = path.join(dir, subdir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, name), content, 'utf8');
}

function makeAdoptionPlan(overrides = {}) {
  const sections = {
    summary:         'An invoicing tool for freelancers. Helps track payments and send reminders.',
    stack:           'Node.js · Express · Jest',
    inferred:        '- [x] 01_REQUIREMENTS.json — inferrable from README\n- [ ] 02_SYSTEM_DESIGN.md — no architecture docs',
    completedPhases: '["1"]',
    gaps:            '- No user personas\n- No deployment config',
    decision:        'ready — core requirements inferrable',
    ...overrides,
  };
  return [
    '# Aitri Adoption Plan',
    '',
    '## Project Summary',
    sections.summary,
    '',
    '## Stack',
    sections.stack,
    '',
    '## Inferred Artifacts',
    sections.inferred,
    '',
    '## Completed Phases',
    '```json',
    sections.completedPhases,
    '```',
    '',
    '## Gaps',
    sections.gaps,
    '',
    '## Adoption Decision',
    sections.decision,
    '',
  ].join('\n');
}

// ── adopt scan ────────────────────────────────────────────────────────────────

describe('aitri adopt scan', () => {
  it('outputs a briefing to stdout', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'index.js'), 'console.log("hello");');

    const out = captureStdout(() =>
      cmdAdopt({ dir, args: ['scan'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn })
    );
    assert.ok(out.length > 100, 'briefing must be non-trivial');
    assert.ok(out.includes('ADOPTION_PLAN.md'), 'briefing must reference output artifact');
    assert.ok(out.includes('Project Adopter') || out.includes('reverse-engineering'), 'briefing must contain persona');
  });

  it('briefing includes project dir', () => {
    const dir = tmpDir();
    const out = captureStdout(() =>
      cmdAdopt({ dir, args: ['scan'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn })
    );
    assert.ok(out.includes(dir), 'briefing must include project dir');
  });

  it('briefing includes package.json content when present', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test-pkg', version: '1.0.0' }));

    const out = captureStdout(() =>
      cmdAdopt({ dir, args: ['scan'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn })
    );
    assert.ok(out.includes('test-pkg'), 'briefing must include package.json content');
  });

  it('briefing includes README content when present', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'README.md'), '# My Unique Project\nDoes amazing things.');

    const out = captureStdout(() =>
      cmdAdopt({ dir, args: ['scan'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn })
    );
    assert.ok(out.includes('My Unique Project'), 'briefing must include README content');
  });

  it('briefing mentions test files when found', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'test'));
    fs.writeFileSync(path.join(dir, 'test', 'foo.test.js'), '// test');
    fs.writeFileSync(path.join(dir, 'test', 'bar.spec.js'), '// test');

    const out = captureStdout(() =>
      cmdAdopt({ dir, args: ['scan'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn })
    );
    assert.ok(out.includes('test file'), 'briefing must mention test files');
  });

  it('briefing includes file tree', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'server.js'), '');
    fs.mkdirSync(path.join(dir, 'src'));

    const out = captureStdout(() =>
      cmdAdopt({ dir, args: ['scan'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn })
    );
    assert.ok(out.includes('server.js'), 'briefing must include file tree');
  });
});

// ── adopt apply ───────────────────────────────────────────────────────────────

describe('aitri adopt apply', () => {
  it('throws when ADOPTION_PLAN.md is missing', () => {
    const dir = tmpDir();
    const e = makeErr();
    assert.throws(
      () => cmdAdopt({ dir, args: ['apply'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: e.fn }),
      /ADOPTION_PLAN.md not found/
    );
  });

  it('creates .aitri after applying', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      fs.writeFileSync(path.join(dir, 'ADOPTION_PLAN.md'), makeAdoptionPlan());
      cmdAdopt({ dir, args: ['apply'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn });
    } finally { process.stdin.isTTY = origIsTTY; }

    assert.ok(fs.existsSync(path.join(dir, '.aitri')), '.aitri must be created');
  });

  it('creates IDEA.md from Project Summary', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      fs.writeFileSync(path.join(dir, 'ADOPTION_PLAN.md'), makeAdoptionPlan());
      cmdAdopt({ dir, args: ['apply'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn });
    } finally { process.stdin.isTTY = origIsTTY; }

    const idea = fs.readFileSync(path.join(dir, 'IDEA.md'), 'utf8');
    assert.ok(idea.includes('invoicing tool'), 'IDEA.md must contain project summary');
  });

  it('marks completedPhases from plan', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      fs.writeFileSync(path.join(dir, 'ADOPTION_PLAN.md'), makeAdoptionPlan({ completedPhases: '["1", "2"]' }));
      cmdAdopt({ dir, args: ['apply'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn });
    } finally { process.stdin.isTTY = origIsTTY; }

    const config = loadConfig(dir);
    assert.ok(config.completedPhases.includes(1), 'phase 1 must be marked');
    assert.ok(config.completedPhases.includes(2), 'phase 2 must be marked');
  });

  it('does not overwrite existing IDEA.md', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Existing Idea\nDo not overwrite.');
    try {
      fs.writeFileSync(path.join(dir, 'ADOPTION_PLAN.md'), makeAdoptionPlan());
      cmdAdopt({ dir, args: ['apply'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn });
    } finally { process.stdin.isTTY = origIsTTY; }

    const idea = fs.readFileSync(path.join(dir, 'IDEA.md'), 'utf8');
    assert.ok(idea.includes('Existing Idea'), 'must not overwrite existing IDEA.md');
  });

  it('throws when Adoption Decision is blocked', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    const e = makeErr();
    try {
      fs.writeFileSync(path.join(dir, 'ADOPTION_PLAN.md'), makeAdoptionPlan({ decision: 'blocked — critical info missing' }));
      assert.throws(
        () => cmdAdopt({ dir, args: ['apply'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: e.fn }),
        /blocked/
      );
    } finally { process.stdin.isTTY = origIsTTY; }
  });

  it('throws when Project Summary section is missing', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    const e = makeErr();
    const planWithoutSummary = makeAdoptionPlan().replace('## Project Summary', '## About');
    try {
      fs.writeFileSync(path.join(dir, 'ADOPTION_PLAN.md'), planWithoutSummary);
      assert.throws(
        () => cmdAdopt({ dir, args: ['apply'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: e.fn }),
        /Project Summary/
      );
    } finally { process.stdin.isTTY = origIsTTY; }
  });

  it('emits warning to stderr when zero phases can be inferred', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    let stderrOutput = '';
    const origStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
    try {
      // Plan with no recognizable "Completed Phases" section
      const planNoPhases = makeAdoptionPlan({ completedPhases: 'none' });
      fs.writeFileSync(path.join(dir, 'ADOPTION_PLAN.md'), planNoPhases);
      cmdAdopt({ dir, args: ['apply'], VERSION: '0.1.47', rootDir: ROOT_DIR, err: makeErr().fn });
    } finally {
      process.stderr.write = origStderr;
      process.stdin.isTTY = origIsTTY;
    }
    assert.ok(stderrOutput.includes('no completed phases'), `expected warning, got: ${stderrOutput}`);
  });

  it('handles empty completedPhases gracefully', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      fs.writeFileSync(path.join(dir, 'ADOPTION_PLAN.md'), makeAdoptionPlan({ completedPhases: '[]' }));
      assert.doesNotThrow(() =>
        cmdAdopt({ dir, args: ['apply'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn })
      );
    } finally { process.stdin.isTTY = origIsTTY; }

    const config = loadConfig(dir);
    assert.deepEqual(config.completedPhases, []);
  });

  it('does not duplicate already-completed phases', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;

    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.35' });
    const config = loadConfig(dir);
    config.completedPhases = [1];
    saveConfig(dir, config);

    try {
      fs.writeFileSync(path.join(dir, 'ADOPTION_PLAN.md'), makeAdoptionPlan({ completedPhases: '["1"]' }));
      cmdAdopt({ dir, args: ['apply'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn });
    } finally { process.stdin.isTTY = origIsTTY; }

    const updated = loadConfig(dir);
    assert.equal(updated.completedPhases.filter(p => p === 1).length, 1);
  });
});

// ── apply --from <N> ──────────────────────────────────────────────────────────

describe('aitri adopt apply --from', () => {
  function run(dir, fromN) {
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      cmdAdopt({ dir, args: ['apply', '--from', String(fromN)], VERSION: '0.1.50', rootDir: ROOT_DIR, err: makeErr().fn });
    } finally { process.stdin.isTTY = origIsTTY; }
  }

  it('marks phases 1 through N-1 as completed when --from N', () => {
    const dir = tmpDir();
    try {
      run(dir, 4);
      const cfg = loadConfig(dir);
      assert.ok(cfg.completedPhases.includes(1), 'phase 1 must be marked');
      assert.ok(cfg.completedPhases.includes(2), 'phase 2 must be marked');
      assert.ok(cfg.completedPhases.includes(3), 'phase 3 must be marked');
      assert.ok(!cfg.completedPhases.includes(4), 'phase 4 must NOT be marked');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('marks no phases when --from 1 (greenfield start)', () => {
    const dir = tmpDir();
    try {
      run(dir, 1);
      const cfg = loadConfig(dir);
      assert.deepEqual(cfg.completedPhases, [], 'no phases should be completed for --from 1');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('creates IDEA.md from README when no ADOPTION_PLAN.md', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'README.md'), 'An invoicing tool for freelancers.', 'utf8');
      run(dir, 3);
      const idea = fs.readFileSync(path.join(dir, 'IDEA.md'), 'utf8');
      assert.ok(idea.includes('invoicing'), 'IDEA.md should use README content');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('creates IDEA.md from ADOPTION_PLAN.md Project Summary when available', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'ADOPTION_PLAN.md'), makeAdoptionPlan(), 'utf8');
      run(dir, 2);
      const idea = fs.readFileSync(path.join(dir, 'IDEA.md'), 'utf8');
      assert.ok(idea.includes('invoicing'), 'IDEA.md should use ADOPTION_PLAN.md Project Summary');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('errors when --from value is out of range', () => {
    const dir = tmpDir();
    try {
      const { fn: err, thrown } = makeErr();
      assert.throws(
        () => cmdAdopt({ dir, args: ['apply', '--from', '6'], VERSION: '0.1.50', rootDir: ROOT_DIR, err }),
        /--from requires a phase number between 1 and 5/
      );
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('infers additional phases from existing artifacts in spec/', () => {
    const dir = tmpDir();
    try {
      // Write a valid-looking artifact for phase 1
      fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), '{}', 'utf8');
      // --from 2 would mark phase 1; artifact also exists for phase 1 — no dup
      run(dir, 2);
      const cfg = loadConfig(dir);
      assert.equal(cfg.completedPhases.filter(p => p === 1).length, 1, 'phase 1 must appear exactly once');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('does not overwrite existing IDEA.md', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'IDEA.md'), 'Existing content.', 'utf8');
      run(dir, 3);
      const idea = fs.readFileSync(path.join(dir, 'IDEA.md'), 'utf8');
      assert.equal(idea, 'Existing content.', 'existing IDEA.md must not be overwritten');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── scanner unit tests ────────────────────────────────────────────────────────

describe('scanCodeQuality', () => {
  it('detects TODO markers in source files', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'app.js'), '// TODO: fix this\nconst x = 1;');
    const result = scanCodeQuality(dir);
    assert.ok(result.includes('TODO') || result.includes('1 marker') || result.match(/Total: \d+/), `expected marker count, got: ${result}`);
    assert.ok(!result.startsWith('None found.'), 'should detect at least one marker');
  });

  it('returns "None found." when no markers present', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'clean.js'), 'const x = 1;\nmodule.exports = x;');
    const result = scanCodeQuality(dir);
    assert.equal(result, 'None found.');
  });

  it('counts FIXME and HACK markers', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'util.js'), '// FIXME: broken\n// HACK: workaround\nconst y = 2;');
    const result = scanCodeQuality(dir);
    assert.ok(!result.startsWith('None found.'), 'should detect FIXME and HACK');
  });
});

describe('scanSecretSignals', () => {
  it('detects hardcoded api_key pattern', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'config.js'), `const api_key = 'sk-abc123verylongkey';`);
    const result = scanSecretSignals(dir);
    assert.ok(!result.startsWith('No hardcoded'), `should flag credential pattern, got: ${result}`);
    assert.ok(result.includes('config.js'), 'should report the offending file');
  });

  it('returns clean message when no credentials found', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'safe.js'), 'const name = "hello";\nmodule.exports = { name };');
    const result = scanSecretSignals(dir);
    assert.equal(result, 'No hardcoded credential patterns detected.');
  });

  it('detects password assignment pattern', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'db.js'), `const password = 'supersecret123';`);
    const result = scanSecretSignals(dir);
    assert.ok(!result.startsWith('No hardcoded'), `should flag password pattern, got: ${result}`);
  });
});

describe('scanInfrastructure', () => {
  it('reports Dockerfile present when it exists', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM node:20\n');
    const result = scanInfrastructure(dir);
    assert.ok(result.includes('Dockerfile: ✓'), `expected Dockerfile present, got: ${result}`);
  });

  it('reports Dockerfile missing when absent', () => {
    const dir = tmpDir();
    const result = scanInfrastructure(dir);
    assert.ok(result.includes('Dockerfile: missing'), `expected Dockerfile missing, got: ${result}`);
  });

  it('detects package-lock.json as lockfile', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    const result = scanInfrastructure(dir);
    assert.ok(result.includes('package-lock.json'), `expected lockfile detected, got: ${result}`);
  });

  it('reports lockfile missing when none present', () => {
    const dir = tmpDir();
    const result = scanInfrastructure(dir);
    assert.ok(result.includes('Lockfile: missing'), `expected lockfile missing, got: ${result}`);
  });
});

describe('scanTestHealth', () => {
  it('detects empty test files', () => {
    const dir = tmpDir();
    const testFile = 'test/empty.test.js';
    fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(dir, testFile), '// empty');
    const result = scanTestHealth(dir, [testFile]);
    assert.ok(result.includes('empty') || result.includes(testFile), `should flag empty test, got: ${result}`);
  });

  it('detects .skip markers in test files', () => {
    const dir = tmpDir();
    const testFile = 'test/skipped.test.js';
    fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(dir, testFile), `
describe('suite', () => {
  it.skip('does something', () => {
    // lots of content here to pass the empty check threshold yes indeed yes
    const x = 1;
  });
});`);
    const result = scanTestHealth(dir, [testFile]);
    assert.ok(result.includes('skip') || result.includes(testFile), `should flag skipped tests, got: ${result}`);
  });

  it('returns clean message for healthy test files', () => {
    const dir = tmpDir();
    const testFile = 'test/good.test.js';
    fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
    fs.writeFileSync(path.join(dir, testFile), `
import assert from 'assert';
describe('suite', () => {
  it('does something real', () => {
    assert.equal(1 + 1, 2);
  });
});`);
    const result = scanTestHealth(dir, [testFile]);
    assert.ok(!result.includes(testFile), `healthy test should not be flagged, got: ${result}`);
  });
});

// ── adopt --upgrade ───────────────────────────────────────────────────────────

describe('aitri adopt --upgrade', () => {
  it('updates aitriVersion when upgrading', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
    cmdAdopt({ dir, args: ['--upgrade'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn });
    const config = loadConfig(dir);
    assert.equal(config.aitriVersion, '0.1.35');
  });

  it('infers completedPhases from existing artifacts', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
    writeArtifact(dir, 'spec', '01_REQUIREMENTS.json', '{"functionalRequirements":[]}');
    writeArtifact(dir, 'spec', '02_SYSTEM_DESIGN.md', '# Design\n'.repeat(5));

    cmdAdopt({ dir, args: ['--upgrade'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn });
    const config = loadConfig(dir);
    assert.ok(config.completedPhases.includes(1), 'phase 1 must be inferred');
    assert.ok(config.completedPhases.includes(2), 'phase 2 must be inferred');
    assert.ok(!config.completedPhases.includes(3), 'phase 3 must NOT be inferred');
  });

  it('does not overwrite already-approved phases', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
    writeArtifact(dir, 'spec', '01_REQUIREMENTS.json', '{}');

    const config = loadConfig(dir);
    config.approvedPhases = [1];
    saveConfig(dir, config);

    cmdAdopt({ dir, args: ['--upgrade'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn });
    const updated = loadConfig(dir);
    assert.ok(updated.approvedPhases.includes(1));
    assert.ok(!updated.completedPhases.includes(1));
  });

  it('infers optional phase discovery when artifact exists', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
    writeArtifact(dir, 'spec', '00_DISCOVERY.md', '# Discovery\n'.repeat(5));

    cmdAdopt({ dir, args: ['--upgrade'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn });
    const config = loadConfig(dir);
    assert.ok(config.completedPhases.includes('discovery'));
  });

  it('handles no artifacts gracefully', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.10' });
    assert.doesNotThrow(() =>
      cmdAdopt({ dir, args: ['--upgrade'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: makeErr().fn })
    );
    const config = loadConfig(dir);
    assert.equal(config.aitriVersion, '0.1.35');
    assert.deepEqual(config.completedPhases, []);
  });

  it('throws on unknown subcommand', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.35' });
    const e = makeErr();
    assert.throws(
      () => cmdAdopt({ dir, args: ['--unknown'], VERSION: '0.1.35', rootDir: ROOT_DIR, err: e.fn }),
      /adopt: unknown subcommand/
    );
  });
});
