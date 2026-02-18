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

function writeBuildDraft(tempDir, feature) {
  fs.writeFileSync(
    path.join(tempDir, "specs", "drafts", `${feature}.md`),
    `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
A CLI tool for building per-story implementation briefs.

## 2. Actors
- Developer
- QA engineer

## 3. Functional Rules (traceable)
- FR-1: The system must scaffold test stubs per story.
- FR-2: The system must generate implementation briefs per story.

## 4. Edge Cases
- Stories with zero test cases.

## 7. Security Considerations
- Restrict build output to project directory.

## 9. Acceptance Criteria
- AC-1: Given an approved spec, when build runs, then briefs are generated.
- AC-2: Given multiple stories, when build runs with --story, then only one brief is generated.
`,
    "utf8"
  );
}

function prepareGoReadyFeature(tempDir, feature) {
  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "Build command orchestration", "--non-interactive", "--yes"], { cwd: tempDir });
  writeBuildDraft(tempDir, feature);
  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    `{
  "name": "aitri-build-smoke",
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
}

test("build requires go.json gate", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-build-gate-"));
  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", "no-go", "--idea", "A gate test to verify build blocks without go approval", "--non-interactive", "--yes"], { cwd: tempDir });

  const result = runNode(["build", "--feature", "no-go", "--non-interactive", "--yes"], { cwd: tempDir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /BUILD BLOCKED/);
});

test("build without --story processes all stories", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-build-all-"));
  const feature = "build-all";
  prepareGoReadyFeature(tempDir, feature);

  const result = runNodeOk(["build", "--feature", feature, "--non-interactive", "--yes", "--no-verify"], { cwd: tempDir });
  assert.match(result.stdout, /Build complete/);

  const manifestFile = path.join(tempDir, "docs", "implementation", feature, "build-manifest.json");
  assert.ok(fs.existsSync(manifestFile), "build-manifest.json should exist");

  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.feature, feature);
  assert.ok(manifest.stories.length > 0, "should have at least one story result");

  const orderFile = path.join(tempDir, "docs", "implementation", feature, "IMPLEMENTATION_ORDER.md");
  assert.ok(fs.existsSync(orderFile), "IMPLEMENTATION_ORDER.md should exist");
});

test("build --story filters to single story", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-build-story-"));
  const feature = "build-story";
  prepareGoReadyFeature(tempDir, feature);

  const result = runNodeOk(["build", "--feature", feature, "--story", "US-1", "--non-interactive", "--yes", "--no-verify"], { cwd: tempDir });
  assert.match(result.stdout, /US-1/);
  assert.match(result.stdout, /Build complete/);

  const manifestFile = path.join(tempDir, "docs", "implementation", feature, "build-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  assert.equal(manifest.stories.length, 1);
  assert.equal(manifest.stories[0].id, "US-1");
});

test("status shows build_pending after go", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-build-status-"));
  const feature = "build-status";
  prepareGoReadyFeature(tempDir, feature);

  const status = JSON.parse(runNodeOk(["status", "--feature", feature, "--json"], { cwd: tempDir }).stdout);
  assert.equal(status.nextStep, "build_pending");
  assert.equal(status.recommendedCommand, "aitri build");
});

test("preview exits non-zero when no start command detected", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-smoke-preview-"));
  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const result = runNode(["preview"], { cwd: tempDir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /no start command detected/);
});
