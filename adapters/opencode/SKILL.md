---
name: aitri
description: Spec-driven SDLC workflow guardrail for OpenCode sessions using Aitri commands, personas, and approval gates.
---

# Aitri Skill (OpenCode) — Spec-Driven SDLC

## Purpose
Use Aitri as the CLI guardrail for spec-driven SDLC execution with mandatory human approvals.

## Session Bootstrap
1. Run `aitri resume` (or `aitri resume json` in automation)
2. If structure is missing (`nextStep: "aitri init"`), run `aitri init --non-interactive --yes`
3. Re-run `aitri resume`
4. If checkpoint confirmation is requested, ask: "Checkpoint found. Continue from checkpoint? (yes/no)" and wait for explicit user decision.
5. Read `docs/README.md` and `docs/EXECUTION_GUARDRAILS.md` if present
6. Report state and next step

## Core Contract
- No implementation before approved spec.
- No gate bypass.
- One command step at a time.
- Use non-interactive mode only when explicitly needed.
- Persona usage is iterative; re-run relevant personas when context changes.
- Discovery persona should be applied before planning when requirements are ambiguous.

## Commands
- `aitri init`
- `aitri draft [--guided]`
- `aitri approve`
- `aitri discover [--guided]`
- `aitri plan`
- `aitri validate`
- `aitri status`
- `aitri resume`
- `aitri handoff`
- `aitri go`

## CI/Automation Mode
- `--non-interactive`
- `--yes` for write commands
- `--feature <name>` where required
- `json`, `-j`, or `--format json` for `status` and `validate`

## Checkpoint Behavior
Write commands create auto-checkpoints by default in git repositories (retained max: 10).

At the end of substantial progress, manual fallback remains:
- `git add -A && git commit -m "checkpoint: <feature> <phase>"`
- fallback: `git stash push -m "checkpoint: <feature> <phase>"`

Resume protocol:
1. `aitri resume`
2. If checkpoint is detected, ask user whether to resume from checkpoint (yes/no)
3. Follow the recommended command only after user response (or `nextStep` in JSON mode)

## Exit Codes
- `0` success
- `1` error
- `2` user-aborted
