# Implementation Brief: US-3

Feature: audit-refactor
Story: As a AI agent (Claude Code / Codex): executes LLM analysis prompted by audit output, I want layer 4 (LLM review) must be refactored to output persona system prompt + analysis task for the agent to execute — it must not call `callAI` directly.
Trace: FR-3, AC-4, AC-5

## 1. Feature Context
- Refactor `cli/commands/audit.js` to (a) remove direct `callAI` dependency and output agent prompts instead, (b) fix `collectSourceFiles` to scan the full project root instead of only `src/`, (c) ensure static audit layers (code quality, dependency) always run regardless of feature or AI config, and (d) support project-level audit without requiring `--feature`.
- Requirement source: provided explicitly by user (EVO-061, EVO-065 — Ultron test session 2026-03-03).
- No inferred requirements were added by Aitri.

## 2. Acceptance Criteria
- Given a project with AI configured, when `aitri audit` runs, then Layer 4 outputs persona system prompts and task descriptions for each applicable persona instead of calling any external API.
- Given `aitri audit --feature <name>` with an approved spec, when audit runs, then Layer 1 pipeline findings appear before Layer 2–4 output, and Layer 4 prompt includes the feature spec as context.

## 3. Test Cases to Satisfy
- TC-3: Validate us-3 primary behavior. (Trace FR: FR-3)

## 4. Scaffold References
- Interface: src/contracts/fr-3-layer-4-llm-review-must-be-refac.js
- Test stub: tests/audit-refactor/generated/tc-3-validate-us-3-primary-behavior.test.mjs

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

