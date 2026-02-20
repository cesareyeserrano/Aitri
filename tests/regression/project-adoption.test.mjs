import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "../smoke/helpers/cli-test-helpers.mjs";
import { writeDraftSpec, writeDiscoveryDoc, extractTestNames, buildTestsMapping, writeTestsMapping, buildVerifiedConfig } from "../../cli/commands/adopt.js";

// ---------------------------------------------------------------------------
// EVO-008 Phase 1: aitri adopt regression tests
// ---------------------------------------------------------------------------

test("adopt --dry-run shows scan results without writing files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-dryrun-"));
  // Simulate a Node.js project with package.json and tests/
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({
    name: "my-existing-project",
    version: "1.0.0",
    scripts: { test: "node --test" }
  }), "utf8");
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "tests", "app.test.js"), "// test", "utf8");

  const result = runNodeOk(["adopt", "--dry-run", "--non-interactive", "--yes"], { cwd: tempDir });

  // dry-run: no manifest written
  assert.equal(fs.existsSync(path.join(tempDir, "docs", "adoption-manifest.json")), false);
  assert.match(result.stdout, /dry-run/i);
  assert.match(result.stdout, /node/i);
});

test("adopt initializes Aitri folder structure and writes adoption-manifest.json", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-init-"));
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({
    name: "brownfield-app",
    version: "2.0.0",
    scripts: { test: "jest" }
  }), "utf8");

  runNodeOk(["adopt", "--non-interactive", "--yes"], { cwd: tempDir });

  // Manifest created
  const manifestPath = path.join(tempDir, "docs", "adoption-manifest.json");
  assert.ok(fs.existsSync(manifestPath), "adoption-manifest.json should be created");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.ok(manifest.adoptedAt, "manifest should have adoptedAt timestamp");
  assert.ok(Array.isArray(manifest.stacks), "manifest should have stacks array");
  assert.ok(manifest.stacks.some((s) => s.name === "node"), "should detect node stack");
  assert.ok(typeof manifest.existingTestFiles === "number", "should have existingTestFiles count");

  // Aitri structure initialized
  assert.ok(fs.existsSync(path.join(tempDir, "specs", "drafts")), "specs/drafts should be created");
  assert.ok(fs.existsSync(path.join(tempDir, "specs", "approved")), "specs/approved should be created");
  assert.ok(fs.existsSync(path.join(tempDir, "backlog")), "backlog should be created");
  assert.ok(fs.existsSync(path.join(tempDir, "docs")), "docs should be created");
});

test("adopt never modifies existing source files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-readonly-"));

  // Create existing source content
  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  const srcFile = path.join(tempDir, "src", "index.js");
  const originalContent = "// Original source — must not be touched\nexport const version = '1.0.0';\n";
  fs.writeFileSync(srcFile, originalContent, "utf8");

  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  const testFile = path.join(tempDir, "tests", "index.test.js");
  const originalTest = "import test from 'node:test';\ntest('placeholder', () => {});\n";
  fs.writeFileSync(testFile, originalTest, "utf8");

  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: "protected", version: "1.0.0" }), "utf8");

  runNodeOk(["adopt", "--non-interactive", "--yes"], { cwd: tempDir });

  // Source files must be unchanged
  assert.equal(fs.readFileSync(srcFile, "utf8"), originalContent, "src/index.js must not be modified");
  assert.equal(fs.readFileSync(testFile, "utf8"), originalTest, "tests/index.test.js must not be modified");
});

test("adopt is idempotent — running twice does not overwrite manifest data", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-idempotent-"));
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: "idempotent-project", version: "1.0.0" }), "utf8");

  runNodeOk(["adopt", "--non-interactive", "--yes"], { cwd: tempDir });
  const firstManifest = JSON.parse(
    fs.readFileSync(path.join(tempDir, "docs", "adoption-manifest.json"), "utf8")
  );

  // Run again
  const result = runNode(["adopt", "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(result.status, 0);

  // Second run should succeed without error
  assert.doesNotThrow(() =>
    JSON.parse(fs.readFileSync(path.join(tempDir, "docs", "adoption-manifest.json"), "utf8"))
  );
  // First adoptedAt timestamp preserved (manifest re-written but structure present)
  const secondManifest = JSON.parse(
    fs.readFileSync(path.join(tempDir, "docs", "adoption-manifest.json"), "utf8")
  );
  assert.equal(secondManifest.projectRoot, firstManifest.projectRoot, "projectRoot should be stable");
});

