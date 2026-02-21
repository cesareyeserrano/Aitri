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
