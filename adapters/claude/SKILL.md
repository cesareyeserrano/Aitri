---
name: aitri
description: Spec-driven SDLC workflow guardrail for Claude sessions using Aitri commands, personas, and approval gates.
---

# Aitri Skill (Claude) — Spec-Driven SDLC

## Purpose
Use Aitri as the execution guardrail for spec-driven SDLC work with explicit human approvals.

## Session Bootstrap (Mandatory)
1. Run `aitri resume` (or `aitri resume json` for machine-readable output)
2. If structure is missing (`nextStep: "aitri init"`), run `aitri init`
3. Re-run `aitri resume`
4. Read `docs/README.md` and `docs/EXECUTION_GUARDRAILS.md` if present
5. Report state and next recommended step

## Non-Negotiable Rules
1. Do not implement code before approved spec exists.
2. Never skip Aitri gate prompts.
3. Execute one command step at a time.
4. Use kebab-case feature names.
5. Keep changes minimal and traceable.
6. Do not invent requirements. Requirements/spec content must come from explicit user input.
7. If requirement details are missing, ask the user and stop advancement until clarified.
8. **NEVER perform analysis, audit, code review, code generation, or pipeline work without first invoking the corresponding `aitri` command.** Free-form work outside the pipeline bypasses all gates and makes Aitri decorative. If you are about to do any of these things without an `aitri` command — stop. Use the command mapping below.
9. If no `aitri` command exists for what the user needs, say so explicitly and do not improvise a substitute. Document the gap instead.

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

## Aitri Commands

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
- `aitri spec-improve` — System Architect persona reviews spec
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
- `aitri testgen` — Quality Engineer persona generates behavioral test bodies from FR + AC
- `aitri contractgen` — Lead Developer persona implements contract functions from FR + test stubs
- `aitri prove` — run TC stubs, map results to FR-IDs, write proof-of-compliance record
- `aitri deliver` — final delivery gate: all FRs proven, all TCs passing

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
- `json`, `-j`, or `--format json` — machine-readable output (`status`, `resume`, `diff`)

## Default Workflow

### Pre-Planning Phase (once per project/major direction change)
0a. `aitri discover-idea --idea "<raw idea>"` — Discovery Facilitator activates
0b. `aitri product-spec` — Product Manager activates
0c. `aitri ux-design` — Experience Designer activates (skip: `--no-ux`)
0d. `aitri arch-design` — System Architect activates
0e. `aitri sec-review` — Security Champion activates
0f. `aitri qa-plan` — Quality Engineer activates
0g. `aitri dev-roadmap` — Lead Developer activates, produces implementation roadmap
Human reviews and approves each artifact before proceeding to next.

### Pre-Go Phase (per feature — reference `.aitri/dev-roadmap.md` for scope)
1. `aitri resume`
2. `aitri init` when needed
3. `aitri draft` — use dev-roadmap as source of truth for requirements
4. `aitri spec-improve` — System Architect persona reviews spec
5. Human review and adjustments
6. `aitri approve`
7. `aitri discover`
8. `aitri plan` (or auditor mode: `--ai-backlog --ai-tests`)
9. `aitri verify-intent` — semantic US ↔ FR alignment (optional)
10. Human GO/NO-GO decision
11. `aitri go`

### Post-Go Phase (Factory Execution)
12. `aitri build` — scaffold test stubs and contract placeholders
13. `aitri testgen` — Quality Engineer persona generates behavioral test bodies
14. `aitri contractgen` — Lead Developer persona implements contract functions
15. `aitri prove --mutate` — run TC stubs, generate proof-of-compliance
16. `aitri deliver` — final delivery gate

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
- **`contractgen`** (Developer): each implemented function must reference its FR-ID; zero undocumented logic beyond the approved spec
- **`arch-design`** (Architect): must include stack decision with technical justification

## Output Evidence Rule
Never claim a command succeeded without showing its actual stdout output. Display the complete CLI output — do not summarize, paraphrase, or invent it.

When Aitri outputs a `PLAN`, what the user sees must be the real stdout. Human-in-the-loop approval is only valid when based on actual output.

In IDE environments where terminal output is not visible in the chat, re-state the key decision points from the PLAN in the conversation before requesting approval.

## Approval Behavior
If Aitri outputs `PLAN` and requests `Proceed? (y/n)`:
1. Summarize the plan
2. Ask for explicit approval
3. Execute only after approval

## Gate CTA — Clarity Rule
When a gate completes and there is a next command to run, **never leave the command floating without instruction**. Always close with one of these two patterns:

**Pattern A — offer to execute now:**
> El siguiente paso es `aitri approve --feature <name>`. ¿Lo ejecuto ahora? Responde **sí** para que lo corra, o **no** si prefieres revisarlo primero.

**Pattern B — next session or manual:**
> Cuando estés listo, corre: `aitri approve --feature <name>`

Never say "Siguiente paso cuando quieras:" without making the action explicit.

## Mandatory Closing Block (Every Turn)
Every response must close with a next-step block — not only after `aitri status` or `aitri resume`:

```
→ Siguiente: `aitri <command> --feature <name>`
   <descripción en una línea>
```

If the next step is unknown:
```
→ Siguiente: corre `aitri resume` para determinar el siguiente paso
```

If the feature is fully delivered:
```
→ Feature cerrado. No hay siguiente paso en el pipeline Aitri.
```

In IDE environments, also include the path of any artifact generated in the current turn:
```
→ Siguiente: `aitri <command> --feature <name>`
   [Archivo]: .aitri/<filename>.md
```

## Checkpoint Behavior
Write commands create auto-checkpoints by default in git repositories (retained max: 10).

At the end of substantial progress, manual fallback remains:
- `git add -A && git commit -m "checkpoint: <feature> <phase>"`
- fallback: `git stash push -m "checkpoint: <feature> <phase>"`

When resuming a new session:
1. Run `aitri resume` — the CLI handles any checkpoint decision natively
2. Follow the recommended command (`nextStep` in JSON mode)

## Exit Codes
- `0`: success
- `1`: error
- `2`: user-aborted action
