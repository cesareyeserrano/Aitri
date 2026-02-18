import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";

test("end-to-end core workflow passes validate in non-interactive mode", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-flow-"));
  const feature = "user-login";
  spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Aitri Test"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "aitri@example.com"], { cwd: tempDir, encoding: "utf8" });
  fs.writeFileSync(path.join(tempDir, ".gitkeep"), "seed\n", "utf8");
  spawnSync("git", ["add", ".gitkeep"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "baseline"], { cwd: tempDir, encoding: "utf8" });

  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Login with email and password", "--non-interactive", "--yes"], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  fs.writeFileSync(
    draftFile,
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
Users need to authenticate securely with email and password.

## 2. Actors
- End user

## 3. Functional Rules (traceable)
- FR-1: The system must authenticate valid credentials and create a user session.
- FR-2: The system must reject invalid credentials with a clear error message.

## 4. Edge Cases
- Repeated failed login attempts.

## 5. Failure Conditions
- Authentication provider is unavailable.

## 6. Non-Functional Requirements
- Authentication response under 500ms for normal load.

## 7. Security Considerations
- Enforce rate limiting for repeated failed attempts.

## 8. Out of Scope
- Social login providers.

## 9. Acceptance Criteria
- AC-1: Given valid credentials, when the user signs in, then access is granted.
- AC-2: Given invalid credentials, when the user signs in, then access is denied with a clear error.
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  const discoveryFile = path.join(tempDir, "docs", "discovery", `${feature}.md`);
  const discoveryContent = fs.readFileSync(discoveryFile, "utf8");
  assert.match(discoveryContent, /## 2\. Discovery Interview Summary \(Discovery Persona\)/);
  assert.match(discoveryContent, /## 3\. Scope/);
  assert.match(discoveryContent, /## 9\. Discovery Confidence/);

  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  const backlogFile = path.join(tempDir, "backlog", feature, "backlog.md");
  const testsFile = path.join(tempDir, "tests", feature, "tests.md");

  fs.writeFileSync(
    backlogFile,
    `# Backlog: ${feature}\n\n## User Stories\n\n### US-1\n- As a user, I want to sign in, so that I can access my account.\n- Trace: FR-1, AC-1\n\n### US-2\n- As a user, I want failed logins to be rejected, so that access is protected.\n- Trace: FR-2, AC-2\n`,
    "utf8"
  );

  fs.writeFileSync(
    testsFile,
    `# Test Cases: ${feature}\n\n## Functional\n\n### TC-1\n- Trace: US-1, FR-1, AC-1\n\n### TC-2\n- Trace: US-2, FR-2, AC-2\n`,
    "utf8"
  );

  const validate = runNodeOk([
    "validate",
    "--feature",
    feature,
    "--non-interactive",
    "--json"
  ], { cwd: tempDir });

  const payload = JSON.parse(validate.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.feature, feature);
  assert.deepEqual(payload.issues, []);

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    `{
  "name": "aitri-smoke",
  "private": true,
  "scripts": {
    "test:aitri": "node -e \\"process.exit(0)\\""
  }
}
`,
    "utf8"
  );

  const verify = runNodeOk([
    "verify",
    "--feature",
    feature,
    "--non-interactive",
    "--json"
  ], { cwd: tempDir });
  const verifyPayload = JSON.parse(verify.stdout);
  assert.equal(verifyPayload.ok, true);
  assert.equal(verifyPayload.feature, feature);
  assert.match(verifyPayload.command, /npm run test:aitri/);

  spawnSync("git", ["add", "-A"], { cwd: tempDir, encoding: "utf8" });
  const syncCommit = spawnSync("git", ["commit", "-m", "sync smoke artifacts"], {
    cwd: tempDir,
    encoding: "utf8"
  });
  assert.equal(syncCommit.status, 0, `git commit failed: ${syncCommit.stderr}`);

  const status = runNodeOk(["status", "--json"], { cwd: tempDir });
  const statusPayload = JSON.parse(status.stdout);
  assert.equal(statusPayload.confidence.level, "high");
  assert.ok(statusPayload.confidence.score >= 95);
  assert.equal(statusPayload.confidence.components.runtimeVerification, 100);
  assert.equal(statusPayload.confidence.releaseReady, true);

  const handoff = runNodeOk(["handoff", "json"], { cwd: tempDir });
  const handoffPayload = JSON.parse(handoff.stdout);
  assert.equal(handoffPayload.ok, true);
  assert.equal(handoffPayload.nextStep, "ready_for_human_approval");
  assert.equal(handoffPayload.recommendedCommand, "aitri go");

  const go = runNodeOk(["go", "--non-interactive", "--yes"], { cwd: tempDir });
  assert.match(go.stdout, /Implementation go\/no-go decision: GO/);
});

test("discover non-interactive guided defaults to quick interview mode", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-discovery-quick-"));
  const feature = "discovery-quick";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Discovery quick mode", "--non-interactive", "--yes"], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  fs.writeFileSync(
    draftFile,
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
Users need workflow automation.

## 2. Actors
- Product owner

## 3. Functional Rules (traceable)
- FR-1: Capture a valid discovery baseline.

## 4. Edge Cases
- Discovery run with incomplete prior context.

## 7. Security Considerations
- Basic access control.

## 9. Acceptance Criteria
- AC-1: Given valid input, when discovery runs, then artifacts are generated.
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--guided", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  const discovery = fs.readFileSync(path.join(tempDir, "docs", "discovery", `${feature}.md`), "utf8");
  const plan = fs.readFileSync(path.join(tempDir, "docs", "plan", `${feature}.md`), "utf8");
  assert.match(discovery, /- Interview mode:\n- quick/);
  assert.match(discovery, /Retrieval mode: section-level/);
  assert.match(plan, /Retrieval mode: section-level/);
  assert.match(plan, /Discovery interview mode: quick/);
  assert.match(plan, /Follow-up gate:/);
  assert.doesNotMatch(plan, /# AF-SPEC:/);
});

test("end-to-end workflow supports custom mapped paths", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-config-flow-"));
  const feature = "mapped-flow";
  fs.writeFileSync(
    path.join(tempDir, "aitri.config.json"),
    JSON.stringify({
      paths: {
        specs: "workspace/specs",
        backlog: "workspace/backlog",
        tests: "quality/tests",
        docs: "knowledge/docs"
      }
    }, null, 2),
    "utf8"
  );

  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Mapped path login flow", "--non-interactive", "--yes"], { cwd: tempDir });

  const draftFile = path.join(tempDir, "workspace", "specs", "drafts", `${feature}.md`);
  fs.writeFileSync(
    draftFile,
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
Users need secure login.

## 2. Actors
- End user

## 3. Functional Rules (traceable)
- FR-1: Authenticate valid credentials.
- FR-2: Reject invalid credentials.

## 4. Edge Cases
- Concurrent login attempts from the same user.

## 7. Security Considerations
- Apply login rate limiting.

## 9. Acceptance Criteria
- AC-1: Given valid credentials, when login occurs, then access is granted.
- AC-2: Given invalid credentials, when login occurs, then access is denied.
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  fs.writeFileSync(
    path.join(tempDir, "workspace", "backlog", feature, "backlog.md"),
    `# Backlog: ${feature}
### US-1
- Trace: FR-1, AC-1

### US-2
- Trace: FR-2, AC-2
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "quality", "tests", feature, "tests.md"),
    `# Test Cases: ${feature}
### TC-1
- Trace: US-1, FR-1, AC-1

### TC-2
- Trace: US-2, FR-2, AC-2
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    `{
  "name": "aitri-smoke-mapped",
  "private": true,
  "scripts": {
    "test:aitri": "node -e \\"process.exit(0)\\""
  }
}
`,
    "utf8"
  );

  const validate = runNodeOk(["validate", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  assert.equal(JSON.parse(validate.stdout).ok, true);

  const verify = runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  const verifyPayload = JSON.parse(verify.stdout);
  assert.equal(verifyPayload.ok, true);
  assert.match(verifyPayload.evidenceFile, /knowledge\/docs\/verification/);

  const handoff = runNodeOk(["handoff", "json"], { cwd: tempDir });
  assert.equal(JSON.parse(handoff.stdout).ok, true);
});


test("discover fails fast on invalid discovery depth", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-discovery-depth-invalid-"));
  const feature = "invalid-depth";
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n- FR-1: Rule.\n`,
    "utf8"
  );

  const result = runNode([
    "discover",
    "--feature", feature,
    "--guided",
    "--discovery-depth", "invalid",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Invalid --discovery-depth value/);
});

test("discover fails fast on invalid retrieval mode", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-retrieval-mode-invalid-"));
  const feature = "invalid-retrieval";
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n- FR-1: Rule.\n`,
    "utf8"
  );

  const result = runNode([
    "discover",
    "--feature", feature,
    "--retrieval-mode", "invalid",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Invalid --retrieval-mode value/);
});

test("plan reflects deep discovery rigor profile when deep mode is selected", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-plan-deep-rigor-"));
  const feature = "plan-deep-rigor";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Deep rigor planning", "--non-interactive", "--yes"], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  fs.writeFileSync(
    draftFile,
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
Teams need strict execution planning.

## 2. Actors
- Delivery lead

## 3. Functional Rules (traceable)
- FR-1: Generate a plan with explicit rigor policy.

## 4. Edge Cases
- Planning with missing upstream discovery artifacts.

## 7. Security Considerations
- Protect planning artifacts from unauthorized edits.

## 9. Acceptance Criteria
- AC-1: Given approved input, when planning runs, then rigor policy is explicit.
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk([
    "discover",
    "--feature", feature,
    "--guided",
    "--discovery-depth", "deep",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  const plan = fs.readFileSync(path.join(tempDir, "docs", "plan", `${feature}.md`), "utf8");
  const backlog = fs.readFileSync(path.join(tempDir, "backlog", feature, "backlog.md"), "utf8");
  const tests = fs.readFileSync(path.join(tempDir, "tests", feature, "tests.md"), "utf8");
  assert.match(plan, /Discovery interview mode: deep/);
  assert.match(backlog, /Discovery rigor profile: deep/);
  assert.match(tests, /Discovery rigor profile: deep/);
});

test("discover and plan support semantic retrieval mode", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-retrieval-semantic-"));
  const feature = "semantic-retrieval";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Semantic retrieval smoke", "--non-interactive", "--yes"], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  fs.writeFileSync(
    draftFile,
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
A searchable context should prioritize relevant chunks.

## 2. Actors
- Product manager
- Developer

## 3. Functional Rules (traceable)
- FR-1: Select relevant requirement sections for planning.
- FR-2: Keep retrieval deterministic for repeatability.

## 4. Edge Cases
- Empty requirement sections with no indexable content.

## 7. Security Considerations
- Avoid leaking restricted requirements in unrelated outputs.

## 8. Out of Scope
- Cloud vector databases.

## 9. Acceptance Criteria
- AC-1: Given approved spec, when retrieval runs, then relevant sections are selected.
- AC-2: Given same input, when retrieval reruns, then output remains deterministic.
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk([
    "discover",
    "--feature", feature,
    "--retrieval-mode", "semantic",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  const discovery = fs.readFileSync(path.join(tempDir, "docs", "discovery", `${feature}.md`), "utf8");
  const plan = fs.readFileSync(path.join(tempDir, "docs", "plan", `${feature}.md`), "utf8");
  assert.match(discovery, /Retrieval mode: semantic-lite/);
  assert.match(plan, /Retrieval mode: semantic-lite/);
  assert.doesNotMatch(plan, /Retrieval mode: section-level/);
});

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
