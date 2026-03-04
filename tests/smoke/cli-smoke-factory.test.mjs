import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";

function setupGit(tempDir) {
  spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.name", "Aitri Test"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "aitri@example.com"], { cwd: tempDir, encoding: "utf8" });
  fs.writeFileSync(path.join(tempDir, ".gitkeep"), "seed\n", "utf8");
  spawnSync("git", ["add", ".gitkeep"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "baseline"], { cwd: tempDir, encoding: "utf8" });
}

function writeFactoryDraft(tempDir, feature) {
  fs.writeFileSync(
    path.join(tempDir, "specs", "drafts", `${feature}.md`),
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
Teams need deterministic implementation briefs after planning.

## 2. Actors
- Delivery engineer
- QA lead

## 3. Functional Rules (traceable)
- FR-1: The system must generate implementation instructions per user story.
- FR-2: The system must provide dependency-aware execution order.

## 4. Edge Cases
- Stories have missing TC references.

## 7. Security Considerations
- Restrict implementation actions to approved feature scope.

## 9. Acceptance Criteria
- AC-1: Given scaffold artifacts, when implement runs, then per-story briefs are generated.
- AC-2: Given multiple stories, when implement runs, then output includes an ordered implementation sequence.
`,
    "utf8"
  );
}

function prepareScaffoldedFeature(tempDir, feature) {
  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Factory implementation orchestration", "--non-interactive", "--yes"], { cwd: tempDir });
  writeFactoryDraft(tempDir, feature);
  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    `{
  "name": "aitri-factory-smoke",
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
  spawnSync("git", ["commit", "-m", "ready for factory"], { cwd: tempDir, encoding: "utf8" });
  runNodeOk(["go", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["scaffold", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
}

function implementStubs(tempDir, feature) {
  // Simulate real implementation: replace failing stubs with passing tests.
  // In a real project, the AI agent or human writes actual code here.
  const generatedDir = path.join(tempDir, "tests", feature, "generated");
  if (!fs.existsSync(generatedDir)) return;
  const files = fs.readdirSync(generatedDir).filter((name) => name.endsWith(".test.mjs"));
  files.forEach((file) => {
    const abs = path.join(generatedDir, file);
    const content = fs.readFileSync(abs, "utf8");
    // Replace assert.fail stub with real passing assertion
    const implemented = content.replace(
      /assert\.fail\([^)]+\);/g,
      "assert.ok(true, \"implemented\");"
    );
    fs.writeFileSync(abs, implemented, "utf8");
  });
}

function prepareImplementedFeature(tempDir, feature) {
  prepareScaffoldedFeature(tempDir, feature);
  runNodeOk(["implement", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  implementStubs(tempDir, feature);
}

test("implement is blocked when scaffold artifacts are missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-implement-block-"));
  const feature = "implement-block";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const result = runNode(["implement", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /IMPLEMENT BLOCKED/);
});

test("implement generates per-story briefs and implementation order", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-implement-generate-"));
  const feature = "implement-generate";
  prepareScaffoldedFeature(tempDir, feature);

  runNodeOk(["implement", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  const implementationDir = path.join(tempDir, "docs", "implementation", feature);
  const orderFile = path.join(implementationDir, "IMPLEMENTATION_ORDER.md");
  assert.equal(fs.existsSync(orderFile), true);
  const orderContent = fs.readFileSync(orderFile, "utf8");
  assert.match(orderContent, /Ordered Stories/);
  assert.match(orderContent, /US-1/);

  const briefFiles = fs.readdirSync(implementationDir).filter((name) => /^US-\d+\.md$/.test(name));
  assert.ok(briefFiles.length >= 1);
  const briefContent = fs.readFileSync(path.join(implementationDir, briefFiles[0]), "utf8");
  assert.match(briefContent, /Implementation Brief: US-/);
  assert.match(briefContent, /Scaffold References/);
  assert.match(briefContent, /Quality Constraints/);
});

test("status reports post-go factory states deterministically", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-factory-status-"));
  const feature = "factory-status";
  prepareScaffoldedFeature(tempDir, feature);

  const afterScaffold = JSON.parse(runNodeOk(["status", "--feature", feature, "--json"], { cwd: tempDir }).stdout);
  assert.equal(afterScaffold.nextStep, "build_pending");
  assert.equal(afterScaffold.recommendedCommand, `aitri build --feature ${feature}`);

  runNodeOk(["implement", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  const afterImplement = JSON.parse(runNodeOk(["status", "--feature", feature, "--json"], { cwd: tempDir }).stdout);
  assert.equal(afterImplement.nextStep, "verify_pending");
  assert.equal(afterImplement.recommendedCommand, "aitri verify");

  // Simulate real implementation: replace failing stubs so verify can pass
  implementStubs(tempDir, feature);

  runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  const afterVerify = JSON.parse(runNodeOk(["status", "--feature", feature, "--json"], { cwd: tempDir }).stdout);
  assert.equal(afterVerify.nextStep, "prove_pending");
  assert.equal(afterVerify.recommendedCommand, `aitri prove --feature ${feature}`);
});

test("deliver blocks when FR coverage is incomplete", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-deliver-block-"));
  const feature = "deliver-block";
  prepareImplementedFeature(tempDir, feature);

  const generatedDir = path.join(tempDir, "tests", feature, "generated");
  const generatedFiles = fs.readdirSync(generatedDir).filter((name) => name.endsWith(".mjs"));
  const firstFile = path.join(generatedDir, generatedFiles[0]);
  // Strip TC marker from first file so FR coverage is incomplete
  const stripped = fs.readFileSync(firstFile, "utf8").replace(/\/\/\s*TC-\d+:\s*[^\n]+\n/, "");
  fs.writeFileSync(firstFile, stripped, "utf8");

  runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  const deliver = runNode(["deliver", "--feature", feature, "--non-interactive", "--yes", "--json"], { cwd: tempDir });
  assert.equal(deliver.status, 1);
  const payload = JSON.parse(deliver.stdout);
  assert.equal(payload.decision, "BLOCKED");
  assert.ok(payload.blockers.length >= 1);
});

test("deliver blocks when AC coverage is incomplete", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-deliver-ac-block-"));
  const feature = "deliver-ac-block";
  prepareImplementedFeature(tempDir, feature);

  // Inject an extra AC into the approved spec that no TC traces to
  const specFile = path.join(tempDir, "specs", "approved", `${feature}.md`);
  const specContent = fs.readFileSync(specFile, "utf8");
  fs.writeFileSync(specFile, specContent + "\n- AC-99: Given a phantom criterion, when deliver runs, then it must be flagged as uncovered.\n", "utf8");

  runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  const deliver = runNode(["deliver", "--feature", feature, "--non-interactive", "--yes", "--json"], { cwd: tempDir });
  assert.equal(deliver.status, 1);
  const payload = JSON.parse(deliver.stdout);
  assert.equal(payload.decision, "BLOCKED");
  assert.ok(payload.blockers.some((b) => /Uncovered ACs:.*AC-99/.test(b)));
  assert.ok(Array.isArray(payload.acMatrix));
  const ac99 = payload.acMatrix.find((row) => row.acId === "AC-99");
  assert.ok(ac99, "AC-99 should appear in acMatrix");
  assert.equal(ac99.covered, false);
});

test("factory E2E flow completes through deliver gate", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-factory-e2e-"));
  const feature = "factory-e2e";
  prepareImplementedFeature(tempDir, feature);

  runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  // Write proof fixture directly: real TC stubs have unresolvable contract imports in the test environment.
  // aitri prove is exercised in the prove-compliance.test.mjs regression suite.
  const proofDir = path.join(tempDir, "docs", "implementation", feature);
  fs.writeFileSync(path.join(proofDir, "proof-of-compliance.json"), JSON.stringify({
    schemaVersion: 1,
    ok: true,
    feature,
    provenAt: new Date().toISOString(),
    summary: { total: 2, proven: 2, unproven: 0 },
    frProof: {
      "FR-1": { proven: true, via: ["TC-1"], tracingTcs: ["TC-1"], evidence: [] },
      "FR-2": { proven: true, via: ["TC-2"], tracingTcs: ["TC-2"], evidence: [] }
    },
    tcResults: {}
  }, null, 2), "utf8");
  // EVO-087: qa-report.md required before deliver
  fs.mkdirSync(path.join(tempDir, ".aitri"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, ".aitri", "qa-report.md"),
    "# QA Report: factory-e2e\nDate: 2026-01-01\n\n## Results\n- AC-1: PASS — verified\n- AC-2: PASS — verified\n\n## Summary\nTotal: 2 | Passed: 2 | Failed: 0\nDecision: PASS\n"
  );
  const deliver = runNodeOk(["deliver", "--feature", feature, "--non-interactive", "--yes", "--json"], { cwd: tempDir });
  const payload = JSON.parse(deliver.stdout);
  assert.equal(payload.decision, "SHIP");
  assert.equal(payload.ok, true);
  assert.ok(Array.isArray(payload.acMatrix), "acMatrix should be present");
  assert.ok(payload.acMatrix.length >= 1, "acMatrix should have entries");
  assert.ok(payload.acMatrix.every((row) => row.covered), "all ACs should be covered");
  assert.match(payload.reportJson, /docs\/delivery\/factory-e2e\.json/);
  assert.match(payload.reportMarkdown, /docs\/delivery\/factory-e2e\.md/);
  assert.ok(payload.releaseTag, "SHIP decision should create a release tag");
  assert.match(payload.releaseTag, /aitri-release\/factory-e2e/);

  const reportMd = fs.readFileSync(path.join(tempDir, payload.reportMarkdown), "utf8");
  assert.match(reportMd, /## AC Coverage Matrix/);

  const statusAfterDeliver = JSON.parse(
    runNodeOk(["status", "--feature", feature, "--json"], { cwd: tempDir }).stdout
  );
  assert.equal(statusAfterDeliver.nextStep, "delivery_complete");
  assert.equal(statusAfterDeliver.recommendedCommand, "aitri feedback");
});

// EVO-087: qa command tests
test("qa requires --feature flag", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-qa-"));
  fs.mkdirSync(path.join(tempDir, "specs", "drafts"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "project.json"), JSON.stringify({ name: "test" }));
  const r = runNode(["qa", "--non-interactive"], { cwd: tempDir });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /feature name is required/i);
});

test("qa blocks when approved spec is missing", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-qa-"));
  fs.mkdirSync(path.join(tempDir, "specs", "drafts"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "project.json"), JSON.stringify({ name: "test" }));
  const r = runNode(["qa", "--feature", "my-feat", "--non-interactive"], { cwd: tempDir });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /approved spec not found/i);
});

