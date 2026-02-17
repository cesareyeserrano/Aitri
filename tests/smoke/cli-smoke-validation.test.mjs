import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";

test("validate and handoff block when persona outputs are unresolved", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-persona-gate-"));
  const feature = "persona-gate";

  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "backlog", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "discovery"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "plan"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "specs", "drafts"), { recursive: true });

  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}
STATUS: APPROVED
## 3. Functional Rules (traceable)
- FR-1: Authenticate the user with valid credentials.
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "backlog", feature, "backlog.md"),
    `# Backlog: ${feature}
### US-1
- Trace: FR-1, AC-1
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "tests", feature, "tests.md"),
    `# Test Cases: ${feature}
### TC-1
- Trace: US-1, FR-1, AC-1
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "docs", "discovery", `${feature}.md`),
    `# Discovery: ${feature}

## 2. Discovery Interview Summary (Discovery Persona)
- Primary users:
- Registered users
- Jobs to be done:
- Sign in quickly and securely
- Current pain:
- Failed authentication flow is inconsistent
- Constraints (business/technical/compliance):
- Must preserve account security controls
- Dependencies:
- Identity provider API
- Success metrics:
- Login success rate above 98%
- Assumptions:
- Users already have verified email accounts

## 3. Scope
### In scope
- Login and rejected-login handling

### Out of scope
- Social login

## 9. Discovery Confidence
- Confidence:
- Medium

- Reason:
- Inputs are enough for planning baseline

- Evidence gaps:
- Precise latency target still pending

- Handoff decision:
- Ready for Product/Architecture
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "docs", "plan", `${feature}.md`),
    `# Plan: ${feature}
STATUS: DRAFT

## 4. Product Review (Product Persona)
### Business value
-

### Success metric
-

### Assumptions to validate
-

## 5. Architecture (Architect Persona)
### Components
-

### Data flow
-

### Key decisions
-

### Risks & mitigations
-

### Observability (logs/metrics/tracing)
-
`,
    "utf8"
  );

  const validate = runNode(["validate", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  assert.equal(validate.status, 1);
  const payload = JSON.parse(validate.stdout);
  assert.equal(payload.ok, false);
  assert.ok(payload.gapSummary.persona >= 2);
  assert.match(payload.gaps.persona[0], /Persona gate:/);

  const handoff = runNode(["handoff", "json"], { cwd: tempDir });
  assert.equal(handoff.status, 1);
  const handoffPayload = JSON.parse(handoff.stdout);
  assert.equal(handoffPayload.ok, false);
  assert.equal(handoffPayload.nextStep, "aitri validate");
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-no-yes-"));
  const result = runNode(["init", "--non-interactive"], { cwd: tempDir });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /requires --yes/);
});

test("interactive abort returns exit code 2", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-abort-"));
  const result = runNode(["init"], { cwd: tempDir, input: "n\n" });

  assert.equal(result.status, 2);
  assert.match(result.stdout, /Aborted/);
});

test("validate json classifies coverage gaps by type", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-gaps-"));
  const feature = "coverage-gaps";

  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "backlog", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "discovery"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "plan"), { recursive: true });

  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}
STATUS: APPROVED
## 3. Functional Rules (traceable)
- FR-1: Rule one.
- FR-2: Rule two.
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "backlog", feature, "backlog.md"),
    `# Backlog: ${feature}
### US-1
- Trace: FR-1
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "tests", feature, "tests.md"),
    `# Test Cases: ${feature}
### TC-1
- Trace: US-1, FR-1
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "docs", "discovery", `${feature}.md`),
    `# Discovery: ${feature}

## 2. Discovery Interview Summary (Discovery Persona)
- Primary users:
- Operators
- Jobs to be done:
- Validate traceability signals
- Current pain:
- Missing coverage is hard to detect
- Constraints (business/technical/compliance):
- Keep deterministic checks
- Dependencies:
- Existing CLI flow
- Success metrics:
- Missing links are always reported
- Assumptions:
- Spec IDs remain stable

