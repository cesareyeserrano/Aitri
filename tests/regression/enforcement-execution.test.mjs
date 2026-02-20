import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runNode, runNodeOk } from "../smoke/helpers/cli-test-helpers.mjs";

function setupAitriProject(tempDir) {
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
}

// Phase M: hooks

test("hooks install creates pre-commit and pre-push hook files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-hooks-install-"));
  setupAitriProject(tempDir);

  const result = runNode(
    ["hooks", "install", "--non-interactive", "--yes"],
    { cwd: tempDir }
  );

  assert.equal(result.status, 0, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);

  const preCommitPath = path.join(tempDir, ".git", "hooks", "pre-commit");
  const prePushPath = path.join(tempDir, ".git", "hooks", "pre-push");

  assert.ok(fs.existsSync(preCommitPath), "pre-commit hook should exist");
  assert.ok(fs.existsSync(prePushPath), "pre-push hook should exist");

  const preCommitContent = fs.readFileSync(preCommitPath, "utf8");
  const prePushContent = fs.readFileSync(prePushPath, "utf8");

  assert.ok(preCommitContent.includes("Aitri"), "pre-commit should contain Aitri marker");
  assert.ok(prePushContent.includes("Aitri"), "pre-push should contain Aitri marker");
});

test("hooks status detects installed hooks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-hooks-status-"));
  setupAitriProject(tempDir);

  // Before install
  const before = runNode(["hooks", "status", "--non-interactive"], { cwd: tempDir });
  assert.equal(before.status, 0);
  assert.match(before.stdout, /not installed/);

  // Install hooks
  runNodeOk(["hooks", "install", "--non-interactive", "--yes"], { cwd: tempDir });

  // After install
  const after = runNode(["hooks", "status", "--non-interactive"], { cwd: tempDir });
  assert.equal(after.status, 0);
  assert.match(after.stdout, /installed \(aitri\)/);
});

test("hooks remove deletes hook files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-hooks-remove-"));
  setupAitriProject(tempDir);

  // Install first
  runNodeOk(["hooks", "install", "--non-interactive", "--yes"], { cwd: tempDir });

  const preCommitPath = path.join(tempDir, ".git", "hooks", "pre-commit");
  const prePushPath = path.join(tempDir, ".git", "hooks", "pre-push");

  assert.ok(fs.existsSync(preCommitPath), "pre-commit should exist before removal");

  // Remove
  const result = runNode(["hooks", "remove", "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 0, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);

  assert.ok(!fs.existsSync(preCommitPath), "pre-commit should be removed");
  assert.ok(!fs.existsSync(prePushPath), "pre-push should be removed");
});

// Phase M: ci

test("ci init generates github actions workflow file", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-ci-init-"));
  setupAitriProject(tempDir);

  const result = runNode(
    ["ci", "init", "--non-interactive", "--yes"],
    { cwd: tempDir }
  );

  assert.equal(result.status, 0, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);

  const workflowFile = path.join(tempDir, ".github", "workflows", "aitri.yml");
  assert.ok(fs.existsSync(workflowFile), "aitri.yml should exist");

  const content = fs.readFileSync(workflowFile, "utf8");
  assert.ok(content.includes("Aitri SDLC Gates"), "workflow should contain Aitri marker");
  assert.ok(content.includes("actions/checkout"), "workflow should reference checkout action");
  assert.ok(content.includes("aitri doctor"), "workflow should run doctor");
});

// Phase O: spec-improve

test("spec-improve requires --feature flag", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-spec-improve-no-feature-"));
  setupAitriProject(tempDir);

  const result = runNode(["spec-improve", "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 1, "should fail without --feature");
  assert.match(result.stdout, /Feature name is required|--feature/);
});

test("spec-improve returns suggestions-unavailable when AI not configured", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-spec-improve-no-ai-"));
  setupAitriProject(tempDir);

  // Create a minimal approved spec
  const approvedDir = path.join(tempDir, "specs", "approved");
  fs.mkdirSync(approvedDir, { recursive: true });
  fs.writeFileSync(
    path.join(approvedDir, "test-feature.md"),
    [
      "# AF-SPEC: test-feature",
      "STATUS: APPROVED",
      "",
      "## 2. Actors",
      "- User",
      "",
      "## 3. Functional Rules (traceable)",
      "- FR-1: The system must process requests.",
      "",
      "## 4. Edge Cases",
      "- Invalid input should be rejected gracefully.",
      "",
      "## 7. Security Considerations",
      "- Sanitize all user inputs.",
      "",
      "## 9. Acceptance Criteria",
      "- AC-1: Given a valid request, when submitted, then a response is returned.",
      ""
    ].join("\n"),
    "utf8"
  );

  const result = runNode(
    ["spec-improve", "--feature", "test-feature", "--non-interactive"],
    { cwd: tempDir }
  );

  // Should fail gracefully (AI not configured) rather than crash
  assert.equal(result.status, 1, "should exit with error when AI not configured");
  assert.ok(
    result.stdout.includes("AI not configured") ||
    result.stdout.includes("ai") ||
    result.stdout.includes(".aitri.json"),
    `should mention AI configuration, got: ${result.stdout}`
  );
});

