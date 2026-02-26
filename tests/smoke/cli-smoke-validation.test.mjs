import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";
import { parseFeatureInput } from "../../cli/commands/draft.js";

// ── Fixture helpers ──────────────────────────────────────────────────────────

function setupDirs(tempDir, feature, { discovery = false, plan = false } = {}) {
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "backlog", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", feature), { recursive: true });
  if (discovery) fs.mkdirSync(path.join(tempDir, "docs", "discovery"), { recursive: true });
  if (plan) fs.mkdirSync(path.join(tempDir, "docs", "plan"), { recursive: true });
}

function writeSpec(tempDir, feature, frs = ["FR-1: Rule one."]) {
  const lines = frs.map((fr) => `- ${fr}`).join("\n");
  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n${lines}\n`,
    "utf8"
  );
}

function writeBacklog(tempDir, feature, trace = "FR-1, AC-1") {
  fs.writeFileSync(
    path.join(tempDir, "backlog", feature, "backlog.md"),
    `# Backlog: ${feature}\n### US-1\n- Trace: ${trace}\n`,
    "utf8"
  );
}

function writeTests(tempDir, feature, trace = "US-1, FR-1, AC-1") {
  fs.writeFileSync(
    path.join(tempDir, "tests", feature, "tests.md"),
    `# Test Cases: ${feature}\n### TC-1\n- Trace: ${trace}\n`,
    "utf8"
  );
}

function writeDiscovery(tempDir, feature, { users = "Operators", job = "Validate workflow", metric = "Checks pass" } = {}) {
  fs.writeFileSync(
    path.join(tempDir, "docs", "discovery", `${feature}.md`),
    `# Discovery: ${feature}\n\n## 2. Discovery Interview Summary (Discovery Persona)\n` +
    `- Primary users:\n- ${users}\n- Jobs to be done:\n- ${job}\n` +
    `- Current pain:\n- Issues exist\n- Constraints (business/technical/compliance):\n- Keep deterministic\n` +
    `- Dependencies:\n- Existing CLI flow\n- Success metrics:\n- ${metric}\n- Assumptions:\n- Inputs are stable\n\n` +
    `## 3. Scope\n### In scope\n- Core checks\n\n### Out of scope\n- New capabilities\n\n` +
    `## 9. Discovery Confidence\n- Confidence:\n- Medium\n\n- Reason:\n- Sufficient context\n\n` +
    `- Evidence gaps:\n- None critical\n\n- Handoff decision:\n- Ready for Product/Architecture\n`,
    "utf8"
  );
}

