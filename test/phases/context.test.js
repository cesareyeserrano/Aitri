import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractRequirements, extractRequirementsForCompliance, extractTestIndex, extractTestResults, extractManifest, head } from '../../lib/phases/context.js';

const fullRequirements = () => JSON.stringify({
  project_name: 'Test Project',
  technology_preferences: ['Node.js'],
  constraints: ['no external APIs'],
  no_go_zone: ['No authentication', 'No database', 'No backend server'],
  user_personas: [
    { role: 'End User', tech_level: 'low', goal: 'track expenses', pain_point: 'forgetting to log' },
  ],
  functional_requirements: [
    { id: 'FR-001', title: 'Login', priority: 'MUST', type: 'security', acceptance_criteria: ['401 on invalid token'] },
    { id: 'FR-002', title: 'Dashboard', priority: 'MUST', type: 'UX', acceptance_criteria: ['renders at 375px'] },
  ],
  user_stories: [
    {
      id: 'US-001',
      requirement_id: 'FR-001',
      as_a: 'user', i_want: 'to login', so_that: 'I can access data',
      acceptance_criteria: [
        { id: 'AC-001', given: 'user exists with email=test@example.com', when: 'POST /auth/login', then: 'status 200, JWT returned' },
      ],
    },
  ],
  non_functional_requirements: [
    { id: 'NFR-001', category: 'Performance', requirement: 'p99 < 200ms', acceptance_criteria: 'measured under load' },
  ],
});

describe('extractRequirements()', () => {

  it('returns valid JSON', () => {
    assert.doesNotThrow(() => JSON.parse(extractRequirements(fullRequirements())));
  });

  it('includes project_name', () => {
    const out = JSON.parse(extractRequirements(fullRequirements()));
    assert.equal(out.project_name, 'Test Project');
  });

  it('includes no_go_zone', () => {
    const out = JSON.parse(extractRequirements(fullRequirements()));
    assert.ok(Array.isArray(out.no_go_zone), 'no_go_zone must be an array');
    assert.equal(out.no_go_zone.length, 3);
  });

  it('includes user_personas with role, tech_level, goal, pain_point', () => {
    const out = JSON.parse(extractRequirements(fullRequirements()));
    assert.ok(Array.isArray(out.user_personas), 'user_personas must be an array');
    const p = out.user_personas[0];
    assert.equal(p.role, 'End User');
    assert.equal(p.tech_level, 'low');
    assert.ok(p.goal);
    assert.ok(p.pain_point);
  });

  it('includes functional_requirements with id, title, priority, type, acceptance_criteria', () => {
    const out = JSON.parse(extractRequirements(fullRequirements()));
    assert.ok(Array.isArray(out.functional_requirements));
    const fr = out.functional_requirements[0];
    assert.equal(fr.id, 'FR-001');
    assert.equal(fr.type, 'security');
    assert.ok(Array.isArray(fr.acceptance_criteria));
  });

  it('includes user_stories with id and acceptance_criteria', () => {
    const out = JSON.parse(extractRequirements(fullRequirements()));
    assert.ok(Array.isArray(out.user_stories), 'user_stories must be an array');
    const us = out.user_stories[0];
    assert.equal(us.id, 'US-001');
    assert.equal(us.requirement_id, 'FR-001');
    assert.ok(Array.isArray(us.acceptance_criteria));
  });

  it('user_stories acceptance_criteria includes id, given, when, then', () => {
    const out = JSON.parse(extractRequirements(fullRequirements()));
    const ac = out.user_stories[0].acceptance_criteria[0];
    assert.equal(ac.id, 'AC-001');
    assert.ok(ac.given);
    assert.ok(ac.when);
    assert.ok(ac.then);
  });

  it('user_stories strips narrative fields (as_a, i_want, so_that)', () => {
    const out = JSON.parse(extractRequirements(fullRequirements()));
    const us = out.user_stories[0];
    assert.equal(us.as_a, undefined);
    assert.equal(us.i_want, undefined);
    assert.equal(us.so_that, undefined);
  });

  it('handles missing user_stories gracefully (no throw)', () => {
    const d = JSON.parse(fullRequirements());
    delete d.user_stories;
    assert.doesNotThrow(() => extractRequirements(JSON.stringify(d)));
    const out = JSON.parse(extractRequirements(JSON.stringify(d)));
    assert.equal(out.user_stories, undefined);
  });

  it('handles missing no_go_zone gracefully (no throw)', () => {
    const d = JSON.parse(fullRequirements());
    delete d.no_go_zone;
    assert.doesNotThrow(() => extractRequirements(JSON.stringify(d)));
  });

  it('handles missing user_personas gracefully (no throw)', () => {
    const d = JSON.parse(fullRequirements());
    delete d.user_personas;
    assert.doesNotThrow(() => extractRequirements(JSON.stringify(d)));
  });

  it('returns raw content on malformed JSON', () => {
    const raw = '{not valid json}';
    assert.equal(extractRequirements(raw), raw);
  });

  it('excludes description from functional_requirements', () => {
    const d = JSON.parse(fullRequirements());
    d.functional_requirements[0].description = 'some description';
    const out = JSON.parse(extractRequirements(JSON.stringify(d)));
    assert.equal(out.functional_requirements[0].description, undefined);
  });
});

