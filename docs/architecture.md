# Aitri: Architecture and Operating Model

## What Aitri Is

Aitri is a **spec enforcement CLI** for AI-assisted software delivery, driven by **7 specialized personas** that activate as LLM system prompts at each stage of the SDLC.

It enforces one rule: no artifact (backlog, test stub, contract, proof) can exist without a human-approved specification that precedes it.

It operates as a **skill consumed by AI agents** (Claude, Codex, OpenCode) as their system of record, and is also available for direct terminal use.

**What Aitri does:**
- Activates domain-expert personas (Discovery, Product, UX/UI, Architect, Security, QA, Developer) as LLM system prompts at each SDLC stage
- Validates that agent-generated content (backlogs, test cases) traces back to approved spec sections (FR-*, AC-*)
- Blocks writes when traceability is missing
- Generates test stubs, contract placeholders, behavioral tests, and contract implementations from approved specs
- Tracks delivery gates: pre-planning → spec → backlog → tests → build → testgen → contractgen → prove → deliver
- Supports existing projects via `aitri adopt` (scan + LLM infer + test map)

**What Aitri does not do:**
- Generate requirements — requirements must come from the user
- Guarantee correctness of LLM-generated content, only structural traceability
- Replace human judgment at approval gates
- Execute changes autonomously in audit mode — `aitri audit` is always advisory: reports findings and recommendations only, never modifies project state

---

## Roles

| Role | Responsibility |
|------|----------------|
| **Human** | Provides intent, approves each persona artifact, authorizes delivery |
| **AI agent** | Authors backlog, tests, contracts, and code under Aitri's format contracts |
| **Aitri personas** | Drive each SDLC stage with specialized domain expertise as LLM system prompts |
| **Aitri CLI** | Validates traceability, enforces gates, generates structured scaffolding |

---

## Non-Negotiable Principles

1. **Spec first.** No downstream artifact without `specs/approved/<feature>.md`.
2. **Explicit gates.** Irreversible operations (`approve`, `go`) require confirmation. Automation requires `--yes`. Reversible commands run without prompt.
3. **Traceability required.** Spec → Backlog → Tests → Implementation. Every item has a traceable ID.
4. **Human authority.** Final decisions always remain with the human owner. Every persona output is reviewed and approved before the next stage runs.
5. **Requirement source integrity.** Requirements come from explicit user input. Aitri does not invent them.
6. **Idempotent writes.** Running any command twice must not corrupt state.
7. **Artifacts flow forward.** Every artifact produced by a stage is consumed by at least one subsequent stage.

---

## Persona Activation

Each SDLC stage is driven by its corresponding persona loaded from `core/personas/<name>.md` as the LLM system prompt:

| Stage | Command | Persona | Output |
|---|---|---|---|
| Project discovery | `aitri discover-idea` | `discovery.md` | `.aitri/discovery.md` |
| Product spec | `aitri product-spec` | `product.md` | `.aitri/product-spec.md` |
| UX design | `aitri ux-design` | `ux-ui.md` | `.aitri/ux-design.md` |
| Architecture | `aitri arch-design` | `architect.md` | `.aitri/architecture-decision.md` |
| Security review | `aitri sec-review` | `security.md` | `.aitri/security-review.md` |
| QA planning | `aitri qa-plan` | `qa.md` | `.aitri/qa-plan.md` |
| Dev roadmap | `aitri dev-roadmap` | `developer.md` | `.aitri/dev-roadmap.md` |
| Spec review | `aitri spec-improve` | `architect.md` | suggestions JSON |
| Test generation | `aitri testgen` | `qa.md` | test implementations |
| Contract impl | `aitri contractgen` | `developer.md` | contract implementations |
| Audit (technical) | `aitri audit` | `architect.md` | findings |
| Audit (drift) | `aitri audit` | `security.md` | findings |
| Audit (implementation) | `aitri audit` | `developer.md` | findings |
| Audit (UX) | `aitri audit` | `ux-ui.md` | findings (if `.aitri/ux-design.md` exists) |

---

## Command Flow

### Pre-Planning (Persona-Driven — run once per project)
0a. `aitri discover-idea` — Discovery Facilitator produces structured discovery artifact
0b. `aitri product-spec` — Product Manager produces product specification
0c. `aitri ux-design` — Experience Designer produces UX design document (`--no-ux` for non-UI)
0d. `aitri arch-design` — System Architect produces architecture decision document
0e. `aitri sec-review` — Security Champion produces security review
0f. `aitri qa-plan` — Quality Engineer produces QA plan
0g. `aitri dev-roadmap` — Lead Developer produces implementation roadmap

Pre-planning artifacts are stored in `.aitri/` and **automatically consumed** by:
- `aitri draft` — injects dev-roadmap as context in the spec
- `aitri plan` — injects architecture, security, UX artifacts into the plan document
- `aitri build` — injects architecture and security context into implementation briefs

### Pre-Go (Per-Feature Governance)
1. `aitri init` — initialize project structure
2. `aitri draft` — create draft spec (enriched with dev-roadmap context if available)
3. `aitri spec-improve` — System Architect persona reviews spec for quality issues
4. `aitri approve` — validate and lock spec
5. `aitri plan` — discovery interview + generate plan, backlog, and tests from spec (enriched with pre-planning artifacts)
   - Default: Aitri infers from spec
   - Auditor Mode: `--ai-backlog <file> --ai-tests <file>` — validate agent-authored content before writing
