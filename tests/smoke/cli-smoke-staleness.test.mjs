// tests/smoke/cli-smoke-staleness.test.mjs
// EVO-044: Staleness detection — warn when pre-planning artifacts are newer than downstream
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

function prepareGoReady(tempDir, feature) {
  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["draft", "--feature", feature, "--idea", "staleness detection smoke test fixture", "--non-interactive", "--yes"], { cwd: tempDir });
  fs.writeFileSync(
    path.join(tempDir, "specs", "drafts", `${feature}.md`),
    `# AF-SPEC: ${feature}\n\nSTATUS: DRAFT\n\n## 1. Context\nStaleness test.\n\n## 2. Actors\n- Developer\n\n## 3. Functional Rules (traceable)\n- FR-1: System must detect stale context.\n\n## 4. Edge Cases\n- Arch changes after plan.\n\n## 7. Security Considerations\n- None.\n\n## 9. Acceptance Criteria\n- AC-1: Given stale arch, when build runs, then a warning is shown.\n`,
    "utf8"
  );
  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "aitri-staleness-smoke", private: true, scripts: { "test:aitri": "node -e \"process.exit(0)\"" } }, null, 2),
    "utf8"
  );
  runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  spawnSync("git", ["add", "-A"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "ready"], { cwd: tempDir, encoding: "utf8" });
  runNodeOk(["go", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
}

test("build warns when architecture-decision.md is newer than plan file", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-staleness-build-"));
  const feature = "stale-arch-build";
  prepareGoReady(tempDir, feature);

  // Plan file exists at this point. Now touch arch-decision AFTER plan was generated.
  const archPath = path.join(tempDir, ".aitri", "architecture-decision.md");
  fs.mkdirSync(path.join(tempDir, ".aitri"), { recursive: true });
  fs.writeFileSync(archPath, "# Architecture Decision\nUPDATED after plan — new microservices approach.\n", "utf8");

  const result = runNodeOk(["build", "--feature", feature, "--non-interactive", "--yes", "--no-verify"], { cwd: tempDir });
  assert.match(result.stdout, /WARN: Stale context detected/);
  assert.match(result.stdout, /architecture-decision\.md/);
  assert.match(result.stdout, /aitri plan.*--force/);
});

test("build does NOT warn when no pre-planning artifacts exist", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-staleness-clean-"));
  const feature = "no-arch-build";
  prepareGoReady(tempDir, feature);
  // No .aitri/architecture-decision.md — intentionally absent

  const result = runNodeOk(["build", "--feature", feature, "--non-interactive", "--yes", "--no-verify"], { cwd: tempDir });
  assert.doesNotMatch(result.stdout, /WARN: Stale context detected/);
});

test("build does NOT warn when pre-planning artifacts are older than plan file", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-staleness-fresh-"));
  const feature = "fresh-arch-build";
  prepareGoReady(tempDir, feature);

  // Write arch-decision AFTER plan was generated, but backdate its mtime to before the plan
  const planFile = path.join(tempDir, "docs", "plan", `${feature}.md`);
  const planMtime = fs.statSync(planFile).mtimeMs;
  const archPath = path.join(tempDir, ".aitri", "architecture-decision.md");
  fs.mkdirSync(path.join(tempDir, ".aitri"), { recursive: true });
  fs.writeFileSync(archPath, "# Architecture Decision\nEvent-driven monolith.\n", "utf8");
  // Set arch-decision mtime to 60 seconds BEFORE the plan — simulates arch being older
  const olderTime = new Date(planMtime - 60000);
  fs.utimesSync(archPath, olderTime, olderTime);

  const result = runNodeOk(["build", "--feature", feature, "--non-interactive", "--yes", "--no-verify"], { cwd: tempDir });
  assert.doesNotMatch(result.stdout, /WARN: Stale context detected/);
});

test("plan warns when re-run and pre-planning artifacts are newer than existing plan", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-staleness-plan-"));
  const feature = "stale-arch-plan";
  prepareGoReady(tempDir, feature);

  // Simulate arch change after plan was generated
  const archPath = path.join(tempDir, ".aitri", "architecture-decision.md");
  fs.mkdirSync(path.join(tempDir, ".aitri"), { recursive: true });
  fs.writeFileSync(archPath, "# Architecture Decision\nREVISED: switch to event sourcing.\n", "utf8");

  // Re-run plan — should warn and regenerate
  const result = runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes", "--force"], { cwd: tempDir });
  assert.match(result.stdout, /WARN: Stale context detected/);
  assert.match(result.stdout, /architecture-decision\.md/);
});
