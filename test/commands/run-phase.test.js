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

describe('cmdRunPhase() — build surfaces design reference when a UX spec exists (AUDIT-0630-B / F1)', () => {
  const buildFixture = (dir, { ux = true } = {}) => {
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1, 2, 3], currentPhase: 3 }));
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '# Design\n'.repeat(10));
    writeFile(dir, 'spec/03_TEST_CASES.json', '{"test_cases":[]}');
    if (ux) writeFile(dir, 'spec/01_UX_SPEC.md', '# UX Spec\n\nSemantic color: over-budget red.');
  };

  it('lists context assets in ANY form (F1: readable .md/.txt, not only visuals) so the agent opens them', () => {
    const dir = tmpDir();
    buildFixture(dir);
    writeFile(dir, 'idea_context/mockup-budget.png', 'x');
    writeFile(dir, 'idea_context/demo.html', '<html>offline prototype</html>');
    writeFile(dir, 'idea_context/notes.md', 'a readable design doc');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['build'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(/Design reference/.test(stdout), 'build briefing surfaces the design reference note');
    assert.ok(stdout.includes('idea_context/mockup-budget.png'), 'the mockup is listed with its path');
    assert.ok(stdout.includes('idea_context/demo.html'), 'an .html prototype is surfaced too (the Ledger demo case)');
    assert.ok(stdout.includes('idea_context/notes.md'),
      'F1: a readable .md design doc is NOW surfaced as a pointer — form-agnostic, no fixed-extension filter');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // UPLAN-0703 C2, integration level: the assets/design blocks render INSIDE the briefing
  // (via {{CONTEXT_ASSETS}}), BEFORE the instructions — not appended after the checklist.
  // The C7 suite pins this at the buildBriefing layer; this pins the cmdRunPhase composition
  // (assetsNote construction → placeholder interpolation → no duplicate fallback print).
  it('C2: the design-reference block renders inside the build briefing, before Test Specs — and only once', () => {
    const dir = tmpDir();
    buildFixture(dir);
    writeFile(dir, 'idea_context/mockup.png', 'x');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['build'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    const block = stdout.indexOf('Design reference');
    const specs = stdout.indexOf('## Test Specs');
    const done  = stdout.indexOf('## Technical Definition of Done');   // section header — the persona text also names it near the top
    assert.ok(block !== -1 && specs !== -1 && done !== -1, 'all three sections present');
    assert.ok(block < specs, 'the design reference must precede the Test Specs the agent implements to');
    assert.ok(block < done, 'the design reference must precede the instructions/DoD block');
    assert.equal(stdout.indexOf('Design reference'), stdout.lastIndexOf('Design reference'),
      'the block renders ONCE — the after-briefing fallback must not double-print it');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('F1 regression: a readable design doc with NO visual assets still surfaces at build', () => {
    const dir = tmpDir();
    buildFixture(dir);
    // The exact F1 trace: an authoritative readable design reference, no image/.html to trigger the old filter.
    writeFile(dir, 'idea_context/DESIGN_SYSTEM.md', 'BUTTON_RADIUS=4px; PRIMARY=#0055FF');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['build'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(/Design reference/.test(stdout),
      'the block fires even when the only asset is readable text (old visualAssets+.html filter left it empty)');
    assert.ok(stdout.includes('idea_context/DESIGN_SYSTEM.md'),
      'the readable design doc reaches the builder as a pointer instead of vanishing silently');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('excludes ADOPTION_AUDIT.md from the design-reference list (it has its own framed block)', () => {
    const dir = tmpDir();
    buildFixture(dir);
    writeFile(dir, 'idea_context/ADOPTION_AUDIT.md', '# Existing code audit');
    writeFile(dir, 'idea_context/mockup.png', 'x');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['build'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(/Design reference/.test(stdout), 'the design-reference block still fires for the mockup');
    const refBlock = stdout.slice(stdout.indexOf('Design reference'));
    assert.ok(!refBlock.includes('idea_context/ADOPTION_AUDIT.md'),
      'ADOPTION_AUDIT.md is not double-listed in the design-reference block');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT surface context at build when there is no UX spec (backend-only build keeps the default)', () => {
    const dir = tmpDir();
    buildFixture(dir, { ux: false });
    writeFile(dir, 'idea_context/diagram.png', 'x');
    writeFile(dir, 'idea_context/spec.md', 'a spec');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['build'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(!/Design reference/.test(stdout),
      'no context surfaced without a UX spec — the deliberate "no raw context at build" default is preserved');
    fs.rmSync(dir, { recursive: true, force: true });
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

  // ADV-0622-16 / H-3 — the rc.107 audit-consumption seam, end-to-end. `adopt apply`
  // relocates ADOPTION_AUDIT.md into idea_context/ (tested in adopt.test.js); the OTHER
  // half is that a CONTEXT phase then actually surfaces it to the agent. This pins the
  // AUDIT artifact by name (not a generic asset), so a context-folder filter that dropped
  // `.md` files — which the mockup.png test would not catch — is caught here.
  it('surfaces a relocated ADOPTION_AUDIT.md to the Phase 1 briefing (audit-consumption seam)', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    // post-`adopt apply` state: the audit lives in the unit's idea_context/
    writeFile(dir, 'idea_context/ADOPTION_AUDIT.md', '# Adoption Audit\nFindings the agent must ground Phase 1 in.\n');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(stdout.includes('idea_context/ADOPTION_AUDIT.md'),
      'the Phase 1 briefing must list the relocated audit so the agent grounds requirements in it');
    // ADV-0622-08: the audit is singled out by name with grounding language, and Phase 1
    // is framed as PRIMARY input (no upstream artifact is approved yet).
    assert.match(stdout, /ADOPTION_AUDIT\.md is the adoption audit/, 'audit must be called out by name');
    assert.match(stdout, /PRIMARY input/, 'Phase 1 context must be framed as primary input, not "reference only"');
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
    assert.ok(stderr.includes('mv idea/* idea_context/'), 'should give the move command (layout-resolved target)');
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

  it('passes the FULL system design to the build briefing — no head(160) truncation (ADV-0622-02)', () => {
    // End-to-end guard: run-phase applies the PRODUCER's extractContext to each consumed input,
    // so this is where a head(…,160) cap on 02_SYSTEM_DESIGN.md would truncate the developer's
    // design. A direct buildBriefing test bypasses this layer and cannot catch the regression.
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    const design = ['# System Design', '',
      ...Array(220).fill('filler architecture line'),
      '## Deployment Architecture', 'Deploy as a single Go binary behind nginx.'].join('\n');
    writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', design);
    writeFile(dir, 'spec/03_TEST_CASES.json', '{"test_plan":{},"test_cases":[]}');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['build'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(stdout.includes('single Go binary behind nginx'),
      'a design section past line 160 must reach the developer briefing (no truncation)');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ADR-066: the intake used to list every context asset as a bare PATH and bet the agent would open
// each on request. The Ledger pilot falsified that bet — the agent read the .md spec but silently
// skipped the mockups and the .html prototype. At the grounding/design phases, readable text is now
// INJECTED in full (a skip becomes impossible) and unreadable/oversized material gets a loud "OPEN
// each" pointer. These tests pin both halves and the phase scoping.
describe('cmdRunPhase() — intake injects readable context, flags the unreadable (ADR-066)', () => {
  it('injects the CONTENT of a readable text asset into the Phase 1 briefing, not just its path', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, 'idea_context/client-spec.md',
      '# Client Spec\nThe primary accent MUST be #4a7fa5. The delete flow MUST reassign to a sibling category.');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(stdout.includes('#4a7fa5') && stdout.includes('reassign to a sibling category'),
      'the spec CONTENT is injected into the briefing, so the agent cannot silently skip it');
    assert.match(stdout, /included IN FULL/, 'injected material is framed as authoritative, read-and-reflect');
    assert.ok(stdout.includes('idea_context/client-spec.md'), 'the injected file is still identified by path');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT inject a binary or oversized text asset — it surfaces a loud OPEN-each pointer', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, 'idea_context/mockup.png', 'x');
    const oversized = '# Prototype\n' + 'A'.repeat(40000);   // > MAX_INJECT_BYTES → pointer, not inlined
    writeFile(dir, 'idea_context/prototype.html', oversized);
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.match(stdout, /OPEN each one before writing/, 'unreadable/oversized material gets the loud open instruction');
    assert.ok(stdout.includes('idea_context/mockup.png'), 'the binary mockup is surfaced by path');
    assert.ok(stdout.includes('idea_context/prototype.html'), 'oversized text falls back to a pointer, by path');
    assert.ok(!stdout.includes('A'.repeat(40000)), 'the oversized body is NOT inlined into the briefing');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT inject raw context CONTENT at execution phases (build stays context-excluded)', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig({ approvedPhases: [1, 2, 3], currentPhase: 3 }));
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '# Design\n'.repeat(10));
    writeFile(dir, 'spec/03_TEST_CASES.json', '{"test_cases":[]}');
    writeFile(dir, 'idea_context/client-spec.md', 'SECRET_MARKER_CONTENT the build must not inline');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['build'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(!stdout.includes('SECRET_MARKER_CONTENT'), 'build phase must not inline idea_context text content');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT inline a binary file with a text extension — NUL-byte sniff falls to a pointer', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    fs.mkdirSync(path.join(dir, 'idea_context'), { recursive: true });
    // a .json (whitelisted extension) that is actually binary: PNG magic + a NUL byte
    fs.writeFileSync(path.join(dir, 'idea_context', 'blob.json'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04]));
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(stdout.includes('idea_context/blob.json'), 'the binary-with-text-extension is surfaced by path');
    assert.match(stdout, /OPEN each one before writing/, 'a binary blob is a pointer, never inlined as mojibake');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('injects smallest-first and loudly warns when the total budget demotes a readable file (no silent starvation)', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    // readable text well over the 96KB per-briefing budget: four ~31KB files + one small critical file.
    for (const n of ['a', 'b', 'c', 'd']) writeFile(dir, `idea_context/${n}-big.md`, n.toUpperCase().repeat(31000));
    writeFile(dir, 'idea_context/z-small.md', 'Z_CRITICAL_REQUIREMENT_MARKER — small but must not be starved');
    const { stdout, stderr } = captureAll(() =>
      cmdRunPhase({ dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(stdout.includes('Z_CRITICAL_REQUIREMENT_MARKER'),
      'smallest-first ordering keeps the small file injected — a large file cannot starve it');
    assert.match(stderr, /exceeded the per-briefing injection/,
      'a readable file demoted by the budget is surfaced loudly on stderr, never silently dropped to a pointer');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('injects feature_context content in a FEATURE sub-pipeline, not just root idea_context (scope parity)', () => {
    const parent = tmpDir();
    writeFile(parent, '.aitri', minimalConfig());   // parent must load for the parent-context pointer block
    const dir = tmpDir();                            // the feature pipeline dir
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'FEATURE_IDEA.md', '# Feature\n\n## Problem / Why\nx\n## Target Users\nx\n## New Behavior\nx\n## Success Criteria\nx\n');
    writeFile(dir, 'feature_context/fspec.md', 'FEATURE_CONTEXT_MARKER — the client feature spec, authoritative');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['requirements'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR, featureRoot: parent, scopeName: 'foo' })
    );
    assert.ok(stdout.includes('FEATURE_CONTEXT_MARKER'), 'feature_context readable text is injected in a feature pipeline (same path as root)');
    assert.ok(stdout.includes('feature_context/fspec.md'), 'the feature_context file is identified by path');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(parent, { recursive: true, force: true });
  });
});

// ADOPT-BUILD-0628: the build phase is otherwise context-excluded, but an adoption build must be
// grounded in the existing code or it modifies the system blind. The adoption audit (relocated into
// idea_context/ by `adopt apply`) is surfaced to Phase 4 with an instruction to read current source.
describe('cmdRunPhase() — adoption build grounded in existing-code reality (ADOPT-BUILD-0628)', () => {
  const buildSpec = (dir) => {
    writeFile(dir, '.aitri', minimalConfig());
    writeFile(dir, 'IDEA.md', IDEA_CONTENT);
    writeFile(dir, 'spec/01_REQUIREMENTS.json', VALID_REQUIREMENTS);
    writeFile(dir, 'spec/02_SYSTEM_DESIGN.md', '# System Design\n\nArchitecture details.\n');
    writeFile(dir, 'spec/03_TEST_CASES.json', '{"test_plan":{},"test_cases":[]}');
  };

  it('surfaces ADOPTION_AUDIT.md + a read-the-code instruction to the build briefing', () => {
    const dir = tmpDir();
    buildSpec(dir);
    writeFile(dir, 'idea_context/ADOPTION_AUDIT.md', '# Adoption Audit\nExisting code reality.\n');
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['build'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(stdout.includes('idea_context/ADOPTION_AUDIT.md'),
      'the build briefing must point at the adoption audit (existing-code reality)');
    assert.match(stdout, /adoption build/i, 'the build must be framed as building on an existing codebase');
    assert.match(stdout, /current source of every file you will touch/i,
      'the build must be told to read the actual current code before modifying');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT add the adoption block for a greenfield build (no ADOPTION_AUDIT.md)', () => {
    const dir = tmpDir();
    buildSpec(dir);
    writeFile(dir, 'idea_context/mockup.png', 'x'); // assets present, but no audit
    const { stdout } = captureAll(() =>
      cmdRunPhase({ dir, args: ['build'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    );
    assert.ok(!/Existing-code reality/.test(stdout),
      'a greenfield build must not get the adoption grounding block');
    assert.ok(!stdout.includes('idea_context/mockup.png'),
      'and it must still not inject the asset folder into the build (unchanged)');
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

describe('cmdRunPhase() — bare invocation reads as usage (UX-PRO-0707 follow-up)', () => {
  it('no phase argument → usage line, never the JS literal `Unknown phase "undefined"`', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    try {
      let captured = '';
      const err = (msg) => { captured = msg; throw new Error(msg); };
      try {
        cmdRunPhase({ dir, args: [], flagValue: makeFlagValue(), err, rootDir: ROOT_DIR });
      } catch { /* expected */ }
      assert.match(captured, /Usage: aitri run-phase <phase>/, 'bare run-phase is a usage error');
      assert.doesNotMatch(captured, /undefined/, 'the JS literal must not leak into output');
      assert.match(captured, /requirements\(1\)/, 'still lists the valid phases');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('a wrong phase still reads as Unknown phase "<arg>"', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    try {
      let captured = '';
      const err = (msg) => { captured = msg; throw new Error(msg); };
      try {
        cmdRunPhase({ dir, args: ['banana'], flagValue: makeFlagValue(), err, rootDir: ROOT_DIR });
      } catch { /* expected */ }
      assert.match(captured, /Unknown phase "banana"/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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
  it('echoes the bad input and lists names + numbers (UX-PRO-0707 3.3 #7)', () => {
    const dir = tmpDir();
    writeFile(dir, '.aitri', minimalConfig());
    try {
      let captured = '';
      const err = (msg) => { captured = msg; throw new Error(msg); };
      assert.throws(
        () => captureAll(() =>
          cmdRunPhase({
            dir, args: ['nonexistent'], flagValue: makeFlagValue(), err, rootDir: ROOT_DIR,
          })
        ),
      );
      assert.match(captured, /Unknown phase "nonexistent"/, 'echoes the bad input');
      assert.match(captured, /requirements\(1\)/, 'lists names with numbers');
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

// TPA-11: re-deriving a cascade-pending phase shows the FR delta (added/removed since
// it was last approved) so the agent re-derives against the change, not blind.
describe('cmdRunPhase() — FR delta on a cascaded re-derivation (TPA-11)', () => {
  let dir;
  let stderr;

  before(() => {
    dir = tmpDir();
    // Requirements NOW carry FR-003 too — added since phase 2 was last approved.
    writeFile(dir, 'spec/01_REQUIREMENTS.json', JSON.stringify({
      project_name: 'T',
      functional_requirements: [{ id: 'FR-001' }, { id: 'FR-002' }, { id: 'FR-003' }],
    }));
    writeFile(dir, '.aitri', minimalConfig({
      cascadedPhases: ['2'],
      frSnapshots: { '2': ['FR-001', 'FR-002'] }, // snapshot from phase 2's last approval (no FR-003)
    }));
    ({ stderr } = captureAll(() =>
      cmdRunPhase({ dir, args: ['architecture'], flagValue: makeFlagValue(), err: noopErr, rootDir: ROOT_DIR })
    ));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('announces the requirements changed since last approval', () => {
    assert.ok(/Requirements changed since this phase was last approved/i.test(stderr));
  });

  it('names the added FR so it is not re-omitted', () => {
    assert.ok(/added:.*FR-003/.test(stderr), 'the newly-added FR must be surfaced');
  });
});
