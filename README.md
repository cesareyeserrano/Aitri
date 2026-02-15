<p align="center">
  <img src="assets/aitri-avatar.png" alt="Aitri Header" width="250" />
</p>

<h1 align="center">AITRI</h1>

<p align="center">
  CLI-first, spec-driven SDLC guardrail for human + AI collaboration.
</p>

## Overview
Aitri enforces a deterministic workflow from idea to validated artifacts before implementation.

Core principles:
- Spec first, implementation later.
- Traceability is required: `FR -> US -> TC`.
- Human approval is mandatory for go/no-go decisions.
- Agents must operate through Aitri commands and gates.

## Requirements
- Node.js `>=18`
- Git (recommended for checkpoint and resume workflow)

## Install
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

Run the baseline SDLC flow:
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

Show current state:
```bash
aitri status --json
```

Generate a visual status report:
```bash
aitri status --ui
```
Use `--no-open` to generate the file without opening the browser.

## Core Commands
- `aitri init`
- `aitri draft [--guided]`
- `aitri approve`
- `aitri discover [--guided]`
- `aitri plan`
- `aitri validate`
- `aitri verify`
- `aitri policy`
- `aitri status`
- `aitri resume`
- `aitri handoff`
- `aitri go`
- `aitri help`

Useful flags:
- `--non-interactive`
- `--yes`
- `--feature <name>`
- `--json` / `--format json`
- `--verify-cmd "<command>"`

## Skill Adapters
- Codex: `adapters/codex/SKILL.md`
- Claude: `adapters/claude/SKILL.md`
- OpenCode: `adapters/opencode/SKILL.md`

Codex local install:
```bash
mkdir -p ~/.codex/skills/aitri
cp adapters/codex/SKILL.md ~/.codex/skills/aitri/SKILL.md
```

## Documentation
- Docs index: `docs/README.md`
- Getting started: `docs/guides/GETTING_STARTED.md`
- Execution rules: `docs/EXECUTION_GUARDRAILS.md`
- Strategy: `docs/STRATEGY_EXECUTION.md`
- Progress checklist: `docs/PROGRESS_CHECKLIST.md`
- Checkpoint/resume runbook: `docs/runbook/SESSION_CHECKPOINT_AND_RESUME.md`
- Skill packaging guide: `docs/guides/SKILL_PACKAGING_AND_INSTALL.md`

## Local Validation (for contributors)
```bash
npm run test:smoke
npm run demo:5min
```

## License
- License: Apache-2.0 (`LICENSE`)
- Attribution: `NOTICE`
