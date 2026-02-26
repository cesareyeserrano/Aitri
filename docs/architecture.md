# Aitri: Architecture and Operating Model

## What Aitri Is

Aitri is a **spec enforcement CLI** for AI-assisted software delivery.

It enforces one rule: no artifact (backlog, test stub, contract, proof) can exist without a human-approved specification that precedes it.

It operates as a **skill consumed by AI agents** (Claude, Codex, OpenCode) as their system of record, and is also available for direct terminal use.

**What Aitri does:**
- Validates that agent-generated content (backlogs, test cases) traces back to approved spec sections (FR-*, AC-*)
- Blocks writes when traceability is missing
- Generates test stubs, contract placeholders, behavioral tests, and contract implementations from approved specs
- Tracks delivery gates: spec → backlog → tests → build → testgen → contractgen → prove → deliver
- Supports existing projects via `aitri adopt` (scan + LLM infer + test map)

**What Aitri does not do:**
- Generate requirements — requirements must come from the user
- Guarantee correctness of LLM-generated content, only structural traceability
- Replace human judgment at approval gates

---

## Roles

| Role | Responsibility |
|------|----------------|
| **Human** | Provides intent, approves specs, authorizes delivery |
| **AI agent** | Authors backlog, tests, contracts, and code under Aitri's format contracts |
| **Aitri** | Validates traceability, enforces gates, generates structured scaffolding |

---

## Non-Negotiable Principles

1. **Spec first.** No downstream artifact without `specs/approved/<feature>.md`.
2. **Explicit gates.** Irreversible operations (`approve`, `go`) require confirmation. Automation requires `--yes`. Reversible commands run without prompt.
3. **Traceability required.** Spec → Backlog → Tests → Implementation. Every item has a traceable ID.
4. **Human authority.** Final decisions always remain with the human owner.
5. **Requirement source integrity.** Requirements come from explicit user input. Aitri does not invent them.
6. **Idempotent writes.** Running any command twice must not corrupt state.

---

## Command Flow

### Pre-Go (Governance)
1. `aitri init` — initialize project structure
2. `aitri draft` — create draft spec from idea
3. `aitri spec-improve` — AI quality review of spec (identifies ambiguous FRs, missing edge cases)
4. `aitri approve` — validate and lock spec
5. `aitri plan` — structured discovery interview + generate plan, backlog, and tests from spec
   - Default: Aitri infers from spec
   - Auditor Mode: `--ai-backlog <file> --ai-tests <file>` — validate agent-authored content before writing
6. `aitri verify-intent` — semantic validation: US satisfies FR intent (LLM)
7. `aitri diff --proposed <file>` — compare current backlog against proposed update
8. `aitri go` — unlock implementation mode

### Post-Go (Factory)
9. `aitri build` — scaffold test stubs with contract imports + interface stubs
10. `aitri testgen` — LLM generates behavioral test bodies from FR + AC + contract signatures
11. `aitri contractgen` — LLM implements contract functions from FR text + AC + test stubs
12. `aitri prove` — execute TC stubs, generate proof-of-compliance.json per FR
    - `--mutate` — mutation testing: 9 operator mutations, advisory confidence score
13. `aitri deliver` — final gate: all FRs proven, delivery record written

### Local Preview (side tool — not a pipeline step)
- `aitri serve` — detect stack, resolve entry point, start dev server; warns if `prove` not passed; `--entry`, `--dry-run`, `--open`, `--json`

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
specs/
  drafts/<feature>.md       # DRAFT — not enforced
  approved/<feature>.md     # APPROVED — enforcement starts here

docs/
  discovery/<feature>.md
  plan/<feature>.md
  implementation/<feature>/proof-of-compliance.json
  implementation/<feature>/scaffold-manifest.json
  implementation/<feature>/build-manifest.json
  delivery/<feature>.json
  adoption-manifest.json    # written by aitri adopt
  project.json              # aitriVersion + migrationsApplied

backlog/<feature>/backlog.md
tests/<feature>/tests.md
tests/<feature>/generated/  # test stubs from aitri build

src/contracts/              # contract stubs (FR-N implementations)
.aitri/DEV_STATE.md         # current session checkpoint
```

---

## Agent Integration Contract

**Session start:**
```bash
aitri resume json   # read recommendedCommand
```

**Pre-go:**
```bash
aitri draft --feature <name> --idea "<intent>"
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

Required by: `spec-improve`, `verify-intent`, `aitri adopt --depth standard`,
`aitri testgen`, `aitri contractgen`.

---

## Governance

Documentation changes that affect workflow or scope must update:
1. `docs/architecture.md` (this file)
2. `adapters/*/SKILL.md` (agent-facing contract)

Do not create new `docs/` files without deleting an equivalent-weight existing file. See `docs/DOC_POLICY.md`.
