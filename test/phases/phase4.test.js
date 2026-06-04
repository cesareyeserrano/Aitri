import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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

  // The full design must reach the developer — head(…,200) used to drop late
  // sections (Deployment Architecture / Risk Analysis) on a long design (Tier-4).
  it('includes a design section that appears past line 200 (no truncation)', () => {
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
