# Aitri — Architecture Reference

> **Anchor document.** Any architectural proposal must be validated against this doc first — AND this doc must be UPDATED when an architectural change ships (new command, invariant, artifact-chain, or `.aitri`/artifact contract change — the same trigger as an ADR). A stale anchor inverts the relationship: the code ends up defining the doc instead of the doc defining Aitri.
> Last updated: 2026-06-28 (v2.0.0-rc.125).
> This is the stable mental map; the detailed dated record is `DECISIONS.md` (ADRs) + `CHANGELOG.md` (both committed at `docs/`). The per-era evolution record below is the same content, reshaped as a scannable table (was one run-on paragraph through rc.117).

## What Aitri is

Aitri turns an idea into **documented, maintainable software a team can keep growing** — software that scales *as a product* (it grows in features, size, and people without rotting), **not** necessarily under load (runtime performance/throughput is the team's architecture, not Aitri's promise). It does this by running AI-assisted development through a **spec-driven SDLC** — discovery → requirements → design → tests → build → verify → deploy — each phase gated and human-validated, with the artifact chain as the single source of truth.

Two outcomes are first-class:
- **Documentation across the whole product, not just the code.** The artifact chain IS the documentation — product discovery, requirements (PRD/SRS), UX/design spec, system/architecture design, test plan, build report, traceability. Product, design, and QA read it without reading code; it is the byproduct of the process, not extra work.
- **Verified against intent, with nothing dropped.** Code is tested against the requirements, every MUST requirement is traced to a passing test (`fr_coverage` / `verify-complete`), and the idea→requirement decomposition is made explicit so no part of the requirement is silently lost (`coverage_map` + `audit requirements`). This is already built — the verification spine.

It **generates briefings + gates for an AI agent** (it does not write code itself) and orchestrates the project's own tools (test runner, linter, type-checker, security scanner) by exit code — zero external dependencies. **It is for project and development teams in companies of any size and any industry:** it scales down to a solo/small project (the N=1 linear pipeline, no ceremony) and is designed to scale up to multi-role teams (PM/PO/architect/developer/QA/devops personas). Aitri is a *passive producer*; subproducts (Hub) consume its artifacts autonomously, with no runtime coupling.

> **Target vs evidence:** the above is the *target* (who Aitri is for, and the outcome it promises — design for it, including the team/at-scale case). The *evidence base* (who has validated Aitri end-to-end) is separate and narrow (author canaries + one third-party adopter); design for the target, but do not treat the target's value as confirmed until a real consumer validates it.

### Architectural evolution (rc.45 → present)

Each row is an era, not an exhaustive list — the authoritative dated record stays in `DECISIONS.md` + `CHANGELOG.md`. The rc.117 paragraph→table reshape preserved every ADR and architectural claim; a few call-site symbol enumerations were compressed (full detail lives in the ADRs/CHANGELOG). Rows past rc.117 bring the anchor current.

