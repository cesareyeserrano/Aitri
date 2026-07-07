# Aitri

**The harness that makes agentic engineering rigorous — your agent's work becomes a reviewable, gated pipeline, so you ship software you actually reviewed, not whatever the agent happened to produce.**

![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![license](https://img.shields.io/badge/license-Apache_2.0-blue) ![channel](https://img.shields.io/badge/channel-2.0.0--rc_(pre--release)-orange)

```bash
# current line of development (2.0.0-rc channel) — install from GitHub:
npm install -g github:cesareyeserrano/Aitri

# for a reproducible install, pin a commit SHA instead:
npm install -g github:cesareyeserrano/Aitri#<sha>
```

> **Do not `npm install -g aitri`.** The npm registry is frozen at `0.1.25` — roughly 150 releases old and contract-incompatible with everything documented here. Publishing resumes when 2.0.0 promotes to stable (promotion criterion: `docs/CHANGELOG.md` header).

AI agents write code fast — and that's the problem. The spec lives in a chat that scrolls away, the code drifts from the original intent, and "done" means "the agent stopped," not "this was reviewed." Aitri puts the structure back: development becomes a pipeline of phases, each producing a **versioned artifact** — requirements, design, tests, build, traceability — that **must pass an explicit review-and-approve step before the next phase unlocks**.

It works with **any agent that reads stdout** — Claude Code, Codex, Gemini CLI, Opencode, or a plain shell. Aitri never calls a model or writes code itself: it generates the briefing your agent acts on, then validates and gates what comes back.

### What you get

- **Gated phases** — every artifact must pass schema validation (`complete`) and an explicit `approve` step before the pipeline moves on. **By default an agent may run `approve`** — it is instructed to present the review checkpoint to you first, but that relay is on the agent's honor. Set `"humanApprovalGate": true` in `.aitri` to make every approval a hard interactive stop only a human at a terminal can pass.
- **Specs as contracts** — each phase's output is the typed handoff to the next; editing an approved artifact behind Aitri's back is detected as *drift*, and re-approving after drift always requires a human.
- **A real test gate** — code can't reach deployment until your tests run, pass, and every MUST requirement traces to a passing test.
- **Traceability, written down and checkable** — requirement → test → result, recorded in artifacts you can audit.

### What is mechanical vs. what is attested

Aitri enforces in two different ways, and is honest about which is which:

- **Mechanical (Aitri executes and gates):** artifact schemas, phase ordering, the MUST-requirement→passing-test join (`verify-complete`), drift hashes on approved artifacts, and your project's declared quality gates (lint, type-check, security scan) judged by exit code.
- **Attested (the agent writes, you review):** the content of requirements, the quality of tests, build-report declarations, audit self-reports, and — in default agent mode — the approve relay itself.

The harness makes drops and drift **visible and catchable, not impossible**. The review checkpoints exist so a human catches what the mechanics cannot.

---

## How It Works

The loop is the same three steps for every phase:

```
aitri run-phase <N>   →   your agent reads the briefing, writes the artifact
aitri complete <N>    →   Aitri validates the artifact against its schema
aitri approve <N>     →   you review + approve → the next phase unlocks
```

A phase never unlocks without an explicit `approve`. Who runs it is your configuration choice: by default your agent may, relaying the review checkpoint to you; with `"humanApprovalGate": true` in `.aitri`, only a human at a terminal can.

---

## Pipeline

| Phase | Persona | Artifact |
| :--- | :--- | :--- |
| [optional] Discovery | Facilitator | `00_DISCOVERY.md` |
| **1 — Requirements** | Product Manager | `01_REQUIREMENTS.json` |
| [optional] UX | UX Designer | `01_UX_SPEC.md` |
| **2 — Architecture** | Software Architect | `02_SYSTEM_DESIGN.md` |
| **3 — Test Design** | QA Engineer | `03_TEST_CASES.json` |
| **4 — Implementation** | Developer | `04_BUILD_REPORT.json` |
| [optional] Code Review | Reviewer | `04_CODE_REVIEW.md` |
| ✦ Verify _(required gate)_ | — | `04_TEST_RESULTS.json` |
| **5 — Deployment** | DevOps Engineer | `05_TRACEABILITY.json` |

Each artifact is the handoff contract to the next phase. Optional phases enrich the pipeline but never block it. New projects keep all artifacts under `aitri/product/spec/` (the contained layout — see Quick Start); projects from before the contained layout keep them in a root `spec/` until they opt into migration.

---

## Quick Start

```bash
mkdir my-app && cd my-app
aitri init
```

`aitri init` creates one `aitri/` container holding everything it owns, plus the per-agent instruction files at the project root:

- `aitri/product/IDEA.md` — describe your project here
- `AGENTS.md` (and `CLAUDE.md`, `GEMINI.md`, …) — pipeline rules for any AI agent in this repo (at the root, where agents look)
- `aitri/product/spec/` — all pipeline artifacts are saved here
- `aitri/product/idea_context/` — drop mockups, PDFs, or Figma exports here; referenced automatically in every briefing
- `aitri/features/<name>/` — each feature is its own sub-pipeline (created by `aitri feature init`)

`.aitri` (pipeline state) stays at the project root. Aitri's briefings always print the exact, layout-correct path to save each artifact — you never hardcode them. Projects created before the contained layout keep the flat shape (`IDEA.md` + `spec/` at the root) and can migrate with `aitri adopt --upgrade --layout`.

Fill in `aitri/product/IDEA.md`, then run the pipeline:

```bash
# Phase 1 — Requirements
aitri run-phase 1
# → agent reads briefing, saves aitri/product/spec/01_REQUIREMENTS.json
aitri complete 1
aitri approve 1

# Phase 2 — Architecture
aitri run-phase 2
# → agent reads briefing, saves aitri/product/spec/02_SYSTEM_DESIGN.md
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
| `aitri init` | Initialize a new project. Creates the `aitri/` container (`aitri/product/IDEA.md`, `aitri/product/spec/`, `aitri/product/idea_context/`) + the per-agent instruction files at the root. |
| `aitri init <path>` | Initialize at the specified path instead of the current directory. |
| `aitri wizard` | Guided interview that writes `IDEA.md` from your answers. |
| `aitri wizard --depth quick\|standard\|deep` | Control interview depth. Default: `quick`. |

### Core loop

| Command | Description |
| :--- | :--- |
| `aitri run-phase <phase>` | Print the phase briefing to stdout. Your agent reads it and produces the artifact. |
| `aitri run-phase <phase> --feedback "..."` | Re-run with feedback from a previous rejection applied to the briefing. |
| `aitri complete <phase>` | Validate the artifact schema and record the phase as complete. |
| `aitri complete <phase> --check` | Dry-run validation — reports pass/fail without writing any state. |
| `aitri approve <phase>` | Approve the phase after completing the human review checklist. Unlocks the next phase. |
| `aitri approve <phase> --show` | Print the full artifact content before the checklist — review what you're approving, not just a summary. |
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
| `aitri bug add --title "..." [--severity critical\|high\|medium\|low] [--fr FR-XXX] [--tc TC-NNN]` | Register a bug in the pipeline's `BUGS.json` (under the artifacts dir). |
| `aitri bug list` / `fix <id>` / `verify <id>` / `close <id>` | Lifecycle: `open → fixed → verified → closed`. |
| `aitri tc verify <TC-ID> --result pass\|fail --notes "..."` | Record a manual TC execution (for `automation: "manual"` TCs). Counts toward `04_TEST_RESULTS.json` summary. |
| `aitri backlog [list\|add\|done]` | Project-level tech-debt backlog in the pipeline's `BACKLOG.json` (under the artifacts dir). |
| `aitri review` | Cross-artifact semantic consistency check (requirements → TCs → results). Optional before verify-run. |
| `aitri audit` | On-demand holistic audit — agent writes `AUDIT_REPORT.md` (under the artifacts dir) with findings (bugs, backlog, observations). Off-pipeline. |
| `aitri audit plan` | Read `AUDIT_REPORT.md` and propose exact `bug add` / `backlog add` commands for each finding. |
| `aitri reconcile` | Baseline off-pipeline code changes after Phase 4 approval — prevents silent drift outside the briefing→complete→approve loop. |

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

Bring an existing project into the Aitri pipeline — either to stabilize/institutionalize it, or to pursue a specific objective in it (a migration, a feature, a refactor, a security fix).

| Command | Description |
| :--- | :--- |
| `aitri adopt` | Guided start: scaffold the objective seed (`IDEA.md`) + the doc home (`idea_context/`) and point you to scan. State your objective, drop supporting docs, then scan. |
| `aitri adopt scan` | Scan the codebase → `ADOPTION_AUDIT.md` (technical diagnostic, consumed by Phases 1-3) + `IDEA.md` (adoption brief — a specific objective if you have one, else whole-project stabilization). |
| `aitri adopt apply` | Initialize `.aitri` state from `IDEA.md`. Then run the pipeline from Phase 1. |
| `aitri adopt apply --from <N>` | Enter the pipeline at Phase N. Use when prior artifacts already exist. |
| `aitri adopt --upgrade` | Sync an existing Aitri project to the current CLI version. Non-destructive. |

---

## Phase Reference

### Phase 1 — Requirements

**Artifact:** `01_REQUIREMENTS.json`
**Reads:** `IDEA.md`, `00_DISCOVERY.md` (if present)

Produces functional requirements (FRs), non-functional requirements (NFRs), user stories, and constraints. Every MUST-priority FR includes acceptance criteria specific enough to write a test against. Aitri validates FR count, AC specificity, and schema on `complete`.

### Phase 2 — Architecture

**Artifact:** `02_SYSTEM_DESIGN.md`
**Reads:** `01_REQUIREMENTS.json`, `01_UX_SPEC.md` (if present)

Tech stack with justifications, data model, API design, security design, performance strategy, deployment architecture, and risk analysis.

### Phase 3 — Test Design

**Artifact:** `03_TEST_CASES.json`
**Reads:** `01_REQUIREMENTS.json`, `02_SYSTEM_DESIGN.md`

Test cases mapped to every MUST-priority FR, each with a precise expected result. Aitri validates on `complete` that every MUST FR has at least one test case and that no placeholder results remain.

### Phase 4 — Implementation

**Artifact:** `04_BUILD_REPORT.json`
**Reads:** `01_REQUIREMENTS.json`, `02_SYSTEM_DESIGN.md`, `03_TEST_CASES.json`

File structure, component breakdown, setup commands, and a technical debt register. When re-running Phase 4 after failing tests, Aitri automatically injects the failing test cases into the briefing.

### Phase 5 — Deployment

**Artifact:** `05_TRACEABILITY.json`
**Reads:** All prior artifacts + `04_TEST_RESULTS.json`
**Requires:** `aitri verify-complete` to have passed

Deployment configuration (Dockerfile, docker-compose) and a compliance record mapping every MUST FR to its verification evidence.

---

## Optional Phases

### Discovery — before Phase 1

**Artifact:** `00_DISCOVERY.md`

Structured problem definition: the problem, the users, success criteria, and explicit out-of-scope decisions. Phase 1 reads it automatically when present.

```bash
aitri run-phase discovery
aitri complete discovery
aitri approve discovery
```

### UX Specification — after Phase 1, before Phase 2

**Artifact:** `01_UX_SPEC.md`

User flows, screen inventory, component states (default, loading, error, empty, disabled), and Nielsen usability compliance. Phase 2 reads it automatically when present.

When Phase 1 requirements include `ux`, `visual`, or `audio` FRs, `aitri approve 1` will direct you here before allowing Phase 2.

```bash
aitri run-phase ux
aitri complete ux
aitri approve ux
```

### Code Review — after Phase 4, before verify

**Artifact:** `04_CODE_REVIEW.md`

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