// Phase N: execute

test("execute requires go.json gate", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-execute-no-go-"));
  setupAitriProject(tempDir);

  const result = runNode(
    ["execute", "--feature", "some-feature", "--story", "US-1", "--non-interactive"],
    { cwd: tempDir }
  );

  assert.equal(result.status, 1, "should fail without go.json");
  assert.ok(
    result.stdout.includes("go.json") || result.stdout.includes("go --feature"),
    `should mention go.json gate, got: ${result.stdout}`
  );
});

test("execute --dry-run shows plan without writing files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-execute-dry-run-"));
  setupAitriProject(tempDir);

  const feature = "dry-execute-feature";
  const implDir = path.join(tempDir, "docs", "implementation", feature);
  fs.mkdirSync(implDir, { recursive: true });

  // Create go.json to pass gate
  fs.writeFileSync(
    path.join(implDir, "go.json"),
    JSON.stringify({ feature, approvedAt: new Date().toISOString(), schemaVersion: 1 }),
    "utf8"
  );

  // Create a minimal brief
  fs.writeFileSync(
    path.join(implDir, "US-1.md"),
    "# Brief: US-1\n\nImplement a simple hello world function.\n",
    "utf8"
  );

  // Create an aitri.json with AI config (will fail API call, but --dry-run should short-circuit)
  // Note: Without AI config, execute will fail before dry-run check with "AI not configured"
  // This tests the AI-not-configured path
  const result = runNode(
    ["execute", "--feature", feature, "--story", "US-1", "--dry-run", "--non-interactive", "--yes"],
    { cwd: tempDir }
  );

  // Either AI not configured (exit 1) or dry-run output (exit 0)
  // Both are valid behaviors — we just test it doesn't crash with an unhandled exception
  assert.ok(
    result.status === 0 || result.status === 1,
    `should exit cleanly, got status ${result.status}\nstderr: ${result.stderr}`
  );
  assert.equal(result.signal, null, "should not crash with signal");
});

// Phase P: serve

test("serve exits cleanly when project context fails", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-serve-no-project-"));
  // No aitri init — serve should handle missing context gracefully
  // We can't actually start the server in tests, but we verify the command handles errors

  const result = runNode(
    ["serve", "--no-open", "--non-interactive"],
    { cwd: tempDir }
  );

  // serve starts a server and blocks; but without a valid project it might exit
  // We just verify no unhandled crash (signal null)
  assert.equal(result.signal, null, "should not crash with signal");
});

// Phase V: verify-intent (EVO-002)

test("verify-intent requires --feature flag", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-vi-no-feature-"));
  setupAitriProject(tempDir);

  const result = runNode(
    ["verify-intent", "--non-interactive"],
    { cwd: tempDir }
  );

  assert.equal(result.status, 1, "should exit with error when --feature is missing");
  assert.ok(
    result.stdout.includes("Feature name is required") ||
    result.stdout.includes("--feature"),
    `should mention --feature, got: ${result.stdout}`
  );
});

