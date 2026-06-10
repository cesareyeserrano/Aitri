# Aitri — Architecture Reference

> **Anchor document.** Any architectural proposal must be validated against this doc first — AND this doc must be UPDATED when an architectural change ships (new command, invariant, artifact-chain, or `.aitri`/artifact contract change — the same trigger as an ADR). A stale anchor inverts the relationship: the code ends up defining the doc instead of the doc defining Aitri.
> Last updated: 2026-06-10 (v2.0.0-rc.71).
> This is the stable mental map; the detailed dated record is `DECISIONS.md` (ADRs) + the dev `CHANGELOG.md`. **Architectural evolution since rc.45:** the `.aitri` + `.aitri.local` state split (ADR-045, rc.51) — shared committed state vs per-machine local; the verification spine (`verify-run`/`verify-complete` gate on MUST-FR coverage + project-declared `quality_gates`, judged by exit code); the `adopt --upgrade` reconciliation protocol (`lib/upgrade/`); and the rc.58–71 third-party-adopter hardening of the state machinery — cascade invalidation on re-derivation, the phase-ordering gate (`upstreamProducers`), drift/`cascadedPhases`/`frSnapshots` steering, durable `sessionContext`, and stack-aware Windows binary resolution.

---

## What Aitri IS

A CLI that orchestrates a 5-phase Spec-Driven Development pipeline so that any LLM agent can build applications from an idea.

- Generates structured phase briefings (stdout)
- The agent reads the briefing, generates the artifact, saves it to disk
- The human approves or rejects each phase before proceeding
- Validates artifacts at `aitri complete` before recording completion

## What Aitri IS NOT

- NOT an LLM API wrapper — makes no API calls
- NOT an agent framework with internal loops
- NOT a Claude Code Skill — not portable across agents
- NOT MCP-based — same portability problem
- NOT a code generator — the agent does that
- NOT a context manager between agents — each phase runs in a clean context
- NOT domain-specific — it is project-agnostic

---

## Design Principles (non-negotiable)

| Principle | Implementation |
| :--- | :--- |
| **Stateless** | Every command reads/writes `.aitri` (shared, committed) + `.aitri.local` (per-machine, gitignored) via `lib/state.js` — no in-memory state. Split in ADR-045 (rc.51) |
| **Model-agnostic** | Plain-text briefings — any bash-capable agent reads them |
| **Zero dependencies** | `"dependencies": {}` — always |
| **No interactive prompts** | 100% scriptable — CI/CD compatible |
| **Human as gate** | `approve`/`reject` are explicit decisions, never automatic |
| **FS as IPC** | Artifacts are plain files — handshake: file exists + passes `validate()` |

---

## File Structure

```
bin/aitri.js              CLI entry point — Command Pattern (switch/case), VERSION const
lib/commands/             One file per command (21 total):
                          init, run-phase, complete, approve, reject,
                          verify, tc, status, validate, help,
                          adopt, wizard, feature, resume, checkpoint,
                          backlog, review, bug, audit, reconcile, rehash
lib/scope.js              scopeTokens() — single source of truth for
                          `aitri feature <verb> <name> <phase>` grammar
lib/verify-display.js     formatVerifyCounts() — three-bucket P/F/Deferred
lib/phases/index.js       PHASE_DEFS map + OPTIONAL_PHASES export + phase alias map
lib/phases/phase1-5.js    Core phase definitions: briefings, extractContext(), validate()
lib/phases/phaseUX.js     Optional UX phase
lib/phases/phaseDiscovery.js Optional Discovery phase
lib/phases/phaseReview.js   Optional Code Review phase
lib/phases/context.js     extractContext() utilities + head() function
lib/personas/             One file per persona:
                          pm, architect, qa, developer, devops,
                          ux, discovery, reviewer (phase-bound),
                          adopter, auditor (meta — not phase-bound)
lib/state.js              loadConfig / saveConfig (merges .aitri + .aitri.local) / readArtifact /
                          writeLastSession / writeSessionContext / writeFrSnapshot / detectAgent /
                          hasDrift / cascadeInvalidate — single point of .aitri I/O (invariant)
lib/snapshot.js           buildProjectSnapshot() — unified source for status / resume / validate
lib/context-assets.js     listAssets() / visualAssets() — idea_context/feature_context helpers
lib/upgrade/              adopt --upgrade reconciliation protocol (diagnose + per-version migrations)
lib/agent-files.js        writeAgentFiles() — multi-agent instruction file generation
lib/prompts/render.js     Template renderer: {{KEY}} / {{#IF_KEY}} placeholders
templates/phases/         All prompt content:
                          requirements, architecture, tests, build, deploy,
                          phaseUX, phaseDiscovery, phaseReview,
                          audit, auditPlan, reconcile
lib/reconcile-patterns.js isBehavioralFile() — SSoT for what `aitri reconcile`/snapshot count
templates/IDEA.md         Initial project template for the user
templates/AGENTS.md       Instruction file template (copied verbatim to 5 per-agent files:
                          CLAUDE.md, GEMINI.md, .codex/instructions.md, .github/copilot-instructions.md, AGENTS.md)
templates/gitignore       gitignore template for generated projects (NO leading dot — npm strips
                          files named `.gitignore` from the published tarball; init writes it as `.gitignore`)
                          init also creates `idea_context/` (root) / `feature_context/` (feature) for assets
test/phases/              One test file per phase (phase1-5, phaseUX, phaseDiscovery, phaseReview)
test/commands/            Unit tests for each command
test/smoke.js             E2E CLI tests
```

