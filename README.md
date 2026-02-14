<p align="center">
  <img src="assets/aitri-avatar.png" alt="Aitri Header" width="250" />
</p>

<h1 align="center">AITRI</h1>

<p align="center">
  CLI-first, spec-driven SDLC guardrail for human + AI collaboration.
</p>

## What Aitri Is
Aitri enforces a deterministic path from idea to validated SDLC artifacts with explicit human approvals before implementation and deployment assistance.

Core contract:
- Spec first, implementation later.
- Traceability required: `FR -> US -> TC`.
- Human remains final authority on irreversible actions.
- Agents execute inside Aitri gates, not outside them.

## Quick Start (2 Minutes)
### 1) Install globally
```bash
git clone https://github.com/cesareyeserrano/aitri.git
cd aitri
npm i -g .
hash -r
aitri --version
```

### 2) Initialize a target project
```bash
mkdir -p ~/Documents/PROJECTS/my-feature
cd ~/Documents/PROJECTS/my-feature
aitri init --non-interactive --yes
aitri resume json
```

### 3) Run the SDLC baseline flow
```bash
aitri draft --feature user-login --idea "Email/password login" --non-interactive --yes
aitri approve --feature user-login --non-interactive --yes
aitri discover --feature user-login --non-interactive --yes
aitri plan --feature user-login --non-interactive --yes
aitri validate --feature user-login --format json
```

## Command Reference
| Command | Purpose |
|---|---|
| `aitri init` | Create base SDLC structure (`specs`, `backlog`, `tests`, `docs`) |
| `aitri draft [--guided]` | Create draft spec from idea input |
| `aitri approve` | Run gates and move draft to approved spec |
| `aitri discover [--guided]` | Create discovery artifact + backlog/tests scaffolding |
| `aitri plan` | Create plan artifact + structured backlog/tests templates |
| `aitri validate` | Validate artifacts, placeholders, and coverage links |
| `aitri status` | Show state and next recommended step |
| `aitri resume` | Resolve checkpoint decision and print deterministic next command |
| `aitri handoff` | Summarize SDLC readiness and require explicit go/no-go |
| `aitri go` | Explicitly enter implementation mode after handoff readiness |
| `aitri help` | Show command/options help |

## Output Modes and Automation Flags
- `json` shorthand: `aitri status json`, `aitri resume json`
- `--json` or `-j`: machine-readable output (`status`, `validate`)
- `--format json`: explicit format mode
- `--non-interactive`: disable prompts
- `--yes`: auto-approve write plans
- `--feature <name>`: explicit feature target
- `--idea "<text>"`: non-interactive draft input
- `--no-checkpoint`: disable auto-checkpoint for one command

## Guided Modes
- `aitri draft --guided`
  - Structured requirement intake (summary, actor, outcome, scope, technology).
  - Confirms requirement-defined technology or suggests a baseline.
- `aitri discover --guided`
  - Deeper discovery interview (users, JTBD, constraints, dependencies, metrics, assumptions, scope).
- `aitri plan`
  - Blocks if discovery confidence is `Low` or required discovery sections are missing.

## Auto-Checkpoint and Resume
Write commands (`init`, `draft`, `approve`, `discover`, `plan`) create auto-checkpoints in Git repositories.

Checkpoint policy:
- Commit message pattern: `checkpoint: <feature> <phase>`
- Managed tag pattern: `aitri-checkpoint/*`
- Retention: latest 10 managed checkpoint tags

Resume protocol:
```bash
aitri resume
```
For automation:
```bash
aitri resume json
```
Follow `recommendedCommand` (or `nextStep` in JSON output).

## Persona Model (Iterative, Multi-Pass)
Aitri personas are not one-shot. Re-run them whenever context changes.

Available personas:
- Discovery
- Product
- Architect
- Developer
- QA
- Security
- UX/UI (for user-facing features)

Role boundaries and interaction flow:
- `docs/runbook/PERSONA_INTERACTION_FLOW.md`

## Skill Adapters
Aitri skill contracts:
- Codex: `adapters/codex/SKILL.md`
- Claude: `adapters/claude/SKILL.md`
- OpenCode: `adapters/opencode/SKILL.md`

Codex local install:
```bash
mkdir -p ~/.codex/skills/aitri
cp adapters/codex/SKILL.md ~/.codex/skills/aitri/SKILL.md
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
`aitri validate` checks:
- required artifacts
- placeholder leakage (`FR-?`, `AC-?`, `US-?`)
- structure (`### US-*`, `### TC-*`)
- coverage links:
  - `FR -> US`
  - `FR -> TC`
  - `US -> TC`

JSON response includes:
- `issues`
- `gaps`
- `gapSummary`

## Exit Codes
- `0` success
- `1` error
- `2` user-aborted action

## Troubleshooting
- Prompting in automation:
  - add `--non-interactive --yes`
- Missing feature in non-interactive validate:
  - add `--feature <name>`
- Skill not discovered (Codex):
  - confirm `~/.codex/skills/aitri/SKILL.md`
  - confirm YAML frontmatter (`name`, `description`)
  - restart Codex
- New repo missing structure:
  - run `aitri resume json`
  - if `nextStep = aitri init`, run `aitri init --non-interactive --yes`

## Documentation Index
- `docs/README.md`
- `docs/guides/GETTING_STARTED.md`
- `docs/EXECUTION_GUARDRAILS.md`
- `docs/AGENT_EXECUTION_CHECKLIST.md`
- `docs/PROGRESS_CHECKLIST.md`
- `docs/STRATEGY_EXECUTION.md`
- `docs/guides/SKILL_PACKAGING_AND_INSTALL.md`
- `docs/runbook/SESSION_CHECKPOINT_AND_RESUME.md`
- `docs/runbook/PERSONA_INTERACTION_FLOW.md`
- `backlog/aitri-core/backlog.md`

## License and Authorship
- License: Apache-2.0 (`LICENSE`)
- Attribution notice: `NOTICE`
- Repository author: César Augusto Reyes

Note:
- Cloning preserves full Git commit history and commit authorship metadata by default.
