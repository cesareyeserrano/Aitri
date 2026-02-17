---
name: aitri
description: Spec-driven SDLC workflow guardrail for OpenCode sessions using Aitri commands, personas, and approval gates.
---

# Aitri Skill (OpenCode) — Spec-Driven SDLC

## Purpose
Use Aitri as the CLI guardrail for spec-driven SDLC execution with mandatory human approvals.

## Session Bootstrap
1. Run `aitri resume` (or `aitri resume json` for machine-readable output)
2. If structure is missing (`nextStep: "aitri init"`), run `aitri init`
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

### Pre-Go (Governance and Planning)
- `aitri init`
- `aitri draft [--guided]`
- `aitri approve`
- `aitri discover [--guided]`
- `aitri plan`
- `aitri validate`
- `aitri verify`
- `aitri policy`
- `aitri status`
- `aitri resume`
- `aitri handoff`
- `aitri go`

### Post-Go (Factory Execution)
- `aitri scaffold` — generate project skeleton, executable test stubs, interface contracts
- `aitri implement` — generate ordered implementation briefs for AI agents
- `aitri verify` — (enhanced) map test results to TC-*, report FR/US coverage
- `aitri deliver` — final delivery gate: all FRs covered, all TCs passing

## Factory Workflow (Post-Go)
1. `aitri scaffold` — generate project skeleton
2. `aitri implement` — receive implementation briefs
3. Implement each US-* brief in order from IMPLEMENTATION_ORDER.md
4. After each US-*: `aitri verify` to confirm TC-* pass
5. Repeat 3-4 until all stories pass
6. `aitri deliver` — final delivery gate

## Interactive Mode (Default)
Aitri commands are **interactive by default**. The agent should:
- Let Aitri prompt for confirmations naturally
- Review each PLAN output before confirming
- Never add `--non-interactive --yes` unless the user explicitly requests automation

## CI/Pipeline Mode (Opt-in Only)
Only use these flags in CI pipelines or when the user explicitly requests unattended execution:
- `--non-interactive` — suppress prompts, fail if required args are missing
- `--yes` — auto-confirm write operations
- `--feature <name>` — pass feature explicitly
- `json`, `-j`, or `--format json` — machine-readable output for `status`, `verify`, `policy`, `validate`

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
