---
name: aitri
description: Spec-driven SDLC workflow guardrail for OpenCode sessions using Aitri commands, personas, and approval gates.
---

# Aitri Skill (OpenCode) — Spec-Driven SDLC

## Purpose
Use Aitri as the CLI guardrail for spec-driven SDLC execution with mandatory human approvals.

## Session Bootstrap
1. Run `aitri status --json`
2. If structure is missing (`nextStep: "aitri init"`), run `aitri init --non-interactive --yes`
3. Re-run `aitri status --json`
4. Read `docs/README.md` and `docs/EXECUTION_GUARDRAILS.md` if present
5. Report state and next step

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
- `--json` for `status` and `validate`

## Exit Codes
- `0` success
- `1` error
- `2` user-aborted
