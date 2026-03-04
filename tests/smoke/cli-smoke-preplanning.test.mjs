// tests/smoke/cli-smoke-preplanning.test.mjs
// Smoke tests for EVO-037 persona-driven pre-planning commands
// NOTE: After architectural refactor, pre-planning commands do NOT call AI.
// They output persona system prompt + task for the agent to execute.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";

function makeTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-preplanning-"));
  fs.mkdirSync(path.join(dir, ".aitri"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "aitri.config.json"),
    JSON.stringify({ project: "test-preplanning" }),
    "utf8"
  );
  return dir;
}

// --- Prerequisite guard tests ---

test("discover-idea requires --idea in non-interactive mode", () => {
  const dir = makeTempProject();
  const result = runNode(["discover-idea", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Idea input is required/);
});

test("product-spec fails when discovery.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["product-spec", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Discovery artifact not found/);
});

test("ux-design fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["ux-design", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Product spec not found/);
});

test("arch-design fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["arch-design", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Product spec not found/);
});

test("sec-review fails when architecture-decision.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["sec-review", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Architecture document not found/);
});

test("qa-plan fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["qa-plan", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Product spec not found/);
});

test("dev-roadmap fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["dev-roadmap", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Product spec not found/);
});

test("qa-plan fails when architecture-decision.md is missing but product-spec.md exists", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/product-spec.md"), "# Product Spec\n", "utf8");
  const result = runNode(["qa-plan", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Architecture document not found/);
});

test("dev-roadmap fails when architecture-decision.md is missing but product-spec.md exists", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/product-spec.md"), "# Product Spec\n", "utf8");
  const result = runNode(["dev-roadmap", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Architecture document not found/);
});

// --- Agent-prompt output tests ---

test("discover-idea outputs persona system prompt and task for agent", () => {
  const dir = makeTempProject();
  const result = runNodeOk(["discover-idea", "--non-interactive", "--idea", "build a task manager"], { cwd: dir });
  const out = result.stdout + result.stderr;
  assert.match(out, /Persona System Prompt/);
  assert.match(out, /Task/);
  assert.match(out, /discovery\.md/);
  assert.match(out, /aitri product-spec/);
});

test("product-spec outputs persona prompt when discovery.md exists", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/discovery.md"), "# Discovery\nSome raw idea.\n", "utf8");
  const result = runNodeOk(["product-spec", "--non-interactive"], { cwd: dir });
  const out = result.stdout + result.stderr;
  assert.match(out, /Persona System Prompt/);
  assert.match(out, /product-spec\.md/);
});

// --- Help output ---

test("help output includes pre-planning commands", () => {
  const result = runNodeOk(["help"]);
  assert.match(result.stdout, /discover-idea/);
  assert.match(result.stdout, /product-spec/);
  assert.match(result.stdout, /ux-design/);
  assert.match(result.stdout, /arch-design/);
  assert.match(result.stdout, /sec-review/);
  assert.match(result.stdout, /qa-plan/);
  assert.match(result.stdout, /dev-roadmap/);
  assert.match(result.stdout, /Pre-Planning/);
});

// --- EVO-039: --force guard tests ---

test("discover-idea non-interactive fails with --force hint when artifact exists", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/discovery.md"), "# Discovery\nexisting content\n", "utf8");
  const result = runNode(["discover-idea", "--non-interactive", "--idea", "test idea"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Use --force to regenerate/);
});

test("discover-idea --force bypasses existing artifact guard and outputs prompt", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/discovery.md"), "# Discovery\nexisting content\n", "utf8");
  // With --force, guard is bypassed and command succeeds — outputs persona prompt for agent
  const result = runNodeOk(["discover-idea", "--non-interactive", "--force", "--idea", "test idea"], { cwd: dir });
  const out = result.stdout + result.stderr;
  assert.doesNotMatch(out, /Use --force to regenerate/);
  assert.match(out, /Persona System Prompt/);
});

test("dev-roadmap non-interactive fails with --force hint when artifact exists", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/product-spec.md"), "# Product Spec\n", "utf8");
  fs.writeFileSync(path.join(dir, ".aitri/architecture-decision.md"), "# Arch\n", "utf8");
  fs.writeFileSync(path.join(dir, ".aitri/dev-roadmap.md"), "# Dev Roadmap\nexisting\n", "utf8");
  const result = runNode(["dev-roadmap", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Use --force to regenerate/);
});
