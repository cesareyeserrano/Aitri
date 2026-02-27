// tests/smoke/cli-smoke-semantic-context.test.mjs
// EVO-042: Verify pre-planning context is injected into pipeline artifacts (no LLM needed)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";

const ARCH_MARKER = "ARCH-MARKER-microservices-event-driven";

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
  runNodeOk(["draft", "--feature", feature, "--idea", "semantic context injection test", "--non-interactive", "--yes"], { cwd: tempDir });
  fs.writeFileSync(
    path.join(tempDir, "specs", "drafts", `${feature}.md`),
    `# AF-SPEC: ${feature}\n\nSTATUS: DRAFT\n\n## 1. Context\nSemantic test.\n\n## 2. Actors\n- Developer\n\n## 3. Functional Rules (traceable)\n- FR-1: System must inject arch context into briefs.\n\n## 4. Edge Cases\n- No arch context.\n\n## 7. Security Considerations\n- Restrict output to project dir.\n\n## 9. Acceptance Criteria\n- AC-1: Given approved spec, when build runs, then brief contains arch context.\n`,
    "utf8"
  );
  runNodeOk(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["discover", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk(["plan", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "aitri-semantic-smoke", private: true, scripts: { "test:aitri": "node -e \"process.exit(0)\"" } }, null, 2),
    "utf8"
  );
  runNodeOk(["verify", "--feature", feature, "--non-interactive", "--json"], { cwd: tempDir });
  spawnSync("git", ["add", "-A"], { cwd: tempDir, encoding: "utf8" });
  spawnSync("git", ["commit", "-m", "ready"], { cwd: tempDir, encoding: "utf8" });
  runNodeOk(["go", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
}

test("build injects architecture-decision context into implementation briefs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-semantic-arch-"));
  const feature = "semantic-arch";
  prepareGoReady(tempDir, feature);

  fs.mkdirSync(path.join(tempDir, ".aitri"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, ".aitri", "architecture-decision.md"),
    `# Architecture Decision\n${ARCH_MARKER}\nUse event-driven microservices pattern.\n`,
    "utf8"
  );

  const result = runNodeOk(["build", "--feature", feature, "--non-interactive", "--yes", "--no-verify"], { cwd: tempDir });
  assert.match(result.stdout, /Build complete/);

  const implDir = path.join(tempDir, "docs", "implementation", feature);
  const briefs = fs.readdirSync(implDir).filter(f => /^US-\d+\.md$/.test(f));
  assert.ok(briefs.length > 0, "at least one brief should exist");

  const content = fs.readFileSync(path.join(implDir, briefs[0]), "utf8");
  assert.ok(
    content.includes("Architecture Decision Context") && content.includes(ARCH_MARKER),
    `Brief must contain arch context. Got:\n${content.slice(0, 400)}`
  );
});

test("build omits architecture context when .aitri/architecture-decision.md is absent", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-semantic-no-arch-"));
  const feature = "semantic-no-arch";
  prepareGoReady(tempDir, feature);
  // No .aitri/architecture-decision.md — intentionally absent

  const result = runNodeOk(["build", "--feature", feature, "--non-interactive", "--yes", "--no-verify"], { cwd: tempDir });
  assert.match(result.stdout, /Build complete/);

  const implDir = path.join(tempDir, "docs", "implementation", feature);
  const briefs = fs.readdirSync(implDir).filter(f => /^US-\d+\.md$/.test(f));
  assert.ok(briefs.length > 0, "at least one brief should exist");

  const content = fs.readFileSync(path.join(implDir, briefs[0]), "utf8");
  assert.ok(
    !content.includes("Architecture Decision Context"),
    "Brief must NOT contain arch context when artifact is absent"
  );
});