describe('head()', () => {

  it('returns first N lines', () => {
    const content = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
    const result = head(content, 10);
    assert.equal(result.split('\n').length, 10);
    assert.ok(result.includes('line 1'));
    assert.ok(!result.includes('line 11'));
  });

  it('returns full content when shorter than limit', () => {
    const content = 'line 1\nline 2\nline 3';
    const result = head(content, 100);
    assert.equal(result, content);
  });

  it('defaults to 160 lines', () => {
    const content = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');
    const result = head(content);
    assert.equal(result.split('\n').length, 160);
  });
});

const fullTestCases = () => JSON.stringify({
  test_plan: { coverage_goal: '80%', type_matrix: 'per FR' },
  test_cases: [
    { id: 'TC-001', requirement_id: 'FR-001', title: 'Valid login returns 200', type: 'e2e', priority: 'high', given: 'user exists', when: 'POST /login', then: 'status 200' },
    { id: 'TC-002', requirement_id: 'FR-002', title: 'Dashboard renders at 375px', type: 'unit', priority: 'medium', given: 'viewport 375px', when: 'render Dashboard', then: 'no overflow' },
  ],
});

describe('extractTestIndex()', () => {

  it('returns valid JSON', () => {
    assert.doesNotThrow(() => JSON.parse(extractTestIndex(fullTestCases())));
  });

  it('includes test_plan', () => {
    const out = JSON.parse(extractTestIndex(fullTestCases()));
    assert.ok(out.test_plan, 'test_plan must be present');
    assert.equal(out.test_plan.coverage_goal, '80%');
  });

  it('includes test_cases with id, requirement_id, title, type, priority', () => {
    const out = JSON.parse(extractTestIndex(fullTestCases()));
    assert.ok(Array.isArray(out.test_cases));
    const tc = out.test_cases[0];
    assert.equal(tc.id, 'TC-001');
    assert.equal(tc.requirement_id, 'FR-001');
    assert.equal(tc.type, 'e2e');
    assert.equal(tc.priority, 'high');
  });

  it('includes given/when/then for implementation fidelity', () => {
    const out = JSON.parse(extractTestIndex(fullTestCases()));
    const tc = out.test_cases[0];
    assert.equal(tc.given, 'user exists');
    assert.equal(tc.when, 'POST /login');
    assert.equal(tc.then, 'status 200');
  });

  it('handles missing test_cases gracefully (no throw)', () => {
    const d = JSON.parse(fullTestCases());
    delete d.test_cases;
    assert.doesNotThrow(() => extractTestIndex(JSON.stringify(d)));
  });

  it('returns raw content on malformed JSON', () => {
    const raw = '{not valid json}';
    assert.equal(extractTestIndex(raw), raw);
  });
});

const fullTestResults = () => JSON.stringify({
  executed_at: '2026-03-10T10:00:00Z',
  test_runner: 'node:test',
  summary: { total: 3, passed: 2, failed: 1 },
  fr_coverage: { 'FR-001': { tests_passing: 2, tests_failing: 0 }, 'FR-002': { tests_passing: 0, tests_failing: 1 } },
  results: [
    { tc_id: 'TC-001', status: 'pass', notes: '' },
    { tc_id: 'TC-002', status: 'pass', notes: '' },
    { tc_id: 'TC-003', status: 'fail', notes: 'Expected 200, got 404' },
  ],
});

describe('extractTestResults()', () => {

  it('returns valid JSON', () => {
    assert.doesNotThrow(() => JSON.parse(extractTestResults(fullTestResults())));
  });

  it('includes summary and fr_coverage', () => {
    const out = JSON.parse(extractTestResults(fullTestResults()));
    assert.ok(out.summary, 'summary must be present');
    assert.equal(out.summary.total, 3);
    assert.ok(out.fr_coverage, 'fr_coverage must be present');
  });

  it('failed_tests contains only failed results', () => {
    const out = JSON.parse(extractTestResults(fullTestResults()));
    assert.ok(Array.isArray(out.failed_tests));
    assert.equal(out.failed_tests.length, 1);
    assert.equal(out.failed_tests[0].tc_id, 'TC-003');
  });

  it('failed_tests excludes passing results', () => {
    const out = JSON.parse(extractTestResults(fullTestResults()));
    const tcIds = out.failed_tests.map(f => f.tc_id);
    assert.ok(!tcIds.includes('TC-001'), 'TC-001 (pass) must not appear in failed_tests');
  });

  it('handles missing results gracefully (no throw)', () => {
    const d = JSON.parse(fullTestResults());
    delete d.results;
    assert.doesNotThrow(() => extractTestResults(JSON.stringify(d)));
    const out = JSON.parse(extractTestResults(JSON.stringify(d)));
    assert.equal(out.failed_tests, undefined);
  });

  it('returns raw content on malformed JSON', () => {
    const raw = '{not valid json}';
    assert.equal(extractTestResults(raw), raw);
  });
});

