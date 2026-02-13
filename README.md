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
- [Checkpoint and Resume](#checkpoint-and-resume)
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
1. `aitri status json`
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

Note on language:
- CLI prompts and generated scaffolding are currently in English.
- You can still converse with your coding agent in Spanish; Aitri command I/O remains English.

### `aitri help`
Shows command reference and options.

### `aitri --version`
Prints installed version.

### `aitri init`
Creates base project structure (`specs`, `backlog`, `tests`, `docs`).

### `aitri draft [--guided]`
Creates `specs/drafts/<feature>.md` from idea input.
In guided mode, Aitri asks structured questions (summary, actor, outcome, scope, technology).
If the requirement already names a technology, Aitri asks to confirm/replace it.
If not, Aitri suggests a baseline stack based on the requirement context.

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
- `--json` or `-j`: machine-readable output (`status`, `validate`)
- `--format json`: explicit output format
- `json` shorthand: `aitri status json`

Example non-interactive sequence:
```bash
aitri init --non-interactive --yes
aitri draft --feature user-login --idea "Email/password login" --non-interactive --yes
aitri approve --feature user-login --non-interactive --yes
aitri discover --feature user-login --non-interactive --yes
aitri plan --feature user-login --non-interactive --yes
aitri validate --feature user-login --non-interactive --format json
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
Use the aitri skill and run aitri status json
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
node ../../cli/index.js validate --feature validate-coverage --non-interactive --format json
```

## Checkpoint and Resume
Recommended checkpoint after each major phase (`draft`, `approve`, `discover`, `plan`, `validate`):
```bash
git add -A
git commit -m "checkpoint: <feature> <phase>"
```

Fallback:
```bash
git stash push -m "checkpoint: <feature> <phase>"
```

Resume in a new session:
```bash
aitri status json
```
Then execute the returned `nextStep`.

If `status` reports `checkpoint.state.resumeDecision = "ask_user_resume_from_checkpoint"`,
the agent should ask the user to confirm resume before any write action.

## Troubleshooting
- If command waits for input in CI: add `--non-interactive --yes`.
- If `validate` fails with missing feature: add `--feature <name>`.
- If merge is blocked by branch policy: complete required checks/review or use admin merge when appropriate.
- If Codex does not discover the local skill:
  - Verify `~/.codex/skills/aitri/SKILL.md` exists.
  - Verify `SKILL.md` starts with YAML frontmatter (`name`, `description`).
  - Restart Codex after installation/update.
- If a skill session in a new repository reports missing `docs/*`:
  - Run `aitri status json`.
  - If `nextStep` is `aitri init`, run `aitri init --non-interactive --yes`.
  - Re-run `aitri status json` and continue workflow.
- If your machine shuts down abruptly mid-session:
  - Run `git status --short` and recover stashes if needed.
  - Run `aitri status json`.
  - Continue with the returned `nextStep`.

## Documentation Index
- `docs/README.md`
- `docs/EXECUTION_GUARDRAILS.md`
- `docs/AGENT_EXECUTION_CHECKLIST.md`
- `docs/PROGRESS_CHECKLIST.md`
- `docs/STRATEGY_EXECUTION.md`
- `docs/release/`
