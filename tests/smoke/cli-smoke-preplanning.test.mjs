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
  assert.match(result.stdout + result.stderr, /Artifact not found:.*discovery\.md/);
});

test("ux-design fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["ux-design", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Artifact not found:.*product-spec\.md/);
});

test("arch-design fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["arch-design", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Artifact not found:.*product-spec\.md/);
});

test("sec-review fails when architecture-decision.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["sec-review", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Artifact not found:.*architecture-decision\.md/);
});

test("qa-plan fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["qa-plan", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Artifact not found:.*product-spec\.md/);
});

test("dev-roadmap fails when product-spec.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["dev-roadmap", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Artifact not found:.*product-spec\.md/);
});

test("qa-plan fails when architecture-decision.md is missing but product-spec.md exists", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/product-spec.md"), "# Product Spec\n", "utf8");
  const result = runNode(["qa-plan", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Artifact not found:.*architecture-decision\.md/);
});

test("dev-roadmap fails when architecture-decision.md is missing but product-spec.md exists", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/product-spec.md"), "# Product Spec\n", "utf8");
  const result = runNode(["dev-roadmap", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Artifact not found:.*architecture-decision\.md/);
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

// --- EVO-097: Fase 1 commands ---

test("design requires --idea in non-interactive mode", () => {
  const dir = makeTempProject();
  const result = runNode(["design", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Idea input is required/);
});

test("design outputs all 7 persona prompts and task block", () => {
  const dir = makeTempProject();
  const result = runNodeOk(["design", "--non-interactive", "--idea", "build a task tracker"], { cwd: dir });
  const out = result.stdout + result.stderr;
  assert.match(out, /Design Session/);
  assert.match(out, /System Prompts/);
  assert.match(out, /design\.md/);
  assert.match(out, /aitri design-review/);
});

test("design --profile mvp includes mvp preamble for security and qa", () => {
  const dir = makeTempProject();
  const result = runNodeOk(["design", "--non-interactive", "--idea", "simple CRUD", "--profile", "mvp"], { cwd: dir });
  const out = result.stdout + result.stderr;
  assert.match(out, /PROFILE: mvp/);
});

test("design --profile invalid returns error", () => {
  const dir = makeTempProject();
  const result = runNode(["design", "--non-interactive", "--idea", "test", "--profile", "superstrict"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Invalid --profile/);
});

test("design non-interactive fails with --force hint when design.md exists", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/design.md"), "# Design\nexisting\n", "utf8");
  const result = runNode(["design", "--non-interactive", "--idea", "test"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Use --force to regenerate/);
});

test("design-review fails when design.md is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["design-review", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Artifact not found:.*design\.md/);
});

test("design-review --non-interactive auto-approves and writes design-review.json", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/design.md"), "# Design\nProfile: strict\nSome content.\n", "utf8");
  const result = runNodeOk(["design-review", "--non-interactive"], { cwd: dir });
  const out = result.stdout + result.stderr;
  assert.match(out, /approved/i);
  assert.ok(fs.existsSync(path.join(dir, ".aitri/design-review.json")));
  const marker = JSON.parse(fs.readFileSync(path.join(dir, ".aitri/design-review.json"), "utf8"));
  assert.equal(marker.ok, true);
  assert.ok(marker.approvedAt);
});

test("design-review detects mvp profile from design.md", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/design.md"), "# Design\nProfile: mvp\nSome content.\n", "utf8");
  runNodeOk(["design-review", "--non-interactive"], { cwd: dir });
  const marker = JSON.parse(fs.readFileSync(path.join(dir, ".aitri/design-review.json"), "utf8"));
  assert.equal(marker.profile, "mvp");
});

// --- EVO-097: spec-from-design ---

test("spec-from-design fails when design-review.json is missing", () => {
  const dir = makeTempProject();
  const result = runNode(["spec-from-design", "--non-interactive", "--feature", "my-feat"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Artifact not found:.*design-review\.json/);
});

test("spec-from-design fails when design-review.json has ok:false", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/design-review.json"), JSON.stringify({ ok: false, approvedAt: null }), "utf8");
  const result = runNode(["spec-from-design", "--non-interactive", "--feature", "my-feat"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /not approved/i);
});

test("spec-from-design fails when design.md is missing after review approval", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/design-review.json"), JSON.stringify({ ok: true, approvedAt: "2026-01-01T00:00:00Z", profile: "strict" }), "utf8");
  const result = runNode(["spec-from-design", "--non-interactive", "--feature", "my-feat"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Artifact not found:.*design\.md/);
});

test("spec-from-design requires --feature", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/design-review.json"), JSON.stringify({ ok: true, approvedAt: "2026-01-01T00:00:00Z", profile: "strict" }), "utf8");
  fs.writeFileSync(path.join(dir, ".aitri/design.md"), "# Design\nSome content\n", "utf8");
  const result = runNode(["spec-from-design", "--non-interactive"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Feature name required/);
});

test("spec-from-design outputs Spec Engineer task when prerequisites met", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/design-review.json"), JSON.stringify({ ok: true, approvedAt: "2026-01-01T00:00:00Z", profile: "strict" }), "utf8");
  fs.writeFileSync(path.join(dir, ".aitri/design.md"), "# Design\nProfile: strict\nSome content.\n", "utf8");
  const result = runNodeOk(["spec-from-design", "--non-interactive", "--feature", "my-feat"], { cwd: dir });
  const out = result.stdout + result.stderr;
  assert.match(out, /AGENT TASK: spec-from-design/);
  assert.match(out, /Spec Engineer/);
  assert.match(out, /LOGIC_GAP/);
  assert.match(out, /dependency-graph/);
});

test("spec-from-design --check reports missing spec as error", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/design-review.json"), JSON.stringify({ ok: true, approvedAt: "2026-01-01T00:00:00Z", profile: "strict" }), "utf8");
  fs.writeFileSync(path.join(dir, ".aitri/design.md"), "# Design\n", "utf8");
  const result = runNode(["spec-from-design", "--check", "--non-interactive", "--feature", "my-feat"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /CHECK FAILED/);
});

test("spec-from-design --check passes when spec and dep-graph are valid", () => {
  const dir = makeTempProject();
  fs.writeFileSync(path.join(dir, ".aitri/design-review.json"), JSON.stringify({ ok: true, approvedAt: "2026-01-01T00:00:00Z", profile: "strict" }), "utf8");
  fs.writeFileSync(path.join(dir, ".aitri/design.md"), "# Design\n", "utf8");
  // Write valid spec (no LOGIC_GAPs)
  const specsDir = path.join(dir, "specs", "approved");
  fs.mkdirSync(specsDir, { recursive: true });
  fs.writeFileSync(path.join(specsDir, "my-feat.md"), "# AF-SPEC: my-feat\nSTATUS: APPROVED\n## 1. Context\n", "utf8");
  // Write valid dep-graph (no cycles)
  const depGraph = { feature: "my-feat", generated: "2026-01-01T00:00:00Z", nodes: [{ id: "US-1", depends_on: [], fr: [] }], global_interfaces: [], global_interface_consumers: {}, execution_order: ["US-1"] };
  fs.writeFileSync(path.join(dir, ".aitri/dependency-graph.json"), JSON.stringify(depGraph), "utf8");
  const result = runNodeOk(["spec-from-design", "--check", "--non-interactive", "--feature", "my-feat"], { cwd: dir });
  assert.match(result.stdout + result.stderr, /check passed/i);
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

test("help output includes Fase 1 commands", () => {
  const result = runNodeOk(["help"]);
  assert.match(result.stdout, /design/);
  assert.match(result.stdout, /design-review/);
  assert.match(result.stdout, /Fase 1/);
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