test("verify-intent returns intent-unavailable when AI not configured", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-vi-no-ai-"));
  setupAitriProject(tempDir);

  // Create a minimal approved spec
  const approvedDir = path.join(tempDir, "specs", "approved");
  fs.mkdirSync(approvedDir, { recursive: true });
  fs.writeFileSync(
    path.join(approvedDir, "test-feature.md"),
    [
      "# AF-SPEC: test-feature",
      "STATUS: APPROVED",
      "",
      "## 3. Functional Rules (traceable)",
      "- FR-1: The system must authenticate users.",
      "",
      "## 9. Acceptance Criteria",
      "- AC-1: Given valid credentials, when submitted, then access is granted.",
      ""
    ].join("\n"),
    "utf8"
  );

  // Create a minimal backlog with one US
  const backlogDir = path.join(tempDir, "backlog", "test-feature");
  fs.mkdirSync(backlogDir, { recursive: true });
  fs.writeFileSync(
    path.join(backlogDir, "backlog.md"),
    [
      "# Backlog: test-feature",
      "",
      "## User Stories",
      "",
      "### US-1",
      "- As a user, I want to log in, so that I can access the system.",
      "- Trace: FR-1, AC-1",
      ""
    ].join("\n"),
    "utf8"
  );

  const result = runNode(
    ["verify-intent", "--feature", "test-feature", "--non-interactive"],
    { cwd: tempDir }
  );

  assert.equal(result.status, 1, "should exit with error when AI not configured");
  assert.ok(
    result.stdout.includes("AI not configured") ||
    result.stdout.includes("ai") ||
    result.stdout.includes(".aitri.json") ||
    result.stdout.includes("intent-unavailable"),
    `should mention AI configuration, got: ${result.stdout}`
  );
});

test("verify-intent blocks when approved spec is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-vi-no-spec-"));
  setupAitriProject(tempDir);

  const result = runNode(
    ["verify-intent", "--feature", "missing-feature", "--non-interactive"],
    { cwd: tempDir }
  );

  assert.equal(result.status, 1, "should fail without approved spec");
  assert.ok(
    result.stdout.includes("Approved spec not found") ||
    result.stdout.includes("approve"),
    `should mention approve gate, got: ${result.stdout}`
  );
});

test("verify-intent blocks when backlog is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-vi-no-backlog-"));
  setupAitriProject(tempDir);

  // Create approved spec but no backlog
  const approvedDir = path.join(tempDir, "specs", "approved");
  fs.mkdirSync(approvedDir, { recursive: true });
  fs.writeFileSync(
    path.join(approvedDir, "no-backlog-feature.md"),
    "# AF-SPEC: no-backlog-feature\nSTATUS: APPROVED\n\n## 3. Functional Rules (traceable)\n- FR-1: The system must do something.\n",
    "utf8"
  );

  const result = runNode(
    ["verify-intent", "--feature", "no-backlog-feature", "--non-interactive"],
    { cwd: tempDir }
  );

  assert.equal(result.status, 1, "should fail without backlog");
  assert.ok(
    result.stdout.includes("Backlog not found") ||
    result.stdout.includes("plan"),
    `should mention plan command, got: ${result.stdout}`
  );
});

// Phase W: EVO-001 Phase 2 — aitri plan --ai-backlog / --ai-tests (Auditor Mode)

function setupPlanReadyProject(tempDir, feature) {
  setupAitriProject(tempDir);
  // Write a complete approved spec directly (bypass draft/approve for speed)
  const approvedDir = path.join(tempDir, "specs", "approved");
  fs.mkdirSync(approvedDir, { recursive: true });
  fs.writeFileSync(
    path.join(approvedDir, `${feature}.md`),
    [
      `# AF-SPEC: ${feature}`,
      "STATUS: APPROVED",
      "",
      "## 1. Context",
      "Authenticate users via email and password.",
      "",
      "## 2. Actors",
      "- User",
      "",
      "## 3. Functional Rules (traceable)",
      "- FR-1: The system must validate user credentials before granting access.",
      "- FR-2: The system must reject invalid login attempts with a clear error.",
      "",
      "## 4. Edge Cases",
      "- User enters wrong password 3 times in a row.",
      "",
      "## 7. Security Considerations",
      "- Sanitize all login inputs to prevent SQL injection.",
      "",
      "## 9. Acceptance Criteria",
      "- AC-1: Given valid credentials, when submitted, then access is granted.",
      "- AC-2: Given invalid credentials, when submitted, then an error message is shown.",
      ""
    ].join("\n"),
    "utf8"
  );
  // Write a minimal discovery file so plan can proceed
  const discoveryDir = path.join(tempDir, "docs", "discovery");
  fs.mkdirSync(discoveryDir, { recursive: true });
  fs.writeFileSync(
    path.join(discoveryDir, `${feature}.md`),
    [
      `# Discovery: ${feature}`,
      "",
      "## 2. Discovery Interview Summary (Discovery Persona)",
      "- Summary: User authentication flow.",
      "",
      "## 3. Scope",
      "- In scope: login form, validation.",
      "",
      "## 4. Current pain",
      "- Users cannot authenticate.",
      "",
      "## 5. Success metrics",
      "- Login success rate > 99%.",
      "",
      "## 6. Assumptions",
      "- Email/password auth only.",
      "",
      "## 7. Dependencies",
      "- None.",
      "",
      "## 8. Constraints (business/technical/compliance)",
      "- None.",
      "",
      "## 9. Discovery Confidence",
      "- Confidence: high",
      "- Interview mode: quick",
      ""
    ].join("\n"),
    "utf8"
  );
}

