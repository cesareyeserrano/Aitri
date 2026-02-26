# Skill Packaging and Installation Guide

## Goal
Make Aitri consumable as a skill contract across Codex, Claude, OpenCode, and Gemini environments.

For full first-time setup (including global Aitri install and first workflow), see:
- `docs/guides/GETTING_STARTED.md`

## Included Skill Assets
- `adapters/codex/SKILL.md`
- `adapters/claude/SKILL.md`
- `adapters/opencode/SKILL.md`
- `adapters/gemini/SKILL.md`
- `adapters/*/agents/openai.yaml` (Claude, Codex, OpenCode)
- `adapters/gemini/agents/gemini.yaml`

## What a Session Should Load
At minimum:
1. Adapter `SKILL.md`
2. `docs/architecture.md`

Optional, as needed:
- `docs/MANIFESTO.md` — for agent context on Aitri's scope and principles
- persona files under `core/personas/`

## Installation Paths

| Agent | Personal path | Project path |
|-------|--------------|--------------|
| Claude Code | `~/.claude/skills/aitri/SKILL.md` | `.claude/skills/aitri/SKILL.md` |
| Codex CLI | `~/.codex/skills/aitri/SKILL.md` | _(not supported)_ |
| OpenCode | `~/.config/opencode/skills/aitri/SKILL.md` | `.opencode/skills/aitri/SKILL.md` |
| Gemini CLI | `~/.gemini/skills/aitri/SKILL.md` | `.gemini/skills/aitri/SKILL.md` |

Install commands:
```bash
# Claude Code (personal)
mkdir -p ~/.claude/skills/aitri && cp adapters/claude/SKILL.md ~/.claude/skills/aitri/SKILL.md

# Codex CLI
mkdir -p ~/.codex/skills/aitri && cp adapters/codex/SKILL.md ~/.codex/skills/aitri/SKILL.md

# OpenCode (personal)
mkdir -p ~/.config/opencode/skills/aitri && cp adapters/opencode/SKILL.md ~/.config/opencode/skills/aitri/SKILL.md

# Gemini CLI (personal)
mkdir -p ~/.gemini/skills/aitri && cp adapters/gemini/SKILL.md ~/.gemini/skills/aitri/SKILL.md
```

Requirements:
- `SKILL.md` must include YAML frontmatter with `name` and `description`.
- Restart the agent CLI after installing or updating skill files.
- Aitri must be installed globally (`npm i -g .`) before the skill can execute commands.

## Runtime Expectations
- Start every session with `aitri checkpoint show` + `aitri resume json`
- Use `--non-interactive --yes` flags only in CI/automation, never in interactive sessions
- Run `aitri verify-intent` before `aitri go` decisions
- Respect gate approvals for all write operations
- Report each step and next action

## Validation Before Distribution
```bash
npm run test:smoke
npm run test:regression
node cli/index.js help
node cli/index.js resume json
```

## Updating the Skill Contract
1. Update adapter `SKILL.md`
2. Update matching `agents/*.yaml`
3. Verify `npm run test:smoke` passes
4. Update `docs/guides/GETTING_STARTED.md` if install paths changed