## 3. Scope
### In scope
- Coverage checks

### Out of scope
- New capabilities

## 9. Discovery Confidence
- Confidence:
- Medium

- Reason:
- Evidence is sufficient for validation checks

- Evidence gaps:
- None critical

- Handoff decision:
- Ready for Product/Architecture
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "docs", "plan", `${feature}.md`),
    `# Plan: ${feature}

## 4. Product Review (Product Persona)
### Business value
- Keep coverage debt visible.

### Success metric
- Every FR maps to backlog and tests.

### Assumptions to validate
- Trace IDs stay stable.

## 5. Architecture (Architect Persona)
### Components
- Validation command

### Data flow
- Spec parsed and compared to backlog/tests

### Key decisions
- Fail on missing trace

### Risks & mitigations
- Drift reduced by strict enforcement

### Observability (logs/metrics/tracing)
- Deterministic issue output
`,
    "utf8"
  );

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

  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "backlog", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", feature), { recursive: true });

  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}
STATUS: APPROVED
## 3. Functional Rules (traceable)
- FR-1: Rule one.
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "backlog", feature, "backlog.md"),
    `# Backlog: ${feature}
### US-1
- Trace: FR-1, AC-1
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "tests", feature, "tests.md"),
    `# Test Cases: ${feature}
### TC-1
- Trace: US-1, FR-1, AC-1
`,
    "utf8"
  );

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

  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "backlog", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "discovery"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "plan"), { recursive: true });

  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}
STATUS: APPROVED
## 3. Functional Rules (traceable)
- FR-1: Rule one.
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "backlog", feature, "backlog.md"),
    `# Backlog: ${feature}

> Generated by \`aitri plan\`.

### US-1
- As a user, I want a thing, so that value is delivered.
- Trace: FR-1, AC-1
- Acceptance Criteria:
  - Works properly.
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "tests", feature, "tests.md"),
    `# Test Cases: ${feature}
### TC-1
- Trace: US-1, FR-1, AC-1
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "docs", "discovery", `${feature}.md`),
    `# Discovery: ${feature}

## 2. Discovery Interview Summary (Discovery Persona)
- Primary users:
- Operators
- Jobs to be done:
- Validate workflow
- Current pain:
- Drift in story quality
- Constraints (business/technical/compliance):
- Keep deterministic contracts
- Dependencies:
- Existing CLI flow
- Success metrics:
- Story quality gate catches weak stories
- Assumptions:
- Inputs are stable

## 3. Scope
### In scope
- Story contract checks

### Out of scope
- New capabilities

## 9. Discovery Confidence
- Confidence:
- Medium

- Reason:
- Sufficient discovery context

- Evidence gaps:
- None critical

- Handoff decision:
- Ready for Product/Architecture
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "docs", "plan", `${feature}.md`),
    `# Plan: ${feature}

## 4. Product Review (Product Persona)
### Business value
- Improve story quality.

### Success metric
- Contract checks pass.

### Assumptions to validate
- Story format remains consistent.

## 5. Architecture (Architect Persona)
### Components
- Validation command

### Data flow
- Backlog parsed and checked

### Key decisions
- Block weak contracts

### Risks & mitigations
- False positives reduced with narrow scope

### Observability (logs/metrics/tracing)
- Deterministic errors
`,
    "utf8"
  );

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

test("guided draft non-interactive preserves user input without inferred requirements", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-guided-tech-"));
  const feature = "guided-tech";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk([
    "draft",
    "--guided",
    "--feature", feature,
    "--idea", "Build a web dashboard in React for customer support metrics",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  const content = fs.readFileSync(draftFile, "utf8");
  assert.match(content, /Summary \(provided by user\):/);
  assert.match(content, /Requirement source: provided explicitly by user via --idea/);
  assert.match(content, /No inferred requirements were added by Aitri/);
  assert.doesNotMatch(content, /Aitri suggestion \(auto-applied\)/);
  assert.doesNotMatch(content, /Technology source:/);
});