6. `aitri verify-intent` — semantic validation: US satisfies FR intent (LLM)
7. `aitri diff --proposed <file>` — compare current backlog against proposed update
8. `aitri go` — unlock implementation mode

### Post-Go (Factory)
9. `aitri build` — scaffold test stubs with contract imports + interface stubs (briefs enriched with architecture context)
10. `aitri testgen` — Quality Engineer persona generates behavioral test bodies from FR + AC + contract signatures
11. `aitri contractgen` — Lead Developer persona implements contract functions from FR text + AC + test stubs
12. `aitri prove` — execute TC stubs, generate proof-of-compliance.json per FR
    - `--mutate` — mutation testing: 9 operator mutations, advisory confidence score
13. `aitri deliver` — final gate: all FRs proven, delivery record written

### Post-Delivery
- `aitri audit` — 4-persona technical audit: Architect (technical) + Security (drift) + Developer (implementation) + UX/UI (if applicable)

### Local Preview (side tool — not a pipeline step)
- `aitri serve` — detect stack, resolve entry point, start dev server; `--entry`, `--dry-run`, `--open`, `--json`

### Session Continuity
- `aitri checkpoint [message]` — save state
- `aitri resume` — Step N of M pipeline checklist + Next + Why; `--json` for CI

### Brownfield Onboarding
- `aitri adopt` — Phase 1: scan stack, conventions, entry points
- `aitri adopt --depth standard` — Phase 2: LLM infers DRAFT specs + discovery docs
- `aitri adopt --depth deep` — Phase 3: map existing tests → TC-* stubs
- `aitri upgrade` — apply version-aware migrations to projects built with older Aitri versions

---

## Auditor Mode

The preferred agent flow. The agent authors content; Aitri audits before writing.

```bash
aitri plan --feature <name> --ai-backlog agent-backlog.md --ai-tests agent-tests.md
```

Aitri validates:
- Every US has a `Trace:` line
- Every FR-* referenced exists in the approved spec
- Every AC-* referenced exists in the approved spec
- Every TC has a `Trace:` line referencing valid US-* and FR-*

If validation fails, nothing is written. Fix the reported issues and retry.

---

## Artifact Topology

```
.aitri/                           # Project-level (pre-planning artifacts)
  DEV_STATE.md                    # current session checkpoint
  discovery.md                    # Discovery Facilitator output
  product-spec.md                 # Product Manager output
  ux-design.md                    # Experience Designer output
  architecture-decision.md        # System Architect output
  security-review.md              # Security Champion output
  qa-plan.md                      # Quality Engineer output
  dev-roadmap.md                  # Lead Developer output

specs/
  drafts/<feature>.md             # DRAFT — not enforced
  approved/<feature>.md           # APPROVED — enforcement starts here

docs/
  discovery/<feature>.md
  plan/<feature>.md
  implementation/<feature>/proof-of-compliance.json
  implementation/<feature>/scaffold-manifest.json
  implementation/<feature>/build-manifest.json
  delivery/<feature>.json
  adoption-manifest.json          # written by aitri adopt
  project.json                    # aitriVersion + migrationsApplied

backlog/<feature>/backlog.md
tests/<feature>/tests.md
tests/<feature>/generated/        # test stubs from aitri build

src/contracts/                    # contract stubs (FR-N implementations)
```

---

## Agent Integration Contract

**Session start:**
```bash
aitri resume json   # read recommendedCommand
```

**Pre-planning (once per project):**
```bash
aitri discover-idea --idea "<raw idea>"
aitri product-spec
aitri ux-design          # skip with --no-ux for non-UI
aitri arch-design
aitri sec-review
aitri qa-plan
aitri dev-roadmap
```

**Pre-go (per feature):**
```bash
aitri draft --feature <name> --idea "<intent>"
aitri spec-improve --feature <name>
aitri approve --feature <name>
aitri plan --feature <name>
aitri go --feature <name> --yes
```

**Post-go (full automated cycle):**
```bash
aitri build --feature <name>
aitri testgen --feature <name>
aitri contractgen --feature <name>
aitri prove --feature <name> --mutate
aitri serve --feature <name> --dry-run   # optional: verify start command
aitri deliver --feature <name>
```

**Session end:**
```bash
aitri checkpoint "<what was done — next: <what to do>"
```

---

## AI Configuration (for LLM-powered commands)

Add to `aitri.config.json`:
```json
{
  "ai": {
    "provider": "claude",
    "model": "claude-sonnet-4-6",
    "apiKeyEnv": "ANTHROPIC_API_KEY"
  }
}
```

Required by: all pre-planning commands, `spec-improve`, `verify-intent`, `aitri adopt --depth standard`,
`aitri testgen`, `aitri contractgen`, `aitri audit` (layer 4).

---

## Governance

Documentation changes that affect workflow or scope must update:
1. `docs/architecture.md` (this file)
2. `adapters/*/SKILL.md` (agent-facing contract)

Do not create new `docs/` files without deleting an equivalent-weight existing file. See `docs/DOC_POLICY.md`.
