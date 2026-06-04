# Aitri — Backlog

> Open items only. Closed items are in CHANGELOG.md.
> Priority: P1 (critical) / P2 (important) / P3 (nice to have)

---

## Entry Standard

Every backlog entry must be self-contained — implementable in a future session with zero memory of the original conversation. Before adding an item, verify it answers all of these:

| Question | Why it matters |
| :--- | :--- |
| **What is the user-visible problem?** | Prevents implementing a solution looking for a problem |
| **Which files are affected?** | Implementer knows where to start without exploring |
| **What is the exact behavior change?** | Removes ambiguity about what "done" looks like |
| **Are there technical decisions pre-resolved?** | Captures trade-offs decided during analysis, not during implementation |
| **What does `validate()` or the test need to verify?** | Defines the acceptance criterion at the code level |
| **Are there known conflicts or risks with existing code?** | Prevents regressions on parsers, schemas, or commands |

**Minimum entry format:**
```
- [ ] P? — **Title** — one-line description of the user-visible problem.
  Problem: <why this matters, what breaks without it>
  Files: <lib/..., templates/..., test/...>
  Behavior: <what changes — inputs, outputs, validation rules>
  Decisions: <any trade-offs already resolved>
  Acceptance: <how to verify it works — test or manual check>
```

Entries without `Files` and `Behavior` are considered incomplete and must be expanded before scheduling.

---

## Open

> Ecosystem items (Hub, Graph, future subproducts) live in their own repos' backlogs.
> Core only tracks items that require changes to Aitri Core itself.

### Core — Naming & vocabulary cleanup ([ADR-042](DECISIONS.md)) — APPROVED, phased

Design accepted 2026-06-03. Clean breaks, no aliases; trivial migrations (verified — NOT re-adopt). The real regression risk is the context-aware sweep (`normalizeAC` / string normalisation must NOT be touched) — full test suite is the backstop after every block.

- [x] DONE (rc.40) — **Phase 1: `normalize` → `reconcile`** — full clean rename (command + `.aitri` field + `status --json` contract + `reconcile-patterns.js` + `reconcile.md` + `reconcile.js` + AGENTS + help + docs + tests). Field-rename migration preserves the original baseline. Context-aware sweep (generic `normalizeAC`/string-normalisation untouched); 1315 tests green.
- [x] DONE (rc.41) — **Phase 2: artifact renames** `04_IMPLEMENTATION_MANIFEST`→`04_BUILD_REPORT`, `05_PROOF_OF_COMPLIANCE`→`05_TRACEABILITY`. Migrator renames the file on disk (`diagnoseRenamedArtifacts`); artifactHashes keyed by phase → state/approvals preserved. Historical CHANGELOG/ADR entries left intact (not false history). 1316 tests.
- [x] DONE (rc.42) — **Phase 3: homologation layer** — `aitri help` shows the full industry document type in cyan (prominent, not dim grey); phase briefings open with the artifact's industry document type so the agent reports it by name (PRD/TRD/…). MD phases also title the doc. Recognition/framing, no contract change. 1317 tests. **ADR-042 complete.**

### Core — Naming & professional positioning (PARKED decisions — decide before v2.0.0 stable)

> Surfaced 2026-06-03 by the author reviewing the fresh-install onboarding. Both are NAMING/structure decisions deliberately parked to decide together, deliberately, not piecemeal. **Timing is load-bearing:** renames are breaking, and breaking changes are only acceptable at a major. v2 IS that major — once v2 goes stable with third-party adopters, these names freeze for a long time. So both must be decided in the pre-v2-stable window or accept the current names indefinitely.

- [x] CLOSED (2026-06-03) — **Industry-standard artifact vocabulary — path A (rename files to PRD/SRS/TRD/SDD acronyms) REJECTED.** Path B (homologation layer — keep clear filenames, make the industry document type prominent) shipped as ADR-042 Phase 3 (rc.42). A was rejected: modern AI/dev tooling uses clear names; the formal acronyms (SRS/SDD/TRD) read as dated/IEEE/waterfall, and homologation is only partial (04/05 have no industry equivalent), so renaming would look LESS modern, not more. The perceived professionalism comes from the vocabulary users see (delivered by B), not the literal filename. Revisit only if Aitri targets a regulated-enterprise market where formal acronyms are expected.