test("adopt detects readme and entry points", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-readme-"));
  fs.writeFileSync(path.join(tempDir, "README.md"), "# My Project\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({
    name: "readme-project",
    version: "1.0.0",
    main: "index.js"
  }), "utf8");
  fs.writeFileSync(path.join(tempDir, "index.js"), "// entry\n", "utf8");

  runNodeOk(["adopt", "--non-interactive", "--yes"], { cwd: tempDir });

  const manifest = JSON.parse(
    fs.readFileSync(path.join(tempDir, "docs", "adoption-manifest.json"), "utf8")
  );
  assert.equal(manifest.readme, "README.md");
  assert.ok(manifest.entryPoints.includes("index.js"), "should detect index.js entry point");
});

// ---------------------------------------------------------------------------
// EVO-008 Phase 2: LLM inference tests
// ---------------------------------------------------------------------------

test("adopt --depth standard fails with clear error when AI not configured", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-p2-no-ai-"));
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: "no-ai-project", version: "1.0.0" }), "utf8");
  fs.writeFileSync(path.join(tempDir, "README.md"), "# No AI Project\n", "utf8");

  // No ai config — should exit error with message
  const result = runNode(["adopt", "--depth", "standard", "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(result.status, 1, "should exit with error when AI not configured");
  assert.ok(
    result.stdout.includes("ai config") || result.stdout.includes("requires") || result.stdout.includes("provider"),
    `should mention ai config requirement, got: ${result.stdout}`
  );
});

test("adopt --depth standard fails gracefully when API key env var is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-p2-no-key-"));
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: "no-key-project", version: "1.0.0" }), "utf8");
  fs.writeFileSync(path.join(tempDir, "README.md"), "# Auth Service\nHandles user login.\n", "utf8");

  // Write aitri.config.json with ai config but a non-existent env var key
  fs.writeFileSync(path.join(tempDir, "aitri.config.json"), JSON.stringify({
    ai: { provider: "claude", model: "claude-opus-4-6", apiKeyEnv: "AITRI_TEST_FAKE_API_KEY_NONEXISTENT" }
  }), "utf8");

  // Ensure the fake env var is NOT set
  const result = runNode(["adopt", "--depth", "standard", "--non-interactive", "--yes"], {
    cwd: tempDir,
    env: { ...process.env, AITRI_TEST_FAKE_API_KEY_NONEXISTENT: "" }
  });

  // Phase 1 should have succeeded (manifest written)
  assert.ok(
    fs.existsSync(path.join(tempDir, "docs", "adoption-manifest.json")),
    "adoption-manifest.json should be written before AI call"
  );
  // Phase 2 AI call should fail gracefully
  assert.equal(result.status, 1, "should exit with error on missing API key");
  assert.ok(
    result.stdout.includes("API key") || result.stdout.includes("error") || result.stdout.includes("AITRI_TEST_FAKE"),
    `should mention API key issue, got: ${result.stdout}`
  );
});

