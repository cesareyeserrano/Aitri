# Implementation Brief: US-5

Feature: audit-refactor
Story: As a Aitri CLI user: runs `aitri audit` to assess project health, I want `aitri audit --feature <name>` must continue to run all 4 layers, with Layer 1 scoped to the named feature and Layers 2–4 scoped to the full project.
Trace: FR-5, AC-5

## 1. Feature Context
- Refactor `cli/commands/audit.js` to (a) remove direct `callAI` dependency and output agent prompts instead, (b) fix `collectSourceFiles` to scan the full project root instead of only `src/`, (c) ensure static audit layers (code quality, dependency) always run regardless of feature or AI config, and (d) support project-level audit without requiring `--feature`.
- Requirement source: provided explicitly by user (EVO-061, EVO-065 — Ultron test session 2026-03-03).
- No inferred requirements were added by Aitri.

## 2. Acceptance Criteria
- Given `aitri audit --feature <name>` with an approved spec, when audit runs, then Layer 1 pipeline findings appear before Layer 2–4 output, and Layer 4 prompt includes the feature spec as context.

## 3. Test Cases to Satisfy
- TC-5: Validate us-5 primary behavior. (Trace FR: FR-5)

## 4. Scaffold References
- Interface: src/contracts/fr-5-aitri-audit-feature-name-must-co.js
- Test stub: tests/audit-refactor/generated/tc-5-validate-us-5-primary-behavior.test.mjs

## 5. Dependency Notes
- Order rationale: Implement after US-1, US-2, US-3, US-4
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