- [ ] DOCUMENTED (future — high risk, low value; revisit only on a real need) — **`idea/`-as-unit folder structure.** Group the root project under an `idea/` folder (`idea/IDEA.md`, `idea/idea_context/`, `idea/spec/`), a sibling of `features/`, so root and feature units share one shape.
  Why parked, not pursued: analysed 2026-06-03 — **highest-risk change discussed, near-zero value.** It restructures PATH RESOLUTION (the layer every command depends on) + reshapes "where is the project root" (`.aitri` location) + needs dual-layout branching — qualitatively riskier than a rename, and the test suite gives less confidence (a layout bug can pass one layout while breaking the other). The symmetry it chases ALREADY exists in code (feature.js delegates to the same commands) + parallel naming (`idea_context`/`feature_context`). Net: reorganises folders visually for no functional gain.
  If ever pursued: additive only (new projects), `.aitri` stays at root (avoid the root-identity reshape), `artifactsDir='idea/spec'` (Hub already reads artifactsDir). Trigger: a real reason the visual grouping matters (not aesthetics).

- [x] CLOSED (rc.39) — **Context folder staleness.** Superseded by a simpler rule than the lifecycle mechanism this item proposed: `run-phase` injects context only in spec-DEFINITION phases ({discovery, requirements, ux, architecture, tests}), not execution phases (build/deploy/review). Assets only surface while fresh and relevant, so stale material cannot leak into late-phase briefings — the staleness worry dissolves without any stateful open/closed mechanism. (The close-on-deploy idea was dropped after we found it only addressed the rare "re-touch a completed unit" window.)

### Core — Human checkpoints vs autonomous agents ([ADR-040](DECISIONS.md)) — from first third-party adopter

Surfaced 2026-06-01 by the Inchcape/DSB-AT-POC canary (Copilot CLI): an autonomous agent defeated both human checkpoints (typed `y` at approve; marked all provenance `confirmed` from a self-discovered folder). rc.40 thesis + dispositions are in ADR-040. Levers to ship vs defer:

- [x] DONE (rc.44) — **Instruction-hardening: distinguish user-designated vs self-discovered context.** `AGENTS.md` + the Phase 1 briefing now state: context the user **designated** (`idea_context/`/`feature_context/`, a path they gave) may ground `confirmed`; context the agent **self-discovered** is `assumed` until its source is confirmed (could be stale / wrong project). Producer-side; helps compliant agents (irreducible residual documented, not "fixed"). Briefing test asserts the wording. 1323 tests.

- [x] DONE (rc.44) — **Approve-time provenance nudge.** `summarizeRequirements` now nudges on the all-`confirmed`-with-0-gaps shape (what an over-eager agent produces by marking everything confirmed without asking): "verify YOU confirmed these, especially the success metric, not the agent inferring from docs." Display-only. +2 tests.

- [ ] P3 (FUTURE — gated on a real adopter wanting it) — **AC-level traceability done right ([ADR-041](DECISIONS.md), option A).** rc.36 shipped option B (`ac_id` conditional — stop requiring a join-key with no target). The original Three Amigos vision (every test traces to a specific acceptance criterion) is still valid but was abandoned half-built. Finishing it RIGHT means building the load-bearing piece that never existed: **a consumer**.
  Problem: verify-run measures coverage at the FR level only — it cannot tell you a specific acceptance criterion within an FR is untested (e.g. "FR-001 is covered, but AC-001-3 has no test"). AC-level coverage would catch that. Enterprise/regulated adopters (e.g. the automotive canary) are the likely audience.
  The trap to avoid: do NOT rebuild the upstream half (force structured ACs) without the consumer — that just makes a bigger orphan. The consumer is the point; structured ACs are only its input.
  Files: `lib/commands/verify.js` (NEW: AC-level coverage in fr_coverage / a traceability report), `lib/phases/phase1.js` (accept structured `{id,text}` ACs **additively** — allow string OR object, never break plain-string ACs), `lib/phases/phase3.js` (ac_id already conditional — flips to required once structured ACs exist), `docs/integrations/ARTIFACTS.md` + `CHANGELOG.md`.
  Behavior: when Phase 1 declares structured ACs, verify-run reports per-AC coverage and surfaces untested acceptance criteria; ac_id becomes the real join-key it was always meant to be.
  Decisions (from ADR-041): additive only (acceptance_criteria stays string-OR-object — no breaking type change); build the consumer FIRST or together, never upstream-only. Defer until a real adopter confirms AC-level coverage is wanted (evidence-base discipline — today nothing consumes ac_id, so this is building for a consumer that does not yet exist).
  Acceptance: verify-run test showing an untested AC is flagged; phase1 test accepting both string and object ACs; phase3 test that ac_id is required once structured ACs are present. Version bump + ARTIFACTS/CHANGELOG.

