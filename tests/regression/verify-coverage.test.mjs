import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "../smoke/helpers/cli-test-helpers.mjs";
import { checkContractCoverage } from "../../cli/commands/verify-coverage.js";

// --- Unit tests for checkContractCoverage ---

test("checkContractCoverage: returns ok when no contracts exist", () => {
  const result = checkContractCoverage({ root: "/any", manifest: {} });
  assert.equal(result.ok, true);
  assert.equal(result.total, 0);
});

test("checkContractCoverage: returns ok when all contracts are imported in stubs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-cov-pass-"));
  const contractPath = "src/contracts/fr-1-validate-input.js";
  const testPath = "tests/feature/generated/tc-1-test.test.mjs";

  fs.mkdirSync(path.join(tempDir, "src", "contracts"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", "feature", "generated"), { recursive: true });

  fs.writeFileSync(path.join(tempDir, contractPath), "export function fr_1_validate_input() {}", "utf8");
  fs.writeFileSync(
    path.join(tempDir, testPath),
    `import { fr_1_validate_input } from "../../../src/contracts/fr-1-validate-input.js";\n`,
    "utf8"
  );

  const result = checkContractCoverage({
    root: tempDir,
    manifest: { interfaceFiles: [contractPath], testFiles: [testPath] }
  });
  assert.equal(result.ok, true);
  assert.equal(result.total, 1);
  assert.equal(result.covered, 1);
  assert.deepEqual(result.uncovered, []);
});

test("checkContractCoverage: returns fail when a contract is not imported", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-cov-fail-"));
  const contractPath = "src/contracts/fr-2-send-email.js";
  const testPath = "tests/feature/generated/tc-1-test.test.mjs";

  fs.mkdirSync(path.join(tempDir, "src", "contracts"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", "feature", "generated"), { recursive: true });

  fs.writeFileSync(path.join(tempDir, contractPath), "export function fr_2_send_email() {}", "utf8");
  fs.writeFileSync(
    path.join(tempDir, testPath),
    `// stub with no imports\nimport test from "node:test";\n`,
    "utf8"
  );

  const result = checkContractCoverage({
    root: tempDir,
    manifest: { interfaceFiles: [contractPath], testFiles: [testPath] }
  });
  assert.equal(result.ok, false);
  assert.equal(result.total, 1);
  assert.equal(result.covered, 0);
  assert.ok(result.uncovered.includes(contractPath));
});

test("checkContractCoverage: partial — some covered, some not", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-cov-partial-"));
  const contract1 = "src/contracts/fr-1-validate.js";
  const contract2 = "src/contracts/fr-2-persist.js";
  const testPath = "tests/feature/generated/tc-1-test.test.mjs";

  fs.mkdirSync(path.join(tempDir, "src", "contracts"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", "feature", "generated"), { recursive: true });

  fs.writeFileSync(path.join(tempDir, contract1), "", "utf8");
  fs.writeFileSync(path.join(tempDir, contract2), "", "utf8");
  // Only imports contract1
  fs.writeFileSync(
    path.join(tempDir, testPath),
    `import { fr_1_validate } from "../../../src/contracts/fr-1-validate.js";\n`,
    "utf8"
  );

  const result = checkContractCoverage({
    root: tempDir,
    manifest: { interfaceFiles: [contract1, contract2], testFiles: [testPath] }
  });
  assert.equal(result.ok, false);
  assert.equal(result.total, 2);
  assert.equal(result.covered, 1);
  assert.ok(result.uncovered.includes(contract2));
  assert.ok(!result.uncovered.includes(contract1));
});

// --- CLI integration tests ---

test("verify-coverage CLI: fails when scaffold manifest not found", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-vc-nomanifest-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  // Create an approved spec so feature can be resolved
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", "feature-x.md"),
    "# AF-SPEC: feature-x\nSTATUS: APPROVED\n",
    "utf8"
  );

  const result = runNode(
    ["verify-coverage", "--feature", "feature-x", "--json"],
    { cwd: tempDir }
  );
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.ok(payload.issues.some((i) => /manifest/i.test(i)));
});

test("verify-coverage CLI: passes when all contracts are imported", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-vc-pass-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const feature = "feature-y";
  const contractPath = "src/contracts/fr-1-validate.js";
  const testPath = `tests/${feature}/generated/tc-1-test.test.mjs`;

  fs.mkdirSync(path.join(tempDir, "src", "contracts"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", feature, "generated"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, contractPath), "", "utf8");
  fs.writeFileSync(
    path.join(tempDir, testPath),
    `import { fr_1_validate } from "../../../src/contracts/fr-1-validate.js";\n`,
    "utf8"
  );

  // Write manifest
  const implDir = path.join(tempDir, "docs", "implementation", feature);
  fs.mkdirSync(implDir, { recursive: true });
  fs.writeFileSync(
    path.join(implDir, "scaffold-manifest.json"),
    JSON.stringify({ interfaceFiles: [contractPath], testFiles: [testPath] }),
    "utf8"
  );

  const result = runNode(
    ["verify-coverage", "--feature", feature, "--json"],
    { cwd: tempDir }
  );
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.covered, 1);
  assert.equal(payload.total, 1);
});

// EVO-091: per-TC execution regression test
test("verify reports per-TC pass/fail instead of binary suite result", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-per-tc-"));
  const feature = "per-tc-coverage";

  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests", feature, "generated"), { recursive: true });

  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}\nSTATUS: APPROVED\n## 3. Functional Rules (traceable)\n- FR-1: Rule one.\n- FR-2: Rule two.\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(tempDir, "tests", feature, "tests.md"),
    `# Test Cases\n### TC-1\n- Trace: FR-1\n### TC-2\n- Trace: FR-2\n`,
    "utf8"
  );
  // TC-1: passes individually
  fs.writeFileSync(
    path.join(tempDir, "tests", feature, "generated", "TC-1.test.mjs"),
    `import test from "node:test";\nimport assert from "node:assert/strict";\n// TC-1: FR-1\ntest("TC-1", () => { assert.ok(true); });\n`,
    "utf8"
  );
  // TC-2: fails individually
  fs.writeFileSync(
    path.join(tempDir, "tests", feature, "generated", "TC-2.test.mjs"),
    `import test from "node:test";\nimport assert from "node:assert/strict";\n// TC-2: FR-2\ntest("TC-2", () => { assert.fail("not implemented"); });\n`,
    "utf8"
  );
  // Overall suite always passes (old binary behavior would mark both TCs as passing)
  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    `{"name":"per-tc","private":true,"scripts":{"test:aitri":"node -e \\"process.exit(0)\\""}}\n`,
    "utf8"
  );

  const result = runNodeOk(["verify", "--feature", feature, "--json"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.ok, true, "overall suite passes");
  assert.equal(payload.tcCoverage.mode, "scaffold");
  assert.equal(payload.tcCoverage.passing, 1, "only TC-1 should pass");
  assert.equal(payload.tcCoverage.failing, 1, "TC-2 should fail");
  assert.ok(payload.frCoverage.uncovered.includes("FR-2"), "FR-2 uncovered because TC-2 fails");
  assert.ok(!payload.frCoverage.uncovered.includes("FR-1"), "FR-1 covered by passing TC-1");
});
