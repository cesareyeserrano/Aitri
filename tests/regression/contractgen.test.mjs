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

function writePlaceholderContract(dir, frId, fnName) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${frId.toLowerCase()}-must-compute-the-result-correctl.js`),
    `/**\n * ${frId}: Must compute the result correctly.\n */\nexport async function ${fnName}(input) {\n  void input;\n  throw new Error("Not implemented: ${frId}");\n}\n`,
    "utf8"
  );
}

function writeImplementedContract(dir, frId, fnName) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${frId.toLowerCase()}-must-compute-the-result-correctl.js`),
    `export async function ${fnName}(input) {\n  return { result: input };\n}\n`,
    "utf8"
  );
}

test("contractgen fails fast when approved spec is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-cgen-no-spec-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const result = runNode(["contractgen", "--feature", "ghost-feature", "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Approved spec not found/);
});

test("contractgen outputs agent task without AI config", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-cgen-no-ai-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const feature = "no-ai-cgen";
  writeApprovedSpec(tempDir, feature);
  // Write placeholder contract so there is something to output
  const contractDir = path.join(tempDir, "src", "contracts");
  writePlaceholderContract(contractDir, "FR-1", "fr1_must_compute_the_result_correctl");
  // No ai config needed — contractgen outputs agent task prompt
  const result = runNode(["contractgen", "--feature", feature, "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /AGENT TASK/);
});

test("contractgen skips already-implemented contracts", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-cgen-skip-impl-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const feature = "skip-impl-cgen";
  writeApprovedSpec(tempDir, feature);

  // Write a real (non-placeholder) contract
  const contractDir = path.join(tempDir, "src", "contracts");
  writeImplementedContract(contractDir, "FR-1", "fr1_must_compute_the_result_correctl");

  const result = runNode(["contractgen", "--feature", feature, "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /already implemented/i);
});

test("contractgen reports missing contract file when scaffold was not run", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-cgen-no-contract-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const feature = "no-contract-file";
  writeApprovedSpec(tempDir, feature);

  const result = runNode(["contractgen", "--feature", feature, "--non-interactive"], { cwd: tempDir });
  // Exits 0 (0 tasks) but reports skipped + message about running scaffold
  assert.equal(result.status, 0);
  assert.match(result.stdout, /run aitri build/i);
});

test("contractgen --fr filters to a specific FR", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-cgen-fr-filter-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  const feature = "fr-filter-cgen";
  writeApprovedSpec(tempDir, feature);

  // Ask for a non-existent FR
  const result = runNode(["contractgen", "--feature", feature, "--fr", "FR-99", "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FR not found/i);
});
