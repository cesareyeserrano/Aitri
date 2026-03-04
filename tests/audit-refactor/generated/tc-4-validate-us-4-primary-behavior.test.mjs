// TC-4: Validate us-4 primary behavior
// Acceptance Criteria: AC-3
// AC-3: Given a project with no `--feature` argument, when `aitri audit` runs, then the output includes "pipeline compliance skipped" and Layer 2 + Layer 3 findings are shown.
import { fr_4_aitri_audit_without_feature_must_run_layer_2_ } from "../../../src/contracts/fr-4-aitri-audit-without-feature-must.js";
import test from "node:test";
import assert from "node:assert/strict";

test("tc_4_validate_us_4_primary_behavior", () => {
  // TODO: Validate these acceptance criteria:
  // AC-3: Given a project with no `--feature` argument, when `aitri audit` runs, then the output includes "pipeline compliance skipped" and Layer 2 + Layer 3 findings are shown.
  assert.fail("Not implemented: TC-4 — Validate us-4 primary behavior");
});
