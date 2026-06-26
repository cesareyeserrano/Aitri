import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PHASE_DEFS } from '../../lib/phases/index.js';

const validP4 = () => JSON.stringify({
  files_created: ['src/index.js', 'src/db.js'],
  setup_commands: ['npm install', 'npm test'],
  environment_variables: [{ name: 'DATABASE_URL', default: 'postgres://localhost/dev' }],
  technical_debt: [],
  test_runner: 'npm test',
  test_files: ['tests/unit.test.js'],
});

describe('Phase 4 — validate()', () => {

  it('passes with valid artifact', () => {
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(validP4()));
  });

  it('passes with declared technical_debt entries', () => {
    const d = JSON.parse(validP4());
    d.technical_debt = [{ fr_id: 'FR-003', substitution: 'HTML table', reason: 'library conflict', effort_to_fix: 'medium' }];
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(d)));
  });

  // GENERIC substitution now catches the near-misses agents write, not just the
  // bare words (audit Tier-2 false-accept).
  for (const generic of ['no debt incurred', 'nothing', 'not applicable', '—', '-', 'various', 'see above']) {
    it(`rejects a generic technical_debt substitution: "${generic}"`, () => {
      const d = JSON.parse(validP4());
      d.technical_debt = [{ fr_id: 'FR-003', substitution: generic, reason: 'x', effort_to_fix: 'low' }];
      assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /generic or empty substitution/);
    });
  }

  it('throws when files_created is missing and files_modified is absent', () => {
    const d = JSON.parse(validP4());
    delete d.files_created;
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /files_created or files_modified must be a non-empty array/);
  });

  // alpha.9: setup_commands / environment_variables are now optional.
  // Absence ≡ []. The canary (alpha.7) hit three sequential rejections because
  // the briefing presented these as `[]`-by-default while the validator
  // required the keys to be present. Round-trip aligned per ADR-029.
  it('passes when setup_commands is absent (treated as [])', () => {
    const d = JSON.parse(validP4());
    delete d.setup_commands;
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(d)));
  });

  it('passes when environment_variables is absent (treated as [])', () => {
    const d = JSON.parse(validP4());
    delete d.environment_variables;
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(d)));
  });

  it('passes when setup_commands and environment_variables are explicitly []', () => {
    const d = JSON.parse(validP4());
    d.setup_commands = [];
    d.environment_variables = [];
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(d)));
  });

  it('throws when setup_commands is the wrong type (e.g. string)', () => {
    const d = JSON.parse(validP4());
    d.setup_commands = 'npm install';
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /setup_commands must be an array/);
  });

  it('throws when files_created is empty and files_modified is absent', () => {
    const d = JSON.parse(validP4());
    d.files_created = [];
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /files_created or files_modified must be a non-empty array/);
  });

  it('passes when files_created is empty but files_modified is non-empty', () => {
    const d = JSON.parse(validP4());
    d.files_created = [];
    d.files_modified = ['src/index.js'];
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(d)));
  });

  it('passes when only files_modified is present (no files_created)', () => {
    const d = JSON.parse(validP4());
    delete d.files_created;
    d.files_modified = ['src/feature.js', 'src/utils.js'];
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(d)));
  });

  it('throws when both files_created and files_modified are empty', () => {
    const d = JSON.parse(validP4());
    d.files_created = [];
    d.files_modified = [];
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /files_created or files_modified must be a non-empty array/);
  });

  // Element-type guard (FB-MULTI-0619 T1.2): files arrays are flat string paths.
  // Three adopters wrote them as arrays of objects, which passed the Array check
  // then crashed path.join with a raw Node TypeError naming no field.
  it('rejects files_created entries that are objects, naming the field and shape', () => {
    const d = JSON.parse(validP4());
    d.files_created = [{ path: 'src/index.js', type: 'source', key_functions: ['main'] }];
    assert.throws(
      () => PHASE_DEFS[4].validate(JSON.stringify(d)),
      /files_created\[0\] must be a non-empty string path — got object[\s\S]*not objects/
    );
  });

  it('rejects files_modified entries that are not strings', () => {
    const d = JSON.parse(validP4());
    d.files_modified = ['src/ok.js', 42];
    assert.throws(
      () => PHASE_DEFS[4].validate(JSON.stringify(d)),
      /files_modified\[1\] must be a non-empty string path — got number/
    );
  });

  it('rejects test_files entries that are objects (prevents the path.join crash)', () => {
    const d = JSON.parse(validP4());
    d.test_files = [{ path: 'tests/unit.test.js' }];
    assert.throws(
      () => PHASE_DEFS[4].validate(JSON.stringify(d)),
      /test_files\[0\] must be a non-empty string path/
    );
  });

  // quality_gates.timeout_ms — per-gate timeout enablement (additive). A slow gate
  // (mutation testing, full integration/e2e) needs to run past the 5-min default
  // instead of being killed and mis-read as a code failure.
  it('passes with a positive quality_gates timeout_ms', () => {
    const d = JSON.parse(validP4());
    d.quality_gates = [{ name: 'mutation', command: 'npx stryker run', required: true, timeout_ms: 1800000 }];
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(d)));
  });

  it('rejects a non-positive or non-numeric quality_gates timeout_ms', () => {
    const d = JSON.parse(validP4());
    d.quality_gates = [{ name: 'mutation', command: 'npx stryker run', timeout_ms: 0 }];
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /timeout_ms must be a positive number/);
    d.quality_gates = [{ name: 'mutation', command: 'npx stryker run', timeout_ms: 'long' }];
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /timeout_ms must be a positive number/);
  });

  it('rejects empty-string path entries', () => {
    const d = JSON.parse(validP4());
    d.files_created = ['src/ok.js', '   '];
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /files_created\[1\] must be a non-empty string path/);
  });

  // substitution-vs-description hint (T1.2): name the misnaming, not bare "empty".
  it('hints when technical_debt content is under "description" instead of "substitution"', () => {
    const d = JSON.parse(validP4());
    d.technical_debt = [{ fr_id: 'FR-003', description: 'swapped the live API for a stub', reason: 'x', effort_to_fix: 'low' }];
    assert.throws(
      () => PHASE_DEFS[4].validate(JSON.stringify(d)),
      /the field is "substitution", but this entry has its content under "description"\. Rename "description" to "substitution"/
    );
  });

  it('does NOT misfire the description hint when "reason" (a real sibling field) is present', () => {
    const d = JSON.parse(validP4());
    d.technical_debt = [{ fr_id: 'FR-003', substitution: '', reason: 'library conflict', effort_to_fix: 'low' }];
    assert.throws(
      () => PHASE_DEFS[4].validate(JSON.stringify(d)),
      /describe exactly what was simplified/
    );
  });

  it('throws when technical_debt field is absent', () => {
    const d = JSON.parse(validP4());
    delete d.technical_debt;
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /technical_debt field is required/);
  });

  it('passes when technical_debt is empty array []', () => {
    const d = JSON.parse(validP4());
    d.technical_debt = [];
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(d)));
  });

  it('throws when technical_debt entry is missing fr_id', () => {
    const d = JSON.parse(validP4());
    d.technical_debt = [{ substitution: 'HTML table', reason: 'conflict', effort_to_fix: 'low' }];
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /missing fr_id/);
  });

  it('throws when technical_debt entry has generic substitution', () => {
    const d = JSON.parse(validP4());
    d.technical_debt = [{ fr_id: 'FR-003', substitution: 'placeholder declared', reason: 'time', effort_to_fix: 'high' }];
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /generic or empty substitution/);
  });

  it('throws when technical_debt entry has empty substitution', () => {
    const d = JSON.parse(validP4());
    d.technical_debt = [{ fr_id: 'FR-003', substitution: '', reason: 'time', effort_to_fix: 'high' }];
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /generic or empty substitution/);
  });

  it('passes when technical_debt entry is fully described', () => {
    const d = JSON.parse(validP4());
    d.technical_debt = [{ fr_id: 'FR-003', substitution: 'Used static PNG instead of animated Chart.js component', reason: 'chart lib conflict with bundler', effort_to_fix: 'medium' }];
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(d)));
  });

  it('throws when test_runner is missing', () => {
    const d = JSON.parse(validP4());
    delete d.test_runner;
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /test_runner is required/);
  });

  it('throws when test_runner is empty string', () => {
    const d = JSON.parse(validP4());
    d.test_runner = '';
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /test_runner is required/);
  });

  it('throws when test_files is missing', () => {
    const d = JSON.parse(validP4());
    delete d.test_files;
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /test_files must be a non-empty array/);
  });

  it('throws when test_files is empty array', () => {
    const d = JSON.parse(validP4());
    d.test_files = [];
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(d)), /test_files must be a non-empty array/);
  });

  it('passes with test_runner and test_files declared', () => {
    const d = JSON.parse(validP4());
    d.test_runner = 'node --test tests/';
    d.test_files = ['tests/unit.test.js', 'tests/integration.test.js'];
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(d)));
  });
});

