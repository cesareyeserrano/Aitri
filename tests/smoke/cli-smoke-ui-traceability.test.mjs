import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseApprovedSpec } from "../../cli/commands/spec-parser.js";
import { generateTestsContent } from "../../cli/commands/content-generator.js";
import { auditBacklog, auditTests, auditAgentContent } from "../../cli/commands/content-auditor.js";
import { parseTestCases, buildContractImports } from "../../cli/commands/scaffold.js";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";

const SPEC_WITHOUT_UI = `# AF-SPEC: no-ui-feature

STATUS: APPROVED

## 1. Context
A backend service with no visual components.

## 2. Actors
- API consumer

## 3. Functional Rules (traceable)
- FR-1: The system must validate input payloads.

## 4. Edge Cases
- Empty payload submitted.

## 6. Non-Functional Requirements
- Response time under 200ms.

## 7. Security Considerations
- Reject unauthenticated requests.

## 8. Out of Scope
- Admin dashboard.

## 9. Acceptance Criteria (Given/When/Then)
- AC-1: Given a valid payload, when submitted, then a 200 response is returned.
`;

const SPEC_WITH_UI = `# AF-SPEC: ui-feature

STATUS: APPROVED

## 1. Context
A web app with login and dashboard screens.

## 2. Actors
- End user

## 3. Functional Rules (traceable)
- FR-1: The system must authenticate users via login form.
- FR-2: The system must display user metrics on the dashboard.

## 4. Edge Cases
- Invalid credentials submitted.

## 6. UI Structure

Screen: Login
┌─────────────────────┐
│ [input: username]           │
│ [input: password]           │
│ [button: submit]            │
└─────────────────────┘

Screen: Dashboard
┌─────────────────────┐
│ [chart: metrics]            │
│ [table: recent-activity]    │
└─────────────────────┘

Flow: Login → Dashboard
Flow: Dashboard → Settings

### References
- UI-REF-1: mockups/login.png → AC-1, AC-2
- UI-REF-2: mockups/dashboard.png → AC-3

## 7. Security Considerations
- Enforce rate limiting on login attempts.

## 8. Out of Scope
- Password recovery flow.

## 9. Acceptance Criteria (Given/When/Then)
- AC-1: Given valid credentials, when login form is submitted, then user sees the dashboard.
- AC-2: Given invalid credentials, when login form is submitted, then an error is shown.
- AC-3: Given an authenticated user, when dashboard loads, then metrics are displayed.
`;

// Test 1: parseApprovedSpec returns hasUiSection: false for spec without UI section
test("parseApprovedSpec returns hasUiSection false for spec without UI Structure section", () => {
  const parsed = parseApprovedSpec(SPEC_WITHOUT_UI, { feature: "no-ui-feature" });
  assert.equal(parsed.uiStructure.hasUiSection, false);
  assert.deepEqual(parsed.uiStructure.screens, []);
  assert.deepEqual(parsed.uiStructure.flows, []);
  assert.deepEqual(parsed.uiStructure.refs, []);
});

// Test 2: parseApprovedSpec extracts screens, components, flows from UI Structure
test("parseApprovedSpec extracts screens components and flows from UI Structure", () => {
  const parsed = parseApprovedSpec(SPEC_WITH_UI, { feature: "ui-feature" });
  assert.equal(parsed.uiStructure.hasUiSection, true);

  // Screens
  assert.equal(parsed.uiStructure.screens.length, 2);
  assert.equal(parsed.uiStructure.screens[0].name, "Login");
  assert.ok(parsed.uiStructure.screens[0].components.includes("input: username"));
  assert.ok(parsed.uiStructure.screens[0].components.includes("button: submit"));
  assert.equal(parsed.uiStructure.screens[1].name, "Dashboard");
  assert.ok(parsed.uiStructure.screens[1].components.includes("chart: metrics"));

  // Flows
  assert.equal(parsed.uiStructure.flows.length, 2);
  assert.deepEqual(parsed.uiStructure.flows[0], { from: "Login", to: "Dashboard" });
  assert.deepEqual(parsed.uiStructure.flows[1], { from: "Dashboard", to: "Settings" });
});

