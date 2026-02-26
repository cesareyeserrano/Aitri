---
name: aitri
description: Spec-driven SDLC workflow guardrail for Claude sessions using Aitri commands, personas, and approval gates.
---

# Aitri Skill (Claude) — Spec-Driven SDLC

## Purpose
Use Aitri as the execution guardrail for spec-driven SDLC work with explicit human approvals.

## Session Bootstrap (Mandatory)
1. Run `aitri resume` (or `aitri resume json` for machine-readable output)
2. If structure is missing (`nextStep: "aitri init"`), run `aitri init`
3. Re-run `aitri resume`
4. If checkpoint confirmation is requested, ask: "Checkpoint found. Continue from checkpoint? (yes/no)" and wait for explicit user decision.
5. Read `docs/README.md` and `docs/EXECUTION_GUARDRAILS.md` if present
6. Report state and next recommended step

## Non-Negotiable Rules
1. Do not implement code before approved spec exists.
2. Never skip Aitri gate prompts.
3. Execute one command step at a time.
4. Use kebab-case feature names.
5. Keep changes minimal and traceable.
6. Do not invent requirements. Requirements/spec content must come from explicit user input.
7. If requirement details are missing, ask the user and stop advancement until clarified.

## Aitri Commands

### Pre-Go (Governance and Planning)
- `aitri init`
- `aitri draft [--guided]`
- `aitri spec-improve`
- `aitri approve`
- `aitri discover [--guided]`
- `aitri plan`
- `aitri verify-intent`
- `aitri diff --proposed`
- `aitri status`
- `aitri resume`
- `aitri go`

### Post-Go (Factory Execution)
- `aitri build` — scaffold test stubs and contract placeholders
- `aitri testgen` — LLM generates behavioral test bodies from FR + AC
- `aitri contractgen` — LLM implements contract functions from FR + test stubs
- `aitri prove` — run TC stubs, map results to FR-IDs, write proof-of-compliance record
- `aitri deliver` — final delivery gate: all FRs proven, all TCs passing

## Interactive Mode (Default)
Aitri commands are **interactive by default**. The agent should:
- Let Aitri prompt for confirmations naturally
- Review each PLAN output before confirming
- Never add `--non-interactive --yes` unless the user explicitly requests automation
- Never suggest `--non-interactive --yes` by default in conversational sessions

## CI/Pipeline Mode (Opt-in Only)
Only use these flags in CI pipelines or when the user explicitly requests unattended execution:
- `--non-interactive` — suppress prompts, fail if required args are missing
- `--yes` — auto-confirm write operations
- `--feature <name>` — pass feature explicitly
- `json`, `-j`, or `--format json` — machine-readable output (`status`, `resume`, `diff`)

## Default Workflow

### Pre-Go Phase
1. `aitri resume`
2. `aitri init` when needed
3. `aitri draft`
4. `aitri spec-improve` — AI quality review (optional but recommended)
5. Human review and adjustments
6. `aitri approve`
7. `aitri discover`
8. `aitri plan` (or auditor mode: `--ai-backlog --ai-tests`)
9. `aitri verify-intent` — semantic US ↔ FR alignment (optional)
10. Human GO/NO-GO decision
11. `aitri go`

### Post-Go Phase (Factory Execution)
12. `aitri build --yes` — scaffold test stubs and contract placeholders
13. `aitri testgen` — LLM generates behavioral test bodies
14. `aitri contractgen` — LLM implements contract functions
15. `aitri prove --mutate` — run TC stubs, generate proof-of-compliance
16. `aitri deliver` — final delivery gate

## Persona Alignment
Use these lenses while refining artifacts:
- Discovery
- Product
- Architect
- Developer
- QA
- Security
- UX/UI (if user-facing)

Persona usage is iterative:
- Re-run relevant personas whenever scope, contracts, architecture, or validation state changes.
- Do not treat persona output as one-time/final if context has changed.

References:
- `core/personas/discovery.md`
- `core/personas/product.md`
- `core/personas/architect.md`
- `core/personas/developer.md`
- `core/personas/qa.md`
- `core/personas/security.md`
- `core/personas/ux-ui.md`

## Approval Behavior
If Aitri outputs `PLAN` and requests `Proceed? (y/n)`:
1. Summarize the plan
2. Ask for explicit approval
3. Execute only after approval

## Checkpoint Behavior
Write commands create auto-checkpoints by default in git repositories (retained max: 10).

At the end of substantial progress, manual fallback remains:
- `git add -A && git commit -m "checkpoint: <feature> <phase>"`
- fallback: `git stash push -m "checkpoint: <feature> <phase>"`

When resuming a new session:
1. Run `aitri resume`
2. If checkpoint is detected, ask user whether to resume from checkpoint (yes/no)
3. Follow the recommended command only after user response (or `nextStep` in JSON mode)

## Exit Codes
- `0`: success
- `1`: error
- `2`: user-aborted action