describe('Phase 4 — buildBriefing() (BL-004)', () => {
  const briefing = PHASE_DEFS[4].buildBriefing({ dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '', '03_TEST_CASES.json': '{}' }, feedback: null });

  it('briefing labels test cases as "Test Specs" not "Test Index"', () => {
    assert.ok(briefing.includes('Test Specs'), 'must say "Test Specs" to signal full TC contract');
    assert.ok(!briefing.includes('## Test Index'), 'old label "Test Index" must not appear');
  });

  it('briefing instructs developer to implement exactly to given/when/then', () => {
    assert.ok(briefing.includes('given/when/then'), 'briefing must reference given/when/then as implementation contract');
  });

  // buildBriefing itself never truncates; the real truncation point is run-phase applying
  // the producer's extractContext, guarded end-to-end in run-phase.test.js (ADV-0622-02).
  // This stays as a buildBriefing-level check that a long design renders intact.
  it('buildBriefing renders a long design intact (end-to-end truncation guard is in run-phase.test.js)', () => {
    const design = [
      '## Executive Summary', 'x',
      ...Array(220).fill('filler design line'),
      '## Deployment Architecture', 'Deploy as a single Go binary behind nginx.',
    ].join('\n');
    const b = PHASE_DEFS[4].buildBriefing({
      dir: '/tmp/test',
      inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': design, '03_TEST_CASES.json': '{}' },
      feedback: null,
    });
    assert.ok(b.includes('single Go binary behind nginx'),
      'a design section past line 200 must reach the developer briefing');
  });

  it('briefing contains Definition of Done', () => {
    assert.ok(briefing.includes('Definition of Done'), 'briefing must include Technical Definition of Done');
  });

  it('briefing contains @aitri-trace header instruction', () => {
    assert.ok(briefing.includes('@aitri-trace'), 'briefing must mention @aitri-trace headers');
  });

  it('briefing contains 3-phase implementation roadmap', () => {
    assert.ok(briefing.includes('skeleton') && briefing.includes('hardening'),
      'briefing must include skeleton and hardening phases');
  });

  // SEC-TRACE-1: @aitri-trace mandated in source must never reach publicly-served
  // assets — a deployed Aitri-built site leaked its full FR/UX map through HTML/JS
  // comments (external security scan, 2026-05-29). The briefing AND the developer
  // persona must carry the no-shipping rule, or every web project leaks by default.
  it('briefing forbids @aitri-trace in publicly-served assets (SEC-TRACE-1)', () => {
    assert.ok(briefing.includes('never in shipped public output'),
      'briefing must state traces live in source, never in shipped public output');
    const reviewSection = briefing.slice(briefing.indexOf('Human Review'));
    assert.ok(reviewSection.includes('publicly-served assets'),
      'Human Review must include the publicly-served assets check');
  });

  it('developer persona forbids shipping traces in public assets (SEC-TRACE-1)', async () => {
    const { CONSTRAINTS, REASONING } = await import('../../lib/personas/developer.js');
    assert.match(CONSTRAINTS, /Never ship @aitri-trace/);
    assert.match(REASONING, /Bad trace placement/);
  });

  // SMOKE-RUN-0625: a green suite can still ship an app that 500s on first boot —
  // nothing in the test run starts the running product. The build briefing must
  // instruct the agent to declare a smoke quality_gate, stack-agnostically (only when
  // the target serves requests — a library/CLI/batch has nothing to boot, principle 4).
  it('briefing instructs a smoke/boot gate for serving targets (SMOKE-RUN-0625)', () => {
    assert.ok(/smoke gate/i.test(briefing), 'briefing must describe a smoke gate');
    assert.ok(briefing.includes('boots the product') || briefing.includes('start the app'),
      'briefing must tie the smoke gate to actually booting the running app');
  });

  it('smoke-gate instruction is stack-agnostic — conditional on a serving target, not imperative (SMOKE-RUN-0625)', () => {
    // Conditional guard present: applies only when the target serves requests.
    assert.ok(/serves requests/i.test(briefing),
      'smoke instruction must be guarded on a serving target');
    // Explicit opt-out for non-serving targets so it is not read as a universal MUST
    // (phrase is unique to the smoke block).
    assert.ok(/library, CLI, or batch/i.test(briefing),
      'smoke instruction must tell library/CLI/batch targets to skip it (no invented server)');
  });

  it('developer persona reinforces the smoke gate, conditionally (SMOKE-RUN-0625)', async () => {
    const { REASONING, CONSTRAINTS } = await import('../../lib/personas/developer.js');
    assert.match(REASONING, /smoke quality_gate/);
    assert.match(REASONING, /serves requests/);
    // Must NOT be an absolute "Never …" constraint — a library has nothing to boot.
    assert.ok(!/Never[^.\n]*smoke/i.test(CONSTRAINTS),
      'smoke must be conditional reasoning, not an absolute constraint');
  });

  it('briefing contains US-ID in @aitri-trace example (BL-006)', () => {
    assert.ok(briefing.includes('US-ID'), 'briefing @aitri-trace must include US-ID for full traceability');
  });

  it('briefing contains AC-ID in @aitri-trace example (BL-006)', () => {
    assert.ok(briefing.includes('AC-ID'), 'briefing @aitri-trace must include AC-ID for full traceability');
  });

  it('briefing contains Human Review checklist', () => {
    assert.ok(briefing.includes('Human Review'), 'briefing must include Human Review section');
  });

  it('debug mode not present when no failingTests', () => {
    assert.ok(!briefing.includes('Debug Mode'), 'debug mode must not appear without failingTests');
  });

  it('Human Review checklist covers technical_debt and files_created', () => {
    const reviewIdx = briefing.indexOf('Human Review');
    const reviewSection = briefing.slice(reviewIdx);
    assert.ok(reviewSection.includes('technical_debt') && reviewSection.includes('files_created'),
      'Human Review must cover technical_debt and files_created checks');
  });

  it('briefing contains test_runner in manifest output schema', () => {
    assert.ok(briefing.includes('test_runner'), 'briefing must include test_runner in output schema');
  });

  it('briefing contains test_files in manifest output schema', () => {
    assert.ok(briefing.includes('test_files'), 'briefing must include test_files in output schema');
  });

  it('briefing does not include Test Authorship Lock section when no TCs (empty inputs)', () => {
    assert.ok(!briefing.includes('Test Authorship Lock'), 'authorship lock must not appear when 03_TEST_CASES.json has no test_cases');
  });
});

