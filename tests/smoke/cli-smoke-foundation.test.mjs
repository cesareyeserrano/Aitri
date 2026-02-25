import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";

test("help and version are available", () => {
  const version = runNodeOk(["--version"]);
  assert.match(version.stdout, /aitri v\d+\.\d+\.\d+/);

  const help = runNodeOk(["help"]);
  assert.match(help.stdout, /Workflow/);
  assert.match(help.stdout, /status/);
  assert.match(help.stdout, /resume/);
  assert.match(help.stdout, /verify/);
  assert.match(help.stdout, /deliver/);
  assert.match(help.stdout, /--json, -j/);
  assert.match(help.stdout, /--advanced/);

  const advanced = runNodeOk(["help", "--advanced"]);
  assert.match(advanced.stdout, /--non-interactive/);
  assert.match(advanced.stdout, /--discovery-depth <d>/);
  assert.match(advanced.stdout, /--retrieval-mode <m>/);
  assert.match(advanced.stdout, /--no-verify/);
  assert.match(advanced.stdout, /--no-checkpoint/);
});

test("status json works in empty project", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-empty-"));
  const result = runNodeOk(["status", "--json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.structure.ok, false);
  assert.equal(payload.nextStep, "aitri init");
  assert.equal(payload.recommendedCommand, "aitri init");
  assert.match(payload.nextStepMessage, /Continue SDLC flow/i);
  assert.equal(payload.confidence.score, 0);
  assert.equal(payload.confidence.level, "low");
  assert.equal(payload.confidence.components.specIntegrity, 0);
  assert.equal(payload.confidence.components.runtimeVerification, 0);
  assert.equal(payload.checkpoint.state.git, false);
  assert.equal(payload.checkpoint.state.detected, false);
});

test("status ui generates static insight file and exposes path in json mode", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-status-ui-"));
  const result = runNodeOk(["status", "--ui", "--json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.ui.enabled, true);
  assert.match(payload.ui.file, /docs\/insight\/status\.html$/);
  const htmlPath = path.join(tempDir, payload.ui.file);
  assert.equal(fs.existsSync(htmlPath), true);
  const html = fs.readFileSync(htmlPath, "utf8");
  assert.match(html, /Aitri Insight/);
  assert.match(html, /Confidence/);
});

test("status ui respects mapped docs path from config", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-status-ui-config-"));
  fs.writeFileSync(
    path.join(tempDir, "aitri.config.json"),
    JSON.stringify({
      paths: {
        docs: "knowledge/docs"
      }
    }, null, 2),
    "utf8"
  );

  const result = runNodeOk(["status", "--ui", "--json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);
  assert.match(payload.ui.file, /knowledge\/docs\/insight\/status\.html$/);
  assert.equal(fs.existsSync(path.join(tempDir, payload.ui.file)), true);
});

test("status ui supports --no-open for non-json output", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-status-ui-no-open-"));
  const result = runNodeOk(["status", "--ui", "--no-open"], { cwd: tempDir });
  assert.match(result.stdout, /Aitri Status UI generated/);
  assert.doesNotMatch(result.stdout, /Browser auto-open failed/);
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

test("status requires explicit --feature in multi-feature repositories", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-status-multi-"));
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "specs", "approved", "alpha.md"), "# AF-SPEC: alpha\nSTATUS: APPROVED\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "specs", "approved", "zeta.md"), "# AF-SPEC: zeta\nSTATUS: APPROVED\n", "utf8");

  const result = runNode(["status", "--json"], { cwd: tempDir });
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.selection.issue, "feature_required");
  assert.match(payload.selection.message, /Multiple approved specs found/);
  assert.equal(payload.approvedSpec.feature, null);
});

test("status --feature selects deterministic context in multi-feature repositories", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-status-multi-feature-"));
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "specs", "approved", "alpha.md"), "# AF-SPEC: alpha\nSTATUS: APPROVED\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "specs", "approved", "zeta.md"), "# AF-SPEC: zeta\nSTATUS: APPROVED\n", "utf8");

  const result = runNodeOk(["status", "--feature", "zeta", "--json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.approvedSpec.feature, "zeta");
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

test("status recommends approve when a single draft spec exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-status-draft-next-"));
  const feature = "draft-next";
  fs.mkdirSync(path.join(tempDir, "specs", "drafts"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "specs", "drafts", `${feature}.md`), `# AF-SPEC: ${feature}\nSTATUS: DRAFT\n`, "utf8");

  const result = runNodeOk(["status", "--json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.approvedSpec.found, false);
  assert.equal(payload.draftSpec.found, true);
  assert.equal(payload.draftSpec.feature, feature);
  assert.equal(payload.nextStep, "aitri approve");
  assert.equal(payload.recommendedCommand, `aitri approve --feature ${feature}`);
});

test("resume recommends approve when a single draft spec exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-resume-draft-next-"));
  const feature = "resume-draft-next";
  fs.mkdirSync(path.join(tempDir, "specs", "drafts"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "specs", "drafts", `${feature}.md`), `# AF-SPEC: ${feature}\nSTATUS: DRAFT\n`, "utf8");

  const result = runNodeOk(["resume", "json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.nextStep, "aitri approve");
  assert.equal(payload.recommendedCommand, `aitri approve --feature ${feature}`);
});

test("resume marks workflow complete when delivery is already finished", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-resume-delivery-complete-"));
  const feature = "resume-delivery-complete";
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "backlog", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", feature), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "discovery"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "plan"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "verification"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "delivery"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "implementation", feature), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "specs", "approved", `${feature}.md`), `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n- FR-1: Rule.\n`, "utf8");
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
    reason: "passed",
    tcCoverage: {
      mode: "scaffold",
      declared: 1,
      executable: 1,
      passing: 1,
      failing: 0,
      missing: 0
    }
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "implementation", feature, "go.json"), JSON.stringify({
    ok: true,
    feature,
    decidedAt: "2099-01-01T00:00:00.000Z"
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "implementation", feature, "scaffold-manifest.json"), JSON.stringify({
    feature
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "implementation", feature, "implement-manifest.json"), JSON.stringify({
    feature
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "delivery", `${feature}.json`), JSON.stringify({
    decision: "SHIP"
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "implementation", feature, "proof-of-compliance.json"), JSON.stringify({
    schemaVersion: 1,
    ok: true,
    feature,
    provenAt: "2099-01-01T00:00:00.000Z",
    summary: { total: 1, proven: 1, unproven: 0 },
    frProof: { "FR-1": { proven: true, via: ["TC-1"], tracingTcs: ["TC-1"], evidence: [] } },
    tcResults: { "TC-1": { passed: true, file: null } }
  }, null, 2), "utf8");

  const result = runNodeOk(["resume", "--non-interactive", "--yes"], { cwd: tempDir });
  assert.match(result.stdout, /Current state: delivery_complete/);
  assert.match(result.stdout, /Workflow complete\. No further SDLC execution steps are required\./);
  assert.match(result.stdout, /Optional local review: aitri status --ui/);
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

test("draft rejects short ideas in non-interactive mode", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-draft-short-idea-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const result = runNode([
    "draft",
    "--feature", "short-idea",
    "--idea", "OEL",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /too short/);
});

test("draft rejects traversal-style feature names", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-draft-traversal-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const result = runNode([
    "draft",
    "--feature", "../../../../tmp/aitri-traversal-deny",
    "--idea", "Traversal should fail",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Invalid feature name/);
});

test("draft prints next step guidance and git tip when checkpoints are unavailable", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-draft-guidance-"));
  const feature = "draft-guidance";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const draft = runNodeOk([
    "draft",
    "--feature", feature,
    "--idea", "Guidance output check",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });

  assert.match(draft.stdout, /Auto-checkpoint skipped: not a git repository/);
  assert.match(draft.stdout, /Tip: initialize git to enable checkpoints/);
  assert.match(draft.stdout, new RegExp(`Next recommended command: aitri approve --feature ${feature}`));
});

test("approve gate failure includes corrective next-step guidance", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-approve-guidance-"));
  const feature = "approve-guidance";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Approve guidance flow", "--non-interactive", "--yes"], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  const content = fs.readFileSync(draftFile, "utf8")
    .replace("## 7. Security Considerations\n- <at least one security note/control>", "## 7. Security Considerations\n-");
  fs.writeFileSync(draftFile, content, "utf8");

  const result = runNode(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /GATE FAILED:/);
  assert.match(result.stdout, /Security Considerations must include at least one meaningful bullet/);
  assert.match(result.stdout, /Fix:/);
  assert.match(result.stdout, new RegExp(`aitri approve --feature ${feature}`));
});
