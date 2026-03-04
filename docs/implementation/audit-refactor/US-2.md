# Implementation Brief: US-2

Feature: audit-refactor
Story: As a Aitri CLI user: runs `aitri audit` to assess project health, I want `collectSourceFiles` must always walk from the project root and include all subdirectories, treating `src/` as one of many directories — not as the exclusive root.
Trace: FR-2, AC-1

## 1. Feature Context
- Refactor `cli/commands/audit.js` to (a) remove direct `callAI` dependency and output agent prompts instead, (b) fix `collectSourceFiles` to scan the full project root instead of only `src/`, (c) ensure static audit layers (code quality, dependency) always run regardless of feature or AI config, and (d) support project-level audit without requiring `--feature`.
- Requirement source: provided explicitly by user (EVO-061, EVO-065 — Ultron test session 2026-03-03).
- No inferred requirements were added by Aitri.

## 2. Acceptance Criteria
- Given a project where `src/` exists but contains only `.js` files and Go source lives in `internal/`, when `aitri audit` runs, then `collectSourceFiles` includes files from `internal/` in addition to `src/`.

## 3. Test Cases to Satisfy
- TC-2: Validate us-2 primary behavior. (Trace FR: FR-2)

## 4. Scaffold References
- Interface: src/contracts/fr-2-collectsourcefiles-must-always-w.js
- Test stub: tests/audit-refactor/generated/tc-2-validate-us-2-primary-behavior.test.mjs

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