describe('Phase 4 — buildBriefing() with TC and FR data', () => {
  const reqsWithFRs = JSON.stringify({
    functional_requirements: [
      { id: 'FR-001', priority: 'MUST', type: 'persistence', title: 'Budget storage', acceptance_criteria: 'Budget persists across page reload' },
    ],
  });
  const tcsWithCases = JSON.stringify({
    test_cases: [
      { id: 'TC-001', requirement_id: 'FR-001', title: 'setBudget persists to localStorage', type: 'unit' },
    ],
  });
  const richBriefing = PHASE_DEFS[4].buildBriefing({
    dir: '/tmp/test',
    inputs: { '01_REQUIREMENTS.json': reqsWithFRs, '02_SYSTEM_DESIGN.md': '', '03_TEST_CASES.json': tcsWithCases },
    feedback: null,
  });

  it('briefing includes Requirements Snapshot section when FRs are present', () => {
    assert.ok(richBriefing.includes('Requirements Snapshot'), 'must include Requirements Snapshot for context retention');
  });

  it('briefing includes FR-001 in snapshot', () => {
    assert.ok(richBriefing.includes('FR-001'), 'FR-001 must appear in requirements snapshot');
  });

  it('briefing includes Test Authorship Lock when TCs are present', () => {
    assert.ok(richBriefing.includes('Test Authorship Lock'), 'Test Authorship Lock must appear when 03_TEST_CASES.json has test_cases');
  });

  it('briefing lists TC-001 in authorship lock', () => {
    assert.ok(richBriefing.includes('TC-001'), 'TC-001 must appear in authorship lock list');
  });

  it('briefing includes @aitri-tc marker instruction in authorship lock', () => {
    assert.ok(richBriefing.includes('// @aitri-tc TC-XXX'), 'briefing must instruct agent to use @aitri-tc markers in test code');
  });
});

