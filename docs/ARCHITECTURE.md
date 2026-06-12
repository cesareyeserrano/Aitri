# Aitri — Architecture Reference

> **Anchor document.** Any architectural proposal must be validated against this doc first — AND this doc must be UPDATED when an architectural change ships (new command, invariant, artifact-chain, or `.aitri`/artifact contract change — the same trigger as an ADR). A stale anchor inverts the relationship: the code ends up defining the doc instead of the doc defining Aitri.
> Last updated: 2026-06-11 (v2.0.0-rc.75).
> This is the stable mental map; the detailed dated record is `DECISIONS.md` (ADRs) + `CHANGELOG.md` (both committed at `docs/`). **Architectural evolution since rc.45:** the `.aitri` + `.aitri.local` state split (ADR-045, rc.51) — shared committed state vs per-machine local; the verification spine (`verify-run`/`verify-complete` gate on MUST-FR coverage + project-declared `quality_gates`, judged by exit code); the `adopt --upgrade` reconciliation protocol (`lib/upgrade/`); the rc.58–71 third-party-adopter hardening of the state machinery — cascade invalidation on re-derivation, the phase-ordering gate (`upstreamProducers`), drift/`cascadedPhases`/`frSnapshots` steering, durable `sessionContext`, and stack-aware Windows binary resolution; and the rc.72–75 fidelity layer — the `audit coverage` idea→FR completeness audit (ADR-048, `coverage-auditor` persona, `coverageAuditLastAt`), the MUST-NFR-skip deploy-gate advisory, and the FR↔test prompt floor.

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
                          adopter, auditor, coverage-auditor (meta — not phase-bound)
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
                          audit, auditPlan, auditCoverage, reconcile
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

## Command surface & dev process — live sources, not duplicated here

Intentionally NOT inventoried in this anchor — they change every release and would rot. Read them at the source:
- **Command surface / flow** → `aitri help` (authoritative, always current).
- **Dev process · version-bump policy · release checklist · impact analysis** → `CLAUDE.md` (the *Working Method* + *Critical rules*).
- **What shipped, when** → `docs/CHANGELOG.md`.

This doc keeps only the durable architecture (above) + the non-negotiable rejections (below). `ARCHITECTURE.md` and `DECISIONS.md` are committed team artifacts at `docs/`; the rest of the dev working notes are kept local to the maintainer.

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