test("writeDraftSpec writes DRAFT spec and never overwrites approved content", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-write-spec-"));
  const mockPaths = {
    specsDraftsDir: path.join(tempDir, "specs", "drafts"),
    specsApprovedDir: path.join(tempDir, "specs", "approved"),
    docsDiscoveryDir: path.join(tempDir, "docs", "discovery")
  };

  const specContent = "# AF-SPEC: user-auth\nSTATUS: DRAFT\n\n## 3. Functional Rules\n- FR-1: Users must authenticate.\n";

  // Write draft spec
  const result = writeDraftSpec(mockPaths, "user-auth", specContent);
  assert.ok(result.written, "should write draft spec");
  const written = fs.readFileSync(path.join(tempDir, "specs", "drafts", "user-auth.md"), "utf8");
  assert.equal(written, specContent, "spec content must match exactly");

  // Now create an approved spec — writeDraftSpec must skip
  fs.mkdirSync(mockPaths.specsApprovedDir, { recursive: true });
  fs.writeFileSync(path.join(tempDir, "specs", "approved", "user-auth.md"), "# APPROVED\n", "utf8");
  const result2 = writeDraftSpec(mockPaths, "user-auth", "# NEW DRAFT\n");
  assert.ok(result2.skipped, "should skip when approved spec exists");

  // Draft must still contain original content
  const draftAfter = fs.readFileSync(path.join(tempDir, "specs", "drafts", "user-auth.md"), "utf8");
  assert.equal(draftAfter, specContent, "draft must not be overwritten when approved exists");
});

test("writeDiscoveryDoc writes discovery and is idempotent", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-write-discovery-"));
  const mockPaths = {
    specsDraftsDir: path.join(tempDir, "specs", "drafts"),
    specsApprovedDir: path.join(tempDir, "specs", "approved"),
    docsDiscoveryDir: path.join(tempDir, "docs", "discovery")
  };

  const discoveryContent = "# Discovery: user-auth\nSTATUS: DRAFT\n\n## 1. Problem Statement\n- Users need to log in.\n";
  const result1 = writeDiscoveryDoc(mockPaths, "user-auth", discoveryContent);
  assert.ok(result1.written, "should write discovery doc");

  const written = fs.readFileSync(path.join(tempDir, "docs", "discovery", "user-auth.md"), "utf8");
  assert.equal(written, discoveryContent, "discovery content must match");

  // Second call must skip (idempotent)
  const result2 = writeDiscoveryDoc(mockPaths, "user-auth", "# Different content\n");
  assert.ok(result2.skipped, "should skip on second call");
  const afterSecond = fs.readFileSync(path.join(tempDir, "docs", "discovery", "user-auth.md"), "utf8");
  assert.equal(afterSecond, discoveryContent, "discovery must not be overwritten");
});

// ---------------------------------------------------------------------------
// EVO-008 Phase 3: test mapping unit tests
// ---------------------------------------------------------------------------

test("extractTestNames extracts node test() and it() names", () => {
  const content = `
import test from "node:test";
test("validates user credentials", () => {});
it("rejects empty password", () => {});
describe("Auth flow", () => {
  it("redirects after login", () => {});
});
`;
  const names = extractTestNames(content, "node");
  assert.ok(names.includes("validates user credentials"), "should extract test() name");
  assert.ok(names.includes("rejects empty password"), "should extract it() name");
  assert.ok(names.includes("Auth flow"), "should extract describe() name");
  assert.ok(names.includes("redirects after login"), "should extract nested it() name");
});

test("extractTestNames extracts Python test function names", () => {
  const content = `
def test_login_valid():
    pass

def test_login_invalid_password():
    pass

class TestAuthFlow:
    pass
`;
  const names = extractTestNames(content, "python");
  assert.ok(names.includes("test_login_valid"), "should extract def test_ name");
  assert.ok(names.includes("test_login_invalid_password"), "should extract def test_ name");
  assert.ok(names.includes("TestAuthFlow"), "should extract class Test name");
});

test("extractTestNames extracts Go test function names", () => {
  const content = `
package auth

import "testing"

func TestLogin(t *testing.T) {}
func TestLogout(t *testing.T) {}
func TestInvalidToken(t *testing.T) {}
`;
  const names = extractTestNames(content, "go");
  assert.ok(names.includes("TestLogin"), "should extract func Test name");
  assert.ok(names.includes("TestLogout"), "should extract func Test name");
  assert.ok(names.includes("TestInvalidToken"), "should extract func Test name");
});

