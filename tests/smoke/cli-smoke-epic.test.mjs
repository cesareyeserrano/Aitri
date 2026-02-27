// tests/smoke/cli-smoke-epic.test.mjs
// EVO-041: Smoke tests for epic commands (no LLM required)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "./helpers/cli-test-helpers.mjs";

function makeTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-epic-"));
  fs.mkdirSync(path.join(dir, ".aitri"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "aitri.config.json"),
    JSON.stringify({ project: "test-epic" }),
    "utf8"
  );
  return dir;
}

// --- epic create ---

test("epic create requires --name", () => {
  const dir = makeTempProject();
  const result = runNode(["epic", "create", "--features", "feat-a"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Epic name required/);
});

test("epic create requires --features", () => {
  const dir = makeTempProject();
  const result = runNode(["epic", "create", "--name", "my-epic"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Features required/);
});

test("epic create rejects non-kebab-case name", () => {
  const dir = makeTempProject();
  const result = runNode(["epic", "create", "--name", "My Epic!", "--features", "feat-a"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /kebab-case/);
});

test("epic create writes epic JSON with correct structure", () => {
  const dir = makeTempProject();
  const result = runNodeOk(["epic", "create", "--name", "user-auth", "--features", "login,logout,refresh-token"], { cwd: dir });
  assert.match(result.stdout, /Epic "user-auth" created/);

  const epicFile = path.join(dir, "docs", "epics", "user-auth.json");
  assert.ok(fs.existsSync(epicFile), "epic JSON file must exist");

  const epic = JSON.parse(fs.readFileSync(epicFile, "utf8"));
  assert.equal(epic.schemaVersion, 1);
  assert.equal(epic.name, "user-auth");
  assert.deepEqual(epic.features, ["login", "logout", "refresh-token"]);
  assert.ok(epic.createdAt, "createdAt must be present");
  assert.ok(epic.progressSummary, "progressSummary must be present");
  assert.equal(epic.progressSummary.total, 3);
});

test("epic create fails when epic already exists without --force", () => {
  const dir = makeTempProject();
  runNodeOk(["epic", "create", "--name", "my-epic", "--features", "feat-a"], { cwd: dir });
  const result = runNode(["epic", "create", "--name", "my-epic", "--features", "feat-b"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /already exists.*--force/);
});

test("epic create --force overwrites existing epic", () => {
  const dir = makeTempProject();
  runNodeOk(["epic", "create", "--name", "my-epic", "--features", "feat-a"], { cwd: dir });
  runNodeOk(["epic", "create", "--name", "my-epic", "--features", "feat-b,feat-c", "--force"], { cwd: dir });

  const epic = JSON.parse(fs.readFileSync(path.join(dir, "docs", "epics", "my-epic.json"), "utf8"));
  assert.deepEqual(epic.features, ["feat-b", "feat-c"]);
});

// --- epic status ---

test("epic status lists no epics when none created", () => {
  const dir = makeTempProject();
  const result = runNodeOk(["epic", "status"], { cwd: dir });
  assert.match(result.stdout, /No epics found/);
});

test("epic status lists all epics when no --name given", () => {
  const dir = makeTempProject();
  runNodeOk(["epic", "create", "--name", "auth-epic", "--features", "login,logout"], { cwd: dir });
  runNodeOk(["epic", "create", "--name", "payments-epic", "--features", "checkout,refund"], { cwd: dir });
  const result = runNodeOk(["epic", "status"], { cwd: dir });
  assert.match(result.stdout, /auth-epic/);
  assert.match(result.stdout, /payments-epic/);
});

test("epic status --name shows specific epic details", () => {
  const dir = makeTempProject();
  runNodeOk(["epic", "create", "--name", "auth-epic", "--features", "login,logout"], { cwd: dir });
  const result = runNodeOk(["epic", "status", "--name", "auth-epic"], { cwd: dir });
  assert.match(result.stdout, /Epic: auth-epic/);
  assert.match(result.stdout, /login/);
  assert.match(result.stdout, /logout/);
});

test("epic status --name fails for unknown epic", () => {
  const dir = makeTempProject();
  const result = runNode(["epic", "status", "--name", "nonexistent"], { cwd: dir });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /not found/);
});

test("epic status --json returns machine-readable output", () => {
  const dir = makeTempProject();
  runNodeOk(["epic", "create", "--name", "my-epic", "--features", "feat-a,feat-b"], { cwd: dir });
  const result = runNodeOk(["epic", "status", "--name", "my-epic", "--json"], { cwd: dir });
  const json = JSON.parse(result.stdout);
  assert.ok(json.ok);
  assert.equal(json.epic.name, "my-epic");
  assert.ok(Array.isArray(json.features));
  assert.equal(json.features.length, 2);
});

// --- aitri status --epic <name> ---

test("aitri status --epic shows epic feature table", () => {
  const dir = makeTempProject();
  runNodeOk(["epic", "create", "--name", "auth-epic", "--features", "login,logout"], { cwd: dir });
  const result = runNodeOk(["status", "--epic", "auth-epic"], { cwd: dir });
  assert.match(result.stdout, /auth-epic/);
  assert.match(result.stdout, /login/);
});

// --- help includes epic ---

test("help output includes epic commands", () => {
  const result = runNodeOk(["help"]);
  assert.match(result.stdout, /epic/);
  assert.match(result.stdout, /Epics/);
});

// --- resume --json includes activeEpic and epicProgress fields ---

test("resume --json includes activeEpic and epicProgress fields (null when no feature in progress)", () => {
  const dir = makeTempProject();
  const result = runNodeOk(["resume", "--json"], { cwd: dir });
  const json = JSON.parse(result.stdout);
  assert.ok("activeEpic" in json, "activeEpic field must be present in resume JSON");
  assert.ok("epicProgress" in json, "epicProgress field must be present in resume JSON");
});
