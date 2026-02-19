import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";

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

## 4. Edge Cases
- Expired session token during login.

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

  // New flow: verify is no longer required before go. Plan exists → handoff is ready.
  const handoff = runNode(["handoff", "json"], { cwd: tempDir });
  assert.equal(handoff.status, 0);
  const payload = JSON.parse(handoff.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.nextStep, "ready_for_human_approval");

  const handoffHuman = runNode(["handoff"], { cwd: tempDir });
  assert.equal(handoffHuman.status, 0);
  assert.match(handoffHuman.stdout, /HANDOFF READY/);
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

test("verify failure prints next-step guidance in human-readable mode", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-verify-guidance-"));
  const feature = "verify-guidance";
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n- FR-1: Rule.\n`,
    "utf8"
  );

  const result = runNode(["verify", "--feature", feature, "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /VERIFICATION FAILED/);
  assert.match(result.stdout, /Next recommended step:/);
  assert.match(result.stdout, /Add a runtime test command in package\.json/);
  assert.match(result.stdout, new RegExp(`- Run: aitri verify --feature ${feature}`));
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
  assert.equal(payload.tcCoverage.mode, "missing_tests_file");
  assert.equal(payload.tcCoverage.available, false);
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
  // New flow: stale verification does not block go. Plan exists → ready_for_human_approval.
  assert.equal(payload.nextStep, "ready_for_human_approval");
  assert.equal(payload.confidence.level, "medium");
  assert.equal(payload.confidence.components.runtimeVerification, 55);
  assert.equal(payload.confidence.releaseReady, false);
});

test("status confidence penalizes manual smoke-only verification evidence", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-verify-limited-scope-"));
  const feature = "verify-limited-scope";

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
      command: "node --test tests/web/zombite-smoke.test.mjs",
      commandSource: "flag:verify-cmd",
      exitCode: 0,
      startedAt: "2026-02-14T00:00:00.000Z",
      finishedAt: "2099-01-01T00:00:01.000Z",
      reason: "passed"
    }, null, 2),
    "utf8"
  );

  const status = runNodeOk(["status", "--json"], { cwd: tempDir });
  const payload = JSON.parse(status.stdout);
  assert.equal(payload.verification.status, "passed");
  assert.equal(payload.nextStep, "ready_for_human_approval");
  assert.equal(payload.confidence.components.runtimeVerification, 60);
  assert.equal(payload.confidence.level, "medium");
  assert.equal(payload.confidence.releaseReady, false);
  assert.equal(payload.confidence.details.runtimeVerification.commandSource, "flag:verify-cmd");
  assert.equal(payload.confidence.details.runtimeVerification.notes.length, 2);
});

test("verify rejects traversal-style feature names", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-verify-traversal-"));
  const target = `verify-traversal-${Date.now()}`;
  const escapedFile = path.join("/tmp", `${target}.json`);

  const result = runNode([
    "verify",
    "--feature", `../../../../tmp/${target}`,
    "--non-interactive",
    "--json"
  ], { cwd: tempDir });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.issues[0], /Invalid feature name/);
  assert.equal(fs.existsSync(escapedFile), false);
});

test("policy rejects traversal-style feature names", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-policy-traversal-"));
  const target = `policy-traversal-${Date.now()}`;
  const escapedFile = path.join("/tmp", `${target}.json`);

  const result = runNode([
    "policy",
    "--feature", `../../../../tmp/${target}`,
    "--non-interactive",
    "--json"
  ], { cwd: tempDir });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.issues[0], /Invalid feature name/);
  assert.equal(fs.existsSync(escapedFile), false);
});

function seedReadyForGoNonGitWorkspace(tempDir, feature) {
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
}

test("go continues in non-git workspaces in local-first mode", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-go-non-git-local-first-"));
  const feature = "go-non-git-local-first";

  seedReadyForGoNonGitWorkspace(tempDir, feature);

  const result = runNode(["go", "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GO NOTICE: continuing in local-first mode/);
  assert.match(result.stdout, /Implementation go\/no-go decision: GO/);
  assert.equal(fs.existsSync(path.join(tempDir, "docs", "implementation", feature, "go.json")), true);
});

test("go is blocked in non-git workspaces when strict policy is requested", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-go-non-git-strict-"));
  const feature = "go-non-git-strict";

  seedReadyForGoNonGitWorkspace(tempDir, feature);

  const result = runNode(["go", "--strict-policy", "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /GO BLOCKED: managed-go policy checks are limited outside git repositories/);
});

test("verify enforces timeout for long-running commands", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-verify-timeout-"));
  const feature = "verify-timeout";

  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n- FR-1: Rule.\n`,
    "utf8"
  );

  const result = runNode([
    "verify",
    "--feature", feature,
    "--verify-cmd", "node -e \"setTimeout(() => {}, 2000)\"",
    "--non-interactive",
    "--json"
  ], {
    cwd: tempDir,
    env: {
      AITRI_VERIFY_TIMEOUT_MS: "50"
    }
  });

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.reason, "verification_timeout");
  assert.equal(payload.timeoutMs, 50);
});