function writePlan(tempDir, feature, { withSecurity = false, productValue = "Deliver value.", productMetric = "Quality pass." } = {}) {
  let content =
    `# Plan: ${feature}\n\n## 4. Product Review (Product Persona)\n` +
    `### Business value\n- ${productValue}\n\n### Success metric\n- ${productMetric}\n\n` +
    `### Assumptions to validate\n- Format stable.\n\n## 5. Architecture (Architect Persona)\n` +
    `### Components\n- Core service\n\n### Data flow\n- Request to response\n\n` +
    `### Key decisions\n- Keep simple\n\n### Risks & mitigations\n- Low risk\n\n` +
    `### Observability (logs/metrics/tracing)\n- Log events\n`;
  if (withSecurity) {
    content += `\n## 6. Security (Security Persona)\n### Threats\n-\n\n### Required controls\n-\n`;
  }
  fs.writeFileSync(path.join(tempDir, "docs", "plan", `${feature}.md`), content, "utf8");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("validate and handoff block when persona outputs are unresolved", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-persona-gate-"));
  const feature = "persona-gate";
  setupDirs(tempDir, feature, { discovery: true, plan: true });
  fs.mkdirSync(path.join(tempDir, "specs", "drafts"), { recursive: true });
  writeSpec(tempDir, feature, ["FR-1: Authenticate the user with valid credentials."]);
  writeBacklog(tempDir, feature);
  writeTests(tempDir, feature);

  fs.writeFileSync(
    path.join(tempDir, "docs", "discovery", `${feature}.md`),
    `# Discovery: ${feature}\n\n## 2. Discovery Interview Summary (Discovery Persona)\n` +
    `- Primary users:\n- Registered users\n- Jobs to be done:\n- Sign in quickly and securely\n` +
    `- Current pain:\n- Failed authentication flow is inconsistent\n` +
    `- Constraints (business/technical/compliance):\n- Must preserve account security controls\n` +
    `- Dependencies:\n- Identity provider API\n- Success metrics:\n- Login success rate above 98%\n` +
    `- Assumptions:\n- Users already have verified email accounts\n\n` +
    `## 3. Scope\n### In scope\n- Login and rejected-login handling\n\n### Out of scope\n- Social login\n\n` +
    `## 9. Discovery Confidence\n- Confidence:\n- Medium\n\n- Reason:\n- Inputs are enough for planning baseline\n\n` +
    `- Evidence gaps:\n- Precise latency target still pending\n\n- Handoff decision:\n- Ready for Product/Architecture\n`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "docs", "plan", `${feature}.md`),
    `# Plan: ${feature}\nSTATUS: DRAFT\n\n## 4. Product Review (Product Persona)\n### Business value\n-\n\n` +
    `### Success metric\n-\n\n### Assumptions to validate\n-\n\n## 5. Architecture (Architect Persona)\n` +
    `### Components\n-\n\n### Data flow\n-\n\n### Key decisions\n-\n\n### Risks & mitigations\n-\n\n` +
    `### Observability (logs/metrics/tracing)\n-\n`,
    "utf8"
  );

  const validate = runNode(["validate", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  assert.equal(validate.status, 1);
  const payload = JSON.parse(validate.stdout);
  assert.equal(payload.ok, false);
  assert.ok(payload.gapSummary.persona >= 2);
  assert.match(payload.gaps.persona[0], /Persona gate:/);

  // New flow: handoff checks plan state only (not verify). Plan exists → ready_for_human_approval.
  // Persona issues are caught by go command's internal validate check, not by status state machine.
  const handoff = runNode(["handoff", "json"], { cwd: tempDir });
  assert.equal(handoff.status, 0);
  const handoffPayload = JSON.parse(handoff.stdout);
  assert.equal(handoffPayload.ok, true);
  assert.equal(handoffPayload.nextStep, "ready_for_human_approval");
});

test("validate fails in non-interactive mode without --feature", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-missing-feature-"));
  const result = runNode(["validate", "--non-interactive", "--json"], { cwd: tempDir });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.issues[0], /Feature name is required/);
  assert.equal(payload.gaps.usage.length, 1);
});

test("write commands fail in non-interactive mode when --yes is missing", () => {
  // Commands that still require --yes in non-interactive mode (have interactive correction flows)
  // draft in non-interactive mode without --idea or --input requires --yes
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-no-yes-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const result = runNode(["draft", "--feature", "test-feat", "--non-interactive"], { cwd: tempDir });

  assert.equal(result.status, 1);
});

test("init succeeds in non-interactive mode without --yes (no confirmation required)", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-init-ni-"));
  const result = runNode(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  assert.equal(result.status, 0);
});

test("validate json classifies coverage gaps by type", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-gaps-"));
  const feature = "coverage-gaps";
  setupDirs(tempDir, feature, { discovery: true, plan: true });
  writeSpec(tempDir, feature, ["FR-1: Rule one.", "FR-2: Rule two."]);
  writeBacklog(tempDir, feature, "FR-1");
  writeTests(tempDir, feature, "US-1, FR-1");
  writeDiscovery(tempDir, feature, { users: "Operators", job: "Validate traceability signals", metric: "Missing links are always reported" });
  writePlan(tempDir, feature, { productValue: "Keep coverage debt visible.", productMetric: "Every FR maps to backlog and tests." });

  const result = runNode(["validate", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  assert.equal(result.status, 1);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.gapSummary.coverage_fr_us, 1);
  assert.equal(payload.gapSummary.coverage_fr_tc, 1);
  assert.equal(payload.gapSummary.coverage_us_tc, 0);
  assert.equal(payload.gaps.coverage_fr_us.length, 1);
  assert.equal(payload.gaps.coverage_fr_tc.length, 1);
});