// Test 3: parseApprovedSpec extracts UI-REF items with path and AC links
test("parseApprovedSpec extracts UI-REF items with path and AC links", () => {
  const parsed = parseApprovedSpec(SPEC_WITH_UI, { feature: "ui-feature" });
  assert.equal(parsed.uiStructure.refs.length, 2);

  assert.equal(parsed.uiStructure.refs[0].id, "UI-REF-1");
  assert.equal(parsed.uiStructure.refs[0].path, "mockups/login.png");
  assert.deepEqual(parsed.uiStructure.refs[0].acIds, ["AC-1", "AC-2"]);

  assert.equal(parsed.uiStructure.refs[1].id, "UI-REF-2");
  assert.equal(parsed.uiStructure.refs[1].path, "mockups/dashboard.png");
  assert.deepEqual(parsed.uiStructure.refs[1].acIds, ["AC-3"]);
});

// Test 4: deliver blocks when UI-REF references missing file
test("deliver blocks when UI-REF references a missing file", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-ui-ref-missing-"));
  const feature = "ui-ref-missing";

  // Setup project
  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "UI traceability test", "--non-interactive", "--yes"], { cwd: tempDir });

  // Write spec with UI-REF pointing to nonexistent file
  const specWithRef = `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
A feature with UI references.

## 2. Actors
- End user

## 3. Functional Rules (traceable)
- FR-1: The system must display a login form.

## 4. Edge Cases
- Missing credentials.

## 6. UI Structure

Screen: Login
┌──────────┐
│ [button: submit] │
└──────────┘

### References
- UI-REF-1: mockups/nonexistent.png → AC-1

## 7. Security Considerations
- Rate limit login attempts.

## 9. Acceptance Criteria (Given/When/Then)
- AC-1: Given the login page, when credentials are entered, then user is authenticated.
`;
  fs.writeFileSync(
    path.join(tempDir, "specs", "drafts", `${feature}.md`),
    specWithRef,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    `{"name":"aitri-ui-smoke","private":true,"scripts":{"test:aitri":"node -e \\"process.exit(0)\\""}}`,
    "utf8"
  );

  runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  spawnSync("git", ["add", "-A"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "ready"], { cwd: tempDir, encoding: "utf8" });
  runNodeOk(["go", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["scaffold", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["implement", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  // Make test stubs pass
  const generatedDir = path.join(tempDir, "tests", feature, "generated");
  if (fs.existsSync(generatedDir)) {
    fs.readdirSync(generatedDir).filter((n) => n.endsWith(".test.mjs")).forEach((file) => {
      const abs = path.join(generatedDir, file);
      const content = fs.readFileSync(abs, "utf8");
      fs.writeFileSync(abs, content.replace(/assert\.fail\([^)]+\);/g, 'assert.ok(true, "implemented");'), "utf8");
    });
  }

  runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  const deliver = runNode(["deliver", "--feature", feature, "--non-interactive", "--yes", "--json"], { cwd: tempDir });
  const payload = JSON.parse(deliver.stdout);
  assert.ok(payload.blockers.some((b) => /UI-REF.*missing file/.test(b)), "Should have UI-REF blocker");
});

// Test 5: deliver passes when UI-REF file exists
test("deliver passes UI-REF validation when referenced file exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-ui-ref-exists-"));
  const feature = "ui-ref-exists";

  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "UI traceability test", "--non-interactive", "--yes"], { cwd: tempDir });

  const specWithRef = `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
A feature with UI references.

## 2. Actors
- End user

## 3. Functional Rules (traceable)
- FR-1: The system must display a login form.

## 4. Edge Cases
- Missing credentials.

## 6. UI Structure

Screen: Login
┌──────────┐
│ [button: submit] │
└──────────┘

### References
- UI-REF-1: mockups/login.png → AC-1

## 7. Security Considerations
- Rate limit login attempts.

## 9. Acceptance Criteria (Given/When/Then)
- AC-1: Given the login page, when credentials are entered, then user is authenticated.
`;
  fs.writeFileSync(
    path.join(tempDir, "specs", "drafts", `${feature}.md`),
    specWithRef,
    "utf8"
  );

  // Create the mockup file so UI-REF validation passes
  fs.mkdirSync(path.join(tempDir, "mockups"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "mockups", "login.png"), "fake-png-data", "utf8");

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    `{"name":"aitri-ui-smoke","private":true,"scripts":{"test:aitri":"node -e \\"process.exit(0)\\""}}`,
    "utf8"
  );

  runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  spawnSync("git", ["add", "-A"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "ready"], { cwd: tempDir, encoding: "utf8" });
  runNodeOk(["go", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["scaffold", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["implement", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  const generatedDir = path.join(tempDir, "tests", feature, "generated");
  if (fs.existsSync(generatedDir)) {
    fs.readdirSync(generatedDir).filter((n) => n.endsWith(".test.mjs")).forEach((file) => {
      const abs = path.join(generatedDir, file);
      const content = fs.readFileSync(abs, "utf8");
      fs.writeFileSync(abs, content.replace(/assert\.fail\([^)]+\);/g, 'assert.ok(true, "implemented");'), "utf8");
    });
  }

  runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  const deliver = runNode(["deliver", "--feature", feature, "--non-interactive", "--yes", "--json"], { cwd: tempDir });
  const payload = JSON.parse(deliver.stdout);
  assert.ok(!payload.blockers.some((b) => /UI-REF/.test(b)), "Should have no UI-REF blockers");
  assert.ok(Array.isArray(payload.uiRefValidation));
  assert.equal(payload.uiRefValidation[0].fileExists, true);
});

// Test 6: generateTestsContent includes UI Flows section when hasUiSection is true
test("generateTestsContent includes UI Flows section when uiStructure has flows", () => {
  const parsed = parseApprovedSpec(SPEC_WITH_UI, { feature: "ui-feature" });
  const stories = [
    {
      id: "US-1",
      actor: "End user",
      capability: "authenticate via login form",
      benefit: "users can access the right capabilities safely",
      frIds: ["FR-1"],
      acIds: ["AC-1"],
      acceptance: [{ given: "valid credentials", when: "login form is submitted", then: "user sees the dashboard" }]
    }
  ];

  const result = generateTestsContent({
    feature: "ui-feature",
    parsedSpec: parsed,
    rigor: { mode: "standard", qaPolicy: "Every TC traces to FR and US." },
    qualityProfile: { id: "web", label: "Web Application" },
    stories
  });

  assert.match(result, /## UI Flows/);
  assert.match(result, /Login to Dashboard/);
  assert.match(result, /Dashboard to Settings/);
  assert.match(result, /Given user is on the Login screen/);
  assert.match(result, /then user is navigated to Dashboard/);
});

// ─── EVO-027: Multi-line FR/AC parsing ────────────────────────────────────────

test("parseApprovedSpec captures sub-bullet detail in FR text", () => {
  const spec = `# AF-SPEC: multi-line-test
STATUS: APPROVED
## 3. Functional Rules (traceable)
- FR-1: The system must authenticate users.
  - Supports email/password login.
  - Supports OAuth via Google.
- FR-2: The system must reject invalid credentials.
## 9. Acceptance Criteria (Given/When/Then)
- AC-1: Given valid credentials, when submitted, then access is granted.
`;
  const parsed = parseApprovedSpec(spec);
  assert.equal(parsed.functionalRules.length, 2);
  assert.match(parsed.functionalRules[0].text, /Supports email\/password login/);
  assert.match(parsed.functionalRules[0].text, /Supports OAuth via Google/);
  assert.equal(parsed.functionalRules[1].text, "The system must reject invalid credentials.");
});

test("parseApprovedSpec explicit Tech Stack field takes precedence over keyword scan", () => {
  const spec = `# AF-SPEC: stack-test
STATUS: APPROVED
Tech Stack: Python + FastAPI
## 3. Functional Rules (traceable)
- FR-1: The system must expose a REST API.
## 9. Acceptance Criteria (Given/When/Then)
- AC-1: Given a request, when processed, then a response is returned.
`;
  const parsed = parseApprovedSpec(spec);
  assert.equal(parsed.techStack.id, "python");
  assert.equal(parsed.techStack.confidence, "explicit");
});

// ─── EVO-001: Auditor Mode unit tests ────────────────────────────────────────

const AUDIT_SPEC = {
  functionalRules: [
    { id: "FR-1", text: "The system must authenticate users." },
    { id: "FR-2", text: "The system must reject invalid credentials." }
  ],
  acceptanceCriteria: [
    { id: "AC-1", text: "Given valid credentials, when submitted, then access is granted." },
    { id: "AC-2", text: "Given invalid credentials, when submitted, then an error is shown." }
  ],
  actors: ["User"],
  edgeCases: [],
  securityNotes: [],
  uiStructure: { hasUiSection: false, screens: [], components: [], flows: [], uiRefs: [] }
};

const VALID_BACKLOG = [
  "# Backlog: test-feature",
  "",
  "## User Stories",
  "",
  "### US-1",
  "- As a user, I want to log in, so that I can access the system.",
  "- Trace: FR-1, AC-1",
  "",
  "### US-2",
  "- As a user, I want invalid logins rejected, so that my account is protected.",
  "- Trace: FR-2, AC-2"
].join("\n");

const VALID_TESTS = [
  "# Test Cases: test-feature",
  "",
  "### TC-1",
  "- Trace: US-1, FR-1",
  "",
  "### TC-2",
  "- Trace: US-2, FR-2"
].join("\n");

test("auditBacklog passes when all US have valid FR traces", () => {
  const result = auditBacklog(VALID_BACKLOG, AUDIT_SPEC);
  assert.equal(result.ok, true, `expected ok, got issues: ${result.issues.join(", ")}`);
  assert.equal(result.stories.length, 2);
  assert.equal(result.issues.length, 0);
});

test("auditBacklog fails when US references a non-existent FR", () => {
  const badBacklog = VALID_BACKLOG.replace("Trace: FR-1, AC-1", "Trace: FR-99, AC-1");
  const result = auditBacklog(badBacklog, AUDIT_SPEC);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(i => i.includes("FR-99")), `expected FR-99 issue, got: ${result.issues.join(", ")}`);
});

test("auditBacklog fails when US has no FR trace", () => {
  const noTraceBlog = VALID_BACKLOG.replace("Trace: FR-1, AC-1", "Trace: AC-1");
  const result = auditBacklog(noTraceBlog, AUDIT_SPEC);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(i => i.includes("missing Trace")), `expected missing trace issue, got: ${result.issues.join(", ")}`);
});

