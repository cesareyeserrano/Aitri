# Aitri

**Spec-driven SDLC engine for AI-assisted development.**

![npm](https://img.shields.io/npm/v/aitri) ![node](https://img.shields.io/node/v/aitri) ![license](https://img.shields.io/npm/l/aitri)

```bash
npm install -g aitri
```

Aitri structures AI-assisted development into a reviewable pipeline. Each phase produces a versioned artifact. You approve it before the next phase starts. Works with any agent that reads stdout: Claude Code, Codex, Gemini Code, Opencode, or any shell-based workflow.

---

## How It Works

Aitri is a **briefing engine** — it does not call AI models or write code. It generates structured prompts that your agent reads and acts on.

The workflow for every phase is the same three steps:

```
aitri run-phase <N>   →   agent reads briefing, saves artifact
aitri complete <N>    →   Aitri validates the artifact schema
aitri approve <N>     →   you review + approve → unlocks next phase
```

No phase advances automatically. The pipeline is always under human control.

---

## Pipeline

| Phase | Persona | Artifact |
| :--- | :--- | :--- |
| [optional] Discovery | Facilitator | `spec/00_DISCOVERY.md` |
| **1 — Requirements** | Product Manager | `spec/01_REQUIREMENTS.json` |
| [optional] UX | UX Designer | `spec/01_UX_SPEC.md` |
| **2 — Architecture** | Software Architect | `spec/02_SYSTEM_DESIGN.md` |
| **3 — Test Design** | QA Engineer | `spec/03_TEST_CASES.json` |
| **4 — Implementation** | Developer | `spec/04_IMPLEMENTATION_MANIFEST.json` |
| [optional] Code Review | Reviewer | `spec/04_CODE_REVIEW.md` |
| ✦ Verify _(required gate)_ | — | `spec/04_TEST_RESULTS.json` |
| **5 — Deployment** | DevOps Engineer | `spec/05_PROOF_OF_COMPLIANCE.json` |

Each artifact is the handoff contract to the next phase. Optional phases enrich the pipeline but never block it.

---

## Quick Start

```bash
mkdir my-app && cd my-app
aitri init
```

`aitri init` creates:

- `IDEA.md` — describe your project here
- `AGENTS.md` — pipeline rules for any AI agent in this repo
- `spec/` — all pipeline artifacts are saved here
- `idea/` — drop mockups, PDFs, or Figma exports here; referenced automatically in every briefing

Fill in `IDEA.md`, then run the pipeline:

```bash
# Phase 1 — Requirements
aitri run-phase 1
# → agent reads briefing, saves spec/01_REQUIREMENTS.json
aitri complete 1
aitri approve 1

# Phase 2 — Architecture
aitri run-phase 2
# → agent reads briefing, saves spec/02_SYSTEM_DESIGN.md
aitri complete 2
aitri approve 2

# Phases 3 and 4 — same pattern
aitri run-phase 3 && aitri complete 3 && aitri approve 3
aitri run-phase 4 && aitri complete 4 && aitri approve 4

# Test gate — required before Phase 5
aitri verify-run        # executes your test suite, parses results
aitri verify-complete   # confirms all test cases pass and all FRs are covered

# Phase 5 — Deployment
aitri run-phase 5
aitri complete 5
aitri approve 5
```

---

## Command Reference

### Setup

| Command | Description |
| :--- | :--- |
| `aitri init` | Initialize a new project. Creates `IDEA.md`, `AGENTS.md`, `spec/`, `idea/`. |
| `aitri init <path>` | Initialize at the specified path instead of the current directory. |
| `aitri wizard` | Guided interview that writes `IDEA.md` from your answers. |
| `aitri wizard --depth quick\|standard\|deep` | Control interview depth. Default: `standard`. |

### Core loop

| Command | Description |
| :--- | :--- |
| `aitri run-phase <phase>` | Print the phase briefing to stdout. Your agent reads it and produces the artifact. |
| `aitri run-phase <phase> --feedback "..."` | Re-run with feedback from a previous rejection applied to the briefing. |
| `aitri complete <phase>` | Validate the artifact schema and record the phase as complete. |
| `aitri complete <phase> --check` | Dry-run validation — reports pass/fail without writing any state. |
| `aitri approve <phase>` | Approve the phase after completing the human review checklist. Unlocks the next phase. |
| `aitri reject <phase> --feedback "..."` | Reject and record feedback. Injected automatically in the next `run-phase`. |

`<phase>` accepts: `1` `2` `3` `4` `5` `discovery` `ux` `review`

### Test gate

| Command | Description |
| :--- | :--- |
| `aitri verify-run` | Execute the test suite and parse results against `03_TEST_CASES.json`. |
| `aitri verify-run --cmd "pytest -v"` | Use a custom test command instead of auto-detection. |
| `aitri verify-complete` | Confirm full TC coverage and FR compliance. Required to unlock Phase 5. |

Auto-detects: Jest, Vitest, Pytest, Playwright.

### Inspection

| Command | Description |
| :--- | :--- |
| `aitri status` | Pipeline status: approved, pending, and drifted phases. |
| `aitri status --json` | Machine-readable project snapshot (root + features + health + prioritized next actions). |
| `aitri validate` | Full artifact audit: presence, approval status, drift flags, deployment files, deploy-gate reasoning. |
| `aitri validate --json` | Machine-readable JSON output. |
| `aitri validate --explain` | Expanded text output — enumerates deploy-gate reasons inline. |
| `aitri resume` | Full session briefing — pipeline state, features, health, last session, open requirements, test coverage, tech debt, priority-ordered next actions. |

### Tracking (bugs, backlog, audit)

| Command | Description |
| :--- | :--- |
| `aitri bug add --title "..." [--severity critical\|high\|medium\|low] [--fr FR-XXX] [--tc TC-NNN]` | Register a bug in `spec/BUGS.json`. |
| `aitri bug list` / `fix <id>` / `verify <id>` / `close <id>` | Lifecycle: `open → fixed → verified → closed`. |
| `aitri tc verify <TC-ID> --result pass\|fail --notes "..."` | Record a manual TC execution (for `automation: "manual"` TCs). Counts toward `04_TEST_RESULTS.json` summary. |
| `aitri backlog [list\|add\|done]` | Project-level tech-debt backlog in `spec/BACKLOG.json`. |
| `aitri review` | Cross-artifact semantic consistency check (requirements → TCs → results). Optional before verify-run. |
| `aitri audit` | On-demand holistic audit — agent writes `spec/AUDIT_REPORT.md` with findings (bugs, backlog, observations). Off-pipeline. |
| `aitri audit plan` | Read `AUDIT_REPORT.md` and propose exact `bug add` / `backlog add` commands for each finding. |
| `aitri normalize` | Baseline off-pipeline code changes after Phase 4 approval — prevents silent drift outside the briefing→complete→approve loop. |

### Checkpoints

| Command | Description |
| :--- | :--- |
| `aitri checkpoint` | Save the current `resume` output to `checkpoints/<date>.md`. Committable to git. |
| `aitri checkpoint --name <label>` | Save with a named label: `checkpoints/<date>-<label>.md`. |
| `aitri checkpoint --list` | List all saved checkpoints. |

### Features

Add new functionality to a completed project without reopening approved phases.

| Command | Description |
| :--- | :--- |
| `aitri feature init <name>` | Create a scoped sub-pipeline under `features/<name>/`. Inherits parent requirements. |
| `aitri feature run-phase <name> <phase>` | Phase briefing scoped to the feature. |
| `aitri feature complete <name> <phase>` | Validate the feature artifact. |
| `aitri feature approve <name> <phase>` | Approve the feature phase. |

### Adoption

Bring an existing project into the Aitri pipeline.

| Command | Description |
| :--- | :--- |
| `aitri adopt scan` | Scan the codebase → `ADOPTION_SCAN.md` (technical diagnostic) + `IDEA.md` (stabilization brief). |
| `aitri adopt apply` | Initialize `.aitri` state from `IDEA.md`. Then run the pipeline from Phase 1. |
| `aitri adopt apply --from <N>` | Enter the pipeline at Phase N. Use when prior artifacts already exist. |
| `aitri adopt --upgrade` | Sync an existing Aitri project to the current CLI version. Non-destructive. |

---

## Phase Reference

### Phase 1 — Requirements

**Artifact:** `spec/01_REQUIREMENTS.json`
**Reads:** `IDEA.md`, `spec/00_DISCOVERY.md` (if present)

Produces functional requirements (FRs), non-functional requirements (NFRs), user stories, and constraints. Every MUST-priority FR includes acceptance criteria specific enough to write a test against. Aitri validates FR count, AC specificity, and schema on `complete`.

### Phase 2 — Architecture

**Artifact:** `spec/02_SYSTEM_DESIGN.md`
**Reads:** `spec/01_REQUIREMENTS.json`, `spec/01_UX_SPEC.md` (if present)

Tech stack with justifications, data model, API design, security design, performance strategy, deployment architecture, and risk analysis.

### Phase 3 — Test Design

**Artifact:** `spec/03_TEST_CASES.json`
**Reads:** `spec/01_REQUIREMENTS.json`, `spec/02_SYSTEM_DESIGN.md`

Test cases mapped to every MUST-priority FR, each with a precise expected result. Aitri validates on `complete` that every MUST FR has at least one test case and that no placeholder results remain.

### Phase 4 — Implementation

**Artifact:** `spec/04_IMPLEMENTATION_MANIFEST.json`
**Reads:** `spec/01_REQUIREMENTS.json`, `spec/02_SYSTEM_DESIGN.md`, `spec/03_TEST_CASES.json`

File structure, component breakdown, setup commands, and a technical debt register. When re-running Phase 4 after failing tests, Aitri automatically injects the failing test cases into the briefing.

### Phase 5 — Deployment

**Artifact:** `spec/05_PROOF_OF_COMPLIANCE.json`
**Reads:** All prior artifacts + `spec/04_TEST_RESULTS.json`
**Requires:** `aitri verify-complete` to have passed

Deployment configuration (Dockerfile, docker-compose) and a compliance record mapping every MUST FR to its verification evidence.

---

## Optional Phases

### Discovery — before Phase 1

**Artifact:** `spec/00_DISCOVERY.md`

Structured problem definition: the problem, the users, success criteria, and explicit out-of-scope decisions. Phase 1 reads it automatically when present.

```bash
aitri run-phase discovery
aitri complete discovery
aitri approve discovery
```

### UX Specification — after Phase 1, before Phase 2

**Artifact:** `spec/01_UX_SPEC.md`

User flows, screen inventory, component states (default, loading, error, empty, disabled), and Nielsen usability compliance. Phase 2 reads it automatically when present.

When Phase 1 requirements include `ux`, `visual`, or `audio` FRs, `aitri approve 1` will direct you here before allowing Phase 2.

```bash
aitri run-phase ux
aitri complete ux
aitri approve ux
```

### Code Review — after Phase 4, before verify

**Artifact:** `spec/04_CODE_REVIEW.md`

Independent review of the implementation against requirements and test specs. Surfaces coverage gaps and deviations before running the test suite.

```bash
aitri run-phase review
aitri complete review
aitri approve review
```

---

## Resuming a Session

When returning to a project or starting a new agent session:

```bash
aitri resume
```

Prints pipeline state, open requirements, test coverage by FR, technical debt, rejection history, and the exact next command. Paste it directly into your agent's context window.

If the CLI version has changed since the project was initialized, `aitri resume` will detect the mismatch and prompt you to upgrade first:

```bash
aitri adopt --upgrade   # non-destructive — preserves all approvals
aitri resume
```

---

## Drift Detection

If an approved artifact is edited directly — outside of the normal `run-phase` → `complete` → `approve` flow — Aitri detects the change by comparing the file's current hash against the hash recorded at approval time.

```bash
aitri status    # ⚠ DRIFT shown next to affected phases
aitri validate  # drift included in artifact audit
```

Agents are blocked from re-approving after drift. Re-approval requires a human to run `aitri approve <phase>` interactively in a terminal.

---

## Working with AI Agents

Every Aitri project includes `AGENTS.md` at the root — a set of pipeline rules automatically read by Claude Code, Codex, and other agents that support instruction files.

Rules enforced by `AGENTS.md`:

- Run `aitri resume` at the start of every session
- Follow the `PIPELINE INSTRUCTION` printed at the end of each command output
- Do not reopen approved phases or implement before Phase 4 is approved
- Use `aitri feature init <name>` for any change that modifies existing artifact behavior

---

## Customizing Best Practices

Aitri automatically injects engineering standards into each phase briefing. The defaults cover architecture, testing, implementation, and UX/UI — language-agnostic and stack-agnostic.

| Phase | Default standards injected |
| :--- | :--- |
| Phase 2 — Architecture | Separation of concerns, security by design, ADR discipline, API contracts, data consistency |
| Phase 3 — Test Design | Concrete values, test isolation, boundary cases, security TCs, performance TCs |
| Phase 4 — Implementation | Injection prevention, structured logging, DB discipline, dependency hygiene |
| UX — UX Specification | Mobile-first, WCAG 2.1 AA, component states, progressive disclosure, design tokens |

**Project-level overrides:** place a `best-practices/` folder at your project root with one or more of these files:

```
my-project/
  best-practices/
    architecture.md   # overrides Phase 2 standards
    testing.md        # overrides Phase 3 standards
    development.md    # overrides Phase 4 standards
    ux.md             # overrides UX phase standards
```

When a project-level file exists, it replaces the global default for that phase. Use this to enforce team conventions, language-specific standards (Go, Python, Rust), or domain-specific rules (HIPAA, GDPR, financial compliance).

---

## Requirements

- Node.js 18 or later
- No external npm dependencies

## License

Apache 2.0 — © César Augusto Reyes Serrano
