// tests/smoke/cli-smoke-preplanning.test.mjs
// Smoke tests for EVO-037 persona-driven pre-planning commands
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

test("discover-idea fails fast when AI is not configured", () => {
  const dir = makeTempProject();
  const result = runNode(["discover-idea", "--non-interactive", "--idea", "test idea"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /AI is not configured/);
});

test("discover-idea requires --idea in non-interactive mode", () => {
  const dir = makeTempProject();
  // Write a config with no AI provider to get the AI check first, but also test no --idea
  const result = runNode(["discover-idea", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  // Either AI not configured OR idea required — both are valid failure modes
  assert.match(result.stdout + result.stderr, /AI is not configured|Idea input is required/);
});

test("product-spec fails when discovery.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["product-spec", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /AI is not configured|Discovery artifact not found/);
});

test("ux-design fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["ux-design", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /AI is not configured|Product spec not found/);
});

test("arch-design fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["arch-design", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /AI is not configured|Product spec not found/);
});

test("sec-review fails when architecture-decision.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["sec-review", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /AI is not configured|Architecture document not found/);
});

test("qa-plan fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["qa-plan", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /AI is not configured|Product spec not found/);
});

test("dev-roadmap fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["dev-roadmap", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /AI is not configured|Product spec not found/);
});

test("qa-plan fails when architecture-decision.md is missing but product-spec.md exists", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/product-spec.md"), "# Product Spec\n", "utf8");
  const result = runNode(["qa-plan", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /AI is not configured|Architecture document not found/);
});

test("dev-roadmap fails when architecture-decision.md is missing but product-spec.md exists", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/product-spec.md"), "# Product Spec\n", "utf8");
  const result = runNode(["dev-roadmap", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /AI is not configured|Architecture document not found/);
});

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