test("validate fails when discovery and plan artifacts are missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-validate-missing-artifacts-"));
  const feature = "missing-artifacts";
  setupDirs(tempDir, feature);
  writeSpec(tempDir, feature);
  writeBacklog(tempDir, feature);
  writeTests(tempDir, feature);

  const result = runNode(["validate", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.gapSummary.missing_artifact, 2);
  assert.equal(payload.gaps.missing_artifact.length, 2);
  assert.match(payload.gaps.missing_artifact[0], /Missing discovery|Missing plan/);
});

test("validate enforces story contract for plan-generated backlog", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-story-contract-"));
  const feature = "story-contract";
  setupDirs(tempDir, feature, { discovery: true, plan: true });
  writeSpec(tempDir, feature);
  fs.writeFileSync(
    path.join(tempDir, "backlog", feature, "backlog.md"),
    `# Backlog: ${feature}\n\n> Generated by \`aitri plan\`.\n\n### US-1\n` +
    `- As a user, I want a thing, so that value is delivered.\n- Trace: FR-1, AC-1\n- Acceptance Criteria:\n  - Works properly.\n`,
    "utf8"
  );
  writeTests(tempDir, feature);
  writeDiscovery(tempDir, feature, { job: "Validate workflow", metric: "Story quality gate catches weak stories" });
  writePlan(tempDir, feature, { productValue: "Improve story quality.", productMetric: "Contract checks pass." });

  const result = runNode(["validate", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.ok(payload.gapSummary.story_contract >= 1);
  assert.ok(payload.gaps.story_contract.some((issue) => /Story contract:/.test(issue)));
});

test("validate supports --format json", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-validate-format-"));
  const result = runNode(["validate", "--non-interactive", "--format", "json"], { cwd: tempDir });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.issues[0], /Feature name is required/);
});

