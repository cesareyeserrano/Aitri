import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runNode, runNodeOk } from "../smoke/helpers/cli-test-helpers.mjs";

test("draft guided non-interactive does not auto-infer stack or requirements", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-regression-guided-no-infer-"));
  const feature = "guided-no-infer";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });
  runNodeOk([
    "draft",
    "--guided",
    "--feature", feature,
    "--idea", "Build a web dashboard in React for support metrics",
    "--non-interactive",
    "--yes"
  ], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  const content = fs.readFileSync(draftFile, "utf8");
  assert.match(content, /Summary \(provided by user\):/);
  assert.match(content, /Requirement source: provided explicitly by user via --idea/);
  assert.match(content, /No inferred requirements were added by Aitri/);
  assert.doesNotMatch(content, /Aitri suggestion \(auto-applied\)/);
  assert.doesNotMatch(content, /Technology source:/);
});

test("approve blocks inferred requirement markers", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitri-regression-approve-inferred-"));
  const feature = "approve-inferred";
  runNodeOk(["init", "--non-interactive", "--yes"], { cwd: tempDir });

  const draftFile = path.join(tempDir, "specs", "drafts", `${feature}.md`);
  fs.mkdirSync(path.dirname(draftFile), { recursive: true });
  fs.writeFileSync(draftFile, `# AF-SPEC: ${feature}

STATUS: DRAFT

## 1. Context
User provided context.
Technology source: Aitri suggestion (auto-applied)

## 2. Actors
- Support agent

## 3. Functional Rules (traceable)
- FR-1: The system must render dashboard widgets from user-selected metrics.

## 4. Edge Cases
- Widget configuration is empty on first load.

## 5. Failure Conditions
- Data provider returns timeout.

## 6. Non-Functional Requirements
- p95 dashboard response under 600ms.

## 7. Security Considerations
- Restrict dashboard access to authenticated support users.

## 8. Out of Scope
- Billing and payment analytics.

## 9. Acceptance Criteria
- AC-1: Given an authenticated support agent, when dashboard is opened, then selected metrics are shown.
`, "utf8");

  const result = runNode(["approve", "--feature", feature, "--non-interactive", "--yes"], { cwd: tempDir });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Requirements source integrity/);
});
