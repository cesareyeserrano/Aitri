import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";

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