const fullManifest = () => JSON.stringify({
  files_created: ['src/index.js', 'src/db.js'],
  setup_commands: ['npm install', 'npm run migrate'],
  environment_variables: [{ name: 'DB_URL', type: 'string', required: true, example: 'postgres://localhost/mydb' }],
  technical_debt: [{ fr_id: 'FR-001', substitution: 'static token', reason: 'time constraint', effort_to_fix: '2 days' }],
});

describe('extractManifest()', () => {

  it('returns valid JSON', () => {
    assert.doesNotThrow(() => JSON.parse(extractManifest(fullManifest())));
  });

  it('includes files_created, setup_commands, environment_variables, technical_debt', () => {
    const out = JSON.parse(extractManifest(fullManifest()));
    assert.deepEqual(out.files_created, ['src/index.js', 'src/db.js']);
    assert.deepEqual(out.setup_commands, ['npm install', 'npm run migrate']);
    assert.ok(Array.isArray(out.environment_variables));
    assert.ok(Array.isArray(out.technical_debt));
  });

  it('returns raw content on malformed JSON', () => {
    const raw = '{not valid json}';
    assert.equal(extractManifest(raw), raw);
  });
});

describe('extractRequirementsForCompliance()', () => {
  const full = () => JSON.stringify({
    project_name: 'Compliance Test',
    technology_preferences: ['Node.js'],
    constraints: ['No external APIs'],
    no_go_zone: ['No mobile app'],
    user_personas: [{ role: 'Admin', tech_level: 'high', goal: 'manage', pain_point: 'manual' }],
    functional_requirements: [
      { id: 'FR-001', title: 'Login', priority: 'MUST', type: 'security', description: 'Auth', acceptance_criteria: ['401 on invalid token'] },
      { id: 'FR-002', title: 'Dashboard', priority: 'SHOULD', type: 'ux', acceptance_criteria: ['375px'] },
    ],
    user_stories: [{ id: 'US-001', requirement_id: 'FR-001', as_a: 'user', i_want: 'login', so_that: 'access' }],
    non_functional_requirements: [{ id: 'NFR-001', category: 'Performance', requirement: 'p99 < 200ms', acceptance_criteria: 'load test' }],
  });

  it('returns valid JSON', () => {
    assert.doesNotThrow(() => JSON.parse(extractRequirementsForCompliance(full())));
  });

  it('strips user_stories, user_personas, constraints, technology_preferences', () => {
    const out = JSON.parse(extractRequirementsForCompliance(full()));
    assert.ok(!('user_stories' in out), 'user_stories must be stripped');
    assert.ok(!('user_personas' in out), 'user_personas must be stripped');
    assert.ok(!('constraints' in out), 'constraints must be stripped');
    assert.ok(!('technology_preferences' in out), 'technology_preferences must be stripped');
  });

  it('strips acceptance_criteria from FRs', () => {
    const out = JSON.parse(extractRequirementsForCompliance(full()));
    assert.ok(!('acceptance_criteria' in out.functional_requirements[0]), 'FR acceptance_criteria must be stripped');
  });

  it('preserves FR id, title, priority, type', () => {
    const out = JSON.parse(extractRequirementsForCompliance(full()));
    const fr = out.functional_requirements[0];
    assert.equal(fr.id, 'FR-001');
    assert.equal(fr.title, 'Login');
    assert.equal(fr.priority, 'MUST');
    assert.equal(fr.type, 'security');
  });

  it('preserves NFR id, category, requirement', () => {
    const out = JSON.parse(extractRequirementsForCompliance(full()));
    const nfr = out.non_functional_requirements[0];
    assert.equal(nfr.id, 'NFR-001');
    assert.equal(nfr.category, 'Performance');
    assert.equal(nfr.requirement, 'p99 < 200ms');
  });

  it('preserves project_name and no_go_zone', () => {
    const out = JSON.parse(extractRequirementsForCompliance(full()));
    assert.equal(out.project_name, 'Compliance Test');
    assert.deepEqual(out.no_go_zone, ['No mobile app']);
  });

  it('produces smaller output than extractRequirements', () => {
    const compact = extractRequirementsForCompliance(full());
    const full2 = extractRequirements(full());
    assert.ok(compact.length < full2.length, 'compliance extract must be smaller than full extract');
  });

  it('returns raw content on malformed JSON', () => {
    const raw = '{not valid json}';
    assert.equal(extractRequirementsForCompliance(raw), raw);
  });
});
