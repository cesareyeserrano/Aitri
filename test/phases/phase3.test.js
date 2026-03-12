import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_DEFS } from '../../lib/phases/index.js';

const makeTC = (id, reqId, type, scenario = 'happy_path') => ({
  id, requirement_id: reqId, title: `Test ${id}`, type,
  scenario, user_story_id: 'US-001', ac_id: 'AC-001',
  priority: 'high', preconditions: [], steps: ['step'], expected_result: 'ok', test_data: {},
});

const validP3 = () => JSON.stringify({
  test_plan: { strategy: 'unit + e2e', coverage_goal: '80%', test_types: ['unit', 'e2e'] },
  test_cases: [
    makeTC('TC-001', 'FR-001', 'unit',        'happy_path'),
    makeTC('TC-002', 'FR-001', 'integration', 'edge_case'),
    makeTC('TC-003', 'FR-001', 'e2e',         'negative'),
    makeTC('TC-004', 'FR-002', 'unit',        'happy_path'),
    makeTC('TC-005', 'FR-002', 'integration', 'edge_case'),
    makeTC('TC-006', 'FR-002', 'e2e',         'negative'),
  ],
});

describe('Phase 3 — validate()', () => {

  it('passes with valid artifact', () => {
    assert.doesNotThrow(() => PHASE_DEFS[3].validate(validP3()));
  });

  it('throws when test_cases is empty', () => {
    const d = { test_plan: {}, test_cases: [] };
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /test_cases array is required/);
  });

  it('throws when a requirement has fewer than 3 test cases', () => {
    const d = JSON.parse(validP3());
    d.test_cases = d.test_cases.filter(tc => !(tc.requirement_id === 'FR-001' && tc.id === 'TC-003'));
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /FR-001 has 2 test case.*min 3/);
  });

  it('throws when fewer than 2 e2e tests', () => {
    const d = JSON.parse(validP3());
    d.test_cases = d.test_cases.map(tc => ({ ...tc, type: 'unit' }));
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /0 e2e test.*min 2/);
  });

  it('throws when exactly 1 e2e test', () => {
    const d = JSON.parse(validP3());
    d.test_cases = d.test_cases.map(tc =>
      tc.id === 'TC-006' ? { ...tc, type: 'integration' } : tc
    );
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /1 e2e test.*min 2/);
  });

  it('passes when exactly 2 e2e tests', () => {
    assert.doesNotThrow(() => PHASE_DEFS[3].validate(validP3()));
  });

  it('throws when requirement_id is comma-separated', () => {
    const d = JSON.parse(validP3());
    // Agent mistake: combining multiple FRs in one requirement_id
    d.test_cases[0].requirement_id = 'FR-001,FR-002';
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /requirement_id must be a single FR id/);
  });

  it('throws when type is used for scenario instead of execution type', () => {
    const d = JSON.parse(validP3());
    // Agent mistake: using type for scenario classification instead of unit|integration|e2e
    d.test_cases = d.test_cases.map(tc => ({ ...tc, type: 'happy_path' }));
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /Invalid type value.*unit.*integration.*e2e/);
  });

  it('throws when test_plan field is missing', () => {
    const d = JSON.parse(validP3());
    delete d.test_plan;
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /test_plan field is required/);
  });

  // Rank 3 — ac_id / user_story_id traceability gate
  it('throws when TC is missing ac_id', () => {
    const d = JSON.parse(validP3());
    delete d.test_cases[0].ac_id;
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /Missing ac_id.*TC-001/);
  });

  it('throws when TC is missing user_story_id', () => {
    const d = JSON.parse(validP3());
    delete d.test_cases[0].user_story_id;
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /Missing user_story_id.*TC-001/);
  });

  it('throws when TC has empty ac_id string', () => {
    const d = JSON.parse(validP3());
    d.test_cases[1].ac_id = '';
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /Missing ac_id.*TC-002/);
  });

  // Rank 11 — scenario enum + Three Amigos coverage gate
  it('throws when TC has invalid scenario value', () => {
    const d = JSON.parse(validP3());
    d.test_cases[0].scenario = 'positive';
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /Invalid scenario.*happy_path.*edge_case.*negative/);
  });

  it('throws when FR has no happy_path TC (Three Amigos gate)', () => {
    const d = JSON.parse(validP3());
    d.test_cases[0].scenario = 'edge_case'; // FR-001 loses its happy_path
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /FR-001.*no happy_path/);
  });

  it('throws when FR has no negative TC (Three Amigos gate)', () => {
    const d = JSON.parse(validP3());
    d.test_cases[2].scenario = 'edge_case'; // FR-001 loses its negative
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /FR-001.*no negative/);
  });

  it('passes when all FRs have happy_path and negative scenarios', () => {
    assert.doesNotThrow(() => PHASE_DEFS[3].validate(validP3()));
  });
});

