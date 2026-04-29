import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PHASE_DEFS } from '../../lib/phases/index.js';

const makeTC = (id, reqId, type, scenario = 'happy_path') => ({
  id, requirement_id: reqId, title: `Test ${id}`, type,
  scenario, user_story_id: 'US-001', ac_id: 'AC-001',
  priority: 'high', preconditions: [], steps: ['step'], expected_result: 'HTTP 200 with expected response', test_data: {},
});

const validP3 = () => JSON.stringify({
  test_plan: { strategy: 'unit + e2e', coverage_goal: '80%', test_types: ['unit', 'e2e'] },
  test_cases: [
    makeTC('TC-001h', 'FR-001', 'unit',        'happy_path'),
    makeTC('TC-001e', 'FR-001', 'integration', 'edge_case'),
    makeTC('TC-001f', 'FR-001', 'e2e',         'negative'),
    makeTC('TC-002h', 'FR-002', 'unit',        'happy_path'),
    makeTC('TC-002e', 'FR-002', 'integration', 'edge_case'),
    makeTC('TC-002f', 'FR-002', 'e2e',         'negative'),
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
    d.test_cases = d.test_cases.filter(tc => !(tc.requirement_id === 'FR-001' && tc.id === 'TC-001f'));
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
      tc.id === 'TC-002f' ? { ...tc, type: 'integration' } : tc
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
    d.test_cases[3].ac_id = ''; // TC-002h
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

  // Rank 11 — TC ID naming convention gate (h/f suffix)
  it('[Rank 11] throws when FR has no TC id ending in h', () => {
    const d = JSON.parse(validP3());
    d.test_cases[0].id = 'TC-001x'; // remove h suffix from FR-001's happy TC
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /FR-001.*no TC id ending in 'h'/);
  });

  it('[Rank 11] throws when FR has no TC id ending in f', () => {
    const d = JSON.parse(validP3());
    d.test_cases[2].id = 'TC-001z'; // remove f suffix from FR-001's failure TC
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /FR-001.*no TC id ending in 'f'/);
  });

  it('[Rank 11] passes when all FRs have both h and f suffixed TCs', () => {
    assert.doesNotThrow(() => PHASE_DEFS[3].validate(validP3()));
  });

  // Rank 3 — cross-phase AC check
  it('[Rank 3] cross-phase check passes when no dir provided (backward compat)', () => {
    assert.doesNotThrow(() => PHASE_DEFS[3].validate(validP3()));
  });

  it('[Rank 3] cross-phase check passes when 01_REQUIREMENTS.json does not exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p3-'));
    try {
      assert.doesNotThrow(() => PHASE_DEFS[3].validate(validP3(), { dir, config: {} }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[Rank 3] cross-phase check passes when all ac_ids are found in user_stories', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p3-'));
    try {
      const reqs = {
        functional_requirements: [
          { id: 'FR-001', acceptance_criteria: ['passes 375px test'] },
          { id: 'FR-002', acceptance_criteria: ['returns 401'] },
        ],
        user_stories: [
          { id: 'US-001', requirement_id: 'FR-001', acceptance_criteria: [{ id: 'AC-001', given: 'g', when: 'w', then: 't' }] },
          { id: 'US-002', requirement_id: 'FR-002', acceptance_criteria: [{ id: 'AC-001', given: 'g', when: 'w', then: 't' }] },
        ],
      };
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      assert.doesNotThrow(() => PHASE_DEFS[3].validate(validP3(), { dir, config: {} }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[expected_result] throws when TC has placeholder expected_result', () => {
    const d = JSON.parse(validP3());
    d.test_cases[0].expected_result = 'it works';
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /Placeholder expected_result.*TC-001h/);
  });

  it('[expected_result] throws when TC expected_result is "passes"', () => {
    const d = JSON.parse(validP3());
    d.test_cases[0].expected_result = 'passes';
    assert.throws(() => PHASE_DEFS[3].validate(JSON.stringify(d)), /Placeholder expected_result/);
  });

  it('[expected_result] passes when expected_result is specific and observable', () => {
    const d = JSON.parse(validP3());
    d.test_cases[0].expected_result = 'HTTP 401 returned with body { "error": "invalid_token" }';
    assert.doesNotThrow(() => PHASE_DEFS[3].validate(JSON.stringify(d)));
  });

  it('[Rank 3] cross-phase check fails when ac_id not found in requirements', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p3-'));
    try {
      const reqs = {
        functional_requirements: [
          { id: 'FR-001', acceptance_criteria: ['passes 375px test'] },
          { id: 'FR-002', acceptance_criteria: ['returns 401'] },
        ],
        user_stories: [
          // no AC-001 entries here
          { id: 'US-001', requirement_id: 'FR-001', acceptance_criteria: [{ id: 'AC-999', given: 'g', when: 'w', then: 't' }] },
        ],
      };
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      const d = JSON.parse(validP3());
      // Force an ac_id that doesn't exist
      d.test_cases.forEach(tc => { tc.ac_id = 'AC-001'; });
      assert.throws(
        () => PHASE_DEFS[3].validate(JSON.stringify(d), { dir, config: {} }),
        /Three Amigos gate.*AC references not found/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[FR-MUST gap] throws when FR-MUST has no test cases', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p3-'));
    try {
      const reqs = {
        functional_requirements: [
          { id: 'FR-001', priority: 'MUST', acceptance_criteria: [] },
          { id: 'FR-002', priority: 'MUST', acceptance_criteria: [] },
          { id: 'FR-003', priority: 'MUST', acceptance_criteria: [] }, // no TCs
        ],
        user_stories: [],
      };
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      // validP3 only covers FR-001 and FR-002 — FR-003 is uncovered
      assert.throws(
        () => PHASE_DEFS[3].validate(validP3(), { dir, config: {} }),
        /FR-MUST.*no test cases/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[FR-MUST gap] passes when all FR-MUSTs have at least one TC', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p3-'));
    try {
      const reqs = {
        functional_requirements: [
          { id: 'FR-001', priority: 'MUST', acceptance_criteria: [] },
          { id: 'FR-002', priority: 'MUST', acceptance_criteria: [] },
        ],
        user_stories: [],
      };
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      assert.doesNotThrow(() => PHASE_DEFS[3].validate(validP3(), { dir, config: {} }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // Defect (canary 2026-04-28): the gate previously rejected any NFR-* id on a
  // TC, forcing the agent to either invent an FR wrapper or misclassify the
  // requirement. NFRs are testable (perf, security, accessibility, …) and now
  // accepted when declared in 01_REQUIREMENTS.json::non_functional_requirements.
  it('[NFR check] passes when TC requirement_id references a declared NFR', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p3-'));
    try {
      // FR-002 lowered to SHOULD so the FR-MUST gap check ignores it after we
      // re-route its TCs to NFR-001. The point of the test is the NFR id gate,
      // not the orthogonal FR-MUST coverage rule.
      const reqs = {
        functional_requirements: [
          { id: 'FR-001', priority: 'MUST',   acceptance_criteria: [] },
          { id: 'FR-002', priority: 'SHOULD', acceptance_criteria: [] },
        ],
        non_functional_requirements: [
          { id: 'NFR-001', title: 'p95 < 200ms', acceptance_criteria: [] },
        ],
        user_stories: [],
      };
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      const d = JSON.parse(validP3());
      d.test_cases = d.test_cases.map(tc =>
        tc.requirement_id === 'FR-002' ? { ...tc, requirement_id: 'NFR-001' } : tc
      );
      assert.doesNotThrow(
        () => PHASE_DEFS[3].validate(JSON.stringify(d), { dir, config: {} })
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[NFR check] throws when requirement_id references an undeclared id (FR or NFR)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p3-'));
    try {
      const reqs = {
        functional_requirements: [
          { id: 'FR-001', priority: 'MUST',   acceptance_criteria: [] },
          { id: 'FR-002', priority: 'SHOULD', acceptance_criteria: [] },
        ],
        non_functional_requirements: [
          { id: 'NFR-001', title: 'p95 < 200ms', acceptance_criteria: [] },
        ],
        user_stories: [],
      };
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      const d = JSON.parse(validP3());
      // NFR-099 is not declared anywhere — must still be rejected.
      d.test_cases = d.test_cases.map(tc =>
        tc.requirement_id === 'FR-002' ? { ...tc, requirement_id: 'NFR-099' } : tc
      );
      assert.throws(
        () => PHASE_DEFS[3].validate(JSON.stringify(d), { dir, config: {} }),
        /NFR-099.*does not match any requirement/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[FR-MUST gap] SHOULD FRs not in TCs do not trigger the gap check', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p3-'));
    try {
      const reqs = {
        functional_requirements: [
          { id: 'FR-001', priority: 'MUST',   acceptance_criteria: [] },
          { id: 'FR-002', priority: 'MUST',   acceptance_criteria: [] },
          { id: 'FR-099', priority: 'SHOULD', acceptance_criteria: [] }, // SHOULD — gap check ignores
        ],
        user_stories: [],
      };
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      assert.doesNotThrow(() => PHASE_DEFS[3].validate(validP3(), { dir, config: {} }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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

  it('[Rank 11] briefing contains TC ID naming convention rule', () => {
    const b = PHASE_DEFS[3].buildBriefing({ dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '' }, feedback: null });
    assert.ok(b.includes('TC-001h') || b.includes("ending in `h`") || b.includes('h suffix'), 'briefing must explain h suffix naming');
    assert.ok(b.includes('TC-001f') || b.includes("ending in `f`") || b.includes('f suffix'), 'briefing must explain f suffix naming');
  });

  it('[v0.1.28] briefing renders artifact path using artifactsBase when provided', () => {
    const b = PHASE_DEFS[3].buildBriefing({
      dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '' }, feedback: null,
      artifactsBase: '/tmp/test/spec',
    });
    assert.ok(b.includes('/tmp/test/spec/03_TEST_CASES.json'), 'artifact path must use artifactsBase/spec');
    assert.ok(!b.includes('/tmp/test/03_TEST_CASES.json'), 'artifact path must NOT use bare dir');
  });

  it('[Rank 3] briefing mentions ac_id cross-reference', () => {
    const b = PHASE_DEFS[3].buildBriefing({ dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '' }, feedback: null });
    assert.ok(b.includes('ac_id'), 'briefing must reference ac_id field');
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