describe('Phase 4 — buildBriefing() debug mode', () => {
  const failingTests = [
    { tc_id: 'TC-007', notes: 'AssertionError: expected 401, got 200 at auth.test.js:42' },
    { tc_id: 'TC-012', notes: '' },
  ];
  const debugBriefing = PHASE_DEFS[4].buildBriefing({
    dir: '/tmp/test',
    inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '', '03_TEST_CASES.json': '{}' },
    feedback: null,
    failingTests,
  });

  it('debug mode section appears when failingTests provided', () => {
    assert.ok(debugBriefing.includes('Debug Mode'), 'Debug Mode section must appear when failingTests is non-empty');
  });

  it('debug mode lists failing TC ids', () => {
    assert.ok(debugBriefing.includes('TC-007'), 'TC-007 must appear in debug mode section');
    assert.ok(debugBriefing.includes('TC-012'), 'TC-012 must appear in debug mode section');
  });

  it('debug mode includes failing TC notes', () => {
    assert.ok(debugBriefing.includes('AssertionError: expected 401, got 200'), 'notes from failing TC must appear');
  });

  it('debug mode includes minimal fix protocol', () => {
    assert.ok(debugBriefing.includes('minimal fix'), 'debug protocol must instruct minimal fix');
  });

  it('[v0.1.28] briefing renders artifact path using artifactsBase when provided', () => {
    const b = PHASE_DEFS[4].buildBriefing({
      dir: '/tmp/test',
      inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '', '03_TEST_CASES.json': '{}' },
      feedback: null, failingTests: undefined,
      artifactsBase: '/tmp/test/spec',
    });
    assert.ok(b.includes('/tmp/test/spec/04_BUILD_REPORT.json'), 'artifact path must use artifactsBase/spec');
    assert.ok(!b.includes('/tmp/test/04_BUILD_REPORT.json'), 'artifact path must NOT use bare dir');
  });

  it('[v0.1.28] injects bestPractices content when provided', () => {
    const b = PHASE_DEFS[4].buildBriefing({
      dir: '/tmp/test',
      inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '', '03_TEST_CASES.json': '{}' },
      feedback: null, failingTests: undefined,
      bestPractices: 'No hardcoded secrets or environment-specific values',
    });
    assert.ok(b.includes('No hardcoded secrets'), 'best practices content must appear in briefing');
  });

  it('[v0.1.28] omits best practices block when bestPractices is empty', () => {
    const b = PHASE_DEFS[4].buildBriefing({
      dir: '/tmp/test',
      inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '', '03_TEST_CASES.json': '{}' },
      feedback: null, failingTests: undefined,
      bestPractices: '',
    });
    assert.ok(!b.includes('Coding Standards'), 'Coding Standards header must not appear when bestPractices is empty');
  });
});

