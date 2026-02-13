# Getting Started: Install and Use Aitri End-to-End

This guide is for first-time users.

It covers:
- Installing required CLIs from zero
- Installing Aitri globally
- Running Aitri in a specific project
- Installing Aitri as a skill for Codex, Claude, and OpenCode
- Running a real first workflow

## 1) Prerequisites

Install these first:
- Git
- Node.js 18+ and npm
- One agent CLI: Codex, Claude Code, or OpenCode

Official docs:
- Codex CLI: `https://github.com/openai/codex`
- Claude Code: `https://docs.claude.com/en/docs/claude-code/getting-started`
- OpenCode CLI: `https://opencode.ai/docs/cli/`

## 2) Clone and Install Aitri

```bash
git clone https://github.com/cesareyeserrano/aitri.git
cd aitri
git checkout main
git pull origin main
npm i -g .
hash -r
```

Verify installation:
```bash
which aitri
aitri --version
aitri help
```

Expected:
- `which aitri` points to your global npm bin path
- `aitri --version` prints the installed version
- `aitri help` shows `init/draft/approve/discover/plan/validate/status`

## 3) Use Aitri in a Specific Project

Create or open any target project directory:
```bash
mkdir -p ~/Documents/PROJECTS/my-project
cd ~/Documents/PROJECTS/my-project
```

Initialize Aitri structure:
```bash
aitri init --non-interactive --yes
```

Check status:
```bash
aitri status --json
```

Expected after init:
- `structure.ok: true`
- `nextStep: "aitri draft"`

## 4) First Real Workflow (Non-Interactive)

```bash
aitri draft --feature user-auth --idea "Email and password login with forgot-password flow" --non-interactive --yes
aitri approve --feature user-auth --non-interactive --yes
aitri discover --feature user-auth --non-interactive --yes
aitri plan --feature user-auth --non-interactive --yes
aitri validate --feature user-auth --non-interactive --json
```

Expected:
- `validate` exits with code `0`
- JSON output reports no unresolved gaps for the generated baseline

## 5) Install Aitri as a Codex Skill

Codex personal skill path:
- `~/.codex/skills/aitri/SKILL.md`

Install:
```bash
cd /path/to/aitri
mkdir -p ~/.codex/skills/aitri
cp adapters/codex/SKILL.md ~/.codex/skills/aitri/SKILL.md
```

Restart Codex, then in any project prompt:
```text
Use the aitri skill and run aitri status --json
```

If project is empty, continue with:
```text
Use the aitri skill and run aitri init --non-interactive --yes
```

## 6) Install Aitri as a Claude Skill

Claude personal skill path:
- `~/.claude/skills/aitri/SKILL.md`

Claude project skill path:
- `.claude/skills/aitri/SKILL.md`

Install (personal):
```bash
cd /path/to/aitri
mkdir -p ~/.claude/skills/aitri
cp adapters/claude/SKILL.md ~/.claude/skills/aitri/SKILL.md
```

Then start Claude in your target repo and request Aitri workflow execution.

## 7) Install Aitri as an OpenCode Skill

OpenCode supports multiple compatible paths. Recommended personal path:
- `~/.config/opencode/skills/aitri/SKILL.md`

Project path:
- `.opencode/skills/aitri/SKILL.md`

Install (personal):
```bash
cd /path/to/aitri
mkdir -p ~/.config/opencode/skills/aitri
cp adapters/opencode/SKILL.md ~/.config/opencode/skills/aitri/SKILL.md
```

Restart OpenCode and request Aitri workflow execution in your target repo.

## 8) Troubleshooting

`Skill not detected`
- Verify file path and exact filename `SKILL.md`
- Verify YAML frontmatter exists at top of file:
  - `name: aitri`
  - `description: ...`
- Restart the agent CLI after installing/updating skill files

`Aitri asks for confirmation in automation`
- Add `--non-interactive --yes` for write commands

`validate fails with missing feature`
- Add `--feature <feature-name>` in non-interactive mode

`Skill tries to read docs before init in a new repo`
- Run `aitri status --json`
- If `nextStep` is `aitri init`, run `aitri init --non-interactive --yes`
- Re-run `aitri status --json`

## 9) Operational Recommendation

For reproducible team adoption:
1. Keep Aitri installed globally in contributor machines.
2. Add project-level skill files (`.claude/skills` or `.opencode/skills`) when team-shared behavior is required.
3. Run `aitri status --json` as the first step of every agent session.
