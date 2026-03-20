/**
 * Module: Phase 3 — QA Test Design
 * Purpose: QA Engineer persona. Creates comprehensive test plan from requirements and design.
 * Artifact: 03_TEST_CASES.json
 */

import fs from 'fs';
import { extractTestIndex } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/qa.js';
import { render } from '../prompts/render.js';
import { artifactPath } from '../state.js';

export default {
  num: 3,
  alias: 'tests',
  name: 'Test Cases',
  persona: 'QA Engineer',
  artifact: '03_TEST_CASES.json',
  inputs: ['01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md'],

  extractContext: extractTestIndex,

  validate(content, ctx = {}) {
    let d;
    try { d = JSON.parse(content); } catch {
      throw new Error('03_TEST_CASES.json is not valid JSON — check that the agent did not wrap output in markdown fences or add trailing commas.');
    }
    if (!d.test_plan) throw new Error('test_plan field is required — the artifact is invalid without it');
    if (!d.test_cases?.length) throw new Error('test_cases array is required and cannot be empty');

    const VALID_TYPES     = new Set(['unit', 'integration', 'e2e']);
    const VALID_SCENARIOS = new Set(['happy_path', 'edge_case', 'negative']);

    const invalidTypes = d.test_cases.filter(tc => !VALID_TYPES.has(tc.type));
    if (invalidTypes.length)
      throw new Error(`Invalid type value(s) in test_cases: ${invalidTypes.map(tc => `"${tc.type}" (${tc.id})`).join(', ')}. Must be one of: unit | integration | e2e`);

    const invalidScenarios = d.test_cases.filter(tc => !VALID_SCENARIOS.has(tc.scenario));
    if (invalidScenarios.length)
      throw new Error(`Invalid scenario value(s) in test_cases: ${invalidScenarios.map(tc => `"${tc.scenario}" (${tc.id ?? '?'})`).join(', ')}. Must be one of: happy_path | edge_case | negative`);

    const missingAcId = d.test_cases.filter(tc => !tc.ac_id || typeof tc.ac_id !== 'string');
    if (missingAcId.length)
      throw new Error(`Missing ac_id in test_cases: ${missingAcId.map(tc => tc.id ?? '(unknown)').join(', ')} — each TC must trace to a specific acceptance criterion`);

    const missingUsId = d.test_cases.filter(tc => !tc.user_story_id || typeof tc.user_story_id !== 'string');
    if (missingUsId.length)
      throw new Error(`Missing user_story_id in test_cases: ${missingUsId.map(tc => tc.id ?? '(unknown)').join(', ')} — each TC must trace to a specific user story`);

    // Placeholder expected_result detection
    const PLACEHOLDER_RESULTS = new Set([
      'it works', 'should work', 'test passes', 'passes', 'succeeds',
      'works correctly', 'returns successfully', 'is correct', 'is valid', 'ok',
    ]);
    const vagueResults = d.test_cases.filter(tc =>
      typeof tc.expected_result === 'string' &&
      PLACEHOLDER_RESULTS.has(tc.expected_result.trim().toLowerCase())
    );
    if (vagueResults.length)
      throw new Error(
        `Placeholder expected_result in test cases: ${vagueResults.map(tc => tc.id).join(', ')}\n` +
        `  expected_result must describe a specific, observable outcome — not "${vagueResults[0].expected_result}".`
      );

    const byReq = {};
    for (const tc of d.test_cases) {
      if (!tc.requirement_id || typeof tc.requirement_id !== 'string')
        throw new Error(`${tc.id ?? '(unknown TC)'} has missing or invalid requirement_id — must be a single FR id (e.g. "FR-001")`);
      if (!byReq[tc.requirement_id]) byReq[tc.requirement_id] = [];
      byReq[tc.requirement_id].push(tc);
    }
    for (const [reqId, cases] of Object.entries(byReq)) {
      if (reqId.includes(','))
        throw new Error(`requirement_id must be a single FR id — got "${reqId}". Use one test case per requirement, not comma-separated ids.`);
      if (cases.length < 3)
        throw new Error(`${reqId} has ${cases.length} test case(s) — min 3 required (happy path, edge case, negative)`);
      const scenarios = new Set(cases.map(tc => tc.scenario));
      if (!scenarios.has('happy_path'))
        throw new Error(`${reqId} has no happy_path test case — Three Amigos gate: every FR needs at least one h_ (happy_path) scenario`);
      if (!scenarios.has('negative'))
        throw new Error(`${reqId} has no negative test case — Three Amigos gate: every FR needs at least one f_ (negative/failure) scenario`);
      const hasH = cases.some(tc => typeof tc.id === 'string' && tc.id.endsWith('h'));
      const hasF = cases.some(tc => typeof tc.id === 'string' && tc.id.endsWith('f'));
      if (!hasH)
        throw new Error(`${reqId} has no TC id ending in 'h' — add a happy-path TC (e.g. TC-001h)`);
      if (!hasF)
        throw new Error(`${reqId} has no TC id ending in 'f' — add a failure TC (e.g. TC-001f)`);
    }
    const e2eCount = d.test_cases.filter(tc => tc.type === 'e2e').length;
    if (e2eCount < 2) throw new Error(`Only ${e2eCount} e2e test(s) found — min 2 required for critical flows`);

    // Cross-phase check: verify each ac_id exists in 01_REQUIREMENTS.json
    const { dir, config } = ctx;
    if (dir) {
      const reqPath = artifactPath(dir, config || {}, '01_REQUIREMENTS.json');
      if (fs.existsSync(reqPath)) {
        let reqs;
        try { reqs = JSON.parse(fs.readFileSync(reqPath, 'utf8')); } catch { /* malformed — skip */ }
        if (reqs) {
          // Index all AC ids from user_stories (the only place structured AC objects with ids live)
          const knownAcIds = new Set();
          for (const us of (reqs.user_stories || [])) {
            for (const ac of (us.acceptance_criteria || [])) {
              if (ac.id) knownAcIds.add(ac.id);
            }
          }
          // Only run check if Phase 1 actually has AC ids (user_stories with structured ACs)
          if (knownAcIds.size > 0) {
            const badAcRefs = d.test_cases
              .filter(tc => tc.ac_id && tc.requirement_id && !knownAcIds.has(tc.ac_id))
              .map(tc => `${tc.id}: ac_id "${tc.ac_id}" not found in ${tc.requirement_id}`);
            if (badAcRefs.length)
              throw new Error(`Three Amigos gate — AC references not found in 01_REQUIREMENTS.json:\n  ${badAcRefs.join('\n  ')}`);
          }

          // FR-MUST gap: every MUST FR must have at least one TC
          const mustFRIds = (reqs.functional_requirements || [])
            .filter(fr => fr.priority === 'MUST')
            .map(fr => fr.id);
          if (mustFRIds.length > 0) {
            const coveredFRIds = new Set(d.test_cases.map(tc => tc.requirement_id).filter(Boolean));
            const uncovered = mustFRIds.filter(id => !coveredFRIds.has(id));
            if (uncovered.length > 0)
              throw new Error(
                `${uncovered.length} FR-MUST(s) have no test cases in 03_TEST_CASES.json:\n` +
                uncovered.map(id => `  ${id}`).join('\n') + '\n' +
                `  Every MUST requirement must have at least one test case. Add TCs or change FR priority.`
              );
          }
        }
      } else {
        process.stderr.write(`[aitri] Warning: 01_REQUIREMENTS.json not found — skipping AC cross-reference check.\n`);
      }
    }
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase, bestPractices }) {
    return render('phases/phase3', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      REQUIREMENTS_JSON: inputs['01_REQUIREMENTS.json'],
      SYSTEM_DESIGN: inputs['02_SYSTEM_DESIGN.md'],
      ARTIFACTS_BASE: artifactsBase || dir,
      BEST_PRACTICES: bestPractices || '',
    });
  },
};
