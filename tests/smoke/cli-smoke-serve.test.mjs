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

function writeMinimalSpec(tempDir, feature) {
  fs.mkdirSync(path.join(tempDir, "specs", "approved"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "specs", "approved", `${feature}.md`),
    `# AF-SPEC: ${feature}\n\nSTATUS: APPROVED\n\n## 1. Context\nLocal preview tool.\n\n## 2. Actors\n- Developer\n\n## 3. Functional Rules (traceable)\n- FR-1: The system must start a dev server.\n\n## 9. Acceptance Criteria\n- AC-1: Given build exists, when serve runs, then server starts.\n`,
    "utf8"
  );
}

function writeBuildManifest(tempDir, feature) {
  const implDir = path.join(tempDir, "docs", "implementation", feature);
  fs.mkdirSync(implDir, { recursive: true });
  fs.writeFileSync(
    path.join(implDir, "build-manifest.json"),
    JSON.stringify({ feature, stories: [], buildAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function writeProofOfCompliance(tempDir, feature) {
  const implDir = path.join(tempDir, "docs", "implementation", feature);
  fs.mkdirSync(implDir, { recursive: true });
  fs.writeFileSync(
    path.join(implDir, "proof-of-compliance.json"),
    JSON.stringify({ ok: true, feature, frProof: {}, tcResults: {} }, null, 2),
    "utf8"
  );
}

test("serve blocks with error when build not ready", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-serve-no-build-"));
  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const feature = "serve-no-build";
  writeMinimalSpec(tempDir, feature);

  const result = runNode(["serve", "--feature", feature, "--non-interactive", "--dry-run"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /build not found|Build not found/i);
});

test("serve shows QA warning when build exists but prove not passed", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-serve-no-prove-"));
  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const feature = "serve-no-prove";
  writeMinimalSpec(tempDir, feature);
  writeBuildManifest(tempDir, feature);

  // Write a package.json so Node stack is detected
  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "serve-no-prove", scripts: { start: "node index.js" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "index.js"), "// app\n", "utf8");

  const result = runNodeOk(["serve", "--feature", feature, "--non-interactive", "--dry-run"], { cwd: tempDir });
  assert.match(result.stdout, /QA not passed/i);
  assert.match(result.stdout, /npm start|node index\.js/i);
});

test("serve dry-run succeeds when build and prove are both ready", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-serve-proven-"));
  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const feature = "serve-proven";
  writeMinimalSpec(tempDir, feature);
  writeBuildManifest(tempDir, feature);
  writeProofOfCompliance(tempDir, feature);

  // Node stack: package.json with dev script
  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "serve-proven", scripts: { dev: "node server.js" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "server.js"), "// server\n", "utf8");

  const result = runNodeOk(["serve", "--feature", feature, "--non-interactive", "--dry-run"], { cwd: tempDir });
  assert.doesNotMatch(result.stdout, /QA not passed/i);
  assert.match(result.stdout, /npm run dev/i);
  assert.match(result.stdout, /localhost/i);
});

test("serve --json reports stack, command, and url", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-serve-json-"));
  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const feature = "serve-json";
  writeMinimalSpec(tempDir, feature);
  writeBuildManifest(tempDir, feature);
  writeProofOfCompliance(tempDir, feature);

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "serve-json", scripts: { start: "node app.js" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "app.js"), "// app\n", "utf8");

  const result = runNodeOk(["serve", "--feature", feature, "--non-interactive", "--json", "--dry-run"], { cwd: tempDir });
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.stack, "node");
  assert.match(payload.command, /npm start/);
  assert.match(payload.url, /localhost/);
  assert.equal(payload.qaWarning, null);
});

test("serve --entry overrides auto-detected start command", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-serve-entry-"));
  setupGit(tempDir);
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const feature = "serve-entry";
  writeMinimalSpec(tempDir, feature);
  writeBuildManifest(tempDir, feature);
  writeProofOfCompliance(tempDir, feature);

  // No package.json scripts — should use --entry
  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "serve-entry" }, null, 2),
    "utf8"
  );

  const result = runNodeOk(
    ["serve", "--feature", feature, "--entry", "node custom-server.js", "--non-interactive", "--dry-run"],
    { cwd: tempDir }
  );
  assert.match(result.stdout, /node custom-server\.js/i);
});
