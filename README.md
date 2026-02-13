# Aitri ⚒️ — The AI Craftsman

Aitri is a CLI-first, spec-driven SDLC workflow engine for humans and AI agents.

## What Aitri does
- Enforces a spec-first process
- Generates core SDLC artifacts from approved specs
- Validates traceability before implementation
- Keeps humans in control via explicit approval gates

## Core flow
1. `aitri init`
2. `aitri draft`
3. `aitri approve`
4. `aitri discover`
5. `aitri plan`
6. `aitri validate`
7. human approval before implementation/deployment actions

## Commands
- `aitri help`
- `aitri --version`
- `aitri init`
- `aitri draft [--guided]`
- `aitri approve`
- `aitri discover`
- `aitri plan`
- `aitri validate [--feature <name>] [--non-interactive] [--json]`
- `aitri status [--json]`

## Quick start
```bash
aitri init
aitri draft --guided
aitri approve
aitri discover
aitri plan
aitri validate --feature your-feature --non-interactive
```

## Docs
Project governance and execution model live in `docs/`:
- `docs/architecture.md`
- `docs/SCOPE_V1.md`
- `docs/STRATEGY_EXECUTION.md`
- `docs/AGENT_EXECUTION_CHECKLIST.md`
- `docs/PROGRESS_CHECKLIST.md`
