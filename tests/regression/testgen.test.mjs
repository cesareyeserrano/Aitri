import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "../smoke/helpers/cli-test-helpers.mjs";

function writeApprovedSpec(dir, feature) {
  const specDir = path.join(dir, "specs", "approved");
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, `${feature}.md`),
    [
      `# AF-SPEC: ${feature}`,
      "STATUS: APPROVED",
      "",
      "## 1. Context",
      "Testgen fixture.",
      "",
      "## 2. Actors",
      "- Developer",
      "",
      "## 3. Functional Rules (traceable)",
      "- FR-1: Must compute the result correctly.",
      "",
      "## 9. Acceptance Criteria",
      "- AC-1: Given valid input, when compute is called, then the result is returned.",
      ""
    ].join("\n"),
    "utf8"
  );
}

function writeTestsMd(dir, feature) {
  const testsDir = path.join(dir, "tests", feature);
  fs.mkdirSync(testsDir, { recursive: true });
  fs.writeFileSync(
    path.join(testsDir, "tests.md"),
    [
      `# Tests: ${feature}`,
      "",
      "### TC-1",
      "- Title: Validate compute result",
      "- Trace: US-1, FR-1, AC-1",
      ""
    ].join("\n"),
    "utf8"
  );
}

function writeStub(dir, tcId) {
  const content = [
    `// ${tcId}: stub`,
    `import test from "node:test";`,
    `import assert from "node:assert/strict";`,
    `test("${tcId} placeholder", () => {`,
    `  assert.fail("Not implemented: ${tcId} — placeholder");`,
    `});`
  ].join("\n");
  fs.writeFileSync(path.join(dir, `${tcId.toLowerCase()}.test.mjs`), content, "utf8");
}

test("testgen fails fast when approved spec is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-testgen-no-spec-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const result = runNode(["testgen", "--feature", "ghost-feature", "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Approved spec not found/);
});

test("testgen fails fast when tests file is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-testgen-no-tests-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const feature = "no-tests-feature";
  writeApprovedSpec(tempDir, feature);

  const result = runNode(["testgen", "--feature", feature, "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Tests file not found/);
});

test("testgen fails fast when no generated stubs directory exists", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-testgen-no-stubs-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const feature = "no-stubs";
  writeApprovedSpec(tempDir, feature);
  writeTestsMd(tempDir, feature);

  const result = runNode(["testgen", "--feature", feature, "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Generated stubs not found/);
});

test("testgen outputs agent task without AI config", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-testgen-no-ai-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const feature = "no-ai";
  writeApprovedSpec(tempDir, feature);
  writeTestsMd(tempDir, feature);
  const generatedDir = path.join(tempDir, "tests", feature, "generated");
  fs.mkdirSync(generatedDir, { recursive: true });
  writeStub(generatedDir, "TC-1");

  // No ai config needed — testgen outputs agent task prompt
  const result = runNode(["testgen", "--feature", feature, "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /AGENT TASK/);
});

test("testgen skips already-implemented stubs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-testgen-skip-impl-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const feature = "skip-impl";
  writeApprovedSpec(tempDir, feature);
  writeTestsMd(tempDir, feature);
  const generatedDir = path.join(tempDir, "tests", feature, "generated");
  fs.mkdirSync(generatedDir, { recursive: true });

  // Write an already-implemented stub (no "Not implemented" marker)
  const implContent = [
    `// TC-1: stub`,
    `import test from "node:test";`,
    `import assert from "node:assert/strict";`,
    `test("TC-1 real", () => { assert.ok(true); });`
  ].join("\n");
  fs.writeFileSync(path.join(generatedDir, "tc-1.test.mjs"), implContent, "utf8");

  const result = runNode(["testgen", "--feature", feature, "--non-interactive"], { cwd: tempDir });
  // Should exit 0 — no stubs to generate
  assert.equal(result.status, 0);
  assert.match(result.stdout, /already implemented/i);
});
