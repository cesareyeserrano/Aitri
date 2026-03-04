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
- All `aitri` commands must be executed from the workspace root. Verify with `pwd` if uncertain — running from a subdirectory causes silent path failures.
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
- **Never modify `aitri.config.json` or configure an AI provider** without explicit user instruction. Do not use environment variables to infer or set AI config — ask the user which provider and key to use.
- **Before marking any Aitri implementation complete**, verify test coverage per `docs/architecture.md#test-coverage-requirements`: (a) architecture invariants have constraint tests, (b) file-walking functions tested with realistic directory trees, (c) heuristic detection functions exercised via full pipeline — not just unit tests.

## Command Mapping (action → aitri command)

| User asks for… | Use this command |
|---|---|
| Start / orient / where am I | `aitri resume` |
| Full pipeline status | `aitri status --feature <name>` |
| New feature spec | `aitri draft` |
| Improve or refine spec | `aitri spec-improve` |
| Approve spec | `aitri approve` |
| Discovery / backlog / stories | `aitri plan` |
| Semantic validation | `aitri verify-intent` |
| Go/no-go decision | `aitri go` |
| Architecture review | `aitri arch-design` |
| Security review | `aitri sec-review` |
| UX design | `aitri ux-design` |
| UX improvements that touch code | `aitri ux-design --force`, then `aitri draft --feature ui-<name>` using the FR list from section 7 of the UX design |
| QA plan | `aitri qa-plan` |
| Dev roadmap | `aitri dev-roadmap` |
| Project health audit (full codebase) | `aitri audit` |
| Pipeline compliance audit (feature) | `aitri audit --feature <name>` |
| Scaffold stubs | `aitri build` |
| Generate tests | `aitri testgen` |
| Generate contracts | `aitri contractgen` |
| Run proof of compliance | `aitri prove` |
| Deliver feature | `aitri deliver` |
| Epic management | `aitri epic create/status` |
| Project health check | `aitri doctor` |

## Commands

### Pre-Planning (Persona-Driven — run once per project)
- `aitri discover-idea [--idea <text>]` — Discovery Facilitator → `.aitri/discovery.md`
- `aitri product-spec` — Product Manager → `.aitri/product-spec.md`
- `aitri ux-design` — Experience Designer → `.aitri/ux-design.md` (skip with `--no-ux` for non-UI)
- `aitri arch-design` — System Architect → `.aitri/architecture-decision.md`
- `aitri sec-review` — Security Champion → `.aitri/security-review.md`
- `aitri qa-plan` — Quality Engineer → `.aitri/qa-plan.md`
- `aitri dev-roadmap` — Lead Developer → `.aitri/dev-roadmap.md`

### Pre-Go (Per-Feature Governance)
- `aitri init`
- `aitri draft [--guided]` — reference `.aitri/dev-roadmap.md` for spec content
- `aitri spec-improve`
- `aitri approve`
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
- `aitri qa` — independent AC-driven QA: verify each AC against running code, write .aitri/qa-report.md
- `aitri deliver` — final delivery gate: all FRs proven, all TCs passing

## Recommended Workflow

### Pre-Planning Phase (once per project/major direction change)
Each command loads a persona and prints a task prompt. **You are the AI — generate the artifact content yourself using the persona and task, then write it to the specified path.**
0a. `aitri discover-idea --idea "<raw idea>"` → generate → write `.aitri/discovery.md`
0b. `aitri product-spec` → generate → write `.aitri/product-spec.md`
0c. `aitri ux-design` → generate → write `.aitri/ux-design.md` (skip: `--no-ux`)
0d. `aitri arch-design` → generate → write `.aitri/architecture-decision.md`
0e. `aitri sec-review` → generate → write `.aitri/security-review.md`
0f. `aitri qa-plan` → generate → write `.aitri/qa-plan.md`
0g. `aitri dev-roadmap` → generate → write `.aitri/dev-roadmap.md`
After each: show a 3-5 line summary and ask human for approval before proceeding to next step.

