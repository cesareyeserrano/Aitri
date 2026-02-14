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
  assert.match(help.stdout, /resume/);
  assert.match(help.stdout, /verify/);
  assert.match(help.stdout, /policy/);
  assert.match(help.stdout, /--non-interactive/);
  assert.match(help.stdout, /--json, -j/);
  assert.match(help.stdout, /--format <type>/);
  assert.match(help.stdout, /--discovery-depth <d>/);
  assert.match(help.stdout, /--no-checkpoint/);
});

test("status json works in empty project", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-empty-"));
  const result = runNodeOk(["status", "--json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.structure.ok, false);
  assert.equal(payload.nextStep, "aitri init");
  assert.equal(payload.recommendedCommand, "aitri init");
  assert.match(payload.nextStepMessage, /Continue SDLC flow/i);
  assert.equal(payload.checkpoint.state.git, false);
  assert.equal(payload.checkpoint.state.detected, false);
});

test("init respects aitri.config.json custom path mapping", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-config-init-"));
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

  assert.equal(fs.existsSync(path.join(tempDir, "workspace", "specs", "drafts")), true);
  assert.equal(fs.existsSync(path.join(tempDir, "workspace", "specs", "approved")), true);
  assert.equal(fs.existsSync(path.join(tempDir, "workspace", "backlog")), true);
  assert.equal(fs.existsSync(path.join(tempDir, "quality", "tests")), true);
  assert.equal(fs.existsSync(path.join(tempDir, "knowledge", "docs")), true);
  assert.equal(fs.existsSync(path.join(tempDir, "specs")), false);
});

test("status fails fast on invalid aitri.config.json", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-config-invalid-"));
  fs.writeFileSync(
    path.join(tempDir, "aitri.config.json"),
    JSON.stringify({
      paths: {
        specs: "/abs/not-allowed"
      }
    }, null, 2),
    "utf8"
  );

  const result = runNode(["status", "--json"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Invalid aitri\.config\.json/);
});

test("status accepts json shorthand without --json", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-status-shorthand-"));
  const result = runNodeOk(["status", "json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.structure.ok, false);
  assert.equal(payload.nextStep, "aitri init");
});

test("resume json works and returns deterministic next command", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-resume-json-"));
  const result = runNodeOk(["resume", "json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.checkpointDetected, false);
  assert.equal(payload.nextStep, "aitri init");
  assert.equal(payload.recommendedCommand, "aitri init");
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

test("policy detects dependency drift in git workspace", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-policy-deps-"));
  const feature = "policy-deps";
  spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Aitri Test"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "aitri@example.com"], { cwd: tempDir, encoding: "utf8" });

  fs.writeFileSync(path.join(tempDir, "package.json"), `{"name":"policy-deps","private":true}\n`, "utf8");
  spawnSync("git", ["add", "package.json"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "baseline"], { cwd: tempDir, encoding: "utf8" });

  fs.writeFileSync(path.join(tempDir, "package.json"), `{"name":"policy-deps","private":true,"dependencies":{"left-pad":"1.3.0"}}\n`, "utf8");

  const result = runNode(["policy", "--feature", feature, "--json"], { cwd: tempDir });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.gapSummary.dependency_drift, 1);
});

test("policy detects forbidden imports and paths", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-policy-rules-"));
  const feature = "policy-rules";
  spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Aitri Test"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "aitri@example.com"], { cwd: tempDir, encoding: "utf8" });

  fs.writeFileSync(
    path.join(tempDir, "aitri.config.json"),
    JSON.stringify({
      policy: {
        blockedImports: ["left-pad"],
        blockedPaths: ["infra/**"]
      }
    }, null, 2),
    "utf8"
  );

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "infra"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "app.js"), "export const x = 1;\n", "utf8");
  spawnSync("git", ["add", "aitri.config.json", "src/app.js"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "baseline"], { cwd: tempDir, encoding: "utf8" });

  fs.writeFileSync(path.join(tempDir, "src", "app.js"), "import lp from 'left-pad';\nexport const x = lp('1', 2, '0');\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "infra", "deploy.sh"), "#!/usr/bin/env bash\necho deploy\n", "utf8");

  const result = runNode(["policy", "--feature", feature, "--json"], { cwd: tempDir });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.gapSummary.forbidden_import, 1);
  assert.equal(payload.gapSummary.forbidden_path, 1);
});

