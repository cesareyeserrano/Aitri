import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "../smoke/helpers/cli-test-helpers.mjs";

function writeApprovedSpec(dir, feature) {
  const specDir = path.join(dir, "specs", "approved");
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, `${feature}.md`), [
    `# AF-SPEC: ${feature}`, "STATUS: APPROVED", "",
    "## 3. Functional Rules (traceable)", "- FR-1: Must compute correctly.", "",
    "## 9. Acceptance Criteria", "- AC-1: Given input, when called, then correct result.", ""
  ].join("\n"), "utf8");
}

function writeTestsMd(dir, feature) {
  const testsDir = path.join(dir, "tests", feature);
  fs.mkdirSync(testsDir, { recursive: true });
  fs.writeFileSync(path.join(testsDir, "tests.md"), [
    `# Tests: ${feature}`, "", "### TC-1", "- Title: Validate computation",
    "- Trace: US-1, FR-1, AC-1", ""
  ].join("\n"), "utf8");
}

// Contract that returns true — has a 'true' boolean that can be mutated
function writeStrongContract(dir, fnName) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${fnName}.js`),
    `export function ${fnName}(input) { if (input === null) return false; return true; }\n`,
    "utf8");
}

// Stub that explicitly asserts result === true — will FAIL when contract mutated to false
function writeStrongAssertionStub(dir, tcId, contractRelPath, fnName) {
  const content = [
    `// ${tcId}: stub`,
    `import { ${fnName} } from "${contractRelPath}";`,
    `import test from "node:test";`,
    `import assert from "node:assert/strict";`,
    `test("${tcId} strong", () => {`,
    `  const result = ${fnName}("hello");`,
    `  assert.strictEqual(result, true);`,
    `});`
  ].join("\n");
  fs.writeFileSync(path.join(dir, `${tcId.toLowerCase()}.test.mjs`), content, "utf8");
}

// Stub that only asserts assert.ok(true) — won't catch contract mutations
function writeWeakAssertionStub(dir, tcId, contractRelPath, fnName) {
  const content = [
    `// ${tcId}: stub`,
    `import { ${fnName} } from "${contractRelPath}";`,
    `import test from "node:test";`,
    `import assert from "node:assert/strict";`,
    `test("${tcId} weak", () => {`,
    `  ${fnName}("hello");`,
    `  assert.ok(true);`,
    `});`
  ].join("\n");
  fs.writeFileSync(path.join(dir, `${tcId.toLowerCase()}.test.mjs`), content, "utf8");
}

test("prove --mutate detects mutations when stub has strong assertions", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-mutate-strong-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const feature = "mutate-strong";
  writeApprovedSpec(tempDir, feature);
  writeTestsMd(tempDir, feature);
  const generatedDir = path.join(tempDir, "tests", feature, "generated");
  fs.mkdirSync(generatedDir, { recursive: true });
  const contractDir = path.join(tempDir, "src", "contracts");
  writeStrongContract(contractDir, "fr1_compute");
  writeStrongAssertionStub(generatedDir, "TC-1", "../../../src/contracts/fr1_compute.js", "fr1_compute");

  const result = runNode(["prove", "--feature", feature, "--mutate", "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 0, "strong assertions must still exit 0");
  assert.match(result.stdout, /Mutation analysis:/i);
  assert.match(result.stdout, /mutations detected/i);

  const proof = JSON.parse(
    fs.readFileSync(path.join(tempDir, "docs", "implementation", feature, "proof-of-compliance.json"), "utf8")
  );
  assert.ok(proof.summary.mutation !== null, "mutation summary must be present");
  assert.ok(proof.summary.mutation.total > 0, "must have run at least one mutation");
  assert.ok(proof.summary.mutation.detected > 0, "strong assertions must detect at least one mutation");
});

test("prove --mutate shows 0 detections when stub ignores contract return value", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-mutate-weak-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const feature = "mutate-weak";
  writeApprovedSpec(tempDir, feature);
  writeTestsMd(tempDir, feature);
  const generatedDir = path.join(tempDir, "tests", feature, "generated");
  fs.mkdirSync(generatedDir, { recursive: true });
  const contractDir = path.join(tempDir, "src", "contracts");
  writeStrongContract(contractDir, "fr1_compute");
  writeWeakAssertionStub(generatedDir, "TC-1", "../../../src/contracts/fr1_compute.js", "fr1_compute");

  const result = runNode(["prove", "--feature", feature, "--mutate", "--non-interactive"], { cwd: tempDir });
  // Weak assertions → FR still PROVEN (mutation is advisory), exit 0
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Mutation analysis:/i);

  const proof = JSON.parse(
    fs.readFileSync(path.join(tempDir, "docs", "implementation", feature, "proof-of-compliance.json"), "utf8")
  );
  assert.ok(proof.summary.mutation !== null);
  // Weak stub doesn't catch 'true→false' mutation — detected should be 0
  assert.equal(proof.summary.mutation.detected, 0, "weak assertions must detect 0 mutations");
});

test("prove without --mutate produces no mutation data", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-mutate-off-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const feature = "mutate-off";
  writeApprovedSpec(tempDir, feature);
  writeTestsMd(tempDir, feature);
  const generatedDir = path.join(tempDir, "tests", feature, "generated");
  fs.mkdirSync(generatedDir, { recursive: true });
  const contractDir = path.join(tempDir, "src", "contracts");
  writeStrongContract(contractDir, "fr1_compute");
  writeStrongAssertionStub(generatedDir, "TC-1", "../../../src/contracts/fr1_compute.js", "fr1_compute");

  const result = runNode(["prove", "--feature", feature, "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 0);
  // No mutation output without --mutate flag
  assert.doesNotMatch(result.stdout, /Mutation analysis:/i);

  const proof = JSON.parse(
    fs.readFileSync(path.join(tempDir, "docs", "implementation", feature, "proof-of-compliance.json"), "utf8")
  );
  assert.equal(proof.summary.mutation, null, "no mutation data without --mutate flag");
});