test("qa blocks when proof-of-compliance is missing", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-qa-"));
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "specs", "drafts"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "project.json"), JSON.stringify({ name: "test" }));
  fs.writeFileSync(path.join(tempDir, "specs", "approved", "my-feat.md"), `# AF-SPEC: my-feat\nSTATUS: APPROVED\n## 9. Acceptance Criteria\n- AC-1: Given x, when y, then z.\n`);
  const r = runNode(["qa", "--feature", "my-feat", "--non-interactive"], { cwd: tempDir });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /proof of compliance not found/i);
});

test("qa outputs agent task when proof passes", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-qa-"));
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "specs", "drafts"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs", "implementation", "my-feat"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "project.json"), JSON.stringify({ name: "test" }));
  fs.writeFileSync(path.join(tempDir, "specs", "approved", "my-feat.md"), `# AF-SPEC: my-feat\nSTATUS: APPROVED\n## 9. Acceptance Criteria\n- AC-1: Given x, when y, then z.\n- AC-2: Given a, when b, then c.\n`);
  fs.writeFileSync(
    path.join(tempDir, "docs", "implementation", "my-feat", "proof-of-compliance.json"),
    JSON.stringify({ ok: true, summary: { proven: 2, unproven: 0, total: 2 } })
  );
  const r = runNode(["qa", "--feature", "my-feat", "--non-interactive"], { cwd: tempDir });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /AGENT TASK: qa/);
  assert.match(r.stdout, /AC-1/);
  assert.match(r.stdout, /AC-2/);
  assert.match(r.stdout, /qa-report\.md/);
});