describe('Phase 3 — buildBriefing() (BL-003)', () => {
  const briefing = PHASE_DEFS[3].buildBriefing({ dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '' }, feedback: null });

  it('briefing contains Given/When/Then instruction', () => {
    assert.ok(briefing.includes('Given') && briefing.includes('When') && briefing.includes('Then'),
      'briefing must mention Given/When/Then format');
  });

  it('briefing contains SPEC-SEALED rule', () => {
    assert.ok(briefing.includes('SPEC-SEALED'), 'briefing must mention SPEC-SEALED rule');
  });

  it('briefing contains Type Coverage Matrix instruction', () => {
    assert.ok(briefing.includes('Type Coverage Matrix') || briefing.includes('coverage matrix'),
      'briefing must mention Type Coverage Matrix');
  });

  it('briefing contains concrete value example (negative)', () => {
    assert.ok(briefing.includes('valid data') || briefing.includes('abstract'),
      'briefing must show abstract vs concrete example');
  });

  it('briefing contains user_story_id in TC schema (BL-006)', () => {
    assert.ok(briefing.includes('user_story_id'), 'briefing TC schema must include user_story_id field');
  });

  it('briefing contains ac_id in TC schema (BL-006)', () => {
    assert.ok(briefing.includes('ac_id'), 'briefing TC schema must include ac_id field');
  });

  it('briefing contains Human Review checklist', () => {
    assert.ok(briefing.includes('Human Review'), 'briefing must include Human Review section');
  });

  it('Human Review checklist covers no_go_zone and concrete values', () => {
    const reviewIdx = briefing.indexOf('Human Review');
    const reviewSection = briefing.slice(reviewIdx);
    assert.ok(reviewSection.includes('no_go_zone') && reviewSection.includes('concrete'),
      'Human Review must cover no_go_zone and concrete value checks');
  });

  it('[v0.1.28] briefing renders artifact path using artifactsBase when provided', () => {
    const b = PHASE_DEFS[3].buildBriefing({
      dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '' }, feedback: null,
      artifactsBase: '/tmp/test/spec',
    });
    assert.ok(b.includes('/tmp/test/spec/03_TEST_CASES.json'), 'artifact path must use artifactsBase/spec');
    assert.ok(!b.includes('/tmp/test/03_TEST_CASES.json'), 'artifact path must NOT use bare dir');
  });

  it('[v0.1.28] injects bestPractices content when provided', () => {
    const b = PHASE_DEFS[3].buildBriefing({
      dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '' }, feedback: null,
      bestPractices: 'One behavior per test case',
    });
    assert.ok(b.includes('One behavior per test case'), 'best practices content must appear in briefing');
  });

  it('[v0.1.28] omits best practices block when bestPractices is empty', () => {
    const b = PHASE_DEFS[3].buildBriefing({
      dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '' }, feedback: null,
      bestPractices: '',
    });
    assert.ok(!b.includes('Testing Standards'), 'Testing Standards header must not appear when bestPractices is empty');
  });
});
