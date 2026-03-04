# Implementation Brief: US-1

Feature: audit-refactor
Story: As a Aitri CLI user: runs `aitri audit` to assess project health, I want layer 2 (code quality scan) and Layer 3 (dependency audit) must run on every `aitri audit` invocation, regardless of whether `--feature` is provided or AI is configured.
Trace: FR-1, AC-6

## 1. Feature Context
- Refactor `cli/commands/audit.js` to (a) remove direct `callAI` dependency and output agent prompts instead, (b) fix `collectSourceFiles` to scan the full project root instead of only `src/`, (c) ensure static audit layers (code quality, dependency) always run regardless of feature or AI config, and (d) support project-level audit without requiring `--feature`.
- Requirement source: provided explicitly by user (EVO-061, EVO-065 — Ultron test session 2026-03-03).
- No inferred requirements were added by Aitri.

## 2. Acceptance Criteria
- Given a project with no `package.json`, when `aitri audit` runs, then Layer 3 skips with a "(no package.

## 3. Test Cases to Satisfy
- TC-1: Validate us-1 primary behavior. (Trace FR: FR-1)
- TC-6: Handle edge behavior - Project has `src/` directory containing only contract stubs (`.js`) and real source is in `internal/` or `cmd/` (Go project) — scanner must reach both. (Trace FR: FR-1)
- TC-7: Handle edge behavior - Project has no `package.json` — Layer 3 (npm audit) must skip gracefully without error. (Trace FR: FR-1)
- TC-8: Enforce security control - `collectSourceFiles` directory walk must have depth and file count limits to prevent runaway scan on large monorepos (existing limits: depth 4, maxFiles 60 — preserve these). (Trace FR: FR-1)

## 4. Scaffold References
- Interface: src/contracts/fr-1-layer-2-code-quality-scan-and-la.js
- Test stub: tests/audit-refactor/generated/tc-1-validate-us-1-primary-behavior.test.mjs

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