describe('phase4.buildTDDRecommendation()', () => {
  it('recommends TDD for stateful MUST FR with >4 ACs', () => {
    const reqs = JSON.stringify({
      functional_requirements: [{
        id: 'FR-001', priority: 'MUST', type: 'api', title: 'Auth',
        acceptance_criteria: [
          'Rejects invalid token', 'Returns 401 on error', 'Session expires after 30m',
          'Rate limit after 5 fails', 'CSRF token validated', 'Unauthorized on missing header',
        ],
      }],
    });
    const rec = PHASE_DEFS[4].buildTDDRecommendation(reqs);
    assert.ok(rec.includes('FR-001'));
    assert.ok(rec.includes('TDD recommended'));
  });

  it('recommends Test-After for UX type FR', () => {
    const reqs = JSON.stringify({
      functional_requirements: [{
        id: 'FR-002', priority: 'MUST', type: 'ux', title: 'Dark mode',
        acceptance_criteria: ['Colors match design', 'Toggle visible', 'State persists', 'Smooth transition', 'Accessible contrast'],
      }],
    });
    const rec = PHASE_DEFS[4].buildTDDRecommendation(reqs);
    assert.ok(rec.includes('FR-002'));
    assert.ok(rec.includes('Test-After'));
  });

  it('recommends Test-After for FR with <=4 ACs', () => {
    const reqs = JSON.stringify({
      functional_requirements: [{
        id: 'FR-003', priority: 'MUST', type: 'api', title: 'Health check',
        acceptance_criteria: ['Returns 200', 'Responds in <100ms'],
      }],
    });
    const rec = PHASE_DEFS[4].buildTDDRecommendation(reqs);
    assert.ok(rec.includes('Test-After'));
  });

  it('returns empty string when no MUST FRs', () => {
    const reqs = JSON.stringify({
      functional_requirements: [
        { id: 'FR-001', priority: 'SHOULD', type: 'api', title: 'X', acceptance_criteria: [] },
      ],
    });
    assert.equal(PHASE_DEFS[4].buildTDDRecommendation(reqs), '');
  });

  it('returns empty string on malformed JSON', () => {
    assert.equal(PHASE_DEFS[4].buildTDDRecommendation('not json'), '');
  });

  it('does not include TDD section in briefing when 01_REQUIREMENTS.json is empty object', () => {
    const b = PHASE_DEFS[4].buildBriefing({
      dir: '/tmp/test',
      inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '', '03_TEST_CASES.json': '{}' },
      feedback: null, failingTests: undefined, bestPractices: '',
    });
    assert.ok(!b.includes('TDD recommended'), 'TDD section must not appear when requirements are empty');
  });
});

