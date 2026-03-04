# Implementation Brief: US-3

Feature: proof-integrity
Story: As a AI agent: generates contract implementations via `aitri contractgen`, I want `aitri contractgen` persona task output must include an explicit instruction against trivial contracts.
Trace: FR-3, AC-4

## 1. Feature Context
- Add detection of trivial contracts — contracts that always return `{ ok: true }` without reading any property of the `input` object — in `aitri prove`, `aitri audit`, and `contractgen` persona task output. A trivial contract makes proof-of-compliance structurally invalid: the test always passes regardless of the real system's behavior.
- Requirement source: provided explicitly by user (EVO-062 — Ultron test session 2026-03-03).
- No inferred requirements were added by Aitri.

## 2. Acceptance Criteria
- Given `aitri contractgen --feature <name>` runs, when the Developer persona task is printed, then the output explicitly states that contracts returning `ok: true` without reading `input` properties are invalid.

## 3. Test Cases to Satisfy
- TC-3: Validate us-3 primary behavior. (Trace FR: FR-3)

## 4. Scaffold References
- Interface: src/contracts/fr-3-aitri-contractgen-persona-task-o.js
- Test stub: tests/proof-integrity/generated/tc-3-validate-us-3-primary-behavior.test.mjs

## 5. Dependency Notes
- Order rationale: Implement after US-1, US-2
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

