<p align="center">
  <img src="assets/aitri-avatar.png" alt="Aitri Header" width="250" />
</p>

<h1 align="center">AITRI</h1>

<p align="center">
  CLI-first, spec-driven SDLC guardrail for human + AI collaboration.
</p>

## What Is Aitri
Aitri is a command-line SDLC engine that enforces disciplined, spec-driven execution for AI-assisted development.
It helps teams move from user requirements to verified software through explicit workflow gates and human approvals.

Core operating model:
- Spec first, implementation second.
- Requirements are user-authored: Aitri structures and validates; it does not invent requirements.
- Traceability by default: `FR -> US -> TC`.
- Runtime verification required before handoff.
- Human go/no-go decisions are mandatory.
- Agents operate through explicit commands and gates.

## Why Teams Use Aitri
- Reduce drift in AI-generated workflows.
- Keep decisions and artifacts auditable over time.
- Maintain continuity across sessions with checkpoint/resume.
- Standardize delivery quality in terminal-native workflows.

## SDLC Flow Enforced by Aitri
`draft -> approve -> discover -> plan -> validate -> verify -> policy -> handoff -> go`

This flow is deterministic and designed to block ambiguous or weak transitions.

## Requirements
- Node.js `>=18`
- Git (recommended for checkpoint and resume workflow)

## Installation
```bash
git clone https://github.com/cesareyeserrano/aitri.git
cd aitri
npm i -g .
hash -r
aitri --version
```

## Quick Start
Initialize a target project:
```bash
mkdir -p ~/Documents/PROJECTS/my-feature
cd ~/Documents/PROJECTS/my-feature
aitri init --non-interactive --yes
aitri resume json
```

Run the baseline SDLC workflow:
```bash
aitri draft --feature user-login --idea "Email/password login" --non-interactive --yes
aitri approve --feature user-login --non-interactive --yes
aitri discover --feature user-login --non-interactive --yes
aitri plan --feature user-login --non-interactive --yes
aitri validate --feature user-login --format json
aitri verify --feature user-login --format json
aitri policy --feature user-login --format json
aitri handoff
```

Check state at any point:
```bash
aitri status --json
```

Generate a static status page:
```bash
aitri status --ui
```
Use `--no-open` if you only want file generation.

## Command Reference
| Command | Purpose |
| --- | --- |
| `aitri init` | Initialize baseline project structure |
| `aitri draft` | Create a draft specification from idea input |
| `aitri approve` | Run draft quality gates and move spec to approved |
| `aitri discover` | Produce discovery artifact and initial scaffolding |
| `aitri plan` | Generate plan, backlog starter, and test-case starter |
| `aitri validate` | Validate traceability and placeholder resolution |
| `aitri verify` | Execute runtime verification and persist evidence |
| `aitri policy` | Run managed policy checks before implementation handoff |
| `aitri status` | Show current state and recommended next command |
| `aitri resume` | Continue deterministically from checkpoint context |
| `aitri handoff` | Present handoff status for explicit human decision |
| `aitri go` | Enter implementation mode after successful handoff |
| `aitri help` | Show command and option reference |

Common flags:
- `--non-interactive`
- `--yes`
- `--feature <name>`
- `--json` / `--format json`
- `--verify-cmd "<command>"`
- `--guided`

## Skill Adapters
Aitri ships skill adapters for terminal-first AI coding environments:
- Codex: `adapters/codex/SKILL.md`
- Claude: `adapters/claude/SKILL.md`
- OpenCode: `adapters/opencode/SKILL.md`

Codex local install:
```bash
mkdir -p ~/.codex/skills/aitri
cp adapters/codex/SKILL.md ~/.codex/skills/aitri/SKILL.md
```

## Documentation
Primary references:
- Docs index: `docs/README.md`
- Getting started: `docs/guides/GETTING_STARTED.md`
- Execution rules: `docs/EXECUTION_GUARDRAILS.md`
- Strategy: `docs/STRATEGY_EXECUTION.md`
- Progress checklist: `docs/PROGRESS_CHECKLIST.md`
- File growth policy: `docs/guides/FILE_GROWTH_POLICY.md`
- Checkpoint/resume runbook: `docs/runbook/SESSION_CHECKPOINT_AND_RESUME.md`
- Skill packaging guide: `docs/guides/SKILL_PACKAGING_AND_INSTALL.md`

## Contributor Validation
```bash
npm run test:smoke
npm run test:regression
npm run check:file-growth
npm run check:file-growth:strict
npm run demo:5min
```

## Project Status
Aitri is actively maintained with a CLI-first focus and deterministic workflow gates.

## License
- License: Apache-2.0 (`LICENSE`)
- Attribution: `NOTICE`
