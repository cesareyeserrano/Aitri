/**
 * Module: Phase 3 — QA Test Design
 * Purpose: QA Engineer persona. Creates comprehensive test plan from requirements and design.
 * Artifact: 03_TEST_CASES.json
 */

import { extractTestIndex } from './context.js';

export default {
  num: 3,
  name: 'QA Test Design',
  persona: 'QA Engineer',
  artifact: '03_TEST_CASES.json',
  inputs: ['01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md'],

  extractContext: extractTestIndex,

  validate(content) {
    const d = JSON.parse(content);
    if (!d.test_cases?.length) throw new Error('test_cases array is required and cannot be empty');
    const byReq = {};
    for (const tc of d.test_cases) {
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
    return [
      `# Phase 3 — QA Test Design`,
      `You are a Senior QA Engineer. Create a comprehensive test plan for the requirements below.`,
      ...(feedback ? [`\n## Feedback to apply\n${feedback}`] : []),
      `\n## Requirements (key fields)\n\`\`\`json\n${inputs['01_REQUIREMENTS.json']}\n\`\`\``,
      `\n## System Design (architecture + API)\n${inputs['02_SYSTEM_DESIGN.md']}`,
      `\n## Output: \`${dir}/03_TEST_CASES.json\``,
      `Schema:`,
      `{ test_plan: { strategy, coverage_goal: "80%", test_types: ["unit","integration","e2e"] },`,
      `  test_cases: [{`,
      `    id: "TC-001",`,
      `    requirement_id: "FR-001",`,
      `    title: "Login — valid credentials returns JWT",`,
      `    type: "unit",`,
      `    scenario: "happy_path",`,
      `    priority: "high",`,
      `    preconditions: [],`,
      `    steps: ["POST /auth/login with valid email + password"],`,
      `    expected_result: "Returns 200 + JWT token",`,
      `    test_data: {}`,
      `  }] }`,
      `\n## Schema contract — CRITICAL`,
      `- \`requirement_id\` MUST be a single FR id (e.g. "FR-001") — NEVER comma-separated ("FR-001,FR-002")`,
      `- \`type\` MUST be exactly one of: "unit" | "integration" | "e2e" — this is how aitri counts E2E tests`,
      `- \`scenario\` (separate field) is where you classify: "happy_path" | "edge_case" | "negative"`,
      `- \`test_plan\` is required — the artifact is invalid without it`,
      `\n## Rules`,
      `- Every FR-* gets min 3 test cases: one happy_path, one edge_case, one negative`,
      `- Min 2 test cases with type "e2e" — each assigned to a single requirement_id`,
      `- Steps specific enough for a developer to implement directly`,
      `\n## Mandatory gates by FR type (test LEVEL of implementation, not just presence)`,
      `- FR type UX:          must include test for responsive layout at 375px viewport AND visual component rendering`,
      `- FR type persistence: must include test that data survives process restart — NOT in-memory/variable storage`,
      `- FR type security:    must include test that expired/invalid token returns 401 AND that protected route rejects unauthenticated request`,
      `- FR type reporting:   must include test that chart/graph component renders with real data (not placeholder/empty state)`,
      `- FR type logic:       must include boundary value test AND a test with production-scale data volume`,
      `\n## Instructions`,
      `1. Generate complete 03_TEST_CASES.json`,
      `2. Save to: ${dir}/03_TEST_CASES.json`,
      `3. Run: aitri complete 3`,
    ].join('\n');
  },
};
