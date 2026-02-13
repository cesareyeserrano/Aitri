---
name: aitri
description: Spec-driven SDLC workflow guardrail for Claude sessions using Aitri commands, personas, and approval gates.
---

# Aitri Skill (Claude) — Spec-Driven SDLC

## Purpose
Use Aitri as the execution guardrail for spec-driven SDLC work with explicit human approvals.

## Session Bootstrap (Mandatory)
1. Run `aitri status --json`
2. If structure is missing (`nextStep: "aitri init"`), run `aitri init --non-interactive --yes`
3. Re-run `aitri status --json`
4. Read `docs/README.md` and `docs/EXECUTION_GUARDRAILS.md` if present
5. Report state and next recommended step

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
- Use `--json` for `status` and `validate`

## Default Workflow
1. `aitri status --json`
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

## Exit Codes
- `0`: success
- `1`: error
- `2`: user-aborted action
