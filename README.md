<p align="center">
  <img src="assets/aitri-avatar.png" alt="Aitri" width="200" />
</p>

<h1 align="center">Aitri</h1>

<p align="center">
  <strong>Spec-driven software factory for AI agents.</strong><br/>
  From idea to shipped feature — with requirements, architecture, tests, QA verification, and delivery gates enforced at every step.
</p>

---

## What Aitri Is

Aitri is a **CLI tool and agent skill** that enforces a full software delivery lifecycle in any project, whether built by humans or AI agents.

It follows the same flow as professional software development:

```
Idea → Discovery → Spec → Architecture → Security → Plan → Build → Tests → QA → Ship
```

At each stage, a specialized AI persona (product manager, architect, security champion, QA engineer, etc.) produces a structured artifact. The next stage cannot begin without the previous artifact in place. Human approval gates ensure you stay in control.

**What Aitri enforces:**
- Every feature starts from a human-approved specification with Functional Requirements (`FR-*`) and Acceptance Criteria (`AC-*`)
- Every backlog item, test case, and implementation contract traces back to an `FR-*` in the approved spec
- Tests run against contracts that implement the spec — producing a `proof-of-compliance.json`
- Independent QA verification runs each `AC-*` against the live running system before delivery is allowed
- Delivery blocks if any gate is missing, failing, or stale

