# Adopt Verify-Spec — Spec-to-Code Alignment

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

## Context

This project was adopted into Aitri via `aitri adopt`. The spec in `01_REQUIREMENTS.json` was
generated from existing code. Some requirements may be aspirational — describing what the code
*should* do rather than what it *actually* does today.

Your task is to write minimal test stubs that verify whether the existing code already satisfies
each uncovered acceptance criterion. These are not full tests — they are hypotheses.

**Test framework detected:** {{TEST_FRAMEWORK}}

---

## Uncovered AC items by FR

The following MUST requirements have no test cases (or have test cases that don't cover every AC).
For each AC item, write a minimal failing stub that will pass once the code satisfies it.

{{UNCOVERED_FRS}}

---

## Instructions

### 1. Write minimal stubs in the project's test files

For each AC item above, write the **smallest test that clearly fails if the code doesn't satisfy it**.

- Use the project's existing test framework and conventions ({{TEST_FRAMEWORK}})
- Name each test starting with the TC id: `TestTC021_...` / `test_TC021_...` / `it('TC-021: ...')`
- Do not write implementation tests — write spec verification stubs
- If an existing test already covers an AC item, make that coverage land as a PASSING result — not just a note. Either (a) **rename the existing test to start with the TC id** (`TestTC021_…` / `test_TC021_…` / `it('TC-021: …')`) so `verify-run` maps its pass to this TC, OR (b) mark the stub `"automation": "manual"` and, after `verify-run`, record it with `aitri tc verify <TC-ID> --result pass --evidence <path-to-the-existing-test-or-its-output>`. Marking `"status": "verified"` on the entry alone is a note the runner ignores — without (a) or (b) the result is `skip` and the AC reads as uncovered (it blocks the pipeline).
- Add `// @aitri-tc TC-XXX` marker above each test for assertion density tracking

### 2. Update `{{ARTIFACTS_PATH}}/03_TEST_CASES.json`

Append stub TC entries to the `test_cases` array. Use this schema for each stub:

```json
{
  "id": "TC-0NN",
  "requirement_id": "FR-XXX",
  "ac_id": "FR-XXX-AC-N",
  "title": "short description of the AC being verified",
  "description": "what this stub tests",
  "type": "unit",
  "status": "open",
  "stub": true,
  "test_hint": "what to check — specific field, value, behavior"
}
```

Set `"status": "verified"` (not `"open"`) for an AC an existing test already covers — AND make it land as a pass via (a) or (b) above, otherwise `verify-run` records it `skip` (uncovered).
Use `"stub": true` for all entries created by this command.

IDs: continue from the highest existing TC-NNN in the file.

### 3. Call `aitri adopt verify-spec --complete`

After writing stubs and updating `03_TEST_CASES.json`, call:

```
aitri adopt verify-spec --complete
```

This validates the stubs were added and updates the pipeline baseline.

### 4. Run `aitri verify-run` to execute the stubs

After `verify-spec --complete`, run `aitri verify-run` to execute the test suite.
Stubs that fail are expected — they mark spec gaps. `aitri verify-complete` will then
let you acknowledge each gap or fix the code.

---

## What NOT to do

- Do NOT write comprehensive tests — write minimal stubs only
- Do NOT implement the features to make stubs pass — test first, implement later
- Do NOT modify existing test cases — only append new stub entries
- Do NOT skip the `verify-spec --complete` call — it registers the stubs in the pipeline
