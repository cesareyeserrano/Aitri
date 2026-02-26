---
name: aitri
description: Spec-driven SDLC workflow guardrail for Gemini sessions using Aitri commands, personas, and approval gates.
---

# Aitri Skill (Gemini) — Spec-Driven SDLC

## Purpose
Use Aitri as the execution guardrail for spec-driven SDLC work with explicit human approvals. Optimized for Gemini's long context (1M tokens), allowing for deep project-wide traceability and multi-artifact analysis.

## Session Bootstrap (Mandatory)
1. Run `aitri resume` (or `aitri resume json` for machine-readable output)
2. If structure is missing (`nextStep: "aitri init"`), run `aitri init`
3. Re-run `aitri resume`
4. If checkpoint confirmation is requested, ask: "Checkpoint found. Continue from checkpoint? (yes/no)" and wait for explicit user decision.
5. Read `docs/README.md` and `docs/EXECUTION_GUARDRAILS.md` if present.
6. **Gemini Optimization:** Load and analyze all approved specs (`specs/approved/`) and the current project backlog into context to ensure cross-feature consistency.
7. Report state and next recommended step.

## Non-Negotiable Rules
1. Do not implement code before approved spec exists.
2. Never skip Aitri gate prompts.
3. Execute one command step at a time.
4. Use kebab-case feature names.
5. Keep changes minimal and traceable.
6. Do not invent requirements. Requirements/spec content must come from explicit user input.
7. If requirement details are missing, ask the user and stop advancement until clarified.
8. **Traceability:** Every code change must be traceable to a `TC-*` ID and a `US-*` ID.

## Aitri Commands

### Pre-Go (Governance and Planning)
- `aitri init`: Initialize project structure.
- `aitri draft [--guided]`: Create draft spec from idea.
- `aitri spec-improve`: AI quality review — identifies ambiguous FRs and missing edge cases.
- `aitri approve`: Validate and approve spec.
- `aitri discover [--guided]`: Generate discovery artifact.
- `aitri plan`: Generate backlog and tests from spec (or auditor mode with `--ai-backlog --ai-tests`).
- `aitri verify-intent`: Semantic validation — US satisfies FR intent.
- `aitri diff --proposed`: Preview delta before committing a backlog update.
- `aitri status`: Show project and feature status.
- `aitri resume`: Resume session from last state.
- `aitri go`: Enter implementation mode (after human approval).

### Post-Go (Factory Execution)
- `aitri build`: Scaffold test stubs and contract placeholders.
- `aitri testgen`: LLM generates behavioral test bodies from FR + AC.
- `aitri contractgen`: LLM implements contract functions from FR + test stubs.
- `aitri prove`: Run each TC stub, map results to `FR-IDs`, write proof-of-compliance record.
- `aitri deliver`: Final delivery gate: all `FR`s proven, all `TC`s passing.

## Interactive Mode (Default)
Aitri commands are **interactive by default**. The agent should:
- Let Aitri prompt for confirmations naturally.
- Review each `PLAN` output before confirming.
- Never add `--non-interactive --yes` unless the user explicitly requests automation.
- Never suggest `--non-interactive --yes` by default in conversational sessions.

## CI/Pipeline Mode (Opt-in Only)
Only use these flags in CI pipelines or when the user explicitly requests unattended execution:
- `--non-interactive`: suppress prompts, fail if required args are missing.
- `--yes`: auto-confirm write operations.
- `--feature <name>`: pass feature explicitly.
- `json`, `-j`, or `--format json`: machine-readable output (`status`, `resume`, `diff`).

## Default Workflow

### Pre-Go Phase
1. `aitri resume`
2. `aitri init` (when needed)
3. `aitri draft` → Human review
4. `aitri spec-improve` — AI quality review (optional but recommended)
5. `aitri approve`
6. `aitri discover`
7. `aitri plan` (or auditor mode: `--ai-backlog --ai-tests`)
8. `aitri verify-intent` — semantic US ↔ FR alignment (optional)
9. Human GO/NO-GO decision
10. `aitri go`

### Post-Go Phase (Factory Execution)
11. `aitri build --yes`: scaffold test stubs and contract placeholders.
12. `aitri testgen`: LLM generates behavioral test bodies.
13. `aitri contractgen`: LLM implements contract functions.
14. `aitri prove --mutate`: run TC stubs, generate proof-of-compliance.
15. `aitri deliver`: final delivery gate.

## Gemini Context Management (1M tokens)
- **Deep Recall:** Leverage the long context to maintain awareness of all `AF-SPEC` files in `specs/approved/`.
- **Cross-Feature Impact:** When planning or implementing, check for potential conflicts or synergies with existing features documented in the specs.
- **SDD Integrity:** Use the context to ensure that every `FR-*` defined in the spec is correctly mapped to a `US-*` and verified by a `TC-*`.

## Persona Alignment
Use iterative persona lenses:
- Architect, Developer, QA, Security, UX/UI, Discovery, Product.
- Re-run relevant personas after any material change.

## Approval Behavior
If Aitri outputs `PLAN` and requests `Proceed? (y/n)`:
1. Summarize the plan.
2. Ask for explicit approval.
3. Execute only after approval.

## Checkpoint Behavior
Write commands create auto-checkpoints (max: 10).
At the end of substantial progress, manual fallback:
- `git add -A && git commit -m "checkpoint: <feature> <phase>"`

## Exit Codes
- `0`: success
- `1`: error
- `2`: user-aborted action
