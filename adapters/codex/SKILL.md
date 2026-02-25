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
1. Run `aitri resume` (or `aitri resume json` for machine-readable output)
2. If structure is missing (`nextStep: "aitri init"`), run `aitri init`
3. Re-run `aitri resume`
4. If checkpoint confirmation is requested, ask: "Checkpoint found. Continue from checkpoint? (yes/no)" and wait for explicit user decision.
5. Read `docs/README.md` and `docs/EXECUTION_GUARDRAILS.md` if present
6. Report current state and next recommended step

## Core Rules (Non-Negotiable)
1. No code implementation before approved spec.
2. Never bypass Aitri gate prompts.
3. One command step at a time.
4. Use kebab-case feature names.
5. Keep output deterministic and minimal.
6. Do not invent requirements. Requirements/spec content must come from explicit user input.
7. If requirement details are missing, ask the user and stop advancement until clarified.

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
- `aitri build` — scaffold project skeleton, stubs, interface contracts, and generate ordered implementation briefs (unified)
- `aitri verify` — (enhanced) map test results to TC-*, report FR/US coverage
- `aitri prove` — run each TC stub, map results to FR-IDs, write proof-of-compliance record
- `aitri deliver` — final delivery gate: all FRs covered, all TCs passing

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
- `json`, `-j`, or `--format json` — machine-readable output (`status`, `verify`, `policy`, `validate`)

## Recommended Workflow

### Pre-Go Phase
1. `aitri resume`
2. `aitri init` (if structure missing)
3. `aitri draft`
4. Human review of draft
5. `aitri approve`
6. `aitri discover`
7. `aitri plan`
8. Refine artifacts with personas
9. `aitri validate`
10. `aitri verify`
11. `aitri policy`
12. `aitri handoff`
13. Human GO/NO-GO decision
14. `aitri go`

### Post-Go Phase (Factory Execution)
15. `aitri build` — scaffold stubs, contracts, and generate implementation briefs
16. Implement each US-* brief in order from IMPLEMENTATION_ORDER.md
17. After each US-*: `aitri verify` to confirm TC-* pass
18. Repeat 16-17 until all stories pass
19. `aitri prove` — run TC stubs, prove each FR is satisfied
20. `aitri deliver` — final delivery gate

## Persona Usage
When refining artifacts, apply:
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

Reference files:
- `core/personas/discovery.md`
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
