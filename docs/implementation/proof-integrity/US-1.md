# Implementation Brief: US-1

Feature: proof-integrity
Story: As a Aitri CLI user: runs `aitri prove` and `aitri audit` to verify feature delivery, I want `aitri prove` must detect contracts that return `{ ok: true }` without reading any property from the `input` parameter and mark those FRs as `trivial_contract` in the proof record.
Trace: FR-1, AC-1

## 1. Feature Context
- Add detection of trivial contracts — contracts that always return `{ ok: true }` without reading any property of the `input` object — in `aitri prove`, `aitri audit`, and `contractgen` persona task output. A trivial contract makes proof-of-compliance structurally invalid: the test always passes regardless of the real system's behavior.
- Requirement source: provided explicitly by user (EVO-062 — Ultron test session 2026-03-03).
- No inferred requirements were added by Aitri.

## 2. Acceptance Criteria
- Given a contract that contains `return { ok: true, fr: "FR-1", input }` without any `input.` property access, when `aitri prove --feature <name>` runs, then that FR appears as `trivial_contract` and proof `ok` is `false`.

## 3. Test Cases to Satisfy
- TC-1: Validate us-1 primary behavior. (Trace FR: FR-1)
- TC-5: Handle edge behavior - Contract reads `input` but only to pass it through (e.g., `return { ok: true, fr: "FR-1", input }`) — must still be flagged as trivial (passing `input` whole is not verifying a property). (Trace FR: FR-1)
- TC-6: Handle edge behavior - Contract conditionally returns `ok: true` based on `input.someProperty` — must NOT be flagged as trivial. (Trace FR: FR-1)
- TC-7: Enforce security control - Contract file content is read and regex-tested only — no execution during heuristic check. (Trace FR: FR-1)

## 4. Scaffold References
- Interface: src/contracts/fr-1-aitri-prove-must-detect-contract.js
- Test stub: tests/proof-integrity/generated/tc-1-validate-us-1-primary-behavior.test.mjs

## 5. Dependency Notes
- Order rationale: No previous story dependency
- Plan sequence hint: -
- Plan dependency hint: -

## 6. Quality Constraints
- Domain profile: CLI/Automation (cli)
- Stack constraint: Use structured command modules and formatted terminal output (for example chalk/ora or equivalent patterns).
- Forbidden defaults: Unstructured raw console output as final UX baseline.
- Non-negotiable: keep FR traceability comments in interfaces and TC markers in tests.

## 8. Available Assets in Project
The following asset files were found in the project. Use these instead of generating new ones:
- assets/aitri-avatar.png