---

## 5-Phase Pipeline

| Phase | Persona | Artifact | Inputs |
| :--- | :--- | :--- | :--- |
| 1 | Product Manager | `01_REQUIREMENTS.json` | `IDEA.md` |
| 2 | Software Architect | `02_SYSTEM_DESIGN.md` | `IDEA.md`, `01_REQUIREMENTS.json` |
| 3 | QA Engineer | `03_TEST_CASES.json` | `01_REQUIREMENTS.json`, `02_SYSTEM_DESIGN.md` |
| 4 | Full-Stack Developer | `04_BUILD_REPORT.json` + `src/` | `01`, `02` (head 120), `03` |
| ✦ | Agent | `04_TEST_RESULTS.json` | — (runs real test suite) |
| 5 | DevOps Engineer | `05_TRACEABILITY.json` + Docker | `01`, `02`, `04`, `04_TEST_RESULTS` |

---

## Context Drift Mitigation Strategy

- `extractContext()` per phase: passes only the fields the next agent needs
- Phase 2 → Phase 3: `head(sdd, 160)` — architecture + API, skips risk/deploy
- Phase 2 → Phase 4: passes the **full** system design (the rc.28 audit found `head()` truncation dropped sections the Dev needs — full design now)
- Context assets (`idea_context/` / `feature_context/`) are listed only in the **spec-definition** phases (discovery, requirements, ux, architecture, tests), never in build/deploy/review (rc.39) — bounds staleness
- JSON artifacts: only relevant fields extracted (~40-60% token savings)
- Each phase runs in a clean context — no accumulated history

---

## Command Flow

```
aitri init            → creates IDEA.md + .aitri config
aitri run-phase N     → prints briefing to stdout (agent acts on it)
aitri complete N      → validates artifact + records completion
aitri approve N       → approves phase, shows next step
aitri reject N        → records rejection + feedback, prints re-run command
aitri verify-run      → RUNS the project's test suite (child_process), parses TC results,
                        writes 04_TEST_RESULTS.json, runs declared quality_gates by exit code
aitri verify-complete → gate: all TCs pass + MUST-FR coverage + required quality_gates → unlocks Phase 5
aitri reconcile       → classify code changes made outside the pipeline (was `normalize`, rc.40)
aitri status          → shows pipeline status with ASCII UI
aitri validate        → verifies all artifacts present and approved
```

---

## Development Pipeline

### When to run tests

Run `npm test` before:
- Any `npm i -g .` (local install)
- Any `npm publish`
- Any change to `lib/phases/`, `lib/personas/`, or `lib/state.js`

**All tests must pass. Zero failures accepted. (`npm run test:all`)**

### Impact analysis — what breaks what

