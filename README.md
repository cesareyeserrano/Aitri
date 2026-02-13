![Aitri Header](assets/aitri-header.svg)

# Aitri

Aitri is a CLI-first, spec-driven SDLC guardrail for human + AI collaboration.

It enforces a deterministic workflow from specification to validated artifacts, with explicit human approvals before implementation and deployment assistance steps.

## Table of Contents
- [Why Aitri](#why-aitri)
- [Install](#install)
- [Zero-to-First-Run Guide](#zero-to-first-run-guide)
- [Core Workflow](#core-workflow)
- [Command Manual](#command-manual)
- [Automation Helpers](#automation-helpers)
- [Skill Adapters](#skill-adapters)
- [Project Structure](#project-structure)
- [Validation Model](#validation-model)
- [Exit Codes](#exit-codes)
- [Real Test Procedure](#real-test-procedure)
- [Troubleshooting](#troubleshooting)
- [Documentation Index](#documentation-index)

## Why Aitri
- Spec first: no implementation without approved scope.
- Traceability: FR -> US -> TC.
- Deterministic CLI behavior for humans, CI, and agents.
- Explicit gate approvals for file-changing actions.
- Human authority over all irreversible steps.

## Install

### Local repo usage
```bash
cd /path/to/aitri
node cli/index.js help
```

### Global install from source
```bash
npm i -g .
aitri --version
```

## Zero-to-First-Run Guide
For complete onboarding (from no agent CLI installed to first validated workflow), use:
- `docs/guides/GETTING_STARTED.md`

## Core Workflow
1. `aitri status --json`
2. `aitri init`
3. `aitri draft`
4. Human review of draft
5. `aitri approve`
6. `aitri discover`
7. `aitri plan`
8. Refine artifacts with personas
9. `aitri validate`
10. Human approval before implementation/deployment assistance

## Command Manual

### `aitri help`
Shows command reference and options.

### `aitri --version`
Prints installed version.

### `aitri init`
Creates base project structure (`specs`, `backlog`, `tests`, `docs`).

### `aitri draft [--guided]`
Creates `specs/drafts/<feature>.md` from idea input.

### `aitri approve`
Runs spec gates and moves draft to `specs/approved/<feature>.md`.

### `aitri discover`
Generates discovery, backlog skeleton, and tests skeleton from approved spec.

### `aitri plan`
Generates plan + structured backlog/tests templates.

### `aitri validate`
Validates structure, placeholders, and coverage links.

### `aitri status`
Shows project state and next recommended step.

## Automation Helpers
Use these flags for CI/agent execution:
- `--non-interactive`: disable prompts
- `--yes`: auto-approve write-command plans
- `--feature <name>`: explicit feature targeting
- `--idea <text>`: non-interactive draft content
- `--json`: machine-readable output (`status`, `validate`)

Example non-interactive sequence:
```bash
aitri init --non-interactive --yes
aitri draft --feature user-login --idea "Email/password login" --non-interactive --yes
aitri approve --feature user-login --non-interactive --yes
aitri discover --feature user-login --non-interactive --yes
aitri plan --feature user-login --non-interactive --yes
aitri validate --feature user-login --non-interactive --json
```

## Skill Adapters
Aitri includes adapter skill contracts for:
- Codex: `adapters/codex/SKILL.md`
- Claude: `adapters/claude/SKILL.md`
- OpenCode: `adapters/opencode/SKILL.md`

UI metadata files for skill lists:
- `adapters/codex/agents/openai.yaml`
- `adapters/claude/agents/openai.yaml`
- `adapters/opencode/agents/openai.yaml`

### Install as Codex Skill (Local)
```bash
mkdir -p ~/.codex/skills/aitri
cp adapters/codex/SKILL.md ~/.codex/skills/aitri/SKILL.md
```

Then restart Codex and invoke it explicitly in-session:
```text
Use the aitri skill and run aitri status --json
```

## Project Structure
```text
specs/
  drafts/
  approved/
backlog/<feature>/backlog.md
tests/<feature>/tests.md
docs/discovery/<feature>.md
docs/plan/<feature>.md
```

## Validation Model
`validate` checks:
- Missing required artifacts
- Placeholder leakage (`FR-?`, `AC-?`, `US-?`)
- Structure requirements (`### US-*`, `### TC-*`)
- Coverage links:
  - FR -> US
  - FR -> TC
  - US -> TC

JSON output includes:
- `issues` (compatible flat list)
- `gaps` (typed issue lists)
- `gapSummary` (typed counts)

## Exit Codes
- `0` success
- `1` error (usage/validation/runtime)
- `2` user-aborted action

## Real Test Procedure
```bash
npm run test:smoke
cd examples/validate-coverage
node ../../cli/index.js validate --feature validate-coverage --non-interactive --json
```

## Troubleshooting
- If command waits for input in CI: add `--non-interactive --yes`.
- If `validate` fails with missing feature: add `--feature <name>`.
- If merge is blocked by branch policy: complete required checks/review or use admin merge when appropriate.
- If Codex does not discover the local skill:
  - Verify `~/.codex/skills/aitri/SKILL.md` exists.
  - Verify `SKILL.md` starts with YAML frontmatter (`name`, `description`).
  - Restart Codex after installation/update.
- If a skill session in a new repository reports missing `docs/*`:
  - Run `aitri status --json`.
  - If `nextStep` is `aitri init`, run `aitri init --non-interactive --yes`.
  - Re-run `aitri status --json` and continue workflow.

## Documentation Index
- `docs/README.md`
- `docs/EXECUTION_GUARDRAILS.md`
- `docs/AGENT_EXECUTION_CHECKLIST.md`
- `docs/PROGRESS_CHECKLIST.md`
- `docs/STRATEGY_EXECUTION.md`
- `docs/release/`