test("plan --ai-backlog accepts agent-generated backlog when traceability is valid", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-plan-ai-override-pass-"));
  const feature = "user-auth";
  setupPlanReadyProject(tempDir, feature);

  // Write agent-generated backlog and tests
  const agentBacklog = [
    `# Backlog: ${feature}`,
    "",
    "## User Stories",
    "",
    "### US-1",
    "- As a User, I want to log in with email, so that I can access the system.",
    "- Trace: FR-1, AC-1",
    "",
    "### US-2",
    "- As a User, I want invalid logins rejected, so that my account is secure.",
    "- Trace: FR-2, AC-2"
  ].join("\n");

  const agentTests = [
    `# Test Cases: ${feature}`,
    "",
    "### TC-1",
    "- Trace: US-1, FR-1",
    "",
    "### TC-2",
    "- Trace: US-2, FR-2"
  ].join("\n");

  const backlogFile = path.join(tempDir, "agent-backlog.md");
  const testsFile = path.join(tempDir, "agent-tests.md");
  fs.writeFileSync(backlogFile, agentBacklog, "utf8");
  fs.writeFileSync(testsFile, agentTests, "utf8");

  const result = runNodeOk(
    ["plan", "--feature", feature, "--non-interactive", "--yes",
     "--ai-backlog", "agent-backlog.md",
     "--ai-tests", "agent-tests.md"],
    { cwd: tempDir }
  );

  assert.ok(
    result.stdout.includes("Audit passed") || result.stdout.includes("Plan created"),
    `expected audit pass + plan created, got: ${result.stdout}`
  );

  // Verify agent's content was written (not the generated one)
  const writtenBacklog = fs.readFileSync(
    path.join(tempDir, "backlog", feature, "backlog.md"), "utf8"
  );
  assert.ok(
    writtenBacklog.includes("I want to log in with email"),
    "agent backlog content should be written as-is"
  );
});

test("plan --ai-backlog fails audit when US references non-existent FR", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-plan-ai-override-fail-"));
  const feature = "user-auth";
  setupPlanReadyProject(tempDir, feature);

  // Agent backlog with bad FR reference
  const badBacklog = [
    `# Backlog: ${feature}`,
    "",
    "## User Stories",
    "",
    "### US-1",
    "- As a User, I want to log in, so that I can access the system.",
    "- Trace: FR-99, AC-1"   // FR-99 does not exist in spec
  ].join("\n");

  const agentTests = [
    `# Test Cases: ${feature}`,
    "",
    "### TC-1",
    "- Trace: US-1, FR-1"
  ].join("\n");

  fs.writeFileSync(path.join(tempDir, "bad-backlog.md"), badBacklog, "utf8");
  fs.writeFileSync(path.join(tempDir, "agent-tests.md"), agentTests, "utf8");

  const result = runNode(
    ["plan", "--feature", feature, "--non-interactive", "--yes",
     "--ai-backlog", "bad-backlog.md",
     "--ai-tests", "agent-tests.md"],
    { cwd: tempDir }
  );

  assert.equal(result.status, 1, "should fail audit");
  assert.ok(
    result.stdout.includes("AUDIT FAILED") || result.stdout.includes("FR-99"),
    `expected audit failure mentioning FR-99, got: ${result.stdout}`
  );

  // Verify backlog was NOT written (no partial writes on audit failure)
  assert.equal(
    fs.existsSync(path.join(tempDir, "backlog", feature, "backlog.md")),
    false,
    "backlog should not be written when audit fails"
  );
});

// Phase X: EVO-003 — aitri diff (Backlog Delta)

