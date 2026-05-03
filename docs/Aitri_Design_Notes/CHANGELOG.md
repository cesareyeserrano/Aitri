# Aitri — Changelog

> Published version history. Format: [version] — date — what shipped.
> Version scheme: `0.1.x` (npm canonical). Previous entries used `2.0.x` — those entries are preserved below for history.

---

## [2.0.0-alpha.24] — 2026-05-02 — orphan IDEA migration: pre-flight scan + stale-ref detection

Twenty-fourth staged pre-release on `feat/upgrade-protocol`. Hotfix for a Tier-1 bug surfaced by the Hub canary 2026-05-02 night: the alpha.17 `diagnoseOrphanIdea` migration silently unlinked `IDEA.md` without checking whether downstream artifacts referenced the file as a path. Hub's `hub-web-only` feature treated `IDEA.md` as user-facing documentation tracked at `04_IMPLEMENTATION_MANIFEST.json::files[].path === 'IDEA.md'` plus 14 other references across system design, test cases, and proof of compliance. After the canary upgrade, `aitri verify-run` failed silently on the post-absorbed state (TC-015h grep'd `README.md DEPLOYMENT.md IDEA.md` for deprecated CLI strings; the file was gone).

**The principle this establishes.** Upgrade migrations must pre-flight scan for downstream references before destructive on-disk operations. Silently breaking declared paths violates the "upgrade is non-destructive to declared invariants" rule. Same shape as the alpha.22 hotfix (validate.js gated on a path the alpha.17 migration was unlinking) — alpha.17 had two reachability gaps; alpha.22 closed the validate side, alpha.24 closes the upgrade side.

**Behavior — two paths through `diagnoseOrphanIdea`.**

1. **PRE-FLIGHT (file present).** Before auto-absorbing, scan root pipeline artifacts (`02_SYSTEM_DESIGN.md`, `03_TEST_CASES.json`, `04_IMPLEMENTATION_MANIFEST.json`, `04_TEST_RESULTS.json`, `04_CODE_REVIEW.md`, `05_PROOF_OF_COMPLIANCE.json`, `00_DISCOVERY.md`, `01_UX_SPEC.md`, `BUGS.json`, `BACKLOG.json`, `AUDIT_REPORT.md`) plus every `features/<x>/spec/*.{md,json}` for `/\bIDEA\.md\b/`. If any match, emit a `validatorGap` finding (`autoMigratable: false`) listing the offenders. The operator updates the references — or deletes IDEA.md manually to accept the breakage — then re-runs `--upgrade`. Auto-absorption proceeds only when the project is reference-clean.

2. **STALE-REF DETECTION (file absent + Phase 1 approved).** Same scan, post-absorption. Surfaces already-broken projects (Hub) where alpha.17 ran before this fix landed. Auto-fix is impossible (references could be intentional documentation, test assertions, or genuine path lookups; only the operator knows). The finding gives the operator a forward path: identify the stale references, point them at `01_REQUIREMENTS.json#original_brief`, drop them, or rename to a project-owned doc filename.

**01_REQUIREMENTS.json is excluded from the scan at every level.** Post-absorption it legitimately holds the IDEA.md content as a substring inside `original_brief`; that text is the absorbed content, not a path reference. False-positive guard verified by test.

**Feature-directory scanning is read-only.** A2 (root upgrade does not cascade to features/.aitri) is a write-side invariant. Reading `features/*/spec/*` to detect path references does not violate it — no mutations occur outside the root pipeline.

**Why no auto-rewrite of references.** Considered and rejected. Rewriting `IDEA.md` → `01_REQUIREMENTS.json#original_brief` inside test scenarios, manifest paths, or compliance evidence is a semantic transform, not a shape transform — §2 of the upgrade protocol forbids semantic content changes in migrations. The references could mean different things in different contexts (a test grep is not a manifest path; a system design narrative is not a compliance line item). Honor-system finding is the right surface.

**Files touched.**
- `lib/upgrade/migrations/from-0.1.65.js` — new `findIdeaPathReferences()` helper; rewrote `diagnoseOrphanIdea()` to add the two scan paths around the existing original_brief / auto-absorb logic.
- `bin/aitri.js` — VERSION bump to `2.0.0-alpha.24`.
- `package.json` — version bump.
- `test/upgrade.test.js` — new describe block `lib/upgrade/migrations/from-0.1.65 — orphan IDEA.md pre-flight scan + stale-ref detection (alpha.24)`, 6 tests.
- `docs/integrations/{README,STATUS_JSON,SCHEMA,ARTIFACTS}.md` — version header bump per release-sync test.

**Tests added (6 new):** PRE-FLIGHT (a) blocks auto-absorb when manifest registers IDEA.md as a deliverable path, (b) scans feature artifacts (read-only), (c) ignores 01_REQUIREMENTS.json content (false-positive guard), (d) regression: clean project still auto-absorbs. STALE-REF DETECTION (e) flags broken references when IDEA.md is already absent, (f) negative: clean post-absorb state emits no finding. Total suite: 1119 → 1125 passing, 0 failures.

**Why a bump.** Observable behavior change in upgrade output (new finding category surface, new auto-vs-flag decision rule). Per CLAUDE.md: change in validation gate / upgrade migration → bump.

**Why no `docs/integrations/CHANGELOG.md` entry.** Migration output is CLI-text only. The schema-side impact is zero: no new field on `.aitri`, no new artifact, no change to `events.upgrade_migration` payload shape. Subproducts read `.aitri` + artifacts, not stdout. Mirrors alphas .18/.19/.20/.23 (CLI-text-only changes did not get integrations entries). Headers still bump per release-sync sync rule.

**Hub recovery (out of scope of this release).** Hub is the canary that surfaced the bug; its 14+ stale references in `features/hub-web-only/` predate this fix. Hub-side hotfix is independent: update the test cases, manifest, system design, and proof-of-compliance entries. After Hub's hotfix, alpha.24's stale-ref detection on Hub returns zero findings, confirming forward progress.

---

## [2.0.0-alpha.23] — 2026-05-02 — `aitri tc mark-manual <TC-ID>` CLI helper

Twenty-third staged pre-release on `feat/upgrade-protocol`. Single change. Closes the P3 helper that has been pending since the alpha.14 L1a manual-escape ship: marking a TC as `automation: "manual"` no longer requires hand-editing `spec/03_TEST_CASES.json`.

**The friction this closes.** alpha.14 (L1a) made the e2e gate accept `automation: "manual"` as covered, with stack-aware advice that explicitly tells the operator NOT to falsify the TC `type` to bypass the gate. That meant the manual escape became the documented path for projects whose stack lacks an automatable e2e runner (Go-on-RPi, pytest-only Cesar). But the only way to set the field was to open the JSON by hand. For Go-on-RPi's 26 e2e TCs, that meant 26 hand edits. The escape's friction defeated its purpose.

**Behavior.**
- `aitri tc mark-manual TC-001` reads `spec/03_TEST_CASES.json`, finds the TC by id, sets `automation: "manual"`, writes the file.
- Idempotent: if the TC is already `automation: "manual"`, prints `✅ TC-001 is already marked manual. (no change)` and exits 0 without rewriting.
- Errors with informative message on missing TC id, unknown TC id, missing artifact, or malformed JSON.
- After a successful flip, prints the `aitri tc verify` command line the operator can run after manual execution to record the result.

**Phase 3 hash re-stamp — intentional, scoped, not a `rehash` invariant violation.** When the project has a stored `artifactHashes['3']` (i.e. Phase 3 was approved), `mark-manual` updates the stored hash to match the new content in the same step that writes the file. This is deliberately different from `aitri rehash`:
- `aitri rehash` is a meta escape hatch over arbitrary content drift; it requires clean git + isTTY confirmation because it bookkeeps over content the operator has not necessarily reviewed in this session.
- `aitri tc mark-manual` is itself the operator authorization for a single, specific, named field-level edit (`automation` on one TC to `"manual"`). The CLI invocation IS the review. Forcing a separate `rehash` step after every `mark-manual` would replace one form of friction (hand-edit) with another (post-edit rehash), defeating the alpha.14 design intent.
- Projects without a stored `artifactHashes['3']` (i.e. Phase 3 was never approved) get no hash write — there is nothing to keep in sync.

**No bulk mode in this release.** The original 2026-04-30 BACKLOG sketch proposed `--all-of-type e2e`. Deferred. Single-TC mode covers the documented friction; bulk mode is speculative until a real project surfaces 20+ TCs that all need flipping. Reverse direction (`mark-auto`) also deferred for the same reason.

**No feature scope in this release.** Mirrors the existing `aitri tc verify` surface — `lib/commands/feature.js::cmdFeature` switch (line 77) routes `run-phase`, `complete`, `approve`, `reject`, `status`, `verify-run`, `verify-complete`, `rehash`. Neither `tc verify` nor `tc mark-manual` thread through. Adding `feature tc *` is a separate enhancement, gated on a feature-scoped use case.

**Files touched.**
- `lib/commands/tc.js` — new `mark-manual` sub-case in `cmdTC` dispatcher; new `tcMarkManual` function. `hashArtifact` added to the `state.js` import list.
- `bin/aitri.js` — VERSION bump to `2.0.0-alpha.23`. No dispatcher change (`tc` already routes to `cmdTC`).
- `package.json` — version bump.
- `test/commands/tc.test.js` — new `cmdTC — tc mark-manual` describe block, 9 tests.
- `docs/integrations/{README,STATUS_JSON,SCHEMA,ARTIFACTS}.md` — version header bump per release-sync test.

**Tests added (9 new in `test/commands/tc.test.js`):** flips automation when previously `auto`; adds the field when previously absent; idempotent on already-manual; re-stamps `artifactHashes['3']` when stored; does NOT add `artifactHashes['3']` when none stored (Phase 3 unapproved); errors on missing TC id, unknown TC id, missing artifact, malformed JSON. Total suite: 1110 → 1119 passing, 0 failures.

**Why a bump.** New visible CLI sub-command. Per CLAUDE.md: new command → bump.

**Why no `docs/integrations/CHANGELOG.md` entry.** mark-manual touches no surface visible to subproducts. Hub and any future consumer read `.aitri` (existing fields, including `artifactHashes['3']`) and `spec/03_TEST_CASES.json` (existing field `automation` already documented in ARTIFACTS.md). The new operator-facing CLI is invisible to file-based consumers — they cannot tell whether `automation: "manual"` arrived via the new command or via hand-edit. Mirrors the alpha.19 + alpha.20 decision (operator-only changes did not get integrations entries). Headers still bump per release-sync sync rule.

**Pre-stable status.** v2.0.0 stable promotion remains gated on a third-party adopter validating end-to-end. Author canaries clean as of alpha.22 (Hub, Ultron, Zombite, Cesar). Remaining open items per BACKLOG: third-party adopter canary, release-sync hardening (P3, decided not implementing). The `aitri tc mark-manual` ticket — open since 2026-04-30 — is now closed.

---

## [2.0.0-alpha.22] — 2026-05-02 — validate accepts absorbed `original_brief` in lieu of IDEA.md (closes alpha.17 contract gap)

Twenty-second staged pre-release on `feat/upgrade-protocol`. Single change. Hotfix surfaced 2026-05-02 PM Ultron canary post alpha.14 → alpha.21 upgrade — `aitri validate` falsely reported `❌ IDEA.md` on a project where the alpha.17 orphan-IDEA absorb migration had legitimately removed the file.

**The contract gap closed.** alpha.17 introduced `lib/upgrade/migrations/from-0.1.65.js::diagnoseOrphanIdea`: when Phase 1 is approved + `IDEA.md` exists at root + `01_REQUIREMENTS.json` lacks `original_brief`, the migration moves IDEA.md content into `original_brief` and unlinks the file. The migration's contract: post-absorption, `original_brief` is the SSoT for the project brief; the on-disk `IDEA.md` is deliberately gone.

`lib/commands/validate.js` was not updated to know about that contract. Both the text path (`:46`) and the JSON path (`:201`) gated on `fs.existsSync(...'IDEA.md')` and reported `❌ IDEA.md` when the file was absent — even on projects where alpha.17 had legitimately consumed it. Internal incoherence: the migration says "the file is meant to be removed," validate says "the file is required." Both shipped together.

**Fix.** New helper `ideaBriefStatus(project, root)` accepts either path:
- (a) `IDEA.md` exists at project root (pre-absorption state, all projects up to alpha.16 + projects that opted out of upgrade), OR
- (b) `01_REQUIREMENTS.json#original_brief` is a non-empty string (post-absorption state).

Returns `{ ok, absorbed }`. Both `cmdValidate` paths consume it:
- Text mode: `✅ IDEA.md (absorbed → 01_REQUIREMENTS.json#original_brief)` annotation on the absorption path; plain `✅ IDEA.md` when the file is on disk; `❌ IDEA.md` only when neither path satisfies.
- JSON mode: `exists` stays literal (filesystem presence — preserves the contract for subproducts that interpret it as such); `approved=true` when either path satisfies; new optional `absorbed: true` field present only on the absorption path. Old readers ignore unknown fields and rely on `approved` exactly as before; new readers can render the absorption explicitly.

**Why a removal of an incorrect assumption, not a new abstraction.** The original validate-time assumption was "every brief lives in `IDEA.md`." alpha.17 made that false by introducing a second SSoT for the brief; the validate gate just hadn't caught up. The fix removes the file-presence-as-truth assumption, not adds a new feature.

**Tests added (4 new in `test/commands/validate.test.js`):** absorbed-brief project validates as fully present (text mode); when both paths fail (file absent + `original_brief` missing), the gate still fails (negation guard); JSON output reports `exists=false, approved=true, absorbed=true` on the absorption path; JSON output reports `exists=true, approved=true, no absorbed flag` on the file path (additive — the field is omitted entirely when not applicable). Total suite: 1106 → 1110 passing, 0 failures.

**Why a bump.** Visible CLI output change (text mode now prints `✅ IDEA.md (absorbed → ...)` on absorbed-brief projects instead of `❌ IDEA.md`). JSON output gains an additive `absorbed` field. Per CLAUDE.md: visible output change → bump. `docs/integrations/CHANGELOG.md` entry tagged `— additive` because the `absorbed` field is a new optional surface visible to Hub.

**Pre-stable status.** v2.0.0 stable promotion remains gated on a third-party adopter validating end-to-end. Author canaries clean as of alpha.22 (Hub, Ultron, Zombite, Cesar). This was a real Tier-1 bug (verifiable from code; real consumer Ultron blocked at the time of fix; generalizes to every project that runs `--upgrade` from a pre-alpha.17 state with Phase 1 approved + IDEA.md still on disk) — exactly the case CLAUDE.md exempts from the "narrow evidence" filter ("a bug ... verifiable from the code today ... A real project (even an internal one) is currently blocked").

---

## [2.0.0-alpha.21] — 2026-05-02 — BACKLOG.md scaffold at init/adopt

Twenty-first staged pre-release on `feat/upgrade-protocol`. Single change. Closes the third item in the 2026-05-02 PM Phase 3 cleanup queue (after N3 alpha.19 + L2 alpha.20).

**Aitri now scaffolds a `BACKLOG.md` template at the project root.** New file `templates/BACKLOG.md` mirrors the Entry Standard at the top of `docs/Aitri_Design_Notes/BACKLOG.md` (simplified for consumer projects): explainer of the six-question rubric, the Minimum entry format block (Problem / Files / Behavior / Decisions / Acceptance), and one worked `P3` example under `## Open` that the operator deletes when adding real items. `aitri init` (`lib/commands/init.js`) and `aitri adopt apply` (both the regular path in `adoptApply` and the `--from N` path in `adoptApplyFrom`) write the template if no `BACKLOG.md` exists at the project root. Idempotent — re-running init or adopt apply on a project that already has a hand-written `BACKLOG.md` never overwrites.

**Why a scaffold and not a CLI command.** Hub's hand-written `BACKLOG.md` produces clearly higher-quality work items than the bare backlog the Aitri-managed `aitri backlog add` flow generates against `spec/BACKLOG.json` — but enriching the JSON schema and adding CLI flags is speculative work for a problem that has only one validated consumer (Hub itself) so far. Per CLAUDE.md narrow-evidence rule, schema enrichment + CLI flag work waits until a project distinct from Hub asks for CLI-managed rich entries. The scaffold is the minimum surface that gives every new consumer project the format on day one without committing Aitri to maintain a structured schema.

**Coexistence with `spec/BACKLOG.json`.** Independent. `BACKLOG.md` is hand-written, narrative, lives at project root. `spec/BACKLOG.json` is CLI-managed (`aitri backlog add/list/done`), structured, lives under `spec/`. Aitri does not read or mutate `BACKLOG.md` after scaffolding; it is purely a starter document. Subproducts (Hub) MAY render `BACKLOG.md` if they choose; nothing in core depends on its presence after the initial write.

**Files touched.**
- `templates/BACKLOG.md` (new) — 47 lines: title + entry-standard rubric + format block + one example.
- `lib/commands/init.js` — block after the `.gitignore` write that copies `templates/BACKLOG.md` if absent.
- `lib/commands/adopt.js` — same block in `adoptApply` (after `writeAgentFiles`) and `adoptApplyFrom` (after `saveConfig`); `rootDir` threaded through `adoptApplyFrom` since the legacy `--from N` path did not previously receive it.
- `test/commands/init.test.js` — new describe block: scaffold lands at root + idempotent re-run preserves a hand-written file.
- `test/commands/adopt.test.js` — two tests in the existing `aitri adopt apply` describe block: scaffold lands + idempotent.

**Tests added (4 new):** init creates BACKLOG.md (asserts Entry Standard / Minimum entry format / Open section all present); init does not overwrite an existing BACKLOG.md; adopt apply creates BACKLOG.md from absent; adopt apply does not overwrite an existing BACKLOG.md. Total suite: 1102 → 1106 passing, 0 failures.

**Why a bump.** New visible artifact produced by `init` and `adopt apply`. Per CLAUDE.md: new artifact at scaffold time → bump. `docs/integrations/CHANGELOG.md` updated as `— additive` because the new file is a surface subproducts (Hub) may want to read or render; old readers continue working unchanged.

**Pre-stable status.** v2.0.0 stable promotion remains gated on a third-party adopter validating end-to-end. Author canaries clean as of alpha.21 (Hub, Ultron, Zombite, Cesar). Phase 3 of the 2026-05-02 PM cleanup is now complete (N3 + L2 + Backlog richness all shipped). Remaining open items per BACKLOG: third-party adopter canary, A2 disposition, `aitri tc mark-manual` CLI helper (P3), release-sync hardening (P3).

---

## [2.0.0-alpha.20] — 2026-05-02 — Phase 3-5 templates: runner-neutral e2e wording

Twentieth staged pre-release on `feat/upgrade-protocol`. Single change. Closes the L2 templates piece tracked since alpha.13 and validated independently by Cesar (pytest) and Go-on-RPi canaries.

**Phase 3 / 4 / 5 templates no longer prescribe Playwright as the default e2e runner.** Five edits, all in `templates/phases/`:

- `tests.md:118-119` — was: "E2E tests run via Playwright MUST follow the same TC-XXX: naming … This allows aitri verify-run --e2e to auto-detect them from Playwright output". Now: the canonical TC-XXX prefix rule applies regardless of runner; example list cites Playwright/Vitest/Jest, Go (`func TestTC_XXX_…`), and pytest (`def test_tc_xxx_…`); `verify-run --e2e` is described as parsing the runner output by TC id, not by framework.
- `requirements.md:127` (CI/CD NFR minimum) — was: "(including E2E if playwright.config.js exists)". Now: "including any e2e runner the project uses". The Playwright-config conditional was a Web-project-specific hack masquerading as a generic rule.
- `deploy.md:61` (CI/CD verification step d) — was: "(d) includes Playwright if `playwright.config.js` exists". Now: "(d) runs the project's declared e2e runner if one is configured (e.g. invoking `playwright test` when `playwright.config.js` exists, or the equivalent for whatever framework System Design declares)". Playwright stays as one example among many.
- `deploy.md:99` (Phase 5 Human Review checklist) — dropped "and Playwright all checked"; replaced with "and any declared e2e runner step all checked".
- `build.md:87` (Phase 4 CI/CD deliverable) — was: "(4) run Playwright if `playwright.config.js` exists". Now: "(4) run the project's declared e2e runner as a separate step if one is configured (otherwise omit the e2e step — do not invent a runner the project does not use)".

**`lib/phases/phase3.js:141-142` is unchanged.** The `e2eCount >= 2` rule operates on `tc.type === 'e2e'` — already runner-neutral. Nothing in the `validate()` code path mentions Playwright; the prescriptive bias was entirely in the prompt template.

**Verification.** After the edits, `grep -ri playwright templates/phases/` returns exactly two occurrences — both as conditional examples (`tests.md` example list of frameworks, `deploy.md` CI auto-detection check). No imperative "MUST use Playwright" anywhere.

**Tests added (1 new in `test/phases/phase3.test.js`):** asserts the rendered Phase 3 briefing is runner-neutral. Negation guards against three pre-alpha.20 imperative phrasings (`/run via Playwright MUST/`, `/MUST use Playwright/`, `/from Playwright output/`); positive checks confirm the TC-XXX naming rule survives, multiple runners are listed as examples (`Vitest|Jest|pytest|Go`), and the `verify-run` reference is preserved. Total suite: 1101 → 1102 passing, 0 failures.

**Why a bump.** Observable change in generated prompt content. Existing projects mid-pipeline see different briefings on the next `run-phase 3` / `run-phase 4` / `run-phase 5`. Per CLAUDE.md: change in visible CLI output → bump.

**No integrations CHANGELOG entry.** Templates render to CLI stdout; subproducts (Hub) read `.aitri` + artifact files, not prompts. The change does not touch artifact / `.aitri` schema / events / commands.

**Pre-stable status.** v2.0.0 stable promotion remains gated on a third-party adopter validating end-to-end. Author canaries clean as of alpha.20 (Hub, Ultron, Zombite, Cesar). Stack-agnostic principle (CLAUDE.md engineering principle 4) is now consistent across the prompt surface; future projects on non-web stacks (Go-on-RPi included) get briefings that match their reality on the first run.

---

## [2.0.0-alpha.19] — 2026-05-02 — verify-complete next-action via snapshot SSoT

Nineteenth staged pre-release on `feat/upgrade-protocol`. Single change. Closes the N3 contradiction surfaced by the alpha.13–17 audit on 2026-05-02 PM: `verify-complete` and `aitri status` could disagree on the next action.

**Root-scope `verify-complete` now consumes the snapshot priority ladder.** `lib/commands/verify.js::cmdVerifyComplete` previously hardcoded its tail emission as `aitri run-phase 5` (phase 5 not approved) or `aitri validate` (phase 5 approved). When normalize was pending after a clean `verify-run`, that hardcoded branch contradicted `aitri status` / `aitri resume`, both of which correctly route to `aitri normalize` (priority 4). Verify-complete now calls `buildProjectSnapshot(dir)` and emits `nextActions[0]` — same SSoT as `status`, `resume`, and `validate`. Operator-facing format is unchanged (PIPELINE INSTRUCTION header + command + reason). Since the snapshot uses the alias form (v0.1.69+), the suggested command shape moves from `aitri run-phase 5` to `aitri run-phase deploy`; both forms resolve to phase 5 at the dispatcher.

**Feature scope is unchanged.** `lib/scope.js::scopeTokens()` (alpha.7 fix for the `aitri feature <verb> <name> <phase>` grammar) is incompatible with the snapshot rooted at the feature dir, which would treat the feature as `scopeType='root'` and emit unprefixed commands. The alpha.13 feature-scope branches stay intact: prefixed `aitri feature run-phase <name> 5` when phase 5 is not approved, terminal-state message pointing at `aitri feature status <name>` when phase 5 is approved.

