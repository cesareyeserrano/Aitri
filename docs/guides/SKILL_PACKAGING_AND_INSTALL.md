# Skill Packaging and Installation Guide

## Goal
Make Aitri consumable as a skill contract across Codex, Claude, and OpenCode environments.

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