test("resume requires explicit confirmation in non-interactive mode when checkpoint is detected", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-resume-checkpoint-"));
  spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Aitri Test"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "aitri@example.com"], { cwd: tempDir, encoding: "utf8" });
  fs.writeFileSync(path.join(tempDir, "README.md"), "checkpoint seed\n", "utf8");
  spawnSync("git", ["add", "README.md"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "checkpoint: seed phase"], { cwd: tempDir, encoding: "utf8" });

  const blocked = runNode(["resume", "--non-interactive"], { cwd: tempDir });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stdout, /requires --yes/);

  const allowed = runNodeOk(["resume", "--non-interactive", "--yes"], { cwd: tempDir });
  assert.match(allowed.stdout, /Resume decision: CONTINUE/);
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

  const handoff = runNodeOk(["handoff", "json"], { cwd: tempDir });
  const handoffPayload = JSON.parse(handoff.stdout);
  assert.equal(handoffPayload.ok, true);
  assert.equal(handoffPayload.nextStep, "ready_for_human_approval");
  assert.equal(handoffPayload.recommendedCommand, "aitri handoff");

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

## 7. Security Considerations
- Basic access control.

## 9. Acceptance Criteria
- AC-1: Given valid input, when discovery runs, then artifacts are generated.
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--guided", "--non-interactive", "--yes"], { cwd: tempDir });

  const discovery = fs.readFileSync(path.join(tempDir, "docs", "discovery", `${feature}.md`), "utf8");
  assert.match(discovery, /- Interview mode:\n- quick/);
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

test("handoff is blocked when verification evidence is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-missing-verify-"));
  const feature = "missing-verify";

  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Simple auth flow", "--non-interactive", "--yes"], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  fs.writeFileSync(
    draftFile,
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
Users need sign in.

## 2. Actors
- End user

## 3. Functional Rules (traceable)
- FR-1: User signs in with valid credentials.

## 7. Security Considerations
- Rate limit repeated failures.

## 9. Acceptance Criteria
- AC-1: Given valid credentials, when login is attempted, then access is granted.
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

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

  runNodeOk(["validate", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });

  const handoff = runNode(["handoff", "json"], { cwd: tempDir });
  assert.equal(handoff.status, 1);
  const payload = JSON.parse(handoff.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.nextStep, "aitri verify");
  assert.equal(payload.recommendedCommand, "aitri verify");

  const handoffHuman = runNode(["handoff"], { cwd: tempDir });
  assert.equal(handoffHuman.status, 1);
  assert.match(handoffHuman.stdout, /HANDOFF NOT READY/);
  assert.match(handoffHuman.stdout, /Run next command: aitri verify/);
});

