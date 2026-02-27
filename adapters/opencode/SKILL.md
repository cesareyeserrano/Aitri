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
- Do not invent requirements. Requirements/spec content must come from explicit user input.
- If requirement details are missing, ask the user and stop advancement until clarified.
- **NEVER perform analysis, audit, code review, code generation, or pipeline work without first invoking the corresponding `aitri` command.** Free-form work bypasses all gates. If you are about to do this — stop. Use the command mapping below.
- If no `aitri` command exists for what the user needs, say so and do not improvise.

## Command Mapping (action → aitri command)

| User asks for… | Use this command |
|---|---|
| Start / orient / where am I | `aitri resume` |
| Full pipeline status | `aitri status --feature <name>` |
| New feature spec | `aitri draft` |
| Improve or refine spec | `aitri spec-improve` |
| Approve spec | `aitri approve` |
| Discovery / backlog / stories | `aitri discover` |
| Technical plan | `aitri plan` |
| Semantic validation | `aitri verify-intent` |
| Go/no-go decision | `aitri go` |
| Architecture review | `aitri arch-design` |
| Security review | `aitri sec-review` |
| UX design | `aitri ux-design` |
| QA plan | `aitri qa-plan` |
| Dev roadmap | `aitri dev-roadmap` |
| Code audit / technical audit | `aitri audit --feature <name>` |
| Scaffold stubs | `aitri build` |
| Generate tests | `aitri testgen` |
| Generate contracts | `aitri contractgen` |
| Run proof of compliance | `aitri prove` |
| Deliver feature | `aitri deliver` |
| Epic management | `aitri epic create/status` |
| Project health check | `aitri doctor` |

## Commands

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

## Factory Workflow (Post-Go)
1. `aitri build --yes` — scaffold test stubs and contract placeholders
2. `aitri testgen` — LLM generates behavioral test bodies
3. `aitri contractgen` — LLM implements contract functions
4. `aitri prove --mutate` — run TC stubs, generate proof-of-compliance
5. `aitri deliver` — final delivery gate

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
- `json`, `-j`, or `--format json` — machine-readable output for `status`, `resume`, `diff`

## Checkpoint Behavior
Write commands create auto-checkpoints by default in git repositories (retained max: 10).

At the end of substantial progress, manual fallback remains:
- `git add -A && git commit -m "checkpoint: <feature> <phase>"`
- fallback: `git stash push -m "checkpoint: <feature> <phase>"`

Resume protocol:
1. `aitri resume`
2. If checkpoint is detected, ask user whether to resume from checkpoint (yes/no)
3. Follow the recommended command only after user response (or `nextStep` in JSON mode)

## Gate CTA — Clarity Rule
When a gate completes and there is a next command to run, **never leave the command floating**. Always close with:

**Pattern A — offer to execute now:**
> Next step is `aitri approve --feature <name>`. Should I run it now? Reply **yes** to proceed or **no** to review first.

**Pattern B — deferred:**
> When ready, run: `aitri approve --feature <name>`

## Status / Resume — Mandatory Closing Block
Every `aitri status` or `aitri resume` execution **must close** with:

```
→ Next: `aitri <command> --feature <name>`
   <one-line description>
```

If delivered: `→ Feature closed. No further Aitri pipeline steps.`

## Exit Codes
- `0` success
- `1` error
- `2` user-aborted