**Tests added/updated (1 new + 2 adjusted in `test/commands/verify.test.js`):** new test asserts `cmdVerifyComplete` and `cmdStatus` emit identical `aitri normalize` next-action when normalize is pending (the canonical N3 contradiction). Existing root-scope tests adjusted: phase-5-not-approved now matches `/run-phase (5|deploy)/` (alias form), phase-5-approved now matches `/confirm deployment readiness/i` (snapshot reason replaces alpha.13's "Phase 5 already approved" line). Feature-scope tests untouched. Total suite: 1100 → 1101 passing, 0 failures.

**Why a bump and not a silent fix.** Visible CLI text change (suggested command shape moves from `5` to `deploy`; reason line wording differs) on a load-bearing transition gate. Per CLAUDE.md: visible CLI output change → bump. No artifact / `.aitri` schema change — `docs/integrations/CHANGELOG.md` deliberately not updated (subproducts read `.aitri` + artifact files, not CLI stdout).

**Pre-stable status.** v2.0.0 stable promotion remains gated on a third-party adopter validating end-to-end. Author canaries clean as of alpha.19 (Hub, Ultron, Zombite, Cesar). Audit-driven internal alignment fix; no new external defect surfaced.

---

## [2.0.0-alpha.18] — 2026-05-02 — Z2 backfill caveat surfaced in upgrade report

Eighteenth staged pre-release on `feat/upgrade-protocol`. Single change. Closes a code/comment honesty gap surfaced by the alpha-13-to-17 audit on 2026-05-02 PM.

**Z2 backfill lock-in caveat now visible to the operator.** When `adopt --upgrade` backfills `artifactHashes` for an approved phase that lacked one (Z2, alpha.13), `lib/upgrade/index.js::printReport` now emits a `⚠️  Note:` immediately after the migration list explaining that the on-disk state has been treated as the approved baseline — and that any artifact change made post-approval but pre-upgrade is now silently locked in as approved (drift detection will report nothing). The note suggests comparing git history if the operator is unsure. Conditional voice in dry-run ("would be stamped") vs real run ("were stamped").

**The honesty gap.** `lib/upgrade/migrations/from-0.1.65.js::diagnoseArtifactHashes` documentation has claimed since alpha.13 that "the upgrade report surfaces this caveat." `printReport` never actually did. The audit traced the comment to the migration's intent at landing, but the surfacing was never implemented. This release implements it and corrects the comment to reference the now-real surface.

**What did not change.** Z2 migration logic itself (the backfill mechanic, idempotency, hash function alignment with `approve.js`) is unchanged. No artifact / `.aitri` schema change. No new gates. The note is operator-visible CLI text only — subproduct readers (Hub) consume `.aitri` and artifact files, not CLI stdout, so `docs/integrations/CHANGELOG.md` is deliberately not updated.

**Tests added (3 new in `test/upgrade.test.js`):** caveat appears when artifactHashes are backfilled; caveat does NOT appear when no backfill happens (idempotent re-run); dry-run uses conditional voice ("would be stamped"). Total suite: 1097 → 1100 passing, 0 failures.

**Why a bump and not a silent fix.** New operator-visible CLI message during a load-bearing flow (`adopt --upgrade` is the primary upgrade path). Per CLAUDE.md: visible CLI output change → bump.

**Pre-stable status.** v2.0.0 stable promotion remains gated on a third-party adopter validating end-to-end. Author canaries clean as of alpha.18 (Hub, Ultron, Zombite, Cesar). This is a documentation-honesty fix, not a canary-driven defect — streak-of-quietness counter is unchanged in spirit (no new external defect surfaced).

---

## [2.0.0-alpha.17] — 2026-05-02 — orphan IDEA.md absorption at upgrade time

Seventeenth staged pre-release on `feat/upgrade-protocol`. One change. Closes the residue from v0.1.89's `aitri approve 1` archive: projects approved before that release kept `IDEA.md` at the root indefinitely. Surfaced 2026-05-02 by the author noticing the file persisting through several alpha upgrades on his own projects.

**Orphan IDEA.md absorption** (`lib/upgrade/migrations/from-0.1.65.js::diagnoseOrphanIdea`). New BLOCKING migration in the existing per-version module. Triggers when Phase 1 is approved AND `IDEA.md` exists at the project root AND `01_REQUIREMENTS.json` lacks `original_brief`. Auto-migratable: copies `IDEA.md` content into `original_brief`, unlinks the file, re-stamps `artifactHashes[1]` so `status` does not flag drift on the next call. Edge case (flag-only): if `original_brief` is already populated, emit a `validatorGap` finding instead — overwriting a prior approval's archived brief would clobber non-empty data; operator decides which copy is authoritative.

**Cost shape.** Function short-circuits on `fs.existsSync('IDEA.md')` before any JSON parse. After the first successful migration the file is gone, so subsequent upgrades pay one stat() and return immediately. No per-command cost (`status`, `resume`, `verify` etc. never invoke diagnose).

**Tests added (6 new in `test/upgrade.test.js`):** auto-migrate happy path; flag-only when `original_brief` already populated; no flag when Phase 1 not approved; no flag when IDEA.md absent; idempotent across multiple upgrades; `artifactHashes[1]` re-stamped to post-archive content. Total suite: 1091 → 1097 passing, 0 failures.

**Why a bump.** New auto-migration that mutates two artifacts (`01_REQUIREMENTS.json` field add + `IDEA.md` deletion). Operator-visible behaviour change on every legacy project.

---

## [2.0.0-alpha.16] — 2026-05-02 — Cesar canary fixes (N1 + sub-finding + L2 mensajería)

Sixteenth staged pre-release on `feat/upgrade-protocol`. Three changes ship together because the Cesar canary 2026-05-02 PM (alpha.4 → alpha.15 deepening pass) surfaced them as one defect with two layers plus an absorbed L1b mensajería piece. See `BACKLOG.md` for the full canary entry.

**N1 (P1) — `adopt --upgrade` flags legacy `.venv/`-relative manifest `test_runner`.** New VALIDATOR-GAP finding in `lib/upgrade/migrations/from-0.1.65.js::diagnoseLegacyVenvManifest`. Walks the root `04_IMPLEMENTATION_MANIFEST.json` and every `features/<name>/.../04_IMPLEMENTATION_MANIFEST.json`; emits one finding per manifest whose `test_runner` matches `^\.?venv/|^env/`. `autoMigratable: false` per ADR-027 §2 — rewriting the path is semantic and fragile across venv layouts (`.venv`, `venv`, `~/venvs`, `poetry`, `pipenv`). Closes the silent breakage where pre-alpha.9 manifests trip `Command not found` after the alpha.9 cwd change (`3603a49`) moved feature `verify-run` cwd to the feature directory.

**N1 sub-finding (P1) — `verify-run` ENOENT does not persist degraded results.** `lib/commands/verify.js::cmdVerifyRun` now exits via `err()` when `spawnSync.error.code === 'ENOENT'` instead of writing a degraded `04_TEST_RESULTS.json` (0 passed / N skipped) and flipping `verifyPassed = false` per Z1. The on-disk artifact and `.aitri.verifyPassed` / `.aitri.verifySummary` are preserved verbatim — a missing runner is not the same as a failing test suite. The error message also drops the misleading `--cmd ".venv/bin/pytest …"` suggestion that pointed back at the same broken path; it now suggests absolute or PATH-resolved alternatives.

**L2 (P2 — mensajería piece) — runtime wording neutral when no Playwright config.** `SKIP_NOTE` and the `Skipped:` summary line in `verify-run` no longer prescribe Playwright unconditionally. With `playwright.config.{js,ts}` present, wording is unchanged ("e2e/browser", "may also require a browser environment"). Without it, the count is labeled neutrally ("e2e") and the browser hint is dropped from `SKIP_NOTE`. Absorbs L1b's mensajería half — the gate-path L1b hypothesis was refuted by Cesar (the dispatch block at `verify.js:509` is dead code on projects without `playwright.config`); only the wording remained. Templates ("Playwright as default e2e runner") are not touched in this release — that piece is tracked separately.

**Tests added (11 new across 2 files):** 6 in `test/upgrade.test.js` (N1 finding across `.venv/`, `venv/`, `env/` prefixes; absolute paths and PATH-resolved binaries NOT flagged; one finding per offending manifest across root + multiple `features/`; flag survives `migrateAll` into `flagged[]`) + 3 in `test/commands/verify.test.js` (ENOENT does not write 04_TEST_RESULTS.json, does not flip verifyPassed, preserves prior on-disk results) + 2 in `test/commands/verify.test.js` (L2 mensajería: pw-config branch keeps "browser", no-pw branch is neutral and drops the browser hint). Total suite: 1080 → 1091 passing, 0 failures.

**Why a bump and not a silent fix.** N1 introduces a new `upgradeFindings[]` finding type (Hub-style readers will start seeing it on legacy projects); the ENOENT change is an observable runtime behaviour change on `.aitri.verifyPassed`; L2 mensajería is operator-visible. Per CLAUDE.md: any of these alone warrants a bump.

**Pre-stable status.** v2.0.0 stable promotion remains gated on a third-party adopter validating end-to-end. Author canaries clean as of alpha.16 (Hub, Ultron, Zombite, Cesar). Streak-of-quietness counter resets — alpha.15 was 2026-05-01, alpha.16 is 2026-05-02 (canary-driven).

---

## [2.0.0-alpha.15] — 2026-05-01 — feature scope ergonomics (Cesar canary readiness)

Fifteenth staged pre-release on `feat/upgrade-protocol`. Two long-standing P3 items closed before the Cesar canary (Python web, alpha.4 baseline, 9 sub-pipelines) so that any finding naming either of these has been falsified rather than deferred. Both surfaced by Ultron canary 2026-04-27.

**`aitri feature` USAGE documents `--cmd` flag on `verify-run`.** The flag has been wired since alpha.7 — `lib/commands/feature.js:60-65` `featureFlagValue` reads `--cmd` from the feature args and `verify.js:391` honours it as the override for `manifest.test_runner` — but the USAGE block in `feature.js` did not list it. Operators only found the override by reading source. The USAGE line for `aitri feature verify-run <name>` now reads `[--cmd "..."]` with the inline note `(--cmd overrides manifest.test_runner)`.

**`aitri feature list` from a sub-directory of an Aitri project names the project root explicitly.** Previously the cwd-only lookup printed `No features yet. Run: aitri feature init <name>` regardless of whether an ancestor directory was the actual project root. Ultron canary 2026-04-27 reproduced this: an agent in `features/network-monitoring/spec/` reasonably believed the feature was lost. New private helper `findAncestorProjectRoot()` walks parents looking for `.aitri`; if found, the message names the discovered project root and the `cd` command. Standalone-tmpdir behaviour unchanged. Cesar canary 2026-05-02 verified the boundary: from inside a feature directory itself the message still fires (a feature dir is its own scope) — the walk-up listing only happens from a sibling-of-`features/` directory like `spec/`.

**What did not change.** No artifact / `.aitri` schema change. No new gates. No phase logic touched. Tests added: 3 in `test/commands/feature.test.js` (`names project root when invoked from a sub-directory of an Aitri project`, `keeps 'No features yet' message when no ancestor is an Aitri project`, `USAGE block mentions --cmd flag for verify-run`). Total suite: 1077 → 1080 passing, 0 failures.

**Why a bump and not a silent fix.** The USAGE addition is an operator-visible CLI doc change; the `feature list` message branch is an observable behaviour change on a previously silent failure mode. Per CLAUDE.md: visible CLI output change → bump. `docs/integrations/CHANGELOG.md` was deliberately not updated for this release — neither change touches the schema or artifact contract that subproduct readers consume.

**Pre-stable status.** v2.0.0 stable promotion remains gated on a third-party adopter validating end-to-end. Streak-of-quietness counter advances — alpha.14 was 2026-04-30, alpha.15 is 2026-05-01.

---

## [2.0.0-alpha.14] — 2026-04-30 — e2e gate accepts `automation: "manual"` (web-bias removal — partial L1)

Fourteenth staged pre-release on `feat/upgrade-protocol`. Surfaced by Go-on-RaspberryPi canary on 2026-04-29: a non-web project with 26 e2e TCs was blocked by `verify-complete`, and the in-product remediation suggested falsifying the TC `type` to bypass the gate — an honor-system patch contradicting Aitri's own validation philosophy. This release closes the immediate block; the broader runner-dispatch work is tracked as L1b in `BACKLOG.md` and deferred to P2 (no consumer is blocked once L1a is in).

**L1a — e2e gate accepts `status === 'manual'` as covered.** `lib/commands/verify.js::cmdVerifyComplete` e2e gate now treats a TC with `automation: "manual"` (recorded as `status: "manual"` by `verify-run`) as satisfying the gate, consistent with `ARTIFACTS.md:249` policy already applied to FR coverage. The previous behaviour required at least one e2e TC to `status: "pass"` from a Playwright run, leaving non-Playwright projects with a forced "lie about the schema" path.

**Stack-aware failure message.** When the gate does block, the message now branches on whether `playwright.config.{js,ts}` exists at the project root:
- **Playwright config present:** suggests `npx playwright install`, verifying `@aitri-tc` markers, and marking environment-bound TCs `automation: "manual"`.
- **No Playwright config:** explicitly states *"No e2e runner detected"* and offers three honest paths — install Playwright, mark `automation: "manual"`, or remove the TCs if they are not real requirements.
- **Both branches** end with: *"Do NOT change the TC type to bypass this gate — the type field describes intent, not runner availability."*

**What did not change.** The `e2eCount >= 2` Phase 3 rule stays — it asserts coverage breadth, not browser dependency. TC `type` schema (`unit | integration | e2e`) unchanged. No new schema fields, no `.aitri` migration, no artifact contract change. The failure message is the only operator-visible string change in this release.

**Tests added (4 new in `test/commands/verify.test.js`):** seed an e2e TC with each of the four states (skip+noPW, skip+PW, manual, pass) and assert (a) the gate fires only when expected, (b) the new advice block matches the runner detection, (c) the *"change their type"* phrase is gone from the no-PW path. Total suite: 1073 → 1077 passing, 0 failures.

**What this does NOT close.** L1b (auto-run e2e for non-Playwright runners — let `go test` / `pytest` output cover the e2e gate without `automation: "manual"`) and the `aitri tc mark-manual` CLI helper remain open in `BACKLOG.md`. With L1a in, neither is a blocker for any current consumer; both are quality-of-life. L2 (templates stop prescribing Playwright as the default e2e runner) also remains open and is independent.

**Why a bump and not a silent fix.** The e2e-gate failure message is an observable behavior change, and the gate's acceptance criterion (now treats `manual` as covered) directly affects whether `verify-complete` blocks. Per CLAUDE.md: visible behavior change → bump.

**Pre-stable status.** v2.0.0 stable promotion remains gated. Each external canary is still surfacing real defects (alpha.13 = Zombite Z1-Z5 yesterday; alpha.14 = Go-on-RPi web-bias today). Promotion deferred until ≥2 weeks pass without a canary-driven fix.

---

## [2.0.0-alpha.13] — 2026-04-29 — Zombite canary fixes (Z1-Z5)

Thirteenth staged pre-release on `feat/upgrade-protocol`. Five defects surfaced by Zombite canary on alpha.12 — third-project external canary, alpha.4 → alpha.12 upgrade. Each entry tracked as a self-contained backlog item (Z1-Z5 in `BACKLOG.md`); see backlog for full reproduction steps and decisions.

**Z1 (P1) — `verify-run` invalidates stale `verifyPassed`.** Re-running verify-run with degraded results (passed === 0 with skips, OR any failures) now resets `config.verifyPassed = false` and clears `verifySummary`. Healthy results untouched. Closes the deploy-gate lie where `validate` reported "ready" while latest verify-run was 0/0/N skipped. `lib/commands/verify.js::cmdVerifyRun` adds the reset before `saveConfig`.

**Z2 (P1) — `adopt --upgrade` backfills missing `artifactHashes`.** New STATE-MISSING migration in `from-0.1.65.js`: when approvedPhases is non-empty and artifactHashes is absent/empty, hash each approved artifact on disk and stamp the field. Idempotent (preserves existing entries). Per-phase `upgrade_migration` events. Closes silent drift-detection failure on Zombite root (alpha.4 baseline + approvedPhases populated + artifactHashes absent → `hasDrift()` always returned false).

**Z3 (P2) — `verify-complete` PIPELINE INSTRUCTION respects phase 5 state.** Replaced hardcoded "next: run-phase 5" with state-aware emission: phase 5 not approved → run-phase 5 (current behaviour); phase 5 approved (root) → `aitri validate`; phase 5 approved (feature) → no PIPELINE INSTRUCTION (feature pipelines do not deploy independently).

**Z4 (P2) — Phase 3 validate rejects duplicate TC ids.** `complete 3` now throws when `test_cases[]` contains repeated `id`s. Error message lists each duplicate with count (`TC-001 (×3)`). Closes the cardinality drift on Zombite's `stabilizacion` feature where `TC-STB-006h` appeared 6 times across 51 entries (46 unique), causing `summary.manual = 46` while `results.length = 51`.

**Z5 (P2) — `adopt --upgrade` flags legacy 04_TEST_RESULTS.json schema.** New VALIDATOR-GAP finding when `verifyPassed: true` and artifact lacks `results[]` and/or `summary` (pre-alpha `suite_summary` shape). Flag-only per backlog Option A — operator runs `aitri verify-run` to regenerate honestly. Cross-cuts with Z1: regenerated results may have degraded values; Z1 then resets `verifyPassed` consistently.

**Tests added (22 new in 3 files):** 4 in `test/commands/verify.test.js` (Z1 verify-run reset paths) + 4 in `test/commands/verify.test.js` (Z3 phase-5-state emission) + 7 in `test/upgrade.test.js` (Z2 artifactHashes backfill + idempotency + edge cases) + 5 in `test/upgrade.test.js` (Z5 legacy schema flagging) + 2 in `test/phases/phase3.test.js` (Z4 duplicate detection). Total suite: 1051 → 1073 passing, 0 failures.

**Why this is alpha.13, not five separate alphas.** Z1-Z5 surfaced in a single canary sweep, share the same root context (Zombite alpha.4 → alpha.12 upgrade), and several cross-cut: Z1 + Z5 together close the verifyPassed-lying-about-deploy-readiness loop; Z2 + Z3 + Z4 are independent but bundled to keep the canary-driven fix cohort together. Per CLAUDE.md: when a coherent set of fixes ships, one bump is fine — splitting would dilute the changelog signal.

**Pre-stable status:** v2.0.0 stable promotion remains gated. The streak-of-quietness counter resets — alpha.12 was 2026-04-29 morning, alpha.13 is 2026-04-29 afternoon. The canary protocol is working: each external sweep is finding real defects. Promotion deferred until ≥2 weeks pass without a canary-driven fix.

---

## [2.0.0-alpha.12] — 2026-04-29 — no-op verify-run loop guard in `resume`/`status`

Twelfth staged pre-release on `feat/upgrade-protocol`. Independent of the upgrade-protocol thread — surfaced by the same Ultron canary cycle but is a `lib/snapshot.js` fix, not an upgrade migration.

**The bug.** When Phase 4 was approved and verify had not passed, `nextPhaseAction` always recommended `aitri verify-run` regardless of what verify-run had already produced. A project that approved Phase 4 with skeleton tests, missing `@aitri-tc` markers, or a misconfigured runner would loop on identical no-op `verify-run` recommendations: run it, get 0 passed + 0 failed + N skipped, return to `resume`, get told to run it again. The actionable diagnostic ("All N test(s) are skipped — at least 1 must pass") lives in `verify-complete`, but `resume` never sent the operator there.

**Surfaced where.** Ultron's `network-monitoring` feature: Phase 4 manifest declares `technical_debt: skeleton-only — feature pipeline used as Aitri canary`, single test file with `t.Skip("canary skeleton")`, two `verify-run` events two days apart with identical 0/0/78 counts. `resume` kept pointing back at `verify-run`. Generalises to any project with the same shape — not Ultron-specific.

**Fix scope.** `lib/snapshot.js` only. The fix is at the root: the next-action ladder. No new schema field, no gate, no command. Prior layers (`complete 4` accepting honest skeleton manifest, `verify-run` reporting all-skip, `verify-complete` blocking with the diagnostic) all behave correctly — only the ladder routing was wrong.

**Code change:**

- `buildPipeline()` derives `verify.lastRunSummary` from the latest `verify-run` event in `config.events[]`. `verifySummary` is only persisted on `verify-complete` success; the ladder needs to know what `verify-run` produced even when verify-complete has not passed yet. Internal field — not exposed in `status --json` payload.
- `nextPhaseAction()` Phase-4-approved branch: when `lastRunSummary.passed === 0 && failed === 0 && skipped > 0`, return `aitri verify-complete` (severity `warn`, reason cites the skip count) instead of `aitri verify-run`. All other states (never ran, has failures, all-manual, mixed) remain on `verify-run`.
- Priority bucket: `isVerify` now matches `verify-run` OR `verify-complete`, keeping the new path at priority 5 (verify-stage) rather than dropping to 6 (ordinary phase work).

**Tests added (4 new in `test/snapshot.test.js`):**

- positive: Phase 4 approved + last verify-run was 0/0/78 skipped → action is `aitri verify-complete`, severity `warn`.
- negative: verify never ran → still `aitri verify-run`.
- negative: last run had failures → still `aitri verify-run` (re-run may help if flaky).
- negative: last run was all-manual (skipped === 0, manual > 0) → still `aitri verify-run`.
- feature scope: produces `aitri feature verify-complete <name>`.

**Consumer impact.** Hub-style readers that string-match the priority-5 command on `"verify-run"` may want to also recognise `"verify-complete"` at the same priority. Documented additively in `docs/integrations/CHANGELOG.md`.

**Why this is alpha.12, not a silent internal fix.** The recommended command in `nextActions[]` changed for an entire class of project states. Operators see a different command on the next `resume`. Per CLAUDE.md: when in doubt → bump.

---

## [2.0.0-alpha.11] — 2026-04-29 — `adopt --upgrade` skips cascade-stale phases (alpha.10 follow-up)

Eleventh staged pre-release on `feat/upgrade-protocol`. Tightens the alpha.10 fix after the Ultron canary against alpha.10 surfaced a third edge case the inference logic did not cover.

**Why a follow-up so quickly.** Velocity is intentional in this case, not vibe-coding: Ultron's canary halted at the dry-run for alpha.10 (correctly — operator-intent guarded) but the proposed report still showed phases 2/3/4 being marked completed. Investigation revealed alpha.10 only solved two of three real-world states. Shipping alpha.11 closes the gap before Ultron's actual upgrade — same canary protocol, no Ultron mutation reached state.

**The third edge case (alpha.11 closes):** events buffer non-empty AND phase has zero events of any kind. The alpha.10 `isInProgress` check looks for `started` without matching `completed`/`approved` — phases that have NO events at all return false. Falling through to the legacy artifact-on-disk inference is correct for projects upgrading from old Aitri (where the events buffer was never populated), but wrong for active projects where the absence-of-events signals "the cascade just removed this from `completedPhases` and the artifact on disk is stale."

**Real Ultron state that surfaced this:** `events[]` rich with phase-1 activity (cascade re-approval at 22:15-22:17 on Apr 27), zero entries for phases 2/3/4 (evicted or never recorded), artifacts for 2/3/4 still on disk from prior build, phase 5 rejected (Mar 18). Without alpha.11, the upgrade would have stamped 2/3/4 as completed, silently re-introducing what the cascade had cleared.

**Code change:**

- `lib/upgrade/index.js::hasNoEventHistory(events, phaseNum)` — new helper. Returns true when `events[]` is non-empty and the phase has zero events. Returns false when `events[]` is empty (legacy upgrade fallback unchanged).
- `inferCompletedPhases` consults this helper after `isRejected` and `isInProgress`. When it fires, the phase is added to `skipped[]` with reason `'no event history, possibly stale (not auto-completed)'`.
- The skip reason joins the existing `Preserved (operator action required)` group in the upgrade report. Operator guidance updated to mention that artifacts may be stale leftover from cascade and can be deleted before next upgrade if so.

**Tests added (4 new):**

- positive: `events[]` non-empty + phase has zero events + artifact on disk → phase NOT inferred.
- report: dry-run output surfaces "no event history" line under "Preserved (operator action required)".
- Ultron alpha.11 scenario: phase 1 with events, phases 2/3/4 with no events but artifacts on disk, phase 5 rejected — none auto-complete.
- Two existing alpha.10 tests updated to add an explicit `completed` event for phase 1 (the new rule applies to phase 1 too — without an event, it would also be preserved). The tests now exercise the alpha.10 and alpha.11 rules together more realistically.

**Schema docs.** Integration `CHANGELOG.md` updated; `ARTIFACTS.md` / `SCHEMA.md` / `STATUS_JSON.md` headers bumped. No reader contract change — `completedPhases` after upgrade is more accurate, never less.

**Files changed:** `package.json`, `bin/aitri.js`, `lib/upgrade/index.js`, `test/upgrade.test.js`, plus the four `docs/integrations/*.md` headers + integration `CHANGELOG.md` + this file. 1046 tests, 0 skipped.

**What this release does NOT do:** still does not re-canary Ultron. Operator runs `aitri adopt --upgrade --dry-run` against Ultron next; if the Preserved section now lists 2/3/4 + 5 + ux correctly (and proposes inferring nothing), proceed with the real run.

---

## [2.0.0-alpha.10] — 2026-04-29 — `adopt --upgrade` preserves operator intent

Tenth staged pre-release on `feat/upgrade-protocol`. Closes the single P1 surfaced by the Ultron canary against alpha.9 (BACKLOG: "Core — Ultron canary findings against alpha.9"). The canary halted at dry-run; no destructive run reached real Ultron state.

**The defect.** `aitri adopt --upgrade` infers `completedPhases` from on-disk artifacts. Two pre-existing operator-intent states were being silently overwritten:

1. `in_progress` — artifact written by `aitri run-phase` but never closed via `aitri complete`. Auto-completing it bypasses `validate()` on what may be a malformed artifact.
2. `rejections` — operator deliberately ran `aitri reject <phase> --feedback "…"`. Auto-completing it orphans the rejection record and corrupts the operator's deliberate "redo this" signal. ADR-027 §3 preserves approvals on upgrade by symmetry; rejections must follow the same rule.

Hub did not surface this in earlier canaries because Hub had no `in_progress` and no `rejections` at upgrade time. Ultron is the first project encountered with both.

**Code defects fixed:**

1. `lib/upgrade/index.js::inferCompletedPhases` — phase inference now skips a phase when `config.rejections[<num>]` exists, or when `config.events[]` shows a `started` event for the phase without a matching later `completed`/`approved`. The skip is reported with reason `rejected, not auto-completed` or `in progress, not auto-completed` accordingly.
2. `lib/upgrade/index.js::printReport` — the upgrade report (dry-run and real) gains a new `Preserved (operator action required)` section that surfaces these phases, with a pointer to `aitri complete` / `aitri approve` / re-run. The pre-existing `Already tracked (unchanged)` section is unchanged for already-approved/completed phases.
3. Legacy projects whose `events[]` buffer is empty (older versions, or events past the 20-entry cap) still infer from artifact presence — absence of a `started` event is not treated as evidence of in-progress, preserving the upgrade path for very old projects.

**Tests added (5 new in `test/upgrade.test.js`):**

- Phase with only a `started` event is NOT auto-completed (negative — the bug case).
- Phase with an entry in `config.rejections` is NOT auto-completed; rejection record survives upgrade. Round-trip via `cmdReject` per ADR-029.
- Full Ultron-canary scenario: `approvedPhases:[1]` + ux/2/3/4 in_progress + 5 rejected → `completedPhases` stays `[]`, `approvedPhases` stays `[1]`, both dry-run and real run print the "Preserved" section.
- Phase with `started` AND `completed` events still infers (positive — guards against over-firing the new detector).
- Empty `events[]` buffer still infers from artifact presence (legacy upgrade path — guards against regressing very old projects).

**No subproduct migration needed.** Hub already tolerates phases being absent from `completedPhases`. The change makes `config.completedPhases` *more accurate* after upgrade, never less.

**Canary plan:** alpha.10 is canareed against Ultron (the project that surfaced the defect). Hub remains pinned at alpha.4 by deliberate decision unless a Hub-specific signal emerges.

---

## [2.0.0-alpha.9] — 2026-04-28 — round-trip fixes from audit + canary + diagnosis

Ninth staged pre-release on `feat/upgrade-protocol`. Closes six defects surfaced by the audit (4) + Hub canary diagnosis (2). All accepted as `FIX-IN-ALPHA` per the audit triage; none required `BLOCKER-2.0` carve-outs except via straightforward code changes. 1038 tests pass, zero skipped, zero todo.

**Process note.** This release follows the audit + canary + diagnosis sequence the user ran against alpha.8 — the first time alpha.X has been gated by external review rather than internal canary alone. Hub remains pinned at alpha.4 by deliberate decision: the actual `aitri adopt --upgrade` against Hub is the canary action for alpha.9, not alpha.8.

**Code defects fixed:**

1. `lib/upgrade/index.js` — dry-run `--upgrade` no longer claims "would be a no-op" when the version string would change. The user-facing message now reads "only the version string would change" without the contradictory no-op line; the no-op line still fires when the upgrade is genuinely a no-op (no migrations, no version bump, no inferences). Source: diagnostic session against the alpha.8 canary on Hub.

2. `lib/commands/status.js` — text renderer surfaces `health.deployable` next to the phase table. Previously the per-phase line `✅ deploy Deployment Approved` (Phase 5 pipeline status) was the only deploy-related signal, which a user could misread as "ready to ship" when the composite deploy gate was actually blocked (e.g. by version mismatch). Now a dedicated `❌ deployable Deploy readiness Not ready — N blocker(s)` line appears whenever any phase has progress and `health.deployable === false`. Mirrors what `aitri resume` already did. Source: diagnostic session against the alpha.8 canary.

3. `lib/state.js` — `loadConfig` and `saveConfig` canonicalise numeric phase strings (`"1"`) back to numbers (`1`) in `approvedPhases`, `completedPhases`, and `driftPhases`. Alias keys (`"ux"`, `"discovery"`, `"review"`) are preserved verbatim. Closes the BACKLOG entry "P2 — Approve UX next-action routes to `requirements` instead of `architecture` when Phase 1 is already approved" (Ultron canary alpha.6). Defence in depth: regardless of which write-path produced a stray string, downstream `Set.has(<number>)` and alias matches now work consistently.

4. `lib/commands/verify.js` — `aitri feature verify-run` now spawns the test runner with `cwd: dir` (the feature subdirectory) instead of `cwd: featureRoot || dir` (the parent project root). Previously, feature `verify-run` ran tests from the parent — the alpha.6 canary saw 52 of 78 skipped tests come from the parent rather than the feature pipeline. Test runners that walk up from cwd to find `package.json` / config still resolve correctly; what changes is that test discovery is now scoped to the feature.

5. `lib/phases/phase3.js` — `requirement_id` on a TC now accepts NFR ids (`NFR-xxx`) when the NFR is declared in `01_REQUIREMENTS.json::non_functional_requirements[]`. Previously the gate rejected NFR-* outright with the message "Non-functional requirements cannot be TC targets — test coverage flows through FRs", forcing the agent to either invent an FR wrapper or misclassify the requirement (canary 2026-04-28: 14 TCs reassigned by hand). NFRs are testable (perf, security, accessibility) and now treated as first-class TC targets. Briefing (`templates/phases/tests.md`) updated to match.

6. `lib/phases/phase4.js` — `setup_commands` and `environment_variables` in `04_IMPLEMENTATION_MANIFEST.json` are now optional. Absent ≡ `[]`; when present, must be an array. Per-entry shape lives in the briefing (`templates/phases/build.md`), not in the validator — this avoids re-creating the drift the alpha.7 canary exposed (briefing said `[]` was OK; validator required keys present). Round-trip aligned per ADR-029.

**Tests added (15 new):**

- `test/upgrade.test.js` — dry-run with version bump must NOT claim "no-op" (positive); dry-run on already-current project still says "no-op" (negative).
- `test/commands/status.test.js` — text status surfaces `deployable Not ready` when blocked (positive); does not advertise deployable on fresh project (negative).
- `test/state.test.js` — phase-key canonicalisation (4 tests covering `approvedPhases`, `completedPhases`, `driftPhases`, alias preservation).
- `test/commands/approve.test.js` — UX → architecture routing remains correct even when `approvedPhases` on disk is `["1"]` (string).
- `test/commands/verify.test.js` — feature `verify-run` spawn cwd equals feature dir, not parent (full integration test with a real runner script).
- `test/phases/phase3.test.js` — NFR ids accepted when declared (positive); undeclared NFR ids still rejected (negative).
- `test/phases/phase4.test.js` — setup_commands absent / explicitly empty / wrong type (3 cases).

**Schema docs.** `docs/integrations/ARTIFACTS.md` updated to reflect the actual stored shape of `environment_variables` (array of objects, not bare object — the doc had drifted from `lib/phases/phase4.js validate()` and from `templates/phases/build.md`). The integration CHANGELOG carries the same set of changes with the consumer-facing framing.

**What this release does NOT do:**

- It does NOT re-canary Hub. Hub remains pinned at alpha.4. The actual `aitri adopt --upgrade` against Hub will produce a clean version pin → alpha.9 — that is the canary action for the next decision point.
- It does NOT change cadence policy. The audit's recommendation to require an external canary citation in every alpha release commit is a process change, not a code change; it lives in the conversation, not in the codebase.
- It does NOT address the third canary gate (BLOCKER-2.0 from the audit). Identifying a non-Hub, non-author project remains open and is what gates v2.0 stable, not alpha.X.

**Files changed:** `package.json`, `bin/aitri.js`, `lib/upgrade/index.js`, `lib/commands/status.js`, `lib/state.js`, `lib/commands/verify.js`, `lib/phases/phase3.js`, `lib/phases/phase4.js`, `templates/phases/tests.md`, `templates/phases/build.md`, plus the four `docs/integrations/*.md` headers + the integration `CHANGELOG.md` + this file. 7 test files updated.

---

## [2.0.0-alpha.8] — 2026-04-28 — Go test runner output parser

Eighth staged pre-release on `feat/upgrade-protocol`. Closes the highest-impact gap surfaced by the Ultron canary on alpha.7 (BACKLOG entry "P2 — Go runner output not parsed by `aitri verify-run`"). Scope deliberately minimal: only the Go parser + the `-v` warning + template documentation. Other alpha.7 canary findings (manifest schema drift, verify-run scope contamination, stale-briefing post-upgrade, `--cmd` flag in feature) remain in BACKLOG.

**New parser.** `lib/commands/verify.js::parseGoOutput()` consumes `go test -v` output and emits the same `Map<tc_id, { status, notes }>` shape as the four existing parsers (Vitest, Pytest, Playwright, node:test/mocha/TAP). Routing follows the same fallback pattern: trigger when `runnerHint` matches `\bgo\s+test\b` or when no other parser detected anything.

**Coherence by reuse.** The parser delegates TC-id normalization to the existing `extractTCId()` helper at [verify.js:30](../../lib/commands/verify.js#L30) — the same regex that handles Vitest/Pytest/Playwright. Go test names like `TestTC_NM_001h` have the `Test` prefix stripped, and `extractTCId()` then converts the underscore separator to canonical `TC-NM-001h`. No new normalization logic; one source of truth preserved.

**Subtests excluded by construction.** Go's verbose output uses 4-space indentation for subtest results (`    --- PASS: TestX/SubY (...)`). The parser's regex anchor `^---` (column 0) excludes them. Additionally, the captured test-name char class `[A-Za-z0-9_]+` does not allow `/`, so subtest paths cannot pass even if they reached the parser. Two safeguards. Top-level test reports its own verdict (FAIL when any subtest fails) — that is the level Aitri tracks.

**`-v` warning.** When `runnerHint` matches `go test` but lacks `-v`, verify-run emits a stderr warning: passes are silent in non-verbose Go output, so verify-complete would block on 0 detected passes without an actionable hint. Warning surfaces the gap before the block.

**No regressions.** Audit verified before implementation:
- `parseGoOutput` does not false-match outputs from Vitest / Pytest / Playwright / node:test (none use `^--- (PASS|FAIL|SKIP):` at column 0 with `Test` prefix).
- The four existing parsers do not false-match Go output (different markers).
- `extractTCId` filters non-TC test names (`TestPlainNoMarker`, `TestTCPConnection`) by its negative-lookbehind + `[-_]` separator requirement.
- Phase 3 `validate()` has no regex constraint on TC-id format; canonical `TC-NM-001h` written into `03_TEST_CASES.json` is accepted regardless of the test-file syntax (`_` in Go vs `-` in markdown).

**Test coverage.** +11 tests in `test/commands/verify.test.js` covering: pass/fail/skip detection, underscore-to-dash normalization (single + namespaced), assertion-context capture for FAIL, parent-with-subtests behavior, subtest exclusion, non-TC test rejection, non-verbose output handling, isolation from other parsers (Go vs them, them vs Go).

**Fixture is real, not synthetic.** Captured from a live `go test -v` run on 2026-04-28 in `/tmp/aitri-go-fixture` — covers the exact patterns Go's runner emits. Per ADR-029: tests assert that the parser produces what the consumer (verify-run aggregation) needs, not what the test author designed.

**Documentation propagated.** `templates/phases/build.md` runner-detection list and `templates/phases/tests.md` naming-convention rules now describe Go alongside the four other runners. Convention: `func TestTC_NS_NNN<suffix>(t *testing.T)` with `Test` prefix mandatory and `-v` flag required for pass detection.

**Subproduct impact: additive.** No schema change, no `.aitri` field change, no breaking reader contract. Hub readers see no difference. Documented in `docs/integrations/CHANGELOG.md` with `— additive` marker.

**Out of scope (still in BACKLOG):**
- P2 manifest schema drift between briefing and validator
- P2 verify-run runs from project root (parent test contamination)
- P3 upgrade banner for stale briefings
- P3 `aitri feature verify-run --cmd` flag wiring
- P2 approve ux next-action routing to requirements when Phase 1 is approved
- P3 `aitri feature list` from sub-directories
- P3 Phase 3 validator NFR-* support

These are independent, none destructive, none blocked by alpha.8.

---

## [2.0.0-alpha.7] — 2026-04-27 — scope grammar correction (alpha.6 regression fix)

Seventh staged pre-release on `feat/upgrade-protocol`. Fixes the regression introduced by alpha.6 — same root bug class as the bug alpha.6 was meant to close, just at a different layer.

**What alpha.6 got wrong.** alpha.6 introduced `commandPrefix(featureRoot, scopeName) → 'feature <name> '` placed before the verb, producing strings like `aitri feature network-monitoring complete ux`. This passed every internal test and looked plausible — but `feature.js` parses the first token after `feature` as the **verb**, not the name. Literal copy-paste of any emitted command produced `❌ Feature "complete" not found`.

**Ultron canary 2026-04-27 caught it at handoff #1.** 8/8 handoffs through Phases UX → architecture → tests → build (briefing only) confirmed the pattern was universal: original destructive bug closed (paths feature-correct, no scope-less commands surviving) but every emitted command was grammatically broken under literal execution. Internal tests missed it because they asserted "the output matches the string I designed" instead of "the output parses through feature.js".

**alpha.7 fix.** Replace `commandPrefix(...) → string` with `scopeTokens(...) → { verb, arg }`. The verb prefix (`'feature '`) is spliced before the verb token; the arg suffix (`' <name>'`) after it. Templates expose two placeholders `{{SCOPE_VERB}}` and `{{SCOPE_ARG}}` instead of one. Result: `aitri ${sv}complete${sa} 1` produces `aitri complete 1` (root) or `aitri feature complete <name> 1` (feature) — matching the actual CLI grammar in `feature.js`.

**Round-trip test added.** New `test/scope.test.js` block extracts every `aitri feature <X> <Y>` pattern from a representative output stream and verifies `<X>` is one of the verbs `feature.js` actually routes (`run-phase`, `complete`, `approve`, `reject`, `verify-run`, `verify-complete`, `rehash`, `status`). If the alpha.6 wrong order ever creeps back, this test fails on the first occurrence — no more "wait for the canary".

**Test coverage.** +2 tests vs alpha.6 (1014/1014 green). Existing feature-context assertions in `approve.test.js` / `complete.test.js` / `reject.test.js` / `verify.test.js` / `phaseUX.test.js` were updated to match the corrected grammar.

**Subproduct impact: none.** Same as alpha.6 — display-only fix on the human terminal surface.

**Three secondary findings** from the same canary registered in BACKLOG (not fixed in alpha.7):
1. After `approve ux`, next-action emits `run-phase requirements` instead of `architecture` even when Phase 1 is approved. P2.
2. `aitri feature list` returns "No features" when run from a sub-directory of the project. P3.
3. Phase 3 validator rejects `requirement_id: NFR-XXX` even though `type_coverage_matrix` accepts NFR keys. P3.

---

## [2.0.0-alpha.6] — 2026-04-27 — scope-aware command emission across CLI + phase templates (REGRESSION — see alpha.7)

Sixth staged pre-release on `feat/upgrade-protocol`. Closes the destructive-risk bug surfaced by Ultron canary 2026-04-27 mid-feature: the `aitri feature approve <name> requirements` post-action banner emitted `PIPELINE INSTRUCTION ... aitri run-phase ux`, directing the agent to overwrite the parent project's already-approved `01_UX_SPEC.md`. The user paused before saving; the literal command would have clobbered an approved root artifact with feature-scope content.

**Root cause.** `cmdApprove` and siblings (`cmdComplete`, `cmdReject`, `cmdVerifyRun`, `cmdVerifyComplete`) destructured only `{ dir, args, err }` and silently dropped the `featureRoot` field that `feature.js` was passing in `featureCtx`. Without it, every emitted command was scope-blind — it always printed root-style strings even when running inside a feature dispatch. Same defect class affected the 11 phase templates in `templates/phases/*.md`, which hardcoded `Run: aitri complete X` / `Next: aitri complete X → aitri approve X` without any scope variable.

**Fix.** New `lib/scope.js::commandPrefix(featureRoot, scopeName)` is the single source of truth — returns `''` for root context or `feature <name> ` (with trailing space) for feature context. Threaded through approve / complete / reject / run-phase / verify-run / verify-complete. Phase modules now accept `scopePrefix` and pass it as `{{SCOPE_PREFIX}}` to their templates. The 11 templates were rewritten to use `aitri {{SCOPE_PREFIX}}<verb> <phase>` in every instruction line. Reference text describing tools generically (e.g. `the type field is how aitri counts E2E tests`) was left untouched.

**Why Phase 1 hid the bug pre-alpha.6.** Phase 1 in a feature works because `aitri run-phase 1` is blocked at root by the "all core phases approved" gate. UX is in `OPTIONAL_PHASES` and the gate doesn't apply, so the scope-blind `aitri run-phase ux` instruction was followed without resistance. The other phases were one canary away from the same exposure.

**Test coverage.** +19 tests (1012/1012 green). New `test/scope.test.js` covers the helper. `test/commands/approve.test.js` covers all five PIPELINE INSTRUCTION branches under feature context (Phase 1 → architecture, Phase 1 → UX with visual FRs, Phase 4 → verify-run, UX → architecture, root regression guard). `test/commands/complete.test.js`, `test/commands/reject.test.js`, `test/commands/verify.test.js` carry parity assertions for their command emissions. `test/phases/phaseUX.test.js` asserts `{{SCOPE_PREFIX}}` substitution in both feature and root scopes.

**Subproduct impact: none.** No schema change, no `.aitri` field change, no `status --json` change. Display-only fix on the human terminal surface — the Hub contract is untouched.

**Workaround for v2.0.0-alpha.5 and earlier (still applicable to deployed copies):** never trust the literal command in PIPELINE INSTRUCTION when running a feature pipeline. Always prepend `feature <name> ` to whatever Aitri printed.

---

## [2.0.0-alpha.5] — 2026-04-27 — verify counts display: three-bucket breakdown (H5)

Fifth staged pre-release on `feat/upgrade-protocol`. Display-only fix for the visual dissonance between `verify ✅` and `(passed/total)` confirmed across three canaries on alpha.4 (Zombite 4%, Hub 70-84%, Cesar 66-100%).

**Three-bucket count format.** `verify ✅ (37/53)` becomes `verify ✅ (37 ✓ 0 ✗ 16 ⊘)` — passed / failed / deferred (skipped + manual). The verdict badge (`✅ / ❌ / ⬜`) keeps its meaning; the inner counts now describe coverage breadth without looking like a passing rate. Same treatment for `verify ❌` and the aggregated Σ line. Single source of truth: `lib/verify-display.js::formatVerifyCounts()`. Applied to `status`, `resume`, `validate`.

**Why the old format misled.** `(passed/total)` where `total = passed + failed + skipped + manual` looked like a low passing rate when most TCs were skipped (no marker) or manual. `verify ✅` is set by `verify-complete` after confirming every MUST FR has ≥1 passing test and no critical/high bugs are open — the badge is correct, but a reader scanning `verify ✅ (2/51)` reasonably concluded the project was broken.

**H7 discarded.** The proposed rehash hint in `resume`'s "Re-approved After Drift" section was redundant with A5b (alpha.3): post-event the hashes already match, so `rehash` is a no-op there. The equivalent hint at fresh-drift time already lives in `approve`. Documented in FEEDBACK.md history.

**Subproduct impact:** none. `status --json` schema unchanged (`verify.summary` still carries `{ passed, failed, skipped, manual, total }`); only the text rendering changed.

**Test coverage.** Two existing assertions updated in `test/commands/status.test.js` and `test/commands/validate.test.js` to match the new format. No new test infrastructure — formatter is a pure function exercised through the existing display tests.

---

## [2.0.0-alpha.4] — 2026-04-27 — `aitri normalize` allowlist (Ultron canary fix)

Fourth staged pre-release on `feat/upgrade-protocol`. Closes the proportionality bug (N1 from BACKLOG entry "Core — `aitri normalize` proportionality") reported by the Ultron canary 2026-04-27.

**Behavioral allowlist for off-pipeline drift detection.** `aitri normalize`, `aitri status`, and `status --json` no longer treat build/dependency manifests (`go.mod`, `package.json`, lockfiles), documentation (`*.md`, `LICENSE`, `CONTRIBUTING`), dotfiles (`.env*`, `.gitignore`), CI/infra files (`Dockerfile*`, `Makefile*`, `.github/**`), and generated assets (`*.min.js`, `/dist/**`, `/build/**`) as off-pipeline drift. Single source of truth: `lib/normalize-patterns.js::isBehavioralFile()`.

**The cycle that motivated this.** Ultron's git history contains three previous workaround commits — `9b68709 chore: advance aitri normalize baseline to current HEAD`, `0e6786a chore: advance aitri normalize baseline past CSS regeneration commit`, `35a9a95 chore: advance aitri normalize baseline past PR #1` — each manually compensating for the same broken contract. Most recent trigger: a one-line `go.mod` toolchain bump from 1.25.5 → 1.25.9 (CVE fix) caused the full normalize ceremony: 70,390-byte Senior Code Reviewer briefing + forced `verify-run` (45 tests) + TTY-gated confirmation. After this fix, the same diff produces zero off-pipeline-drift signal.

**Test coverage.** +31 tests (993/993 green). `test/normalize-patterns.test.js` (new file) covers the allowlist semantics across build manifests, docs, dotfiles, CI configs, and generated assets, with an explicit Ultron regression case. Integration tests added to `test/snapshot.test.js::detectUncountedChanges()` and `test/commands/normalize.test.js`.

**Honest scope.** Ships N1 only. N2 (briefing scope reduced from full-spec embedding to per-file diff + cross-ref) and N3 (`verify-complete` priority ladder unified with `aitri status` snapshot) deferred to a later alpha — N1 may absorb the perceived friction by itself, in which case N2/N3 become optional polish. Will reassess after Ultron canary on alpha.4.

**Subproduct impact:** additive. Hub readers see lower `health.uncountedFiles` counts on projects with documentation/build-manifest churn, and fewer priority-4 `aitri normalize` next-actions. No schema field changes, no event log additions.

---

## [2.0.0-alpha.3] — 2026-04-24 — upgrade findings persistence + `aitri rehash`

Third staged pre-release on `feat/upgrade-protocol`. Closes the three findings from the three-canary session (Hub, Ultron, Zombite) — with honest scope corrections against the earlier alpha.2 proposal.

**A1 — `.aitri.upgradeFindings[]` (persist flagged upgrade work).** Previously the flags from `adopt --upgrade` only lived in the report output and scrolled past. Now they survive in `.aitri` and drive a priority-3 next-action per pipeline until the agent re-authors the flagged items and a subsequent upgrade run produces no findings. Snapshot model — overwritten each run, cleared automatically. `resume` (brief) renders a warning section; `status` text renders a count line. Found on Ultron canary (8 flags lost to scroll).

**A5 — `aitri rehash <phase>` (+ `aitri feature rehash <name> <phase>`).** New command for the exact case Zombite surfaced: a legacy hash mismatch where the artifact's current content matches its committed state but the stored hash is from an older Aitri version (hash algorithm change, commit that touched the artifact without going through `approve`). Re-approving to fix the bookkeeping cascades invalidation to every downstream phase — on Zombite, that was 8 extra `complete + approve` operations just to fix a stale hash. `rehash` updates the hash in place, preserves approval state, appends a `rehash` event. Guardrails: refuses when the phase was never approved, no-ops when hashes match, refuses when git is unavailable or the artifact has uncommitted changes (that's real drift — `approve` is the right tool there). `isTTY`-gated: agents cannot auto-rehash.

**A5b — `approve` drift prompt hints at `rehash`.** When drift is detected and `git diff HEAD` shows the artifact has no uncommitted changes, the re-approval prompt now surfaces `aitri rehash <phase>` as the right alternative. Default flow preserved for cases where the operator genuinely wants to re-approve (and accept cascade).

**A3 — Upgrade banner message clarified.** `"Already current"` was ambiguous when the header showed a version bump (schema was current, version was not). New message: `"Schema already on canonical shape — only the version string will change"` when version is bumping on a no-migration run.

**Test coverage.** +16 tests. Upgrade: persistence (A1), snapshot rendering (A1), resume + status rendering (A1), dry-run preserves non-mutation (A1). Rehash: refusal gates (no stored hash, hashes match, git unavailable, uncommitted changes, non-TTY), post-gate write simulation. Total 961/961 green.

**Honest scope correction vs the alpha.2 proposal.** A2 (features sub-pipelines upgrade) was proposed for alpha.3 but deferred. After implementing A1 + A5, recursing `adopt --upgrade` across features became clearly out-of-scope for a point release — it requires a redesign of how the protocol discovers pipelines and whether upgrade mixes per-scope migrations. Remains open in BACKLOG for v2.0.0 pre-stable or v2.0.1. Evidence (Zombite's untouched feature) still stands.

**Canary protocol observed.** The three-project canary (Hub, Ultron, Zombite) now covers: (a) clean project (Hub), (b) modern drift (Ultron, flagged semantics), (c) legacy drift (Zombite, hash mismatch). Catalog of cases the protocol handles grows; explicitly NOT broadened to include Zombite-specific hash-algo drift migration (no evidence a second project needs that migration — A5 `rehash` is the escape hatch, not a migration).

---

## [2.0.0-alpha.2] — 2026-04-24 — operator ergonomics + `.aitri` contract doc

Second staged pre-release on `feat/upgrade-protocol`. No schema changes; closes the three deferred items surfaced during the post-canary review.

**Operator ergonomics:**
- **`aitri adopt --upgrade --dry-run`** — safety infrastructure for the reconciliation protocol. Runs `diagnose()` across every migration module and prints the report with a `(DRY-RUN — no changes written)` banner and `◻️` markers. No artifact writes, no `.aitri` mutation, no `upgrade_migration` events, no agent-files regeneration. Canaries on Ultron and Hub had to simulate dry-run via manual tar-copy to `/tmp/` — the friction was evidence.
- **`aitri resume` — brief default + `--full` flag.** The primary entry-point command previously dumped 200+ lines on every invocation (architecture excerpt + every FR + every AC + per-FR test coverage + technical debt), most of which already lives in on-disk artifacts. Default now keeps the "what's next?" signal (Pipeline State, Last Session, Open Bugs, Health, Next Action); `--full` restores the reference sections on demand.
- **Terminal-state next-action.** When the project is deployable AND audit is fresh AND verify is not stale, `nextActions` no longer includes P7 `aitri validate`. Consumers render "project is idle" instead of a reflexive suggestion to re-validate what just passed.

**Contract documentation:**
- **SCHEMA.md §"Should `.aitri` be committed?"** — resolves the Hub-canary H3 observation. Explicit recommendation (commit it), documented consequences of gitignoring, and explicit acknowledgement that the schema mixes shared state and per-machine state in one file. The underlying tension (single-file mix) is tracked as [ADR-028](DECISIONS.md#adr-028--2026-04-24--open-question-aitri-mixes-shared-and-per-machine-state) — open question, no code action until a second real signal.

**Test coverage.** +21 tests covering dry-run semantics (no writes, no events, no version bump, no agent-files regeneration, banner present, `migrateAll({ dryRun })` parity with real migrate), resume brief/full split (reference sections gated, footer hint, full restores everything), and terminal-state priority suppression (deployable + fresh audit + fresh verify → no P7; stale/missing audit or stale verify still fires P7). Total 945/945 green.

**Deferred items NOT in alpha.2:** CLI flags `--yes` / `--only` / `--verbose` (no adopter asked), Corte E preventive migrations (no evidence), `test/upgrade-coverage.test.js` gate (ADR-027 §5 standing decision), E2E smoke for upgrade (unit tests + two canaries cover the current shape). Third-project canary remains the promotion gate to stable v2.0.0.

---

## [2.0.0-alpha.1] — 2026-04-24 — `adopt --upgrade` as reconciliation protocol (staged pre-release)

Staged first pre-release on branch `feat/upgrade-protocol` (not merged to main). Governed by [ADR-027](DECISIONS.md#adr-027--2026-04-23--adopt---upgrade-as-reconciliation-protocol-v200).

`adopt --upgrade` now implements the five-phase reconciliation protocol: **diagnose → plan → confirm → migrate → report**. Replaces the pre-v2 stub that only bumped `aitriVersion` and inferred completed phases. Versioned migration modules in `lib/upgrade/migrations/` encode the deltas between Aitri versions.

**Scope of alpha.1:**
- `lib/upgrade/` module with `runUpgrade`, `diagnose`, and `migrateAll` composer.
- First migration module `lib/upgrade/migrations/from-0.1.65.js` covering the Ultron baseline:
  - **BLOCKING:** `test_cases[].requirement` → `requirement_id`; `non_functional_requirements[].{title, constraint}` → `{category, requirement}` (mechanical, shape-only).
  - **STATE-MISSING:** backfills for `updatedAt`, `lastSession`, `verifyRanAt`, `auditLastAt`, `normalizeState`.
  - **VALIDATOR-GAP** (report-only): v0.1.82 title vagueness + duplicate AC detection.
- **Option B fix:** shape-only migrations preserve `artifactHashes[phase]` to avoid post-upgrade drift on approved phases (discovered by Ultron canary).
- **Clean-project UX:** when nothing migrates, a single `✅ Project is already current` line replaces the noisy "Already tracked" list (discovered by Hub canary).
- New event type `.aitri.events[].upgrade_migration` in the event log (additive; Hub readers tolerate unknown types per integration contract).
- `lib/phases/phase1-checks.js` — shared source of truth for the v0.1.82 vagueness regexes, consumed by both `phase1.js::validate()` and the VALIDATOR-GAP reporter.

**ADR-027 addendum (binding invariants):** §1 no transactional rollback — ordered writes + aitriVersion last + recovery message on mid-run failure. §2 migrations transform shape, never meaning; semantic content flagged for agent. §3 clean replacement of legacy `adoptUpgrade` body; single entry point in `lib/upgrade/`. §4 shape-only migrations preserve approval via `artifactHashes[phase]` update. §5 `test/upgrade-coverage.test.js` gate NOT implemented — doc discipline + real-project canary carry the load.

**v0.1.90 defensive layers kept.** Reader tolerance (snapshot NFR/FR fallbacks), `verify-run` precondition, `normalize --init`, honest messages — all stay as the fallback for cases where the upgrade protocol did not run.

**Canaries.** Two real brownfield projects: Ultron (v0.1.89 → v0.1.90, drift present — 16 TC renames + 4 NFR rewrites + normalizeState stamp) and Aitri Hub (v0.1.89 → v0.1.90, already current — zero migrations, clean status post-run). Catalog remains founded on Ultron; Hub validated the "no invasion on clean projects" property. Third-project canary (external adopter) will inform whether to broaden the catalog before promoting to stable v2.0.0.

**Not included (by decision):** `test/upgrade-coverage.test.js` gate (§5 of addendum); Corte E (CAPABILITY-NEW + STRUCTURE migrations deferred pending evidence); breaking changes originally batched with v2.0.0 (IDEA.md → spec/ move; canonical TC id regex) — both removed from batch per session 2026-04-23 decision.

**Distribution.** Pre-release on the feature branch. `npm i -g .` on this branch installs locally for testing. Not published, not tagged to main, not merged to main. Promote to stable only after a third brownfield canary surfaces no new drift class, or after evidence motivates catalog expansion.

---

## [0.1.90] — 2026-04-23

Brownfield-integrity pass driven by the 2026-04-22 Ultron E2E session. Focused on data-destruction bugs and escape hatches for projects adopted before v0.1.80 — the class of drift that only appears on real adopters, not on Aitri's own test fixtures.

- **fix(verify-run) — A2 [HIGH]:** schema precondition in [lib/commands/verify.js](lib/commands/verify.js) blocks the runner before it spawns when `03_TEST_CASES.json` uses the legacy `requirement` field without `requirement_id` or `frs`. Previously `buildFRCoverage` silently produced an all-zeros coverage and overwrote `04_TEST_RESULTS.json` — only recoverable via `git checkout`. Error now names the legacy field, the offending file path, and the migration recipe. The test asserts byte-for-byte that the pre-existing results file is preserved when the precondition fires.
- **feat(verify) — multi-FR TCs:** `buildFRCoverage` accepts `tc.frs: string[]` as an alternative to `requirement_id`. When both present, `frs` wins. Additive; single-FR schema unchanged.
- **fix(snapshot) — A1:** tolerant NFR/FR renderer. `openNFRs` falls back to legacy `{title, constraint}` when `{category, requirement}` are absent; `openFRs.type` surfaces as `null` when missing. `aitri resume` stops printing `(must-have, undefined): undefined` for pre-v0.1.x schemas.
- **fix(resume) — A1/F9:** FR/NFR lines skip empty metadata gracefully — no trailing `()` or dangling commas.
- **feat(normalize) — A4:** `aitri normalize --init` stamps a baseline at current state for projects whose Phase 4 was approved before v0.1.80 (when `normalizeState` was introduced). Preconditions: Phase 4 approved + no existing `normalizeState`. Uses git HEAD if repo, ISO timestamp otherwise. `normalize` without baseline now hints at `--init` when it detects the brownfield case.
- **fix(adopt --upgrade) — A3:** version-mismatch message in [resume.js](lib/commands/resume.js) rewritten to be honest about what upgrade does (bumps version, infers completed phases from artifacts) and what it does NOT (migrate artifact schemas, re-verify). Points at `normalize --init` for brownfield drift baselining.
- **fix(resume) — F1:** Pipeline State block now carries an inline `**Deployable:** ❌ Not ready / ✅ Ready` line next to the phase table. A reader skimming ✅✅✅✅✅ can no longer miss that deploy is blocked by version-mismatch, stale audit, open bug, etc.
- **fix(validate) — A5:** Dockerfile/docker-compose.yml are no longer treated as "required". `validate` lists deployment files that exist, and when none exist prints a neutral hint about non-containerized targets (systemd, lambda, Pi, etc.). The `--json` `deployFiles` shape is unchanged — contract preserved.
- **feat(bug) — F6/F12 audit trail:** `aitri bug fix` captures `fix_commit_sha` + `fix_at` automatically; `aitri bug close` captures `close_commit_sha` + `close_at` + `files_changed[]` (diff `fix..close`, excludes `spec/` and `.aitri`). Non-git projects keep working silently without these fields. First non-honor-system signal on the bug lifecycle.
- **fix(adopt) — F13:** `adopt --upgrade` prints a short block on the generated agent instruction files (`CLAUDE.md`, `GEMINI.md`, `.codex/instructions.md`) with recommended treatment.
- **test(validate) — F2 regression lock:** added a regression test asserting that `validate` defers to `health.deployable` (which already includes `blocking_bugs`) — no more "ready to ship" while `status` says "resolve open critical bug". The divergence in the FEEDBACK was stale against `main`; the test prevents it from coming back.
- **schema — all additive (v0.1.90+):** `03_TEST_CASES.json.test_cases[].frs: string[]` (optional); BUGS.json bug entries gain optional `fix_commit_sha`, `fix_at`, `close_commit_sha`, `close_at`, `files_changed`. No type changes, no removals.
- **docs:** `docs/integrations/ARTIFACTS.md` and `docs/integrations/CHANGELOG.md` updated in the same pass with schema extensions + subproduct impact notes. Integration doc headers bumped to `v0.1.90+` (release-sync gate).
- **tests:** +22 cases across 7 files. Total: 882 passing, 0 failing.
- **scope decisions (not shipped):**
  - No auto-stamp of `normalizeState` inside `adopt --upgrade` — hidden state writes contradict the traceability principle. `--init` is explicit on purpose.
  - No `--verified-by` gate on `bug verify` (FEEDBACK F6 option) — forces content-judgment on Aitri, which is what the passive-producer model deliberately delegates to the agent. SHA capture is artifact-level and compatible; the gate is not.
  - No git consultation in `aitri status` (FEEDBACK F14) — would cross the artifacts-are-SSoT boundary. Residual concerns already covered by `normalize` + bug close SHA + `verifyRanAt` staleness.
  - F8 (resume brief default) and F11 (terminal "stable" priority) deferred — preference-flavored, based on a single session. Will revisit with a second data point.

---

## [0.1.89] — 2026-04-22

- **feat(phase1):** Phase 1 re-runs now use `01_REQUIREMENTS.json` as the SSoT input instead of re-reading IDEA.md. Closes a real drift class where re-runs silently pruned FRs that legitimately grew past the original brief — agents would obey the constraint *"never invent requirements not implied by IDEA.md"* and quietly delete CSV-export, categories, notifications, etc. that were added between approvals. Re-runs now refine current FRs; first run still uses IDEA.md.
- **feat(approve):** First `aitri approve 1` archives `IDEA.md` content into `01_REQUIREMENTS.json.original_brief` (new optional field) and removes `IDEA.md` from disk. Once 01_REQUIREMENTS.json is the canonical artifact, IDEA.md cannot drift against it because it no longer exists as a live input. The seed text is preserved verbatim for human recovery.
- **api:** New optional artifact field `01_REQUIREMENTS.json.original_brief` (string). Additive — old readers (Hub, etc.) ignore unknown fields. Full schema doc + Phase 1 input handling section in `docs/integrations/ARTIFACTS.md`.
- **feat(feature):** `aitri feature run-phase <name> 1` now materializes `FEATURE_IDEA.md → IDEA.md` only when the feature has no `01_REQUIREMENTS.json` yet — same SSoT model per feature sub-pipeline.
- **personas:** `pm.js` constraint relaxed from absolute "never invent beyond IDEA.md" to mode-neutral "never invent beyond the input artifact (IDEA.md on first run, 01_REQUIREMENTS.json on re-run)". `ux.js` Design Tokens fallback now references 01_REQUIREMENTS.json (or its original_brief field) instead of IDEA.md.
- **template:** `templates/phases/requirements.md` adds a conditional re-run block ("Current Requirements — SSoT for this re-run") that instructs the agent to refine current FRs and skip the IDEA.md Pre-flight Evaluation. First-run mode unchanged.
- **escape hatch:** To regenerate from the seed: delete `01_REQUIREMENTS.json` (the `original_brief` field preserves the original IDEA.md content). No new flag, no new command — just one explicit gesture.
- **tests:** +12 cases — phase1 re-run mode (3: SSoT block renders, malformed 01_REQS falls back, missing both throws); approve archives IDEA.md (5: file removed, original_brief written, hash matches post-archive, ideaArchived event, user notice); approve no-op without IDEA.md (2); re-approve does not re-archive (2).
- **scope decision:** Discovery phase intentionally NOT changed — same drift class exists in theory (Discovery re-runs read IDEA.md) but no real evidence demands it; will revisit if a case appears. NFR traceability and other Design Studies untouched.

---

## [0.1.88] — 2026-04-22

- **docs(prompt):** [templates/phases/tests.md](templates/phases/tests.md) TC ID convention now documents the canonical shape `TC[-NAMESPACE]*-<digits><suffix>` with namespaced examples (`TC-FE-001h`, `TC-API-USER-010f`) and explicit anti-patterns (`TC-FE001h` glued, `TC-E01` no separator) — both fail [verify.js extractTCId](lib/commands/verify.js#L29) silently. Partial mitigation for the canonical-format gate still pending in BACKLOG. Phase 3 prompt output is the only observable change.
- **docs(backlog):** Cleanup pass after deeper code-verification of every open item:
  - Discarded: `tc verify recomputes fr_coverage` (verified `verify-complete` blocks via `d.results[].status`, not `fr_coverage` counts; no consumer reads per-FR counts for decisions).
  - Discarded: `Rename checkpoint` (verified `--name` snapshot mode is not duplicated by `writeLastSession` auto; no user complaint in 18 versions).
  - Discarded: `NFR traceability Phase 2` (Design Study, no real case in 2 weeks since opened).
  - Reviewed + kept: `wizard` and `checkpoint` excluded from future command-surface audits with reason recorded.
- **no code change** beyond the template and version bumps.

---

## [0.1.87] — 2026-04-22

- **feat(health):** New deploy-gate reason `feature_verify_failed` — `computeHealth()` now blocks `deployable` when any feature sub-pipeline at phases 5/5 has `verify.ran && !verify.passed`. Real case (Cesar 2026-04-22): `frontend-remediation` sat at `5/5 verify ✅ (0/44)` for multiple sessions; pipeline declared done, tests never matched, `validate` said green. Now the inconsistency blocks the gate instead of silently passing it.
- **design:** WIP features (phases < 5/5) remain independent from root's deploy gate by design — a feature in active development must not force the main ship. Only terminal-state features (pipeline signed off) participate in the gate.
- **api:** `deployableReasons` entries for this reason carry an additional `features: string[]` field listing the offending feature names. Additive; existing readers ignoring unknown reason types unaffected. Surfaced identically via `aitri validate`, `aitri validate --explain`, and the `--json` projections of both `validate` and `status`.
- **docs:** `docs/integrations/STATUS_JSON.md` + `docs/integrations/CHANGELOG.md` updated with the new reason type and subproduct impact note.
- **tests:** +3 cases in `test/snapshot.test.js` (feature 5/5 pass stays deployable, feature 5/5 fail blocks, WIP feature does not block) + 3 cases in `test/commands/validate.test.js` (deploy blocked text, feature named in reasons, `--explain` surfaces the reason type).

---

## [0.1.86] — 2026-04-22

- **fix(validate):** `aitri validate` text output now enumerates feature sub-pipelines and prints the `Σ all pipelines: Passed (N/M)` aggregate line, mirroring what `aitri status` already exposes (v0.1.81). Closes a false-positive path where validate declared "Pipeline complete. Deployment artifacts are ready" with root `30/30` while aggregate across feature sub-pipelines was `228/280` — 52 TCs unverified. Both the feature breakdown and the aggregate Σ are appended after the existing deploy-readiness block; users and agents who trust validate's green signal now see the same project-wide truth in the same command.
- **docs:** Integration contract unchanged — validate's legacy `--json` schema (`artifacts[]`, `allValid`, `deployFiles`, `setupCommands`) is byte-identical. Feature-aware data is already exposed via `aitri status --json → tests` for automation consumers; this release only fixes the human-facing text projection.
- **tests:** +5 new cases in `test/commands/validate.test.js` covering: root-only (no features section), features with verify ran (Σ printed with summed counts, ❌/✅ indicators), features without verify (features section but no Σ).

---

## [0.1.85] — 2026-04-22

- **fix(verify):** Test-output parsers now recognize multi-segment namespaced TC IDs (`TC-FE-001h`, `TC-API-USER-010f`). Previously, all four parsers (`parseRunnerOutput`, `parseVitestOutput`, `parsePytestOutput`, `parsePlaywrightOutput`) captured only the first segment after `TC-/TC_`, so `test_TC_FE_001h_description` was parsed as `TC-FE` — which never matched Phase 3's `TC-FE-001h`. Result: every automated TC in feature sub-pipelines using namespaced IDs silently fell into `skipped_no_marker`, forcing agents to work around the gate (manual edits to `04_TEST_RESULTS.json`). Single-segment IDs (`TC-001h`, `TC-020b`) remain unaffected.
- **feat(verify):** New exported helper `extractTCId(line)` centralizes TC extraction across the four parsers. Handles hyphen/underscore separator normalization, uppercase namespace normalization, and preserves the original-case trailing suffix (`h`, `f`, `r`, `e`). Pattern: `TC(-<NS>)*-<digits><letter-suffix>?`.
- **tests:** +14 new cases in `test/commands/verify.test.js` covering multi-segment IDs across all four parsers, deep namespaces (`TC-API-USER-010f`), all-lowercase pytest convention (`test_tc_fe_001h`), word-boundary rejection, and direct `extractTCId()` unit tests.

---

## [0.1.83] — 2026-04-20

- **fix(status):** `aitri status` Features section now surfaces failing verify runs. Previously, a feature with tests failing rendered as `verify ⬜` — visually indistinguishable from "not run" — and hid the pass/fail counts. Now: passed → `verify ✅ (p/t)`, failed → `verify ❌ (p/t)`, not run → `verify ⬜`. Counts are always shown when a verify summary exists.
- **fix(status):** Features section is now sorted by attention priority: features with test failures appear first, then incomplete / not-run, then passed. Surfaces the pipelines requiring action without requiring the user to scan an alphabetical list.
- **docs:** Integration contract — no schema change (verify.passed / verify.summary already exposed per SCHEMA.md). Only rendering changed.

---

## [0.1.82] — 2026-04-20

- **feat(phase1):** Reject MUST FRs with fully-vague titles (e.g. `"La app debe funcionar correctamente"`, `"System must work properly"`). Rule: title matches `BROAD_VAGUE` regex AND fewer than 2 substantive tokens remain after stopword/vague-word removal. Closes a gap where vague ACs were caught but vague titles passed.
- **feat(phase1):** Reject FR pairs (any priority) with ≥3 acceptance_criteria each and ≥90% Jaccard similarity on normalized AC sets. Detects copy-paste of ACs across FRs — anti-pattern indicating FRs are not semantically differentiated.
- **feat(phase1):** `BROAD_VAGUE` regex extended with Spanish qualifiers (`correctamente`, `adecuadamente`, `apropiadamente`, `eficientemente`, `confiablemente`, `seguramente`, `efectivamente`, `debidamente`, `bonito`, `suave`, `limpio`). Aitri now catches vagueness in bilingual projects.
- **docs:** Integration contract — `docs/integrations/ARTIFACTS.md` documents both new validation rules under 01_REQUIREMENTS.json. `docs/integrations/CHANGELOG.md` gains v0.1.82 entry with subproduct impact (schema unchanged; readers need no updates).
- **docs:** Backlog — retired "Calidad semántica de artifacts" Design Study; extracted two concrete P3 tickets (closed in this release) and reduced remaining study to NFR traceability in Phase 2 (pending real case).

---

## [0.1.81] — 2026-04-20

- **feat(status/resume):** Aggregate test counts across root + feature sub-pipelines. `aitri status` and `aitri resume` show a `Σ all pipelines: Passed (N/M)` line when ≥1 feature has a verify summary. Per-feature verify indicator now includes counts (e.g. `verify ✅ (53/61)`).
- **feat(status --json):** New top-level `tests` block: `{ totals: { passed, failed, skipped, manual, total }, perPipeline: [{ scope, passed, failed, total, ran }], stalenessDays }`. Additive; each pipeline's own `verify.summary` preserved unchanged for legacy readers.
- **fix(UX):** Closes real-world gap where a project with 8 feature sub-pipelines (~256 tests combined) showed only `30/30` on `aitri status` — the root pipeline scope. Users and agents now see the real project-wide test count at a glance.
- **docs:** `docs/integrations/STATUS_JSON.md` documents the new `tests` block. `docs/integrations/CHANGELOG.md` notes Hub can surface global test counts without walking `features[]`.

---

## [0.1.80] — 2026-04-19

- **feat:** New command `aitri normalize` — baselines off-pipeline code changes after Phase 4 approval. Detects source files that changed outside the briefing → complete → approve loop since the last build approval. Supports git (preferred) and mtime (fallback) methods.
- **feat:** New `.aitri` field `normalizeState: { status, baseRef, method, lastRun }`. Written on `approve 4` (records baseline) and on `aitri normalize` run (records resolution). Surfaces as priority-4 next-action when `uncountedFiles > 0`.
- **feat(approve):** Informed human review — `aitri approve N` now prints a structured per-phase artifact summary before the y/N gate (FR/AC counts, TC breakdown, manifest stats, compliance levels, design sections). Non-TTY path (CI/agents) unchanged.
- **feat(status --json):** New top-level `normalize` block exposes baseline + snapshot-time detection. `nextActions[]` priority 4 triggers on either `normalizeState.status === 'pending'` OR `normalize.uncountedFiles > 0` (distinct reason texts).
- **docs:** `docs/integrations/SCHEMA.md` documents `normalizeState`. `docs/integrations/STATUS_JSON.md` documents the `normalize` block. `docs/integrations/CHANGELOG.md` Hub impact note: surface `uncountedFiles > 0` as off-pipeline drift signal (complement to approved-artifact drift already exposed via `health.driftPresent`).

---

## [0.1.79] — 2026-04-17

- **feat:** `.aitri` now persists `verifyRanAt` (set by every `aitri verify-run`) and `auditLastAt` (set by `aitri audit`). Both ISO 8601 strings. Additive — old projects without these fields keep working.
- **feat:** `health.staleVerify` in the snapshot now lists pipelines whose `verifyRanAt` is older than 14 days — previously reserved-but-empty (Fase 1 gap from v0.1.77).
- **feat:** `tests.stalenessDays` now returns an integer for the root pipeline (was always `null`).
- **fix:** `audit.lastAt` and `audit.stalenessDays` prefer the persisted `auditLastAt` over file mtime — eliminates false "stale audit" signals after a fresh `git clone` (mtime resets to clone time). Mtime fallback retained for legacy projects.
- **chore:** Removed undocumented `verifyTimestamp` field set by `verify-complete` — never read by any consumer; superseded by `verifyRanAt`.
- **chore:** Backlog cleanup — discarded "Aitri CI", "Aitri IDE", "Aitri Report", and ecosystem-level "Aitri Audit" (decisions recorded in BACKLOG.md `Discarded` table). IDEA.md/ADOPTION_SCAN.md → `spec/` relocation kept as the only remaining v0.2.0 breaking change.

---

## [0.1.78] — 2026-04-17

- **fix:** Interactive prompts broken on Node 24+. Node 24 leaves TTY stdin in non-blocking mode; `fs.readSync(0, ...)` throws `EAGAIN` instead of blocking, making every interactive confirmation unreachable (approve checklist, drift re-approval, complete warnings, verify-complete known gaps, bug registration on failed tests, wizard discovery interview, run-phase re-run, `adopt apply` / `adopt --from N` confirmation).
- **fix:** New module `lib/read-stdin.js` — `readStdinSync(maxBytes)` wraps `fs.readSync` with an `EAGAIN` retry loop using `Atomics.wait` on a `SharedArrayBuffer` for synchronous sleep (zero-dep; zero CPU spin). All 7 commands that prompted interactively migrated to the helper.
- **fix:** `adopt apply` / `adopt --from N` now accept `y` or `yes` (previously only `y`) and consume the full line — removes a latent bug where typing `yes` left `es\n` in stdin and contaminated the next read.
- **refactor:** Eight near-duplicated inline stdin readers collapsed into one helper — reduces surface area for the same class of bug in the future.

---

## [0.1.77] — 2026-04-17

- **refactor:** Introduced `lib/snapshot.js` — `buildProjectSnapshot()` is now the single source of truth for `status`, `resume`, and `validate`. Aggregates root pipeline + `features/<name>/.aitri` sub-pipelines, derives health signals, produces priority-ordered next actions. Pure function with injectable `now`. See ADR-022 in DECISIONS.md.
- **fix:** `status`/`resume`/`validate` no longer diverge on their "next action" recommendation. Previously `status` suggested `aitri validate` when phase 4 was approved without checking `verifyPassed`, while `resume` correctly gated on it. All three commands now project from `snapshot.nextActions[]` (priority ladder documented in `docs/integrations/STATUS_JSON.md`).
- **feat:** `aitri resume` — new `## Features` section per feature sub-pipeline (progress, verify, drift, per-feature next action), new `## Health` section when project is not deployable, Next Action now shows up to 5 priority-ordered commands.
- **feat:** `aitri validate --explain` — enumerates deploy-gate reasons inline (passing or blocking).
- **feat:** `aitri validate --json` — additive `deployable`, `deployableReasons[]`, `openBugs`, `blockingBugs` fields. Legacy shape unchanged.
- **feat:** `aitri status --json` — additive `snapshotVersion`, `features[]`, `bugs`, `backlog`, `audit`, `health`, `nextActions[]`. Legacy fields preserved for Hub compatibility.
- **feat:** Bare `aitri` (no subcommand) now runs `aitri status` when invoked inside an Aitri project; otherwise falls back to help.
- **docs:** New integration surface documented at `docs/integrations/STATUS_JSON.md`. Changelog entry + README row added to `docs/integrations/`.

---

## [0.1.69] — 2026-03-26

- **feat:** Named phase aliases — `1→requirements`, `2→architecture`, `3→tests`, `4→build`, `5→deploy`. Numbers still accepted (backward compatible). `PHASE_ALIASES` exported from `lib/phases/index.js`.
- **feat:** All commands (run-phase, complete, approve, reject) resolve aliases before numeric parse.
- **feat:** `aitri status` uses alias in key column and Run:/Next: suggestions.
- **feat:** `approve.js` pipeline instructions use aliases.
- **feat:** `templates/phases/` renamed to match aliases (e.g. `phase1.md` → `requirements.md`).
- **feat:** Phase display names updated: "PM Analysis" → "Requirements", "QA Test Design" → "Test Cases".
- **fix:** `validate.js` drift note shows `aitri approve tests` instead of `aitri approve 3` (2026-03-30).
- **fix:** `status.js` re-approval history shows alias instead of phase number (2026-03-30).

---

## [0.1.68] — 2026-03-25

- **feat(phase1):** Requirement Depth Protocol — 6 systematic probing questions. AC depth rules per FR type (security/persistence/logic/reporting require ≥2 ACs). Warns (non-blocking) when MUST FR has no linked user story.
- **feat(context.js):** `extractRequirementsForCompliance()` — minimal FR/NFR extract for phase 5 (token reduction).
- **refactor:** Phase 2, 4, 5 inject `extractRequirements()` instead of raw JSON.

---

## [0.1.67] — 2026-03-22

- **feat(bug):** Redesign as first-class QA artifact. New schema: `steps_to_reproduce[]`, `expected_result`, `actual_result`, `environment`, `detected_by`, `evidence`, `reported_by`.
- **feat(bug):** Lifecycle simplified: `open → fixed → verified → closed` (`in_progress` removed).
- **feat(bug):** `getBlockingBugs` now severity-based (critical/high) — was MUST FR-linked.
- **feat(verify-run):** Prompts `[y/N]` on test failure to register bug; auto-populates from Playwright evidence (`test-results/`).
- **feat(resume):** Open Bugs section with severity sort.

---

## [0.1.66] — 2026-03-21

- **feat:** `aitri review` — cross-artifact semantic consistency checks. `complete 3` and `complete 5` auto-run review; errors block, warnings prompt y/N.
- **feat:** `aitri bug` — formal bug lifecycle with FR traceability. `verify-complete` blocks on open MUST FR bugs. `validate` warns on fixed bugs without TC reference.
- **feat:** `adopt verify-spec` — brownfield TC stub generator. `--complete` registers stubs and updates phase 3 hash baseline.
- **feat(phase4):** TDD recommendation block — `buildTDDRecommendation()` heuristic injected as `{{TDD_RECOMMENDATION}}` in phase 4 briefing.
- **fix(approve):** Atomically updates `artifactHashes` + emits `afterDrift:true` event on drift-recovery approval.

---

## [0.1.65] — 2026-03-20

- **feat:** `aitri backlog` — project-level backlog management. Storage: `spec/BACKLOG.json`.
- **feat:** `aitri backlog add --title --priority --problem [--fr]`, `aitri backlog list [--all]`, `aitri backlog done <id>`.
- **feat:** `aitri status` shows open backlog count when `BACKLOG.json` exists.

---

## [0.1.64] — 2026-03-20

- **feat:** Ecosystem integration model — Aitri is now a passive producer. Subproducts (Hub, Graph) are autonomous consumers.
- **refactor:** `init.js` and `adopt.js` no longer write to `~/.aitri-hub/projects.json`. Hub manages its own registry.
- **docs:** `docs/integrations/` — canonical contract: `README.md`, `SCHEMA.md`, `ARTIFACTS.md`, `CHANGELOG.md`.

---

## [0.1.63] — 2026-03-19

- **fix:** `complete.js` updates `artifactHashes` after successful validation — prevents `hasDrift()` false positive on subsequent `approve`. Before: completing an artifact left the hash stale, causing the drift gate to fire even on legitimate human-authorized changes.

---

## [0.1.62] — 2026-03-19

- **feat(run-phase):** Gate blocks agents from re-running core phases when all 5 are approved. Non-TTY: error + redirect to `aitri feature init`. isTTY: confirmation prompt. Gate skipped inside feature sub-pipelines.

---

## [0.1.61] — 2026-03-18

- **feat:** `templates/AGENTS.md` — pipeline guardrails for any agent (Claude, Codex, Gemini). Created by `init`, `adopt apply`, `adopt --upgrade`.

---

## [0.1.60] — 2026-03-18

- **feat(approve):** Drift re-approval gate — non-TTY blocks agent re-approval when artifact has drifted; isTTY prompts confirmation before checklist. Event marked `afterDrift: true`.
- **feat(status):** Shows re-approved-after-drift warning from `events[]`.
- **feat(resume):** Dedicated section when phases were re-approved after drift.
- **refactor(state):** `hasDrift()` exported from `state.js` (was duplicated in validate/status).

---

## [0.1.59] — 2026-03-17

### Features — Pipeline quality (from AITRI-GRAPH real-project audit)
- **feat(verify.js):** `cmdVerifyRun` auto-detects `playwright.config.js` / `playwright.config.ts` — runs Playwright E2E automatically without `--e2e` flag. `--e2e` kept as no-op for backward compat. Failure logged as `status: fail` in notes — no silent skip.
- **feat(verify.js):** `cmdVerifyComplete` E2E gate — if Phase 3 has TCs with `type: "e2e"` and none have `status: "pass"`, blocks with list of affected TCs. Prevents approving a phase with all E2E tests skipped.
- **feat(templates/phase1.md):** IDEA.md pre-flight evaluation block — 5 criteria evaluated before writing `01_REQUIREMENTS.json`. 2+ fails → block with list of failing criteria + `aitri wizard` instruction. 1 fail → proceed with `idea_gaps` in `project_summary`.
- **feat(templates/phase1.md):** Operational NFR categories — PM must cover or explicitly declare not applicable: Observability (request logging), CI/CD (pipeline runs test_runner + Playwright), API security (input whitelist), Healthcheck (`GET /health`). Silently omitting a category is invalid.
- **feat(templates/phase3.md):** Security multi-vector rule — each NFR with `type: security` requires ≥3 distinct attack vectors (e.g. traversal + absolute path + encoding). Organized by control type with Bad/Good examples. 2 new Human Review checklist items.
- **feat(templates/phase3.md):** Test portability rule — fixtures must use relative paths, `process.cwd()`, `path.join(__dirname, ...)`, or `os.tmpdir()`. Absolute paths with machine-specific user dirs are invalid.
- **feat(templates/phase3.md):** Behavior vs implementation rule — tests verify observable behavior, not source code text. Explicit Bad/Good examples. `manual verification required` as valid alternative for hard-to-observe behaviors.
- **feat(templates/phase4.md):** CI/CD deliverable — when `01_REQUIREMENTS.json` has a CI/CD NFR, `implementation_files` must include the workflow file path with the full test command. No hardcoded absolute paths in test fixtures.
- **feat(templates/phase5.md):** CI/CD verification — checks workflow file exists, trigger fires on push/PR to main, installs deps, runs `test_runner` from manifest, includes Playwright if `playwright.config.js` exists. Gaps reported as compliance entries with level `"partial"`.
- **feat(resume.js):** Version mismatch detection — reads `aitriVersion` from `.aitri`, compares to current VERSION. Prepends "⚠ Version Update Required" section with `aitri adopt --upgrade` instruction when mismatch or field missing. Next Action shows `adopt --upgrade` as step 1.
- **feat(resume.js):** Bug fix — phase completed but not yet approved now correctly shows `aitri approve N` as Next Action (was: `aitri run-phase N`).
- **feat(status.js):** Version mismatch warning updated to recommend `aitri adopt --upgrade` (was: `aitri init`). Added `aitri resume` as complementary suggestion.
- **feat(README.md):** "Resuming a Project" section — documents the `aitri resume` → detect version → `adopt --upgrade` → clean resume flow.
- **feat(.github/workflows/ci.yml):** CI for Aitri repo — runs `npm run test:all` on Node 20/22/24 on push and PR to main.

### Tests
- **test(resume):** Fixed assertion — phase completed but not approved → Next Action is `aitri approve 3`, not `aitri run-phase 3`.
- **test(init):** Fixed 2 assertions — version mismatch suggestion updated from `aitri init` to `aitri adopt --upgrade`.
- **Total: 505/505 passing (unchanged count — existing tests fixed, no new tests added)**

---

## [0.1.58] — 2026-03-16

### Features
- **feat(state.js):** `setDriftPhase(config, phase)` / `clearDriftPhase(config, phase)` — helpers for managing stored drift state in `.aitri`.
- **feat(run-phase):** sets `driftPhases[phase]` in `.aitri` when re-running an already-approved phase; clears on fresh first runs.
- **feat(complete, approve):** clear `driftPhases[phase]` on completion and approval — artifact hash is re-anchored.
- **feat(status):** `hasDrift()` fast-paths to `true` if phase is in stored `driftPhases[]`, then always falls through to dynamic hash check (catches direct file modifications outside of `run-phase`). Hub can now read `.aitri` directly to detect drift without shelling out to `aitri status --json`.
- **docs(HUB_INTEGRATION.md):** `driftPhases[]` field added to schema. Updated `hasDrift()` contract with two-path logic.

### Tests
- **test(status):** 1 new test — stored `driftPhases[]` path (field present in `.aitri`).
- **Total: 505/505 passing (was 504)**

---

## [0.1.57] — 2026-03-16

### Features
- **feat(verify.js):** `parsePytestOutput()` — pytest -v output parser. Detects `TC_XXX` (underscore, Python function naming) and `TC-XXX` (hyphen) in pytest PASSED/FAILED lines, normalizes to canonical `TC-XXX` format. Activated in `cmdVerifyRun` fallback chain after Vitest/Jest parser. Python projects can now use `pytest -v` as `test_runner` and have TCs auto-detected by `verify-run` without rewriting tests in node:test. Convention: name pytest functions `test_TC_001h_description`.

### Tests
- **test(verify):** 10 new tests for `parsePytestOutput()` — PASSED/FAILED detection, underscore normalization, multi-line output, error context capture from `E ` lines, first-occurrence-wins deduplication, no false positives on non-TC test names.
- **Total: 504/504 passing (was 494)**

---

## [0.1.56] — 2026-03-16

### Bug Fixes
- **fix(templates/adopt/scan.md):** IDEA.md output format updated to use Phase 1 expected sections (`## Problem`, `## Target Users`, `## Business Rules`, `## Success Criteria`) instead of scan-specific sections (`## What this project does`, `## Stabilization goals`, `## Out of scope`) that caused 4 warnings on `aitri run-phase 1`.
- **fix(status.js):** `aitri status` next-step now shows `aitri approve N` when a core phase is completed but not yet approved (was always showing `aitri run-phase N`). Fixed in both human-readable and `--json` output (`nextAction` field).

### Tests
- **Total: 494/494 passing (unchanged — display/template fixes)**

---

## [0.1.55] — 2026-03-16

### Features — Adopt Redesign: Stabilization-First Pipeline
- **feat(adopt.js):** `adopt scan` redesigned — produces two files: `ADOPTION_SCAN.md` (technical diagnostic: priority actions, code quality, test health, security, infrastructure) + `IDEA.md` (stabilization brief for Phase 1 using standard sections). Replaces single `ADOPTION_PLAN.md` output. No more fake phase completion injection.
- **feat(adopt.js):** `adopt apply` simplified — initializes `.aitri` + `spec/`, uses `IDEA.md` from scan as Phase 1 input, prints `aitri run-phase 1` as next step. `parsePlan()` removed entirely. Stabilization runs through the real P1→P5 pipeline, producing the project's first formal Aitri artifacts.
- **feat(adopt.js):** `buildFileTree` — `MAX_TREE_LINES=150` cap + `ASSET_EXTS` filter (png, jpg, svg, ico, woff, mp3, map, lock, etc.). Prevents briefing explosion on projects with web assets (1884 → 442 line briefing on real Go project).
- **feat(adopt.js):** `adoptScan` warns when project already has `.aitri` (shows version + approved phase count). `adoptApply` warns when `.aitri` exists and shows `aitri status` as next step for already-initialized projects.
- **feat(personas/adopter.js):** ROLE, CONSTRAINTS, REASONING rewritten to match two-file output. Removed `ADOPTION_PLAN.md` references and stale Phase 2 artifact-mapping logic.

### Bug Fixes (post real-project test)
- Fixed: adoptApply showed "IDEA.md found (from scan)" for pre-existing IDEA.md — changed to "IDEA.md found"
- Fixed: adoptApply said "Next: run-phase 1" on already-initialized projects with approved phases

### Tests
- **test(adopt):** All old `adopt apply` tests rewritten to match new behavior — no ADOPTION_PLAN.md dependency, no completedPhases injection, node:test placeholder creation, no-overwrite.
- **test(smoke):** Updated scan + apply assertions for new two-file output.
- **Total: 494/494 passing (was 482)**

---

## [0.1.54] — 2026-03-14

### Features
- **feat(validate.js):** `aitri validate --json` — machine-readable validation output. Returns `{project, dir, allValid, artifacts[], deployFiles{}, setupCommands[]}`. `artifacts[]` includes `{name, exists, approved}` per artifact. Enables CI/CD integration and Hub readers to query pipeline completeness programmatically.
- **docs(README):** Added sections for `aitri wizard`, `aitri status --json`, `aitri validate --json`, `aitri adopt apply --from`, and "Adopting an Existing Project" guide. Machine-readable design principle documented.
- **docs(BACKLOG):** P1 entry for `aitri adopt` deep review — 5 friction points identified, decision tree for `adopt scan` vs `--from` as primary path.

### Tests
- **Total: 497/497 passing (unchanged)**

---

## [0.1.53] — 2026-03-14

### Features
- **feat(verify.js):** `cmdVerifyRun` — 3 friction fixes: (1) raw output capped at 200 lines with truncation notice, prevents massive suites flooding agent context; (2) when 0 TCs detected, prominent section in briefing output (not just stderr) with exact naming convention, examples, and all 3 detection patterns; (3) manifest incomplete warning when `test_runner` or `test_files` missing from `04_IMPLEMENTATION_MANIFEST.json`.

### Tests
- **Total: 497/497 passing (unchanged — display-layer changes, no exported logic)**

---

## [0.1.52] — 2026-03-14

### Features
- **feat(status.js):** `aitri status --json` — machine-readable pipeline state. Output fields: `project`, `dir`, `aitriVersion`, `cliVersion`, `versionMismatch`, `phases[]` (key, name, artifact, optional, exists, status, drift), `driftPhases[]`, `nextAction`, `allComplete`, `inHub`, `rejections`. Phase status values: `approved | completed | in_progress | not_started`. Verify pseudo-phase included when Phase 4 is approved. `driftPhases[]` is a convenience array of phase keys where `drift: true` — Hub can read it directly without filtering `phases[]`.

### Tests
- **test(status):** New `test/commands/status.test.js` — 15 unit tests covering JSON schema, phase status values, drift detection, driftPhases, versionMismatch, verify phase, allComplete, optional phase absence, text output unaffected by --json.
- **Total: 497/497 passing (was 482)**

---

## [0.1.51] — 2026-03-14

### Features
- **feat(docs):** `docs/HUB_INTEGRATION.md` — canonical Aitri ↔ Hub integration contract. Covers `.aitri` schema (all fields, types, defaults for backward compat), artifact path resolution via `artifactsDir`, drift detection algorithm (sha256 of current artifact vs `artifactHashes[phase]` — no stored `hasDrift` field), `~/.aitri-hub/projects.json` entry schema. Rule: Hub maintainers must consult this doc before modifying any reader or alert rule.
- **feat(adopt.js):** `adoptUpgrade` now registers project in Hub after upgrading, if Hub is installed and project not already in registry. Same silent/defensive pattern as `init.js`. Fixes gap: projects initialized before Hub was installed were never registered.
- **docs(AITRI-HUB):** `spec/02_SYSTEM_DESIGN.md` updated with explicit section directing Hub maintainers to consult `docs/HUB_INTEGRATION.md` before touching readers or alert rules.

### Tests
- **Total: 482/482 passing (unchanged)**

---

## [0.1.50] — 2026-03-14

### Features
- **feat(adopt.js):** `aitri adopt apply --from <N>` — new flag. Initializes project at phase N without requiring `ADOPTION_PLAN.md`. Marks phases 1..N-1 as completed, auto-infers from existing artifacts in `spec/`. Writes `IDEA.md` from README → ADOPTION_PLAN.md → placeholder (in that priority). Entry phase guidance: no prior work → `--from 1`; has requirements only → `--from 2`; has requirements + design → `--from 3`; has code but no tests → `--from 4`; has code + tests, needs CI → `--from 5`.
- **feat(adopt.js):** `inferFromArtifacts(dir, config)` — shared helper used by both `adoptApply` and `adoptApplyFrom`. Scans `spec/` for existing Aitri artifacts and auto-marks corresponding phases as completed.
- **feat(adopt.js):** `adoptApply` (standard path) now runs `inferFromArtifacts` at the end — upgrade scan for projects whose ADOPTION_PLAN.md may have missed artifacts already present.
- **feat(adopt.js):** 0-phases-inferred warning now suggests `--from` as an alternative to `--upgrade`.
- **feat(templates/adopt/scan.md):** Instructions step 5 updated to recommend `--from N` with decision guide table.

### Tests
- **test(adopt):** 7 new tests for `--from` behavior — valid phases 1–5, invalid phase, missing phase argument, IDEA.md priority (README → ADOPTION_PLAN.md → placeholder).
- **Total: 482/482 passing (was 459)**

---

## [0.1.49] — 2026-03-14

### Features
- **feat(templates/phase3.md):** "Fidelity rule" (UX/visual/audio only) replaced with broad "Specificity rule" covering all FR types. Includes Bad→Good examples per type: negative (specific error code), logic (exact return value), persistence (real DB check), security (token/session specifics), qualitative (measurable metric). Two new Human Review checklist items: (1) negative TCs include specific error code/message — not just "fails"; (2) mutation check — if core logic were deleted, would the test catch it?
- **feat(phase3.js `validate`):** Mutation resistance framing added to `complete 3` validator comments (no behavior change — enforced via briefing).

### Tests
- **Total: 459/459 passing (unchanged)**

---

## [0.1.48] — 2026-03-14

### Features — Semantic Quality Validation
- **feat(phase1.js `validate`):** Broad vagueness check for ALL MUST FRs (not just qualitative types). If all `acceptance_criteria` for a MUST FR match the `BROAD_VAGUE` pattern (`good|nice|fast|properly|correctly|efficiently|reliably|securely|safely|...`) and none contain a measurable metric, throws with the FR id and first vague criterion. Forces specific, testable ACs.
- **feat(phase3.js `validate`):** Placeholder `expected_result` detection. Blocks on: `'it works'`, `'should work'`, `'test passes'`, `'passes'`, `'succeeds'`, `'works correctly'`, `'returns successfully'`, `'is correct'`, `'is valid'`, `'ok'`. Error names all offending TC ids.
- **feat(phase3.js `validate`):** FR-MUST gap detection (cross-artifact). Reads `01_REQUIREMENTS.json` and throws if any MUST FR has no test case in `03_TEST_CASES.json`. Every MUST requirement must have ≥1 TC.
- **feat(phase5.js `validate`):** FR-MUST compliance gap detection (cross-artifact). Reads `01_REQUIREMENTS.json` and throws if any MUST FR is absent from `requirement_compliance[]` in `05_PROOF_OF_COMPLIANCE.json`.

### Design principle established
- Aitri enforces mechanical/structural correctness (schema, coverage, vagueness, placeholders). Human gates enforce content quality (are requirements correct? is the design good?). Heuristics raise the floor; humans set the ceiling.

### Tests
- **test(phase1):** 4 new tests for broad vague check — all-vague MUST FRs throw, FRs with metrics pass, SHOULD FRs exempt, mixed ACs pass.
- **test(phase3):** 3 new expected_result tests + 3 new FR-MUST gap tests.
- **test(phase5):** 4 new cross-artifact tests using real filesystem (os.tmpdir).
- **Total: 459/459 passing (was 446)**

---

## [0.1.47] — 2026-03-14

### Bug Fixes
- **fix(run-phase.js):** `started` event was saved before `buildBriefing()` executed — could log phantom starts if template rendering threw. Moved `appendEvent + saveConfig` to after `console.log(briefing)`. Requires second save but guarantees event only fires when briefing reaches stdout.
- **fix(adopt.js):** `process.exit(1)` on user abort reverted to `process.exit(0)`. User cancelling a prompt is not an error. The v0.1.44 change was incorrect — "aitri adopt apply && next_cmd" not running after N is the expected behavior, which exit(0) achieves correctly.
- **fix(phase4.js):** `validate()` now accepts `{ dir }` as second argument (already passed by `complete.js`). Emits `[aitri] Warning` in stderr for each `test_files` entry not found on disk. Non-blocking — enforcement remains in `verify-run`.
- **fix(feature.js):** `aitri feature run-phase` now errors explicitly if `FEATURE_IDEA.md` doesn't exist, with the exact path to create. Previously the briefing was generated with empty feature context and the agent received no feature description.
- **fix(adopt.js):** `adoptApply` now emits `[aitri] Warning` in stderr when zero completed phases could be inferred from `ADOPTION_PLAN.md`, with instructions to use `aitri adopt --upgrade` as fallback.

### Features
- **feat(approve.js):** `aitri approve review` now has explicit routing: if `verifyPassed` → suggests `run-phase 5`; if Phase 4 approved → suggests `verify-run`; otherwise → suggests `run-phase 4`. Non-blocking — review remains an optional phase.
- **feat(run-phase.js):** `appendEvent(config, 'started', phase)` emitted after briefing is confirmed. Hub now has full timeline: started → completed → approved/rejected.
- **feat(verify.js):** `appendEvent(config, 'verify-run', 'verify', { passed, failed, skipped })` and `appendEvent(config, 'verify-complete', 'verify', { passed, failed })` added. Hub can read verify outcomes from event log.
- **feat(init.js):** isTempDir regex extended with `/private/tmp/` — covers macOS symlink resolution edge case.

### Technical Debt (P3 — resolved)
- **fix(phase1,3,4,5 validate):** `JSON.parse()` now wrapped with friendly error message. Malformed agent output (markdown fences, trailing commas, truncation) produces actionable error instead of raw SyntaxError stack.
- **fix(verify.js):** Warning emitted when all `fr_coverage` entries have `tests_passing === 0` but tests did pass — signals missing `@aitri-tc` markers in test files.
- **fix(adopt.js):** `scanTestHealth` now uses `openSync/readSync` with `MAX_FILE_READ_BYTES` cap, consistent with `scanCodeQuality` and `scanSecretSignals`.

### Tests
- **feat(adopt.test.js):** 13 new unit tests for `scanCodeQuality`, `scanSecretSignals`, `scanInfrastructure`, `scanTestHealth`. Scanners exported as named exports.
- **feat(init.test.js):** 3 new tests for isTempDir classification (temp paths excluded, real paths included).
- **Total: 459/459 passing** (was 443 at v0.1.44)

---

## [0.1.46] — 2026-03-13

### Features
- **feat(init.js):** Auto-register project in Aitri Hub (`~/.aitri-hub/projects.json`) on `aitri init`. Silent, non-blocking. Skips temp/system directories.
- **feat(status.js):** Shows `Monitored by Aitri Hub` line when project is registered in Hub.

### Bug Fixes
- **fix(init.js):** isTempDir guard added to skip Hub registration for temp/system directories (`/tmp/`, `/var/folders/`, `/private/var/`, `/var/tmp/`). Prevents test dirs from polluting Hub registry.

### Tests
- **Total: 446/446 passing** (was 443 at v0.1.44 — 3 new tests for isTempDir)

---

## [0.1.45] — 2026-03-13

### Features
- **feat(state.js):** `appendEvent(config, event, phase, extra)` — appends pipeline activity events to `config.events[]`, capped at 20. Called by `approve.js`, `complete.js`, `reject.js`.
- **feat(approve.js, complete.js, reject.js):** All three now call `appendEvent` before `saveConfig`. Event types: `'approved'`, `'completed'`, `'rejected'`.

### Tests
- **Total: 443/443 passing (unchanged)**

---

## [0.1.44] — 2026-03-13

### Bug Fixes (deep stability audit — v0.1.44)
- **fix(resume.js):** `fr_coverage` was treated as an object with `Object.keys()`, but `verify.js` writes it as an array `[{fr_id, tests_passing, tests_failing, ...}]`. `aitri resume` was showing `- 0: unknown (0/0 tests passing)` instead of `- FR-001: covered (3/3 tests passing)`. Now handles both array and legacy object formats. Test fixture updated to match the real artifact structure.
- **fix(adopt.js):** `buf.slice()` → `buf.subarray()` in `scanCodeQuality` and `scanSecretSignals`. `wizard.js` was already using `buf.subarray()` — brings all three into alignment.
- **fix(adopt.js):** `process.exit(0)` on user abort in `adoptApply` changed to `process.exit(1)`. _(Note: reverted to `exit(0)` in v0.1.47 — the original reasoning was incorrect.)_

### Docs
- **docs(BACKLOG.md):** Stabilization item closed. Added `## Known Technical Debt` section documenting 3 design trade-offs: JSON.parse error quality in validators, missing `@aitri-tc` marker silent failure in verify, and `scanTestHealth` byte-limit inconsistency.

### Tests
- **Total: 443/443 passing (unchanged)**

---

## [0.1.39] — 2026-03-13

### Bug Fix (discovered in production — real-world adopt test on Ultron project)
- **fix(state.js):** `EISDIR` crash when `.aitri` already exists as a directory. Added `configFilePath()` — when `.aitri` is a directory, config is stored at `.aitri/config.json` instead of overwriting the directory. Affects projects that use `.aitri/` as a docs/config folder before adopting Aitri.

---

## [0.1.41] — 2026-03-13

### Features
- **feat(adopt/scan):** Deep technical health audit. `adopt scan` now pre-scans 6 dimensions programmatically (code quality markers, .gitignore coverage, env/secrets, credential signals, infrastructure readiness, test health) and passes results to the agent. `ADOPTION_PLAN.md` now requires a `## Technical Health Report` section with 7 subsections + Priority Actions (CRITICAL/HIGH/MEDIUM/LOW).
- **feat(personas/adopter):** Role expanded to Senior Software Architect + Technical Auditor. REASONING updated with 4-phase analysis process.

### Tests
- **Total: 443 tests (unchanged)**

---

## [0.1.40] — 2026-03-13

### Fix
- **fix(feature/init):** `aitri feature init` output now explains what a feature sub-pipeline is, lists all commands, and shows the full workflow — previously only showed 2 lines.

---

## [0.1.39] — 2026-03-13

### Bug Fix (discovered in production — real-world adopt test on Ultron project)
- **fix(state.js):** `EISDIR` crash when `.aitri` already exists as a directory. Added `configFilePath()` — when `.aitri` is a directory, config is stored at `.aitri/config.json`. Affects projects that use `.aitri/` as a docs/config folder before adopting Aitri.

---

## [0.1.38] — 2026-03-13

### Features
- **feat(wizard/agent-mode):** `aitri wizard` no longer errors when stdin is not a TTY. In non-TTY contexts (Claude Code, pipelines), prints a structured briefing instructing the agent to conduct the interview, infer fields from rich answers, and confirm the IDEA.md draft before writing.
- **feat(init):** `aitri init` now creates `idea/` folder alongside `IDEA.md` and `spec/`. Drop mockups, Figma exports, PDFs, or reference docs there — `aitri run-phase` automatically lists them in every phase briefing.
- **feat(templates/IDEA.md):** Added `## Assets` section for Figma links, mockup paths, and reference docs.
- **feat(templates/phases):** All 8 phase templates now include a `## Delivery Summary` section — structured phase report after each artifact so the user can approve without opening the file.
- **fix(wizard):** Replaced deprecated `buf.slice()` with `buf.subarray()`.
- **fix(adopt/parsePlan):** Section heading aliases — accepts `## Project Overview`, `## Summary`, `## Decision`, `## Recommendation`, `## Inferred Phases`, `## Phases` in addition to canonical names.
- **fix(help):** `WORKFLOW:` now documents `idea/` folder and `aitri wizard` as alternative to manual IDEA.md editing.

### Tests
- **test(wizard):** Updated agent-mode test — verifies briefing output instead of TTY error.
- **Total: 443 tests (unchanged)**

---

## [0.1.37] — 2026-03-13

### Stabilization
- **fix(bin/aitri.js):** `aitri adopt scan` and `aitri adopt apply` now always use the current working directory instead of `findProjectDir(cwd)`. Previously, if any parent directory (including home dir) contained a `.aitri` file, scan/apply would silently run against that parent dir instead of the intended project. `adopt --upgrade` is unaffected (it intentionally finds an existing Aitri project).
- **fix(run-phase):** Missing required file error now names the exact phase to run — e.g. "Missing required file: 01_REQUIREMENTS.json\nRun: aitri run-phase 1" instead of generic "Run previous phases first."
- **fix(adopt/parsePlan):** Parser now accepts `###` headings (not just `##`); Adoption Decision check uses `\bready\b`/`\bblocked\b` regex (not fragile `startsWith`); Completed Phases now falls back to bullet list (`- Phase 1`) and comma-separated formats in addition to JSON array.
- **fix(help):** Added FEATURE WORKFLOW section — `aitri feature init/run-phase/complete/approve` were undocumented in `aitri help` output.

### Tests
- **test(smoke):** 13 new smoke tests — `aitri adopt scan`, `aitri adopt apply` (well-formed, `###` headings, bullet-list phases), `aitri adopt --upgrade`, `aitri feature init`, `aitri feature list`, `aitri feature status`, `aitri feature init` error cases.
- **Total: 443 tests (up from 430)**

---

## [0.1.36] — 2026-03-12

### Features
- **feat(wizard):** `aitri wizard [--depth quick|standard|deep]` — synchronous TTY interview (zero deps, `fs.readSync` char-by-char). Writes filled `IDEA.md` from user answers. Depths: quick (6 questions), standard (+constraints/tech stack), deep (+urgency/no-go/risks). Aborts if `IDEA.md` exists unless user confirms overwrite.
- **feat(run-phase/discovery):** `aitri run-phase discovery --guided` — runs quick interview before printing briefing, injects answers as `## Interview Context` block. Backward-compatible: without `--guided`, zero behavior change.

### Tests
- **test(wizard):** 21 new tests — `collectInterview`, `buildIdeaMd`, `buildInterviewContext`, `runDiscoveryInterview`, `cmdWizard` (TTY gate, overwrite confirm/abort, depth validation), `run-phase discovery --guided` integration.
- **Total: 430 tests (up from 409)**

---

## [0.1.35] — 2026-03-12

### Features
- **feat(adopt/scan):** `aitri adopt scan` — scans project file tree, `package.json`, `README`, test files → outputs briefing for agent → agent produces `ADOPTION_PLAN.md`.
- **feat(adopt/apply):** `aitri adopt apply` — reads `ADOPTION_PLAN.md`, isTTY gate, initializes `.aitri` + `spec/` + `IDEA.md` from Project Summary, marks inferred `completedPhases`.
- **feat(README):** Restructured — ASCII art header, pipeline diagram, 5-step Quick Start, commands table (adopt/feature/resume/wizard), agents table. Reduced from 354 to ~100 lines. Schemas removed (available via `aitri help`).

### Tests
- **test(adopt):** 21 new tests — scan output structure, apply initialization, --upgrade sync, error conditions, parsePlan section parsing.
- **Total: 409 tests (up from 388)**

---

## [0.1.34] — 2026-03-12

### Features
- **feat(adopt/--upgrade):** `aitri adopt --upgrade` — non-destructive sync for existing Aitri projects: iterates all PHASE_DEFS artifacts, adds to `completedPhases` if present on disk, updates `aitriVersion`. Never removes state.
- **feat(init/status):** `aitriVersion` field stored in `.aitri` on every `init`. `aitri status` warns if project was initialized with a different CLI version: "⚠️ Project initialized with vX.Y.Z — CLI is vA.B.C. Run: aitri init to update (non-destructive)".
- **feat(personas):** New `lib/personas/adopter.js` — Senior Software Architect persona for reverse-engineering adoption analysis.
- **feat(templates):** New `templates/adopt/scan.md` — briefing template for `adopt scan` with FILE_TREE, PKG_JSON, README, TEST_SUMMARY placeholders and structured ADOPTION_PLAN.md output format (6 required sections).

### Tests
- **test(init):** 6 new tests — `aitriVersion` stored on init, version mismatch warning in status, no warning when versions match, no warning when aitriVersion absent (graceful).
- **Total: 388 tests (up from 382)**

---

## [0.1.33] — 2026-03-12

### Features
- **feat(phaseDiscovery):** Discovery Confidence gate — `aitri complete discovery` now validates `00_DISCOVERY.md` has ≥ 5 Evidence sections and a Confidence score. Low confidence blocks with actionable message.
- **feat(approve/phaseUX):** UX archetype detection — `aitri approve ux` detects `UX`, `visual`, `audio` FRs in `01_REQUIREMENTS.json` and enforces Phase UX must run before Phase 2. Prevents skipping UX phase silently.

### Tests
- **test(phaseDiscovery):** 6 new tests — confidence gate pass/fail, evidence count validation, missing confidence score.
- **test(phaseUX):** 4 new tests — archetype detection in approve flow.
- **Total: 382 tests (up from 370)**

---

## [0.1.30] — 2026-03-12

### Features
- **feat(phase3):** Rank 3 — Three Amigos gate complete. Cross-phase AC check: `aitri complete 3` now verifies each TC's `ac_id` exists in `user_stories[*].acceptance_criteria[*].id` from `01_REQUIREMENTS.json`. Missing file → stderr warning + skip (non-blocking). Invalid ac_id → exit 1 with specific TC reference.
- **feat(complete):** `p.validate(content, { dir, config })` — context object passed to all phase validators, enabling cross-phase file reads without signature breakage.

### Tests
- **test(phase3):** 5 new cross-phase tests: backward compat (no dir), missing requirements file (graceful), valid ac_ids pass, invalid ac_id fails, briefing mentions ac_id.
- **Total: 313 tests (up from 308)**

---

## [0.1.29] — 2026-03-12

### Features
- **feat(phase1/templates):** Rank 2 — Structured IDEA.md template complete. `templates/IDEA.md` has 8 sections (Problem, Target Users, Current Pain, Business Rules, Success Criteria, Hard Constraints, Out of Scope, Tech Stack) with instructional HTML comments. `buildBriefing()` warns on stderr (non-blocking) when any required section is absent or contains only placeholder comment text.

### Tests
- **test(phase1):** 5 new tests for empty-section warnings: absent section fires warning, comment-only section fires warning, populated sections produce no warning, warning is non-blocking (buildBriefing still returns briefing string)
- **Total: 308 tests (up from 303)**

---

## [0.1.26] — 2026-03-12

### Bug Fixes
- **fix(state):** Atomic write temp file moved from `os.tmpdir()` to project directory — eliminates `EXDEV: cross-device link not permitted` on systems where `/tmp` is a separate tmpfs mount. Removes `os` import from `state.js`; replaces with per-pid temp name `.aitri-<pid>.tmp` in project dir.
- **fix(approve):** UX/visual FR detection silent catch replaced with explicit stderr warning — when `01_REQUIREMENTS.json` fails to parse, user now sees: "Could not read 01_REQUIREMENTS.json to check for UX/visual FRs. If your project has UX or visual requirements, run: aitri run-phase ux". Previously a silent `catch {}` skipped the gate with no feedback.
- **fix(phaseReview):** Added missing `extractContext: (content) => head(content, 80)` — phaseReview was the only phase not implementing the `extractContext` contract. TypeError would have occurred if review artifact was used as input via `run-phase.js` line 49. Now consistent with all other 7 phases.

### Features
- **feat(state):** New export `hashArtifact(content)` — SHA-256 hash of artifact content via `node:crypto`. Used for drift detection.
- **feat(approve):** Stores `artifactHashes[phase]` in `.aitri` at approval time — SHA-256 of the artifact file content at the moment the human approves.
- **feat(status):** Drift detection — if an approved artifact's current hash differs from the stored approval hash, displays `⚠️ DRIFT: artifact modified after approval` inline with the phase row.
- **feat(validate):** Drift detection — same hash check as `status`; drift causes `allGood = false` and blocks the "Pipeline complete" message. Both commands now derive from the same source of truth (resolves the `status`/`validate` inconsistency).
- **feat(validate):** Close-out message updated — "Pipeline complete. Your project is ready to deploy." → "Pipeline complete. Deployment artifacts are ready — run your deploy commands to ship." Distinguishes pipeline completion from actual deployment.

### Tests
- **test(state):** `saveConfig() — atomic write location` — verifies `.aitri` is written to project dir and no `.aitri-*.tmp` file remains after save.
- **test(state):** `hashArtifact()` — 4 tests: hex format, determinism, collision resistance, empty string.
- **test(smoke):** `[v0.1.26] approve stores artifactHashes in .aitri` — SHA-256 hash persisted after `approve 1`.
- **test(smoke):** `[v0.1.26] aitri status shows DRIFT` — modify artifact post-approval → DRIFT visible in status.
- **test(smoke):** `[v0.1.26] aitri validate shows DRIFT` — DRIFT blocks "Pipeline complete" message.
- **test(smoke):** `[v0.1.26] aitri approve 1 warns on unparseable JSON` — UX fallback warning is non-silent.
- **Total: 254 tests (up from 245)**

---

## [0.1.25] — 2026-03-11

### Bug Fixes
- **fix(verify):** BUG-3 — `flagValue` returns `null` when flag absent; old guard `!== undefined` was true for `null` → `parseFloat(null)` = `NaN` → `--coverage` injected on every `verify-run` → unit tests failed with "bad option" on Node 24. Fix: `rawThreshold !== null && rawThreshold !== undefined`

### Features
- **feat(templates/phase2):** Output section now lists exact `##` header names required by validator with note "validates by exact match"; added frontend-only guidance for API Design and Data Model; Human Review checklist corrected from "All 5" to "All 8 required sections"
- **feat(templates/phase5):** Explicit warning in schema — `"id"` not `"fr_id"` for `requirement_compliance` entries; `04_TEST_RESULTS.json` uses `fr_id` internally, `05_PROOF_OF_COMPLIANCE.json` uses `id`
- **feat(validate):** `DEPLOYMENT.md` and `.env.example` downgraded from `⚠️` to `ℹ️ optional` — only `Dockerfile` and `docker-compose.yml` are required
- **feat(verify-complete):** Passing message now shows e2e breakdown — e.g. `23/25 passing (21 unit + 2 e2e)`

### Tests
- **test(verify):** 2 new BUG-3 regression tests — confirm `parseFloat(null)` = NaN root cause and that fixed guard returns `null`
- **Total: 245 tests (up from 243)**

---

## [0.1.24] — 2026-03-11

### Bug Fixes
- **fix(approve):** `aitri approve ux` — when Phase 1 is already approved, now shows `aitri run-phase 2` PIPELINE INSTRUCTION instead of the generic "run-phase 1" hint (BUG-2)

### Features
- **feat(verify):** `parseRunnerOutput()` — TC regex changed from `TC-\d+` to `TC-[A-Za-z0-9]+`; alphanumeric TC IDs (e.g. `TC-020b`, `TC-020c`) are now detected correctly
- **feat(verify):** New export `parsePlaywrightOutput(output)` — Playwright uses `✓` (U+2713), not `✔` (U+2714); dedicated parser handles Playwright format without charset collision
- **feat(verify):** `spawnSync` for both main runner and Playwright runner — `shell: true` → `shell: false`; eliminates `[DEP0190]` DeprecationWarning
- **feat(verify):** Skipped TC breakdown — summary now reports `skipped_e2e` (browser/e2e TCs) and `skipped_no_marker` (no marker detected) separately
- **feat(personas/ux):** CONSTRAINTS updated — when UX/visual FRs explicitly require visual attributes, the UX designer now defines concrete design tokens (color roles, type scale, spacing); prevents generic CSS output for apps with "minimalist modern" aesthetic requirements
- **feat(templates/phaseUX):** `## Design Tokens` section added to required output — enforced when visual FRs specify aesthetic style; tokens flow directly to implementation
- **feat(complete):** `--check` dry-run flag — `aitri complete <phase> --check` validates the artifact without recording state; exits 0 on pass, exits 1 with error on fail

### Tests
- **test(verify):** 2 new `parseRunnerOutput()` tests — alphanumeric TC IDs (`TC-020b`, `TC-020c`)
- **test(verify):** 6 new `parsePlaywrightOutput()` tests — ✓ pass, ✗ fail, multi-line, dedup, no TC patterns, alphanumeric IDs
- **Total: 243 tests (up from 235)**

---

## [0.1.23] — 2026-03-11

### Prompt Template Layer
- **feat(prompts):** `lib/prompts/render.js` — lightweight `{{KEY}}` / `{{#IF_KEY}}...{{/IF_KEY}}` renderer, zero deps
- **refactor(phases):** all 8 `buildBriefing()` methods now load from `templates/phases/*.md` — prompts readable and editable as plain markdown without touching JS logic
- **no behavior change** — 235 tests pass, agent output identical to prior version
- **benefit:** prompt content is first-class — diffs are clean, adjustments don't require JS knowledge

---

## [0.1.22] — 2026-03-11

### Playwright E2E Detection
- **feat(verify-run):** `--e2e` flag — runs `npx playwright test` as second runner when `playwright.config.js/.ts` exists
- **feat(verify-run):** Playwright-detected TCs merged into results before writing `04_TEST_RESULTS.json` (main runner wins on conflict)
- **feat(verify-run):** Playwright raw output shown as separate section in report
- **feat(phase3):** E2E tests via Playwright must follow `TC-XXX:` naming for auto-detection by verify-run
- No schema changes — zero-config, auto-detects playwright config in project dir

---

## [0.1.21] — 2026-03-11

### Software Quality Guarantee — Test Quality Gate
- **feat(verify-run):** Assertion density scan — scans `test_files[]` for `@aitri-tc` markers, flags TCs with ≤1 `assert.*`/`expect()` call as low-confidence; reports as warnings in verify-run output
- **feat(verify-run):** Code coverage gate — `--coverage-threshold N` flag; auto-injects `--experimental-test-coverage` (Node 18+) or `--coverage` (Node 22+) for `node --test` runners; warns if below threshold
- **feat(phase4/human-review):** Two new mandatory checklist items — verify assertion tests real behavior (not constants); review assertion density warnings from verify-run
- **feat(verify.js):** Three new exported pure functions: `scanTestContent()`, `scanAssertionDensity()`, `parseCoverageOutput()`

### Tests
- **test(verify):** 12 new tests for `scanTestContent()` (7 cases) and `parseCoverageOutput()` (5 cases)
- **Total: 235 tests (up from 223)**

---

## [0.1.19] — 2026-03-11

### Software Quality Guarantee
- **fix(approve/status/help/verify):** All stale `aitri verify` references replaced with `verify-run` — eliminates the honor-system path from all user-facing surfaces
- **feat(phase4/validate):** `test_runner` and `test_files[]` are now required — `aitri complete 4` fails without them
- **feat(phase4/briefing):** Requirements Snapshot (Anti-Drift Reference) — compact FR list injected directly into briefing, independent of extractContext truncation; resists context drift across long sessions
- **feat(phase4/briefing):** Test Authorship Lock — lists all Phase 3 TC ids; prohibits new TC ids; requires `// @aitri-tc TC-XXX` markers in every test function
- **feat(verify):** `aitri verify` disabled — redirects to `aitri verify-run` with explanation
- **feat(verify-complete):** FR traceability cross-check — every FR from `01_REQUIREMENTS.json` must appear in `fr_coverage` with ≥1 passing test; blocks with list of uncovered FRs if gap detected
- **feat(verify-complete):** PIPELINE INSTRUCTION format — replaced soft `→ Next:` with explicit directive block (consistent with approve.js)

### Tests
- **test(phase4):** 5 new validate() tests for `test_runner` + `test_files[]` enforcement
- **test(phase4):** 8 new buildBriefing() tests — Requirements Snapshot, Test Authorship Lock, @aitri-tc marker instruction, test_runner/test_files in output schema
- **Total: 209 tests (up from 196)**

---

## [0.1.20] — 2026-03-11

### Auto-Parsing Test Runner Output
- **feat(verify-run):** `cmdVerifyRun` completely rewritten — runs real test suite via `spawnSync`, auto-parses `✔/✖ TC-XXX` patterns from runner output, writes `04_TEST_RESULTS.json` automatically
- **feat(verify-run):** Agent self-reporting eliminated — agent never writes or maps test results
- **feat(verify-run):** `parseRunnerOutput()` and `buildFRCoverage()` exported as pure functions
- **feat(verify):** `aitri verify` disabled — hard redirect to `aitri verify-run` with explanation
- **feat(verify-complete):** PIPELINE INSTRUCTION format consistent with approve.js

### Tests
- **test(verify):** New `test/commands/verify.test.js` — 16 unit tests for `parseRunnerOutput()` and `buildFRCoverage()`
- **Total: 223 tests (up from 209)**

---

## [0.1.14] — 2026-03-10 ✅ PUBLISHED

### Prompt Engineering — Personas
- **feat(personas):** R1 — pipeline context added to all 7 personas: each ROLE now states phase position and what it feeds into/receives from
- **feat(personas):** R2 — auto-check added to REASONING of all 7 personas: "Before finalizing: verify..." at end of each
- **feat(personas):** R3 — DevOps ROLE strengthened: final gate framing, dishonesty consequence, placeholder blocking rationale
- **feat(personas):** R4 — few-shot ❌/✅ examples added to PM and Developer REASONING
- **feat(personas):** R5 — positive constraints ("Always X") added to all 7 personas

### SDD Pipeline
- **feat(context):** `extractRequirements()` now propagates `no_go_zone`, `user_personas`, and `user_stories` (with concrete AC: given/when/then) to all downstream phases — strips narrative fields (as_a, i_want, so_that)
- **feat(phases):** Human Review Checklists added at end of all 5 core phase briefings
- **fix(phase4):** Dead code removed (`qualDebt` filtering by `entry.fr_type` — field never existed)
- **fix(phase4):** `head(120)` → `head(200)` for System Design context (prevents API Design truncation)

### Architecture
- **refactor:** `OPTIONAL_PHASES` extracted to SSoT in `lib/phases/index.js` — eliminated 5 duplicate local definitions across commands
- **docs:** FEEDBACK.md rewritten — clear purpose (test feedback funnel → backlog), lifecycle rules, expiration policy

### Tests
- **test:** `test/phases/context.test.js` — 18 new tests for `extractRequirements()` and `head()`
- **test:** Human Review Checklist tests added to phase1–5
- **Total: 135 tests (up from 103)**

---

## [2.0.0] — 2026-03-09 ✅ PUBLISHED

### Core Architecture
- CLI with 9 commands: `init`, `run-phase`, `complete`, `approve`, `reject`, `verify`, `verify-complete`, `status`, `validate`
- 5-phase pipeline: PM → Architect → QA → Developer → DevOps
- State management via `.aitri` JSON file (stateless per invocation)
- `extractContext()` per phase to minimize context drift (~40-60% token reduction)
- Zero external dependencies

### Compliance (breaking change vs v1.0.0)
- Phase 1: MUST FRs require `type` + measurable acceptance criteria by category
- Phase 2: `validate()` enforces required sections + minimum SDD length
- Phase 3: mandatory gates by FR type (UX, persistence, security, reporting)
- Phase 4: self-evaluation checklist + Technical Debt Declaration mandatory in manifest
- Phase 5: `PROOF_OF_COMPLIANCE.json` with `requirement_compliance[]` per-FR with levels
- `aitri complete`: `p.validate()` rejects malformed or incomplete artifacts
- Phase 4 SDD capped at 120 lines (anti context explosion)

### Observability
- `aitri reject` persists feedback in `.aitri` with timestamp
- `aitri status` shows rejection history with date and message

---

## [2.0.1] — 2026-03-09 ✅ PUBLISHED

### Fixes
- **fix(state):** Warning to stderr when `.aitri` config is malformed — previously silent reset
- **fix(cli):** `flagValue()` bounds check — prevents silent undefined when flag has no value

### Tests
- **test:** 34 unit tests for `validate()` — all 5 phases, `node:test` built-in, zero dependencies
- **test:** 13 smoke tests — full CLI pipeline with real command invocations + state assertions
- **scripts:** `npm test` (unit), `npm run test:smoke` (E2E), `npm run test:all` (both)

### Architecture
- **refactor:** `lib/phases.js` → `lib/phases/` — one file per phase + shared `context.js`
- **refactor:** `bin/aitri.js` → thin dispatcher (52 lines) + `lib/commands/` — one file per command
- **refactor:** `test/phases.test.js` → `test/phases/` — one test file per phase

### Documentation
- **docs:** README fully rewritten for v2.0.0 — commands, schemas, workflow, compatible agents
- **docs:** All design notes translated to English (ADR-008 added)
- **docs:** Development pipeline directives in ARCHITECTURE.md — regression policy, impact analysis, version bump policy
- **docs:** GITHUB_NPM_GUIDE.md updated for v2.0.0 release process

---

## [2.0.2] — 2026-03-09 ✅ PUBLISHED

- **feat(validate):** Pipeline completion now shows deployment files, setup commands from manifest, and path to DEPLOYMENT.md — instead of dead-end "all good" message
- **fix(phase3/briefing):** Schema contract now explicit — `requirement_id` must be single FR id, `type` is strictly `unit|integration|e2e`, `scenario` is the separate field for happy_path/edge_case/negative
- **fix(phase3/validate):** Detects comma-separated `requirement_id` with descriptive error
- **test:** 2 new Phase 3 tests covering both agent schema mistakes (comma requirement_id, type misuse)

---

## [1.0.0] — deprecated
> Superseded by v2.0.0. No artifact validation, no per-FR compliance.

## [0.4.0] — deprecated
> Superseded by v2.0.0. Included MCP server and Claude Code Skill — removed for lack of portability.
