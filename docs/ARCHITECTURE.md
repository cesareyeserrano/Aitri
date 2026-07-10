# Aitri — Architecture Reference

> **Anchor document.** Any architectural proposal must be validated against this doc first — AND this doc must be UPDATED when an architectural change ships (new command, invariant, artifact-chain, or `.aitri`/artifact contract change — the same trigger as an ADR). A stale anchor inverts the relationship: the code ends up defining the doc instead of the doc defining Aitri.
> Last updated: 2026-07-05 (v2.0.0-rc.158).
> This is the stable mental map; the detailed dated record is `DECISIONS.md` (ADRs) + `CHANGELOG.md` (both committed at `docs/`). The per-era evolution record below is the same content, reshaped as a scannable table (was one run-on paragraph through rc.117).

## What Aitri is

Aitri is **the harness that makes agentic software engineering rigorous.** It orchestrates a **gated, spec-driven SDLC** — discovery → requirements → design → tests → build → verify → deploy, each phase human-validated — where **the agent does the work**, with the artifact chain as the single source of truth. It does **not** write the code or guarantee it is good: it makes the agent's engineering **disciplined, traceable, and inspectable instead of vibe-coded**. (A *harness* in the agentic-engineering sense — the scaffolding around the model that keeps the agent on rails and catches it when it strays, while the agent does the engineering.) That discipline is what lets the produced software grow *as a product* — in features, size, and people without rotting (maintainability, change-safety) — **not** under runtime load (performance/throughput is the team's architecture, not Aitri's promise).

Two outcomes are first-class:
- **Documentation across the whole product, not just the code.** The artifact chain IS the documentation — product discovery, requirements (PRD/SRS), UX/design spec, system/architecture design, test plan, build report, traceability. The narrative artifacts (discovery, UX spec, system design, code review) are markdown product/design/QA read directly; the structured artifacts (requirements, test plan, build report, traceability) are JSON — the machine-readable source of truth rendered for humans by Hub (Core stays a passive producer; a standalone `aitri export` to markdown is deferred until a consumer needs the rendered form without Hub). It is the byproduct of the process, not extra work.
- **Verified against intent, with nothing *silently* dropped.** Code is tested against the requirements, every MUST requirement is traced to a passing test (`fr_coverage` / `verify-complete`), and the idea→requirement decomposition is made explicit so a dropped need is caught by comparison rather than lost in silence (`coverage_map` + `audit requirements`). Honest ceiling: the FR→passing-test traceability is **mechanical** (the strong, already-built spine); the idea→requirement top of the chain is **mitigation** — it makes a drop visible/catchable, it does not make it impossible (the audit is agent-performed, not a mechanical guarantee).