test("auditBacklog fails when no US blocks found", () => {
  const result = auditBacklog("# Backlog\n\nNo stories here.", AUDIT_SPEC);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(i => i.includes("No User Stories")));
});

test("auditTests passes when all TC have valid traces", () => {
  const backlogAudit = auditBacklog(VALID_BACKLOG, AUDIT_SPEC);
  const result = auditTests(VALID_TESTS, AUDIT_SPEC, backlogAudit.stories);
  assert.equal(result.ok, true, `expected ok, got issues: ${result.issues.join(", ")}`);
  assert.equal(result.testCases.length, 2);
});

test("auditTests fails when TC references non-existent US", () => {
  const badTests = VALID_TESTS.replace("Trace: US-1, FR-1", "Trace: US-99, FR-1");
  const backlogAudit = auditBacklog(VALID_BACKLOG, AUDIT_SPEC);
  const result = auditTests(badTests, AUDIT_SPEC, backlogAudit.stories);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(i => i.includes("US-99")));
});

test("auditAgentContent returns ok when backlog and tests are valid", () => {
  const result = auditAgentContent({
    parsedSpec: AUDIT_SPEC,
    agentContent: { backlog: VALID_BACKLOG, tests: VALID_TESTS, architecture: "" }
  });
  assert.equal(result.ok, true, `expected ok, got: ${result.issues.join(", ")}`);
  assert.equal(result.issues.length, 0);
  assert.equal(result.stories.length, 2);
});