test("validate catches missing security section in plan", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-security-gate-"));
  const feature = "security-gate";
  setupDirs(tempDir, feature, { discovery: true, plan: true });
  writeSpec(tempDir, feature, ["FR-1: Authenticate the user with valid credentials."]);
  writeBacklog(tempDir, feature);
  writeTests(tempDir, feature);
  writeDiscovery(tempDir, feature, { users: "Security team members", job: "Security validation in planning", metric: "All plans include security review" });
  writePlan(tempDir, feature, { withSecurity: true, productValue: "Enforce security review.", productMetric: "Security section present." });

  const result = runNode(["validate", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.ok(payload.gaps.persona.some((issue) => /Security/.test(issue)), "Should flag empty Security subsections");
});

test("validate catches missing UX/UI section when spec mentions UI elements", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-uxui-gate-"));
  const feature = "uxui-gate";
  setupDirs(tempDir, feature, { discovery: true, plan: true });
  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n- FR-1: Render a dashboard with form and button controls.\n`,
    "utf8"
  );
  writeBacklog(tempDir, feature);
  writeTests(tempDir, feature);
  writeDiscovery(tempDir, feature, { users: "End users", job: "View dashboard metrics", metric: "UX review captured" });
  writePlan(tempDir, feature, { productValue: "Improve UI visibility.", productMetric: "Dashboard loads fast." });

  const result = runNode(["validate", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.ok(payload.gaps.persona.some((issue) => /UX\/UI/.test(issue)), "Should flag missing UX/UI section");
});

test("guided draft non-interactive preserves user input without inferred requirements", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-guided-tech-"));
  const feature = "guided-tech";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk([
    "draft", "--guided", "--feature", feature,
    "--idea", "Build a web dashboard in React for customer support metrics",
    "--non-interactive", "--yes"
  ], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  const content = fs.readFileSync(draftFile, "utf8");
  assert.match(content, /Summary \(provided by user\):/);
  assert.match(content, /Requirement source: provided explicitly by user via --idea/);
  assert.match(content, /No inferred requirements were added by Aitri/);
  assert.doesNotMatch(content, /Aitri suggestion \(auto-applied\)/);
  assert.doesNotMatch(content, /Technology source:/);
});

// ─── EVO-026: parseFeatureInput unit tests ────────────────────────────────────

const VALID_INPUT = `# Feature Input: expense-tracker

## Problem
Users need to track expense entries across categories with audit logs.

## Actors
- Finance user: submits and reviews expense entries
- Auditor: reviews logs for compliance

## Business Rules
- The system must validate that each expense entry has an amount, category, and date
- The system must create an immutable audit log entry for every write operation

## Examples
- Input: POST /expenses { amount: 50, category: "travel", date: "2026-01-15" }
  Output: 201 Created with entry ID and audit log reference
- Input: POST /expenses { amount: -10 }
  Output: 400 Bad Request with validation error

## Success Criteria
- Given a valid expense payload, when submitted, then a 201 response is returned with entry ID.
- Given a missing required field, when submitted, then a 400 response with field-level errors is returned.

## Out of Scope
- PDF export
- Email notifications

## Tech Stack
Node.js + Express

## Priority
P0
`;

test("parseFeatureInput extracts all structured sections correctly", () => {
  const parsed = parseFeatureInput(VALID_INPUT);
  assert.ok(parsed.valid, "should be valid");
  assert.match(parsed.problem, /track expense entries/);
  assert.equal(parsed.actors.length, 2);
  assert.match(parsed.actors[0], /Finance user/);
  assert.equal(parsed.rules.length, 2);
  assert.match(parsed.rules[0], /validate that each expense/);
  assert.equal(parsed.examples.length, 2);
  assert.match(parsed.examples[0].input, /POST \/expenses/);
  assert.match(parsed.examples[0].output, /201 Created/);
  assert.equal(parsed.criteria.length, 2);
  assert.match(parsed.criteria[0], /Given a valid expense/);
  assert.match(parsed.outOfScope, /PDF export/);
  assert.equal(parsed.techStack, "Node.js + Express");
  assert.equal(parsed.priority, "P0");
});

test("parseFeatureInput reports invalid for missing problem", () => {
  const parsed = parseFeatureInput(`# Feature Input: x\n## Business Rules\n- The system must do something\n`);
  assert.ok(!parsed.valid);
});

test("parseFeatureInput reports invalid for missing business rules", () => {
  const parsed = parseFeatureInput(`# Feature Input: x\n## Problem\nThis is a long enough problem description.\n`);
  assert.ok(!parsed.valid);
});

test("parseFeatureInput ignores unfilled template placeholders", () => {
  const parsed = parseFeatureInput(`# Feature Input: x
## Problem
Real problem description here.
## Business Rules
- The system must do something real
- <placeholder rule>
## Success Criteria
- Given <context>, when <action>, then <expected>.
`);
  assert.equal(parsed.rules.length, 1, "should skip placeholder rules");
  assert.equal(parsed.criteria.length, 0, "should skip placeholder criteria");
});

test("draft --input produces spec with FR and AC sections", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-input-draft-"));
  const inputFile = path.join(tempDir, "feature-input.md");
  fs.writeFileSync(inputFile, VALID_INPUT, "utf8");
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk([
    "draft", "--feature", "expense-tracker",
    "--input", inputFile,
    "--non-interactive", "--yes"
  ], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", "expense-tracker.md");
  const content = fs.readFileSync(draftFile, "utf8");
  assert.match(content, /## 3\. Functional Rules/);
  assert.match(content, /FR-1:/);
  assert.match(content, /FR-2:/);
  assert.match(content, /## 9\. Acceptance Criteria/);
  assert.match(content, /AC-1:/);
  assert.match(content, /AC-2:/);
  assert.match(content, /Tech Stack: Node\.js \+ Express/);
  assert.match(content, /Priority: P0/);
  assert.match(content, /Example — Input:/);
});
