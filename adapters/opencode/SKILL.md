---
name: aitri
description: Spec-driven SDLC workflow guardrail for OpenCode sessions using Aitri commands, personas, and approval gates.
---

# Aitri Skill (OpenCode) — Spec-Driven SDLC

## Purpose
Use Aitri as the CLI guardrail for spec-driven SDLC execution with mandatory human approvals.

## Session Bootstrap
1. Run `aitri status json`
2. If structure is missing (`nextStep: "aitri init"`), run `aitri init --non-interactive --yes`
3. Re-run `aitri status json`
4. If `checkpoint.state.resumeDecision == "ask_user_resume_from_checkpoint"`, ask: "Checkpoint found. Continue from checkpoint? (yes/no)" and wait for explicit user decision.
5. Read `docs/README.md` and `docs/EXECUTION_GUARDRAILS.md` if present
6. Report state and next step

## Core Contract
- No implementation before approved spec.
- No gate bypass.
- One command step at a time.
- Use non-interactive mode only when explicitly needed.

## Commands
- `aitri init`
- `aitri draft [--guided]`
- `aitri approve`
- `aitri discover`
- `aitri plan`
- `aitri validate`
- `aitri status`

## CI/Automation Mode
- `--non-interactive`
- `--yes` for write commands
- `--feature <name>` where required
- `json`, `-j`, or `--format json` for `status` and `validate`

## Checkpoint Behavior
At the end of substantial progress, recommend:
- `git add -A && git commit -m "checkpoint: <feature> <phase>"`
- fallback: `git stash push -m "checkpoint: <feature> <phase>"`

Resume protocol:
1. `aitri status json`
2. If checkpoint is detected, ask user whether to resume from checkpoint (yes/no)
3. Follow `nextStep` only after user response

## Exit Codes
- `0` success
- `1` error
- `2` user-aborted
