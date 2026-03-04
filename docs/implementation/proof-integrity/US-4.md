# Implementation Brief: US-4

Feature: proof-integrity
Story: As a Aitri CLI user: runs `aitri prove` and `aitri audit` to verify feature delivery, I want `aitri prove` must display `trivial_contract` FRs distinctly in its output — separate from `proven` and `unproven`.
Trace: FR-4, AC-5

## 1. Feature Context
- Add detection of trivial contracts — contracts that always return `{ ok: true }` without reading any property of the `input` object — in `aitri prove`, `aitri audit`, and `contractgen` persona task output. A trivial contract makes proof-of-compliance structurally invalid: the test always passes regardless of the real system's behavior.
- Requirement source: provided explicitly by user (EVO-062 — Ultron test session 2026-03-03).
- No inferred requirements were added by Aitri.

## 2. Acceptance Criteria
- Given `aitri prove` completes with trivial contracts present, when output is displayed, then trivial contract FRs appear under a distinct `[TRIVIAL CONTRACT]` label separate from proven/unproven sections.

## 3. Test Cases to Satisfy
- TC-4: Validate us-4 primary behavior. (Trace FR: FR-4)

## 4. Scaffold References
- Interface: src/contracts/fr-4-aitri-prove-must-display-trivial.js
- Test stub: tests/proof-integrity/generated/tc-4-validate-us-4-primary-behavior.test.mjs

## 5. Dependency Notes
- Order rationale: Implement after US-1, US-2, US-3
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

