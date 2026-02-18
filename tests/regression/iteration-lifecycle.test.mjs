import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "../smoke/helpers/cli-test-helpers.mjs";

function writeSpec(tempDir, dir, feature, status = "DRAFT") {
  fs.mkdirSync(path.join(tempDir, "specs", dir), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "specs", dir, `${feature}.md`),
    `# AF-SPEC: ${feature}\nSTATUS: ${status}\n\n## 3. Functional Rules (traceable)\n- FR-1: Core rule.\n\n## 10. Requirement Source Statement\n- User provided.\n`,
    "utf8"
  );
}

function writeDelivery(tempDir, feature, decision = "SHIP") {
  fs.mkdirSync(path.join(tempDir, "docs", "delivery"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "docs", "delivery", `${feature}.json`),
    JSON.stringify({ feature, decision, deliveredAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

test("features lists all features with correct states", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-features-list-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  writeSpec(tempDir, "drafts", "search-index", "DRAFT");
  writeSpec(tempDir, "approved", "payment-api", "APPROVED");
  writeSpec(tempDir, "approved", "user-auth", "APPROVED");
  writeDelivery(tempDir, "user-auth", "SHIP");

  const result = runNode(["features", "--json"], { cwd: tempDir });
  assert.equal(result.status, 0);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.features.length, 3);

  const draft = payload.features.find((f) => f.name === "search-index");
  assert.ok(draft, "search-index should be in list");
  assert.equal(draft.state, "draft");

  const approved = payload.features.find((f) => f.name === "payment-api");
  assert.ok(approved, "payment-api should be in list");
  assert.equal(approved.state, "approved");

  const delivered = payload.features.find((f) => f.name === "user-auth");
  assert.ok(delivered, "user-auth should be in list");
  assert.equal(delivered.state, "delivered");
  assert.equal(delivered.nextStep, null);

  assert.equal(payload.summary.total, 3);
  assert.equal(payload.summary.delivered, 1);
  assert.equal(payload.summary.draft, 1);
});

test("next suggests highest-priority undone feature from queue", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-next-queue-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  writeSpec(tempDir, "approved", "payment-api", "APPROVED");
  writeSpec(tempDir, "approved", "search-index", "APPROVED");

  fs.writeFileSync(
    path.join(tempDir, "docs", "project-queue.json"),
    JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      queue: [
        { feature: "search-index", priority: 1, addedAt: new Date().toISOString() },
        { feature: "payment-api", priority: 2, addedAt: new Date().toISOString() }
      ]
    }, null, 2),
    "utf8"
  );

  const result = runNode(["next", "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /search-index/);
});

test("next works without project-queue.json using filesystem discovery", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-next-no-queue-"));
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  writeSpec(tempDir, "drafts", "my-feature", "DRAFT");

  const result = runNode(["next", "--non-interactive"], { cwd: tempDir });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /my-feature/);
  assert.match(result.stdout, /draft/);
});
