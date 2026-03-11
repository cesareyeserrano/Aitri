/**
 * Module: Phase 3 — QA Test Design
 * Purpose: QA Engineer persona. Creates comprehensive test plan from requirements and design.
 * Artifact: 03_TEST_CASES.json
 */

import { extractTestIndex } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/qa.js';

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
    return [
      `# Phase 3 — QA Test Design`,
      `${ROLE}`,
      `\n## Constraints\n${CONSTRAINTS}`,
      `\n## How to reason\n${REASONING}`,
      ...(feedback ? [`\n## Feedback to apply\n${feedback}`] : []),
      `\n## Requirements\n\`\`\`json\n${inputs['01_REQUIREMENTS.json']}\n\`\`\``,
      `\n> user_stories above include acceptance_criteria with Given/When/Then per AC id — use these to populate user_story_id, ac_id, and to write SPEC-SEALED test cases.`,
      `> no_go_zone above lists what is explicitly out of scope — do NOT write test cases for these items.`,
      `\n## System Design (architecture + API)\n${inputs['02_SYSTEM_DESIGN.md']}`,
      `\n## Output: \`${dir}/03_TEST_CASES.json\``,
      `Schema:`,
      `{ test_plan: { strategy, coverage_goal: "80%", test_types: ["unit","integration","e2e"] },`,
      `  test_cases: [{`,
      `    id: "TC-001",`,
      `    requirement_id: "FR-001",`,
      `    user_story_id: "US-001",`,
      `    ac_id: "AC-001",`,
      `    title: "Login — valid credentials returns JWT",`,
      `    type: "unit",`,
      `    scenario: "happy_path",`,
      `    priority: "high",`,
      `    preconditions: [],`,
      `    given: "user exists with email=test@example.com, password=Test1234!",`,
      `    when: "POST /auth/login { email: 'test@example.com', password: 'Test1234!' }",`,
      `    then: "response status 200, body contains { token: <JWT string>, expiresIn: 3600 }",`,
      `    steps: ["POST /auth/login with valid email + password"],`,
      `    expected_result: "Returns 200 + JWT token",`,
      `    test_data: {}`,
      `  }] }`,
      `\n## Given/When/Then — SPEC-SEALED rule`,
      `Every test case MUST include \`given\`, \`when\`, \`then\` fields with concrete, verifiable values.`,
      `"Concrete" means: actual values, HTTP status codes, field names, data structures — not abstract descriptions.`,
      ``,
      `  ❌ given: "a valid user exists"            → ✅ given: "user with email=alice@example.com exists in DB"`,
      `  ❌ when: "user submits valid form data"     → ✅ when: "POST /register { email: 'alice@example.com', password: 'Pass1!' }"`,
      `  ❌ then: "user is registered successfully"  → ✅ then: "status 201, localStorage key 'userId' is set, redirect to /dashboard"`,
      `  ❌ given: "the app has data"               → ✅ given: "localStorage contains 3 movement entries totaling $120"`,
      `  ❌ then: "chart renders correctly"          → ✅ then: "canvas element visible, legend shows 3 categories, no console errors"`,
      ``,
      `SPEC-SEALED: a test case where given/when/then contain abstract language is equivalent to no test case.`,
      `\n## Type Coverage Matrix`,
      `For each FR, declare which test levels are required before writing test cases:`,
      ``,
      `  | FR     | Unit  | Integration | E2E   |`,
      `  |--------|-------|-------------|-------|`,
      `  | FR-001 | MUST  | SHOULD      | -     |`,
      `  | FR-002 | MUST  | -           | MUST  |`,
      ``,
      `Rules:`,
      `  - MUST: this level is required for the FR to be considered tested`,
      `  - SHOULD: recommended but not blocking`,
      `  - -: not applicable for this FR type`,
      `  - FR type UX/visual/audio: E2E is always MUST`,
      `  - FR type persistence: Integration is always MUST (in-memory tests don't count)`,
      `  - FR type security: Unit AND Integration are both MUST`,
      `  - FR type logic: Unit is always MUST`,
      ``,
      `Include the coverage matrix as \`type_coverage_matrix\` field in the JSON output.`,
      `\n## Schema contract — CRITICAL`,
      `- \`requirement_id\` MUST be a single FR id (e.g. "FR-001") — NEVER comma-separated ("FR-001,FR-002")`,
      `- \`type\` MUST be exactly one of: "unit" | "integration" | "e2e" — this is how aitri counts E2E tests`,
      `- \`scenario\` (separate field) is where you classify: "happy_path" | "edge_case" | "negative"`,
      `- \`test_plan\` is required — the artifact is invalid without it`,
      `- \`given\`, \`when\`, \`then\` are required fields — abstract values fail SPEC-SEALED rule`,
      `\n## Rules`,
      `- Every FR-* gets min 3 test cases: one happy_path, one edge_case, one negative`,
      `- Min 2 test cases with type "e2e" — each assigned to a single requirement_id`,
      `- Steps specific enough for a developer to implement directly`,
      `- E2E tests run via Playwright MUST follow the same TC-XXX: naming: test('TC-XXX: description', ...)`,
      `  This allows aitri verify-run --e2e to auto-detect them from Playwright output`,
      `\n## Mandatory gates by FR type (test LEVEL of implementation, not just presence)`,
      `- FR type UX:          must include test for responsive layout at 375px viewport AND visual component rendering`,
      `- FR type visual:      must include test at each breakpoint declared in acceptance_criteria (e.g. 375px, 768px, 1440px)`,
      `- FR type audio:       must include test that audio fires within the ms threshold declared in acceptance_criteria`,
      `- FR type persistence: must include test that data survives process restart — NOT in-memory/variable storage`,
      `- FR type security:    must include test that expired/invalid token returns 401 AND that protected route rejects unauthenticated request`,
      `- FR type reporting:   must include test that chart/graph component renders with real data (not placeholder/empty state)`,
      `- FR type logic:       must include boundary value test AND a test with production-scale data volume`,
      `\n## Fidelity rule — qualitative FRs (UX/visual/audio)`,
      `For every FR of type UX, visual, or audio: the expected_result of each test case MUST reference`,
      `the specific metric from that FR's acceptance_criteria — not just check presence.`,
      `  ❌ expected_result: "component renders"`,
      `  ✅ expected_result: "component renders at 375px viewport, animation completes in ≤200ms"`,
      `  ❌ expected_result: "audio plays"`,
      `  ✅ expected_result: "audio plays within 100ms of trigger with no gap on loop"`,
      `Copy the metric directly from the FR's acceptance_criteria into expected_result.`,
      `\n## Instructions`,
      `1. Build Type Coverage Matrix for all FRs`,
      `2. Write test cases with concrete Given/When/Then (SPEC-SEALED)`,
      `3. Generate complete 03_TEST_CASES.json`,
      `4. Save to: ${dir}/03_TEST_CASES.json`,
      `5. Run: aitri complete 3`,
      `\n## Human Review — Before approving phase 3`,
      `  [ ] Every MUST FR has ≥3 test cases (happy path, edge case, negative)`,
      `  [ ] At least 2 e2e tests targeting critical user flows`,
      `  [ ] given/when/then use concrete values — no "valid data", "correct input", or abstractions`,
      `  [ ] user_story_id and ac_id in each TC reference real IDs from 01_REQUIREMENTS.json`,
      `  [ ] No test cases written for items declared in no_go_zone`,
      `  [ ] Type Coverage Matrix is present and FR types have correct required levels`,
    ].join('\n');
  },
};