| File changed | Impact zone | Action required |
| :--- | :--- | :--- |
| `lib/phases/` | All validate() + all briefings + extractContext() | Full test run + manual smoke test of briefing output |
| `lib/personas/` | All briefings that use the persona | Full test run |
| `lib/state.js` | All commands (every command calls loadConfig/saveConfig) | Full test run |
| `lib/commands/` | Affected command only | Targeted manual test of changed command |
| `bin/aitri.js` | Command routing | Manual test of affected commands |
| `templates/` | Only `aitri init` output | Manual `aitri init` in a temp dir |
| `docs/` | Documentation only | No test needed |

### Version bump policy

Do NOT bump version for: typos, comment fixes, documentation updates, test additions, internal refactors with no behavior change.

**Bump patch (X.Y.Z+1):** bug fixes, warning improvements, error message clarity — behavior identical from the user's perspective.

**Bump minor (X.Y+1.0):** new commands, new `validate()` rules, new phase behaviors, new extractContext fields — backward compatible for existing projects.

**Bump major (X+1.0.0):** breaking changes to artifact schemas (field renamed/removed), pipeline structure changes (phases added/removed), commands renamed or removed.

**Pre-release semver (`X.Y.Z-rc.N`):** the v2.0.0 staging cycle on `feat/upgrade-protocol` moved from `alpha.N` to `rc.N` (currently rc.71). Each rc bumps `N`. The release-sync test enforces `package.json` ↔ `bin/aitri.js VERSION` ↔ `docs/integrations/*.md` headers (SCHEMA, README, ARTIFACTS, STATUS_JSON). The rc number is the iteration counter, not a severity dimension. **Promotion to stable is gated on a third-party adopter validating end-to-end** — not author canaries alone (CLAUDE.md Critical rule). That gate is now MET (DSB-AT-POC validated end-to-end across two rounds, rc.52→rc.64); promotion is a deliberate decision, currently held by choice. Doc governance: most of `docs/Aitri_Design_Notes/*` is untracked/local (BACKLOG, dev CHANGELOG, FEEDBACK, scratch with a `_` prefix), but **`ARCHITECTURE.md` and `DECISIONS.md` live at `docs/` and ARE committed** (team artifacts) — see `docs/Aitri_Design_Notes/README.md`.

**Release checklist:**
1. `npm run test:all` — all tests pass
2. Bump `package.json` version + `bin/aitri.js` VERSION const (keep in sync)
3. Bump headers in `docs/integrations/SCHEMA.md`, `README.md`, `ARTIFACTS.md`, `STATUS_JSON.md` (release-sync test enforces)
4. Update `docs/Aitri_Design_Notes/CHANGELOG.md` — add new version entry
5. Update `docs/integrations/CHANGELOG.md` — add entry tagged `— additive` or `— breaking` (linter enforces)
6. `npm i -g .` — verify local install
7. `npm publish` — only when explicitly decided (currently: not for pre-release alphas)

---

## Discarded Decisions (do not reintroduce without an ADR)

| Decision | Reason discarded |
| :--- | :--- |
| MCP server | Not portable across agents — breaks model-agnostic principle |
| Claude Code Skill | Same problem — only works with Claude Code |
| Internal API calls | Aitri must not depend on any specific model |
| Interactive prompts | Breaks CI/CD and pipe compatibility |
| External dependencies | Any dep is a failure vector for global install |
| In-memory state | Breaks reproducibility across sessions |
| Rename artifacts to industry acronyms (`01_PRD.json`, `02_SDD.md`) | Clear descriptive names read more modern than IEEE/waterfall acronyms; homologation is only partial (04/05 have no industry equivalent). Shipped the homologation *display* layer instead (ADR-042 Phase 3) |
| `idea/`-as-unit folder (root project inside an `idea/` sibling of `features/`) | Highest-risk, near-zero value — restructures path resolution + "where is the project root"; the unit symmetry already exists in code (feature delegates to the same commands). Documented in BACKLOG, not pursued (ADR captured) |
| Hard gate on provenance `source` / a 2nd honor-system confirmation gate | A gate an agent can satisfy by fabricating a string is theater; provenance source is a WARNING + approve visibility, not a block (ADR-043) |
