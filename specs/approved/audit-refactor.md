# AF-SPEC: audit-refactor

STATUS: APPROVED
Tech Stack: Node.js (ESM)

## 1. Context
Refactor `cli/commands/audit.js` to (a) remove direct `callAI` dependency and output agent prompts instead, (b) fix `collectSourceFiles` to scan the full project root instead of only `src/`, (c) ensure static audit layers (code quality, dependency) always run regardless of feature or AI config, and (d) support project-level audit without requiring `--feature`.
Requirement source: provided explicitly by user (EVO-061, EVO-065 — Ultron test session 2026-03-03).
No inferred requirements were added by Aitri.

---

## 2. Actors
- Aitri CLI user: runs `aitri audit` to assess project health
- AI agent (Claude Code / Codex): executes LLM analysis prompted by audit output

## 3. Functional Rules (traceable)

- FR-1: Layer 2 (code quality scan) and Layer 3 (dependency audit) must run on every `aitri audit` invocation, regardless of whether `--feature` is provided or AI is configured.
  - Currently blocked by `codeOnlyMode` logic that gates execution on `hasAiConfig`
- FR-2: `collectSourceFiles` must always walk from the project root and include all subdirectories, treating `src/` as one of many directories — not as the exclusive root.
  - Must exclude: `node_modules`, `dist`, `build`, `.git`, `.gocache`, vendor directories
  - Must not assume `src/` is the code root when `src/` only contains Aitri contract stubs
  - Existing depth (4) and file count (60) limits must be preserved
- FR-3: Layer 4 (LLM review) must be refactored to output persona system prompt + analysis task for the agent to execute — it must not call `callAI` directly.
  - Output format: same pattern as pre-planning commands (persona header + task + instructions)
  - Personas: architect (technical review), security (spec drift), developer (implementation quality), ux-ui (conditional on `.aitri/ux-design.md`)
  - Each persona's prompt must be printed separately with a clear section header
  - In `--json` mode, Layer 4 must be skipped entirely (JSON output must remain machine-parseable)
- FR-4: `aitri audit` without `--feature` must run Layer 2 + Layer 3 + Layer 4 prompt output across the full project.
  - Layer 1 (pipeline compliance) is skipped when no `--feature` is provided
  - Output must clearly state "Project-level audit — no feature selected (pipeline compliance skipped)"
- FR-5: `aitri audit --feature <name>` must continue to run all 4 layers, with Layer 1 scoped to the named feature and Layers 2–4 scoped to the full project.
  - Layer 4 prompt includes the feature spec as optional context

## 4. Edge Cases
- Project has `src/` directory containing only contract stubs (`.js`) and real source is in `internal/` or `cmd/` (Go project) — scanner must reach both
- Project has no `package.json` — Layer 3 (npm audit) must skip gracefully without error
- Project has no source files matching any extension — Layer 2 returns empty findings, does not error
- `--no-ai` flag: Layer 4 prompt output is skipped entirely, other layers still run

## 5. Failure Conditions
- If Layer 4 prompt output fails to load a persona file, it must log a warning per persona and continue with remaining personas — not abort the full audit
- If `collectSourceFiles` finds 0 files, Layer 2 returns empty findings and logs "(no source files found)"

## 6. Non-Functional Requirements
- All existing tests in `audit.test.*` must pass after refactor
- The change must not break `aitri audit --feature <name> --no-ai` (pure static mode)
- Layer 4 output must be clearly separated from Layer 1–3 findings in the report

## 7. Security Considerations
- `collectSourceFiles` directory walk must have depth and file count limits to prevent runaway scan on large monorepos (existing limits: depth 4, maxFiles 60 — preserve these)

## 8. Out of Scope
- Changing Layer 1 (pipeline compliance) logic or findings
- Adding new LLM personas to the audit
- Implementing LLM response parsing for the agent output (agent writes findings directly)
- Changing `runApprovalFlow` behavior

## 9. Acceptance Criteria (Given/When/Then)

- AC-1: Given a project where `src/` exists but contains only `.js` files and Go source lives in `internal/`, when `aitri audit` runs, then `collectSourceFiles` includes files from `internal/` in addition to `src/`.
- AC-2: Given any project without AI configured, when `aitri audit --no-ai` runs, then Layer 2 and Layer 3 complete and report findings without error.
- AC-3: Given a project with no `--feature` argument, when `aitri audit` runs, then the output includes "pipeline compliance skipped" and Layer 2 + Layer 3 findings are shown.
- AC-4: Given a project with AI configured, when `aitri audit` runs, then Layer 4 outputs persona system prompts and task descriptions for each applicable persona instead of calling any external API.
- AC-5: Given `aitri audit --feature <name>` with an approved spec, when audit runs, then Layer 1 pipeline findings appear before Layer 2–4 output, and Layer 4 prompt includes the feature spec as context.
- AC-6: Given a project with no `package.json`, when `aitri audit` runs, then Layer 3 skips with a "(no package.json — dependency audit skipped)" message and exit code is not affected.

## 10. Requirement Source Statement
- All requirements in this spec were provided explicitly by the user (EVO-061, EVO-065).
- Aitri structured the content and did not invent requirements.
