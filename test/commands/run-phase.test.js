/**
 * Tests: aitri run-phase — print phase briefing
 * Covers: briefing output, input resolution, missing input error, drift marking, wasApproved logic, alias support
 * Note: TTY-interactive paths (pipeline-complete confirmation) cannot be tested in unit tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cmdRunPhase } from '../../lib/commands/run-phase.js';
import { loadConfig } from '../../lib/state.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROOT_DIR = path.resolve(process.cwd());

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-runphase-'));
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
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

const noopErr = (msg) => { throw new Error(msg); };
const makeFlagValue = (flags = {}) => (f) => flags[f] || null;

const minimalConfig = (overrides = {}) => JSON.stringify({
  projectName: 'TestProject',
  artifactsDir: 'spec',
  approvedPhases: [],
  completedPhases: [],
  ...overrides,
});

const IDEA_CONTENT = '# My Project\n\nA comprehensive idea that describes the project in detail. '.repeat(5) + '\n';

const VALID_REQUIREMENTS = JSON.stringify({
  project_name: 'Test App',
  project_summary: 'A test application.',
  functional_requirements: [
    { id: 'FR-001', title: 'Login',     priority: 'MUST',   type: 'security',  acceptance_criteria: ['returns 401 on invalid token'], description: 'Auth' },
    { id: 'FR-002', title: 'Dashboard', priority: 'MUST',   type: 'core',      acceptance_criteria: ['renders dashboard view'],       description: 'Main view' },
    { id: 'FR-003', title: 'Export',    priority: 'MUST',   type: 'reporting', acceptance_criteria: ['generates valid CSV'],           description: 'Export data' },
  ],
  user_stories: [],
  non_functional_requirements: [
    { id: 'NFR-001', category: 'Performance', requirement: 'p99 < 200ms',  acceptance_criteria: 'load test' },
    { id: 'NFR-002', category: 'Security',    requirement: 'TLS 1.3',      acceptance_criteria: 'SSL Labs' },
    { id: 'NFR-003', category: 'Reliability', requirement: '99.9% uptime', acceptance_criteria: 'SLA report' },
  ],
  constraints: [],
  technology_preferences: ['Node.js'],
}, null, 2);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cmdRunPhase() — phase 1 (requirements) briefing', () => {
  let dir;
  let result;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    result = captureAll(() =>
      cmdRunPhase({
        dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
      })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('outputs briefing content', () => {
    assert.ok(result.stdout.length > 100, 'briefing should have substantial content');
  });

  it('sets currentPhase to 1', () => {
    const config = loadConfig(dir);
    assert.equal(config.currentPhase, 1);
  });

  it('appends started event', () => {
    const config = loadConfig(dir);
    const started = config.events.find(e => e.event === 'started' && e.phase === 1);
    assert.ok(started, 'started event must exist');
  });

  it('prints agent instruction footer', () => {
    assert.ok(result.stderr.includes('does NOT create files'), 'should remind agent about next steps');
  });
});

describe('cmdRunPhase() — context folder (idea_context/ rename, rc.37)', () => {
  it('lists idea_context/ assets in the briefing', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, 'idea_context/mockup.png', 'x');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(stdout.includes('idea_context/ folder'), 'briefing should reference the idea_context/ folder');
    assert.ok(stdout.includes('idea_context/mockup.png'), 'briefing should list the asset');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('emits a loud migration note when legacy idea/ still has assets', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, 'idea/old.pdf', 'x');
    const { stderr } = captureAll(() =>
      cmdRunPhase({ dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(stderr.includes('no longer scanned'), 'should warn that idea/ is no longer scanned');
    assert.ok(stderr.includes('mv idea idea_context'), 'should give the rename command');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // rc.39 — context is injected only in spec-definition phases, not execution phases.
  it('injects context in discovery (the most context-hungry spec phase)', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, 'idea_context/brief.pdf', 'x');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['discovery'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(stdout.includes('idea_context/brief.pdf'), 'discovery briefing should list context assets');
  });

  it('does NOT inject context in execution phases (build)', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '# System Design\n\nArchitecture details.\n');
    writeFile(dir, 'spec/03_TEST_CASES.json', '{"test_plan":{},"test_cases":[]}');
    writeFile(dir, 'idea_context/mockup.png', 'x');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['build'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(!stdout.includes('idea_context/mockup.png'), 'build briefing must NOT list context assets');
    assert.ok(!stdout.includes('Additional context'), 'build must not inject the context block');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('cmdRunPhase() — accepts numeric phase', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    captureAll(() =>
      cmdRunPhase({
        dir, args: ['1'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
      })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('records phase 1 as current', () => {
    const config = loadConfig(dir);
    assert.equal(config.currentPhase, 1);
  });
});

describe('cmdRunPhase() — missing input file', () => {
  it('throws when IDEA.md is missing for phase 1', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    // No IDEA.md
    try {
      assert.throws(
        () => captureAll(() =>
          cmdRunPhase({
            dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
          })
        ),
        /Missing required file/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cmdRunPhase() — missing input for phase 2', () => {
  it('throws when requirements artifact is missing', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    // No 01_REQUIREMENTS.json for phase 2
    try {
      assert.throws(
        () => captureAll(() =>
          cmdRunPhase({
            dir, args: ['architecture'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
          })
        ),
        /Missing required file/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── alpha.26: absorbed-brief regression — phase 2 + phaseUX must run when
// IDEA.md has been absorbed by approve.js (since v0.1.89). Reproduces the
// Ultron blocker reported 2026-05-03: re-running `aitri run-phase architecture`
// after Phase 1 approval failed because phase2.js declared IDEA.md as a
// required input but never used inputs['IDEA.md'] in buildBriefing.
describe('cmdRunPhase() — absorbed brief (alpha.26)', () => {
  it('phase 2 (architecture) succeeds with only 01_REQUIREMENTS.json — no IDEA.md required', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1], completedPhases: [1] }));
      writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
      // Deliberately NO IDEA.md on disk — simulates post-absorb state.
      const { stdout } = captureAll(() =>
        cmdRunPhase({
          dir, args: ['architecture'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
        })
      );
      assert.ok(stdout.length > 0, 'briefing must be emitted to stdout');
      assert.ok(/Architect|architecture|System Design/i.test(stdout),
        'briefing must contain architect-related content');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('phase 2 (architecture) does NOT error with "Missing required file: IDEA.md"', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1], completedPhases: [1] }));
      writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
      // No IDEA.md — must NOT trigger the missing-file gate.
      assert.doesNotThrow(() => captureAll(() =>
        cmdRunPhase({
          dir, args: ['architecture'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
        })
      ));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('phaseUX succeeds with only 01_REQUIREMENTS.json — no IDEA.md required', () => {
    const dir = tmpDir();
    try {
      writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1], completedPhases: [1] }));
      writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
      const { stdout } = captureAll(() =>
        cmdRunPhase({
          dir, args: ['ux'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
        })
      );
      assert.ok(stdout.length > 0, 'briefing must be emitted to stdout');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('cmdRunPhase() — unknown phase', () => {
  it('throws usage error', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    try {
      assert.throws(
        () => captureAll(() =>
          cmdRunPhase({
            dir, args: ['nonexistent'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
          })
        ),
        /Usage/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cmdRunPhase() — clears approval on re-run', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1],
      completedPhases: [1],
    }));
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    captureAll(() =>
      cmdRunPhase({
        dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
      })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('removes phase from approvedPhases', () => {
    const config = loadConfig(dir);
    assert.ok(!config.approvedPhases.includes(1), 'phase 1 should not be approved after re-run');
  });

  it('removes phase from completedPhases', () => {
    const config = loadConfig(dir);
    assert.ok(!config.completedPhases.includes(1), 'phase 1 should not be completed after re-run');
  });
});

describe('cmdRunPhase() — sets drift on re-run of approved phase', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1],
      completedPhases: [1],
    }));
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    captureAll(() =>
      cmdRunPhase({
        dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
      })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('adds phase to driftPhases', () => {
    const config = loadConfig(dir);
    assert.ok((config.driftPhases || []).map(String).includes('1'), 'phase 1 should be in driftPhases');
  });
});

describe('cmdRunPhase() — no drift on first run', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    captureAll(() =>
      cmdRunPhase({
        dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
      })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not set driftPhases on fresh run', () => {
    const config = loadConfig(dir);
    assert.ok(!(config.driftPhases || []).map(String).includes('1'), 'no drift on first run');
  });
});

describe('cmdRunPhase() — --feedback flag', () => {
  let dir;
  let result;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    result = captureAll(() =>
      cmdRunPhase({
        dir, args: ['requirements', '--feedback', 'add more security FRs'],
        flagValue: makeFlagValue({ '--feedback': 'add more security FRs' }),
        err: noopErr, rootDir: ROOT_DIR,
      })
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('includes feedback in briefing', () => {
    assert.ok(result.stdout.includes('add more security FRs'), 'feedback must appear in briefing');
  });
});

describe('cmdRunPhase() — phase 5 gate (verifyPassed)', () => {
  it('blocks phase 5 when verify not passed', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
      verifyPassed: false,
    }));
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '## Executive Summary\nDesign.\n');
    writeFile(dir, 'spec/03_TEST_CASES.json', '{"test_cases":[]}');
    writeFile(dir, 'spec/04_BUILD_REPORT.json', '{"files_created":[],"setup_commands":[]}');
    writeFile(dir, 'spec/04_TEST_RESULTS.json', '{"summary":{},"results":[]}');
    try {
      assert.throws(
        () => captureAll(() =>
          cmdRunPhase({
            dir, args: ['deploy'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
          })
        ),
        /verify/i
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
