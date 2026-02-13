# Aitri Skill (OpenCode) — Spec-Driven SDLC

## Purpose
Use Aitri as the CLI guardrail for spec-driven SDLC execution with mandatory human approvals.

## Session Bootstrap
1. Read `docs/README.md`
2. Read `docs/EXECUTION_GUARDRAILS.md`
3. Run `aitri status --json`
4. Report state and next step

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
