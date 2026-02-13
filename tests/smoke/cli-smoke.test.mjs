import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, "cli", "index.js");

function runNode(args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    input: options.input,
    encoding: "utf8"
  });
}

function runNodeOk(args, options = {}) {
  const result = runNode(args, options);
  assert.equal(
    result.status,
    0,
    `Expected success for args ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  return result;
}

test("help and version are available", () => {
  const version = runNodeOk(["--version"]);
  assert.match(version.stdout, /aitri v\d+\.\d+\.\d+/);

  const help = runNodeOk(["help"]);
  assert.match(help.stdout, /Commands:/);
  assert.match(help.stdout, /status/);
  assert.match(help.stdout, /--non-interactive/);
});

test("status json works in empty project", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-empty-"));
  const result = runNodeOk(["status", "--json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.structure.ok, false);
  assert.equal(payload.nextStep, "aitri init");
});

test("end-to-end core workflow passes validate in non-interactive mode", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-flow-"));
  const feature = "user-login";

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
});

test("validate fails in non-interactive mode without --feature", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-missing-feature-"));
  const result = runNode(["validate", "--non-interactive", "--json"], { cwd: tempDir });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.issues[0], /Feature name is required/);
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