// FB-MULTI-0619 T1.3 — build phase inherits Phase-3 manual mode (Class B, guarded).
describe('Phase 4 — manual-mode waiver (test_runner/test_files optional when all TCs manual)', () => {
  function makeDir(tcs) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p4-'));
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ artifactsDir: 'spec', approvedPhases: [] }));
    fs.writeFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'), JSON.stringify({ test_cases: tcs }));
    return dir;
  }
  const baseManifest = () => ({ files_created: ['SuzukiCR/Program.cs'], technical_debt: [] });

  it('accepts a build report with NO test_runner/test_files when every Phase-3 TC is manual', () => {
    const dir = makeDir([{ id: 'TC-001h', automation: 'manual' }, { id: 'TC-001f', automation: 'manual' }]);
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(baseManifest()), { dir }));
  });

  it('still REQUIRES test_runner when even one Phase-3 TC is automated', () => {
    const dir = makeDir([{ id: 'TC-001h', automation: 'manual' }, { id: 'TC-002h', automation: 'auto' }]);
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(baseManifest()), { dir }), /test_runner is required/);
  });

  it('still REQUIRES test_runner when TCs default to automated (no automation field)', () => {
    const dir = makeDir([{ id: 'TC-001h' }]);
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(baseManifest()), { dir }), /test_runner is required/);
  });

  it('does NOT waive when 03_TEST_CASES.json is empty (no manual decision to inherit)', () => {
    const dir = makeDir([]);
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(baseManifest()), { dir }), /test_runner is required/);
  });

  it('keeps current behavior (runner required) when no dir is provided', () => {
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(baseManifest())), /test_runner is required/);
  });

  it('shape-checks test_files even in manual mode (object entry rejected)', () => {
    const dir = makeDir([{ id: 'TC-001h', automation: 'manual' }]);
    const m = { ...baseManifest(), test_files: [{ path: 'tests/x.test.cs' }] };
    assert.throws(() => PHASE_DEFS[4].validate(JSON.stringify(m), { dir }), /test_files\[0\] must be a non-empty string path/);
  });

  it('greenfield with a real runner + automated TCs is byte-identical (still passes)', () => {
    const dir = makeDir([{ id: 'TC-001h', automation: 'auto' }]);
    const m = { ...baseManifest(), test_runner: 'npm test', test_files: ['tests/x.test.js'] };
    assert.doesNotThrow(() => PHASE_DEFS[4].validate(JSON.stringify(m), { dir }));
  });
});
