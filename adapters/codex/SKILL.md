---
name: aitri
description: Spec-driven SDLC workflow guardrail for Codex CLI sessions using Aitri commands, personas, and approval gates.
---

# Aitri Skill (Codex) — Spec-Driven SDLC

## Purpose
Use Aitri as the workflow guardrail to move from idea to validated SDLC artifacts, and only then proceed to implementation with explicit human approval.

Aitri execution model:
- Human decides and approves
- Aitri enforces structure and traceability
- Agent executes within Aitri constraints

## Session Bootstrap (Mandatory)
1. Run `aitri status json`
2. If structure is missing (`nextStep: "aitri init"`), run `aitri init --non-interactive --yes`
3. Re-run `aitri status json`
4. If `checkpoint.state.resumeDecision == "ask_user_resume_from_checkpoint"`, ask: "Checkpoint found. Continue from checkpoint? (yes/no)" and wait for explicit user decision.
5. Read `docs/README.md` and `docs/EXECUTION_GUARDRAILS.md` if present
6. Report current state and next recommended step

## Core Rules (Non-Negotiable)
1. No code implementation before approved spec.
2. Never bypass Aitri gate prompts.
3. One command step at a time.
4. Use kebab-case feature names.
5. Keep output deterministic and minimal.

## Commands
- `aitri init`
- `aitri draft [--guided]`
- `aitri approve`
- `aitri discover`
- `aitri plan`
- `aitri validate`
- `aitri status`

## CI/Agent Mode
For non-interactive execution:
- Use `--non-interactive`
- For write commands (`init`, `draft`, `approve`, `discover`, `plan`) also use `--yes`
- Pass feature explicitly where needed: `--feature <name>`
- Use `json`, `-j`, or `--format json` for machine-readable output (`status`, `validate`)

## Recommended Workflow
1. `aitri status json`
2. `aitri init` (if structure missing)
3. `aitri draft`
4. Human review of draft
5. `aitri approve`
6. `aitri discover`
7. `aitri plan`
8. Refine artifacts with personas
9. `aitri validate`
10. Human approval before implementation/deployment assistance

## Persona Usage
When refining artifacts, apply:
- Product
- Architect
- Developer
- QA
- Security
- UX/UI (if user-facing)

Reference files:
- `core/personas/product.md`
- `core/personas/architect.md`
- `core/personas/developer.md`
- `core/personas/qa.md`
- `core/personas/security.md`
- `core/personas/ux-ui.md`

## Approval Behavior
If Aitri shows `PLAN` + `Proceed? (y/n)`:
1. Stop
2. Summarize plan
3. Ask for human approval
4. Proceed only on explicit approval

## Checkpoint Behavior
At the end of substantial progress, recommend:
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
