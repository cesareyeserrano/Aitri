---
name: aitri
description: Spec-driven SDLC workflow guardrail for Claude sessions using Aitri commands, personas, and approval gates.
---

# Aitri Skill (Claude) — Spec-Driven SDLC

## Purpose
Use Aitri as the execution guardrail for spec-driven SDLC work with explicit human approvals.

## Session Bootstrap (Mandatory)
1. Run `aitri status json`
2. If structure is missing (`nextStep: "aitri init"`), run `aitri init --non-interactive --yes`
3. Re-run `aitri status json`
4. If `checkpoint.state.resumeDecision == "ask_user_resume_from_checkpoint"`, ask: "Checkpoint found. Continue from checkpoint? (yes/no)" and wait for explicit user decision.
5. Read `docs/README.md` and `docs/EXECUTION_GUARDRAILS.md` if present
6. Report state and next recommended step

## Non-Negotiable Rules
1. Do not implement code before approved spec exists.
2. Never skip Aitri gate prompts.
3. Execute one command step at a time.
4. Use kebab-case feature names.
5. Keep changes minimal and traceable.

## Aitri Commands
- `aitri init`
- `aitri draft [--guided]`
- `aitri approve`
- `aitri discover`
- `aitri plan`
- `aitri validate`
- `aitri status`

## Non-Interactive Agent/CI Mode
- Use `--non-interactive`
- Use `--yes` for write commands
- Use `--feature <name>` when required
- Use `json`, `-j`, or `--format json` for machine-readable output (`status`, `validate`)

## Default Workflow
1. `aitri status json`
2. `aitri init` when needed
3. `aitri draft`
4. Human review and adjustments
5. `aitri approve`
6. `aitri discover`
7. `aitri plan`
8. Refine artifacts with personas
9. `aitri validate`
10. Human approval before implementation/deployment assistance

## Persona Alignment
Use these lenses while refining artifacts:
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
1. Run `aitri status json`
2. If checkpoint is detected, ask user whether to resume from checkpoint (yes/no)
3. Follow `nextStep` only after user response

## Exit Codes
- `0`: success
- `1`: error
- `2`: user-aborted action
