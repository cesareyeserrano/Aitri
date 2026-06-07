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
import { loadConfig, hashArtifact } from '../../lib/state.js';

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

  // rc.42 (ADR-042 Phase 3) — the briefing frames the artifact by its industry document type.
  it('frames the artifact as the Product Requirements Document (PRD)', () => {
    assert.ok(result.stdout.includes('Product Requirements Document (PRD'),
      'requirements briefing should name the industry document type so the agent reports it as the PRD');
  });

  // rc.44 (ADR-040) — the briefing distinguishes user-designated from self-discovered context.
  it('instructs that self-discovered context does not ground "confirmed"', () => {
    assert.ok(/found on your own/i.test(result.stdout) && /designated/i.test(result.stdout),
      'Phase 1 briefing must distinguish user-designated context (grounds confirmed) from self-discovered (assumed)');
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

// Phase 5b — `--guided` discovery is no longer dead in agent mode (used to hard-error).
describe('cmdRunPhase() — discovery --guided in agent mode (Phase 5b)', () => {
  it('prints an agent interview briefing instead of erroring when stdin is not a TTY', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      const { stdout } = captureAll(() =>
        cmdRunPhase({ dir, args: ['discovery', '--guided'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
      );
      assert.ok(stdout.includes('Agent Mode'), 'should print the agent-mode interview briefing');
      assert.ok(/Discovery \(--guided\)/.test(stdout), 'briefing titled for guided discovery');
      assert.ok(stdout.includes('REQUIRED FIELDS'), 'briefing lists the interview fields');
      assert.ok(stdout.includes('00_DISCOVERY.md'), 'briefing points at the discovery artifact');
    } finally {
      process.stdin.isTTY = origIsTTY;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does NOT throw the old "requires an interactive terminal" error in agent mode', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      assert.doesNotThrow(() =>
        captureAll(() =>
          cmdRunPhase({ dir, args: ['discovery', '--guided'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
        )
      );
    } finally {
      process.stdin.isTTY = origIsTTY;
      fs.rmSync(dir, { recursive: true, force: true });
    }
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

// A genuine re-do: the artifact CHANGED since approval (stored hash no longer
// matches on-disk content → hasDrift true). State is cleared and a loud warning
// is emitted. (finance-dashboard canary 2026-06-05: the clearing is correct here;
// what was wrong was clearing on an *unchanged* re-read — covered separately below.)
describe('cmdRunPhase() — clears approval on re-do of a changed phase', () => {
  let dir;
  let stderr;

  before(() => {
    dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1],
      completedPhases: [1],
      artifactHashes: { '1': 'stale-hash-from-before-the-edit' }, // ≠ current artifact → drift
    }));
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    ({ stderr } = captureAll(() =>
      cmdRunPhase({
        dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
      })
    ));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('removes phase from approvedPhases', () => {
    const config = loadConfig(dir);
    assert.ok(!config.approvedPhases.includes(1), 'phase 1 should not be approved after re-do');
  });

  it('removes phase from completedPhases', () => {
    const config = loadConfig(dir);
    assert.ok(!config.completedPhases.includes(1), 'phase 1 should not be completed after re-do');
  });

  it('adds phase to driftPhases', () => {
    const config = loadConfig(dir);
    assert.ok((config.driftPhases || []).map(String).includes('1'), 'phase 1 should be in driftPhases');
  });

  it('warns loudly that state was cleared', () => {
    assert.ok(/cleared that state/i.test(stderr), 'a real re-do must warn the operator that state was reset');
  });
});

// TPA-1 (third-party adopter DSB-AT-POC 2026-06-05): re-opening an APPROVED
// upstream phase via run-phase must cascade-invalidate downstream. Before the fix,
// run-phase removed only the re-opened phase from approvedPhases and set its drift,
// leaving downstream "approved"; the later re-approval then saw wasAlreadyApproved
// = false (run-phase had already removed it) so approve's cascade never fired and
// the pipeline reported "deployable" over a changed spec. complete.js already
// assumed run-phase performed this cascade — this makes it real.
describe('cmdRunPhase() — re-opening an approved phase cascade-invalidates downstream (TPA-1)', () => {
  let dir;
  let stderr;

  before(() => {
    dir = tmpDir();
    // Phases 1–4 approved (build done, deploy not yet). This avoids the
    // pipeline-complete TTY confirmation gate (all 5 approved + no TTY → exit) while
    // still exercising the cascade: re-opening Phase 1 must invalidate 2, 3 and 4.
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases:  [1, 2, 3, 4],
      completedPhases: [1, 2, 3, 4],
      verifyPassed: true,
      verifySummary: { passed: 10, failed: 0 },
      // stale hash on phase 1 ≠ on-disk artifact → drift → reset branch (not an
      // idempotent re-read), the path a re-derivation of an approved spec takes.
      artifactHashes: { '1': 'stale-hash-from-before-the-edit' },
    }));
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    ({ stderr } = captureAll(() =>
      cmdRunPhase({
        dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
      })
    ));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('removes the re-opened phase from approvedPhases', () => {
    const config = loadConfig(dir);
    assert.ok(!config.approvedPhases.map(String).includes('1'), 'phase 1 must not stay approved after re-open');
  });

  it('cascade-invalidates every downstream phase (2–4)', () => {
    const config = loadConfig(dir);
    for (const p of [2, 3, 4]) {
      assert.ok(
        !config.approvedPhases.map(String).includes(String(p)),
        `phase ${p} must be invalidated when phase 1 is re-opened — it was built on the old requirements`
      );
    }
    assert.equal(config.approvedPhases.length, 0, 'no phase should remain approved over a re-derived Phase 1');
  });

  it('marks downstream phases as cascade-pending (drift steering)', () => {
    const config = loadConfig(dir);
    for (const p of [2, 3, 4]) {
      assert.ok((config.cascadedPhases || []).map(String).includes(String(p)), `phase ${p} should be cascade-pending`);
    }
  });

  it('resets verify state because build/deploy are downstream', () => {
    const config = loadConfig(dir);
    assert.equal(config.verifyPassed, false, 'verifyPassed must reset when phase 4/5 are invalidated');
    assert.ok(!config.verifySummary, 'verifySummary must be cleared on downstream invalidation');
  });

  it('warns the operator that downstream was reset', () => {
    assert.ok(/Downstream phases were built on the old/i.test(stderr), 'the cascade must be surfaced to the operator');
  });
});

// Idempotent re-read (finance-dashboard canary 2026-06-05): re-printing the
// briefing of an already-completed/approved phase whose artifact is UNCHANGED must
// preserve state — no clearing, no drift flag, no `started` event.
describe('cmdRunPhase() — idempotent re-read of an unchanged approved phase', () => {
  let dir;
  let stderr;

  before(() => {
    dir = tmpDir();
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, '.aitri', minimalConfig({
      approvedPhases: [1],
      completedPhases: [1],
      // hash matches the on-disk artifact → hasDrift false → idempotent re-read
      artifactHashes: { '1': hashArtifact(VALID_REQUIREMENTS) },
    }));
    ({ stderr } = captureAll(() =>
      cmdRunPhase({
        dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR,
      })
    ));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps the phase approved', () => {
    const config = loadConfig(dir);
    assert.ok(config.approvedPhases.includes(1), 'approval must survive an unchanged re-read');
  });

  it('keeps the phase completed', () => {
    const config = loadConfig(dir);
    assert.ok(config.completedPhases.includes(1), 'completion must survive an unchanged re-read');
  });

  it('does not set drift', () => {
    const config = loadConfig(dir);
    assert.ok(!(config.driftPhases || []).map(String).includes('1'), 'an unchanged re-read must not flag drift');
  });

  it('does not append a started event', () => {
    const config = loadConfig(dir);
    const started = (config.events || []).find(e => e.event === 'started' && e.phase === 1);
    assert.ok(!started, 'an unchanged re-read must not log a started event');
  });

  it('tells the operator state was preserved', () => {
    assert.ok(/unchanged/i.test(stderr) && /without resetting/i.test(stderr),
      'the operator should be told the re-read preserved state');
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