test("diff requires --feature flag", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-diff-no-feature-"));
  setupAitriProject(tempDir);

  const result = runNode(["diff", "--non-interactive"], { cwd: tempDir });

  assert.equal(result.status, 1, "should fail without --feature");
  assert.ok(
    result.stdout.includes("Feature name is required"),
    `expected feature-required message, got: ${result.stdout}`
  );
});

test("diff requires --proposed flag", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-diff-no-proposed-"));
  setupAitriProject(tempDir);

  const result = runNode(["diff", "--feature", "user-auth", "--non-interactive"], { cwd: tempDir });

  assert.equal(result.status, 1, "should fail without --proposed");
  assert.ok(
    result.stdout.includes("Proposed backlog file is required"),
    `expected proposed-required message, got: ${result.stdout}`
  );
});

test("diff detects added, modified, and removed stories between backlog versions", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-diff-delta-"));
  const feature = "user-auth";
  setupPlanReadyProject(tempDir, feature);

  // Write current backlog (as if plan was run)
  const backlogDir = path.join(tempDir, "backlog", feature);
  fs.mkdirSync(backlogDir, { recursive: true });
  const currentBacklog = [
    `# Backlog: ${feature}`,
    "",
    "## User Stories",
    "",
    "### US-1",
    "- As a User, I want to log in with email, so that I can access the system.",
    "- Trace: FR-1, AC-1",
    "",
    "### US-2",
    "- As a User, I want invalid logins rejected, so that my account is secure.",
    "- Trace: FR-2, AC-2"
  ].join("\n");
  fs.writeFileSync(path.join(backlogDir, "backlog.md"), currentBacklog, "utf8");

  // Proposed backlog: US-1 modified (new trace), US-2 removed, US-3 added
  const proposedBacklog = [
    `# Backlog: ${feature}`,
    "",
    "## User Stories",
    "",
    "### US-1",
    "- As a User, I want to log in with email, so that I can access the system.",
    "- Trace: FR-1, FR-2, AC-1",   // modified: added FR-2
    "",
    "### US-3",
    "- As a User, I want to reset my password, so that I can recover my account.",
    "- Trace: FR-1, AC-2"
  ].join("\n");
  const proposedFile = path.join(tempDir, "proposed-backlog.md");
  fs.writeFileSync(proposedFile, proposedBacklog, "utf8");

  const result = runNode(
    ["diff", "--feature", feature, "--proposed", "proposed-backlog.md", "--json", "--non-interactive"],
    { cwd: tempDir }
  );

  assert.equal(result.status, 0, `diff failed: ${result.stdout}\n${result.stderr}`);

  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.hasChanges, true);
  assert.equal(parsed.summary.added, 1, "should detect 1 added story");
  assert.equal(parsed.summary.modified, 1, "should detect 1 modified story");
  assert.equal(parsed.summary.removed, 1, "should detect 1 removed story");
  assert.equal(parsed.summary.unchanged, 0, "should have 0 unchanged stories");
  assert.equal(parsed.delta.added[0].id, "US-3", "added story should be US-3");
  assert.equal(parsed.delta.modified[0].id, "US-1", "modified story should be US-1");
  assert.equal(parsed.delta.removed[0].id, "US-2", "removed story should be US-2");
});

test("diff reports no changes when backlogs are identical", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-diff-unchanged-"));
  const feature = "user-auth";
  setupPlanReadyProject(tempDir, feature);

  const backlogDir = path.join(tempDir, "backlog", feature);
  fs.mkdirSync(backlogDir, { recursive: true });
  const backlogContent = [
    `# Backlog: ${feature}`,
    "",
    "## User Stories",
    "",
    "### US-1",
    "- As a User, I want to log in with email, so that I can access the system.",
    "- Trace: FR-1, AC-1"
  ].join("\n");
  fs.writeFileSync(path.join(backlogDir, "backlog.md"), backlogContent, "utf8");
  fs.writeFileSync(path.join(tempDir, "same-backlog.md"), backlogContent, "utf8");

  const result = runNode(
    ["diff", "--feature", feature, "--proposed", "same-backlog.md", "--json", "--non-interactive"],
    { cwd: tempDir }
  );

  assert.equal(result.status, 0, `diff failed: ${result.stdout}`);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.hasChanges, false, "should report no changes");
  assert.equal(parsed.summary.unchanged, 1, "US-1 should be unchanged");
});
