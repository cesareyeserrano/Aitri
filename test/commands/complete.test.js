/**
 * Tests: aitri complete — validate artifact + record phase as complete
 * Covers: state recording, --check dry run, missing artifact, validation failure, lastSession
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdComplete } from '../../lib/commands/complete.js';
import { loadConfig } from '../../lib/state.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-complete-'));
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

const noopErr = (msg) => { throw new Error(msg); };

const VALID_REQUIREMENTS = JSON.stringify({
  project_name: 'Test App',
  project_summary: 'A test application.',
  functional_requirements: [
    { id: 'FR-001', title: 'Login',     priority: 'MUST',   type: 'security',  acceptance_criteria: ['returns 401 on invalid token'], description: 'Auth' },
    { id: 'FR-002', title: 'Dashboard', priority: 'MUST',   type: 'core',      acceptance_criteria: ['renders dashboard view'],       description: 'Main view' },
    { id: 'FR-003', title: 'Export',    priority: 'MUST',   type: 'reporting', acceptance_criteria: ['generates valid CSV'],           description: 'Export data' },
    { id: 'FR-004', title: 'Save',      priority: 'SHOULD', type: 'core',      acceptance_criteria: ['data survives restart'],         description: 'Persistence' },
    { id: 'FR-005', title: 'Totals',    priority: 'NICE',   type: 'logic',     acceptance_criteria: ['correct sum returned'],          description: 'Calc' },
  ],
  user_stories: [
    { id: 'US-001', requirement_id: 'FR-001', as_a: 'user', i_want: 'to login', so_that: 'I access data' },
  ],
  non_functional_requirements: [
    { id: 'NFR-001', category: 'Performance', requirement: 'p99 < 200ms',  acceptance_criteria: 'load test' },
    { id: 'NFR-002', category: 'Security',    requirement: 'TLS 1.3',      acceptance_criteria: 'SSL Labs' },
    { id: 'NFR-003', category: 'Reliability', requirement: '99.9% uptime', acceptance_criteria: 'SLA report' },
  ],
  constraints: [],
  technology_preferences: ['Node.js'],
}, null, 2);

const minimalConfig = (overrides = {}) => JSON.stringify({
  projectName: 'TestProject',
  artifactsDir: 'spec',
  approvedPhases: [],
  completedPhases: [],
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cmdComplete() — successful complete (requirements)', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', '# My Idea\nSome content for the idea file.\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    output = captureStdout(() =>
      cmdComplete({ dir, args: ['requirements'], err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('sets currentPhase to 1', () => {
    const config = loadConfig(dir);
    assert.equal(config.currentPhase, 1);
  });

  it('adds phase to completedPhases', () => {
    const config = loadConfig(dir);
    assert.ok(config.completedPhases.includes(1));
  });

  it('stores artifact hash in artifactHashes', () => {
    const config = loadConfig(dir);
    assert.ok(config.artifactHashes['1'], 'hash for phase 1 must exist');
  });

  it('appends completed event', () => {
    const config = loadConfig(dir);
    const last = config.events[config.events.length - 1];
    assert.equal(last.event, 'completed');
    assert.equal(last.phase, 1);
  });

  it('writes lastSession', () => {
    const config = loadConfig(dir);
    assert.ok(config.lastSession, 'lastSession must exist');
    assert.equal(config.lastSession.event, 'complete requirements');
  });

  it('prints success message with alias', () => {
    assert.ok(output.includes('requirements'), 'output should include phase alias');
    assert.ok(output.includes('✅'), 'output should include success icon');
  });
});

describe('cmdComplete() — accepts numeric phase', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', '# My Idea\nContent.\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    captureStdout(() =>
      cmdComplete({ dir, args: ['1'], err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('records phase 1 as completed', () => {
    const config = loadConfig(dir);
    assert.ok(config.completedPhases.includes(1));
  });
});

describe('cmdComplete() — --check dry run', () => {
  let dir;
  let output;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', '# My Idea\nContent.\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    // Capture console.log instead of stdout.write since --check uses console.log
    const origLog = console.log;
    let logged = '';
    console.log = (...a) => { logged += a.join(' ') + '\n'; };
    try {
      cmdComplete({ dir, args: ['requirements', '--check'], err: noopErr });
    } finally {
      console.log = origLog;
    }
    output = logged;
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not modify state', () => {
    const config = loadConfig(dir);
    assert.deepEqual(config.completedPhases, []);
  });

  it('prints validation passed', () => {
    assert.ok(output.includes('validation passed'), 'should say validation passed');
  });
});

describe('cmdComplete() — missing artifact', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('throws error when artifact is missing', () => {
    assert.throws(
      () => cmdComplete({ dir, args: ['requirements'], err: noopErr }),
      /Artifact not found/
    );
  });
});

describe('cmdComplete() — validation failure', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', '# Idea\nContent.\n');
    // Invalid: too few FRs
    writeFile(dir, 'spec/01_REQUIREMENTS.json', JSON.stringify({
      project_name: 'Bad',
      project_summary: 'Too few.',
      functional_requirements: [
        { id: 'FR-001', title: 'Login', priority: 'MUST', type: 'security', acceptance_criteria: ['401'], description: 'Auth' },
      ],
      user_stories: [],
      non_functional_requirements: [
        { id: 'NFR-001', category: 'Performance', requirement: 'fast' },
        { id: 'NFR-002', category: 'Security', requirement: 'secure' },
        { id: 'NFR-003', category: 'Reliability', requirement: 'reliable' },
      ],
      constraints: [],
      technology_preferences: [],
    }, null, 2));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('throws validation error', () => {
    assert.throws(
      () => cmdComplete({ dir, args: ['requirements'], err: noopErr }),
      /validation failed|Artifact validation/i
    );
  });
});

describe('cmdComplete() — unknown phase', () => {
  it('throws usage error for invalid phase', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    try {
      assert.throws(
        () => cmdComplete({ dir, args: ['nonexistent'], err: noopErr }),
        /Usage/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cmdComplete() — spec/ artifact path', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ artifactsDir: 'spec' }));
    writeFile(dir, 'IDEA.md', '# Idea\nContent for idea.\n');
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    captureStdout(() =>
      cmdComplete({ dir, args: ['requirements'], err: noopErr })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('finds artifact in spec/ subdirectory', () => {
    const config = loadConfig(dir);
    assert.ok(config.completedPhases.includes(1));
  });
});
