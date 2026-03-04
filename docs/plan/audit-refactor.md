# Plan: audit-refactor

STATUS: DRAFT

## 1. Intent (from approved spec)
- Retrieval mode: section-level

### Context snapshot
- Refactor `cli/commands/audit.js` to (a) remove direct `callAI` dependency and output agent prompts instead, (b) fix `collectSourceFiles` to scan the full project root instead of only `src/`, (c) ensure static audit layers (code quality, dependency) always run regardless of feature or AI config, and (d) support project-level audit without requiring `--feature`.
- Requirement source: provided explicitly by user (EVO-061, EVO-065 — Ultron test session 2026-03-03).
- No inferred requirements were added by Aitri.

### Actors snapshot
- Aitri CLI user: runs `aitri audit` to assess project health
- AI agent (Claude Code / Codex): executes LLM analysis prompted by audit output

### Functional rules snapshot
- Layer 2 (code quality scan) and Layer 3 (dependency audit) must run on every `aitri audit` invocation, regardless of whether `--feature` is provided or AI is configured.
- `collectSourceFiles` must always walk from the project root and include all subdirectories, treating `src/` as one of many directories — not as the exclusive root.
- Layer 4 (LLM review) must be refactored to output persona system prompt + analysis task for the agent to execute — it must not call `callAI` directly.
- `aitri audit` without `--feature` must run Layer 2 + Layer 3 + Layer 4 prompt output across the full project.
- `aitri audit --feature <name>` must continue to run all 4 layers, with Layer 1 scoped to the named feature and Layers 2–4 scoped to the full project.

### Acceptance criteria snapshot
- Given a project where `src/` exists but contains only `.js` files and Go source lives in `internal/`, when `aitri audit` runs, then `collectSourceFiles` includes files from `internal/` in addition to `src/`.
- Given any project without AI configured, when `aitri audit --no-ai` runs, then Layer 2 and Layer 3 complete and report findings without error.
- Given a project with no `--feature` argument, when `aitri audit` runs, then the output includes "pipeline compliance skipped" and Layer 2 + Layer 3 findings are shown.
- Given a project with AI configured, when `aitri audit` runs, then Layer 4 outputs persona system prompts and task descriptions for each applicable persona instead of calling any external API.
- Given `aitri audit --feature <name>` with an approved spec, when audit runs, then Layer 1 pipeline findings appear before Layer 2–4 output, and Layer 4 prompt includes the feature spec as context.
- Given a project with no `package.json`, when `aitri audit` runs, then Layer 3 skips with a "(no package.json — dependency audit skipped)" message and exit code is not affected.

### Security snapshot
- `collectSourceFiles` directory walk must have depth and file count limits to prevent runaway scan on large monorepos (existing limits: depth 4, maxFiles 60 — preserve these)

### Out-of-scope snapshot
- Changing Layer 1 (pipeline compliance) logic or findings
- Adding new LLM personas to the audit
- Implementing LLM response parsing for the agent output (agent writes findings directly)

### Retrieval metadata
- Retrieval mode: section-level
- Retrieved sections: 1. Context, 2. Actors, 3. Functional Rules, 7. Security Considerations, 8. Out of Scope, 9. Acceptance Criteria
- Summary:
-
- Success looks like:
-

## 2. Discovery Review (Discovery Persona)
### Problem framing
- Problem stated in approved spec context
- Core rule to preserve: Layer 2 (code quality scan) and Layer 3 (dependency audit) must run on every `aitri audit` invocation, regardless of whether `--feature` is provided or AI is configured. Currently blocked by `codeOnlyMode` logic that gates execution on `hasAiConfig`

### Constraints and dependencies
- Constraints: Constraints identified in approved spec
- Dependencies: Dependencies identified in approved spec

### Success metrics
- Acceptance criteria defined in approved spec

### Key assumptions
- Assumptions embedded in approved spec scope

### Discovery rigor profile
- Discovery interview mode: quick
- Planning policy: Plan a constrained first slice and keep assumptions explicit.
- Follow-up gate: Before broad implementation, re-run discovery in standard/deep mode if assumptions remain unresolved.

## 3. Scope
### In scope
-

### Out of scope
-