- [ ] P3 (DEFERRED — needs a 2nd consumer signal) — **Structured `source` on `idea_provenance`.** Each `confirmed` carries a short `source`.
  Problem: `confirmed` is unverifiable free text; a `source` raises the cost of dishonesty and improves the reviewer's signal.
  Files: `lib/phases/phase1-checks.js`, `lib/phases/phase1.js`, `lib/commands/approve.js`, `docs/integrations/ARTIFACTS.md` + `CHANGELOG.md`.
  Behavior: additive optional `idea_provenance_sources` (do NOT change the existing enum's type — schema-evolution rule); surfaced at approve.
  Decisions: HELD per ADR-040 + evidence-base discipline — one data point is not enough; it is still honor-system at root (agent can fabricate a source). Ship only if a second adopter confirms the need.
  Acceptance: n/a until un-deferred.


### Core — Intake redesign ([ADR-039](DECISIONS.md)) — phased

IDEA = raw seed; Discovery = the canonical, **proportional** understanding engine (ingest context + elicit + blocking-confirm the 3 irreversible inputs); features get a regression boundary; industry-terminology mapping. Decided 2026-05-31; shipping in phases, each tested.

- [x] **Phase 1 — provenance visible at the human checkpoint (rc.29).** `summarizeRequirements` (approve) surfaces `idea_provenance` confirmed/assumed counts + assumed fields + open `idea_gaps`. Done.
- [x] **Phase 2 — feature regression boundary (rc.30).** `templates/FEATURE_IDEA.md` gained `## Touch Points` + `## Must Not Break`; the feature Phase 1 briefing (`requirements.md`, rendered only when `PARENT_REQUIREMENTS` is present) instructs converting each Must Not Break item into a `category: "Regression", priority: "MUST"` NFR — which the rc.27 NFR-MUST-coverage gate then forces Phase 3 to test (mechanical backstop; no fragile markdown-parse gate). Done.
- [x] **Phase 3a — Discovery ingests context + proportional depth (rc.31).** The discovery briefing (`phaseDiscovery.md`) now tells the agent to READ provided context FIRST (the `## Assets` section, `idea/` folder files, repos, docs, mockups — the listing mechanism already existed in `run-phase.js`; the gap was the briefing never said "read them, derive from them") and to scale depth PROPORTIONALLY (landing-page MVP = tight pass; complex = full ingestion + elicitation — no manufactured ceremony for an MVP). Additive briefing change; no gate/template surgery. Done.
- [~] **Phase 3b — DROPPED after first-hand rigor pass (2026-06-01, [ADR-039 Addendum 1](DECISIONS.md)).** Both halves dissolved against existing code: (a) the **blocking discovery gate** would be a strict subset of the existing `phase1-checks.js::IDEA_PROVENANCE_FIELDS` gate (which already covers problem/success/no-go at `complete 1`, before approve) and share its honor-system hole → theater; (b) **thin IDEA** is net-negative — the context-ingestion pillar already ships (`run-phase.js:161-170` lists the `idea/` folder; `IDEA.md` `## Assets` documents it), and thinning removes scaffolding solo/fast-path users rely on while breaking the `phase1.js:252` empty-section-warning coupling. The "IDEA = seed" concept is already documented (AGENTS.md rc.33). No verifiable defect fixed. Closed without code.
- [x] **Phase 4 — industry-terminology mapping (rc.32)** in `help`/docs (IDEA≈brief, 01_REQUIREMENTS≈PRD/SRS, 02_SYSTEM_DESIGN≈TRD/SDD, …). No rename (artifact names are a public contract).
- [x] **Phase 5a — canonical intake visible to agents (rc.33).** `templates/AGENTS.md` gained a "Starting a NEW project — capturing intent" section: read provided context first, confirm the three high-stakes inputs (problem/success/no-go) instead of inferring, proportional effort (MVP vs complex), iterate agile via features, and the discovery option + the industry-terminology pointer. Closes the "the wizard/intake is invisible to the agent" gap. Done.
- [ ] **Phase 5b — interview unification + non-TTY discovery fallback.** Unify the wizard interview and the `--guided` discovery interview (overlapping field sets, two code paths in `wizard.js`); give `--guided` discovery the wizard's non-TTY agent-briefing fallback (today `run-phase.js:153-154` hard-errors `--guided requires an interactive terminal`, so the strongest elicitation primitive is dead in agent mode — the wizard already solved this by printing an agent briefing when non-TTY). Files: `lib/commands/wizard.js`, `lib/commands/run-phase.js`. Refactor/quality — not a defect; the provenance gate backstops.

### Core — v2.0.0 promotion gate

The `adopt --upgrade` reconciliation protocol (ADR-027 + addendum), the `.aitri` shared/per-machine state question (ADR-028), and the output-contract test discipline (ADR-029) all shipped across alpha.1 → rc.4 — see CHANGELOG.md for per-release detail. The technical case for v2.0.0-stable is clean: every quality finding surfaced by author-owned canaries (Hub, Ultron, Zombite, Cesar, Go-on-RPi) is closed.

**The one open gate is non-technical:** promotion to stable v2.0.0 requires **at least one third-party adopter validating end-to-end**. Author canaries are necessary but not sufficient — they share the author's mental model and biases, and alpha.6 was a regression internal tests did not catch. This is a CLAUDE.md Critical rule and extends to any future breaking major.

- [ ] **`.aitri/local.json` split** — tracked in ADR-028 as an open question. Separate shared pipeline state from per-machine state. One real signal (Hub) is insufficient; need a second consumer before taking the breaking-change hit.

### Core — seed-input elicitation D3 (deferred; D1+D2 shipped rc.4)

- [ ] P2 — **Just-in-time constraint confirmation before Phase 2 and UX.** D1+D2 (seed-input provenance) shipped in rc.4 per [ADR-032](DECISIONS.md#adr-032--2026-05-21--seed-input-elicitation-provenance-contract-over-honor-system-inference). D3 is the deferred efficiency layer.
  Problem: Tier-A inputs that bite *later* — hard constraints (compliance, data residency, deadline, mandated stack), deployment target, brand identity — are not elicited at the moment they matter. `phase2.js` Technical Risk Flags analysis is blind to constraints it was never given; UX invents brand tokens with no identity input. Asking all of these at seed time is premature bloat.
  Files: `templates/phases/architecture.md`, `templates/phases/phaseUX.md`; optionally `lib/phases/phase2.js` / `lib/phases/phaseUX.js` if backed by a gate.
  Behavior: each phase briefing opens with a short "inputs to confirm with the user before this phase" block scoped to that phase's Tier-A-late set. Soft (D1-style) unless paired with a provenance check on those phases (D2-style).
  Decisions: ship only after D1+D2 prove out on a real canary; per ADR-032 the tier-1 value is provisional until a non-author consumer validates that operators answer honestly. Do NOT add per-phase gates speculatively.
  Acceptance: architecture briefing on a constraint-bearing project surfaces the confirmation block; if gated, `complete 2` blocks on an unconfirmed compliance-relevant constraint.

> **Pre-2.0.0 audit (rc.9–rc.14) — CLOSED.** Items A1/A2/A3, P2(architect), F1, D1, D2, B1/B2, E2/E3, P1 shipped across rc.9–rc.14. C3 (mutation) deferred on evidence — zero-dep reasoning corrected. E1 (marker unify) rejected as non-defect — moved to Discarded. Full disposition in [ADR-034](DECISIONS.md) and CHANGELOG.

### Core — verify-run swallows runner exit-code/parse divergence (rc.4 Hub canary 2026-05-21)

- [x] DONE (rc.43) — **`verify-run` ignores a non-zero runner exit code that the parsed TC results don't explain.** Fixed: when the runner exits non-zero and zero TCs failed, verify-run emits an informational note (benign skips OR a real failure outside the parsed TCs). Informational, not a gate. +1 test.
  Problem: `verify-run` decides pass/fail purely from parsed per-TC results, never from the runner exit code. Today that is the right architecture — npm/jest/pytest exit codes conflate "test failed" with "tests skipped", coverage thresholds, and post-test hooks, and Aitri already hard-distinguishes "runner missing" (ENOENT → `err()`) from a test outcome. But exit code 1 + parsed-clean is treated *identically* to exit code 0 + parsed-clean. The latent risk (not yet observed in any consumer): a runner that crashes/truncates output mid-run — the parser sees the passes it captured, misses the TCs that never ran, and exit code 1 is the only remaining signal, which is dropped. The agent noticed the mismatch manually in the Hub transcript; Aitri did not surface it.
  Files: `lib/commands/verify.js` (`cmdVerifyRun` — `exitCode` already captured at `:466`, persisted as `exit_code` at `:649`; Z1 pass/fail decision at `:682-683`); test in `test/commands/verify.test.js`.
  Behavior: emit a stderr warning (not a hard block) ONLY in the narrow case where the exit code is unexplained by the parse — `exit_code !== 0 && summary.failed === 0 && summary.skipped === 0`. With any skips or failures present, the exit code is explained — stay silent (otherwise it fires on most projects with skipped tests = noise). Wording: flag that the runner reported failure but no failing/skipped TC was detected, and suggest the operator confirm all tests actually ran (possible truncated/crashed run or missing `@aitri-tc` markers).
  Decisions: warning only — do NOT promote exit code to a pass/fail gate. The parsed-output authority is deliberate (ENOENT handling, skipped-test tolerance) and must not regress. No schema change (`exit_code` already stored). No version bump unless it ships as observable stderr output (then bump — visible CLI behavior change).
  Acceptance: a verify-run whose runner exits non-zero with 0 failed + 0 skipped parsed emits the warning; a run with exit 1 + ≥1 skipped (the Hub case) stays silent; a clean exit-0 run stays silent.
  Evidence base: speculative per CLAUDE.md narrow-evidence rule — the failure mode it guards has NOT been observed; only the benign divergence (exit 1 explained by skips) was seen on an author-owned canary. Do not implement until a real consumer hits a truncated/crashed-run false-pass, OR the warning is judged cheap enough to ship as pure prevention.

### Core — N1 venv migration detects only the binary, not the test target (rc.5 Cesar canary 2026-05-22)

- [x] DONE (rc.43) — **`diagnoseLegacyVenvManifest` flagged the binary but not a root-relative test *target*.** Fixed: `featureRunnerUnreachablePaths()` flags a feature manifest whose runner contains a relative path that does not resolve under the feature dir (concrete file-existence check; skips flags/absolute/venv/globs/Go `./...`). The finding no longer clears prematurely after only the binary is fixed. +2 tests.
  Problem: the alpha.9 cwd change (root → feature dir) breaks *every* root-relative path in `test_runner`, but the N1 regex `VENV_RELATIVE_RUNNER = /^\.?venv\/|^env\//` matches only the leading binary token. A finding clearing is a weak proxy for "fixed" — the operator reads "no findings" as success (as happened in the transcript) while the runner still cannot execute. This roughly doubles the drift re-approval churn on affected projects.
  Files: `lib/upgrade/migrations/from-0.1.65.js` (`diagnoseLegacyVenvManifest`, `VENV_RELATIVE_RUNNER`, `buildVenvFinding`); `test/upgrade.test.js`.
  Behavior: extend detection to flag a `test_runner` whose non-flag tokens after the binary include a path that does not exist when resolved from the feature directory. Emit one finding (or augment the existing one) naming the unreachable target so the operator fixes binary + target in a single edit → single re-approval round.
  Decisions pre-resolved (from rc.5 analysis): (1) rc.5 already fixed the *guidance* half — the reason now leads with bare `pytest` (auto-detected) and warns absolute paths are machine-specific, and the verify-run hint matches; this entry is only the *detection* half. (2) Do NOT auto-rewrite the target (ADR-027 §2 shape-transforms-only; semantic transform forbidden). (3) Tokenizing a shell command to distinguish flags from path arguments is fragile (quoted args, `=`-flags, globs) — keep the heuristic conservative: only flag a bare token that contains `/`, does not start with `-`, and fails `fs.existsSync` from the feature dir. False positives must stay near zero or this becomes noise.
  Acceptance: a feature manifest with `test_runner: "pytest tests/foo.py -v"` where `tests/foo.py` does not exist under the feature dir produces a finding naming the target; a manifest whose target resolves correctly produces none; a manifest with only flags after the binary (`pytest -v`) produces none.
  Evidence base: ONE pytest project (Cesar). Before committing the tokenizing complexity, the rc.5 plan is to run the next canary on a **different stack** (Go/Node with a root-relative target) with the rc.5 guidance fix already in place — this isolates whether the churn drops to one round (guidance was the dominant cause) or the target gap persists and generalizes beyond pytest (justifying stack-agnostic detection). Do not implement until that signal exists.

### Core — `aitri reconcile` briefing proportionality (N2)

> Parent friction cycle (Ultron canary 2026-04-27) is closed: N1 (behavioral allowlist) shipped alpha.4, N3 (verify-complete snapshot SSoT) shipped alpha.19. Only N2 remains, reclassified P1 → P3 on 2026-05-12.

- [ ] P3 — **Briefing proportional to change scope.** `lib/commands/reconcile.js:303-306` embeds full content of `01_REQUIREMENTS.json` + `03_TEST_CASES.json` + `04_BUILD_REPORT.json` into the briefing (template `templates/phases/reconcile.md:27-40`). Measured 70KB on Ultron-sized projects.
  Why P3 (not P1): post-N1 the FREQUENCY of normalize firing dropped from "every documentation update" to "real behavioral drift only". When it legitimately fires today, the agent is classifying actual behavior changes that may touch multiple FRs/TCs — full spec context is reasonable. Zero "briefing too big" reports since N1 (≈ 6 weeks). The optimization is polish now, not urgent.
  Files: `lib/commands/reconcile.js` (replace full-spec embedding with file list + `git diff baseRef -- <file>` per file + only the FRs/TCs whose `files_created` mentions a changed file); `templates/phases/reconcile.md`; `test/commands/reconcile.test.js`.
  Behavior: briefing for a 1-file change drops from ~70KB to <10KB; agent still has full context for what changed without re-reading the entire spec.
  Decisions: cross-ref by exact path match in `04_BUILD_REPORT.json::files_created[].path`; if no FR/TC references the file, include the full FR/TC list as today (degrade gracefully). Diff per file capped at 200 lines, truncate with `... (N more lines, see git diff)`.
  Acceptance: briefing for a one-file source change <10KB, includes the file's diff and only FRs/TCs that reference it.
  Re-promotion criterion: a canary measures a normalize briefing >50KB on a real legitimate (post-N1, post-rc.1) drift case AND reports it as friction → re-promote to P2.

### Core — Consumer project backlog richness (schema enrichment + CLI flags deferred)

- [ ] DEFERRED (no demand — needs a 2nd consumer) — **Schema enrichment + CLI flags for `BACKLOG.json`.** The scaffold (`templates/BACKLOG.md`) shipped alpha.21 and covers the Tier-1 value; rich fields (`files`/`behavior`/`acceptance`) + `backlog add --files/--behavior/...` + `backlog show <id>` are dormant. Only Hub validates the rich format today — adding surfaces without a 2nd consumer is design-by-imagination. Files: `lib/commands/backlog.js`. Re-open: a 2nd consumer asks, or a defect from the JSON thinness.

### Core — GitHub Copilot detection (file-write SHIPPED rc.15; detection deferred)

The file-write half — `.github/copilot-instructions.md` generated by `aitri init` / `aitri adopt --upgrade` — shipped in rc.15. See CHANGELOG.

- [ ] DEFERRED (blocked — no marker exists) — **`detectAgent()` Copilot branch.** Copilot is an IDE extension with no documented stable env signal, so `lastSession.agent` stays `unknown` for Copilot sessions. Not actionable until a verified, stable env var exists (do NOT branch on `GITHUB_*` — also fires in non-Copilot Actions runs). Files: `lib/state.js::detectAgent`. Re-open: a real Copilot env marker is verified.

---

## Design Studies

> Not implementation items. Open questions that inform future architectural decisions.

### Stack-aware project profile

Aitri assumed "web app with browser UI" as the default project shape; the runner bias (Playwright hardcoded in 6 places) shipped its fixes across alpha.8 (Go parser), alpha.14 (e2e gate accepts manual + stack-aware advice), alpha.16 (neutral messaging), alpha.20 (runner-neutral templates), alpha.23 (`tc mark-manual`). The remaining open question: should `.aitri` carry a `profile` field (`web | cli | service | library | embedded`) that conditionally enables/disables phase rules, NFR templates, and runner expectations?

**Open because:** today the runner-dispatch + neutralized-prompts approach covers the known cases without introducing a profile axis. A profile is justified ONLY if a second dimension of variation appears that runner dispatch alone cannot express. Examples that would trigger promotion to an implementation ticket:

- A project where Phase 1 NFR templates are wrong by stack (e.g. embedded firmware has no "user" actor, needs "operator" or "host system" — language drift, not runner drift).
- A project where the artifact chain itself should differ (e.g. firmware needs a hardware test plan that does not fit `03_TEST_CASES.json` schema; library needs an "API surface" artifact that does not exist today).
- Phase 5 deploy-readiness criteria that diverge structurally between stacks (a Go binary release ≠ a web deploy ≠ an npm publish — currently squeezed into one template).
- A real project with two simultaneous runners (Playwright for UI + `go test` for backend) where a "first runner wins" rule is genuinely insufficient. This case alone might justify a `runner` field per TC instead of a project-wide profile — investigate which axis the evidence points to.

**Promotion criterion:** when ≥2 of the above appear in real projects, design the abstraction. Until then, runner dispatch is enough.

**Cost of premature implementation:**
- Profile becomes a leaky abstraction: profiles overlap (a CLI tool may ship a small web dashboard; a service has both API and admin UI), edge cases multiply, and `init`/`adopt` has to ask the operator a question they cannot answer reliably.
- Adding a `profile` field to `.aitri` schema is a contract change consumers (Hub, future subproducts) must absorb. Doing it twice (once now wrongly, once later correctly) is more expensive than waiting.
- The dimension we eventually need may not be `profile` at all — it could be `runner` (per-TC), `platform` (target environment), or composition of several. Picking too early locks the abstraction to whatever the first non-web project happened to look like.

**What NOT to do in this study:**
- Don't enumerate profiles speculatively (`web | cli | service | library | embedded | mobile | …`) and design templates per profile. That's catalog growth without evidence.

**Evidence / source:** raised during 2026-04-29 session diagnosing the Go-on-RaspberryPi web-bias case. User explicitly authorized revisiting the "evidence narrow" principle from CLAUDE.md: verifiable bugs in code can ship without external canaries; speculative abstractions still need them. This study is the speculative half.

### Command-surface audit

Aitri exposes ~21 top-level commands today (`lib/commands/*.js`). Over successive minor versions, several have developed functional overlap — not broken, but potentially redundant. Before v0.2.0, run a single audit to map the surface and decide whether to collapse, rename, or keep.

**Suspected overlaps (to be confirmed by the audit):**

| Pair / Group | Suspected overlap |
| :--- | :--- |
| `resume` vs `status` vs `status --json` vs `validate` vs `validate --explain` | Four commands project the same `buildProjectSnapshot()` with different verbosity / framing |
| `audit` vs `review` | Both are evaluative read-only passes with personas (auditor, reviewer). Different scope (audit = whole project, review = per-phase) but same shape |
| `feature verify-run` vs `verify-run` | Same logic, scoped to a feature sub-pipeline. Candidate for `verify-run --feature <name>` |
| `tc verify` vs `verify-run` | Manual TC recording vs automated runner — correct split today, but worth confirming against use |

**Already reviewed (excluded from future audits):**
- `wizard` vs `init` + `adopt scan` — reviewed 2026-04-22, **kept**. Distinct surfaces: `init` bootstraps `.aitri` config (no IDEA.md), `adopt scan` derives IDEA.md from existing code, `wizard` interactively builds IDEA.md for greenfield projects. Plus `wizard` exports `runDiscoveryInterview()` consumed by `run-phase discovery --guided` — load-bearing.
- `checkpoint` vs auto-`writeLastSession` + `resume` — reviewed 2026-04-22, **kept**. `--name` writes frozen resume snapshots to `checkpoints/`; `--context` adds free-text annotation to `lastSession`. Bare mode is the only redundant path (~5 lines of overhead). Not worth a breaking rename.

**Criterion to mature into tickets:**
- A concrete case of user or agent confusion about which command to use.
- A maintenance cost surfaced during unrelated work (e.g. snapshot schema change had to be propagated to 4 commands that project it).
- A release that is already touching the command surface (v0.2.0 breaking batch).

**Scope when executed:**
1. One-page table: command → unique responsibility → overlaps with → evidence for or against keeping split.
2. Per overlap: decide `keep` / `alias` / `collapse` / `rename` with trade-off written down.
3. Output: entries in a `Core — Breaking changes for v0.2.0` section, or none if the audit finds no real overlap.

---

## Discarded

Items analyzed and explicitly rejected. Re-open only if the stated criterion is met.

| Item | Decision | Reason |
| :--- | :--- | :--- |
| Mutation testing | Dropped on evidence, not policy (reason corrected in [ADR-034](DECISIONS.md)) | **Reason corrected 2026-05-25:** the original "violates zero-dep" basis was a category error — zero-dep constrains what Aitri *imports*, not what it *orchestrates*. Orchestrating a project-declared mutation tool (in the consumer's own deps, like Playwright) adds zero deps to Aitri. The valid basis stands: C2 (assertion-density, now an opt-in `verify-complete` gate as of rc.9) covers ~60% of the same problem at zero cost, and no adopter has asked. Re-open: a security/production-critical adopter needing rigor deeper than C2 — implemented as project-declared orchestration, never bundled or globally-installed. |
| E1 — unify the next-action output marker | Rejected as non-defect (rc.14, [ADR-034](DECISIONS.md)) | Verified in code: three deliberate channels, not an inconsistency. `PIPELINE INSTRUCTION` = agent's single authoritative action (approve/verify only); branching hints = where the human chooses (complete/reject); `→ Next:` = human display (status). Unifying would conflate distinct semantics and risk breaking agents keyed on the marker. Only the AGENTS.md "each command" wording was wrong (fixed rc.14). Re-open ONLY if a real consumer-confusion case surfaces; the Command-surface audit study above is the parent track. |
| Aitri CI (GitHub Actions step) | Discarded 2026-04-17 | No active user demand. Contract not stable enough to publish a separate Action. If needed later, lives outside Core. |
| Aitri IDE (VSCode extension) | Discarded 2026-04-17 | Separate product with its own release cycle. Not incremental over the CLI; reconsidered if the CLI stabilizes across multiple external teams. |
| Aitri Report (PDF/HTML compliance report) | Discarded 2026-04-17 | User declined the surface. Compliance evidence already lives in `05_TRACEABILITY.json` + git history. |
| Aitri Audit (ecosystem-level cross-project aggregator) | Discarded 2026-04-17 | Functionally duplicates Hub's dashboard. Aitri Core does not maintain a global registry — adding one violates the passive-producer model. Name also collides with the per-project `aitri audit` command. |
| `aitri tc verify` recomputes `fr_coverage` | Discarded 2026-04-22 | `verify-complete` blocks failures via `d.results[].status`, not `fr_coverage` counts. Internal field drift is real but has no observable effect. Re-open if a future consumer (audit, Hub) starts reading per-FR counts. |
| Rename `checkpoint` to `note` | Discarded 2026-04-22 | `--name` writes frozen snapshots to `checkpoints/` (unique surface); `--context` annotates `lastSession`. No user complaint in 18 versions. Breaking rename for cosmetic improvement not justified. |
| NFR traceability in Phase 2 (Design Study) | Discarded 2026-04-22 | Criterion was "real case where approved design ignored a critical NFR and broke production". No such case has emerged. NLP-over-Markdown matching is high false-positive. Re-open if a real case appears. |
| `IDEA.md` → `spec/` move | Dropped 2026-04-23 | Opportunistic colado in the breaking-version window without its own evidence. NOT closed by alpha.17 (which targets the post-approval file, not pre-approval location). Re-open with its own evidence — a real consumer asking for the relocation, or a concrete defect. |
| Upgrade banner cached-briefings warning | Not implementing (2026-05-02) | Proposed for the alpha.6→alpha.7 grammar boundary; trigger window expired (11+ alphas past). Re-open only if a future grammar change creates a new boundary. |
| Strengthen `release-sync.test.js` to detect missing integrations CHANGELOG entries | Not implementing (2026-05-02) | Both opt-out designs shift the failure mode without preventing it — neither replaces the human judgment "does this bump affect subproduct readers?" 1 actual miss in 18 alphas, caught by manual audit. Re-open on a second **unintentional** miss. |
| A2 — cascading root → features upgrade | Deferred indefinitely (ADR-030) | Three canary reconfirmations (Zombite + Cesar shallow + Cesar deep) confirmed the asymmetry exists but produces no consumer harm — gates are field-presence based. Re-open: (1) third-party adopter requests cascading for a concrete workflow, OR (2) a future migration becomes load-bearing for feature-scope state. |