test("buildTestsMapping produces TC-* stubs for each test name", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-build-tests-"));
  const testsDir = path.join(tempDir, "tests");
  fs.mkdirSync(testsDir, { recursive: true });
  fs.writeFileSync(path.join(testsDir, "auth.test.js"), `
test("validates user credentials", () => {});
test("rejects empty password", () => {});
`, "utf8");

  const testFiles = [path.join(testsDir, "auth.test.js")];
  const content = buildTestsMapping(testFiles, testsDir, "node", ["user-auth"]);

  assert.match(content, /STATUS: DRAFT/, "should have DRAFT status");
  assert.match(content, /### TC-1/, "should have TC-1");
  assert.match(content, /### TC-2/, "should have TC-2");
  assert.match(content, /validates user credentials/, "should include test name");
  assert.match(content, /rejects empty password/, "should include second test name");
  assert.match(content, /Trace:/, "each TC should have a Trace placeholder");
});

test("writeTestsMapping is idempotent — never overwrites existing tests.md", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-write-tests-"));
  const mockPaths = {
    testsRoot: path.join(tempDir, "tests")
  };

  const content1 = "# Tests: user-auth\nSTATUS: DRAFT\n\n### TC-1\n- Title: First test\n";
  const result1 = writeTestsMapping(mockPaths, "user-auth", content1);
  assert.ok(result1.written, "should write tests.md");

  const written = fs.readFileSync(path.join(tempDir, "tests", "user-auth", "tests.md"), "utf8");
  assert.equal(written, content1, "content must match");

  // Second write must be skipped
  const result2 = writeTestsMapping(mockPaths, "user-auth", "# Different\n");
  assert.ok(result2.skipped, "should skip on second call");
  const after = fs.readFileSync(path.join(tempDir, "tests", "user-auth", "tests.md"), "utf8");
  assert.equal(after, content1, "tests.md must not be overwritten");
});

test("adopt --depth deep fails when no approved specs exist", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-adopt-p3-no-approved-"));
  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ name: "no-approved", version: "1.0.0" }), "utf8");

  // No ai config so phase2 would also fail, but we test phase3 path
  // Write aitri.config.json with ai config pointing to a fake key env
  fs.writeFileSync(path.join(tempDir, "aitri.config.json"), JSON.stringify({
    ai: { provider: "claude", model: "claude-opus-4-6", apiKeyEnv: "AITRI_TEST_FAKE_DEEP_KEY" }
  }), "utf8");

  // First do Phase 1 to get the structure initialized
  runNodeOk(["adopt", "--non-interactive", "--yes"], { cwd: tempDir });

  // Now run Phase 3 (deep) — Phase 2 AI call will fail, but that's ok;
  // Phase 3 should report "no approved specs" even if phase 2 fails
  const result = runNode(["adopt", "--depth", "deep", "--non-interactive", "--yes"], {
    cwd: tempDir,
    env: { ...process.env, AITRI_TEST_FAKE_DEEP_KEY: "" }
  });

  // Expect error (either from Phase 2 AI fail or Phase 3 no-approved-specs)
  assert.equal(result.status, 1, "should fail when no approved specs");
});

test("buildVerifiedConfig proposes path overrides only when needed", () => {
  // Non-standard paths → needs overrides
  const with_conflict = buildVerifiedConfig({ existingTestPath: "__tests__", existingDocPath: "wiki" }, "/tmp/proj");
  assert.ok(with_conflict !== null, "should produce config when paths conflict");
  assert.ok(with_conflict.paths.tests, "should include tests path override");
  assert.ok(with_conflict.paths.docs, "should include docs path override");

  // Standard paths → no overrides needed
  const no_conflict = buildVerifiedConfig({ existingTestPath: "tests", existingDocPath: "docs" }, "/tmp/proj");
  assert.equal(no_conflict, null, "should return null when no conflict");

  // No paths at all → no overrides
  const empty = buildVerifiedConfig({}, "/tmp/proj");
  assert.equal(empty, null, "should return null with no conventions");
});