| Release | What shipped (structural) | ADR / ref |
|:---|:---|:---|
| rc.51 | **State split** — `.aitri` (shared, committed) + `.aitri.local` (per-machine) | ADR-045 |
| (spine) | **Verification spine** — `verify-run`/`verify-complete` gate on MUST-FR coverage + project-declared `quality_gates`, judged by exit code | — |
| (upgrade) | **`adopt --upgrade` reconciliation protocol** (`lib/upgrade/`) | — |
| rc.58–71 | **Third-party-adopter hardening** of the state machinery — cascade invalidation on re-derivation, phase-ordering gate (`upstreamProducers`), drift/`cascadedPhases`/`frSnapshots` steering, durable `sessionContext`, stack-aware Windows binary resolution | — |
| rc.72–75 | **Fidelity layer** — idea→FR completeness audit (`coverage-auditor` persona, `coverageAuditLastAt`; the command is now `audit requirements`, alias `audit coverage`), MUST-NFR-skip deploy-gate advisory, FR↔test prompt floor | ADR-048 |
| rc.76 / rc.78 | **Contained project layout (LAYOUT-1)** — everything Aitri-owned under `aitri/` (`aitri/product/{IDEA.md, idea_context/, spec/}` + `aitri/BACKLOG.md` + `aitri/features/`), `.aitri` stays at root, additive `layoutRoot`, layout knowledge in `lib/state.js` helpers + `reconcile-patterns.js#isAitriStatePath`; legacy projects opt in via `adopt --upgrade --layout` (rc.78, `lib/upgrade/layout-migration.js` — the only directory-moving op: clean-git gate, dry-run default, agent-blocked, ownership-marker claims) | ADR-049 |
| rc.80 | **Unified seed lifecycle** — the seed brief (`IDEA.md`/`FEATURE_IDEA.md`) is absorbed into `01_REQUIREMENTS.json#original_brief` at approve 1 and MOVED to `archive/` inside its unit (never deleted, never duplicated — the materialized-copy mechanism is gone); `archive/` is never read as current intent. Validated by two canary rounds + adversarial review (rc.79/81/82 fix batches) | ADR-050 |
| rc.83 | **Security layer** — `audit security`: adversarial audit of code, repo, AND deployed surface (`security-auditor` persona, `securityAuditLastAt`, RQ-SEC remediation, resume nudge on declared security NFRs); SEC-TRACE-1 (build prompts forbid @aitri-trace/internal comments in publicly-served assets); expected security `quality_gate` when security NFRs are declared | ADR-051 |
| rc.85–89 | **FB-MULTI-0619** (three consumers — one Next.js, two .NET/Umbraco): `verify-run` reads file-based results (TRX + JUnit-XML, `--results` + mtime-guarded auto-discovery), `tc verify --evidence` records an unparseable-but-real result — the universal result contract (stdout marker / JUnit-XML-or-TRX / evidence; no parser-per-stack, orchestrate-don't-bundle); build gate inherits Phase-3 manual mode (no runner when every TC is `automation:"manual"`); `adopt scan` sees nested project folders; phase briefings generalize to "change to an existing system" (preservation contracts, change-surface decomposition) | ADR-052 |
| rc.103 | **Fake-pass / C1 enablement** — mutation testing as an opt-in project-declared `quality_gate` (exit-code judged, no score parser — the only mechanical catch for a test that passes without exercising real code), additive `quality_gates[].timeout_ms`, advisory `verify-run` nudge when automated tests exist but no mutation gate. NOT a forced gate or independent-reviewer verdict (both honor-system; no API calls) | ADR-053 |
| rc.106 | **Adoption model corrected** — `adopt` is bivalent: stabilize/institutionalize OR pursue a specific objective (migration/feature/refactor/security), stabilization the DEFAULT when no objective is stated | ADR-055 |
| rc.107 | **Guided-initiation stage 1** — `ADOPTION_SCAN.md → ADOPTION_AUDIT.md` becomes a CONSUMED artifact: `adopt apply` moves it into the unit's `idea_context/` (Phases 1-3 list it, `run-phase.js` CONTEXT_PHASES), Phase-1/2 prompts ground reqs+design in its findings; `IDEA.md` stays pure intent | ADR-056 |
| rc.108 | **Guided-initiation stage 2** — bare `aitri adopt` scaffolds the objective seed (structured `IDEA.md` Adoption-Objective template, never clobbered) + `idea_context/` and guides to scan; scan respects an existing `IDEA.md`; `apply` relocates an orphan root `idea_context/`. Adopt-initiation thread closed | ADR-056 |
| rc.109–117 | **Adversarial-review hardening series** (ADV-0622/R3, 2026-06-22 full review, P0→P3 with diff-review each batch). Architectural: **ADR-057** — a *pending* `status:"manual"` TC no longer satisfies a coverage gate (only a verified manual TC counts), closing a deploy-gate false-pass; **ADR-058** — "git is never invoked through a shell with interpolated values" is a security invariant (all git via `execFileSync('git', [...])`, closing two committed-`.aitri`/`BUGS.json` RCE chains). Hardening (not new structure): no-silent-downgrade guard (`compareVersions`), BOM-tolerant reads (`state.js#readArtifactFile`), atomic writes (`state.js#atomicWrite`), verifier-floor matchers + `runner_override` + `--results` staleness, opt-in `validate --ci`, UX-before-architecture next-action ladder, audit-grounding/stack-agnostic prompt fixes (principle 4), `snapshot.js` dedup routing `.aitri` resolution through `state.js` | ADR-057, ADR-058 |
| rc.119 | **Phase-1 `no_go_zone` content gate** — `complete 1`/`approve 1` require a non-empty `no_go_zone` (≥3 root / ≥1 feature; same feature-floor as FR/NFR minimums) | REQ-RICHNESS-0624 |
| rc.120 | **`aitri feature discard <name>`** — isTTY-gated retirement of a cancelled feature: deletes the feature dir + SURFACES the shared code it built (git reverts it, not Aitri); single-path-segment guard against `discard ..` traversal | FEAT-DISCARD-0624 |
| rc.122 | **`aitri feature <name> audit requirements`** — feature-scoped idea→FR completeness audit (`FEATURE_IDEA.md`/absorbed `original_brief` vs the feature's FRs; preserves ADR-048 independence). Root `audit coverage` renamed → `audit requirements` (deprecated alias kept, non-breaking) | AUDIT-COV-FEAT-0625 |
| rc.124 | **Intent coverage map** — `01_REQUIREMENTS.json#coverage_map` (`[{need, disposition}]`): the idea→requirement decomposition externalised. Light fresh-seed Phase-1 gate (structural validity); the teeth are `audit requirements`, which diffs its independent re-derivation against the map to surface a silently-dropped need. Mitigation, not guarantee (ceiling stated) | ADR-060 |

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
                          adopter, auditor, coverage-auditor,
                          security-auditor (meta — not phase-bound)
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
                          audit, auditPlan, auditCoverage, auditSecurity, reconcile
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
| `idea/`-as-unit folder (root project inside an `idea/` sibling of `features/`) | REJECTED in ADR-049 (symmetry paradox + `idea/` name collision with the legacy assets folder). Superseded by the **contained layout** that DID ship (rc.76): `aitri/` container with `product/` + `features/` units — containment was the real goal, not unit symmetry |
| Hard gate on provenance `source` / a 2nd honor-system confirmation gate | A gate an agent can satisfy by fabricating a string is theater; provenance source is a WARNING + approve visibility, not a block (ADR-043) |
