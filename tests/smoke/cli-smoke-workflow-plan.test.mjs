import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";

test("plan injects domain quality profile and asset strategy", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-quality-profile-"));
  const feature = "quality-profile-web";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk([
    "draft",
    "--feature", feature,
    "--idea", "Build a web dashboard for support operations in React",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  fs.writeFileSync(
    draftFile,
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
We need a web dashboard for support teams.

## 2. Actors
- Support agent
- Team lead

## 3. Functional Rules (traceable)
- FR-1: Show ticket queue and SLA status.

## 4. Edge Cases
- Dashboard load when ticket queue API is unavailable.

## 7. Security Considerations
- Access must require authentication.

## 9. Acceptance Criteria
- AC-1: Given an authenticated support agent, when dashboard loads, then queue and SLA data are visible.
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  const plan = fs.readFileSync(path.join(tempDir, "docs", "plan", `${feature}.md`), "utf8");
  const backlog = fs.readFileSync(path.join(tempDir, "backlog", feature, "backlog.md"), "utf8");
  assert.match(plan, /Domain quality profile/);
  assert.match(plan, /Domain: Web\/SaaS \(web\)/);
  assert.match(plan, /Stack constraint:/);
  assert.match(plan, /Asset and placeholder strategy/);
  assert.match(backlog, /Quality profile: Web\/SaaS \(web\)/);
  assert.match(backlog, /Story contract:/);
});

test("plan generates real backlog/tests content from approved spec data", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-real-content-"));
  const feature = "real-content";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk([
    "draft",
    "--feature", feature,
    "--idea", "Python API for account alerts",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  fs.writeFileSync(
    draftFile,
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
Operations teams need deterministic account alert handling.

## 2. Actors
- Operations analyst
- Risk reviewer

## 3. Functional Rules (traceable)
- FR-1: The system must trigger an alert when account risk score exceeds threshold.
- FR-2: The system must reject duplicate alerts for the same account within five minutes.

## 4. Edge Cases
- Duplicate risk events arrive in the same second.

## 7. Security Considerations
- Enforce role-based access for alert review actions.

## 9. Acceptance Criteria
- AC-1: Given an account above risk threshold, when scoring completes, then an alert is created.
- AC-2: Given a duplicate risk event, when alert creation is attempted, then the duplicate is rejected.

## 10. Technical Preferences
- Python
- FastAPI
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  const plan = fs.readFileSync(path.join(tempDir, "docs", "plan", `${feature}.md`), "utf8");
  const backlog = fs.readFileSync(path.join(tempDir, "backlog", feature, "backlog.md"), "utf8");
  const tests = fs.readFileSync(path.join(tempDir, "tests", feature, "tests.md"), "utf8");

  assert.doesNotMatch(backlog, /FR-\?|AC-\?|<actor>/);
  assert.doesNotMatch(tests, /US-\?|FR-\?|AC-\?|<context>|<action>|<expected>/);
  assert.match(backlog, /As a (Operations analyst|Risk reviewer), I want/i);
  assert.match(backlog, /\bGiven\b[\s\S]{0,180}\bwhen\b[\s\S]{0,180}\bthen\b/i);
  assert.match(tests, /### TC-1/);
  assert.match(tests, /- Trace: US-\d+, FR-\d+(, AC-\d+)?/);
  assert.match(plan, /Use Python service aligned with detected stack \(Python\)/);
});

test("plan blocks when discovery confidence is low", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-low-confidence-"));
  const feature = "low-confidence";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Feature with uncertain discovery", "--non-interactive", "--yes"], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  fs.writeFileSync(
    draftFile,
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
Context.

## 2. Actors
- User

## 3. Functional Rules (traceable)
- FR-1: Rule one.

## 4. Edge Cases
- Feature with zero prior context.

## 7. Security Considerations
- Basic control.

## 9. Acceptance Criteria
- AC-1: Given ..., when ..., then ...
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  fs.mkdirSync(path.join(tempDir, "docs", "discovery"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "docs", "discovery", `${feature}.md`),
    `# Discovery: ${feature}

## 2. Discovery Interview Summary (Discovery Persona)
- Primary users:
- TBD

## 3. Scope
### In scope
- TBD

### Out of scope
- TBD

## 9. Discovery Confidence
- Confidence:
- Low

- Reason:
- Missing critical evidence

- Evidence gaps:
- TBD

- Handoff decision:
- Blocked for Clarification
`,
    "utf8"
  );

  const result = runNode(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /PLAN BLOCKED: Discovery confidence is Low/);
});

test("plan runs discovery interview inline when no discovery file exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-plan-inline-disc-"));
  const feature = "inline-discovery";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Plan without explicit discover step", "--non-interactive", "--yes"], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  fs.writeFileSync(
    draftFile,
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
A utility CLI for task management.

## 2. Actors
- Developer

## 3. Functional Rules (traceable)
- FR-1: The system must create tasks from command-line input.

## 4. Edge Cases
- Empty task description provided.

## 7. Security Considerations
- Sanitize task input to prevent injection.

## 9. Acceptance Criteria
- AC-1: Given valid input, when a task is created, then it appears in the task list.
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  // Run plan directly without discover — should auto-run discovery inline
  const planResult = runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  assert.match(planResult.stdout, /No discovery found\. Running discovery inline/);
  assert.match(planResult.stdout, /Discovery created:/);
  assert.match(planResult.stdout, /Plan created:/);

  // Verify discovery file was created
  const discoveryFile = path.join(tempDir, "docs", "discovery", `${feature}.md`);
  assert.ok(fs.existsSync(discoveryFile), "Discovery file should exist after inline creation");

  // Verify plan has Security section
  const planFile = path.join(tempDir, "docs", "plan", `${feature}.md`);
  const planContent = fs.readFileSync(planFile, "utf8");
  assert.match(planContent, /## 6\. Security \(Security Persona\)/);
  assert.match(planContent, /### Threats/);
  assert.match(planContent, /### Required controls/);
});
