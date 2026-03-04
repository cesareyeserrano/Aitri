# Implementation Brief: US-2

Feature: proof-integrity
Story: As a Aitri CLI user: runs `aitri prove` and `aitri audit` to verify feature delivery, I want `aitri audit` Layer 1 (pipeline compliance) must flag trivial contracts as `HIGH` findings.
Trace: FR-2, AC-1, AC-3

## 1. Feature Context
- Add detection of trivial contracts — contracts that always return `{ ok: true }` without reading any property of the `input` object — in `aitri prove`, `aitri audit`, and `contractgen` persona task output. A trivial contract makes proof-of-compliance structurally invalid: the test always passes regardless of the real system's behavior.
- Requirement source: provided explicitly by user (EVO-062 — Ultron test session 2026-03-03).
- No inferred requirements were added by Aitri.

## 2. Acceptance Criteria
- Given a contract that contains `return { ok: true, fr: "FR-1", input }` without any `input.` property access, when `aitri prove --feature <name>` runs, then that FR appears as `trivial_contract` and proof `ok` is `false`.
- Given a proof record with a `trivial_contract` entry, when `aitri audit --feature <name>` runs, then a `[HIGH]` finding appears for that contract.

## 3. Test Cases to Satisfy
- TC-2: Validate us-2 primary behavior. (Trace FR: FR-2)

## 4. Scaffold References
- Interface: src/contracts/fr-2-aitri-audit-layer-1-pipeline-com.js
- Test stub: tests/proof-integrity/generated/tc-2-validate-us-2-primary-behavior.test.mjs

## 5. Dependency Notes
- Order rationale: Implement after US-1
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

