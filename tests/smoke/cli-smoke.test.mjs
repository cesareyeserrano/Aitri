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
  assert.match(help.stdout, /--json, -j/);
  assert.match(help.stdout, /--format <type>/);
  assert.match(help.stdout, /--no-checkpoint/);
});

test("status json works in empty project", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-empty-"));
  const result = runNodeOk(["status", "--json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.structure.ok, false);
  assert.equal(payload.nextStep, "aitri init");
  assert.equal(payload.checkpoint.state.git, false);
  assert.equal(payload.checkpoint.state.detected, false);
});

test("status accepts json shorthand without --json", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-status-shorthand-"));
  const result = runNodeOk(["status", "json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.structure.ok, false);
  assert.equal(payload.nextStep, "aitri init");
});

test("status detects git checkpoint commit", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-checkpoint-"));
  spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Aitri Test"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "aitri@example.com"], { cwd: tempDir, encoding: "utf8" });
  fs.writeFileSync(path.join(tempDir, "README.md"), "checkpoint seed\n", "utf8");
  spawnSync("git", ["add", "README.md"], { cwd: tempDir, encoding: "utf8" });
  const commit = spawnSync("git", ["commit", "-m", "checkpoint: seed phase"], { cwd: tempDir, encoding: "utf8" });
  assert.equal(commit.status, 0, `git commit failed: ${commit.stderr}`);

  const result = runNodeOk(["status", "json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.checkpoint.state.git, true);
  assert.equal(payload.checkpoint.state.detected, true);
  assert.equal(payload.checkpoint.state.resumeDecision, "ask_user_resume_from_checkpoint");
  assert.match(payload.checkpoint.state.latestCommit.message, /^checkpoint:/);
  assert.equal(payload.checkpoint.state.mode, "git_commit+tag");
  assert.equal(payload.checkpoint.state.maxRetained, 10);
});

test("write command creates auto-checkpoint in git repo", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-auto-checkpoint-"));
  spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Aitri Test"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "aitri@example.com"], { cwd: tempDir, encoding: "utf8" });
  fs.writeFileSync(path.join(tempDir, ".gitkeep"), "seed\n", "utf8");
  spawnSync("git", ["add", ".gitkeep"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "seed"], { cwd: tempDir, encoding: "utf8" });

  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const draftRun = runNodeOk([
    "draft",
    "--feature", "auto-checkpoint",
    "--idea", "Draft for checkpoint test",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });
  assert.match(draftRun.stdout, /Auto-checkpoint saved:/);

  const log = spawnSync("git", ["log", "--grep=^checkpoint:", "--oneline", "-n", "1"], {
    cwd: tempDir,
    encoding: "utf8"
  });
  assert.equal(log.status, 0);
  assert.match(log.stdout, /checkpoint:/);

  const tags = spawnSync("git", ["tag", "--list", "aitri-checkpoint/*"], {
    cwd: tempDir,
    encoding: "utf8"
  });
  assert.equal(tags.status, 0);
  assert.match(tags.stdout, /aitri-checkpoint\//);
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

test("validate supports --format json", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-validate-format-"));
  const result = runNode(["validate", "--non-interactive", "--format", "json"], { cwd: tempDir });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.issues[0], /Feature name is required/);
});

test("guided draft non-interactive includes technology preference", () => {
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
  assert.match(content, /Technology preference:/);
  assert.match(content, /Technology source:/);
});