**What Aitri does not do:**
- Generate requirements — those must come from you
- Replace human judgment at approval gates
- Ship anything without your explicit sign-off

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Aitri Globally](#2-install-aitri-globally)
3. [Install Aitri as an Agent Skill](#3-install-aitri-as-an-agent-skill)
4. [The Full SDLC Pipeline](#4-the-full-sdlc-pipeline)
5. [Pre-Planning: Persona-Driven Artifacts](#5-pre-planning-persona-driven-artifacts)
6. [Per-Feature Workflow](#6-per-feature-workflow)
7. [QA Verification](#7-qa-verification)
8. [Audit](#8-audit)
9. [Closing a Feature](#9-closing-a-feature)
10. [Brownfield Projects](#10-brownfield-projects)
11. [Session Continuity](#11-session-continuity)
12. [Command Reference](#12-command-reference)
13. [Configuration](#13-configuration)
14. [Troubleshooting](#14-troubleshooting)
15. [Contributor Validation](#15-contributor-validation)

---

## 1. Prerequisites

- **Node.js** `>=18` and `npm`
- **Git** (required for checkpoint and resume)
- One or more agent CLIs: [Claude Code](https://docs.claude.com/en/docs/claude-code/getting-started), [Codex CLI](https://github.com/openai/codex), [OpenCode](https://opencode.ai/docs/cli/), [Gemini CLI](https://github.com/google-gemini/gemini-cli)

---

## 2. Install Aitri Globally

Clone and install once. Aitri runs as a global CLI available in any project directory.

```bash
git clone https://github.com/cesareyeserrano/aitri.git
cd aitri
npm i -g .
hash -r
```

Verify:
```bash
aitri --version
aitri help
```

**To update after pulling new changes:**
```bash
cd /path/to/aitri
git pull origin main
npm i -g .
hash -r
aitri --version
```

---

## 3. Install Aitri as an Agent Skill

Each agent platform loads a `SKILL.md` that instructs the agent how to use Aitri. Install the adapter once; the agent reads it automatically on every session.

### Claude Code

**Personal install** (applies to all your projects):
```bash
mkdir -p ~/.claude/skills/aitri
cp /path/to/aitri/adapters/claude/SKILL.md ~/.claude/skills/aitri/SKILL.md
```

**Project install** (committed to version control):
```bash
mkdir -p .claude/skills/aitri
cp /path/to/aitri/adapters/claude/SKILL.md .claude/skills/aitri/SKILL.md
```

After install, start Claude Code in your target project and request:
```
Use the aitri skill and run: aitri resume
```

### Codex CLI

```bash
mkdir -p ~/.codex/skills/aitri
cp /path/to/aitri/adapters/codex/SKILL.md ~/.codex/skills/aitri/SKILL.md
```

Restart Codex, then in any project: `Use the aitri skill and run: aitri resume json`

### OpenCode

```bash
# Personal
mkdir -p ~/.config/opencode/skills/aitri
cp /path/to/aitri/adapters/opencode/SKILL.md ~/.config/opencode/skills/aitri/SKILL.md

# Project
mkdir -p .opencode/skills/aitri
cp /path/to/aitri/adapters/opencode/SKILL.md .opencode/skills/aitri/SKILL.md
```

### Gemini CLI

Aitri's Gemini adapter is optimized for Gemini's 1M token context window, enabling deep cross-feature traceability and full-project artifact analysis in a single session.

```bash
# Personal
mkdir -p ~/.gemini/skills/aitri
cp /path/to/aitri/adapters/gemini/SKILL.md ~/.gemini/skills/aitri/SKILL.md

# Project
mkdir -p .gemini/skills/aitri
cp /path/to/aitri/adapters/gemini/SKILL.md .gemini/skills/aitri/SKILL.md
```

> **All adapters require** Aitri to be installed globally (`npm i -g .`) before the skill can execute commands.

---

## 4. The Full SDLC Pipeline

Aitri enforces this pipeline for every feature. `aitri resume` always tells you the next step.

```
Phase 1 — Pre-Planning (once per project)
─────────────────────────────────────────
 discover-idea → product-spec → ux-design → arch-design → sec-review → qa-plan → dev-roadmap

Phase 2 — Per Feature
─────────────────────────────────────────
 1.  draft        Capture requirements into a draft spec
 2.  approve      Validate and lock the spec (human gate)
 3.  plan         Generate plan, backlog, and test cases from the spec
 4.  go           Architecture + security + human GO/NO-GO gate
 5.  build        Scaffold test stubs and implementation contracts
 6.  testgen      Generate behavioral test bodies from FR + AC
 7.  contractgen  Implement contract functions from FR + test stubs
 8.  prove        Run all TC stubs, map results to FR-IDs → proof-of-compliance.json
 9.  qa           Independently verify each AC against the live running system
 10. deliver      Final gate: all FRs proven, QA passed, workspace clean → SHIP
```

At any point:
```bash
aitri resume                    # shows current state + next command
aitri status --feature <name>   # detailed gate status
aitri close --feature <name>    # closure report after delivery
```

---

## 5. Pre-Planning: Persona-Driven Artifacts

Run these once per project, in order, before creating any feature. Each command uses a specialized AI persona and requires human approval before writing.

```bash
# Start from a raw idea
aitri discover-idea --idea "A task management app for remote teams"

# Product Manager refines it into structured product requirements
aitri product-spec

# Experience Designer defines the UX and interface requirements
aitri ux-design

# System Architect designs the technical approach and stack
aitri arch-design

# Security Champion reviews for threats and required controls
aitri sec-review

# Quality Engineer defines the QA strategy
aitri qa-plan

# Lead Developer creates the implementation roadmap
aitri dev-roadmap
```

Each command:
1. Reads the prerequisite artifacts from the previous step
2. Generates output using its persona's specialized lens
3. Shows a preview and requires `y` to write the artifact to `.aitri/`
4. Prints the next command to run

| Command | Persona | Output |
|---------|---------|--------|
| `aitri discover-idea` | Discovery Facilitator | `.aitri/discovery.md` |
| `aitri product-spec` | Product Manager | `.aitri/product-spec.md` |
| `aitri ux-design` | Experience Designer | `.aitri/ux-design.md` |
| `aitri arch-design` | System Architect | `.aitri/architecture-decision.md` |
| `aitri sec-review` | Security Champion | `.aitri/security-review.md` |
| `aitri qa-plan` | Quality Engineer | `.aitri/qa-plan.md` |
| `aitri dev-roadmap` | Lead Developer | `.aitri/dev-roadmap.md` |

`ux-design` accepts `--no-ux` for projects with no UI. `arch-design` uses pre-planning artifacts when available and falls back gracefully if optional ones are missing.

Once pre-planning is complete, `aitri resume` recommends the first feature command:
```bash
aitri draft --feature <name> --idea "<summary>"
```

---

## 6. Per-Feature Workflow

### Initialize

```bash
cd ~/my-project
aitri init
aitri resume
```

### Step 1 — Draft

Capture requirements into a structured spec with Functional Requirements (`FR-*`) and Acceptance Criteria (`AC-*`).

```bash
# Guided wizard (recommended)
aitri draft --feature user-auth

# Non-interactive (CI/automation)
aitri draft --feature user-auth --idea "Email and password login with forgot-password flow" --non-interactive --yes

# From a structured input file
aitri draft --feature user-auth --input feature-input.md
```

The draft spec is written to `specs/drafts/<feature>.md`.

### Step 2 — Approve

Validate and lock the spec. No implementation artifact can exist without an approved spec.

```bash
# Optional: AI-powered spec quality review first
aitri spec-improve --feature user-auth

# Lock the spec
aitri approve --feature user-auth
```

The approved spec is written to `specs/approved/<feature>.md`. This file is immutable — changes require a new draft cycle.

### Step 3 — Plan

Generate the plan, backlog (User Stories mapped to FRs), and test cases (TCs mapped to ACs).

```bash
aitri plan --feature user-auth
```

The agent task output fills:
- `docs/plan/<feature>.md` — structured plan with architecture and implementation notes
- `docs/backlog/<feature>.md` — User Stories with `FR-*` traces
- `tests/<feature>/tests.md` — Test Cases with `AC-*` traces

`tests.md` is editable. If `deliver` reports uncovered ACs, add the missing `AC-*` to the `Trace:` line of the corresponding TC.

### Step 4 — Go

Architecture review, security review, and human GO/NO-GO gate. Validates that the plan's persona sections are complete.

```bash
aitri go --feature user-auth
```

Blocks until the plan has complete `### Components`, `### Data flow`, `### Key decisions`, `### Risks & mitigations`, `### Observability`, `### Threats`, and `### Required controls` sections.

### Step 5 — Build

Scaffold test stubs (one `.test.js` per TC) and implementation contract placeholders.

```bash
aitri build --feature user-auth --yes

# Build a single story
aitri build --feature user-auth --story US-1
```

### Step 6 — Testgen

Generate behavioral test bodies. The QA persona reads each FR + AC and writes test logic into the stubbed `.test.js` files.

```bash
aitri testgen --feature user-auth
```

### Step 7 — Contractgen

Implement contract functions. The Developer persona reads FRs and test stubs to implement each contract in `src/contracts/<feature>/`.

```bash
aitri contractgen --feature user-auth
```

Contracts must read their `input` argument to produce meaningful output. Trivial contracts that return `ok: true` unconditionally are detected and flagged.

### Step 8 — Prove

Run all TC stubs, map results to FR-IDs, and write `proof-of-compliance.json`.

```bash
aitri prove --feature user-auth
aitri prove --feature user-auth --mutate   # also run mutation testing
```

Proof is stale if spec, backlog, or `tests.md` changed after it was generated. Re-run `prove` to refresh.

### Step 9 — QA

Independent AC-driven verification against the live running system. This is separate from unit tests — it verifies that the built system actually satisfies each Acceptance Criterion in the approved spec.

```bash
aitri qa --feature user-auth
```

See [QA Verification](#7-qa-verification) for details. Deliver blocks until `qa-report.md` exists with `Decision: PASS`.

### Step 10 — Deliver

Final delivery gate. Checks: all FRs proven, all TCs passing, proof not stale, QA passed, workspace clean, no open CRITICAL/HIGH audit findings.

```bash
aitri deliver --feature user-auth
aitri deliver --feature user-auth --yes    # auto-confirm hygiene warning
```

SHIP or BLOCKED — no partial delivery.

---

## 7. QA Verification

`aitri qa` generates an agent task that independently verifies each Acceptance Criterion by running real tests against the live running system.

```bash
aitri qa --feature user-auth
```

**What it does:**
1. Reads all `AC-*` entries from the approved spec (`## 9. Acceptance Criteria`)
2. Detects how to start the project (`npm start`, `npm run dev`, `node server.js`, etc.)
3. Detects the port from `.aitri/architecture-decision.md` (defaults to 3000)
4. Generates an agent task with one test per AC — HTTP calls, CLI commands, or function calls against the live system
5. The agent runs each test, records PASS/FAIL with evidence, and writes `.aitri/qa-report.md`

**Required QA report format:**
```
# QA Report: user-auth
Date: 2026-03-04T12:00:00Z

## Results
- AC-1: PASS — POST /api/login returns 200 with valid credentials (curl output)
- AC-2: FAIL — Expected: redirect to /dashboard, Got: 404

## Summary
Total: 5 | Passed: 4 | Failed: 1
Decision: FAIL
```

`deliver` blocks if:
- `.aitri/qa-report.md` does not exist
- Any line matches `AC-*: FAIL`
- `Decision: FAIL` is present

**If any AC fails:**
1. Fix the implementation
2. `aitri prove --feature <name>` — re-run proof
3. `aitri qa --feature <name>` — re-verify
4. Only proceed to deliver when `Decision: PASS`

---

## 8. Audit

Multi-layer code and spec audit. Detects traceability gaps, trivial contracts, stale proof, and security issues.

```bash
aitri audit --feature user-auth
```

**Audit layers:**
- **Layer 1** — Automated: detects trivial contracts (return `ok: true` without reading input), stale proof, missing gates
- **Layer 2** — Spec integrity: verifies backlog and tests trace to approved spec FRs
- **Layer 3** — Implementation compliance: verifies contracts satisfy FR intent
- **Layer 4** — Deep analysis: agent task for cross-cutting security, architecture, and logic review

**Findings are written to `.aitri/audit-findings.md`.** `deliver` blocks on CRITICAL or HIGH findings.

Severity levels: CRITICAL → HIGH → MEDIUM → INFO

---

## 9. Closing a Feature

After delivery, generate a closure report showing all gates and stats.

```bash
aitri close --feature user-auth
aitri close --feature user-auth --json    # machine-readable
```

**Report includes:**
- ✓/✗ for 6 gates: spec approved, go decision, build done, proof passing, QA passing, delivery
- Proof stats: TCs passing / total
- Open CRITICAL/HIGH audit findings
- Recent commits for the feature

---

## 10. Brownfield Projects

For projects that already exist. `aitri adopt` scans the stack and maps it into the spec-driven model.

```bash
# Phase 1: scan stack, detect conventions, entry points, gaps
aitri adopt

# Phase 2: LLM infers DRAFT specs and discovery docs from existing code
aitri adopt --depth standard

# Phase 3: map existing tests to TC-* stubs
aitri adopt --depth deep

# Dry run (no writes)
aitri adopt --dry-run
```

`--depth standard` and `--depth deep` require an LLM (see [Configuration](#13-configuration)).

Output: `docs/adoption-manifest.json`, `specs/drafts/<feature>.md`, `docs/discovery/<feature>.md`, `tests/<feature>/tests.md`.

---

## 11. Session Continuity

Aitri maintains state in `.aitri/DEV_STATE.md` so sessions can be resumed by any agent at any time.

**Auto-checkpoint:** Write commands (`init`, `draft`, `approve`, `plan`) create automatic git checkpoints. Aitri keeps the latest 10 checkpoint tags.

```bash
# Save state manually
aitri checkpoint "implemented login endpoint — next: run aitri prove"

# Read saved state
aitri checkpoint show

# Get recommended next command (machine-readable)
aitri resume json

# Recommended next step in human-readable form
aitri resume
```

**Disable auto-checkpoint for one command:**
```bash
aitri plan --feature user-auth --no-checkpoint
```

---

## 12. Command Reference

### Pre-Planning (once per project)

| Command | Persona | Output |
|---------|---------|--------|
| `aitri discover-idea --idea "<text>"` | Discovery Facilitator | `.aitri/discovery.md` |
| `aitri product-spec` | Product Manager | `.aitri/product-spec.md` |
| `aitri ux-design` | Experience Designer | `.aitri/ux-design.md` |
| `aitri arch-design` | System Architect | `.aitri/architecture-decision.md` |
| `aitri sec-review` | Security Champion | `.aitri/security-review.md` |
| `aitri qa-plan` | Quality Engineer | `.aitri/qa-plan.md` |
| `aitri dev-roadmap` | Lead Developer | `.aitri/dev-roadmap.md` |

### Per-Feature Pipeline

| Step | Command | Gate |
|------|---------|------|
| 1 | `aitri draft --feature <name>` | Creates `specs/drafts/<name>.md` |
| 2 | `aitri approve --feature <name>` | Locks spec; writes `specs/approved/<name>.md` |
| 3 | `aitri plan --feature <name>` | Generates plan + backlog + test cases |
| 4 | `aitri go --feature <name>` | Human GO/NO-GO; validates persona sections |
| 5 | `aitri build --feature <name>` | Scaffolds test stubs + contract placeholders |
| 6 | `aitri testgen --feature <name>` | Generates test bodies from FR + AC |
| 7 | `aitri contractgen --feature <name>` | Implements contracts from FR + test stubs |
| 8 | `aitri prove --feature <name>` | Runs TCs → `proof-of-compliance.json` |
| 9 | `aitri qa --feature <name>` | AC-driven QA against live system → `qa-report.md` |
| 10 | `aitri deliver --feature <name>` | Final gate → SHIP or BLOCKED |

### Analysis and Reporting

| Command | Purpose |
|---------|---------|
| `aitri audit --feature <name>` | Multi-layer audit: traceability, contracts, security |
| `aitri spec-improve --feature <name>` | AI-powered spec quality review |
| `aitri verify-intent --feature <name>` | Validate User Stories satisfy FR intent |
| `aitri diff --feature <name> --proposed <file>` | Compare backlog against a proposed update |
| `aitri close --feature <name>` | Closure report: all gates + proof stats |

### State and Navigation

| Command | Purpose |
|---------|---------|
| `aitri init` | Initialize project structure |
| `aitri resume` | Recommend next action from saved state |
| `aitri resume json` | Machine-readable next step |
| `aitri status` | Current project gate status |
| `aitri status --feature <name>` | Gate status for a specific feature |
| `aitri checkpoint [message]` | Save session state |
| `aitri checkpoint show` | Read saved state |

### Epics

Organize multiple features into a delivery outcome.

```bash
aitri epic create --name mvp --features user-auth,dashboard,notifications
aitri epic status --name mvp
aitri status --epic mvp
```

### Brownfield

| Command | Purpose |
|---------|---------|
| `aitri adopt` | Phase 1: scan stack and conventions |
| `aitri adopt --depth standard` | Phase 2: infer draft specs from existing code |
| `aitri adopt --depth deep` | Phase 3: map existing tests to TC-* stubs |
| `aitri upgrade` | Apply version-aware migrations |

### Common Flags

| Flag | Use |
|------|-----|
| `--feature <name>` / `-f <name>` | Target a specific feature |
| `--json` / `-j` | Machine-readable output |
| `--non-interactive` | Suppress all prompts (CI/automation) |
| `--yes` / `-y` | Auto-confirm write operations |
| `--guided` | Enable interactive guided mode (`draft`) |
| `--dry-run` | Preview without writing |
| `--no-checkpoint` | Disable auto-checkpoint for one command |
| `--idea <text>` | Idea text for non-interactive draft |
| `--input <file>` | Structured feature input file |
| `--story <US-N>` | Target a single story (`build`) |

---

## 13. Configuration

### AI-Powered Commands

Pre-planning commands, `spec-improve`, `verify-intent`, and `adopt --depth standard/deep` require an LLM. Add to `aitri.config.json` at project root:

```json
{
  "ai": {
    "provider": "claude",
    "model": "claude-opus-4-6",
    "apiKeyEnv": "ANTHROPIC_API_KEY"
  }
}
```

Set the environment variable:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Other supported providers: `openai` (uses `OPENAI_API_KEY`), `gemini` (uses `GEMINI_API_KEY`).

### Custom Paths (Brownfield)

If your project uses non-standard folder names:
```json
{
  "paths": {
    "specs": "workspace/specs",
    "backlog": "workspace/backlog",
    "tests": "quality/tests",
    "docs": "knowledge/docs"
  }
}
```

### Policy Rules

Block certain actions across all agent sessions:
```json
{
  "policy": {
    "allowDependencyChanges": false,
    "blockedImports": ["left-pad"],
    "blockedPaths": ["infra/**", "scripts/deploy/**"]
  }
}
```

---

## 14. Troubleshooting

| Problem | Fix |
|---------|-----|
| `Approved spec not found` | Run `aitri approve --feature <name>` |
| `Proof of compliance not found` | Run `aitri prove --feature <name>` |
| `Proof is stale` | Spec, backlog, or tests.md changed. Re-run `aitri prove --feature <name>` |
| `QA report missing` | Run `aitri qa --feature <name>` — the agent must write `.aitri/qa-report.md` |
| `QA report has failing ACs` | Fix the implementation, re-run `aitri prove`, then `aitri qa` |
| `Uncovered ACs` | Add the AC to the `Trace:` line of the matching TC in `tests.md` |
| `DELIVER BLOCKED — workspace hygiene` | Commit or stash unrelated changes, then re-run `deliver` |
| `CRITICAL/HIGH audit findings` | Check `.aitri/audit-findings.md` and resolve before delivering |
| `GO blocked — missing persona section` | Add the required section under `## 5.` in the plan doc (format shown in the error message) |
| `Skill not detected` | Verify `SKILL.md` exists at the correct path with `name: aitri` in YAML frontmatter and restart the agent CLI |
| `Aitri prompts in automation` | Add `--non-interactive --yes` |

---

## 15. Contributor Validation

```bash
npm run test:smoke
npm run test:regression
npm run test:all
npm run check:file-growth
npm run check:file-growth:strict
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/MANIFESTO.md](docs/MANIFESTO.md) | What Aitri is, design choices, honest scope |
| [docs/architecture.md](docs/architecture.md) | Command flow, artifact topology, agent integration contract |
| [docs/guides/GETTING_STARTED.md](docs/guides/GETTING_STARTED.md) | Detailed first-run walkthrough |
| [docs/guides/AGENT_INTEGRATION_GUIDE.md](docs/guides/AGENT_INTEGRATION_GUIDE.md) | Full agent workflow reference and Auditor Mode spec |
| [docs/guides/SKILL_PACKAGING_AND_INSTALL.md](docs/guides/SKILL_PACKAGING_AND_INSTALL.md) | How to package Aitri as an agent skill |
| [docs/DOC_POLICY.md](docs/DOC_POLICY.md) | Documentation rules and file budget |

---

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
