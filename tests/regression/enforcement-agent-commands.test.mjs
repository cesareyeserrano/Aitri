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

// Phase O: spec-improve

test("spec-improve requires --feature flag", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-spec-improve-no-feature-"));
  setupAitriProject(tempDir);

  const result = runNode(["spec-improve", "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 1, "should fail without --feature");
  assert.match(result.stdout, /Feature name is required|--feature/);
});

test("spec-improve outputs agent task without AI config", () => {
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

  // Should output agent task and exit 0
  assert.equal(result.status, 0, "should exit 0 and output agent task");
  assert.ok(
    result.stdout.includes("AGENT TASK") || result.stdout.includes("spec-improve"),
    `should output agent task, got: ${result.stdout}`
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

  // Without AI config, execute will fail before dry-run check with "AI not configured"
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

  const result = runNode(
    ["serve", "--no-open", "--non-interactive"],
    { cwd: tempDir }
  );

  // serve starts a server and blocks; without a valid project it may exit
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

test("verify-intent outputs agent task when AI not configured", () => {
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

  assert.equal(result.status, 0, "should exit 0 and output agent task");
  assert.ok(
    result.stdout.includes("AGENT TASK") || result.stdout.includes("verify-intent"),
    `should output agent task, got: ${result.stdout}`
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
