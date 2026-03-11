/**
 * Module: Phase 3 — QA Test Design
 * Purpose: QA Engineer persona. Creates comprehensive test plan from requirements and design.
 * Artifact: 03_TEST_CASES.json
 */

import { extractTestIndex } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/qa.js';
import { render } from '../prompts/render.js';

export default {
  num: 3,
  name: 'QA Test Design',
  persona: 'QA Engineer',
  artifact: '03_TEST_CASES.json',
  inputs: ['01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md'],

  extractContext: extractTestIndex,

  validate(content) {
    const d = JSON.parse(content);
    if (!d.test_plan) throw new Error('test_plan field is required — the artifact is invalid without it');
    if (!d.test_cases?.length) throw new Error('test_cases array is required and cannot be empty');
    const VALID_TYPES = new Set(['unit', 'integration', 'e2e']);
    const invalidTypes = d.test_cases.filter(tc => !VALID_TYPES.has(tc.type));
    if (invalidTypes.length)
      throw new Error(`Invalid type value(s) in test_cases: ${invalidTypes.map(tc => `"${tc.type}" (${tc.id})`).join(', ')}. Must be one of: unit | integration | e2e`);
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
    }
    const e2eCount = d.test_cases.filter(tc => tc.type === 'e2e').length;
    if (e2eCount < 2) throw new Error(`Only ${e2eCount} e2e test(s) found — min 2 required for critical flows`);
  },

  buildBriefing({ dir, inputs, feedback }) {
    return render('phases/phase3', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      REQUIREMENTS_JSON: inputs['01_REQUIREMENTS.json'],
      SYSTEM_DESIGN: inputs['02_SYSTEM_DESIGN.md'],
      DIR: dir,
    });
  },
};
