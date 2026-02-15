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
aitri verify --feature user-login --format json
aitri policy --feature user-login --format json
```

### 4) Run the 5-minute reproducible demo
```bash
npm run demo:5min
```

## Command Reference
| Command | Purpose |
|---|---|
| `aitri init` | Create base SDLC structure (`specs`, `backlog`, `tests`, `docs`) |
| `aitri draft [--guided]` | Create draft spec from idea input |
| `aitri approve` | Run gates and move draft to approved spec |
| `aitri discover [--guided]` | Create discovery artifact + backlog/tests scaffolding |
| `aitri plan` | Create plan artifact + structured backlog/tests templates |
| `aitri verify` | Execute runtime verification suite and persist evidence |
| `aitri policy` | Run managed-go policy checks (dependency drift, forbidden imports/paths) |
| `aitri validate` | Validate artifacts, placeholders, and coverage links |
| `aitri status` | Show state and next recommended step |
| `aitri resume` | Resolve checkpoint decision and print deterministic next command |
| `aitri handoff` | Summarize SDLC readiness and require explicit go/no-go |
| `aitri go` | Explicitly enter implementation mode after handoff readiness |
| `aitri help` | Show command/options help |

## Output Modes and Automation Flags
- `json` shorthand: `aitri status json`, `aitri resume json`
- `--json` or `-j`: machine-readable output (`status`, `verify`, `policy`, `validate`)
- `--format json`: explicit format mode
- `--non-interactive`: disable prompts
- `--yes`: auto-approve write plans
- `--feature <name>`: explicit feature target
- `--idea "<text>"`: non-interactive draft input
- `--verify-cmd "<command>"`: explicit runtime verification command
- `--discovery-depth <quick|standard|deep>`: guided discovery depth selector
- `--retrieval-mode <section|semantic>`: retrieval mode for `discover`/`plan`
- `--ui`: generate static status insight page (`aitri status --ui`)
- `--no-checkpoint`: disable auto-checkpoint for one command

`status` and `handoff` JSON responses include:
- `nextStep`: internal SDLC state (example: `aitri verify`, `ready_for_human_approval`)
- `recommendedCommand`: exact command to run next (human-friendly)
- `nextStepMessage` (`status`): short reason for the recommendation
- `confidence` (`status`): weighted readiness model
  - `score = (specIntegrity * 0.4) + (runtimeVerification * 0.6)`
  - includes `components`, `weights`, `level`, and `releaseReady`

## Guided Modes
- `aitri draft --guided`
  - Structured requirement intake (summary, actor, outcome, scope, technology).
  - Confirms requirement-defined technology or suggests a baseline.
- `aitri discover --guided`
  - Progressive discovery interview to reduce friction and avoid shallow specs.
  - `quick` (default): core decision inputs only.
  - `standard`: quick + scope/journey/assumptions.
  - `deep`: standard + urgency/baseline/no-go prompts.
  - Uses section-level spec retrieval for context snapshots (avoids full-spec dumps).
  - Optional advanced mode: `--retrieval-mode semantic` (local semantic-lite retrieval).
- `aitri plan`
  - Blocks if discovery confidence is `Low` or required discovery sections are missing.
  - Adapts planning rigor from discovery `Interview mode` (`quick|standard|deep`) and propagates it into plan/backlog/tests guidance.
  - Inherits retrieval mode from discovery (or override with `--retrieval-mode`).

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

Brownfield mapping (`aitri.config.json`) example:
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
Rules:
- all mapped paths must be relative
- `..` segments are not allowed
- invalid config fails fast with explicit diagnostics
- when config is absent, defaults are used (`specs/backlog/tests/docs`)

## Validation Model
`aitri validate` checks:
- required artifacts
- placeholder leakage (`FR-?`, `AC-?`, `US-?`)
- structure (`### US-*`, `### TC-*`)
- persona gates (Discovery/Product/Architect required outputs)
- coverage links:
  - `FR -> US`
  - `FR -> TC`
  - `US -> TC`

JSON response includes:
- `issues`
- `gaps`
- `gapSummary`
  - includes `persona` gap category when persona-required sections are unresolved

`aitri verify` checks:
- executes runtime tests using:
  - `--verify-cmd` (if provided), or
  - `package.json` scripts (`test:aitri`, then `test:smoke`, then `test:ci`, then `test:unit`, then `test`)
  - Node fallback when test files are found under `tests/`, `test/`, or `__tests__/` (`node --test <picked-file>`)
- writes evidence to `docs/verification/<feature>.json`
- gates `handoff`/`go` through `status` (`nextStep = aitri verify` when missing/failing/stale)

`aitri policy` checks:
- dependency drift in git workspaces (manifest changes) when `allowDependencyChanges = false`
- forbidden imports in changed source files
- forbidden path writes in changed files
- writes evidence to `docs/policy/<feature>.json`
- blocks `aitri go` when policy fails

## Planned Next Capabilities
- Advanced semantic indexing improvements for very large-context projects.

Roadmap references:
- `backlog/aitri-core/backlog.md`
- `docs/feedback/STRATEGIC_FEEDBACK_2026-02.md`

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
- Verify fails with `no_test_command`:
  - add `package.json` script `test:aitri`
  - or run `aitri verify --verify-cmd "<your-test-command>"`

## Documentation Index
- `docs/README.md`
- `docs/guides/GETTING_STARTED.md`
- `docs/EXECUTION_GUARDRAILS.md`
- `docs/AGENT_EXECUTION_CHECKLIST.md`
- `docs/PROGRESS_CHECKLIST.md`
- `docs/STRATEGY_EXECUTION.md`
- `docs/guides/SKILL_PACKAGING_AND_INSTALL.md`
- `docs/runbook/SESSION_CHECKPOINT_AND_RESUME.md`
- `docs/runbook/DEMO_5_MINUTES.md`
- `docs/runbook/PERSONA_INTERACTION_FLOW.md`
- `backlog/aitri-core/backlog.md`

## License and Authorship
- License: Apache-2.0 (`LICENSE`)
- Attribution notice: `NOTICE`
- Repository author: César Augusto Reyes

Note:
- Cloning preserves full Git commit history and commit authorship metadata by default.
