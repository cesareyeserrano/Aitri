# Getting Started: Install and Use Aitri End-to-End

Aitri is a **Disciplined Agentic Skill** — a spec-driven SDLC engine designed to be consumed by AI agents (Claude, Codex, OpenCode) as their system of record for software delivery.

**Two audiences for this guide:**
- **Human developers** — install and operate Aitri manually
- **Agent developers** — integrate Aitri into an AI agent's workflow (see section 4b)

It covers:
- Installing required CLIs from zero
- Installing Aitri globally
- Running Aitri in a specific project
- Installing Aitri as a skill for Codex, Claude, and OpenCode
- Running a real first workflow (human and agent flows)

Language behavior:
- Aitri CLI prompts are in English.
- You can speak to Codex/Claude/OpenCode in Spanish; command responses from Aitri remain English.

Requirement source rule:
- Requirements/spec content must be provided explicitly by the user.
- Aitri structures, validates, and traces requirements; it does not invent requirements.

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
- `aitri help` shows core workflow commands

## 3) Use Aitri in a Specific Project

Create or open any target project directory:
```bash
mkdir -p ~/Documents/PROJECTS/my-project
cd ~/Documents/PROJECTS/my-project
```

Initialize Aitri structure:
```bash
aitri init
```

Check session state:
```bash
aitri resume json
```

Expected after init:
- `structure.ok: true`
- `recommendedCommand: "aitri draft"`

## 4a) First Real Workflow (Human — Interactive Default)

```bash
aitri draft --feature user-auth --idea "Email and password login with forgot-password flow"
aitri approve --feature user-auth
aitri plan --feature user-auth
aitri go --feature user-auth --yes
aitri build --feature user-auth --yes
aitri testgen --feature user-auth
aitri contractgen --feature user-auth
aitri prove --feature user-auth --mutate
aitri deliver --feature user-auth
```

Expected:
- `approve` exits with code `0` when spec passes quality gate
- `plan` generates `backlog.md` and `tests.md` with traceable IDs (FR-*, US-*, TC-*)
- `build` generates test stubs in `tests/<feature>/generated/` and contract placeholders in `src/contracts/`
- `testgen` and `contractgen` require AI config in `aitri.config.json`
- `prove` exits with code `0` when all FRs are covered by passing TC stubs
- `proof-of-compliance.json` written to `docs/implementation/<feature>/`
- `status json` exposes `recommendedCommand` for the exact next CLI action

Runtime verification command detection order:
1. `package.json` script `test:aitri`
2. `package.json` script `test:smoke`
3. `package.json` script `test:ci`
4. `package.json` script `test:unit`
5. `package.json` script `test`
6. Node fallback from test files in `tests/`, `test/`, or `__tests__/` (`node --test <picked-file>`)
7. `--verify-cmd "<command>"` to force an explicit command

Optional guided draft (interactive):
```bash
aitri draft --guided
```

Optional guided discovery interview (interactive):
```bash
aitri discover --feature user-auth --guided
```

Optional guided discovery depth:
```bash
aitri discover --feature user-auth --guided --discovery-depth quick
aitri discover --feature user-auth --guided --discovery-depth standard
aitri discover --feature user-auth --guided --discovery-depth deep
```

Optional retrieval mode:
```bash
aitri discover --feature user-auth --retrieval-mode section
aitri discover --feature user-auth --retrieval-mode semantic
aitri plan --feature user-auth --retrieval-mode semantic
```

`aitri plan` reads discovery interview mode and emits matching rigor guidance in:
- `docs/plan/<feature>.md`
- `backlog/<feature>/backlog.md`
- `tests/<feature>/tests.md`
- `discover` and `plan` use section-level retrieval snapshots from the approved spec by default.

Fast full demo path:
```bash
npm run demo:5min
```

## 4b) First Real Workflow (Agent Developer — Auditor Mode)

In the agent-centric flow, the AI agent generates the backlog and tests, and Aitri acts as the auditor:

```bash
# 1. Restore session context
aitri checkpoint show

# 2. Spec phase (human approves)
aitri draft --feature user-auth --idea "Email and password login with forgot-password flow"
aitri spec-improve --feature user-auth       # AI-powered spec quality review
aitri approve --feature user-auth
aitri discover --feature user-auth

# 3. Agent generates backlog.md and tests.md (outside Aitri)
# Your agent writes agent-backlog.md and agent-tests.md following the format at:
# docs/guides/AGENT_INTEGRATION_GUIDE.md

# 4. Preview the delta before committing
aitri diff --feature user-auth --proposed agent-backlog.md

# 5. Aitri audits traceability, then writes if valid
aitri plan --feature user-auth --ai-backlog agent-backlog.md --ai-tests agent-tests.md

# 6. Semantic intent validation
aitri verify-intent --feature user-auth

# 7. Continue standard flow
aitri go --feature user-auth --yes
aitri build --feature user-auth --yes
aitri testgen --feature user-auth
aitri contractgen --feature user-auth
aitri prove --feature user-auth --mutate
aitri deliver --feature user-auth
```

Key principle: the agent handles Markdown authoring; Aitri enforces the traceability contract.
For the full agent integration spec, see `docs/guides/AGENT_INTEGRATION_GUIDE.md`.

Guided draft behavior:
- Captures summary, actor, outcome, scope, and technology preference.
- If technology is present in the requirement, Aitri asks to confirm or replace it.
- If technology is missing, Aitri suggests a baseline stack.

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
Use the aitri skill and run aitri resume json
```

If project is empty, continue with:
```text
Use the aitri skill and run aitri init
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
- Add `--non-interactive --yes` for write commands only in CI/automation

`validate fails with missing feature`
- Add `--feature <feature-name>` in automated runs (recommended always in multi-feature repos)

`Skill tries to read docs before init in a new repo`
- Run `aitri resume json`
- If `nextStep` is `aitri init`, run `aitri init`
- Re-run `aitri resume json`

## 9) Operational Recommendation

For reproducible team adoption:
1. Keep Aitri installed globally in contributor machines.
2. Add project-level skill files (`.claude/skills` or `.opencode/skills`) when team-shared behavior is required.
3. Run `aitri resume` as the first step of every agent session.

## 10) Pause and Resume Safely

Aitri auto-checkpoint behavior:
- Write commands (`init`, `draft`, `approve`, `discover`, `plan`) create automatic checkpoints when run inside a git repository.
- Aitri keeps the latest 10 managed checkpoint tags.
- Disable for one command with `--no-checkpoint`.

Manual checkpoint (optional):
```bash
git add -A
git commit -m "checkpoint: <feature> <phase>"
```

If you cannot commit:
```bash
git stash push -m "checkpoint: <feature> <phase>"
```

When resuming in a new session:
```bash
aitri resume
```

Continue with the recommended command (or use `aitri resume json` for machine-readable `nextStep`).

If `checkpoint.state.resumeDecision` says `ask_user_resume_from_checkpoint`,
confirm resume with the user before any write command.

## 11) Brownfield Path Mapping

If your repository already uses custom folders, create `aitri.config.json` at project root:

```json
{
  "paths": {
    "specs": "workspace/specs",
    "backlog": "workspace/backlog",
    "tests": "quality/tests",
    "docs": "knowledge/docs"
  },
  "policy": {
    "allowDependencyChanges": false,
    "blockedImports": ["left-pad", "@aws-sdk/*"],
    "blockedPaths": ["infra/**", "scripts/deploy/**"]
  }
}
```

Validation rules:
- paths must be relative
- paths cannot contain `..`
- invalid config fails fast with explicit diagnostics
