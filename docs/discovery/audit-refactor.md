# Discovery: audit-refactor

STATUS: DRAFT

## 1. Problem Statement
Derived from approved spec retrieval snapshot:
- Retrieval mode: section-level
- Retrieved sections: 1. Context, 2. Actors, 3. Functional Rules, 7. Security Considerations, 8. Out of Scope, 9. Acceptance Criteria

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

### Security snapshot
- `collectSourceFiles` directory walk must have depth and file count limits to prevent runaway scan on large monorepos (existing limits: depth 4, maxFiles 60 — preserve these)

### Out-of-scope snapshot
- Changing Layer 1 (pipeline compliance) logic or findings
- Adding new LLM personas to the audit
- Implementing LLM response parsing for the agent output (agent writes findings directly)

Refined problem framing:
- What problem are we solving? Problem stated in approved spec context
- Why now? Acceptance criteria defined in approved spec

## 2. Discovery Interview Summary (Discovery Persona)
- Primary users:
- Users defined in approved spec

- Jobs to be done:
- Deliver capability described in approved spec

- Current pain:
- Problem stated in approved spec context

- Constraints (business/technical/compliance):
- Constraints identified in approved spec

- Dependencies:
- Dependencies identified in approved spec

- Success metrics:
- Acceptance criteria defined in approved spec

- Assumptions:
- Assumptions embedded in approved spec scope

- Interview mode:
- quick

## 3. Scope
### In scope
- Approved spec functional scope

### Out of scope
- Anything not explicitly stated in approved spec

## 4. Actors & User Journeys
Actors:
- Users defined in approved spec

Primary journey:
- Primary journey derived from approved spec context

## 5. Architecture (Architect Persona)
- Components:
-
- Data flow:
-
- Key decisions:
-
- Risks:
-

## 6. Security (Security Persona)
- Threats:
-
- Controls required:
-
- Validation rules:
-

## 7. Backlog Outline
Epic:
-

User stories:
1.
2.
3.

## 8. Test Strategy
- Smoke tests:
-
- Functional tests:
-
- Security tests:
-
- Edge cases:
-

## 9. Discovery Confidence
- Confidence:
-

- Reason:
-

- Evidence gaps:
-

- Handoff decision:
-
