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

### Core — v2.0.0 — `adopt --upgrade` as reconciliation protocol (shipped through alpha.8, pending promotion)

Governed by [ADR-027](DECISIONS.md#adr-027--2026-04-23--adopt---upgrade-as-reconciliation-protocol-v200) + five-point addendum. `.aitri` schema asymmetry tracked separately as [ADR-028](DECISIONS.md#adr-028--2026-04-24--open-question-aitri-mixes-shared-and-per-machine-state). Test-discipline lessons from alpha.6 regression in [ADR-029](DECISIONS.md#adr-029--2026-04-28--output-contract-tests-must-execute-against-the-consumer-not-string-match-a-designed-shape).

**Current status (2026-04-28, alpha.8):** `v2.0.0-alpha.8` is the latest staged pre-release. The reconciliation protocol core landed in alphas 1+2+3. Subsequent alphas closed gaps surfaced by canaries — alpha.4 normalize allowlist, alpha.5 verify display, alpha.6 scope-aware commands (regression), alpha.7 grammar fix + ADR-029, alpha.8 Go runner parser. See `CHANGELOG.md` for per-release detail.

**Canaries to date (all author's own projects — not the third-party gate):** Ultron (modern drift + new feature pipeline), Aitri Hub (already current), Zombite (legacy hash drift, resolved via `rehash`), Cesar (alpha.4 → alpha.15 dry-run + verify-complete on 4 e2e features, no defects, 2026-05-02 — see "Canary: Cesar" subsection below). Ultron canary on alphas 6 and 7 is what surfaced the scope-grammar regression class and the Go-parser gap.

**Promotion to stable v2.0.0 gated on:** a third-project canary (external adopter) runs cleanly, OR evidence motivates catalog expansion. The internal canaries above are necessary but not sufficient — alpha.6 was a regression that internal tests did not catch. Promotion before an external real-project signal repeats that risk. See ADR-029 for the test-discipline counter, but ADR-029 itself is preventive — does not substitute for an external canary.

#### What shipped in alpha.1

- [x] **Module `lib/upgrade/`** — `runUpgrade` + `diagnose.js` composer + `migrations/from-0.1.65.js`.
- [x] **`adopt --upgrade` as thin dispatcher** — no upgrade logic in `lib/commands/adopt.js` after refactor.
- [x] **BLOCKING:** TC `requirement` → `requirement_id` (single-FR only; multi-FR flagged); NFR `{title, constraint}` → `{category, requirement}` (constraint rename mechanical; title-to-category via finite lookup); artifactsDir recovery.
- [x] **STATE-MISSING:** `updatedAt`, `lastSession`, `verifyRanAt`, `auditLastAt`, `normalizeState` backfills (field-presence gated, deterministic sources only).
- [x] **VALIDATOR-GAP** (report-only): v0.1.82 Phase 1 title vagueness + all-vague ACs + duplicate AC pairs. Uses shared regex source in `lib/phases/phase1-checks.js`.
- [x] **Option B:** shape-only migrations update `artifactHashes[phase]` to preserve approval across the upgrade. Post-upgrade `aitri status` shows no drift on migrated phases.
- [x] **Clean-project UX:** `✅ Project is already current — nothing to migrate.` replaces the noisy "Already tracked" list when no work fires.
- [x] **Event type `upgrade_migration`** in `.aitri.events[]` with `before_hash`/`after_hash` for artifact writes (absent for state backfills). Documented in `docs/integrations/SCHEMA.md`.
- [x] **ADR-027 addendum §4** (approval preservation) + **§5** (coverage gate NOT implemented, by decision).

#### Shipped in alpha.2 (2026-04-24)

- [x] **`adopt --upgrade --dry-run`** — shipped. Safety infrastructure confronted after Hub canary required manual tar-copy to `/tmp/` to simulate preview. `--yes`, `--only`, `--verbose` remain deferred (no adopter asked).
- [x] **`aitri resume` brief default + `--full` flag** (FEEDBACK F8) — shipped. Primary entry-point command no longer dumps 200+ lines of reference material on stable projects.
- [x] **Terminal-state next-action** (FEEDBACK F11) — shipped. P7 `aitri validate` suppressed when deployable + fresh audit + fresh verify.
- [x] **`.aitri` commit-vs-gitignore contract doc** (FEEDBACK H3) — shipped in SCHEMA.md + ADR-028. No code change; explicit contract.

#### Shipped in alpha.3 (2026-04-24)

- [x] **A1 — `.aitri.upgradeFindings[]` persistence** — flagged upgrade findings now survive the upgrade report and drive a priority-3 next-action until resolved. Rendered in `resume` (brief warning section) and `status` (count line). Snapshot model — cleared on next clean upgrade run.
- [x] **A5 — `aitri rehash <phase>`** (+ `aitri feature rehash`) — escape hatch for legacy hash drift where artifact content matches HEAD but stored hash is stale. Updates the hash in place without cascading invalidation to downstream phases. Clean-git gate + isTTY gate.
- [x] **A5b — `approve` drift prompt hints at `rehash` when git is clean** — helps operators pick the right tool for bookkeeping-only drift.
- [x] **A3 — Upgrade "already current" banner clarified** when version is bumping on a no-migration run.

#### Shipped in alpha.4 (2026-04-27)

- [x] **N1 — Behavioral allowlist for `aitri normalize` and `detectUncountedChanges`** — Build/dependency manifests, documentation, dotfiles, CI configs, and generated assets are excluded from off-pipeline drift detection. Single source: `lib/normalize-patterns.js::isBehavioralFile()`. Closes the friction cycle Ultron canary 2026-04-27 documented (3 prior workaround commits in Ultron history).

#### Shipped in alpha.5 (2026-04-27)

- [x] **H5 — Verify counts three-bucket display** — `verify ✅ (P ✓ F ✗ D ⊘)` replaces the misleading `verify ✅ (P/T)` ratio that read as a low passing rate when most TCs were skipped/manual. SSoT: `lib/verify-display.js::formatVerifyCounts()`. Applied to status / resume / validate.
- [x] **H7 — Discarded** as redundant with A5b.

#### Shipped in alpha.6 (2026-04-27, REGRESSION — corrected in alpha.7)

- [x] **Scope-aware command emission (initial attempt)** — Threaded `featureRoot` + `scopeName` through approve/complete/reject/verify-run/verify-complete; added `{{SCOPE_PREFIX}}` to 11 phase templates. Closed the destructive-risk bug from the Ultron canary 2026-04-27 (PIPELINE INSTRUCTION emitted scope-less commands that would overwrite parent artifacts).
- [⚠] **Regression introduced**: helper `commandPrefix()` returned `'feature <name> '` placed BEFORE the verb, producing strings like `aitri feature network-monitoring complete ux`. CLI grammar in `feature.js` parses first-token-after-`feature` as the verb, so literal copy-paste failed with `Feature "complete" not found`. Caught at handoff #1 of Ultron canary on alpha.6. ADR-029 documents the test-discipline lesson.

#### Shipped in alpha.7 (2026-04-27)

- [x] **Scope grammar correction** — Replaced single-string `commandPrefix(...) → 'feature <name> '` with two-token `scopeTokens(...) → { verb, arg }` that splice as `aitri ${verb}<verb-token>${arg} <phase>`. Templates use `{{SCOPE_VERB}}` + `{{SCOPE_ARG}}`. Round-trip test in `test/scope.test.js` extracts every `aitri feature <X> <Y>` from synthetic output and verifies `<X>` is a verb feature.js routes — blocks the alpha.6 inversion in CI.
- [x] **ADR-029** — output-contract tests must execute against the consumer, not string-match a designed shape.

#### Shipped in alpha.8 (2026-04-28)

- [x] **Go test runner output parser** — `parseGoOutput()` in verify.js consumes `go test -v` output (`--- PASS|FAIL|SKIP: TestTC_XXX`); reuses existing `extractTCId()` for normalization (`TC_NM_001h` → canonical `TC-NM-001h`). Subtests excluded by column-0 anchor + char class. Stderr warning when `runnerHint` is `go test` without `-v`. Templates updated. Closes one of the 5 alpha.7 canary findings; the other 4 remain open below.

#### Shipped in alpha.9 (2026-04-28)

Six defects closed — 4 from the alpha.8 audit, 2 from the Hub canary diagnosis. First alpha.X gated by external review (audit + canary + diagnosis sequence) rather than internal canary alone. 1038 tests, zero skipped.

- [x] **Dry-run honesty** (commit `0606c12`) — `aitri adopt --upgrade --dry-run` no longer claims "would be a no-op" when the version pin is changing. Surfaced by diagnostic session against alpha.8 Hub canary; Hub at alpha.4 was being misled by the contradictory "only the version string would change" + "no-op" pair.
- [x] **Status text surfaces deployable** (commit `4a5f6ea`) — `aitri status` text output now shows `❌/✅ deployable Deploy readiness ...` next to the phase table (mirrors `aitri resume`). Closes the gap where a row of green checkmarks could be misread as "ready to ship" when `health.deployable` was actually blocked. Surfaced by diagnostic session.
- [x] **Phase-key types canonicalised in state.js** (commit `8c8341f`) — closes "P2 — Approve UX next-action routes to `requirements` instead of `architecture`" (Ultron canary alpha.6). `loadConfig` and `saveConfig` now coerce numeric strings (`"1"`) to numbers (`1`) for `approvedPhases`, `completedPhases`, `driftPhases`. Alias keys (`"ux"`, `"discovery"`, `"review"`) preserved verbatim. Defence in depth: regardless of which write-path produced a stray string, downstream `Set.has(<number>)` works.
- [x] **Feature verify-run cwd** (commit `3603a49`) — closes "P2 — `aitri feature verify-run` runs tests from project root" (Ultron canary alpha.6). `spawnSync` now uses `cwd: dir` (feature subdirectory) instead of `cwd: featureRoot || dir`. Test discovery is scoped to the feature.
- [x] **Phase 3 accepts NFR ids** (commit `48ac68f`) — closes "P3 — Phase 3 validator rejects `requirement_id: NFR-XXX`" (Ultron canary 2026-04-28, 14 TCs reassigned by hand). `requirement_id` is valid if it matches either `functional_requirements[].id` or `non_functional_requirements[].id`. Briefing in `templates/phases/tests.md` updated to match.
- [x] **Phase 4 manifest schema relaxed** (commit `9e3802c`) — closes "P2 — Manifest schema drift between briefing and validator" (Ultron canary alpha.7, 3 sequential rejections). `setup_commands` and `environment_variables` are now optional in `04_IMPLEMENTATION_MANIFEST.json`. Absent ≡ `[]`. When present, must be an array. Per-entry shape stays in the briefing (`templates/phases/build.md`), keeping the validator gate shape-only — avoids re-creating the same drift.

#### Shipped in alpha.13 (2026-04-29)

Five defects from the Zombite canary (third-project external sweep, alpha.4 → alpha.12 upgrade). All closed in a single release. Tests 1051 → 1073, zero failures. Full reproduction steps and decisions in `CHANGELOG.md` § alpha.13 and the `84cd23a` commit message.

- [x] **Z1 — `verify-run` invalidates stale `verifyPassed`** (`lib/commands/verify.js::cmdVerifyRun`). Re-running with degraded results (`passed === 0 && skipped > 0` OR `failed > 0`) now resets `config.verifyPassed = false` and clears `verifySummary`. Healthy results untouched.
- [x] **Z2 — `adopt --upgrade` backfills missing `artifactHashes`** (`lib/upgrade/migrations/from-0.1.65.js`). New STATE-MISSING migration; idempotent; per-phase `upgrade_migration` events. Closes silent drift-detection failure on projects upgraded from pre-alpha schemas.
- [x] **Z3 — `verify-complete` PIPELINE INSTRUCTION respects phase 5 state**. State-aware emission instead of hardcoded "next: run-phase 5"; feature scope with phase 5 approved emits no PIPELINE INSTRUCTION.
- [x] **Z4 — Phase 3 validate rejects duplicate TC ids** (`lib/phases/phase3.js`). `complete 3` now throws when `test_cases[]` has repeated `id`s; error message lists each duplicate with count.
- [x] **Z5 — `adopt --upgrade` flags legacy `04_TEST_RESULTS.json` schema** (Option A — flag-only). New VALIDATOR-GAP finding when `verifyPassed: true` and artifact lacks `results[]`/`summary`. Operator regenerates via `aitri verify-run`.

#### Shipped in alpha.16 (2026-05-02)

Three changes from the Cesar canary 2026-05-02 PM (alpha.4 → alpha.15 deepening pass). Tests 1080 → 1091, zero failures. Full rationale in `CHANGELOG.md` § alpha.16.

- [x] **N1 — `adopt --upgrade` flags legacy `.venv/`-relative manifest `test_runner`** (`lib/upgrade/migrations/from-0.1.65.js::diagnoseLegacyVenvManifest`). Walks root + every `features/<name>/.../04_IMPLEMENTATION_MANIFEST.json`; emits one `validatorGap` finding per offending manifest matching `^\.?venv/|^env/`. `autoMigratable: false` per ADR-027 §2 — operator edits the manifest to use an absolute path or PATH-resolved binary. Closes the silent breakage where pre-alpha.9 manifests trip `Command not found` after the alpha.9 cwd change (`3603a49`).
- [x] **N1 sub-finding — `verify-run` ENOENT does not persist degraded results** (`lib/commands/verify.js::cmdVerifyRun`). When `spawnSync.error.code === 'ENOENT'`, exit via `err()` instead of writing 0/0/N skipped to `04_TEST_RESULTS.json` and flipping `verifyPassed = false` per Z1. The on-disk artifact and `.aitri.verifyPassed`/`verifySummary` are preserved verbatim — a missing runner is not the same as a failing test suite. The error message also drops the misleading `--cmd ".venv/bin/pytest …"` suggestion.
- [x] **L2 (mensajería piece) — runtime wording neutral when no Playwright config** (`lib/commands/verify.js`). `SKIP_NOTE` and the `Skipped:` summary line conditional on `playwright.config.{js,ts}` presence. With config: unchanged ("e2e/browser", "browser environment" hint). Without: neutral "e2e", browser hint dropped. Absorbs L1b's mensajería half (the gate-path L1b hypothesis was refuted by Cesar). Templates ("Playwright as default e2e runner") not touched in this release — tracked separately under L2 templates.

#### Shipped in alpha.19 (2026-05-02)

- [x] **N3 — verify-complete next-action via snapshot SSoT** (`lib/commands/verify.js::cmdVerifyComplete`). Root scope replaced its alpha.13 hardcoded if/else (`run-phase 5` / `validate`) with `buildProjectSnapshot(dir, { cliVersion: VERSION }).nextActions[0]`. Aligns with status / resume / validate; canonical case (normalize pending after clean verify-run) now routes to `aitri normalize` instead of contradicting status with `run-phase 5`. `cliVersion` threaded so version-mismatch P1 routes to `aitri adopt --upgrade` here too. Suggested command shape moved from `aitri run-phase 5` → `aitri run-phase deploy` (alias form already used by status/resume since v0.1.69). Feature scope unchanged — alpha.7 `scopeTokens()` splicing for `aitri feature <verb> <name> <phase>` grammar is incompatible with snapshot rooted at featureDir (would emit unprefixed). Tests +1 new (normalize-pending alignment between cmdVerifyComplete + cmdStatus), 2 adjusted (alias form + new reason text). 1100 → 1101. Commit `c85c356`.

#### Shipped in alpha.20 (2026-05-02)

- [x] **L2 templates piece — Phase 3-5 templates runner-neutral** (`templates/phases/{tests,requirements,deploy,build}.md`). Five edits drop the imperative "MUST use Playwright" prescription that biased non-web projects (Cesar pytest, Go-on-RPi). Specifics: `tests.md:118-119` cites Playwright/Vitest/Jest + `func TestTC_XXX_…` (Go) + `def test_tc_xxx_…` (pytest) as examples; `requirements.md:127` (CI/CD NFR) reads "any e2e runner the project uses"; `deploy.md:61` describes "the project's declared e2e runner if one is configured"; `deploy.md:99` checklist drops "and Playwright all checked"; `build.md:87` drops the auto-Playwright step and explicitly tells the agent NOT to invent a runner the project doesn't use. After: `grep -ri playwright templates/phases/` = 2 conditional examples. No "MUST use Playwright" anywhere. `lib/phases/phase3.js:141-142` (`e2eCount >= 2` rule) untouched — already runner-neutral. Closes the templates half of L2 (the mensajería half shipped in alpha.16). Tests +1 in `test/phases/phase3.test.js [L2 alpha.20]`. 1101 → 1102. Commit `4f2e545`.

#### Shipped in alpha.21 (2026-05-02)

- [x] **Backlog richness — scaffold portion** (`templates/BACKLOG.md` + `lib/commands/init.js` + `lib/commands/adopt.js`). New 47-line template with Entry Standard + Minimum entry format block + 1 worked P3 example. `aitri init` and `aitri adopt apply` (both `adoptApply` and `adoptApplyFrom` paths) write the template at project root if absent. Idempotent. `rootDir` threaded through `adoptApplyFrom` since the legacy `--from N` path didn't previously receive it. Coexists with `spec/BACKLOG.json` (CLI-managed) — independent surfaces, no schema/validate(). Tests +4 (`test/commands/{init,adopt}.test.js`): creation + idempotency × 2 paths. 1102 → 1106. integrations CHANGELOG `— additive` (new project-root surface subproducts may render). Commit `b8c1e9c`. **Schema enrichment + CLI flags portions explicitly DEFERRED** per CLAUDE.md narrow-evidence rule — only Hub validates the rich format today. See updated entry in "Consumer project backlog richness" below.

#### Shipped in alpha.22 (2026-05-02)

- [x] **Hotfix — validate accepts absorbed `original_brief` in lieu of IDEA.md** (`lib/commands/validate.js`). Closes the alpha.17 contract gap surfaced by Ultron canary 2026-05-02 PM: orphan-IDEA migration unlinks IDEA.md after absorption, but `validate.js` (text path `:46` + JSON path `:201`) continued gating on `fs.existsSync('IDEA.md')` and falsely reported `❌ IDEA.md` on absorbed-brief projects. Fix: new helper `ideaBriefStatus(project, root)` accepts either path (file on disk OR `01_REQUIREMENTS.json#original_brief` non-empty). Text mode: `✅ IDEA.md (absorbed → 01_REQUIREMENTS.json#original_brief)` annotation when absorbed. JSON mode: `exists` stays literal (filesystem), `approved=true` when either path satisfies, additive optional `absorbed: true` field on absorption path. Tests +4 in `test/commands/validate.test.js` (text+JSON × file/absorbed paths + negation guard). 1106 → 1110. integrations CHANGELOG `— additive` (new `absorbed` field surface). Commit `2affb2f`. **Cross-link:** the alpha.17 release introduced the absorption migration but missed the validate-side gate; closed retroactively in this hotfix. Bypass of velocity gate justified per CLAUDE.md "Purpose over process" exception — Tier-1 bug, real consumer (Ultron) blocked, removal of an incorrect assumption (not new abstraction).

#### Shipped in alpha.23 (2026-05-02)

- [x] **`aitri tc mark-manual <TC-ID>` CLI helper** (`lib/commands/tc.js::tcMarkManual`). Closes the P3 helper open since alpha.14 L1a. Reads `spec/03_TEST_CASES.json`, sets `automation: "manual"` on the matched TC, writes back. Idempotent (already-manual is a no-op + message). Re-stamps `artifactHashes['3']` in the same step when stored — `mark-manual` IS the operator authorization for this scoped field-level edit (different from `aitri rehash` which gates over arbitrary content drift); forcing a separate rehash step would defeat the alpha.14 friction-reduction design intent. Bulk mode (`--all-of-type e2e`) and reverse direction (`mark-auto`) deferred — single-TC covers the documented friction (Go-on-RPi 26 e2e TCs would need 26 hand edits today; now 26 commands). Feature scope not threaded — mirrors existing `aitri tc verify` (no `tc` case in `feature.js:77`). Tests +9 in `test/commands/tc.test.js`. 1110 → 1119. No integrations CHANGELOG entry — operator-only CLI, no surface visible to subproducts (mirrors alpha.19/.20 decision). Headers still bumped per release-sync rule.

#### Canary: Cesar (alpha.4 → alpha.15) — 2026-05-02

Fourth author-owned canary. Cesar = Python web project, 9 sub-pipeline features (5 with e2e TCs), no Playwright in the toolchain (pytest only). Run on a `tar`-cloned copy at `/tmp/cesar-canary-20260502-132549/` — real Cesar untouched. Predictions written to `/tmp/cesar-predictions-20260502-132549.md` BEFORE any aitri command, per ADR-029 falsifiability discipline (counter-pattern: 2026-05-01 fabricated "Cesar canary outcome" never run, discarded in `c06f177`).

**Method.** `aitri adopt --upgrade --dry-run` (no real upgrade) → `aitri status` → `aitri feature list` from 5 cwds (root, `spec/`, feature dir, feature/spec, outside-project) → `aitri feature verify-complete` on 4 e2e features (centered-layout 2 e2e, code-cleanup 2 e2e + no `automation` field on TCs, groq-fallback 2 e2e, ux-ui-upgrade 21 e2e — the largest e2e surface). Each output captured to `/tmp/cesar-out-NN-*.txt`.

**Predictions vs observations (summary).**

| ID | Prediction | Observed | Verdict |
|----|---|---|---|
| P1.1 | `Version: 2.0.0-alpha.4 would bump 2.0.0-alpha.15` | exact match | confirmed |
| P1.2 | 0 schema migrations at root | no migration section emitted | confirmed |
| P1.3 | 0 flagged validatorGap findings | no flagged section | confirmed |
| P1.4 | 0 stateMissing additions at root | banner "schema already on canonical shape" | confirmed |
| P1.5 | 0 phases inferred | no inference section | confirmed |
| P1.6 | Banner `✅ Schema already on canonical shape — only the version string would change.` | exact match | confirmed |
| P1.7 | Features `.aitri` files NOT touched by root dry-run | (no formal pre/post diff captured; dry-run skips `saveConfig` and never recurses — A2 still open) | partial |
| P2.1 | `health.deployable: true` | **`Not ready — 1 blocker (BG-015 medium open bug)`** | refuted (sloppy prediction; bug-block is known mechanism per MEMORY) |
| P3.1 | Lists 9 from project root | lists 9 | confirmed |
| P3.2 | Walk-up from `spec/` lists 9 | lists 9 (alpha.15 walk-up working) | confirmed |
| P3.3 | Walk-up from feature dir lists 9 | **does NOT list — emits "cwd is not project root", names project root, suggests `cd` command** | refuted-as-prediction, confirmed-as-design (alpha.15 ergonomic was about *naming the root*, not about pretending you're at it) |
| P3.4 | Walk-up from feature/spec lists 9 | same as P3.3 | refuted-as-prediction, confirmed-as-design |
| P3.5 | Outside-project → "No features yet" | exact match | confirmed |
| P4.1 | centered-layout verify-complete may FAIL under alpha.15 e2e gate (no Playwright) | **`✅ Verify passed — 21/21 (19 unit + 2 e2e)`** | refuted |
| P4.2 | ux-ui-upgrade (21 e2e) likely fails | **`✅ Verify passed — 40/47 (22 unit + 18 e2e), 7 manual`** | refuted |
| P4.3 | code-cleanup (TCs missing `automation` field) — uncertain | **`✅ Verify passed — 15/15 (13 unit + 2 e2e)`** — undefined `automation` does not crash the gate | refuted-towards-permissive |
| P4.4 | Non-e2e features re-pass cleanly | groq-fallback re-passes (also has 2 e2e) | confirmed |

**Key findings.**

1. **Root upgrade alpha.4 → alpha.15 is a clean version-only bump for a project authored under alpha.4.** Cesar's root `.aitri` already carries every alpha.79–alpha.80 field (`updatedAt, lastSession, verifyRanAt, auditLastAt, normalizeState, artifactHashes, upgradeFindings`) and its 30 root TCs already use `requirement_id`, 4 NFRs already use `category`. Migration catalog is empty. Confirms ADR-027 §1 "additive by default" — schema added between alpha.4 and alpha.15 was non-blocking for an alpha.4 project.

2. **alpha.15 feature-list ergonomics works as designed but the design is more conservative than the prediction assumed.** From a feature subdirectory the command does NOT auto-resolve and list — it emits `No features in current directory (cwd is not the project root). / Project root: <abs-path> / Run from there: cd <path> && aitri feature list`. From `spec/` (a sibling of `features/`) it DOES walk up and list. The split is intentional: `spec/` is pipeline-root-adjacent, a feature dir is its own scope and listing root features from inside it would conflate scopes.

3. **L1b — the alpha.15 verify-complete gate does NOT auto-fail no-Playwright projects with automated e2e TCs.** Four features with 27 total e2e TCs (18 automated + 9 manual) all pass verify-complete under alpha.15. The alpha.14 stack-aware failure message + manual-acceptance branches do not trigger here because the existing `04_TEST_RESULTS.json` already records passing e2e — the gate accepts pre-recorded results regardless of runner identity. **L1b's hypothesised regression on the gate path is refuted by Cesar.** The verify-run AUTO-RUN dispatcher (`verify.js:501-529` Playwright-only path) was NOT exercised in this canary because `.venv` was excluded from the copy, so no fresh runner invocation happened.

4. **A2 (features sub-pipelines not upgraded by root `adopt --upgrade`) — evidence reconfirmed.** Cesar's 9 features all carry `aitriVersion: undefined`; root upgrade does not propagate. Same shape as the Zombite finding in 2026-04-28. No new urgency surfaced — the features still operate cleanly under alpha.15 because their internal schema is already canonical (modern `requirement_id`, modern NFR `category`). A2 stays Deferred.

5. **3-feature `auditLastAt` and 3-feature `verifyRanAt` gap noted but harmless.** All 9 feature `.aitri` lack `auditLastAt`; centered-layout, code-cleanup, token-limit-ux also lack `verifyRanAt`. These are stateMissing fields the from-0.1.65 migrator would auto-add if features were in scope. Currently dormant because A2.

**L1b disposition decision.**

> **L1b stays at P2 — open.** Justification (evidence-line): `aitri feature verify-complete ux-ui-upgrade` under alpha.15 returned `✅ Verify passed — 40/47 tests passing (22 unit + 18 e2e), 7 manual` for a pytest-only project with 21 declared e2e TCs, demonstrating the GATE path is stack-agnostic when results are pre-recorded.
>
> **NOT downgraded to P3** because the AUTO-RUN dispatcher path (`verify.js:501-529`) — the actual location of the Playwright bias per MEMORY — was not exercised. A future canary that runs `aitri feature verify-run` from scratch on a non-Playwright project with declared automated e2e TCs is still required before downgrading.
>
> **NOT promoted to P1** because no observed failure or degraded behavior surfaced; no defect to fix.

**What the canary did NOT exercise (gaps, not failures).**

- Fresh `aitri feature verify-run` on a project with no Playwright (toolchain not available in `/tmp` copy). Re-running pre-existing results vs. fresh runner invocation are different code paths.
- Real `aitri adopt --upgrade` (only dry-run executed). The ARTIFACT WRITES happen on the real run — not validated here.
- Feature-scoped upgrade behavior (A2 — known deferred).

**Follow-ups opened by this canary.**

- [x] **C1 — Re-run Cesar canary with `--upgrade` for real (no `--dry-run`) on a copy.** Closed by the deepening session same day (2026-05-02 PM, see "Deepening session" below): real upgrade non-destructive on Cesar — root `.aitri` mutated as expected, all 9 feature `.aitri` md5s INTACT, agent files untouched.
- [x] **C2 — Find a non-Playwright project where `verify-run` (not just `verify-complete`) can run end-to-end against alpha.15.** Closed by the deepening session same day (2026-05-02 PM): the `verify.js:509` `if (hasPwConfig) { … }` gate makes the Playwright auto-dispatch dead code on projects without `playwright.config.{js,ts}`. The runtime concern that motivated the canary search does not exist in code. See L1b downgrade in the deepening section.

**Promotion gate status after this canary.** Author-owned canaries: Hub, Ultron, Zombite, Cesar (was planned, now executed). Third-party adopter still required for stable v2.0.0 promotion (per CLAUDE.md Critical rule + this section's earlier paragraph). Cesar increases the n by one but does not unlock promotion.

##### Deepening session — same day, 2026-05-02 PM

The morning canary did NOT exercise the load-bearing paths (`adopt --upgrade` real and `verify-run` real). Re-ran on a fresh `/tmp` copy with `.venv` symlinked to enable pytest. Predictions in `/tmp/cesar-predictions-deep-*.md` (gone after cleanup, content quoted in the commit message). Outputs captured to `/tmp/cesar-out-D1-*.txt` and `/tmp/cesar-out-D2-*.txt`.

**D1 — `aitri adopt --upgrade` REAL (no `--dry-run`):**
- Banner exactly as predicted: `Version: 2.0.0-alpha.4 → 2.0.0-alpha.15`, "will change" (vs dry-run "would change"), single-line success.
- Root `.aitri` md5 mutated `75df61a8…` → `74b9828d…`. Diff: `aitriVersion` bumped, `upgradeFindings: []`, `updatedAt` refreshed. **No upgrade event appended to `events[]`** — by design (the commit point is the version field + upgradeFindings, not an event). Worth knowing for Hub: a consumer watching `events[]` cannot detect an upgrade, only a change in `aitriVersion`.
- All 9 feature `.aitri` md5s INTACT after root upgrade. **A2 reconfirmed for the third time** (Zombite, Cesar shallow, Cesar deep). Stays Deferred but the evidence is now overdetermined — A2 is real and consistent.
- Agent files (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.codex/instructions.md`) all present pre-upgrade → none regenerated. `writeAgentFiles()` only fills missing files; behavior confirmed.
- C1 follow-up: **closed by this run.** Real upgrade is non-destructive on Cesar.

**D2 — `aitri feature verify-run` REAL on `centered-layout` (the load-bearing test):**
- First attempt with default manifest runner `.venv/bin/pytest tests/test_centered_layout.py -v -s`: **FAILED with `Command not found: ".venv/bin/pytest"`**. Root cause: alpha.9 commit `3603a49` changed verify-run cwd from project root to feature dir; manifests authored under alpha.4 (with `.venv/` paths relative to root cwd) silently break.
- Second attempt with `--cmd` flag and absolute paths: pytest executed but failed at collection (`FileNotFoundError: 'src/web/static/styles.css'`) — the test code itself uses `Path("src/...")` relative to cwd, and there is no flag in `verify-run` to override cwd back to root.
- Net: pytest never produced TC-tagged output, so `Auto-detected: 0 TC(s) total` and all 21 TCs were marked `skip`.

**This surfaced two findings:**

- [x] **N1 (P1, shipped alpha.16) — Legacy `.venv/`-relative manifest paths break silently after alpha.9 cwd change.** Any project authored before alpha.9 whose `04_IMPLEMENTATION_MANIFEST.json::test_runner` is `.venv/bin/pytest …` (relative) will see verify-run fail with `Command not found` once feature scope cwd became the feature dir. The error message is clear (suggests `--cmd`) but: (a) `--cmd` cannot override cwd, so even with absolute pytest path, tests that read files relative to cwd still fail; (b) `verify-run` writes a degraded `04_TEST_RESULTS.json` (0 passed, 21 skipped) AND propagates `verifyPassed: false` per Z1, even though the runner never ran. **A user upgrading alpha.4 → alpha.15 will see ALL their feature pipelines flip to `verify ❌` after the first verify-run attempt — a hard regression of perceived state, even though no Aitri logic is wrong.** Deferred for fix in next session. **Fix path locked 2026-05-02: option (iii) — VALIDATOR-GAP at upgrade time.** New `diagnose*` in `lib/upgrade/migrations/from-0.1.65.js` (or a dedicated alpha.9 migrator) scans every reachable `04_IMPLEMENTATION_MANIFEST.json::test_runner`; matches against `^\.?venv\/|^env\/` (relative venv paths); emits a `validatorGap` finding (`autoMigratable: false`) explaining the alpha.9 cwd change and instructing the operator to use an absolute path or PATH-resolved binary. Aitri does NOT touch the manifest. Finding persists via `upgradeFindings[]` per alpha.3, surfaces in `aitri resume` until resolved. Options (i) and (ii) explicitly rejected: (i) `--cwd` flag puts the burden on the operator at every verify-run invocation, not discoverable, and changing the default would undo the alpha.9 scoping fix `3603a49`; (ii) auto-resolve violates ADR-027 §2 ("shape transforms only — anything semantic is FLAGGED, never inferred") and is fragile across venv layouts (`.venv/`, `~/venvs/`, `poetry`, `pipenv`). Sub-finding to consider in the same alpha.16 release: when `verify-run` exits with command-not-found, do NOT persist a degraded `04_TEST_RESULTS.json` and do NOT flip `verifyPassed: false` — distinguish "runner crashed" from "runner ran and produced bad results". Decision recorded; implementation belongs to the next session per ADR-029 round-trip.

- [x] **L1b → DOWNGRADE to P3 (was P2).** Code-grounded justification: `lib/commands/verify.js:509` reads `if (hasPwConfig) { … auto-run Playwright … }`. The Playwright auto-dispatch is GATED on `playwright.config.js/ts` existence. Cesar has no such file → the block is dead code for Cesar → no Playwright bias in the runtime dispatcher. **The runtime concern that motivated L1b's P2 status does not exist in code.** What DOES exist is mensajería sesgada in `verify.js:533-536` (`SKIP_NOTE`) and `verify.js:768` (`skipped_e2e/browser` in summary display) — both assume `type:'e2e'` ≡ "browser-driven" in the explanation text. That is L2 territory (templates/messaging prescribing Playwright), not L1b. L1b has been collapsed into L2 for the next sweep. C2 follow-up: **closed** — the verify-run path is verified by code reading + the `hasPwConfig` gate in this canary's runs (zero Playwright invocations occurred).

**What this deepening did NOT do (deliberately).**
- No code fix for N1 — flagged for next session per ADR-029 round-trip discipline.
- No second-feature verify-run — N1 affects all 9 features identically; one example is sufficient evidence.
- No alpha.16 — disciplined separation of canary from release.

**Updated promotion gate status.** Author-owned canaries unchanged in count (Hub, Ultron, Zombite, Cesar). C1 + C2 closed; **N1 + sub-finding closed in alpha.16** (2026-05-02, see "Shipped in alpha.16" above). Third-party adopter gate still open.

#### Deferred out of alpha.1 / alpha.2 / alpha.3 (by decision)

- [ ] **A2 — Cascading root → features upgrade — DECIDED 2026-05-02 via ADR-030: deferred indefinitely.** Three reconfirmations across canaries (Zombite + Cesar shallow + Cesar deep) confirmed the asymmetry exists but produces no consumer harm — Aitri's gates are field-presence based, so feature `.aitri` at stale `aitriVersion` continues to satisfy gates. Re-open criteria in ADR-030: (1) third-party adopter explicitly requests cascading for a concrete workflow, OR (2) a future migration becomes load-bearing for feature-scope state. Without either, the entry stays as a pointer to the ADR — not a pending work item.
- [ ] **CLI flags** `--yes`, `--only <categories>`, `--verbose` — not implemented. No adopter asked; re-open when one does. (`--dry-run` landed in alpha.2.)
- [ ] **Corte E — CAPABILITY-NEW + STRUCTURE** — open: `files_modified` advisory, bug audit trail advisory, case-mismatch detection. **Already shipped:** agent-files regen (inherited from Corte A); `original_brief` archival (shipped alpha.17 as `diagnoseOrphanIdea` — closes the IDEA.md residue case for projects approved before v0.1.89). Remaining items are preventive with no canary signal — re-open when a concrete case surfaces.
- [ ] **`test/upgrade-coverage.test.js` gate** — explicitly NOT written. Rationale in ADR-027 addendum §5.
- [ ] **Smoke test E2E in `test/smoke.js`** — optional, unit tests + three real canaries cover current shape. Re-open if a non-trivial upgrade path lacks coverage.
- [ ] **`.aitri/local.json` split** — tracked in ADR-028 as open question. One real signal (Hub) is insufficient; need a second before taking the breaking-change hit.

#### Dropped from v2.0.0 breaking batch (by decision)

- [ ] **`IDEA.md` → `spec/` move** — dropped 2026-04-23. Was opportunistic colado in the breaking-version window without its own evidence. **Not closed by alpha.17** (orphan IDEA.md absorption): alpha.17 removes IDEA.md post-approval by absorbing content into `01_REQUIREMENTS.json::original_brief`, while this proposal targets the pre-approval file location (root vs `spec/IDEA.md`). Re-open with its own evidence — a real consumer asking for the relocation, or a concrete defect.
- [ ] **Phase 3 canonical TC id regex** — dropped 2026-04-23. Still waiting for the second evidence case that was the original gate; forcing it through the v2 batch inverted the evidence-before-breakage logic.
- [ ] **Command-surface audit outcomes** — remains a Design Study below. No trigger.

### Core — alpha.7 canary findings (Ultron 2026-04-28) — open items

Canary on v2.0.0-alpha.7 validated the grammar fix end-to-end (6/6 emissions copy-paste literal, no regression of alpha.6's inverted-order bug). Five secondary findings surfaced. The Go runner parser shipped in alpha.8; manifest schema drift and feature verify-run cwd shipped in alpha.9; the `--cmd` flag wiring/USAGE was confirmed and documented in alpha.15 (see closed entry below + CHANGELOG). One remains open — not a blocker.

- [ ] **P3 — Upgrade banner cached-briefings warning — DECIDED 2026-05-02: not implementing (trigger window expired).** Originally proposed for the alpha.6→alpha.7 grammar boundary: warn the operator that terminal-cached briefings emitted by alpha.6 used different command grammar. Trigger condition was `before.semver < 2.0.0-alpha.7 && after.semver >= 2.0.0-alpha.7`. As of alpha.18 (2026-05-02) we are 11+ alphas past the boundary — any project upgrading from alpha.6 today is so far behind that the warning would fire for essentially nobody. Re-open only if a future grammar change creates a new boundary that warrants the same protection.

- [x] **P3 — `aitri feature verify-run --cmd` flag wired and documented (alpha.15).** Verified: `lib/commands/feature.js:38` lists `aitri feature verify-run <name> [--cmd "..."]` in USAGE; `featureFlagValue('--cmd')` (alpha.7+) routes the value into `cmdVerifyRun`. The "unverified" note was closed by the alpha.15 USAGE addition.

### Core — Secondary findings from Ultron canary 2026-04-27 (alpha.6/7 session)

Originally three independent issues surfaced by the Ultron canary that validated the alpha.6 → alpha.7 scope-grammar fix. The Approve UX routing fix and the Phase 3 NFR acceptance shipped in alpha.9; the `feature list` walk-up message shipped in alpha.15 (see closed entry below + CHANGELOG). All three are now closed.

- [x] **P3 — `aitri feature list` honest message when cwd is not project root (alpha.15).** Shipped option (b) per the original ticket: `lib/commands/feature.js:172-223` calls `findAncestorProjectRoot()` and prints `No features in current directory (cwd is not the project root). / Project root: <abs> / Run from there: cd <path> && aitri feature list` when an ancestor `.aitri` exists. Cesar canary 2026-05-02 verified the subtlety: from inside a feature dir or `features/<x>/spec/` the command does NOT auto-list — it points to project root; the walk-up only triggers from `spec/` (sibling of `features/`).

### Core — `aitri normalize` proportionality (Ultron canary 2026-04-27)

- [ ] **P1 — Normalize fires on non-behavioral file changes (root cause of friction cycle).** Three separable bugs surfaced by Ultron canary on alpha.3.

  Evidence (verified, not paraphrased):
  - **Cycle is real and recurring.** Ultron git history contains three previous workaround commits with the same shape: `9b68709 chore: advance aitri normalize baseline to current HEAD`, `0e6786a chore: advance aitri normalize baseline past CSS regeneration commit`, `35a9a95 chore: advance aitri normalize baseline past PR #1`. Each was the user manually compensating for the same broken contract.
  - **Trigger of the most recent cycle (commit `e7f67cb`):** a one-line `go.mod` toolchain bump from 1.25.5 → 1.25.9 to resolve upstream Go stdlib CVEs. No application code touched. Aitri treated it as behavioral drift requiring full normalize ceremony.
  - **Briefing size measured: 70,390 bytes (70KB).** Verified by `aitri normalize 2>&1 | wc -c` on Ultron at HEAD `e7f67cb`. Size is fixed regardless of file count or change size — `lib/commands/normalize.js:300-321` embeds the full content of `01_REQUIREMENTS.json`, `03_TEST_CASES.json`, and `04_IMPLEMENTATION_MANIFEST.json` into the briefing.
  - **`--resolve` gate cost:** requires `verifyPassed === true` (`normalize.js:136`) → forces full re-run of `verify-run` + `verify-complete` (45 tests in Ultron's case) for any source change post-last-verify. Plus TTY gate (`normalize.js:158`) — agents cannot resolve. So one-line `go.mod` change → 45 tests + 70KB briefing + interactive human prompt.

  Problem / Why:
  - Aitri's contract claims to detect "code changes outside the pipeline since last build approval." The implementation treats any non-`spec/`, non-`.aitri/`, non-`node_modules/` file as drift. That includes `go.mod`, `*.md`, `Dockerfile`, `.env.example`, `Makefile`, lockfiles, CI configs, regenerated CSS bundles. None of those are behavioral.
  - The result is surveillance fatigue: users either ignore normalize (defeats the gate) or generate "chore: advance baseline" workaround commits (Ultron has 3 in git history). Both degrade produced software — the first by reducing signal credibility, the second by polluting commit history with bookkeeping.
  - Tier-1 evidence is direct: produced software is degraded today by users compensating for the tool instead of doing substantive work.

  Sub-bugs:

  **N1 — Behavioral filter for `aitri normalize` and `detectUncountedChanges` (root cause) — SHIPPED in alpha.4.** Verified in code: `lib/normalize-patterns.js::isBehavioralFile()` is consumed by `normalize.js::gitChangedFiles()` (line 66) and `mtimeChangedFiles()` (line 82), and by `snapshot.js::detectUncountedChanges()` (line 489). Note: planning called the module `lib/upgrade/normalize-patterns.js` but it shipped at `lib/normalize-patterns.js`. **N3 — SHIPPED alpha.19** (verify-complete consumes snapshot SSoT — see "Shipped in alpha.19" above). **N2 below remains open** — N1+N3 closing was scoped per the original "ship N1 alone first; verify; then decide" decision; N2 has not been re-evaluated against post-N1+N3 friction. Parent priority unchanged (P1) until that re-evaluation happens.

  Files:
  - `lib/commands/normalize.js` — `gitChangedFiles()` (line 54) and `mtimeChangedFiles()` (line 68): apply behavioral allowlist to filter out non-behavioral patterns before counting.
  - `lib/snapshot.js` — `detectUncountedChanges()` (line 442) currently filters only `spec/`, `.aitri`, `node_modules/`; extend with the same allowlist.
  - `lib/upgrade/normalize-patterns.js` (new) — exported allowlist, single source of truth shared between normalize.js and snapshot.js.
  - `docs/integrations/ARTIFACTS.md` and `docs/integrations/SCHEMA.md` — document the allowlist so consumer projects know what is auto-excluded from drift detection.
  - `test/commands/normalize.test.js` and `test/snapshot.test.js` — add coverage for: (a) allowlist files don't trigger pending state, (b) mixed change set (allowlist + behavioral) reports only behavioral count, (c) all-allowlist diff auto-advances baseRef silently on next `aitri status` read.

  Behavior:
  - When `git diff baseRef..HEAD --name-only` returns ONLY files matching the allowlist, `aitri status` does not show the warning, `nextActions` does not emit P4 normalize, and `normalizeState.baseRef` advances to current HEAD silently on the next `loadConfig` after the diff is computed (one-time bookkeeping write, no user prompt).
  - When the diff contains any behavioral file, the warning fires as today, but the count and the briefing's file list exclude allowlist files (they are not part of the review scope).
  - `aitri normalize` always shows the briefing for behavioral files only. If post-filter file count is 0, prints `✅ No behavioral changes detected outside pipeline.` and advances baseline.

  Allowlist (initial — extensible via `.aitri/normalize-ignore` if a project needs more):
  - Build/dependency manifests: `go.mod`, `go.sum`, `package.json`, `package-lock.json`, `yarn.lock`, `Cargo.lock`, `Cargo.toml`, `Pipfile`, `Pipfile.lock`, `requirements*.txt`, `Gemfile`, `Gemfile.lock`, `composer.lock`, `*.lock`
  - Documentation: `*.md`, `*.txt`, `*.rst`, `LICENSE*`, `CONTRIBUTING*`, `AUTHORS*`, `CHANGELOG*`
  - Config / dotfiles: `.env`, `.env.*`, `.gitignore`, `.dockerignore`, `.editorconfig`, `.prettierrc*`, `.eslintrc*`
  - CI / infra: `Dockerfile*`, `docker-compose*.yml`, `Makefile*`, `*.mk`, `.github/**`, `.gitlab-ci.yml`, `.circleci/**`, `ci/**`
  - Generated assets: `web/static/dist/**`, `**/*.min.js`, `**/*.min.css`, `**/dist/**`, `**/build/**` (already partially in `IGNORE_DIRS` for mtime path; needs git path coverage too)

  Decisions:
  - **Allowlist, not blocklist.** Default-deny behavioral, default-allow non-behavioral. Reverse would force every project to register all their config files manually.
  - **Baseline advances silently on all-allowlist diff.** No user prompt, no event log entry beyond a single `normalize-auto-advance` event. Rationale: surveillance-free is the contract — if there's nothing to review, there's nothing to confirm.
  - **No allowlist override needed for v1.** Future `.aitri/normalize-ignore` (optional file) can extend; ship without it. KISS.
  - **N1 is independent of N2 and N3.** Ship N1 alone first; verify on Ultron; then decide if N2/N3 are still needed or if N1 absorbs the perceived friction.

  Acceptance:
  - On Ultron at current HEAD (`e7f67cb`, only `go.mod` differs from baseRef), `aitri status` does NOT show "files changed outside pipeline" warning.
  - On a project with one `.md` change AND one `internal/auth/jwt.go` change since baseRef, `aitri normalize` briefing lists only the `.go` file. Count is 1.
  - `npm run test:all` passes with new tests covering allowlist, mixed changes, and silent baseline advance.
  - `docs/integrations/CHANGELOG.md` carries an entry tagged `— additive` (consumer-visible: drift detection now ignores allowlisted patterns).

  **N2 — Briefing proportional to change scope (polish, ship after N1 if still needed)**

  Files:
  - `lib/commands/normalize.js` — replace full-spec embedding with: file list + `git diff baseRef -- <file>` per file + only the FRs/TCs whose `files_created` mentions a changed file.
  - `templates/phases/normalize.md` — restructure briefing template around the diff-and-relevant-spec model.
  - `test/commands/normalize.test.js` — assert briefing size scales with changed file count, asserts cross-ref logic picks correct FRs/TCs.

  Behavior: briefing for a 1-file change drops from ~70KB to <10KB. The agent reviewer still has full context for what changed but doesn't re-read the entire spec.

  Decisions:
  - Cross-ref by exact path match in `04_IMPLEMENTATION_MANIFEST.json::files_created[].path`. If no FR/TC references the file → include the FR/TC list as today (degrade gracefully).
  - Diff per file capped at 200 lines per file; truncate with `... (N more lines, see git diff)`.

  Acceptance: briefing for the Ultron-style one-line `go.mod` change (post-N1, this scenario is moot — file is allowlisted). Briefing for a one-file source code change <10KB, includes the file's diff and only FRs/TCs that reference it.

  **N3 — Snapshot priority ladder unified between status and verify-complete — SHIPPED alpha.19** (commit `c85c356`). `cmdVerifyComplete` root scope consumes `buildProjectSnapshot(dir, { cliVersion: VERSION }).nextActions[0]`. Test in `test/commands/verify.test.js` asserts equality of the `→ Next:` line between verify-complete and status when normalize is pending. Feature scope intentionally unchanged — `scopeTokens()` grammar is incompatible with snapshot rooted at featureDir; revisit only if a feature-scope canary surfaces friction. See "Shipped in alpha.19" above.

  Evidence / source: Ultron canary 2026-04-27. User session reported the cycle. Independent agent in a different session corroborated it. Verified in this session by reading the code, measuring the briefing (70KB), reproducing the cycle, and finding three previous workaround commits in Ultron git history. Severity HIGH — Tier-1 (degrades produced software via meta-commit pollution and signal-credibility erosion) + generalizes to any consumer project with documentation, build manifests, or CI config.

### Core — Post-promotion housekeeping

- [ ] **Rename `from-0.1.65.js` or adjust ADR — DECIDED 2026-05-02: ADR-027 amended (per-version-boundary is heuristic, not contract).** The module's actual contract is field-presence gating, not the file name. Splitting into `from-0.1.80.js` etc. would be cosmetic — the gating logic carries no version meaning. Re-open if a second brownfield baseline produces a natural split (e.g. a v0.2+ schema change cluster), not before. See ADR-027 amendment for the naming-convention clarification.

- [ ] **P3 — Strengthen `release-sync.test.js` to detect missing integrations CHANGELOG entries — DECIDED 2026-05-02: not implementing.** Both opt-out designs (strict + lax) shift the failure mode without preventing it — neither replaces the human judgment "does this bump affect subproduct readers?" The single occurrence (alpha.14) was caught by manual audit and closed retroactively; alpha.15 was an intentional skip (no schema change), not a miss. Score: 1 actual miss in 18 alphas. Per CLAUDE.md "prevention with no current victim → backlog, not commit". Re-open criterion: a second **unintentional** miss in the alpha.18+ sequence. The reminder value of a guard does not justify the noise-vs-friction trade-off until the failure recurs.

### Core — Consumer project backlog richness

- [~] P2 — **Backlog richness — scaffold portion SHIPPED alpha.21; schema enrichment + CLI flags DEFERRED** (commit `b8c1e9c`). Scaffold portion: `templates/BACKLOG.md` (47 lines, Entry Standard + Minimum entry format block + 1 worked P3 example) written by `aitri init` and `aitri adopt apply` at project root if absent (idempotent). Coexists with `spec/BACKLOG.json` (CLI-managed) — independent surfaces, no schema/validate(). Tests +4 in `test/commands/{init,adopt}.test.js`. See "Shipped in alpha.21" above.

  **Deferred (dormant) — schema enrichment + CLI flags.** Out of scope of alpha.21:
  - `spec/BACKLOG.json` new optional fields (`files: string[]`, `behavior: string`, `acceptance: string`, `notes: string`) — would be additive per integration contract.
  - `aitri backlog add --files / --behavior / --acceptance / --from-file <path>` rich-input flags.
  - `aitri backlog show <id>` detail renderer.
  - `lib/commands/backlog.js` list detail view rendering new fields when present.

  Per CLAUDE.md narrow-evidence rule: only Hub validates the rich format today (Hub's hand-written `BACKLOG.md` grew the format organically; Aitri's `docs/Aitri_Design_Notes/BACKLOG.md` defines a similar Entry Standard self-doc). The scaffold portion alone covers the Tier-1 value (consumer projects start with the format guide visible). Adding schema/CLI surfaces without a second consumer asking is design-by-imagination — wait for a project distinct from Hub to surface the need.

  **Re-open criterion:** a second consumer asks for CLI-managed rich entries OR a concrete defect surfaces from the JSON-schema thinness (e.g. an agent picks up a 4-field entry and re-derives the wrong files to touch).

  Evidence / source: surfaced during the v2.0.0-alpha.3 canary on Hub. Explicit user request 2026-04-24. Scaffold portion shipped alpha.21 (2026-05-02).

### Core — Web bias removal (stack-agnostic test runner)

Aitri assumes "web app with browser UI" as the default project shape. The assumption is hardcoded in at least 6 places and bites any non-web project (Go service on Raspberry Pi, CLI tool, library, daemon, embedded firmware) at Phase 4 verify-complete. The system tells the operator to falsify the TC `type` to dodge the gate — an honor-system patch that contradicts Aitri's own validation philosophy.

**Where the bias lives:**

| File | Bias |
| :--- | :--- |
| `lib/commands/verify.js:909-927` | Gate `type:e2e ⇒ Playwright`; failure message suggests "change their type in Phase 3" |
| `lib/commands/verify.js:501-529` | E2E runner only activates when `playwright.config.{js,ts}` exists |
| `lib/commands/verify.js:598-606` | Skipped TC classification labels e2e as "browser" |
| `templates/phases/tests.md:118-119,179,189,227` | QA persona prescribes Playwright naming + "user flows" framing |
| `templates/phases/requirements.md:127` | Phase 1 NFR example names Playwright |
| `templates/phases/deploy.md:61,99` + `build.md:87` | Phase 5 CI checklist prescribes Playwright verification |

**Conceptual fix:** decouple test **scope** (`unit | integration | e2e` — what the test covers) from test **runner** (Playwright, `go test`, pytest, jest — the tool that executes it). A TC declares its scope; the project declares its runner; `aitri verify-run` dispatches to the runner the project has. E2E is a coverage category, not a browser requirement. A Go service test that boots the binary and hits its endpoint via HTTP is e2e — no Playwright involved.

**Evidence / source:** Go-on-RaspberryPi project (2026-04-29) — first non-web canary that hit the bias. Aitri blocked verify-complete for 26 e2e TCs and the in-product remediation suggested falsifying the TC type. User session surfaced the systemic nature of the bias — confirmed by code reading across 6 files. Tier-1 signal: every non-web consumer project today produces lower-quality test specs because the QA persona prescribes a runner that does not apply to its stack.

**Update 2026-04-30 — deep verification narrowed the scope.** Unit/integration dispatch already works: `verify.js:457-485` routes to `parseGoOutput` / `parsePytestOutput` / `parsePlaywrightOutput` based on `manifest.test_runner` (Go parser shipped in alpha.8). The bias is specifically in the **e2e auto-run** path (`verify.js:501-529`, Playwright-only) and the **e2e gate** (`verify.js:909-927`). The original "runner dispatch in priority order" framing in L1 below conflated already-working unit/integration dispatch with the actual e2e gap. L1 split into L1a (shipped — gate accepts manual + stack-aware advice) and L1b (open — auto-run for non-Playwright e2e). Note: the `runnerHint` referenced in earlier drafts is a `manifest.test_runner`-derived local variable, NOT a `.aitri` field; that line was inaccurate.

---

- [x] **L1a — e2e gate accepts `automation: "manual"` + stack-aware advice** (alpha.14). `verify.js::cmdVerifyComplete` e2e gate now treats `status === 'manual'` as covered (consistent with FR coverage policy in `ARTIFACTS.md:249`). Failure message branches on whether `playwright.config.{js,ts}` is present and explicitly says: *"Do NOT change the TC type to bypass this gate — the type field describes intent, not runner availability."* Removes the honor-system bypass advice the prior message had. Tests +4 in `test/commands/verify.test.js` covering: skip+noPW, skip+PW, manual, pass.

  Why this is L1a (and not the full L1): the manual escape unblocks Go-on-RPi today. Auto-run for non-Playwright e2e (L1b) becomes quality-of-life rather than a blocker.

---

- [x] **L1b — e2e auto-run for non-Playwright runners — collapsed (2026-05-02 PM, see Cesar deepening session above).** Two halves disposed of separately: (a) the **mensajería half** shipped in alpha.16 as part of "L2 (mensajería piece) — runtime wording neutral when no Playwright config" — `verify.js` `SKIP_NOTE` and skipped-summary line are now conditional on `playwright.config.{js,ts}` presence. (b) The **runtime half** (Playwright auto-dispatch generalised to `manifest.test_runner`) has no remaining content in code — `verify.js:509` reads `if (hasPwConfig) { … auto-run Playwright … }`, so on projects without `playwright.config.{js,ts}` the auto-dispatch is dead code. There is no Playwright bias to remove from the runtime path. **What still lives independently is the L2 templates piece** (Phase 1/3/5 templates prescribing Playwright as default e2e runner) — tracked below as a separate ticket. Re-open L1b only if a real consumer surfaces an automated-e2e need that the manual escape + dead-code dispatch cannot cover.

---

- [x] **`aitri tc mark-manual <TC-ID>` CLI helper — SHIPPED alpha.23** (`lib/commands/tc.js::tcMarkManual`). Single-TC mode: reads `spec/03_TEST_CASES.json`, sets `automation: "manual"` on the matched TC, writes back. Idempotent (no-op + message when already manual). Re-stamps `artifactHashes['3']` in the same step when stored — `mark-manual` IS the operator authorization for this scoped field-level edit (different from `aitri rehash` which gates over arbitrary content drift); forcing a separate rehash step would defeat the alpha.14 friction-reduction design intent. Bulk mode (`--all-of-type e2e`) and reverse direction (`mark-auto`) deferred — single-TC covers the documented friction; bulk is speculative until 20+ TCs need flipping in a real project. Feature scope not threaded — mirrors existing `aitri tc verify` (no `tc` case in `feature.js:77`); separate enhancement gated on a feature-scoped use case. Tests +9 in `test/commands/tc.test.js`. 1110 → 1119.

---

- [x] **L2 — Templates stop prescribing Playwright as the default e2e runner — SHIPPED alpha.20** (commit `4f2e545`). Five edits in `templates/phases/{tests,requirements,deploy,build}.md` drop the imperative "MUST use Playwright" prescription. After: `grep -ri playwright templates/phases/` returns 2 conditional examples. No "MUST use Playwright" anywhere. `lib/phases/phase3.js:141-142` (`e2eCount >= 2` rule) untouched — already runner-neutral. Closes the templates half of L2 (the mensajería half shipped in alpha.16). Test in `test/phases/phase3.test.js [L2 alpha.20]`. See "Shipped in alpha.20" above.

---

## Design Studies

> Not implementation items. Open questions that inform future architectural decisions.

### Stack-aware project profile (post-L1/L2 question)

After L1 (runner dispatch) + L2 (neutralized prompts) ship, an open question remains: should `.aitri` carry a `profile` field (`web | cli | service | library | embedded`) that conditionally enables/disables phase rules, NFR templates, and runner expectations?

**Open because:** today the runner-dispatch + neutralized-prompts approach covers the known cases without introducing a profile axis. A profile is justified ONLY if a second dimension of variation appears that runner dispatch alone cannot express. Examples that would trigger promotion to an implementation ticket:

- A project where Phase 1 NFR templates are wrong by stack (e.g. embedded firmware has no "user" actor, needs "operator" or "host system" — language drift, not runner drift).
- A project where the artifact chain itself should differ (e.g. firmware needs a hardware test plan that does not fit `03_TEST_CASES.json` schema; library needs an "API surface" artifact that does not exist today).
- Phase 5 deploy-readiness criteria that diverge structurally between stacks (a Go binary release ≠ a web deploy ≠ an npm publish — currently squeezed into one template).
- A real project with two simultaneous runners (Playwright for UI + `go test` for backend) where the L1 "first runner wins" rule is genuinely insufficient. This case alone might justify a `runner` field per TC instead of a project-wide profile — investigate which axis the evidence points to.

**Promotion criterion:** when ≥2 of the above appear in real projects, design the abstraction. Until then, runner dispatch is enough.

**Cost of premature implementation:**
- Profile becomes a leaky abstraction: profiles overlap (a CLI tool may ship a small web dashboard; a service has both API and admin UI), edge cases multiply, and `init`/`adopt` has to ask the operator a question they cannot answer reliably.
- Adding a `profile` field to `.aitri` schema is a contract change consumers (Hub, future subproducts) must absorb. Doing it twice (once now wrongly, once later correctly) is more expensive than waiting.
- The dimension we eventually need may not be `profile` at all — it could be `runner` (per-TC), `platform` (target environment), or composition of several. Picking too early locks the abstraction to whatever the first non-web project happened to look like.

**What would make this a ticket:**
- Two non-web canaries surface diverging needs in **different categories** (one in Phase 1 language, one in artifact chain, etc. — not two with the same gap).
- A real consumer project with two simultaneous runners where the L1 dispatch produces the wrong answer.
- After 6 months of L1+L2 in production, an audit finds that operators of non-web projects are systematically removing/editing template content in ways that suggest a missing axis.

**Why it is a Design Study and not a ticket:**
- The right abstraction depends on the second and third non-web project's shape, not on hypothesis from one. Picking it now is design-by-imagination.
- L1 + L2 are independently valuable and unblock the current case. They do not block this study; they generate evidence for it.
- A premature `profile` field would either be ignored (operators leave it `unknown`) or wrong (the categories don't fit). Both outcomes degrade trust in the schema.

**What NOT to do in this study:**
- Don't enumerate profiles speculatively (`web | cli | service | library | embedded | mobile | …`) and design templates per profile. That's catalog growth without evidence.
- Don't fold this into L1 or L2. Each is independently testable against a real project; profile is not.

**Evidence / source:** raised during 2026-04-29 session diagnosing the Go-on-RaspberryPi web-bias case. User explicitly authorized revisiting the "evidence narrow" principle from CLAUDE.md if it was blocking real evolution. Decision: relax the principle (not eliminate it) — verifiable bugs in code can ship without external canaries; speculative abstractions still need them. This study is the speculative half.

---

### Command-surface audit

Aitri exposes 20 top-level commands today (`lib/commands/*.js`). Over successive minor versions, several commands have developed functional overlap — not broken, but potentially redundant. Before v0.2.0, run a single audit to map the surface and decide whether to collapse, rename, or keep.

**Suspected overlaps (starting list — to be confirmed by the audit):**

| Pair / Group | Suspected overlap |
| :--- | :--- |
| `resume` vs `status` vs `status --json` vs `validate` vs `validate --explain` | Four commands project the same `buildProjectSnapshot()` with different verbosity / framing |
| `audit` vs `review` | Both are evaluative read-only passes with personas (auditor, reviewer). Different scope (audit = whole project, review = per-phase) but same shape |
| `feature verify-run` vs `verify-run` | Same logic, scoped to a feature sub-pipeline. Candidate for `verify-run --feature <name>` |
| `tc verify` vs `verify-run` | Manual TC recording vs automated runner — correct split today, but worth confirming against use |

**Already reviewed (excluded from future audits):**
- `wizard` vs `init` + `adopt scan` — reviewed 2026-04-22, **kept**. Distinct surfaces: `init` bootstraps `.aitri` config (no IDEA.md), `adopt scan` derives IDEA.md from existing code, `wizard` interactively builds IDEA.md for greenfield projects. Plus `wizard` exports `runDiscoveryInterview()` consumed by `run-phase discovery --guided` ([run-phase.js:148](../../lib/commands/run-phase.js#L148)) — load-bearing.
- `checkpoint` vs auto-`writeLastSession` + `resume` — reviewed 2026-04-22, **kept**. `--name` writes frozen resume snapshots to `checkpoints/` (no other command does this); `--context` adds free-text annotation to `lastSession`. Bare mode is the only redundant path (~5 lines of overhead). Not worth a breaking rename.

**Open question:** For each suspected overlap, is the split reinforcing a real distinction (different user intent, different invariant), or is it incidental history (command added before the collapsing path existed)?

**Why it is a Design Study and not a set of tickets:**
- Each command has test coverage and real users. A "cleanup" without evidence of confusion is churn.
- Renaming or collapsing is a breaking API change — must be batched for v0.2.0, not done piecemeal.
- The audit's *output* is the tickets (0, 1, or N of them), not the audit itself.

**Criterion to mature into tickets:**
- A concrete case of user or agent confusion about which command to use.
- A maintenance cost surfaced during unrelated work (e.g. snapshot schema change had to be propagated to 4 commands that project it).
- A release that is already touching the command surface (v0.2.0 breaking batch).

**Scope when executed:**
1. One-page table: command → unique responsibility → overlaps with → evidence for or against keeping split.
2. Per overlap: decide `keep` / `alias` / `collapse` / `rename` with trade-off written down.
3. Output: entries in the `Core — Breaking changes for v0.2.0` section, or none if the audit finds no real overlap.

**What NOT to do in the audit:**
- Don't collapse commands just because their code is similar. Intent and user model matter more than LOC.
- Don't rename for aesthetics. Every rename costs one deprecation cycle.

---

## Discarded

Items analyzed and explicitly rejected.

| Item | Decision | Reason |
| :--- | :--- | :--- |
| Mutation testing | Discarded indefinitely | Violates zero-dep principle. `verify-run --assertion-density` covers 60% of the same problem at zero cost. Option B (globally-installed stryker) introduces implicit env dependency — worse than explicit dep. ROI does not justify. |
| Aitri CI (GitHub Actions step) | Discarded 2026-04-17 | No active user demand. Contract not stable enough to publish a separate Action. If needed later, lives outside Core. |
| Aitri IDE (VSCode extension) | Discarded 2026-04-17 | Separate product with its own release cycle. Not incremental over the CLI; will be reconsidered if the CLI stabilizes across multiple external teams. |
| Aitri Report (PDF/HTML compliance report) | Discarded 2026-04-17 | User declined the surface. Compliance evidence already lives in `05_PROOF_OF_COMPLIANCE.json` + git history; rendering is a separate concern. |
| Aitri Audit (ecosystem-level cross-project aggregator) | Discarded 2026-04-17 | Functionally duplicates Hub's dashboard. Aitri Core does not maintain a global registry — adding one to support an aggregator violates the passive-producer model. Name also collides with the per-project `aitri audit` command (v0.1.71). |
| `aitri tc verify` recomputes `fr_coverage` | Discarded 2026-04-22 | Verified end-to-end: `verify-complete` blocks failures via `d.results[].status` ([verify.js:732](../../lib/commands/verify.js#L732)), not via `fr_coverage` counts. The `fr_coverage` gate at [verify.js:805-811](../../lib/commands/verify.js#L805-L811) only fires when `tests_passing === 0 && status !== 'manual'` — manual TCs never reach this branch. No active consumer reads per-FR `tests_passing/tests_manual` for any decision. Internal field drift is real but has no observable effect. Re-open if a future consumer (audit, Hub) starts reading per-FR counts. |
| Rename `checkpoint` to `note` (or simplify) | Discarded 2026-04-22 | Verified [checkpoint.js](../../lib/commands/checkpoint.js): `--name` writes frozen resume snapshots to `checkpoints/` (unique surface, not duplicated by `writeLastSession` auto), `--context` adds free-text annotation to `lastSession`. Bare mode is the only redundant path (~5 lines overhead). No user complaint in 18 versions since v0.1.70. Breaking rename for cosmetic improvement is not justified. |
| NFR traceability in Phase 2 (Design Study) | Discarded 2026-04-22 | Open since 2026-04-20 with explicit criterion "real case where approved design ignored a critical NFR and broke production". No such case has emerged in any Aitri-managed project. NLP-over-Markdown matching is high false-positive; honor-system review-list extension is untested. Persecuting a hypothetical defect. Re-open if a real case appears. |