## 4. Product Review (Product Persona)
### Business value
- Address user pain by enforcing: Layer 2 (code quality scan) and Layer 3 (dependency audit) must run on every `aitri audit` invocation, regardless of whether `--feature` is provided or AI is configured. Currently blocked by `codeOnlyMode` logic that gates execution on `hasAiConfig`
- Secondary value from supporting rule: `collectSourceFiles` must always walk from the project root and include all subdirectories, treating `src/` as one of many directories — not as the exclusive root. Must exclude: `node_modules`, `dist`, `build`, `.git`, `.gocache`, vendor directories Must not assume `src/` is the code root when `src/` only contains Aitri contract stubs Existing depth (4) and file count (60) limits must be preserved

### Success metric
- Primary KPI: Acceptance criteria defined in approved spec
- Ship only if metric has baseline and target.

### Assumptions to validate
- Assumptions embedded in approved spec scope
- Validate dependency and constraint impact before implementation start.
- Discovery rigor policy: Before broad implementation, re-run discovery in standard/deep mode if assumptions remain unresolved.

## 5. Architecture (Architect Persona)
### Components
- CLI command parser
- Command handler service
- Module: audit-refactor-service

### Data flow
- Operator executes command with validated inputs.
- Service layer enforces FR logic and delegates to adapters.
- Result is persisted/emitted with deterministic status and error text.

### Key decisions
- Keep FR to implementation traceability explicit by preserving story and TC identifiers.
- Use Node.js CLI modules aligned with detected stack (Node.js CLI).
- Favor deterministic error paths over silent fallback behavior.

### Risks & mitigations
- Spec-to-code drift risk: enforce FR/US/TC traces in generated artifacts.
- Integration fragility risk: isolate external calls behind adapters with clear contracts.
- Scope drift risk: block changes not linked to approved FR/AC entries.

### Observability (logs/metrics/tracing)
- Structured command logs with feature and story IDs.
- Metrics for command success/failure and runtime duration.
- Trace markers for dependency boundaries.

### Domain quality profile
- Domain: CLI/Automation (cli)
- Stack constraint: Use structured command modules and formatted terminal output (for example chalk/ora or equivalent patterns).
- Forbidden defaults: Unstructured raw console output as final UX baseline.

## 6. Security (Security Persona)
### Threats
- FR-3: Layer 4 (LLM review) must be refactored to output persona system prompt + analysis task for the agent to execute — it must not call `callAI` directly. Output format: same pattern as pre-planning commands (persona header + task + instructions) Personas: architect (technical review), security (spec drift), developer (implementation quality), ux-ui (conditional on `.aitri/ux-design.md`) Each persona's prompt must be printed separately with a clear section header In `--json` mode, Layer 4 must be skipped entirely (JSON output must remain machine-parseable)
- Derived from spec security section: - `collectSourceFiles` directory walk must have depth and file count limits to prevent runaway scan on large monorepos (existing limits: depth 4, maxFiles 60 — preserve these)

### Required controls
- - `collectSourceFiles` directory walk must have depth and file count limits to prevent runaway scan on large monorepos (existing limits: depth 4, maxFiles 60 — preserve these)

### Validation rules
- Security controls must be verified before delivery gate.

## 7. UX/UI Review (UX/UI Persona, if user-facing)
### Primary user flow
- Flow must be explicit and testable.

### Key states (empty/loading/error/success)
- Define deterministic behavior for empty/loading/error/success states.

### Accessibility baseline
- Keyboard and screen-reader baseline for user-facing interactions.

### Asset and placeholder strategy
- Define output templates/examples and fallback text for non-interactive logs.
- Avoid default primitive-only output when domain requires visual fidelity.

## 8. Backlog
> Create as many epics/stories as needed. Do not impose artificial limits.

### Epics
- Epic 1:
  - Outcome:
  - Notes:
- Epic 2:
  - Outcome:
  - Notes:

### User Stories
For each story include clear Acceptance Criteria (Given/When/Then).

#### Story:
- As a <actor>, I want <capability>, so that <benefit>.
- Acceptance Criteria:
  - Given ..., when ..., then ...
  - Given ..., when ..., then ...

(repeat as needed)

## 9. Test Cases (QA Persona)
> Create as many test cases as needed. Include negative and edge cases.

### Functional
1.
2.

### Negative / Abuse
1.
2.

### Security
1.
2.

### Edge cases
1.
2.

## 10. Implementation Notes (Developer Persona)
- Suggested sequence:
-
- Dependencies:
-
- Rollout / fallback:
-
