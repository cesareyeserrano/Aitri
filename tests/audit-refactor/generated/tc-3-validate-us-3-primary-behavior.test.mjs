// TC-3: Validate us-3 primary behavior
// Acceptance Criteria: AC-4, AC-5
// AC-4: Given a project with AI configured, when `aitri audit` runs, then Layer 4 outputs persona system prompts and task descriptions for each applicable persona instead of calling any external API.
// AC-5: Given `aitri audit --feature <name>` with an approved spec, when audit runs, then Layer 1 pipeline findings appear before Layer 2–4 output, and Layer 4 prompt includes the feature spec as context.
import { fr_3_layer_4_llm_review_must_be_refactored_to_outp } from "../../../src/contracts/fr-3-layer-4-llm-review-must-be-refac.js";
import test from "node:test";
import assert from "node:assert/strict";

test("tc_3_validate_us_3_primary_behavior", () => {
  // TODO: Validate these acceptance criteria:
  // AC-4: Given a project with AI configured, when `aitri audit` runs, then Layer 4 outputs persona system prompts and task descriptions for each applicable persona instead of calling any external API.
// AC-5: Given `aitri audit --feature <name>` with an approved spec, when audit runs, then Layer 1 pipeline findings appear before Layer 2–4 output, and Layer 4 prompt includes the feature spec as context.
  assert.fail("Not implemented: TC-3 — Validate us-3 primary behavior");
});