test("scaffold is blocked when go gate has not been completed", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-scaffold-go-block-"));
  const feature = "scaffold-go-block";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const result = runNode(["scaffold", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /SCAFFOLD BLOCKED: go gate was not completed/);
});

test("scaffold generates TC stubs and FR interfaces after go", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-scaffold-generate-"));
  const feature = "scaffold-generate";
  spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Aitri Test"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "aitri@example.com"], { cwd: tempDir, encoding: "utf8" });
  fs.writeFileSync(path.join(tempDir, ".gitkeep"), "seed\n", "utf8");
  spawnSync("git", ["add", ".gitkeep"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "baseline"], { cwd: tempDir, encoding: "utf8" });

  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Node CLI orchestration", "--non-interactive", "--yes"], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  fs.writeFileSync(
    draftFile,
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
Teams need a Node.js command workflow to orchestrate approvals.

## 2. Actors
- Release operator

## 3. Functional Rules (traceable)
- FR-1: The system must create a verified handoff summary before release.

## 4. Edge Cases
- Handoff triggered with partially verified artifacts.

## 7. Security Considerations
- Ensure only authorized operators can trigger release actions.

## 9. Acceptance Criteria
- AC-1: Given approved artifacts, when handoff is requested, then summary is generated.
`,
    "utf8"
  );

  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    `{
  "name": "scaffold-generate",
  "private": true,
  "scripts": {
    "test:aitri": "node -e \\"process.exit(0)\\""
  }
}
`,
    "utf8"
  );

  runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  spawnSync("git", ["add", "-A"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "ready for go"], { cwd: tempDir, encoding: "utf8" });

  runNodeOk(["go", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["scaffold", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  const goMarker = path.join(tempDir, "docs", "implementation", feature, "go.json");
  const manifest = path.join(tempDir, "docs", "implementation", feature, "scaffold-manifest.json");
  assert.equal(fs.existsSync(goMarker), true);
  assert.equal(fs.existsSync(manifest), true);

  const generatedDir = path.join(tempDir, "tests", feature, "generated");
  const generatedFiles = fs.readdirSync(generatedDir).filter((name) => name.endsWith(".mjs"));
  assert.ok(generatedFiles.length >= 1);
  const testContent = fs.readFileSync(path.join(generatedDir, generatedFiles[0]), "utf8");
  assert.match(testContent, /\/\/ TC-\d+:/);
  assert.match(testContent, /\/\/ Acceptance Criteria: AC-/);

  const contractsDir = path.join(tempDir, "src", "contracts");
  const contractFiles = fs.readdirSync(contractsDir).filter((name) => name.endsWith(".js"));
  assert.ok(contractFiles.length >= 1);
  const contractContent = fs.readFileSync(path.join(contractsDir, contractFiles[0]), "utf8");
  assert.match(contractContent, /FR-1/);

  const verify = runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  const verifyPayload = JSON.parse(verify.stdout);
  assert.equal(verifyPayload.tcCoverage.mode, "scaffold");
  assert.ok(verifyPayload.tcCoverage.declared >= 1);
  assert.ok(verifyPayload.tcCoverage.executable >= 1);
  assert.ok(verifyPayload.frCoverage.declared >= 1);
  assert.ok(verifyPayload.usCoverage.declared >= 1);
});