test("go is blocked when managed-go policy detects dependency drift", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-go-policy-block-"));
  const feature = "go-policy-block";
  spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Aitri Test"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "aitri@example.com"], { cwd: tempDir, encoding: "utf8" });

  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "backlog", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "discovery"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "plan"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "verification"), { recursive: true });

  fs.writeFileSync(path.join(tempDir, "specs", "approved", `${feature}.md`), `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n- FR-1: Rule one.\n`, "utf8");
  fs.writeFileSync(path.join(tempDir, "backlog", feature, "backlog.md"), `# Backlog: ${feature}\n### US-1\n- Trace: FR-1, AC-1\n`, "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", feature, "tests.md"), `# Test Cases: ${feature}\n### TC-1\n- Trace: US-1, FR-1, AC-1\n`, "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "discovery", `${feature}.md`), `# Discovery: ${feature}\n\n## 2. Discovery Interview Summary (Discovery Persona)\n- Primary users:\n- Users\n- Jobs to be done:\n- Complete flow\n- Current pain:\n- Inconsistent outcomes\n- Constraints (business/technical/compliance):\n- Constraints valid\n- Dependencies:\n- Internal dependency\n- Success metrics:\n- Success rate > 95%\n- Assumptions:\n- Stable inputs\n\n## 3. Scope\n### In scope\n- Core flow\n\n### Out of scope\n- Extras\n\n## 9. Discovery Confidence\n- Confidence:\n- Medium\n\n- Reason:\n- Sufficient baseline\n\n- Evidence gaps:\n- Latency target refinement\n\n- Handoff decision:\n- Ready for Product/Architecture\n`, "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "plan", `${feature}.md`), `# Plan: ${feature}\n\n## 4. Product Review (Product Persona)\n### Business value\n- Reduce failure and increase reliability.\n\n### Success metric\n- Success rate above 95%.\n\n### Assumptions to validate\n- Input patterns remain stable.\n\n## 5. Architecture (Architect Persona)\n### Components\n- API gateway\n- Service layer\n\n### Data flow\n- Request to service and response.\n\n### Key decisions\n- Explicit service contracts.\n\n### Risks & mitigations\n- Retry with backoff for dependency errors.\n\n### Observability (logs/metrics/tracing)\n- Logs, metrics, traces.\n`, "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "verification", `${feature}.json`), JSON.stringify({
    ok: true,
    feature,
    command: "npm run test:aitri",
    exitCode: 0,
    startedAt: "2099-01-01T00:00:00.000Z",
    finishedAt: "2099-01-01T00:00:01.000Z",
    reason: "passed"
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(tempDir, "package.json"), `{"name":"go-policy","private":true}\n`, "utf8");
  spawnSync("git", ["add", "."], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "baseline"], { cwd: tempDir, encoding: "utf8" });

  fs.writeFileSync(path.join(tempDir, "package.json"), `{"name":"go-policy","private":true,"dependencies":{"left-pad":"1.3.0"}}\n`, "utf8");

  const result = runNode(["go", "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /GO BLOCKED: managed-go policy checks failed/);
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

test("verify fails with explicit reason when runtime command cannot be detected", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-verify-missing-cmd-"));
  const feature = "verify-missing-cmd";
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n- FR-1: Rule.\n`,
    "utf8"
  );

  const result = runNode(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.reason, "no_test_command");
  assert.match(payload.evidenceFile, /docs\/verification/);
  assert.equal(Array.isArray(payload.suggestions), true);
  assert.ok(payload.suggestions.length >= 1);
});

test("verify auto-detects node test file without package scripts", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-verify-node-fallback-"));
  const feature = "verify-node-fallback";

  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", "web"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n- FR-1: Rule.\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(tempDir, "tests", "web", "zombite-smoke.test.mjs"),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('smoke', () => {\n  assert.equal(1, 1);\n});\n",
    "utf8"
  );

  const result = runNode(["verify", "--feature", feature, "--json"], { cwd: tempDir });
  assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.commandSource, "node:test:file");
  assert.match(payload.command, /node --test/);
});

test("status requires re-verify when verification evidence is stale", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-verify-stale-"));
  const feature = "verify-stale";

  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "discovery"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "plan"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "verification"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "backlog", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", feature), { recursive: true });

  fs.writeFileSync(path.join(tempDir, "specs", "approved", `${feature}.md`), `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n- FR-1: Rule one.\n`, "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "discovery", `${feature}.md`), `# Discovery: ${feature}\n\n## 2. Discovery Interview Summary (Discovery Persona)\n- Primary users:\n- Users\n- Jobs to be done:\n- Complete key flow\n- Current pain:\n- Unreliable outcomes\n- Constraints (business/technical/compliance):\n- Basic compliance\n- Dependencies:\n- Internal service\n- Success metrics:\n- Success rate > 95%\n- Assumptions:\n- Inputs remain stable\n\n## 3. Scope\n### In scope\n- Core flow\n\n### Out of scope\n- Extras\n\n## 9. Discovery Confidence\n- Confidence:\n- Medium\n\n- Reason:\n- Baseline inputs present\n\n- Evidence gaps:\n- Latency SLO pending\n\n- Handoff decision:\n- Ready for Product/Architecture\n`, "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "plan", `${feature}.md`), `# Plan: ${feature}\n\n## 4. Product Review (Product Persona)\n### Business value\n- Reduce failure rate in core flow.\n\n### Success metric\n- Success rate above 95%.\n\n### Assumptions to validate\n- User input profile stays stable.\n\n## 5. Architecture (Architect Persona)\n### Components\n- API gateway\n- Service layer\n\n### Data flow\n- Request to service and response back to caller.\n\n### Key decisions\n- Explicit contracts between layers.\n\n### Risks & mitigations\n- Retry with bounded backoff for dependency failures.\n\n### Observability (logs/metrics/tracing)\n- Logs, latency metrics, and trace IDs.\n`, "utf8");
  fs.writeFileSync(path.join(tempDir, "backlog", feature, "backlog.md"), `# Backlog: ${feature}\n### US-1\n- Trace: FR-1, AC-1\n`, "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", feature, "tests.md"), `# Test Cases: ${feature}\n### TC-1\n- Trace: US-1, FR-1, AC-1\n`, "utf8");

  fs.writeFileSync(
    path.join(tempDir, "docs", "verification", `${feature}.json`),
    JSON.stringify({
      ok: true,
      feature,
      command: "npm run test:aitri",
      exitCode: 0,
      startedAt: "2020-01-01T00:00:00.000Z",
      finishedAt: "2020-01-01T00:00:01.000Z",
      reason: "passed"
    }, null, 2),
    "utf8"
  );

  const status = runNodeOk(["status", "--json"], { cwd: tempDir });
  const payload = JSON.parse(status.stdout);
  assert.equal(payload.verification.status, "stale");
  assert.equal(payload.nextStep, "aitri verify");
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