It **generates briefings + gates for an AI agent** (it does not write code itself) and orchestrates the project's own tools (test runner, linter, type-checker, security scanner) by exit code — zero external dependencies. **It is for project and development teams in companies of any size and any industry:** it scales down to a solo/small project (the N=1 linear pipeline, no ceremony) and supports multi-role teams (the PM/PO/architect/developer/QA/devops personas) collaborating by **passing the baton through git** — the committed `.aitri` is the shared handoff. Be precise about what that means: the personas are the phase roles a sequence of agents/people step through, and Aitri is **single-agent-sequential**, not a concurrent multi-user system with role assignment/ownership/auth (that remains the team's own git workflow — the concurrency layer is not built). Aitri is a *passive producer*; subproducts (Hub) consume its artifacts autonomously, with no runtime coupling.

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
| rc.124 | **Intent coverage map** — `01_REQUIREMENTS.json#coverage_map` (`[{need, disposition}]`): the idea→requirement decomposition externalised. Light fresh-seed Phase-1 gate (structural validity); the teeth are `audit requirements`, whose prompt directs the agent to diff its independent re-derivation against the map to surface a silently-dropped need (agent-performed, not a mechanical Aitri diff). Mitigation, not guarantee (ceiling stated) | ADR-060 |
| rc.125 | **Adoption builds grounded in existing code** — Phase-4 briefing surfaces `ADOPTION_AUDIT.md` + instructs reading the actual current source of every file to be touched before modifying (greenfield byte-identical; only when an audit exists) | ADOPT-BUILD-0628 |
| rc.126 | **Smoke/quality-gate single-executable contract** — `quality_gate` commands run shell-less (`spawnSync`), so an inline `&&`/`;`/`\|` chain silently runs only the first program; contract + 3 instruction sites now require a single executable, and `verify-run` flags a standalone shell operator (read-only advisory). Rejected a blocking smoke gate (presence-theater) + an Aitri-owned probe (passive-producer line) | SMOKE-GATE-0628 |
| rc.127 | **Verify-run stack-neutral fallback** — with no `--cmd`/`test_runner` declared, `verify-run` falls back to `npm test` only if a `package.json` exists, else refuses with stack-neutral guidance (removes the last Node bias, principle 4) | FALLBACK-DEFAULT-0628 |
| rc.128 | **`.aitri` merge-conflict refuses-don't-reset** — `loadConfig` detects unresolved git conflict markers and throws actionable guidance instead of silently resetting shared pipeline state to DEFAULTS (the team case the committed `.aitri` exists to serve); `tc verify` skip-partition kept consistent with `skipped` | G-4 / C-2 (2026-06-28) |
| rc.129 | **Spine hardening from the purpose review** — deploy-gate **run-binding**: `verify-run`/`tc verify` stamp `.aitri#verifyResultsHash`; `verify-complete` rejects a results file edited after the run (closes the "edit results to pass" shortcut; absent-hash = backward-compatible). **Phase-2 design↔FR advisory**: `complete 2`/`runReview('phase2')` surface MUST FRs whose id is absent from `02_SYSTEM_DESIGN.md` (closes the read side Phase-2 `validate(content)` structurally cannot — advisory, not a hard block) | Finding-1 / Phase-2 (2026-06-28) |
| rc.130 | **`aitri export traceability`** — first renderer of the structured (JSON) artifacts as human-readable Markdown (the req × tc × pass/fail × compliance matrix), closing the "docs PM/QA read without code" gap that Hub (being rebuilt) otherwise owns. Read-only `lib/commands/export.js`; joins 01_REQUIREMENTS + 03_TEST_CASES + 04_TEST_RESULTS#fr_coverage + 05_TRACEABILITY; degrades gracefully; zero-dep table generation (render.js can't). `requirements`/`tests` renderers are the next slices | ADR-062 (purpose-fulfilment plan) |
| rc.131 | **verify-complete default advisory for low-confidence (hollow) tests** — `verify-run` already warned by default; the deploy gate (`verify-complete`) now also surfaces ≤1-assertion TCs (advisory, never a default block — `strictAssertions` stays the opt-in gate), so "green ≠ exercised" is visible at the ship decision | purpose-fulfilment plan (Tier-1 #2) |
| rc.132 | **Build phase suggests an independent adversarial pass** — `build.md` gains the "told to break this, not validate it" subagent block (rc.118 had it in review/test/audit, not build — the highest-value spot). Advisory only; an agent-authored verdict can't be gated (ADR-053 verifier-with-conflict). Outcome of an architecture-critique whose 5 reform proposals were adversarially vetted — only this prompt nudge survived; the reliability ceiling is the zero-dep/passive/honor-system identity, already reached by the existing gates | architecture-critique panel (2026-06-29) |
| rc.138 | **Whole-flow connectivity audit (AUDIT-0630-A/B)** — stepped through every phase + the verification gates checking both consumption mechanisms (declared inputs + direct `readArtifact`). Flow + gates came back connected (verify-run/verify-complete read what they need, block correctly, outputs consumed; rc.137 fidelity TCs ride the existing TC→verify spine). Two same-class residuals closed: code **review** now takes `02_SYSTEM_DESIGN` + `01_UX_SPEC` (optional — a hard input would break `adopt --from`); the **build** briefing now lists the visual reference assets (images + `.html` prototypes) with paths when a UX spec exists (narrow exception to "no raw context at build"). Method lesson: change-scoped adversarial review is blind to un-changed structural gaps | AUDIT-0630 |
| rc.137 | **UX/design spec reaches the builder AND becomes verifiable (AUDIT-0630)** — root-caused from the Ledger pilot (a UI that passed every gate but matched no mockup): the design lived in `01_UX_SPEC.md` but **Phase 4 had no `optionalInputs`** so the build agent never received it (phases 2/3 already do), and `tests.md` required state/mobile/contrast TCs but never **declared-design** TCs. Fix: `phase4.optionalInputs:['01_UX_SPEC.md']` + a build-briefing visual-contract block; a **Declared-design fidelity TCs** requirement in `tests.md` (semantic appearance, affordances, interactions → e2e) so a colorless build now FAILS verify-run. Still passive (no pixel judgment); both blocks gated to a visual surface | ADR-063 |
| rc.148 | **The results file is trusted only when bound to a run (UPLAN-0703 Phase B, B1–B3)** — `verify-complete` now REQUIRES the run-binding stamp (absent stamp blocked, not just mismatched — B1, breaking-ish); `tc verify` holds the same line (refuses stamp-less = fabrication guard, and edited-since-stamp = laundering guard — B2; the stamp requirement was added by the adversarial pass, which showed the mismatch-only guard let `tc verify` bless a hand-fabricated file); one SSoT helper `state.js#verifyResultsBinding` re-checked on every read surface (snapshot/validate/status/health/phase5, root AND terminal features) so a post-run rewrite of `04_TEST_RESULTS.json` no longer hides behind the sticky `verifyPassed` flag (B3). Additive `resultsBinding` on status/validate JSON + new `results_tampered`/`results_missing`/`feature_results_tampered` deploy-gate reasons. Honest ceiling: raises forgery cost (an agent rewriting both the file and `.aitri` stamp still passes), not unforgeability | ADR-069 |
| rc.150 | **Prompt & briefing coherence (UPLAN-0703 Phase C, C1–C7)** — `fr.description` (the PRD's behavioral prose) finally forwarded to phases 2/3/4 and `project_summary` given its first consumer (Phase 2 only); the context-assets block renders INSIDE the briefing via `{{CONTEXT_ASSETS}}`, BEFORE the instructions (was printed after the checklist — an agent that stopped at the instructions never saw the client's spec); persona/template **division rule** written down (`lib/personas/README.md`: personas = role+judgment, templates = ALL mechanics) and the three live drifts fixed (qa vs tests.md on multi-FR/ac_id, devops restating deploy.md's table minus a level, pm hardcoding a root floor); **scope-correct floors** rendered from the `phase1.js#scopeFloors` SSoT and reframed as floors-NOT-targets (sizing comes from the seed via coverage_map — anti-anchoring, both directions: no padding, no stopping at the minimum); Human Review checklists added to ux/discovery (the only approvable phases without one); build/deploy stack assumptions removed (declared CI platform, conditional env-vars, one completion bar, declared-medium instead of unconditional 375px); all pinned by `test/rendered-briefing.test.js` (placeholder-empty renders, section ordering, drift canaries) | UPLAN-0703 C |
| rc.149 | **State integrity — unknown is never clean, corrupt is never reset, de-blocking carries evidence (UPLAN-0703 Phase B, B4–B8)** — reconcile refuses an unreachable baseline (was: false "no changes detected" via `new Date(sha)`=NaN) and clears `verifyPassed` on entering pending (the resolve gate's "tests still pass" now requires a verify that postdates the drift); `loadConfig` reads only `LOCAL_FIELDS` from `.aitri.local` (a shared key there no longer shadows committed team state); every `.aitri` parse failure refuses with restore guidance (G-4 extended beyond conflict markers; feature snapshot keeps the tolerated `parseError` path); `computeHealth` blocks deploy on an approved-but-missing artifact (`artifact_missing`); `bug fix` on a BLOCKING bug requires `--resolution`/`--tc`, `bug verify` requires `fixed`, malformed `BUGS.json` refuses all bug commands + bug-reading gates, unknown severities warn | ADR-070 |
| rc.151–152 | **Phase 4 plan-first + the parser matrix extracted** — a fresh build writes/maintains `BUILD_PLAN.md` (working file, AUDIT_REPORT class — NOT in the artifact chain), presents the plan before code, implements per-cluster with checkpoints at boundaries; debug re-entry renders neither. `lib/verify-parsers.js` extracted from verify.js (~660 lines of pure parse/derive — the seven runner parsers + TRX/JUnit + coverage builders), re-exported so no importer moved | ADR-071 / UPLAN-0703 C8+B9 |
| rc.153–154 | **The human gate becomes a real review; one owner for routing** — agent-mode `approve` emits a PIPELINE CHECKPOINT (approval recorded, human review pending) instead of the literal-obedience imperative; `approve <phase> --show` renders the full artifact; drift re-approval shows the bounded git diff. UX-routing type-check deduped into `lib/requirements.js#hasUxRequiringFr` (the ADV-0622-29 divergence class closed); intent-coverage audit shifted LEFT (`complete 1`/`approve 1`/`resume` + rc.156 the deploy verdict) with content-hash freshness (`coverageAuditReqHash` — mtime was broken three ways) | UPLAN-0703 D |
| rc.157–158 | **Integration contract audited doc-by-doc; the adversarial review closes its findings** — the five `docs/integrations/` docs verified line-by-line against code (new fifth contract doc `VALIDATE_JSON.md` for `validate --json`/`--ci`; `"4r"`→`"review"` artifact-map fix; `nextActions` severity pinned to its enum). Then the full rc.147–157 adversarial review: 0 ship-blockers; reconcile gains `pendingFiles` (drift GROWTH while pending re-clears `verifyPassed` — set-level, content-growth recorded residual) and `status --json` gains `bugs.parseErrors` (a corrupt `BUGS.json` is no longer silently zero to Hub; gates already refused — rc.149 division of labor unchanged) | INTEG-0704 |
| rc.162–168 | **The undesigned edges become designed (UX-PRO-0707)** — the CLI's happy paths were above average, its edges below the `gh`/`cargo` bar. Structural residue of the overhaul: **`lib/format.js`** — color emission single-sourced (`useColor`/`sgr`) so piped/agent-read output never carries ANSI, enforced by `test/format-pin.test.js` (an escape literal anywhere else in `lib/`+`bin/` fails the suite); **`snapshot.js#topNextAction`** — the next-action ladder promoted to an SSoT the phase gates read, so a refused gate (`verify-run`, `verify-complete`, `approve`) names a *reachable* step instead of a command that refuses in turn; **honest agent-mode `approve`** (headline says "recorded by agent — human confirmation pending"; the hard stop stays opt-in `humanApprovalGate`, because agent/CI/sandbox approval is a supported flow, not a defect); **two-level `help`**; **`init` on an existing project** stops claiming a fresh install. Six verified defects (rc.162) → systemic color/help/gates (rc.163–164) → honesty + status/resume noise (rc.165–167) → an independent validation session's adversarial findings fixed at the root (rc.168). No schema/artifact-chain/`.aitri` contract change across the whole range | UX-PRO-0707 (2026-07-07/09) |
| rc.169 | **The UX phase emits an advisory visual preview** — the UX briefing instructs a self-contained `UX_PREVIEW.html` next to `01_UX_SPEC.md` (a visual manual of the spec: token swatches with reasons, type scale at size, computed AA contrast badges, light/dark panels side by side, one banner-bound illustrative strip) so the human approves look & feel at the UX gate instead of first seeing it in built code. Working file, BUILD_PLAN.md class: advisory, no gate, no schema, NOT hashed; single skip = no graphical surface; with client-provided mockups it becomes a transcription read-back; regenerated on feedback re-runs. Hard rule pinned by `test/rendered-briefing.test.js`: the preview RENDERS the spec, never extends it | ADR-073 / FB-UX-MOCKUP-0708 (2026-07-09) |
| rc.170 | **BUILD_PLAN.md becomes epics-of-user-stories with verifiable boundaries** — the Phase-4 plan gets a fixed per-epic skeleton (`Delivers:` US ids first; FR/TC ids as derived references; every TC — incl. NFR/US-less-FR TCs — lands in exactly one epic's `Makes pass`; the epic writes its own TCs' test code) and one vocabulary (cluster→epic, layer roadmap→build steps; the collision rendered as "capa"/"item"/"punto"). An epic is `done` only when its `Makes pass` TCs run green and the boundary checkpoint presents the test OUTPUT — verifiable partial deliveries, the owner-defined value. Epic count comes from the product (small increment = ONE epic, zero intermediate ceremony). Still a working file per ADR-071 (no gate, no schema, not hashed); rejected: `epic` schema field, per-epic mechanical verify (tombstoned, Umbraco-Phase-4 trigger) | ADR-074 / PLAN-EPIC-0708 (2026-07-10) |
| rc.134–136 | **Harness-frame re-audit (AUDIT-0629)** — re-audited the codebase under the corrected "rigor-harness" identity. Four verified edge defects fixed (deploy-gate severity/status **case-fold false-pass**; `tc verify --evidence` **laundering trail** `downgraded_from`; `feature ..` **path-traversal** writing the wrong `.aitri`; null-`events[]` **crash** in snapshot + upgrade), then `export` made to **reuse** the Phase-5 evidence/MUST predicates it had drifted from (one SSoT in `requirements.js`), then the **blocking-bug predicate consolidated** into `bug.js` `isActiveBug`/`isBlockingBug` shared by the root + feature gates. Recurring root cause = a predicate reimplemented inline then drifted → see **Shared predicate SSoTs** above. Each fix adversarially reviewed before ship | AUDIT-0629 (2026-06-29/30) |

---

## What Aitri IS

A CLI harness that orchestrates a gated, 5-phase Spec-Driven Development pipeline in which an LLM agent does the engineering work and a human validates each phase.

- Generates structured phase briefings (stdout)
- The agent reads the briefing, generates the artifact, saves it to disk
- Each phase must be explicitly approved (or rejected) before the pipeline proceeds — by a human, or by an agent relaying the review checkpoint (default mode; `humanApprovalGate` makes approval human-only)
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
| **Scriptable by default** | Every routine op is pipe-safe / CI-compatible; the deliberate exceptions are the human-gated ops (isTTY invariant) — the ops that commit or destroy state: `approve` under `humanApprovalGate` or after drift, `reconcile --resolve`, `rehash`, `feature discard`, re-running a phase of a fully-approved pipeline, failing-stub-TC acknowledgment at `verify-complete`, `adopt --upgrade --layout` |
| **Human as gate** | `approve`/`reject` are explicit decisions, never automatic |
| **FS as IPC** | Artifacts are plain files — handshake: file exists + passes `validate()` |

---

## File Structure

```
bin/aitri.js              CLI entry point — Command Pattern (switch/case), VERSION const
lib/commands/             One file per command (`ls lib/commands/` is the source of truth):
                          init, run-phase, complete, approve, reject,
                          verify, tc, status, validate, help,
                          adopt, wizard, feature, resume, checkpoint,
                          backlog, review, bug, audit, reconcile, rehash, export
lib/scope.js              scopeTokens() — single source of truth for
                          `aitri feature <verb> <name> <phase>` grammar
lib/verify-parsers.js     Pure result parsers & derivations (UPLAN-0703 B9) — the ~660-line
                          stack-agnostic parser matrix (node/vitest/pytest/playwright/go +
                          regex TRX/JUnit-XML), result-file resolution, fr/ac coverage builders,
                          density/coverage scanners. No side effects, no path back to verify.js;
                          verify.js imports + re-exports so the `verify.js` API is unchanged
lib/verify-display.js     formatVerifyCounts() — three-bucket P/F/Deferred
lib/format.js             useColor() / sgr() / divider() — the ONLY place that emits ANSI escape
                          codes (color on an interactive TTY with NO_COLOR unset; '' otherwise, so
                          piped/agent-read output stays escape-free). Pinned by
                          test/format-pin.test.js: an escape literal anywhere else in lib/ or bin/
                          fails the suite. Status glyphs are deliberately NOT centralized here
                          (verify-parsers matches a foreign runner's ✓/✗; verify-display contrasts
                          count markers against the verdict badge — both documented designs)
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
                          Division rule (lib/personas/README.md): personas carry role +
                          judgment ONLY; ALL mechanics (fields, floors, mappings) live in
                          the phase template — a rule never lives in both (C3)
lib/state.js              loadConfig / saveConfig (merges .aitri + .aitri.local) / readArtifact /
                          writeLastSession / writeSessionContext / writeFrSnapshot / detectAgent /
                          hasDrift / cascadeInvalidate — single point of .aitri I/O (invariant)
lib/snapshot.js           buildProjectSnapshot() — unified source for status / resume / validate
                          topNextAction() — the same next-action ladder, read by the phase gates
                          (verify-run, verify-complete, approve) so a refused gate names a REACHABLE
                          step instead of a command that refuses in turn
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

## Shared predicate SSoTs (reuse, don't reimplement)

A recurring defect class (AUDIT-0629) was a predicate/guard reimplemented inline instead of reusing
its canonical definition, where the copy then drifted — a case-sensitive MUST check, an evidence rule
that wrongly accepted `manual`, a blocking-bug filter case-folded in one gate but not the other. These
are the canonical definitions — import them, never re-derive:

| Predicate | SSoT | Consumers |
| :--- | :--- | :--- |
| Hard-block MUST requirement? | `lib/requirements.js` `isMustRequirement()` | phase3, phase5, verify, review, export |
| Does coverage back a high compliance claim? | `lib/requirements.js` `HIGH_COMPLIANCE_LEVELS` / `EVIDENCE_OK_STATUSES` | phase5 (deploy gate), export |
| Bug active / blocking? | `lib/commands/bug.js` `isActiveBug()` / `isBlockingBug()` (+ `bugStatus` / `bugSeverity`) | `getBlockingBugs` (feature gate), `snapshot.aggregateBugs` (root gate) |
| Behavioral change for reconcile/snapshot? | `lib/reconcile-patterns.js` `isBehavioralFile()` | reconcile, snapshot |
| Results file bound to its run? (`bound`/`mismatch`/`no-stamp`/`missing-file`) | `lib/state.js` `verifyResultsBinding()` | snapshot/health, validate, status, phase5 (ADR-069) |
| What is the operator's next step? | `lib/snapshot.js` `topNextAction()` (over `buildProjectSnapshot().nextActions`) | verify-run gate, verify-complete gate, approve gate (UX-PRO-0707) |
| Is color on? / how is an ANSI code emitted? | `lib/format.js` `useColor()` / `sgr()` | help.js today; every future emitter (pinned by `test/format-pin.test.js`) |

A *general* mechanical detector of semantic re-implementation is not buildable; the real catch is the
**independent adversarial pass on changes** (it is what surfaced AUDIT-0629-E/F). This registry + the
per-predicate tests lock the known ones. A new predicate that two gates/commands must agree on belongs
here, defined once.

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
- Context assets (`idea_context/` / `feature_context/`) surface only in the **spec-definition** phases (discovery, requirements, ux, architecture, tests), never in build/deploy/review (rc.39) — bounds staleness. At the **grounding/design** phases (discovery, requirements, ux) readable text is **injected in full** (capped per-file + per-briefing) so the agent cannot silently skip provided definitions, and images / oversized text get a loud "OPEN each" pointer instead of a bare path (ADR-066); phases 2–3 keep the lighter path listing (they build on approved artifacts)
- JSON artifacts: only relevant fields extracted (~40-60% token savings)
- Each phase runs in a clean context — no accumulated history

---

## Command surface & dev process — live sources, not duplicated here

Intentionally NOT inventoried in this anchor — they change every release and would rot. Read them at the source:
- **Command surface / flow** → `aitri help` (authoritative, always current).
- **Dev process · version-bump policy · release checklist · impact analysis** → `CLAUDE.md` (the *Working Method* + *Critical rules*).
- **What shipped, when** → `docs/CHANGELOG.md`.
- **What the data flow MUST uphold** (per-phase inputs + how, gates, mechanical-vs-honor-system ceiling) → `docs/FLOW_INVARIANTS.md`. This anchor is *descriptive* (what Aitri is); FLOW_INVARIANTS is *normative* (what the flow must uphold) — the reference conformance audits validate against. Keep it current in the same commit as any change to phase inputs, an `extract*` transform, the intake/injection policy, or a gate.

This doc keeps only the durable architecture (above) + the non-negotiable rejections (below). `ARCHITECTURE.md`, `DECISIONS.md`, and `FLOW_INVARIANTS.md` are committed team artifacts at `docs/`; the rest of the dev working notes are kept local to the maintainer.

---

## Discarded Decisions (do not reintroduce without an ADR)

| Decision | Reason discarded |
| :--- | :--- |
| MCP server | Not portable across agents — breaks model-agnostic principle |
| Claude Code Skill | Same problem — only works with Claude Code |
| Internal API calls | Aitri must not depend on any specific model |
| Interactive prompts as the default interface | Breaks CI/CD and pipe compatibility — the routine flow stays pipe-safe; the deliberate isTTY human gates (see Design Principles) are the exception, not the interface |
| External dependencies | Any dep is a failure vector for global install |
| In-memory state | Breaks reproducibility across sessions |
| Rename artifacts to industry acronyms (`01_PRD.json`, `02_SDD.md`) | Clear descriptive names read more modern than IEEE/waterfall acronyms; homologation is only partial (04/05 have no industry equivalent). Shipped the homologation *display* layer instead (ADR-042 Phase 3) |
| `idea/`-as-unit folder (root project inside an `idea/` sibling of `features/`) | REJECTED in ADR-049 (symmetry paradox + `idea/` name collision with the legacy assets folder). Superseded by the **contained layout** that DID ship (rc.76): `aitri/` container with `product/` + `features/` units — containment was the real goal, not unit symmetry |
| Hard gate on provenance `source` / a 2nd honor-system confirmation gate | A gate an agent can satisfy by fabricating a string is theater; provenance source is a WARNING + approve visibility, not a block (ADR-043) |
