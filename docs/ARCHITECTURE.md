# Aitri — Architecture Reference

> **Anchor document.** Any architectural proposal must be validated against this doc first — AND this doc must be UPDATED when an architectural change ships (new command, invariant, artifact-chain, or `.aitri`/artifact contract change — the same trigger as an ADR). A stale anchor inverts the relationship: the code ends up defining the doc instead of the doc defining Aitri.
> Last updated: 2026-06-23 (v2.0.0-rc.117).
> This is the stable mental map; the detailed dated record is `DECISIONS.md` (ADRs) + `CHANGELOG.md` (both committed at `docs/`). **Architectural evolution since rc.45:** the `.aitri` + `.aitri.local` state split (ADR-045, rc.51) — shared committed state vs per-machine local; the verification spine (`verify-run`/`verify-complete` gate on MUST-FR coverage + project-declared `quality_gates`, judged by exit code); the `adopt --upgrade` reconciliation protocol (`lib/upgrade/`); the rc.58–71 third-party-adopter hardening of the state machinery — cascade invalidation on re-derivation, the phase-ordering gate (`upstreamProducers`), drift/`cascadedPhases`/`frSnapshots` steering, durable `sessionContext`, and stack-aware Windows binary resolution; the rc.72–75 fidelity layer — the `audit coverage` idea→FR completeness audit (ADR-048, `coverage-auditor` persona, `coverageAuditLastAt`), the MUST-NFR-skip deploy-gate advisory, and the FR↔test prompt floor; and the rc.76 **contained project layout** (LAYOUT-1, ADR-049) — new consumer projects group everything Aitri-owned under `aitri/` (`aitri/product/{IDEA.md, idea_context/, spec/}` + `aitri/BACKLOG.md` + `aitri/features/`), `.aitri` stays at the root, additive `layoutRoot` field, layout knowledge centralized in `lib/state.js` helpers + `reconcile-patterns.js#isAitriStatePath`; legacy projects stay flat until they opt into `aitri adopt --upgrade --layout` (rc.78, `lib/upgrade/layout-migration.js` — the only directory-moving operation: clean-git-tree gate, dry-run default, agent-blocked, ownership-marker claims). On top of it, the rc.80 **unified seed lifecycle** (ADR-050): the seed brief (`IDEA.md` / `FEATURE_IDEA.md`) is absorbed into `01_REQUIREMENTS.json#original_brief` at approve 1 and MOVED to `archive/` inside its unit — never deleted, never duplicated (the feature materialized-copy mechanism is gone); `archive/` is a historical record agents are instructed never to read as current intent. The whole series was validated by two real-canary rounds plus an adversarial multi-agent review (rc.79/rc.81/rc.82 fix batches). rc.83 adds the **security layer** (ADR-051): `audit security` — on-demand adversarial audit of code, repo, AND deployed surface (`security-auditor` persona, `securityAuditLastAt`, RQ-SEC remediation requirements, resume nudge keyed on declared security NFRs) — plus the SEC-TRACE-1 fix (build prompts now forbid @aitri-trace/internal comments in publicly-served assets) and an expected security quality_gate whenever security NFRs are declared. rc.85–89 add the **FB-MULTI-0619** batch from three consumers (one Next.js, two .NET/Umbraco migrations): `verify-run` reads file-based runner results (TRX + JUnit-XML, `--results` + mtime-guarded auto-discovery) and `tc verify --evidence` records an unparseable-but-real result — formalized by **ADR-052** as the verification spine's universal result contract (stdout marker / JUnit-XML-or-TRX file / evidence; no parser-per-stack accretion, orchestrate-don't-bundle); the build gate inherits Phase-3 manual mode (no runner required when every TC is `automation:"manual"`); `adopt scan` health signals see a nested project folder; and the phase briefings generalize their section purpose to serve "change to an existing system" (preservation contracts, change-surface decomposition) as a stack-agnostic peer to greenfield framing. rc.103 adds the **fake-pass / C1 enablement** (ADR-053): mutation testing runs as an opt-in project-declared `quality_gate` (exit-code judged, no score parser — the only mechanical catch for a test that passes without exercising real code), an additive per-gate `quality_gates[].timeout_ms` so slow gates are not killed at the 5-min default, and an advisory `verify-run` nudge when automated tests exist but no mutation gate is declared — explicitly NOT a forced gate or an independent-reviewer verdict (both honor-system: the same agent authors them, and Aitri makes no API calls so it cannot itself be the impartial verifier). rc.106 corrects the **adoption model** (ADR-055): `adopt` is bivalent — it brings an existing project under Aitri either to stabilize/institutionalize it OR to pursue a specific objective in it (a migration, feature, refactor, security fix), stabilization being the DEFAULT when no objective is stated, not the only mode; the persona/template/help/README framing was corrected from the prior stabilization-only definition (the guided-initiation flow that captures the objective + its supporting docs before the audit is a deferred follow-up). rc.107 begins that flow (ADR-056, stage 1): the adoption audit is renamed `ADOPTION_SCAN.md → ADOPTION_AUDIT.md` and becomes a CONSUMED artifact — `adopt apply` moves it into the unit's `idea_context/` (which Phases 1-3 already list, `run-phase.js` CONTEXT_PHASES) and the Phase-1/2 prompts ground requirements + design in its findings, while `IDEA.md` stays the operator's pure intent. rc.108 (ADR-056, stage 2) adds the guided entry: bare `aitri adopt` (previously an error) scaffolds the objective seed (a structured `IDEA.md` Adoption-Objective template, never clobbered) + the `idea_context/` doc home and guides the operator to scan; the scan respects an existing `IDEA.md` (pure intent, not overwritten); and `apply` relocates a root `idea_context/` into the unit (fixing the orphan an adversarial pass caught). The adopt-initiation thread is closed. rc.109–117 are the **adversarial-review hardening series** (the 2026-06-22 full review, ADV-0622/R3 — implemented P0→P3 then diff-reviewed each batch, every review catching real defects in the work). Two of these are architectural and have ADRs: **ADR-057** (rc.109) refines the verification spine — a *pending* (never-verified) `status:"manual"` TC no longer satisfies a coverage gate (only a verified manual TC, recorded `status:"pass"`, counts), closing a deploy-gate false-pass; **ADR-058** (rc.109) makes "**git is never invoked through a shell with interpolated values**" a security invariant — all git calls use `execFileSync('git', [...args])`, closing two committed-`.aitri`/`BUGS.json` RCE chains. The rest is hardening, not new structure: the no-silent-downgrade guard on every version writer (`runUpgrade`/`adopt apply`/`init`, via `compareVersions`); BOM-tolerant artifact reads through one `state.js#readArtifactFile` (a BOM no longer makes a cross-artifact gate silently skip); atomic data writes (`state.js#atomicWrite` backs every JSON file Aitri writes); a verifier-floor pass (line-anchored/go-signature coverage matchers so a log line can't spoof coverage, `runner_override` recorded when `--cmd` overrides the manifest, `--results` staleness warning); the opt-in `aitri validate --ci` exit-code gate; the UX-before-architecture next-action ladder (status/resume agree with the approve-1 steer); audit-grounding + stack-agnostic prompt fixes (principle 4); and a `snapshot.js` dedup that routes `.aitri` path resolution back through `state.js` (`configFilePath`/`configExists`), making the single-`.aitri`-owner invariant true rather than aspirational.

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