test("auditAgentContent aggregates issues from backlog and tests", () => {
  const result = auditAgentContent({
    parsedSpec: AUDIT_SPEC,
    agentContent: {
      backlog: VALID_BACKLOG.replace("Trace: FR-1, AC-1", "Trace: FR-99"),
      tests: VALID_TESTS.replace("Trace: US-1, FR-1", "Trace: US-99"),
      architecture: ""
    }
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(i => i.includes("[backlog]") && i.includes("FR-99")));
  assert.ok(result.issues.some(i => i.includes("[tests]") && i.includes("US-99")));
});

// EVO-006: Contract-Test Linkage unit tests (no filesystem)

test("parseTestCases extracts frIds from TC Trace line", () => {
  const testsContent = [
    "### TC-1",
    "- Title: Validate credentials",
    "- Trace: US-1, FR-1, AC-1",
    "",
    "### TC-2",
    "- Title: Reject invalid logins",
    "- Trace: US-2, FR-2, FR-3, AC-2"
  ].join("\n");

  const cases = parseTestCases(testsContent);
  assert.equal(cases.length, 2);
  assert.deepEqual(cases[0].frIds, ["FR-1"]);
  assert.deepEqual(cases[1].frIds, ["FR-2", "FR-3"]);
});

test("parseTestCases returns empty frIds when no FR-* in trace", () => {
  const testsContent = [
    "### TC-1",
    "- Trace: US-1, AC-1"
  ].join("\n");

  const cases = parseTestCases(testsContent);
  assert.deepEqual(cases[0].frIds, []);
});

test("buildContractImports generates ESM import for node stack with FR trace", () => {
  const tc = {
    id: "TC-1",
    title: "Validate user credentials",
    acIds: ["AC-1"],
    frIds: ["FR-1"]
  };
  const parsedSpec = {
    functionalRules: [{ id: "FR-1", text: "The system must validate user credentials before granting access." }]
  };
  const root = "/project";
  const testFile = "/project/tests/user-auth/generated/tc-1-validate-user.test.mjs";

  const result = buildContractImports({ tc, root, testFile, stackFamily: "node", feature: "user-auth", parsedSpec });

  assert.ok(result.startsWith("import {"), `should start with import, got: ${result}`);
  assert.ok(result.includes("from"), `should include from clause, got: ${result}`);
  assert.ok(result.includes("src/contracts"), `should reference src/contracts, got: ${result}`);
  assert.ok(result.includes("fr-1"), `should reference fr-1 contract, got: ${result}`);
});

test("buildContractImports emits fallback comment when no FR traces", () => {
  const tc = { id: "TC-1", title: "Test", acIds: [], frIds: [] };

  const resultNode = buildContractImports({ tc, root: "/p", testFile: "/p/tests/f/generated/tc-1.test.mjs", stackFamily: "node", feature: "f", parsedSpec: {} });
  assert.ok(resultNode.includes("No contract linked"), `node fallback, got: ${resultNode}`);

  const resultPython = buildContractImports({ tc, root: "/p", testFile: "/p/tests/f/generated/test_tc_1.py", stackFamily: "python", feature: "f", parsedSpec: {} });
  assert.ok(resultPython.includes("No contract linked"), `python fallback, got: ${resultPython}`);
});

test("buildContractImports generates Go import block with testing and contracts", () => {
  const tc = {
    id: "TC-1",
    title: "Test",
    acIds: [],
    frIds: ["FR-1"]
  };
  const parsedSpec = {
    functionalRules: [{ id: "FR-1", text: "do something" }]
  };

  const result = buildContractImports({ tc, root: "/p", testFile: "/p/tests/f/generated/tc_1_test.go", stackFamily: "go", feature: "my-feature", parsedSpec });
  assert.ok(result.includes('"testing"'), `should include testing package, got: ${result}`);
  assert.ok(result.includes("my-feature/internal/contracts"), `should include contracts package, got: ${result}`);
});

// Helper
function setupGit(tempDir) {
  spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Aitri Test"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "aitri@example.com"], { cwd: tempDir, encoding: "utf8" });
  fs.writeFileSync(path.join(tempDir, ".gitkeep"), "seed\n", "utf8");
  spawnSync("git", ["add", ".gitkeep"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "baseline"], { cwd: tempDir, encoding: "utf8" });
}
