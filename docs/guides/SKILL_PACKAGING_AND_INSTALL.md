# Skill Packaging and Installation Guide

## Goal
Make Aitri consumable as a skill contract across Codex, Claude, and OpenCode environments.

For full first-time setup (including global Aitri install and first workflow), see:
- `docs/guides/GETTING_STARTED.md`

## Included Skill Assets
- `adapters/codex/SKILL.md`
- `adapters/claude/SKILL.md`
- `adapters/opencode/SKILL.md`
- `adapters/*/agents/openai.yaml`

## What a Session Should Load
At minimum:
1. Adapter `SKILL.md`
2. `docs/README.md`
3. `docs/EXECUTION_GUARDRAILS.md`

Optional, as needed:
- persona files under `core/personas/`
- deploy templates under `docs/templates/deploy/`

## Installation Pattern (Local)
If your agent platform supports local skills, point it to:
- Codex: `adapters/codex/`
- Claude: `adapters/claude/`
- OpenCode: `adapters/opencode/`

For Codex CLI local install:
```bash
mkdir -p ~/.codex/skills/aitri
cp adapters/codex/SKILL.md ~/.codex/skills/aitri/SKILL.md
```

Codex discovery requirement:
- `SKILL.md` must include YAML frontmatter with `name` and `description`.
- Restart Codex after installing or updating a local skill.

Claude skill locations:
- Personal: `~/.claude/skills/<skill-name>/SKILL.md`
- Project: `.claude/skills/<skill-name>/SKILL.md`

OpenCode skill locations:
- Personal: `~/.config/opencode/skills/<skill-name>/SKILL.md`
- Project: `.opencode/skills/<skill-name>/SKILL.md`

## Runtime Expectations
- Start with `aitri status --json`
- Use non-interactive flags in automation
- Respect gate approvals for all write/destructive actions
- Report each step and next action

## Validation Before Distribution
Run:
```bash
npm run test:smoke
node cli/index.js help
node cli/index.js status --json
```

## Future Compatibility
To update the skill contract safely:
1. Update adapter `SKILL.md`
2. Update matching `agents/openai.yaml`
3. Update docs references (`docs/README.md`, checklists)
4. Verify smoke tests