### Pre-Go Phase (per feature — reference `.aitri/dev-roadmap.md` for scope)
1. `aitri resume`
2. `aitri init` (if structure missing)
3. `aitri draft` — use dev-roadmap as source of truth for requirements
4. `aitri spec-improve` — AI quality review (optional but recommended)
5. Human review of draft
6. `aitri approve`
7. `aitri plan` (or auditor mode: `--ai-backlog --ai-tests`)
9. `aitri verify-intent` — semantic US ↔ FR alignment (optional)
10. Human GO/NO-GO decision
11. `aitri go`

### Post-Go Phase (Factory Execution)
12. `aitri build` — scaffold test stubs and contract placeholders
13. `aitri testgen` — LLM generates behavioral test bodies
14. `aitri contractgen` — LLM implements contract functions
15. `aitri prove --mutate` — run TC stubs, generate proof-of-compliance
16. `aitri qa` — independent QA: run each AC against the running system, write .aitri/qa-report.md
17. `aitri deliver` — final delivery gate

## Persona Activation

Personas are **active system prompts**, not reference-only documents.

| Stage | Command | Persona |
|---|---|---|
| Project discovery | `aitri discover-idea` | `core/personas/discovery.md` |
| Product spec | `aitri product-spec` | `core/personas/product.md` |
| UX design | `aitri ux-design` | `core/personas/ux-ui.md` |
| Architecture | `aitri arch-design` | `core/personas/architect.md` |
| Security review | `aitri sec-review` | `core/personas/security.md` |
| QA planning | `aitri qa-plan` | `core/personas/qa.md` |
| Dev roadmap | `aitri dev-roadmap` | `core/personas/developer.md` |
| Spec review | `aitri spec-improve` | `core/personas/architect.md` |
| Test generation | `aitri testgen` | `core/personas/qa.md` |
| Contract impl | `aitri contractgen` | `core/personas/developer.md` |
| Audit (technical) | `aitri audit` | `core/personas/architect.md` |
| Audit (drift) | `aitri audit` | `core/personas/security.md` |
| Audit (implementation) | `aitri audit` | `core/personas/developer.md` |
| Audit (UX) | `aitri audit` | `core/personas/ux-ui.md` |

Persona usage is iterative:
- Re-run relevant personas whenever scope, contracts, architecture, or validation state changes.
- Do not treat persona output as one-time/final if context has changed.

## Persona Minimum Output
When a persona-activated command completes, output must meet these minimums before presenting to the user:

- **`spec-improve`** (Architect): minimum 3 concrete technical findings; validate against `.aitri/architecture-decision.md` if it exists
- **`testgen`** (QA): must explicitly cover Happy Path, Edge Cases, and Security Failures
- **`contractgen`** (Developer): each implemented function must include `@aitri-trace` header with US-ID, FR-ID, TC-ID; zero undocumented logic beyond the approved spec
- **`arch-design`** (Architect): must include stack decision with technical justification

## Post-Audit Behavior

After `aitri audit` completes:
1. Show the full CLI output to the user (do not summarize).
2. Walk through each finding group (CRITICAL → HIGH → MEDIUM) and briefly explain what it means in the context of the project.
3. Ask the user which findings they want to act on now vs. track for later.
4. Do NOT create tasks, open issues, or modify files based on audit findings without explicit user instruction.
5. If the user wants to save findings, let the approval flow (prompted by the CLI) handle it — respond (y/n) per finding.

## Output Evidence Rule
Never claim a command succeeded without showing its actual stdout output. Display the complete CLI output — do not summarize, paraphrase, or invent it.

When Aitri outputs a `PLAN`, what the user sees must be the real stdout. Human-in-the-loop approval is only valid when based on actual output.

In IDE environments where terminal output is not visible in the chat, re-state the key decision points from the PLAN in the conversation before requesting approval.

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

## Mandatory Closing Block (Every Turn)
Every response must close with a next-step block — not only after `aitri status` or `aitri resume`:

```
→ Next: `aitri <command> --feature <name>`
   <one-line description>
```

If the next step is unknown: `→ Next: run \`aitri resume\` to determine next step`

If delivered: `→ Feature closed. No further Aitri pipeline steps.`

In IDE environments, also include the path of any artifact generated in the current turn:
```
→ Next: `aitri <command> --feature <name>`
   [File]: .aitri/<filename>.md
```

## Exit Codes
- `0` success
- `1` error
- `2` user-aborted
