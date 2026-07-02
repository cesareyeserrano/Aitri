# Aitri — Changelog

> Published version history. Format: [version] — date — what shipped.
> Version scheme: `0.1.x` (npm canonical). Previous entries used `2.0.x` — those entries are preserved below for history.

---

## [2.0.0-rc.144] — 2026-07-01 — the intake injects readable context content; it no longer bets the agent opens a bare path (ADR-066)

Root-caused from the Ledger pilot, one layer below ADR-065. ADR-065 hardened the *instruction* ("provided definitions are authoritative — transcribe them"), but the pilot still lost provided decisions — and the user's own correction surfaced why: **the agent self-admitted it never opened the mockups or the `.html` prototype.** The intake handed every `idea_context/` / `feature_context/` asset to the agent as a **bare path in a list** and never injected content — so "transcribe the provided spec" depended on the agent *choosing* to open each path. The agent read the injected `IDEA.md` and the `.md` spec but silently skipped the 4 mockup PNGs and the 275 KB `.html` prototype. Aitri's own code already documented this exact bet failing (`AUDIT-0630-B`), but had patched it only for images at the build phase — the identical bet for the textual spec at intake was still live.

- **Readable text is now INJECTED in full at the grounding/design phases (discovery, requirements, ux).** `.md/.txt/.json/.html/.css/.js/…` context files are inlined into the briefing the way `IDEA.md` already is — if the material is in the prompt, a skip is impossible. Bounded by a per-file cap (32 KB) and a per-briefing total cap (96 KB); a folder whose readable text exceeds the budget injects smallest-first (so a large file can't starve a small one) and **loudly warns on stderr** for any file demoted to a pointer — never a silent drop. (`lib/commands/run-phase.js`.)
- **What Aitri cannot inline gets a loud "OPEN each" pointer, not a silent path.** Images (no vision, zero-dep) and oversized text (the 275 KB prototype) are surfaced with "OPEN each one before writing — structural review does NOT verify you reflected them", porting the `AUDIT-0630-B` fidelity language upstream from build to intake. Downstream phases (2, 3) keep the lighter path listing (they build on approved artifacts).
- **Hardening (from the adversarial pass on the implementation):** a binary file with a text extension is NUL-sniffed and falls to a pointer (no mojibake inlined); secret-ish basenames (`secrets*`, `credentials*`, `*.pem`…) are never inlined; the `ux` framing was reconciled so a phase that inlines material no longer also calls it "reference only".

Honest ceiling (ADR-066 trade-off): for **binary** assets — the mockups actually skipped in Ledger — injection is impossible, so the maximum is the loud instruction; whether the agent truly opens a PNG stays honor-system (Aitri's no-vision/zero-dep identity). This removes the skip for *text* and makes the skip for *binaries* loud instead of silent. A per-asset "prove you reflected it" gate was **rejected as theater** (an adversarial panel confirmed it: gameable, wouldn't have caught Ledger, false-fires on `ADOPTION_AUDIT.md` and reference-doc dumps). Verified end-to-end on the real Ledger assets: the spec content injects, the mockups + prototype get the OPEN-each pointer. Works identically for a root **product** (`idea_context/`) and a **feature** sub-pipeline (`feature_context/`) — same scope-aware code path, pinned by a dedicated test. +6 tests. AGENTS.md, ARCHITECTURE.md, [ADR-066](DECISIONS.md) updated. `npm run test:all` green (1891).

## [2.0.0-rc.143] — 2026-07-01 — provided client definitions are authoritative; Aitri decides only for gaps (ADR-065)

Root-caused from the Ledger pilot: after rc.137/138 got the design to reach the build, the UI still diverged from the client's mockups — because the pipeline was **re-inventing** provided definitions instead of using them. The `_context` folders exist so that when the client already has business definitions, Aitri BUILDS with them and does not re-open closed decisions; its own generation (discovery, UX/archetype) is for what is absent or incomplete. The implementation had inverted this.

- **UX transcribes a provided design; the archetype is a fallback (not "non-negotiable").** The UX persona ran a mandatory archetype step and derived tokens from `archetype → visual FRs → inferred context` — the provided mockups were never in the hierarchy (the word "mockup" appeared nowhere). Now: `PROVIDED DESIGN IS THE SOURCE OF TRUTH — transcribe it`, the archetype fills only what the provided design leaves unspecified, and tokens derive from the provided design first. (`lib/personas/ux.js`, `templates/phases/phaseUX.md`.)
- **Phase 1 carries precise provided decisions faithfully — the complement to "never invent".** The PM had "never invent (mark [ASSUMPTION])" but no rule to keep what the client DID define, so a stated "must" (the desktop capture side panel) was silently dropped. Now the PM judges each provided item's **maturity** (qualitative, no thresholds) and acts: a precise/closed decision → carry it verbatim into an FR; a partial/ambiguous one → **ask to refine and align** before finalizing; a genuinely absent need → derive it, marked [ASSUMPTION]. This generalizes the existing Seed-Input Elicitation discipline from the five Tier-A inputs to **every** definition the client provided. (`lib/personas/pm.js`, `templates/phases/requirements.md`.)

Honest ceiling (ADR-065 trade-off): "identify maturity / transcribe vs ask vs derive" is agent judgment — prompt-only, no new gate (a "did you honor the input" gate would be theater). The harness makes a dropped/re-invented decision **catchable** (the `confirmed`/`assumed` + `coverage_map` record is visible at `approve`), not impossible; and this removes the *upstream* cause of the Ledger divergence, which is necessary but not sufficient for pixel fidelity (the reproduction ceiling is separate, ADR-063). +3 tests. `npm run test:all` green (1885).

## [2.0.0-rc.142] — 2026-06-30 — the two remaining connectivity-audit decisions: canonical AC shape + a populated bug resolution (AUDIT-0630-E)

Closes the two items the audit left as decisions rather than mechanical fixes.

- **AC-shape drift ratified ([ADR-064](DECISIONS.md)).** A three-way inconsistency: the `requirements.md` template emits structured acceptance criteria as `{ id, given, when, then }`, ARTIFACTS.md documented `{ id, description }`, and `verify.js` `buildACCoverage` read `ac.text || ac.description` for a criterion-text label. Since the template never emits `text`/`description`, that label always resolved to `''`. **Impact was nil** — every consumer joins on the `ac_id`, and the text was never carried in the `ac_coverage` entry nor displayed. Resolved by ratifying `{ id, given, when, then }` as canonical: dropped the vestigial `text`/`description` read (`acMeta` now carries only `{ fr_id }`), documented the real shape in ARTIFACTS.md (legacy `{id,text}`/`{id,description}` still accepted — only `id` is load-bearing), no artifact in the wild breaks.
- **`BUGS.json#resolution` is no longer inert.** The field was seeded `null` at creation and never written by any command — a documented lifecycle field the CLI left blank while the SHA trail (`fix_commit_sha`/`close_commit_sha`/`files_changed`) carried the mechanical record. Added `aitri bug fix --resolution "..."` (the natural point — the resolution is known at fix; it persists through verify → close) and `aitri bug close --resolution "..."` (for a bug closed without a code fix — won't-fix, duplicate). The word-level "how it was resolved" now complements the SHA trail.

+4 tests (2 bug lifecycle, 1 canonical-AC-shape join, plus the persist-through-close case). AGENTS.md, ARTIFACTS.md, integrations/CHANGELOG (— additive) updated. Independent adversarial pass over the whole rc.139–142 audit-fix series before ship. `npm run test:all` green.

## [2.0.0-rc.141] — 2026-06-30 — connectivity-audit hygiene: stop authoring dead fields + document real ones (AUDIT-0630-D)

Two low-risk cleanups from the connectivity audit, bundled:

- **Templates no longer order the agent to emit a field no consumer reads.** `tests.md` mandated `type_coverage_matrix` "as a JSON field in the output", `requirements.md` put `implementation_level` in the FR schema example and offered a `product_analysis` field — all three had **zero readers** and were not even in the artifact schema (dead authoring: wasted tokens + false implication they matter). The *useful* parts stay — the Type Coverage Matrix remains a planning step (it drives the FR-type gates, it just isn't demanded as output), and the Product Analysis Vector still feeds `project_summary`. Locked by a new guard in `test/connectivity.test.js` so the emission orders can't silently return.
- **ARTIFACTS.md now documents three fields that shipped and are consumed but had drifted out of the schema** — `04_BUILD_REPORT.json#technical_debt[].reason`/`.effort_to_fix` (surfaced by `status`/`resume`), `05_TRACEABILITY.json#requirement_compliance[].title` (rendered by `export traceability`), `03_TEST_CASES.json#test_cases[].stub` (set by `adopt verify-spec`, read as a known gap by `verify-complete`). All additive, absence-tolerant — no code or shape change, the doc catches up to reality. See `docs/integrations/CHANGELOG.md` (— additive).

Independent adversarial pass on the diff before ship. `npm run test:all` green.

## [2.0.0-rc.140] — 2026-06-30 — the NFR acceptance criterion now reaches the phase that tests it (AUDIT-0630-D)

Connectivity-audit follow-up (Tier 1): closes the field-level shape of the rc.137 silent-drop. `extractRequirements` (`lib/phases/context.js`, Phase 1's `extractContext`, applied to `01_REQUIREMENTS.json` for every downstream phase) forwarded only `id`/`category`/`requirement` for each NFR — **not its `acceptance_criteria`**. But `requirements.md` instructs the PM to author that criterion as the *observable, measurable target* (and for a `category: "Regression"` NFR it is literally "how a test confirms it still works"), so Phase 3 was designing NFR tests blind to the very criterion Phase 1 wrote — the same "authored upstream, never delivered downstream" class the audit exists to catch, at field granularity. Now forwarded, exactly like the FR-level `acceptance_criteria` already is. Additive projection change (the briefing gains a field; no artifact-schema change — `nfr.acceptance_criteria` was already in ARTIFACTS.md). The other `extractContext`-dropped fields (`us.as_a/i_want/so_that`, `fr.description`, `tc.preconditions/steps/test_data`) were reviewed and deliberately left stripped — `given/when/then` + the ACs already carry the testable content, and the narrative strip is an existing tested contract. +1 test. `npm run test:all` green.

## [2.0.0-rc.139] — 2026-06-30 — connectivity audit, field + prompt dimensions: two more silent inputs closed (AUDIT-0630-C)

Completes the whole-flow connectivity audit's three previously-unaudited dimensions (field-level consumers, prompt-completeness, `.aitri`/`status --json` state) via a parallel producer→consumer trace of every artifact and field. **The flow came back overwhelmingly connected** — no hard artifact-level orphan, no dangling read that breaks, no state-field orphan, and every `status --json` field documented + emitted both ways. The audit found the same *instruction-level* defect class as rc.137 (a design that reaches the briefing but is never INSTRUCTED to be used) in **two** more places, both fixed here:

- **A — Phase 2 (architecture) now consumes the UX spec instead of dumping it.** `01_UX_SPEC.md` was interpolated into `architecture.md` under a `read-only context` header with **no directive** — the architect could design the whole system and never reflect the approved screens/flows. Neither the Traceability nor Human-Review checklist referenced it. Replaced with an instruction (guarded by the existing `{{#IF_UX_SPEC}}`): the Data Model must hold every entity/state the screens display, the API Design must expose an operation for every user action in the flows, and the System Architecture must account for the interaction patterns the design implies — an omitted field/endpoint is a design gap to reconcile or flag. Same class as the rc.137 phase-4 fix, lower blast-radius (phase 2 emits a design doc, and phase 4 later gets a strong directive on the same spec), but the design phase could still silently ignore the UX.
- **B — Phase 3 (tests) is now directed to design tests against the system design.** `02_SYSTEM_DESIGN.md` (a hard input) sat under a bare header in `tests.md` with no directive; the Type-Coverage and FR-type gates key off requirements, so a QA agent could write the full plan and never open the design. Added an instruction to exercise the real interface the design declares (method/path/request-response/signatures) and match test data to the Data Model, leaving no declared endpoint or integration seam untested.

Both directives render a real consumption instruction and the optional one (A) is stripped on a no-UX project (no leaked tokens) — locked by 3 new instruction-level connectivity tests in `test/connectivity.test.js` (the existing suite only guarded *declaration*-level wiring). Extends the ADR-063 principle (the design must reach AND be used by every phase that acts on it) to the architect and the tester. **Logged for follow-up (not in this commit):** template-mandated fields no consumer reads (`implementation_level`, `product_analysis`, `type_coverage_matrix`); the `extractContext` field allowlist dropping authored fields from downstream phase briefings (notably `nfr.acceptance_criteria`); and ARTIFACTS.md doc-drift (`technical_debt.reason`/`.effort_to_fix`, compliance `title`, the AC `given/when/then` vs `{id,description}` shape, `tc.stub`). `npm run test:all` green.

## [2.0.0-rc.138] — 2026-06-30 — whole-flow connectivity audit: two more "design doesn't reach the phase that needs it" gaps closed (AUDIT-0630-A/B)

A step-by-step audit of the entire pipeline + the verification gates (prompted by "10 adversarial passes missed the rc.137 bug — how do we trust the process, what else is disconnected?"). The honest finding: change-scoped adversarial review is blind to *un-changed structural gaps* — the right tool is a whole-flow connectivity audit checking BOTH consumption mechanisms (declared `inputs`/`optionalInputs` AND direct `readArtifact`). The flow + gates came back **connected**; the verification gates (`verify-run`/`verify-complete`) read everything they need, block on the right things, and their outputs are consumed by `computeHealth`/snapshot — and rc.137's design-fidelity TCs ride the existing TC→verify spine (a failing fidelity e2e blocks deploy, no new gate). Two same-class residuals found and closed:

- **A — code review now receives the design contract.** `phaseReview` consumed only requirements + test cases + build report, so it could not flag a deviation from the approved architecture or visual design. It now takes `02_SYSTEM_DESIGN.md` and `01_UX_SPEC.md` as **optional** inputs (not hard — `adopt apply --from` approves Phase 4 on the build report alone, so a hard input would block review on a brownfield adopt with no design doc; an adversarial pass caught this) and renders them (each in its own `{{#IF_…}}` block), plus a protocol step to flag design deviations.
- **B — the build briefing now surfaces the visual reference with paths.** Phase 4 was deliberately excluded from raw-context injection on the bet "the agent reads the mockup on request" — the Ledger pilot falsified that bet. When a UX spec exists, the build briefing now lists ONLY the visual reference assets (images + `.html`/`.htm` prototypes — the Ledger demo was `.html`, which the image-only filter first missed; the adversarial caught it) with their paths, a narrow exception (like the existing ADOPT-BUILD one) that respects the no-raw-context intent. Makes rc.137's "open the referenced mockups" instruction actionable.

Independent adversarial pass found both issues above (hard-input regression, `.html` exclusion) before ship; both fixed. +6 tests. `npm run test:all` green (1867). Remaining un-audited surfaces (command-flow internals, field-level consumers, prompt-completeness) noted for follow-up.

## [2.0.0-rc.137] — 2026-06-30 — the UX/design spec reaches the builder AND becomes verifiable (AUDIT-0630)

Root-caused from the Ledger pilot: a UI that passed every gate (63/63 TCs, smoke, lint, type-check, verify-complete) yet matched none of the client's approved mockups. The forensic trace through the real artifacts showed it was **not** the agent misinterpreting clear requirements, and **not** the honor-system ceiling — it was a mechanical gap: the visual design was captured (semantic color rules, expand/collapse, hover affordances all lived in `01_UX_SPEC.md`), but it never reached the build, and was never turned into verifiable test cases.

- **Build now consumes the UX spec.** `phase4.js` had no `optionalInputs` — phases 2 and 3 both pull `01_UX_SPEC.md`, but Phase 4, which *writes the UI*, did not. So the build agent only ever saw FR-003 (structural acceptance criteria), the TRD (architecture), and structural TCs — the design was absent from everything it read. Added `optionalInputs: ['01_UX_SPEC.md']` + a `## UX / Design Spec — the approved visual contract` block in `build.md` that reinjects the spec with a hard instruction: implement the declared design (semantic color, named affordances, interactions); the structural TCs do NOT guarantee fidelity; open the referenced mockups — tokens alone are not the design.
- **The design becomes verifiable.** `tests.md`'s UX block required state / mobile / contrast TCs but never the **declared-design behaviors** — so a structural-only suite passed over a UI that ignored the design. Added a **Declared-design fidelity TCs** requirement: semantic appearance rules (assert the computed style/applied class under the triggering condition, e.g. over-budget shown in the danger color), declared affordances (expand/collapse, hover/row actions, reorder handles present and functional), and key User-Flow interactions — all `type: "e2e"`. A colorless/affordance-less build now FAILS verify-run instead of passing it.
- Stack-agnostic: both blocks render only when a UX spec exists (a visual surface); absent on backend-only / no-UX-phase projects, no leaked template tokens. See [ADR-063](DECISIONS.md). +5 tests. `npm run test:all` green (1861).

## [2.0.0-rc.136] — 2026-06-30 — consolidate the blocking-bug predicate into one SSoT (AUDIT-0629-G)

Closes the structural root cause behind several AUDIT-0629 defects: a predicate reimplemented inline in two places that then drifted. The blocking-bug decision was the last remaining duplicate (the root deploy gate in `snapshot.aggregateBugs` and the feature gate in `bug.getBlockingBugs` each had their own copy — AUDIT-0629-B had to fix the same case-fold in both).

- **`lib/commands/bug.js` now owns the bug-state predicate SSoT** — `isActiveBug` / `isBlockingBug` (+ `bugStatus` / `bugSeverity`), case-folded once. Both gates filter through `isBlockingBug`, so they can no longer diverge (the R3-12 / AUDIT-0629-B failure mode). `openBugCount` / `getOpenBugs` use the same normalizers, so a capitalized `"Open"`/`"Critical"` is handled consistently in the resume display too (minor observable fix).
- **`docs/ARCHITECTURE.md` gains a "Shared predicate SSoTs" registry** — the canonical predicates (`isMustRequirement`, `HIGH_COMPLIANCE_LEVELS`/`EVIDENCE_OK_STATUSES`, `isActiveBug`/`isBlockingBug`, `isBehavioralFile`) with their consumers, and the honest note that a *general* mechanical detector of semantic re-implementation is not buildable — the real catch is the independent adversarial pass (which is what surfaced E/F). New shared predicates belong there, defined once.
- Behavior-preserving consolidation (the gates compute the same result, now via one function); a cross-consumer test locks that `getBlockingBugs` and the snapshot blocking count agree on the same bugs. +4 tests. `npm run test:all` green.

## [2.0.0-rc.135] — 2026-06-29 — export reuses the deploy-gate predicates instead of its own copy (AUDIT-0629-E/F)

The pending item from rc.134. `aitri export traceability` had reimplemented two predicates the Phase-5 deploy gate owns, and the private copies had drifted — so the rendered traceability matrix (a first-class product/QA document) could affirm a claim the gate rejects.

- **E — `export` no longer renders `complete` over a pending `manual` FR as clean.** Its `backed` check counted `fr_coverage` status `manual` as evidence, while `complete 5` rejects it ("a pending 'manual' is not evidence"). The claim-vs-evidence rule (`HIGH_COMPLIANCE_LEVELS` + `EVIDENCE_OK_STATUSES`) is now a single exported SSoT in `lib/requirements.js`, imported by **both** `phase5.js` (the gate) and `export.js` (the renderer) — they can no longer disagree. The renderer flags exactly what the gate rejects.
- **F — `export`'s MUST predicate is no longer case-sensitive.** It inlined `r.category === 'Regression'` (exact case), diverging from the hardened `isMustRequirement` SSoT (case/whitespace-insensitive, ADV-0622-06) — so a `category:"regression"` NFR silently lost its MUST priority label and coverage alarm in the matrix. `export.js` now imports and uses `isMustRequirement`.
- Pure SSoT-reuse: the Phase-5 gate behavior is unchanged (the extracted constants are byte-identical to the former locals); the only behavioral change is the renderer now agreeing with the gate. Verified by an independent adversarial pass over the change (gate identical, no `backed` regression — `covered` implies `tests_failing===0` by construction at `verify.js:507`, no import cycle). `docs/integrations/ARTIFACTS.md` claim-vs-evidence note corrected (it had documented the buggy "covered or manual"). +2 tests. `npm run test:all` green (1852).

## [2.0.0-rc.134] — 2026-06-29 — four verified defects from the harness-frame re-audit (AUDIT-0629)

After re-anchoring Aitri's identity to "the harness that makes agentic engineering rigorous" (rc.132), the whole codebase was re-audited with the correct lens — a defect is the code doing something different from what it *promises* (false-pass, false-block, crash, corruption), not "it can't guarantee good software" (the harness boundary by design). Four parallel adversarial passes over the highest-blast-radius subsystems, each finding re-verified against the code, then an independent adversarial pass over the fixes themselves (which caught three real follow-ups, folded in before shipping).

- **AUDIT-0629-A — `tc verify --evidence` no longer launders a runner verdict without a trace.** Overriding a TC the runner recorded as `fail`/`skip` to a different result now stamps `downgraded_from` on the results entry (parity with the guard `tc mark-manual` already had, ADV-0622-05) and prints a stderr warning — the override is never silent at the deploy gate. The stamp auto-clears if a later override is no longer a downgrade, so the trail can't contradict the live verdict. (`lib/commands/tc.js`; new optional `04_TEST_RESULTS.json#results[].downgraded_from`, additive.)
- **AUDIT-0629-B — a capitalized `severity`/`status` no longer false-passes the deploy gate.** `aggregateBugs` (root gate via `computeHealth`) and `getBlockingBugs` (feature gate) now case-fold before the blocking compare — a hand-written `"severity":"Critical"`/`"status":"Open"` in `BUGS.json` (a documented agent-written artifact) is correctly blocking, not `deployable:true`. The snapshot `bugs.list[]` is normalized too, so `resume` no longer self-contradicts (claim "1 blocker" while listing none). (`lib/snapshot.js`, `lib/commands/bug.js`.)
- **AUDIT-0629-C — `aitri feature <subcmd> ..` can no longer write the wrong `.aitri`.** The path-traversal guard that previously lived only inside `discard` is lifted to the shared resolution point, so every subcommand (`approve`/`complete`/`reject`/`tc`/`bug`/`init`/…) is refused before it can resolve `features/..` to the project root or a sibling and corrupt the committed shared state — directly protecting the multi-team git-handoff model. (`lib/commands/feature.js`.)
- **AUDIT-0629-D — a stray `null` in a hand-edited `events[]` no longer crashes the SSoT or the upgrade path.** Guards added at the two live snapshot sites (the builder's "malformed artifacts don't crash the builder" invariant) and the three `adopt --upgrade`/migration sites the independent pass found still exposed. (`lib/snapshot.js`, `lib/upgrade/index.js`, `lib/upgrade/migrations/from-0.1.65.js`.)
- Scoped OUT (separate change): the `export.js` predicate divergence (renders `complete` over a `manual` FR the deploy gate rejects; case-sensitive MUST predicate) — root cause is export reimplementing the SSoTs instead of reusing `isMustRequirement` + phase5's `OK_EVIDENCE`. Tracked as AUDIT-0629-E/F.
- +10 tests across `tc`, `snapshot`, `bug`, `feature`, `upgrade`. `npm run test:all` green (1850).

## [2.0.0-rc.133] — 2026-06-29 — run-binding hash tolerates whitespace/EOL-only rewrites (H2)

Surfaced by an adversarial review of the verification gates. The run-binding (Finding 1, rc.129) stamped the results-file hash on verify-run's in-memory output (LF, no trailing newline, no BOM), but verify-complete re-hashed the **raw bytes** read from disk. An external writer acting between the two commands — an editor's "insert final newline", a JSON format/pre-commit hook, or git's autocrlf on a cross-machine/CI checkout (the team handoff the committed `.aitri` exists to serve) — rewrites byte-level whitespace **without changing any result**, which false-blocked a legitimate run with a misleading "hand-edited" message.

- **New `hashResultsFile()` in `lib/state.js`** canonicalizes before hashing (strip BOM, CRLF→LF, trim trailing whitespace), applied on BOTH the stamp (`verify-run`, `tc verify`, the known-gap re-stamp) and the check (`verify-complete`). A whitespace/EOL-only difference now matches; a real edit (flipped status, changed count, added field) still changes non-whitespace bytes and is caught — JSON carries no data in inter-token whitespace. Kept separate from `hashArtifact`, which backs drift detection over phase artifacts (a byte-exact contract, left untouched).
- Backward-compatible: a hash stamped the old way still matches an unmutated file (the stamp input is canonical `JSON.stringify` output, so the two hashes coincide there).
- +4 tests: trailing-newline tolerance, CRLF tolerance, the non-weakening guard (a real `pass→fail` edit still blocks even with whitespace normalized), and a `hashResultsFile` unit. Suite 1840.

## [2.0.0-rc.132] — 2026-06-29 — the build phase suggests an independent adversarial pass before reporting done

The outcome of an architecture-critique session: a 5-proposal reform list was run through an adversarial panel, and **almost none survived** — the existing decisions hold (a mechanical smoke gate re-imports the rejected Aitri-owned probe; a load-bearing adversarial verdict is the ADR-053 verifier-with-conflict ceiling; file→FR is SCOPED-CHANGE's discarded honor-system; cross-feature overlap is trigger-gated). The honest finding: Aitri's reliability ceiling is set by its identity (zero-dep, passive producer, no API calls, semantic-quality-is-honor-system), and the existing gates already reach it. The **one** gap the panel approved: the independent-adversarial-subagent suggestion existed in the code-review / test / audit prompts (rc.118) but **not in the build phase** — exactly where the practice is highest-value (the session itself proved adversarial-on-implementation catches ship-blockers green tests miss).

- **`templates/phases/build.md` now includes an "Optional — adversarial pass before you report the build done" block**, mirroring the code-review one: spawn an independent subagent told to *break* the diff (wrong requirement, hollow assertion, untested path, green-but-never-runs), then verify its load-bearing claims against the code. Advisory — Aitri cannot run or gate on it (an agent-authored verdict is honor-system; gating would be theater, ADR-053). Framed exactly as the rule the maintainer codified this session: not a substitute for green tests, mandatory-by-default for real-blast-radius work, accumulate-and-batch the trivial. `templates/AGENTS.md` updated (build added to the subagent-suggestion list).
- PROMPT-mode only; no schema/contract/code change. Integration headers bumped for release-sync. +1 test (the build briefing renders the block). `npm run test:all` green.

## [2.0.0-rc.131] — 2026-06-28 — verify-complete surfaces low-confidence (hollow) tests at the deploy gate by default

Tier-1 #2 of the purpose-fulfilment plan — smaller than framed, because the gap was narrower than the review implied. `verify-run` **already** warned about low-confidence TCs (≤1 assertion — a `assert.ok(true)` test that credits its FR without exercising behavior) by default; only the *block* was opt-in (`strictAssertions`). What was silent by default was **`verify-complete`** — the deploy gate itself only mentioned them under `strictAssertions`.

- **`verify-complete` now emits a default advisory** when low-confidence TCs reached the deploy gate (strictAssertions off): it lists them and notes "Not blocking — confirm each genuinely verifies its expected_result; set strictAssertions to make it a hard gate." Mirrors the existing MUST-NFR-skip advisory — surfaces "green ≠ exercised" at the moment of deciding to ship, not only when the suite ran. **Advisory, never a default block** (a hard default gate would false-fire on legitimately terse tests; `strictAssertions` stays the opt-in gate).
- No schema/contract change (reads the existing `low_confidence_tcs`); integration headers bumped. `templates/AGENTS.md` updated. +1 test; `npm run test:all` green.

## [2.0.0-rc.130] — 2026-06-28 — `aitri export traceability`: structured artifacts as human-readable Markdown (ADR-062)

Closes the documentation gap the purpose review surfaced (`docs/Aitri_Design_Notes/_purpose-fulfilment-plan-0628.md`, Tier-1 #1). Aitri's first-class "documentation product/QA read without code" output ships the structured artifacts (PRD, test plan, traceability) as **JSON**, whose human-readable form was delegated to Hub — which is being rebuilt. So today there is no human-readable path for them from Core. The deferred `aitri export` (G-3) was waiting for "a consumer needs the rendered form without Hub"; Hub being down IS that consumer-need.

- **New read-only command `aitri export traceability [--format md] [--out <file>]`.** Renders the **traceability matrix** — requirement × test cases × pass/fail × coverage × compliance — as a Markdown table, the highest-value QA document and the least readable as raw JSON. Joins `01_REQUIREMENTS.json` (the spine: id/title/priority) with `03_TEST_CASES.json` (TC→requirement), `04_TEST_RESULTS.json#fr_coverage` (✓pass ✗fail ⊘skip), and `05_TRACEABILITY.json#requirement_compliance` (level). **Read-only** — reads existing artifacts, writes only the derived export (stdout, or `--out`); never mutates the pipeline. **Degrades gracefully** — built from whatever artifacts exist (a pre-Phase-5 project shows `—` for compliance). Zero-dep, stack-agnostic; purpose-written Markdown (render.js cannot build a table).
- **It is a verification document, so it DERIVES and FLAGS cross-artifact inconsistency rather than rendering each field verbatim** (an adversarial pass showed a naive renderer would pacify a failing reality — worse than no matrix): a compliance level that over-claims past the test evidence shows `⚠ <level> (vs tests)`; an uncovered/failing MUST shows `⚠`; a coverage entry whose requirement id is absent from `01` is surfaced as an orphan warning; a present-but-unreadable source is flagged (not silently treated as absent); the test-case column **unions** the live `03` with the compliance `tc_ids` so a stale `05` cannot hide current TCs. `--out` refuses to write into the artifacts directory or over an artifact-chain file (no clobbering the spine), and pipes are entity-escaped so a value cannot break the table.
- **Scope (smallest-first):** only the `traceability` matrix this release; `requirements` / `tests` renderers are the next slices of the same read→render pattern. Root scope only (feature-scoped export is a follow-up).
- New command → ADR-062; no `.aitri`/artifact schema change (a derived export, not part of the chain); integration headers bumped for release-sync. `templates/AGENTS.md` + `help` updated. +8 tests (matrix join, pipe-escaping, compliance-tc_ids preference, graceful degradation, missing/malformed spine, `--out`, unknown sub, bad format). `npm run test:all` green.

## [2.0.0-rc.129] — 2026-06-28 — spine hardening from the purpose review: deploy-gate run-binding + Phase-2 design↔FR advisory

A 4-agent adversarial review of whether Aitri fulfills its purpose surfaced two fixable spine holes. Both fixed here; the broader gaps (verification depth, structured-docs consumability, team-scale) are captured in a roadmap (`docs/Aitri_Design_Notes/_purpose-fulfilment-plan-0628.md`).

- **Deploy-gate run-binding (Finding 1).** `verify-complete` trusted `04_TEST_RESULTS.json`'s content without binding it to a real execution — a hand-written/edited results file (all-pass) reached "deployable." Now `verify-run` (and `tc verify`) stamp `.aitri#verifyResultsHash` = SHA-256 of the results file they write, and `verify-complete` **blocks on a mismatch** ("results-hash mismatch — re-run verify-run"). Closes the realistic "ran verify-run, saw failures, edited the results to pass" shortcut. **Honest ceiling (not theatre, not a total fix):** an absent hash (pre-rc.129 / externally-produced file) is not blocked (backward-compatible), and a fully-adversarial agent that also rewrites the stamp in `.aitri` is not stopped (the file is writable) — the spine makes the file harder to forge, it cannot make it impossible. New shared `.aitri` field `verifyResultsHash` (additive).
- **Phase-2 design↔FR advisory (the largest *unnecessary* honor-system hole).** `phase2.validate(content)` gets no `dir`/config, so it structurally cannot check the design against the requirements — a design that silently omits a MUST FR passed every gate. `runReview` gains a `phase2` scope (and `complete 2` invokes it) that surfaces each MUST FR whose id is not referenced in `02_SYSTEM_DESIGN.md`. **Advisory, not a hard block** — the design is prose and may reference a requirement by description, so a hard string gate would false-fire on a good design (the no_go_zone-leak trap); the human confirms at `approve 2`. Honest ceiling: Aitri checks the id appears, not that the design addresses it.
- Contract: new `.aitri#verifyResultsHash` → `docs/integrations/SCHEMA.md` + integrations CHANGELOG (additive). No artifact-schema change. `templates/AGENTS.md` updated (consumer-facing: don't hand-edit the results file; Phase-2 design-coverage note). +8 tests (run-binding match/edit/absent + tc re-stamp; phase2 warn/MUST-only/clean/absent-design). `npm run test:all` green (1821).

## [2.0.0-rc.128] — 2026-06-28 — `.aitri` merge-conflict refuses-don't-reset + tc-verify skip-partition fix (adversarial-review batch)

Post-adversarial-review fix batch (4-agent review @ rc.127). Two behavior fixes + doc-truth corrections.

- **`.aitri` merge conflict no longer silently wipes the pipeline (G-4).** `loadConfig` (`lib/state.js`) reset to DEFAULTS on any malformed `.aitri` — and an unresolved git merge conflict leaves marker lines (`<<<<<<<`/`=======`/`>>>>>>>`) that are invalid JSON. So a routine team merge of the *committed* `.aitri` made the next `aitri` command silently discard shared state (currentPhase, approvedPhases, drift baseline). It now **detects conflict markers and refuses** with actionable guidance ("resolve the conflict; Aitri will NOT reset the file") instead of resetting. Throws (no `process.exit` — `state.js` is a library, not a command); the CLI dispatcher (`bin/aitri.js`) prints the message cleanly. The read-only snapshot aggregator passes `tolerateConflict` so a single conflicted *feature* config degrades to a flagged `parseError` entry instead of aborting the whole `status`/`resume`/`validate` view (the snapshot resilience contract). A genuinely-malformed-for-other-reasons `.aitri` keeps the old backup-and-reset behavior. This bites exactly the team target the committed `.aitri` exists to serve.
- **`tc verify` keeps the skip partition consistent (C-2).** `ARTIFACTS.md` documents `skipped_e2e + skipped_no_marker === skipped`. `tc verify` recomputed `skipped` but carried the two partition fields forward stale (the verify-run snapshot), so a skip→pass/fail transition could leave `skipped_e2e + skipped_no_marker > skipped`. New `recomputeSkipPartition` twin (mirrors `recomputeFRCoverage`/`recomputeACCoverage`) reclassifies the current skip results by TC type; only recomputes when the partition fields already exist (never invents them).
- **Doc-truth (A-2):** `coverage_map`'s "teeth" are an *agent-performed* diff, not a mechanical Aitri operation. `ARTIFACTS.md` + `ARCHITECTURE.md` now say `audit requirements` "directs the agent to diff" (was "diffs"), so a consumer doesn't expect Aitri to have computed it.
- **Hygiene:** removed a Spanish help-example string in `tc verify` (English-only repo invariant, A-5). `ARCHITECTURE.md` anchor brought current (rc.125→rc.128) with rc.125/126/127/128 evolution rows (A-1 — the stale-anchor rule CLAUDE.md enforces).
- No `.aitri`/artifact schema change (a behavior fix + doc clarification); integration headers bumped; integrations CHANGELOG notes the `coverage_map` description clarification. +tests (G-4 refuse-on-conflict; C-2 partition consistency); `npm run test:all` green.

## [2.0.0-rc.127] — 2026-06-28 — verify-run: stack-neutral fallback when no test command is declared (FALLBACK-DEFAULT-0628)

- **Removes the last Node bias in the verification spine.** When neither `--cmd` nor `04_BUILD_REPORT.json#test_runner` is declared, `verify-run` no longer blindly runs `npm test` — which silently ENOENTs / mis-runs on a Python/Go/.NET project (a stack-agnostic-tool violation, principle 4). It now falls back to `npm test` **only if a `package.json` is present** (Node projects relying on the implicit default are unchanged); otherwise it refuses with stack-neutral guidance (declare `test_runner` — e.g. `pytest tests/ -v`, `go test ./...`, `dotnet test`, `npm test` — or pass `--cmd`).
- **Regression-safe:** declared `--cmd`/`test_runner` unchanged; **all-manual** projects still seed results without a runner (no false demand for a command). +2 tests; `npm run test:all` green.
- No artifact/`.aitri` schema change (a verify-run behavior change); integration headers bumped. This is the FALLBACK-DEFAULT-0624 backlog item, graduated under the recalibrated go/no-go (code-verified invariant violation → build it, no external-consumer wait).

## [2.0.0-rc.126] — 2026-06-28 — smoke/quality gate: single-executable contract + shell-operator advisory (SMOKE-GATE-0628)

- **Closes a silent mis-run in smoke gates.** quality_gate commands run WITHOUT a shell (`runQualityGates` → `spawnSync`, `shell:false`), so an inline chain like `npm start && curl ...` passes `&&`/`curl` as literal arguments and only the first program runs — a boot-and-probe smoke gate written that way silently does nothing while still reporting a result. The contract (`ARTIFACTS.md`) and the three smoke-instruction sites (`build.md`, `AGENTS.md`, `developer.js`) now state the command must be a single executable/script (e.g. `./smoke.sh`), never an inline `&&`/`;`/`|` chain.
- **Mechanical advisory (not docs alone):** `verify-run` now flags a quality_gate command carrying a standalone shell operator (read-only, never blocks) so the author moves multi-step logic into a script. New exported helper `gatesWithShellOperators`; +1 test; `npm run test:all` green.
- **Scope decision (5-reviewer go/no-go):** rejected both a blocking "require a smoke gate" (presence-theater — a hollow `true` passes; would not have caught the documented SMOKE-RUN loss) and an Aitri-owned boot-and-probe runner (process-lifecycle + CI false-fails + crosses the passive-producer line). The real, code-verified defect was the silent shell-chain; the Aitri-owned probe is recorded as a deferred opt-in pending a real signal.
- Contract: `docs/integrations/ARTIFACTS.md` + integrations CHANGELOG (clarification, additive). No `.aitri`/artifact schema change. `templates/AGENTS.md` updated (consumer-facing).

## [2.0.0-rc.125] — 2026-06-28 — adoption builds are grounded in the existing code (ADOPT-BUILD-0628)

- **Phase 4 (build) now surfaces `ADOPTION_AUDIT.md` to the agent on an adopted project**, with an explicit instruction to read the audit AND the actual current source of every file it will touch *before* modifying. Closes a real gap: the build phase is otherwise context-excluded (`CONTEXT_PHASES`, `run-phase.js`) and `context.js` reads no source — so on an adoption (an existing codebase, e.g. a major-version migration) the agent built against an upfront, code-unaware design and could modify/replace code it had never read.
- **Narrow by design:** only the adoption-audit pointer (NOT the asset folder — mockups/assets stay spec-definition input; the original execution-phase exclusion is preserved), only the build phase, only when an `ADOPTION_AUDIT.md` exists. **Greenfield is byte-identical** (no audit → no block). Works at root (audit in `idea_context/`) and for a feature sub-pipeline built inside an adopted project (parent's `idea_context/`).
- Scope: `lib/commands/run-phase.js` only (one assembly point). No artifact/`.aitri` schema change (surfaces an existing artifact to one more phase's briefing); integration headers bumped for release-sync. `templates/AGENTS.md` audited — unchanged (the briefing carries the instruction). +2 tests (adoption build gets the block; greenfield build does not). Validate next against the Umbraco 10→17 pilot.

## [2.0.0-rc.124] — 2026-06-25 — intent coverage map: make idea→requirement decomposition visible & comparable (ADR-060)

- **New `01_REQUIREMENTS.json#coverage_map`** — `[{need, disposition}]`, the agent's idea→requirement decomposition externalised: every distinct need in the seed → an FR/NFR id or `"out_of_scope"`. Attacks the recurring **silent scope loss** (a need decided in ideation but never built and never declared out-of-scope — Ledger `budget`/D-7). Continues the rc.119 `no_go_zone` gate: from "the out-of-scope list exists" to "every need is accounted for, visibly".
- **Two layers, by design:**
  - **Phase-1 gate (light, `phase1.js`):** fresh-seed only (same lifecycle as the provenance gate — skipped once Phase 1 is approved, so existing projects never trip it, no migration). Checks structural validity: `coverage_map` present + non-empty, each entry has a `need` and a `disposition` that is `"out_of_scope"` or a real FR/NFR id. This is **not** the teeth — it cannot verify the list is complete (the agent fills it; a never-surfaced need is absent here too).
  - **The teeth — independent comparison (`audit requirements`):** the audit now receives the declared `coverage_map` and is instructed to **re-derive the needs itself first**, then **diff**: (a) a need it found that is absent from the map = the silent drop; (b) a map entry wrongly `out_of_scope`; (c) a map entry whose FR doesn't cover the need. This turns "is anything missing?" (open-ended re-derivation) into a concrete set comparison — and makes the same catch cheap for the human reviewing at `approve`.
- **Honest ceiling (stated in ADR-060):** the map raises the odds of catching a dropped need (a second party can now compare two lists instead of re-deriving from scratch); it does not guarantee it (two independent passes can miss the same need). It is the strongest available mitigation in a passive prompt generator, not a solve.
- `templates/phases/requirements.md` + `lib/personas/pm.js` instruct the map (granularity = one entry per user-facing need, the same decomposition already taught). `lib/commands/audit.js` (`buildCoverageMapSummary`) + `templates/phases/auditCoverage.md` + the protocol wire the diff. Contract: `docs/integrations/ARTIFACTS.md` + CHANGELOG (additive — new optional field). +14 tests (gate: present/non-empty/valid-refs/skip-when-sealed/NFR-id/back-compat; audit: map fed + diff instruction + absent-degrades). ADR-060. Adversarially reviewed.

## [2.0.0-rc.123] — 2026-06-25 — two operator-facing reminders (TC-DRIFT-0625 + REQ-RICHNESS-0624 feedback-channel)

Two cosmetic output nudges from the backlog hygiene batch — both turn a designed-but-surprising behavior into an understood one. No behavior change, no gate, no contract.

- **`tc mark-manual` now explains the Phase-3 drift it causes (TC-DRIFT-0625).** `mark-manual` mutates `03_TEST_CASES.json` without re-stamping the hash (deliberate, R3-24 anti-laundering: a relabel must leave a trace). When Phase 3 is already approved that surfaces as drift and forces a re-approval, which surprised operators using the intended tool. It now prints a one-line explanation at the call site (review the change, then `rehash 3` / re-`approve 3` to re-seal) — **only when Phase 3 is approved** (otherwise no hash is stored, no drift to explain). Scope-aware (root vs `feature`). The drift behavior is byte-identical — this only explains it.
- **`complete` reminds that changes go through `--feedback`, not free chat (REQ-RICHNESS-0624).** After `complete <phase>`, a tip points the operator at `run-phase <phase> --feedback "..."` (which re-runs with the phase persona) for adjustments, warning that ad-hoc free-chat edits drift from the role the phase is meant to hold. Aitri can't enforce persona fidelity (passive prompt generator), but it can point at the channel that re-anchors it.
- +3 tests. No `.aitri`/artifact schema change; `templates/AGENTS.md` audited — unchanged (these are output reminders, not new rules).

## [2.0.0-rc.122] — 2026-06-25 — feature-scoped coverage audit (AUDIT-COV-FEAT-0625 fork 2)

- **New: `aitri feature <name> audit coverage`** — the idea→FR completeness check, now at feature scope. Compares the FEATURE's own intent (live `FEATURE_IDEA.md` pre-approve, or the absorbed `01_REQUIREMENTS.json#original_brief` post-approve) against the FEATURE's functional_requirements, so a need the feature decided to implement but silently dropped is caught — the exact gap behind Ledger `budget`/D-7, where the operator had to trace `FEATURE_IDEA.md → feature FRs` by hand because no feature-scoped coverage audit existed (`feature.js` had no `audit` case).
- **Scoped to the feature, not the parent:** the auditor is told to compare the feature's intent against the feature's FRs only — a feature legitimately covers just its own increment. Preserves ADR-048 independence (same fresh-session coverage-auditor, just feature-scoped inputs); does NOT turn the root audit into a cross-pipeline crawl.
- **Bounded surface:** only `coverage` is supported at feature scope; `aitri feature <name> audit <plan|security|...>` errors with guidance to run those at the project root (whole-codebase scope). `buildIntentSources` gained an optional `featureRoot` arg that switches the live-seed lookup to `FEATURE_IDEA.md` via `seedPath` (the archived seed is never read as current intent — AGENTS.md contract). `coverageAuditLastAt` records on the feature's own `.aitri`.
- **Why fork 2 and not fork 1 (widen the root audit's universe):** for an advisory audit whose job is to find gaps, over-reporting is the safe failure mode — fork 1's loose match risks marking a root need "covered" by a feature FR when it isn't, hiding a real gap (the expensive direction). Fork 2 is additive, zero risk to existing behavior, and has the strongest standalone evidence. Fork 1 stays in the backlog with that risk noted (strict-match only). Fork 3 (modifies/extends provenance) stays blocked — the link does not exist yet.
- **Renamed `audit coverage` → `audit requirements` (non-breaking).** The word "coverage" collided with test coverage (`verify-run --coverage-threshold`); `requirements` is parallel to `audit security` and names what it checks. `coverage` is kept as a **deprecated alias** that still routes to the same audit and prints a one-line rename note — so existing consumer AGENTS.md instructions and scripts keep working. Done now while adoption is minimal (cheaper than at the v2 freeze). Internal names unchanged (the `coverage-auditor` persona, the `coverageAuditLastAt` `.aitri` field — a schema contract — and the `auditCoverage.md` template stay; only the user-facing command word changed). All surfaces updated: help, `resume` nudge, `audit plan` routing prose, AGENTS.md.
- No artifact-chain or `.aitri` schema change (new command + an additive optional param + a CLI alias). `templates/AGENTS.md` + `templates/phases/auditCoverage.md` (a UI-conditional scope note) updated. +7 tests (feature dispatch requirements/alias/reject, `buildIntentSources` feature-seed, feature-framed briefing pre/post-approve, canonical-vs-alias + deprecation note). Adversarially reviewed.

## [2.0.0-rc.121] — 2026-06-25 — smoke-gate instruction + advisory nudge (SMOKE-RUN-0625 Layer A)

- **The gap (verified across three real sessions, one project abandoned):** a feature passes every gate — 5 phases approved, `verify ✓`, lint/typecheck/security green, full test suite green — and Aitri reports **deployable**, yet the app 500s on every route on first boot. Aitri never executes the *running* product: `verify-run` only runs the test suite + project-declared `quality_gates`, none of which boots the app. Green tests ≠ app runs.
- **Layer A — PROMPT mode + advisory nudge (no contract change).** `quality_gates` is already open-ended, so a project can already declare a smoke gate that boots the app and gates on exit code — the gap was that **nothing instructed the agent to create one**.
  - **`templates/phases/build.md` + `lib/personas/developer.js`:** a new smoke-gate instruction in the `quality_gates` guidance — *for a target that serves requests (web app, HTTP API, service)*, declare a `{name:"smoke", command:"<boot the app, hit key entry points, fail on a server error>"}` gate. **Stack-agnostic (principle 4):** conditional on a serving target, with HTTP/5xx only as an example; a library/CLI/batch target is told to skip it ("do not invent a server"). Persona reinforcement is REASONING (conditional), not an absolute CONSTRAINT.
  - **`lib/commands/verify.js`:** an advisory nudge (read-only stderr, never blocks — mirrors the mutation-gap nudge) when a target with UI FRs (ux/visual/audio) declares no app-executing gate. Two new exported helpers: `hasUISurfaceFRs` (canonical UI-surface FR set) and `hasAppExecutingGate` (heuristic: smoke/e2e/health-check in gate name, or a distinctive tool signature — playwright/cypress/curl/etc. — in name or command; supertest excluded as in-process). The nudge is the sensor that surfaces a missing smoke gate in the moment.
- **Honest ceiling:** Layer A closes the boot/route-health case (app boots and serves). It does NOT validate the real *render* (a 200 with broken layout) — that is Layer B (visual/e2e), deferred as a study with its own promotion criterion. C1 (fake-pass) is orthogonal and unaffected — there the tests are fake; here the tests are real but the app is never run.
- `templates/AGENTS.md` smoke-gate bullet added to the verify-run rigor signals. No artifact-chain or `.aitri` schema change. +8 tests (helpers, stack-agnostic wording, persona, e2e nudge fire/silent across UI/has-gate/non-UI). Adversarially reviewed (independent subagent): caught the `audio` omission vs the canonical UI set and the `e2e`-in-path false-suppression — both fixed before ship.

## [2.0.0-rc.120] — 2026-06-25 — `aitri feature discard <name>` (FEAT-DISCARD-0624)

- **New command: `aitri feature discard <name>`** — safe retirement of a cancelled/descoped feature. Deletes the feature sub-pipeline directory (feature discovery is purely directory-based, so it cleanly disappears from `list`/`status`/`resume`/`validate`). **isTTY-gated** with a confirmation prompt — destructive + state-committing, like `approve`/`rehash`/`reconcile --resolve` (invariant 7); an agent cannot run it.
- **The core value (why it's not just `rm -rf`):** if the feature reached Phase 4 it contributed code to the SHARED codebase (`lib/`, `tests/` outside the feature dir), and deleting the feature dir does NOT revert that code. Discard reads `04_BUILD_REPORT.json` and **surfaces** the `files_created`/`files_modified`/`test_files` it touched, warning they are NOT removed — review/revert via git. Aitri never auto-reverts shared code (that is git's job — principle 1). The surface step is guarded so a feature below Phase 4 (no build report) or a malformed report never crashes discard. A path-traversal guard rejects names that aren't a single path segment (a `..` name would otherwise resolve to the project root).
- No artifact-chain or `.aitri` schema change (discard only reads the build report). `templates/AGENTS.md` updated to point agents at `discard` over `rm -rf` when cancelling a feature.

## [2.0.0-rc.119] — 2026-06-25 — `no_go_zone` content gate in Phase 1 (REQ-RICHNESS-0624)

- **Phase 1 now enforces `no_go_zone`.** `aitri complete 1` / `approve 1` requires a non-empty `no_go_zone` array — **≥3 items for root pipelines, ≥1 for feature sub-pipelines** (same feature-floor logic as the FR/NFR minimums). The PM persona always declared an explicit out-of-scope list mandatory ("ambiguous scope is a defect") and the templates teach ≥3, but nothing enforced it: an empty or missing `no_go_zone` passed validation, leaving Phases 2/3/4 — which all read `no_go_zone` to NOT design, test, or build out-of-scope items — without a scope boundary.
- Closes a persona↔gate inconsistency surfaced in the REQ-RICHNESS-0624 study (the cleanest mechanically-checkable item). Contract documented in `docs/integrations/ARTIFACTS.md` + CHANGELOG (marked breaking — an in-flight project re-approving Phase 1 with an empty `no_go_zone` is now blocked until it declares the items).

## [2.0.0-rc.118] — 2026-06-24 — optional independent-subagent suggestions in review/test/audit prompts

Capability-conditional **suggestions** (never gates) that nudge the agent toward an independent adversarial subagent pass where it has the most evidence-backed value — the failure mode this prevents is self-review excusing the blind spot that produced the work. Aitri is a passive prompt generator: it cannot run a subagent, cannot verify one ran, and cannot assume the harness supports one, so these are explicitly framed as optional, token-costing, and the operator's call. No mandate ("MUST use a subagent" would be theater) and no schema/gate change.

- **Code review (`phaseReview.md`):** an "Optional — independent adversarial pass" block suggesting a subagent told to *refute* the code (untested path, false-passing assertion, crashing edge) before approving.
- **Test design (`tests.md`):** an "Optional — independent edge-case sweep" block suggesting a subagent tasked only with the cases not written (negative input, boundary, security-NFR attack vector).
- **Audit / security (`audit.md`, `auditSecurity.md`):** an "Optional — multi-lens fan-out" block suggesting several subagents with *distinct* lenses over the existing code — general lenses (correctness, security, performance) for the broad audit, security-specific lenses (authz/authn, injection, data exposure) for the security audit.
- **`templates/AGENTS.md`:** an umbrella bullet framing these as suggestions the operator decides on given token cost — so the nudges are understood as opt-in, not gates.
- +8 tests (rendered-output presence + optional/token-cost framing + no-mandate assertion across the four prompts). 1749 passing. Stack-agnostic (principle 4): the suggestion degrades to a no-op on a harness without subagents. No artifact/`.aitri` schema change.

## [2.0.0-rc.117] — 2026-06-23 — CI gate flag + audit-grounding/stack-agnostic prompt fixes + dead-code dedup

The remaining §12 P3 items that, on closer inspection, are real defect-fixes rather than speculative prose — plus an opt-in CI gate and an internal dedup. (Items still deliberately deferred: CRLF/BOM hash re-baseline, cross-process locking, and a broad stack-agnostic prose rewrite — those remain speculative or carry an unowned migration ripple.)

- **`aitri validate --ci` (ADV-0622-27):** validate is a reporting command and exits 0 by default, so a CI step running it silently passes even when the project is not deployable. The opt-in `--ci` flag turns the deploy-gate verdict into the exit code (non-zero when not deployable); output is unchanged. (`verify-complete` already exits non-zero for the test gate; this closes the holistic-readiness footgun.)
- **Audit-grounding prompts (ADV-0622-08):** the `idea_context/` briefing note is now phase-aware — at Phase 1 / discovery it says the material is PRIMARY input (nothing upstream is approved yet) instead of the misleading "approved artifacts are the source of truth — reference only." `ADOPTION_AUDIT.md` is singled out by name as the existing-code reality to ground the phase in, and Phase 3 (`tests.md`) now nudges the agent to turn the audit's Must-Not-Break/regression risks into concrete negative/edge test cases.
- **Stack-agnostic prompt fixes (ADV-0622-12, principle 4):** web-specific imperatives that reached CLI/library/embedded projects as commands are now conditional — the ADR list ("database choice, frontend framework…") generalizes to "one ADR per significant tech choice the stack actually involves"; the `/health` endpoint + API-surface bullet applies "for a networked service"; the injection-prevention bullet is cased ("IF it runs DB queries… IF it renders HTML…"). An imperative bound to a specific stack was a defect against principle 4.
- **Scope-creep pump removed (ADV-0622-40):** `requirements.md` no longer says "if you have fewer than 8 MUSTs, revisit" — that contradicted the file's own MVP-proportionality/anti-scope-creep rules. It now says: capture every MUST the scope genuinely needs and no more; don't pad to a number.
- **`coverage_goal` placeholder (ADV-0622-43):** the hardcoded `"80%"` in the `tests.md` schema example is now a placeholder ("your call, nothing keys off this value"), so it stops propagating a box-checking metric.
- **Dead-code dedup (ADV-0622-39):** `snapshot.js` no longer carries a duplicate `.aitri` path resolver — it uses state.js's `configFilePath`/`configExists`, so the layout logic is single-source (the header invariant is now true, not aspirational).
- +7 tests (validate --ci x4 incl. `--json --ci` purity, audit-seam end-to-end, loadConfig key-collision + malformed-local). 1741 passing. No artifact/`.aitri` schema change. Adversarially diff-reviewed (clean; one LOW `--json --ci` stdout-purity wart caught and fixed).

## [2.0.0-rc.116] — 2026-06-23 — verifier-floor + latent-robustness hardening (selected §12 P3 cluster items)

The defensible subset of the deferred §12 P3 clusters — items with real, verifiable value and low risk. **Explicitly NOT done** (and why): the CRLF/BOM hash normalization (ADV-0622-34 — carries a one-time re-baseline ripple that must be owned as a migration, not batched), `--ci` exit codes for validate/verify-run (ADV-0622-27 — no consumer asking; a flag nobody uses is speculative), the stack-agnostic prompt nudges (cluster 34 — ADR-046: leave the web case untouched absent a concrete non-web consumer), and the cross-process locking (R3-1/2/13 — low value against Aitri's sequential single-agent model).

- **Coverage matchers anti-spoof (ADV-0622-10):** `parseCoverageOutput` no longer matches an arbitrary log line (`Copying All files | 100 done`, `See the coverage: 100% claim`) as a coverage figure that could pass a `required` coverage gate. The istanbul/`all files` row is line-anchored (it is emitted at column 0); the `go test -cover` figure is matched on go's signature suffix (`% of statements`) because go prints it INLINE on the `ok` line — the adversarial diff-review caught that an initial line-anchor on the go matcher silently broke real `go test -cover` parsing (masked by an unrealistic test fixture), so the fixture was corrected to go's real inline form and a multi-package case added.
- **Atomic data writes (ADV-0622-33):** `atomicWrite` (write-temp-then-rename) is now exported and backs every JSON data/spec file Aitri itself writes — `04_TEST_RESULTS.json` (verify-run + tc verify), `03_TEST_CASES.json` (tc mark-manual), `01_REQUIREMENTS.json` (approve embeds original_brief), `BUGS.json`, `BACKLOG.json` — so a mid-write kill can't truncate them. (The diff-review flagged two same-class writers initially left on bare writeFileSync; both folded in.)
- **Cascade clears the stale run snapshot (ADV-0622-28):** a phase-3/4 cascade now also drops `lastVerifyRun` + `verifyRanAt` (it already cleared `verifyPassed`/`verifySummary`), so the next-action ladder doesn't read a pre-cascade run and misroute to verify-complete.
- **`--cmd` substitution surfaced (ADV-0622-36):** when `verify-run --cmd` replaces the manifest `test_runner`, the report records an additive `runner_override` field (`{ used, manifest_runner }`) and a stderr note — the deploy-gate evidence's provenance is now visible downstream. Not a gate (`--cmd` is a legitimate escape hatch).
- **`--results` staleness warning (ADV-0622-11):** an explicit `--results <FILE>` is still honored verbatim (a deliberate attestation), but `verify-run` now warns when the file predates the run start — a stale/committed result file crediting phantom passes is surfaced, not silently trusted.
- **`saveSplit` anti-churn (ADV-0622-23):** the shared-config no-churn compare normalizes through a JSON round-trip, so a shared field set `= undefined` (dropped on write) no longer re-dirties `.aitri` on every save.
- +8 tests. 1734 passing. Additive only: new optional `04_TEST_RESULTS.json#runner_override` field (ARTIFACTS.md + integrations CHANGELOG updated). The diff-review caught a real HIGH regression (go coverage) + a consistency gap before commit — both fixed here.

## [2.0.0-rc.115] — 2026-06-23 — close the no-downgrade gap `aitri init` missed (rc.111/rc.112 diff-review)

The 2-agent adversarial diff-review of rc.111 + rc.112 (never independently reviewed before) found ADV-0622-13 (no silent version downgrade) was applied to `runUpgrade` and both `adopt apply` sites but **missed `aitri init`** — which is re-runnable on an existing project. `compareVersions` itself verified fully correct (truth table), and the dangerous flow modes (feature-init ordering, `adopt --from` false-approval) were confirmed provably blocked.

- **`init` no longer downgrades the recorded version (ADV-0622-13):** re-running `aitri init` with an older CLI on a project whose committed `.aitri` records a newer version now KEEPS the newer version (same `compareVersions` guard as `runUpgrade`/`adopt apply`), instead of silently rewriting it down and flip-flopping the committed `.aitri` between teammates.
- **`adopt apply` message honesty:** the "aitriVersion will be updated to X" note is now computed from the same downgrade guard — on a downgrade it says the version stays at the newer recorded value, instead of falsely claiming an update.
- +1 test (init re-init with an older version leaves the recorded version untouched). 1726 passing.
- **Deferred (latent, documented):** `compareVersions` returns 0 on an unparseable version (e.g. a hypothetical `2.0.0-beta.1` or build-metadata form), so the guard fails OPEN there — but no such version grammar has ever shipped; the fail-open is deliberate and tested. Revisit only if the version grammar widens.

## [2.0.0-rc.114] — 2026-06-23 — P3: coherence / dead-code / guardrail cleanup sweep

P3 batch from the 2026-06-22 review (§12) — tier-3 coherence, dead-code, and one latent guardrail. Adversarially diff-reviewed before commit (ship-clean; one doc-completeness nit fixed). Deferred (with rationale): the latent concurrency/atomicity hardening, the CRLF/BOM hash re-baseline (carries a migration ripple to own separately), the verifier-ceiling residuals, and the speculative stack-agnostic prompt nudges (ADR-046 — leave the web case untouched absent a concrete non-web consumer).

- **Template well-formedness guardrail (ADV-0622-17):** `render()` now validates the RAW template for balanced, non-nested `{{#IF_KEY}}…{{/IF_KEY}}` blocks and throws at generation time — a nested/mismatched/orphan/unclosed IF can no longer silently leak raw template syntax into a tier-1 prompt. Validates the template skeleton (not the rendered output), so a data value containing `{{` never trips it. Latent today (no template nests); the guard ships before the first one can.
- **Build manifest field (ADV-0622-41):** `build.md` instructs the agent to list `.github/workflows/ci.yml` in `files_created` (the real manifest field), not the non-existent `implementation_files`. Grep guard added.
- **Phase-3 coverage error string (ADV-0622-04):** the <3-TC error no longer claims `edge_case` is enforced — the gate enforces `happy_path` + `negative` (+ the `h`/`f` id suffixes); the edge case is recommended as the third, not gated. Text-only (per the FIX_FLAWED note: do NOT add edge_case enforcement — it would break the contract).
- **CLAUDE.md invariant correction (ADV-0622-20):** the isTTY-gate invariant now correctly names the state-committing ops (`approve`, `reconcile --resolve`, `rehash`); `reject` is advisory (records feedback only) and deliberately ungated to stay scriptable.
- **`adopt scan` next-steps message (ADV-0622-22):** conditional on whether a pure `IDEA.md` already exists — it no longer claims to create IDEA.md when the template preserves an existing one.
- **`aitri help` (ADV-0622-21):** lists the bare `aitri adopt` guided front door above `adopt scan`.
- **Comment/doc accuracy:** `verify.js` blocking-bugs comment now says getBlockingBugs filters by status+severity, not FR linkage (ADV-0622-37); `phase5.js` documents why `03_TEST_CASES.json` is intentionally not in `inputs` (ADV-0622-24).
- **Dead-code sweep (ADV-0622-18):** removed the zero-caller `findProjectRoot` (state.js) and the unused `PATTERN` export (idea-ref-classifier.js).
- **SCHEMA.md events (ADV-0622-15):** documents the `verify-run`/`verify-complete`/`verify-spec-complete`/`reconcile-resolved` event types, their `phase` values (string alias or `null`), and the `ideaArchived` flag.
- +8 tests (new `test/prompts/render.test.js`). 1725 passing. No artifact/`.aitri` schema change; SCHEMA.md doc additions only.

## [2.0.0-rc.113] — 2026-06-23 — P2 (part 3): robustness/contract fixes + UX-before-architecture ladder

P2 batch from the 2026-06-22 review (§12), part 3 — block D (robustness/contract) + block E (UX ladder). All fixes adversarially diff-reviewed before commit; that review caught two real defects in this work (an ADV-29 re-run loop and an incomplete BOM fix), both fixed below.

- **BOM-tolerant artifact reads (R3-16):** a leading byte-order mark (BOM) on a JSON artifact no longer causes a misleading "markdown fences / trailing commas" diagnostic — and, more importantly, no longer makes a cross-artifact gate that wraps its read in `try { JSON.parse } catch { skip }` **silently skip**. New single-source `readArtifactFile` (strips BOM) now backs `readArtifact` and every spine/gate/mirror artifact read: the phase 3 & 5 cross-artifact MUST-coverage gates, `verify-complete`, the `approve`-side UX detection, the per-TC `tc verify` reads, and the 0.1.65 migration. `complete` strips the BOM on the content it validates; phase 1/3 parse-error messages now name a leading BOM.
- **`complete --check` runs the cross-artifact review (R3-6):** the `--check` dry run now runs the phase 1/3/5 cross-artifact review (and exits non-zero on errors) instead of reporting green on errors the real `complete` would block. No state is recorded; the TTY warning-acknowledge prompt is suppressed in a dry run.
- **verify-complete rejects a non-object `summary` (R3-7):** a malformed `summary` (e.g. a string) is now blocked before it is written to `.aitri.verifySummary` (Hub contract) or printed as "undefined/undefined".
- **`.aitri` malformed-array-field coercion (R3-17):** a hand-edited but valid-JSON `.aitri` whose `approvedPhases`/`completedPhases`/`driftPhases`/`cascadedPhases`/`events` is the wrong type is coerced to `[]` with a warning instead of crashing the snapshot SSoT (resume/status/validate) with a raw stack. Object fields (rejections/frSnapshots/artifactHashes) are untouched.
- **AUDIT_REPORT.md path aligned (R3-11):** `audit` and the snapshot audit-freshness check now resolve `AUDIT_REPORT.md` the same way as the rest of the artifact chain (project root when `artifactsDir` is unset), instead of defaulting to `spec/` — so legacy root-artifact projects read and write the report where their other artifacts live.
- **UX-before-architecture ladder (ADV-0622-29):** when UX/visual/audio FRs are present, the `status`/`resume` next-action ladder now agrees with the `approve requirements` message — it steers through the UX phase (run → complete → approve) before Architecture instead of pointing straight at `run-phase architecture`. Routes to the correct lifecycle step rather than looping on `run-phase ux`.
- **SCHEMA.md (R3-23):** documents that `tc verify` also writes `verifySummary`, and that `verifyPassed` (not the presence of `verifySummary`) is the authoritative deploy-gate flag.
- +13 tests. 1717 passing. No artifact-schema or `.aitri`-schema change; SCHEMA.md doc clarification only.

## [2.0.0-rc.112] — 2026-06-23 — P2 (part 2): upgrade hardening — no silent downgrade, venv migrator is layout-aware

- **No silent version downgrade (ADV-0622-13):** `adopt --upgrade` (runUpgrade) now refuses to run when the installed CLI is OLDER than the project's recorded version — it warns and leaves the version untouched instead of rewriting it down and flip-flopping a committed `.aitri` between teammates. Adds a small `compareVersions` for the `X.Y.Z-(alpha|rc).N` grammar (stable > rc > alpha); the adopt-apply version writes are likewise guarded.
- **venv migrator is layout-aware (ADV-0622-14):** the legacy venv-relative-runner check now scans `<layoutRoot>/features` (via the `featuresDir` SSoT), so a contained-layout project's broken feature runners are flagged on upgrade instead of silently skipped; the finding's display path carries the layoutRoot too.
- +3 tests. 1704 passing. No schema/contract change.

## [2.0.0-rc.111] — 2026-06-23 — P2 (part 1): flow fixes + adopt --from no longer dead-ends

P2 batch from the 2026-06-22 review (§12), part 1 — small flow fixes and the adopt `--from` deadlock.

- **adopt apply --from (ADV-0622-26):** prior phases whose artifacts exist are now marked APPROVED (with stamped hashes), not just completed — so the approve-N ordering gate passes and the project can reach deployable instead of dead-ending. A prior phase with no artifact stays completed-not-approved (no false approval), with a clear next-step hint.
- **adopt apply --from (ADV-0622-07):** now relocates a root `ADOPTION_AUDIT.md` + `idea_context/` into the unit (shared with plain apply via one helper) — the audit is no longer orphaned where no phase briefing lists it.
- **feature init (R3-14):** writes `FEATURE_IDEA.md` before the `.aitri` marker, so a crash mid-init leaves an ignorable orphan dir, not a registered-but-broken feature.
- **checkpoint --name (R3-26):** threads `VERSION` into the snapshot so the version-mismatch banner isn't dropped.
- **wizard (R3-21):** accepts "yes" (not only "y") to confirm overwrite.
- **discovery prompt (R3-19):** points at `idea_context/` (was the legacy `idea/`).
- +7 tests. 1701 passing.

## [2.0.0-rc.110] — 2026-06-23 — P1 from the adversarial review: coverage-gate + flow integrity (6 fixes)

The P1 batch from the 2026-06-22 review (§12) — six tier-1/2 correctness fixes across the coverage gates, bug-blocking semantics, and the adopt/review prompts.

- **Regression-NFR typo (ADV-0622-06):** `isMustRequirement` matches `category` case/whitespace-insensitively (`"regression"`, `"Regression "`, `"REGRESSION"` all count) — a typo can no longer let a Must-Not-Break NFR escape the MUST gates.
- **mark-manual laundering (ADV-0622-05):** converting a TC the runner already reported `fail`/`skip` to manual now requires `--reason` and stamps `downgraded_from` on the TC (surfaced in the guided checklist + to the reviewer). Pairs with the rc.109 no-restamp fix.
- **in_progress bug semantics (R3-12/22):** `getBlockingBugs` blocks on `open` OR `in_progress` critical/high bugs, matching the deploy gate + AGENTS.md (before, an in-progress critical bug passed verify-complete/reconcile while the deploy gate blocked it). `in_progress` documented in the BUGS.json status enum.
- **adopt verify-spec inert status (R3-10):** the prompt routes an already-covered AC to a honored result (name the test after the TC id, or manual + `tc verify --evidence`) instead of the inert `status:"verified"` that verify-run ignored → `skip` → brownfield dead-end.
- **review verdict menu (R3-9):** `extractReviewVerdict` strips the newline-separated placeholder menu, not just the pipe form — an unfilled menu is no longer read as a phantom FAIL that dead-ends Phase 5.
- **system-design truncation (ADV-0622-02):** removed phase 2's `extractContext: head(160)` — the developer (phase 4) and phase 5 receive the FULL design; a long design no longer loses its late sections (Deployment Architecture, Risk Analysis). End-to-end guard test via `cmdRunPhase`.
- +9 tests. 1693 passing.

## [2.0.0-rc.109] — 2026-06-23 — security + verification-spine hardening (P0 from the adversarial review: 2 RCE + spine false-pass)

The P0 batch from the 2026-06-22 full adversarial review (ADV-0622 / R3). Two remote-code-execution chains and a verification-spine false-pass, plus three coverage/audit-integrity fixes. All findings adversarially verified; detail in `docs/Aitri_Design_Notes/_adversarial-review-2026-06-22.md` §12. ADR-057 (spine), ADR-058 (git/shell).

- **Spine false-pass (ADV-0622-01):** a *pending* `status:"manual"` TC no longer counts as covering a MUST FR / acceptance criterion / e2e — only a `tc verify`'d manual TC (recorded `status:"pass"`) does. Removed the four manual exemptions (`verify.js` `isUncovered` + e2e filter + `buildACCoverage`; `phase5.js` `OK_EVIDENCE`). **Contract change — integrations/CHANGELOG.md marked breaking.**
- **RCE — shell injection (R3-15, critical):** every interpolated `git` call now runs via `execFileSync('git', […])` (no shell), so a hostile committed `.aitri` (artifactsDir → drift-check path, reconcile baseRef) can no longer execute a payload on `aitri resume`/`status`/`reconcile`. `JSON.stringify`-quoted paths were NOT safe (shell `$()`/backticks survive double-quotes). Sites: snapshot.js, reconcile.js, rehash.js, approve.js.
- **RCE — `fix_commit_sha` (R3-4, high):** `aitri bug close` validates the SHA (`/^[0-9a-f]{7,40}$/i`) and runs git without a shell — a committed `BUGS.json` can no longer inject a command.
- **`tc mark-manual` (R3-24):** no longer re-stamps the Phase-3 hash, so an automation downgrade surfaces as drift → TTY-gated re-approval (closes the trace-hiding half of the mark-manual → tc-verify laundering path).
- **`tc verify` (R3-8):** recomputes `ac_coverage` as well as `fr_coverage`, so a verified-FAIL acceptance criterion no longer ships deployable.
- **Code review / Phase 5 (R3-18):** `extractManifest` keeps `files_modified`, and the reviewer's file list concatenates created + modified — a modified-only (brownfield) build no longer hands the reviewer an empty list.
- `templates/AGENTS.md` updated (mark-manual now requires `tc verify` to count). +7 dedicated tests incl. injection guards (assert a `$(...)` payload does not execute). 1683 passing.

## [2.0.0-rc.108] — 2026-06-21 — adopt FLOW stage 2: the guided `aitri adopt` entry + pure-IDEA (ADR-056)

Stage 2 of the adopt flow — the operator-facing entry. A dev with an existing project and a specific objective had no clear way to start (`init` is greenfield; `adopt scan` jumped straight to auditing) and nowhere obvious to put the objective + its docs. Bare `aitri adopt` errored. Now it is the guided front door.

- **`aitri adopt` (bare) is the guided start** ([adopt.js](../lib/commands/adopt.js) `adoptInit`) — scaffolds the objective seed (`IDEA.md`, a structured **Adoption Objective** template: Objective / Must Not Break / Constraints / Supporting docs) and the doc home (`idea_context/`), then prints the next steps (fill the objective, drop docs, `adopt scan`, `adopt apply`). Never overwrites an existing `IDEA.md` — it is the operator's pure intent (ADR-050/055).
- **`IDEA.md` stays pure; the scan respects it** ([scan.md](../templates/adopt/scan.md)) — if `IDEA.md` already exists (the operator stated the objective), the scan audits focused on it and does NOT overwrite it; the only file the scan authors then is `ADOPTION_AUDIT.md`. It writes `IDEA.md` only when none exists (no stated objective → stabilization).
- **`adopt apply` relocates a root `idea_context/` into the unit** ([adopt.js](../lib/commands/adopt.js)) — fixes the orphan an adversarial pass caught: the operator's docs dropped at the root (pre-`apply`) are moved into `aitri/product/idea_context/` (with the audit), never left behind, never clobbering an existing unit file.
- **Guard tests** ([adopt.test.js](../test/commands/adopt.test.js)) — bare `adopt` scaffolds + does not clobber an existing IDEA.md; `apply` relocates a root `idea_context/` doc into the unit.

The objective is captured as a structured seed the operator fills (+ rich supporting docs in `idea_context/`), not a one-line Q&A — an adoption objective carries rules/docs/annexes that a prompt question cannot hold. Closes the adopt-initiation thread (ADR-055 model + ADR-056 flow, both stages). No artifact-chain or `.aitri` schema change; bare `adopt` previously errored, so no behavior is removed.

## [2.0.0-rc.107] — 2026-06-21 — adopt FLOW stage 1: the audit becomes an artifact the phases consume (ADR-056)

ADR-055 fixed the adopt *model* (bivalent). This is stage 1 of the *flow*: making the adoption audit a CONSUMED artifact instead of a human-only doc. Today the audit (`ADOPTION_SCAN.md`) is read by nothing — its findings reach the pipeline only because the scan agent distills them into `IDEA.md`, which Phase 1 reads. For an objective-driven adoption, `IDEA.md` should stay the operator's pure intent (ADR-050), so the audit needs its own path to the phases.

- **Renamed `ADOPTION_SCAN.md → ADOPTION_AUDIT.md`** ([scan template](../templates/adopt/scan.md), [adopter persona](../lib/personas/adopter.js), [adopt.js](../lib/commands/adopt.js), [README](../README.md)) — names the *result* (a diagnostic), not the `scan` *verb*. Not a Hub contract (absent from `docs/integrations/`, no `lib/` reader), so the direct rename is safe; existing `ADOPTION_SCAN.md` files in adopted projects are inert.
- **`adopt apply` moves a root `ADOPTION_AUDIT.md` into the unit's `idea_context/`** ([adopt.js](../lib/commands/adopt.js)) — Phases 1/2/3 already list `idea_context/` files in their briefings (`run-phase.js` CONTEXT_PHASES), so the audit is now consumed without any new injection plumbing. Never clobbers an existing one.
- **Phase-1 and Phase-2 prompts now read the audit when present** ([requirements.md](../templates/phases/requirements.md), [architecture.md](../templates/phases/architecture.md)) — a content-conditional nudge: if `ADOPTION_AUDIT.md` is in the context, ground the requirements + design in its findings (blast radius, risks, what must not break; each must-not-break item → a regression NFR). No-op for greenfield (no audit present).
- **Guard test** ([adopt.test.js](../test/commands/adopt.test.js)) asserts the audit lands in `idea_context/` and is not orphaned at the root.

Stage 2 (next): the guided `aitri adopt` entry + pure-IDEA capture. Reasoning + the rejected alternatives (explicit `{{#IF_ADOPTION_AUDIT}}` injection, Phase-2 plumbing, scaffolding the doc home pre-apply) are in ADR-056. No artifact-chain or `.aitri` schema change.

## [2.0.0-rc.106] — 2026-06-21 — `adopt` is bivalent: stabilize an existing project OR pursue a specific objective in it (ADR-055)

`adopt` was defined as *stabilization* of an existing codebase in four places — the help line, the README command table, the `adopter` persona, and the scan template ("Adoption Stabilization", "No new product features — stabilization only", "You are not designing anything new"). But adoption is bivalent: an operator brings an existing project under Aitri either to stabilize it, or to do ONE bounded thing in it (a migration, a feature, a refactor, a security fix). The bivalent model lived only in a local design note; the codebase told every reader "adopt = stabilize", and the model kept being re-derived narrow.

- **The model is corrected and recorded (ADR-055).** Adoption = bring an existing project under Aitri to stabilize it OR achieve a specific objective; **stabilization is the default when no objective is stated, not the only mode.**
- **Framing fixed in all four sites.** [help.js](../lib/commands/help.js) and [README.md](../README.md) now describe adopt as "audit + adoption plan (your objective, or stabilization)"; the [adopter persona](../lib/personas/adopter.js) and [scan template](../templates/adopt/scan.md) produce an *adoption* brief framed around the operator's objective if present, defaulting to whole-project stabilization. The false absolute "You are not designing anything new" is removed (an objective-driven adoption legitimately designs new behavior), and "no new features — stabilization only" is now conditional on the stabilization branch.
- **Guard test** ([test/commands/adopt.test.js](../test/commands/adopt.test.js)) asserts the scan briefing presents both paths and no longer carries the stabilization-only absolute.

Prompt/doc/model correction only — no command signature, artifact schema, or `.aitri` field changes (`adopt scan`/`apply` and `IDEA.md` keep their shapes; only the framing generalizes). **Deferred to a follow-up:** the guided-initiation FLOW — how the operator's objective and its supporting docs are captured *before* the audit, where they live, and the objective-focused adversarial restructure of the scan prompt. This release fixes the MODEL so that flow is not designed from the narrow one.

## [2.0.0-rc.105] — 2026-06-21 — Depth Protocol routes a preserved behavior to the armed regression NFR, not an escapable FR (REG-GATE-0621 follow-up)

rc.104 made `category: "Regression"` mechanically load-bearing and fixed the NFR schema, the Phase-1/Phase-3 prompts, and [templates/AGENTS.md](../templates/AGENTS.md) — but missed one always-on line. The Requirement Depth Protocol in [requirements.md](../templates/phases/requirements.md) still told the agent that, for a change to an existing system, "each preserved behavior becomes a regression **FR**". That contradicted the sharp regression block (L207) and AGENTS.md (both say regression **NFR** with `category: "Regression"`), and the FR shape is the escapable one: an FR carries no `category`, so it is enforced only via `priority: "MUST"` — which nothing forces — whereas a regression NFR with `category: "Regression"` is caught by `isMustRequirement` even with no priority. The sharp block renders for feature scope only (`IF_PARENT_REQUIREMENTS`), so for `adopt`/migration scope this Depth-Protocol line is the **only** regression instruction the agent sees — and it pointed at the shape with no teeth.

- **Depth Protocol now routes preserved behavior to the enforced shape.** The existing-system decomposition now reads: what must change → FRs; what must **NOT** change → a regression NFR per preserved behavior (`category: "Regression"`, a hard MUST even without `priority`: full happy/edge/negative test set at Phase 3, failing regression test blocks `verify-complete`); blast-radius + build/boot/parity gates → the matching requirement type. This removes the in-template contradiction and helps every brownfield path (migration/upgrade/refactor), not only `adopt`.
- **Guard test** ([test/requirements.test.js](../test/requirements.test.js)) asserts the template never says "regression FR" and does route the existing-system path to `regression NFR` + `category: "Regression"`, so the contradiction cannot silently return.

Prompt-wording fix only: no command, flag, artifact field, or schema changed. Aligns the prose with the schema + gate decided in ADR-054.

## [2.0.0-rc.104] — 2026-06-21 — `category: "Regression"` NFR is a hard MUST regardless of priority (REG-GATE-0621, ADR-054)

A Must-Not-Break commitment was protected by a chain that hung entirely on `priority: "MUST"` — and the canonical NFR schema in [requirements.md](../templates/phases/requirements.md) **omitted `priority`**, while `category` (the field an author naturally sets to `"Regression"`) was read by **no gate** (display-only). So a regression NFR written per the base schema got `priority: undefined` and silently escaped every MUST gate — the Phase-3 forced-TC gate, the Phase-5 traceability-compliance gate, and the deploy-time MUST-NFR advisory — while still looking documented and rigorous. The protection was honor-system on the agent emitting an exact field the schema didn't even show it, and for non-feature (`adopt`) scope the regression-block prose never rendered at all.

- **`category: "Regression"` is now mechanically load-bearing.** A single source — [lib/requirements.js](../lib/requirements.js) `isMustRequirement(r)` = `priority === "MUST" || category === "Regression"` — replaces the bare `priority === "MUST"` predicate in all three NFR-MUST gates ([phase3.js](../lib/phases/phase3.js), [phase5.js](../lib/phases/phase5.js), [verify.js](../lib/commands/verify.js)). A regression NFR is now caught even with no priority; FRs are unaffected (they have no `category`).
- **Schema + prompts made truthful.** `"Regression"` is added to the canonical NFR category enum, and the Phase-1/Phase-3 prompts ([requirements.md](../templates/phases/requirements.md), [tests.md](../templates/phases/tests.md)) now state that a regression NFR is a hard MUST needing the full happy/edge/negative test set — closing the schema/prose contradiction. [templates/AGENTS.md](../templates/AGENTS.md) teaches consumer agents the same.
- **Why not validate `priority` on NFRs instead?** Rejected — it would newly-fail greenfield + existing artifacts (the base schema told agents to omit it) and be asymmetric with FRs, which are not required to declare priority either. Making `category` load-bearing only ever *adds* protection to an NFR that named `"Regression"`. Decision + trade-off in ADR-054.

Additive for consumers: no artifact field added/removed/retyped; `requirement_compliance`/`fr_coverage` only gain rows readers already iterate. A consumer that independently replicates the MUST predicate should mirror `priority === "MUST" || category === "Regression"`. See `docs/integrations/`.

## [2.0.0-rc.103] — 2026-06-20 — mutation gate enablement: per-gate `timeout_ms` + fake-pass nudge (ADR-053, re-opens ADR-034 §C3)

The fake-pass seam (a test that passes green without exercising real code — mocks, weak asserts; the "Ledger" lesson) has one mechanical catch: **mutation testing** (break the real code, re-run the tests; a surviving mutant means a test never checked that code — true even at 100% coverage). It was deferred on evidence (ADR-034 §C3) until the maintainer re-opened it. Mutation already runs as a project-declared `quality_gate` (exit-code judged like every other gate — no score parser, per ADR-052), but two things made it unusable, now fixed:

- **Per-gate `timeout_ms`** ([verify.js](../lib/commands/verify.js) `runQualityGates`, validated in [phase4.js](../lib/phases/phase4.js)) — the hardcoded 5-minute timeout killed any real mutation run mid-flight and mis-reported it as a code failure. A gate may now declare `timeout_ms` (default 300000). A gate killed at its timeout is now `status: "error"` (raise it / something hung), not `"fail"` (the code failed the check). Serves any slow gate (integration, e2e), not just mutation.
- **Fake-pass nudge (opt-in, advisory)** — when a project has automated tests but declares no mutation gate, `verify-run` prints one line explaining the gap and how to close it. It **never blocks** and never forces a tool (mutation tools don't exist for every stack — Go/embedded/Rust are thin/absent), but the omission is no longer silent. Chosen over a forced Phase-1 question (rejected: a forced answer the agent fills is honor-system; an independent-reviewer gate is too, since the same agent authors the verdict — only the mechanical mutation signal has real teeth; full reasoning in ADR-053).
- `build.md` now teaches the mutation gate + `timeout_ms`. Tests: +4 (timeout honored → `error` with a raise-it note; `timeout_ms` validation; mutation-gate detection across Stryker/pitest/mutmut/infection). 1658 green.

## [2.0.0-rc.102] — 2026-06-20 — `feature checkpoint` — per-feature session note (FEAT-PARITY-0620 part 3, closes the plan)

A feature can now save its own "save-my-place" handoff note, so a long feature build can be paused and resumed with its own narrative instead of only a project-level note. Asked for directly in the Ledger feedback (`aitri feature checkpoint` did not exist), and it completes the same write-side asymmetry as bug/backlog: `status`/`resume` already SHOW a per-feature session note, but there was no command to WRITE one per-feature.

- **`aitri feature checkpoint <name> [--context "..."] [--name "snap"] [--list]`** ([feature.js](../lib/commands/feature.js) → `cmdCheckpoint` with the feature context) writes the feature's own `.aitri.local` session note and, with `--name`, a resume snapshot under `features/<name>/checkpoints/`. Root `checkpoint` is untouched.
- **This closes FEAT-PARITY-0620.** Deliberately did NOT add `feature resume`/`validate`/`review` — they would be symmetry without need (the project `resume`/`status` already surface every feature; `feature verify-complete` already gates a feature's readiness; `review` already runs inside `complete`). Per the "don't add for completeness without evidence" rule, only the evidenced gap (`checkpoint`) was built. Feature pipelines now have parity on everything that acts on a feature's own data (`tc`, `bug`, `backlog`, `checkpoint`) on top of the already-identical phases + requirement gates.
- Tests: +2 (feature checkpoint writes the feature `.aitri.local` not the root; `--name` snapshot lands under the feature). 1654 green.

## [2.0.0-rc.101] — 2026-06-20 — `bug` + `backlog` are now feature-scoped (FEAT-PARITY-0620 part 2)

Two more commands that act on a feature's OWN data were root-only despite the data existing per-feature — the read-vs-write asymmetry the parity audit flagged: a feature already accrues bugs (`feature verify-run`/`verify-complete` auto-write + gate on its `BUGS.json`) and a backlog, but the operator could not triage them in feature scope.

- **`aitri feature bug <name> <add|fix|verify|close|list> …`** and **`aitri feature backlog <name> <add|list|show|done> …`** ([feature.js](../lib/commands/feature.js) dispatch → `cmdBug`/`cmdBacklog` with the feature context) operate on the feature's own `features/<name>/spec/BUGS.json` / `BACKLOG.json` (root files untouched). `feature bug` manages the **same** `BUGS.json` that `feature verify-complete` blocks on, so triage actually clears the gate.
- New shared helper [`scopedCmd`](../lib/scope.js) builds scope-aware hint commands (`aitri bug add` at root, `aitri feature bug <name> add` in a feature — name before the sub-verb), so every next-step hint and usage string in `bug.js`/`backlog.js` self-scopes (no root-form misdirection — the issue caught in part 1's `tc.js`). [help.js](../lib/commands/help.js) + [AGENTS.md](../templates/AGENTS.md) updated.
- Tests: +4 (feature bug/backlog write the feature files not the root; usage hints self-scope). 1652 green. Root behavior byte-identical (verified). **Still open (part 3):** the consistency calls `feature resume`/`validate`/`review`/`checkpoint`.

## [2.0.0-rc.100] — 2026-06-20 — Manual TC verification is now feature-scoped: `aitri feature tc …` (FEAT-PARITY-0620 part 1)

A full 22-command parity audit confirmed feature sub-pipelines share the root's phases and requirement gates, but a few commands that act on a feature's OWN data were root-only. The clearest gap — `tc` (manual TC verify / mark-manual) — also had a concrete breakage: an **all-manual feature pipeline dead-ended** (the rc.95 seed + zero-verification guard were root-only, so `feature verify-run` spawned `npm test` → ENOENT → no results file → no way to reach Phase 5). This closes that gap.

- **`aitri feature tc <name> verify [<TC-ID> --result … --notes …]`** (bare = guided) and **`aitri feature tc <name> mark-manual <TC-ID> [--reason …]`** ([feature.js](../lib/commands/feature.js) dispatch → `cmdTC` with the feature context). They read/write the **feature's own** `03_TEST_CASES.json` / `04_TEST_RESULTS.json` (the root's are untouched). The name precedes the `tc` sub-verb, per the `feature <verb> <name>` grammar.
- The rc.95 **all-manual seed** (no-spawn) and the **zero-verification guard** now apply to features too (the two `!featureRoot` carve-outs are gone — they only existed because no `feature tc verify` existed to clear them). So a feature with only manual TCs seeds, verifies by hand, and reaches Phase 5 exactly like the root — and cannot pass `verify-complete` with zero verification.
- All next-step hints self-scope: from a feature, `tc.js`/`verify.js`/the snapshot ladder emit `aitri feature tc <name> verify` / `aitri feature verify-complete <name>`, never the root form (which from the project root would target the wrong pipeline). [help.js](../lib/commands/help.js) + [AGENTS.md](../templates/AGENTS.md) updated.
- Tests: +6 (feature tc verify writes the feature artifacts not the root; mark-manual; hints self-scope; all-manual feature seeds; zero-verification guard fires for a feature). 1648 green.
- **Still open (FEAT-PARITY-0620 parts 2–3):** `feature bug` / `feature backlog` (per-feature data, same asymmetry), and the consistency calls `feature resume`/`validate`/`review`/`checkpoint`. Tracked in the backlog.

## [2.0.0-rc.99] — 2026-06-20 — Harden the rc.98 JUnit fix (CDATA false-PASS) + correct the Manual summary line (FB-MULTI-0619 #5 follow-up)

Adversarial review of rc.98 found it traded the rare false-FAIL for a **worse false-PASS**: the body bound used `xml.indexOf('<testcase')` — a raw substring with no word boundary — so a literal `<testcase`/`<failure` inside a runner's CDATA-wrapped captured output (`<system-out><![CDATA[ … ]]>`, standard in jest-junit/pytest/Surefire) truncated the body and **dropped a real `<failure>`**, reporting PASS. False-PASS is the dangerous direction.

- [verify.js](../lib/commands/verify.js) `parseJUnitXmlResults` now strips CDATA and comment bodies before scanning (failure detection keys on the `<failure>`/`<error>`/`<skipped>` tag, never its CDATA content), and bounds the body with a **word-boundary** next-`<testcase` search (`/<testcase[\s/>]/`) so `<testcases>`/`<testsuite>` and bare substrings can't false-match. Well-formed XML unchanged; the rc.98 sibling-bleed fix preserved.
- Also fixed a pre-existing display bug the rc.96 contract change surfaced: the verify-run report's `Manual:` line printed `manual_verified/manual` — two disjoint counts with different denominators (nonsense like `2/1 verified`). Now `manual_verified/(manual_verified+manual) verified (N pending)`.
- Tests: +3 (CDATA false-PASS both directions; `<testsuites>` not a boundary). Also made the Phase-1 `buildBriefing` seed tests **hermetic** — they pointed at the shared `/tmp` and a stray real `FEATURE_IDEA.md` could shadow the test seed and fail order-dependently; they now use an isolated empty temp dir. 1643 green.

## [2.0.0-rc.98] — 2026-06-20 — JUnit-XML parser: an unclosed `<testcase>` no longer flips a PASS to FAIL (FB-MULTI-0619 #5)

`parseJUnitXmlResults` read a testcase's body as "from the opening tag to the next `</testcase>`, or to EOF if none". On malformed XML with a **missing close tag**, the EOF fallback slurped the rest of the file and saw a *sibling's* `<failure>`/`<skipped>`, flipping a passing TC to FAIL — a false regression caused by the input being malformed, not by the test.

- [verify.js](../lib/commands/verify.js) `parseJUnitXmlResults` now bounds each testcase's body to whichever comes first: its own `</testcase>` or the next `<testcase` opening. A sibling's failure can no longer bleed into an unclosed testcase. Well-formed XML is byte-identical (its close precedes the next opening). The genuinely-last unclosed testcase still reads its own children to EOF (a real `<failure>` there still counts).
- Tests: +2 (sibling-not-absorbed; last-unclosed-with-own-failure). 1641 green. (The lower-severity tail noted in review — a raw `>` inside an attribute value, and `extractTCId` picking the first of two TC ids in one name — are false-negatives bounded by well-formed writers and left as-is.)

## [2.0.0-rc.97] — 2026-06-20 — Guided `tc verify` no longer busy-spins on closed stdin (FB-MULTI-0619 #4)

The guided checklist's answer loop (`while answer not in p/f/s`) called `readStdinSync`, which returns `''` with no EAGAIN at EOF (Ctrl-D / piped/closed stdin). An empty answer re-prompted, so on a closed stdin the loop spun forever at 100% CPU, never exiting — hit by a TTY that then closes (Ctrl-D) or a CI harness that reports a TTY but feeds no input.

- [tc.js](../lib/commands/tc.js): extracted `parseGuidedAnswer(raw)` — a pure, exported classifier that distinguishes a 0-byte read (`'eof'` → stop) from a blank Enter (a real `\n` byte → re-prompt) from a valid `p`/`f`/`s`. The guided loop now breaks on `'eof'` and stops cleanly, leaving the remaining TCs pending (nothing recorded for them).
- Pure function so the EOF path is testable without a TTY. Tests: +3 (eof / valid keys / re-prompt-not-eof). 1639 green.

## [2.0.0-rc.96] — 2026-06-20 — `tc verify` summary buckets sum to total again (FB-MULTI-0619 #3)

`aitri tc verify`'s `recomputeSummary` counted `manual` as `status === 'manual' || verified_manually`, so a manual TC that was verified (status flips to `pass`/`fail`, `verified_manually:true`) was **double-counted** — in `passed` AND `manual`. The documented contract `passed + failed + skipped + manual === total` broke (e.g. 2 results → 2 passed + 1 manual = 3), and Hub read a self-contradicting summary. `verify.js` already had the correct version; the rc.90 guided-mode extraction preserved tc.js's wrong one.

- [tc.js](../lib/commands/tc.js) `recomputeSummary` now counts `manual` by **status** (`r.status === 'manual'`), matching `verify.js`. A verified manual TC is counted in `passed`/`failed`; `manual_verified` separately (and overlappingly) tracks how many manual TCs were verified. The four status buckets now partition the results.
- One-line behavior fix; `summary.manual` value changes for any results set with a verified manual TC. Test: +1 (sum-to-total invariant). 1636 green.

## [2.0.0-rc.95] — 2026-06-19 — All-manual project: verify-run seeds manual results instead of dead-ending, with no false-green (FB-MULTI-0619 #2)

rc.86 let an all-manual project (no_go_zone forbids an automated suite) pass `complete 4` with no `test_runner`. But `verify-run` then defaulted to `npm test`, which ENOENTs on a non-Node stack (the .NET case) and exits **without** writing `04_TEST_RESULTS.json` — so `tc verify` was blocked ("run verify-run first") and the next-action ladder kept pointing at `verify-run`. The project Phase 3 honored as manual hit a wall at Phase 5. (A `--cmd "<build>"` workaround existed — Bravoauto used it — but an honest manual project shouldn't have to invent a runner.) Two adversarial review passes hardened the fix so unsticking the project does not create a *false-green*.

- **No spawn when every TC is manual (root scope).** [verify.js](../lib/commands/verify.js) detects all-`automation:"manual"` from `03_TEST_CASES.json` and seeds `04_TEST_RESULTS.json` with the manual TCs directly — no runner launched, no ENOENT, no Playwright spawn — so `tc verify` (and the guided `tc verify`) can record each. The seed records `test_runner:null`/`exit_code:null` (honest: nothing ran — no fabricated `"npm test"`) and suppresses the "manifest incomplete" warning (the missing runner is by design). An explicit `--cmd` bypasses the seed. Any automated TC present → unchanged.
- **No false-green.** [verify-complete](../lib/commands/verify.js) now blocks when every result is a pending manual seed (`manual>0 && passed===0 && failed===0`) — a `status:"manual"` TC is *pending*, not a pass, so letting the gate pass with zero verification would green-light deploy with nothing verified (the fake-pass this batch fights). Same principle as the existing all-skip guard; narrow — a single real pass clears it. `tc verify` flips a verified manual TC to `status:"pass"`, so verifying clears the guard.
- **Coverage stays consistent.** `tc verify` now recomputes `fr_coverage` ([tc.js](../lib/commands/tc.js)), not just `summary` — previously `summary` showed the verified pass while `fr_coverage` stayed frozen at "manual / 0 passing", so the artifact contradicted itself (Hub read both).
- **Ladder + report route to `tc verify`.** [snapshot.js](../lib/snapshot.js) + the verify-run report: when the last run is only manual-pending, the root next-action is `aitri tc verify`, not a `verify-run` loop.
- **Root scope only.** Feature scope has no `feature tc verify` command (the `feature <verb> <name>` grammar doesn't fit `tc verify <id>`), so the seed + zero-verification guard are root-gated — a feature pipeline keeps its prior behavior rather than being walled by a guard it can't clear. Feature-scoped manual verification is a known gap left to the deferred C1 design.
- Stack-agnostic: greenfield/automated projects never enter the all-manual branch. Briefing ([AGENTS.md](../templates/AGENTS.md)) clarifies the seed-then-`tc verify` flow. Tests: +8 (seed-no-spawn + path-distinctive markers, --cmd bypass, ladder route, zero-verification block/pass/feature-scope, fr_coverage recompute). 1635 green.

## [2.0.0-rc.94] — 2026-06-19 — verify-run no longer hunts the tree for result files (false-PASS guard) (FB-MULTI-0619 #1)

Post-ship adversarial review of the rc.85 TRX/JUnit adapter found a correctness hole: `verify-run` auto-discovered result files by walking the project tree for any `*.trx` / `TEST-*.xml` / `junit*.xml` whose mtime looked fresh (the `runStartMs - 1000` guard even admitted files modified just *before* the run). On a stack whose stdout the parsers can't read (.NET/Java — exactly where the file fallback matters), a committed fixture or a stale result file touched by a `git checkout`/editor-save could be credited as the run's verdict — a **false PASS** the real runner never emitted. That breaks Aitri's one promise: a reported result is real. No consumer asked for the hunt (Suzuki/Bravoauto used the explicit `--results`/`--cmd`/`--evidence` paths); it was an author-added convenience that introduced the bug.

- **No silent auto-discovery.** [resolveResultFiles](../lib/commands/verify.js) returns `[]` when no `--results` is given — the runner-result path is now strictly explicit. `--results <file>` is honored as-is (the operator's attestation, like `--evidence`); `--results <dir>` picks the single **newest file written by this run** (mtime ≥ run start), so stale guid-named siblings can't mask the current verdict, and an only-stale dir resolves to `[]` (warned). The `-1000ms` slop is gone.
- **Teaches instead of guessing.** When the runner emits nothing parseable to stdout and no `--results` was given, `verify-run` prints how to point Aitri at the file (`--results TestResults/` — dotnet prints `Results File: <path>`) or record evidence (`tc verify <TC> --evidence <path>`). Suppressed for all-manual projects. Consumed files are listed loudly so a wrong pointer is caught by eye.
- No schema change (the `evidence` field stays). Briefings ([build.md](../templates/phases/build.md), [AGENTS.md](../templates/AGENTS.md)) corrected — they had claimed auto-detection. Stack-agnostic: a JS project that reads results from stdout never enters this path. Tests: rewrote the resolution suite + added the fresh-file/stray-fixture false-PASS regressions (+1, 1627 green).

## [2.0.0-rc.93] — 2026-06-19 — Friendly message instead of a raw stack trace outside an Aitri project (FB-MULTI-0619 T3.1)

Evidence: a consumer ran `aitri resume` in a not-yet-initialized folder and got a full Node stack trace (`Error: Not an Aitri project ... at buildProjectSnapshot ... at ModuleJob.run`) that read like a crash — a first-time user couldn't tell "wrong folder / need to init" from "the tool is broken".

- [bin/aitri.js](../bin/aitri.js) now wraps the dispatch in a try/catch that recognizes the one known `Not an Aitri project` throw (from `buildProjectSnapshot`, hit by `resume`/`status`/`validate` outside a project) and prints actionable guidance: *"This folder isn't an Aitri project yet. Run 'aitri init' … or 'aitri adopt scan' …"*. Every other error re-throws unchanged, so real bugs still surface their stack for debugging.
- Surgical — catches exactly that message, no behavior change for any in-project command. Tests: +1 smoke (friendly text present, no stack trace). 1626 green.

## [2.0.0-rc.92] — 2026-06-19 — Manual TCs can state WHY they can't be automated; over-use is surfaced (FB-MULTI-0619)

The honest worry: an agent can push automatable work to the human by declaring tests `automation: "manual"`. Aitri can't mechanically tell a legitimate manual test (needs real SSO creds, a physical device) from automation quietly skipped — but it can make the difference **visible**, without blocking the legitimately-manual project (its no_go_zone forbids an automated suite). Advisory, non-blocking — the integrality guard for a Class-B honor-system boundary.

- **`aitri tc mark-manual <TC> --reason "..."`** ([tc.js](../lib/commands/tc.js)) stores an additive `manual_reason` on the TC. Marking manual with **no** reason prints a nudge (not an error). A reason can be added to an already-manual TC.
- **Guided `tc verify` surfaces it**: each manual TC shows `Manual because: <reason>` or `⚠ no reason given`, and the header reports `K of N pending manual TC(s) have no stated reason` — so a reviewer spots an unjustified dump at the moment of verifying. Joins the rc.90 manual-share signal (`All N are manual — no automated tests`).
- Deliberately **advisory, never a gate**: a hard block would break the legitimate all-manual project (the Class-C/B distinction in the batch doc). It shifts manual from "free, invisible escape" to "must justify each, in the reviewer's face" — the realistic best for an honor-system boundary; Aitri cannot certify a human's "I ran it".
- Additive `manual_reason` field (ARTIFACTS.md + integrations CHANGELOG). Tests: +4 (1621 → 1625 green).

## [2.0.0-rc.91] — 2026-06-19 — `tc verify --evidence` mechanically confirms a parseable results file (FB-MULTI-0619)

`--evidence` (rc.85) anchored a manual override to a file that must exist — stronger than a bare note, but it only checked existence, not relevance. Now, when the evidence is a **parseable results file** (TRX / JUnit-XML), Aitri reads it and confirms it actually backs the claim:

- evidence reports the TC as the **claimed** status → accepted, mechanically confirmed (no longer honor-system).
- evidence **contradicts** the claim (you say `pass`, the file says `fail`) → **rejected**.
- evidence is a results file that **does not report the TC** → **rejected** (it cannot substantiate a TC it does not contain).
- evidence is a **non-parseable** file (a log, a screenshot) → unchanged "exists" floor (the honest manual case where no machine output exists).

Closes the obvious hole in `--evidence` (point at any file) for the common case where the evidence IS a runner result. `parseXmlResults` is reused from verify.js (no cycle). No schema change. Tests: +4 (1617 → 1621 green).

## [2.0.0-rc.90] — 2026-06-19 — Guided manual verification: `aitri tc verify` walks the pending manual TCs (FB-MULTI-0619)

Evidence: recording manual results meant typing a long command (`aitri tc verify TC-005 --result pass --notes "..."`) once per TC — painful on a manual-verification project with dozens of them. Aitri already holds what each manual TC checks (its Phase-3 title + expected_result); it just wasn't surfacing it as a guided list.

- **Bare `aitri tc verify`** (no TC id) now enters a guided checklist ([tc.js](../lib/commands/tc.js)): it lists each pending manual TC with WHAT to check (title + expected result) and, when a human is at the terminal (TTY), walks them one at a time — answer `(p)ass / (f)ail / (s)kip`, optional note — recording each. Non-TTY prints the checklist + the explicit command and never prompts, so agents/scripts are unaffected (the explicit `tc verify <TC> --result …` form is unchanged).
- **Manual-share signal (read-only)**: the guided header surfaces how much of the suite leans on a human — `ℹ N of M …` , or a louder `⚠ All N test case(s) are manual — there are no automated tests` — so an over-use of manual verification (an agent pushing automatable work to the human) is visible at the moment of verifying. This is a preview of the hardening direction; it never blocks.
- Recording logic factored into one shared helper used by both the explicit and guided paths (identical behavior). No artifact/schema change; `04_TEST_RESULTS.json` shape unchanged.
- Tests: +6 (1612 → 1617 green). `templates/AGENTS.md` notes the guided option.

## [2.0.0-rc.89] — 2026-06-19 — Runner-result reading is ONE universal contract, not a parser per stack (ADR-052, FB-MULTI-0619)

rc.85 added TRX + JUnit-XML parsing to unblock .NET. The right follow-up question (raised consumer-style): the next stack with an unrecognized runner would hit the same wall, and adding a parser per format is the accretion smell — in code this time. This records and names the general capability so we stop the treadmill, **without adding any machinery**.

- **ADR-052**: Aitri reads a TC result one of three universal ways and adds no further per-format parsers — (1) a **stdout marker** (`✓/✗ TC-XXX` / a test named after the TC id), (2) a **JUnit-XML or TRX results file** via `--results` (JUnit-XML is near-universal — most runners emit it natively or via a reporter, so it is how an otherwise-unrecognized stack is read), (3) **`tc verify --evidence`** as the manual floor. The project adapts its runner to the contract; Aitri does not adapt to each runner. This is orchestrate-don't-bundle (ADR-034/037) applied to the verification spine. TRX is grandfathered as the LAST bespoke parser; future "support runner X" is answered by routing X to one of the three, not a new parser.
- **Wording only** (no code-behavior change — the parsers already shipped in rc.85): the per-TC skip note and the Phase-4 `test_runner` briefing now state the three-way universal contract instead of a per-stack runner list (applying "generalize, don't append" to the messages themselves). `docs/ARCHITECTURE.md` evolution paragraph + `docs/DECISIONS.md` (ADR-052) updated.
- Explicitly NOT built (the over-engineering trap, rejected in the ADR): a plugin/registry/DSL for custom parsers — capability for stacks that do not exist yet.
- No schema/gate change. test:all green.

## [2.0.0-rc.88] — 2026-06-19 — Briefings generalize new-build vs change-to-existing-system framing (FB-MULTI-0619 T2.1)

Evidence: two .NET/Umbraco brownfield-migration consumers reported, at nearly every phase, that the briefings assume a greenfield UI product (screens/KPI/JTBD, new schema/endpoints, src/ + .env.example scaffold) and "fight" a platform migration where the unit of work is invariants and change-surfaces. Verified against code first: only TWO of the seven complaints were real code walls (Three-Amigos h/f, the closed TC `type` enum); the rest were briefing prose, freely reframeable. This ships the reframe for the prose ones — **Class C, resolved in wording, not by loosening any gate**, so a greenfield/CLI/service project is structurally unaffected (it never enters the "change to an existing system" branch).

Generalized the *purpose* of each section once (stack-agnostic peer framing, not a per-stack/per-case append, not a new `project_type` field):

- **Phase 1 depth protocol** ([requirements.md](../templates/phases/requirements.md)): the decomposition's goal — every behavior gets an FR, nothing silently dropped — now names the alternate axis for a change to an existing system (what must change / must NOT change → regression FRs / blast-radius / build-boot-parity gates) alongside the screens/actions axis. North Star KPI gains the parity-gate reading for migrations.
- **Phase 2** ([architecture.md](../templates/phases/architecture.md)): `Data Model` and `API Design` now state they are **preservation contracts** for a change to an existing system (what must NOT change + only the delta), not only new-schema/new-endpoint design.
- **Phase 3** ([tests.md](../templates/phases/tests.md)): the security-FR "≥3 distinct vectors" rule now distinguishes a runtime attack surface (attack vectors) from a security-relevant config/migration change (the failure modes of THAT change — scope violation, dangling reference, prerelease dependency).
- **Phase 4** ([build.md](../templates/phases/build.md)): the `src/` + `.env.example` DoD now says: for a change to an existing codebase, use the existing source layout (real paths in `files_modified`, do not relocate into `src/`); `.env.example` only when the project uses env config.

- NOT done (the two real code walls, deferred — they need a gate change, not wording, and carry bias risk): allowing a declarative FR to declare "no meaningful failure path" (skips the synthetic `f` TC), and a `static`/`verification` TC type. Tracked in the batch doc as Class B.
- No schema/gate/validator change; prompt wording only. test:all green (1612). No contract impact.

## [2.0.0-rc.87] — 2026-06-19 — adopt scan sees a nested project folder + goal-neutral wording (FB-MULTI-0619 T2.2)

Evidence: a .NET adopter (Suzuki CR) whose app, `.gitignore`, `Dockerfile`, and lockfile all live in a `SuzukiCR/` subfolder — `adopt scan`'s Technical Health Signals only looked at the repo root and reported all four as "missing" (false negatives that sent the agent chasing non-issues). Class A — flat layouts are byte-identical.

- **Project-root detection** ([adopt.js](../lib/commands/adopt.js)): `detectProjectRoot` finds the one obvious project subfolder (carrying `package.json` / `*.csproj` / `go.mod` / `pom.xml` / `Cargo.toml` / `pyproject.toml` / …) and the presence scanners (`scanInfrastructure`, `scanGitignore`, `scanEnvFiles`) now check **both** the repo root and that folder, reporting the location when found nested (`Dockerfile: ✓ (SuzukiCR/Dockerfile)`). Conservative: descends ONE level and only when EXACTLY one subfolder carries a descriptor (0 / >1 / descriptor-at-root → repo root, unchanged). Added `.NET packages.lock.json` + `composer.lock` to the recognized lockfiles.
- **Goal-neutral wording**: the hardcoded "stabilization" in the operator-facing strings (next-step hint, placeholder IDEA title/body, the apply summary) is now "adoption" — `adopt` is used for any brownfield goal (a version migration, not only a stabilization effort), and "stabilization" was misleading for those.
- Not done here (noted in the batch doc): an `adopt scan --focus <topic>` to scope the audit, and a `git ls-files`-based "tracked despite gitignored" secret check — both bigger than T2.2.
- Tests: +7 dedicated (1605 → 1612 green). No artifact/`.aitri` schema change; no contract impact.

## [2.0.0-rc.86] — 2026-06-19 — Build phase inherits Phase-3 manual mode (FB-MULTI-0619 T1.3)

Evidence: the same .NET/Umbraco migration consumer (Bravoauto Brunei #55) whose no_go_zone forbids an automated suite — `complete 3` accepted 45 `automation: "manual"` TCs, but `complete 4` then hard-required a `test_runner` + `test_files` with `@aitri-tc` markers, forcing the agent to invent a runner the project does not use. The two gates disagreed about the same manual decision.

- **Manual-mode waiver** ([phase4.js](../lib/phases/phase4.js)): when every `03_TEST_CASES.json` test case is `automation: "manual"`, `complete 4` treats `test_runner`/`test_files` as optional (both still shape-checked when present). Derived from the validated Phase-3 artifact, not a flag.
- **Class B guard — conservative by construction:** `allCoveredTCsManual(dir)` returns true ONLY when the artifact is readable, non-empty, and EVERY TC is manual. One automated TC, a TC with no `automation` field (defaults automated), an empty/unreadable artifact, or no `dir` → false → the runner stays required. Greenfield, mixed, and unknown projects are byte-identical to rc.85 — verified by a dedicated "greenfield still passes / one automated TC still requires runner / no-dir unchanged" test trio.
- Trade-off: a fully-manual project can now reach `approve 4` without an automated runner; it verifies via `aitri tc verify <TC> --result …` (and `--evidence`, rc.85). It cannot accidentally skip automation it actually has — the waiver requires the all-manual decision to already be sealed in Phase 3.
- Tests: +7 dedicated (1598 → 1605 green). Contract: [ARTIFACTS.md](../docs/integrations/ARTIFACTS.md) + integrations CHANGELOG note that `test_runner`/`test_files` may be absent on a manual-mode build (additive — readers must treat them as optional in that mode).

## [2.0.0-rc.85] — 2026-06-19 — `verify-run` reads TRX / JUnit-XML result files; `tc verify --evidence` (FB-MULTI-0619 T1.1)

Evidence: two third-party .NET/Umbraco migration consumers (Suzuki CR, Bravoauto Brunei) hit the same blocker — `dotnet test` (xUnit) ran and passed, but `verify-run` marked **all** TCs `skip` ("not detected in test runner output"), so a C# stack had **no path to a green `verify-complete`**. Root cause ([verify.js](../lib/commands/verify.js)): every TC-result parser keyed on JS-glyph / Go / pytest stdout conventions; runners that write per-test verdicts to a **file** (TRX, JUnit-XML) emit nothing parseable to stdout. Class A fix — additive, stack-agnostic, no other stack changes behavior.

- **TRX + JUnit-XML parsers** ([verify.js](../lib/commands/verify.js)): `parseTrxResults` (`<UnitTestResult testName outcome>`, covers `dotnet test --logger trx`, MSTest, NUnit) and `parseJUnitXmlResults` (`<testcase>`/`<failure>`/`<skipped>`, covers Maven Surefire, Gradle, jest-junit, pytest `--junitxml`). `testName` FQNs resolve via the existing `extractTCId` (`Ns.Class.TC_006h_…` → `TC-006h`). A `fail` occurrence still wins over `pass` for the same id (no false green).
- **`verify-run --results <file|dir>`** + auto-discovery: explicit file is read as-is; a directory yields its **newest** result file; with no flag, `*.trx`/`TEST-*.xml`/`junit*.xml` under the project dir are auto-discovered but **only if modified since the run started** — `dotnet test` writes a new guid-named `.trx` per run and never deletes old ones, so the mtime guard prevents a stale PASS masking a current FAIL. Parsed results merge **fill-only**: the live stdout parsers and run win on conflict.
- **`tc verify --evidence <path>`** ([tc.js](../lib/commands/tc.js)): the manual-fallback escape hatch. An automated TC whose runner output Aitri could not parse can be recorded `pass`/`fail` against a **real on-disk file** (the TRX/JUnit-XML result or an evidence log) instead of being pre-declared manual via `tc mark-manual`. Not a free attestation — the file must exist. Records an additive `evidence` field on the result (preserved across `verify-run` re-runs); without `--evidence` the manual-only gate stands unchanged.
- Trade-off: auto-discovery matches conventional result-file names (`.trx`, `TEST-*.xml`, `junit*.xml`); an arbitrarily-named JUnit file needs explicit `--results <path>`. The `--evidence` path trusts that a present file substantiates the verdict — stronger than a bare `--notes` attestation, weaker than a parsed runner result; it is the documented bridge for runners with no structured output.
- Tests: +17 dedicated (TRX/JUnit parsing incl. attribute-order/Timeout/fail-wins/classname-id recovery; `resolveResultFiles` file/dir/auto + stale guard; `tc verify --evidence` accept/reject/missing-file/manual+evidence). Integration contract: `docs/integrations/{ARTIFACTS,CHANGELOG}.md` updated (additive — new optional `evidence` field, no shape change). Agent template `templates/AGENTS.md` audited.

Also in rc.85 — **build-report validator hardening (FB-MULTI-0619 T1.2)**, the same batch's second item (three adopters reverse-engineered the `04_BUILD_REPORT.json` schema from cryptic rejections):

- **Element-type guard** ([phase4.js](../lib/phases/phase4.js)): `files_created` / `files_modified` / `test_files` are flat string-path arrays. Adopters wrote them as arrays of OBJECTS (`[{path, type, key_functions}]`), which passed the Array check then crashed later at `path.join(dir, {})` with a raw Node `TypeError: The "path" argument must be of type string` that named no field. The gate now rejects the wrong element type up front with a message that names the field, the index, and the right shape. Defense-in-depth guard added to `scanAssertionDensity` ([verify.js](../lib/commands/verify.js)) for a manifest hand-edited after approval.
- **`substitution`-vs-`description` hint** ([phase4.js](../lib/phases/phase4.js)): an adopter who put the substance under `description` got the unhelpful "empty substitution". The error now detects the misnamed key (`description`/`note`/`detail`/`summary`/`what` — `reason` excluded, it's a real sibling) and says "rename X to substitution".
- **Briefing salience** ([build.md](../templates/phases/build.md)): the `04_BUILD_REPORT.json` schema block is now labeled "EXACT required schema" with the flat-string-array shape spelled out inline — the ambiguity (`files_created:[]`) the adopters hit.
- No artifact-schema change (the rejected shapes were never valid); validator + briefing only. Tests: +7 dedicated.

Plus briefing hygiene: collapsed the two open-ended "examples by stack" tables in `build.md` (`test_runner` and `quality_gates`) into stack-agnostic rules with bounded inline examples — they accreted a row per consumer report instead of stating the rule once (principle 4).

## [2.0.0-rc.84] — 2026-06-13 — Finished features stop nagging to re-verify by the calendar (STALE-VERIFY-1)

Evidence: the Cesar canary — 10 features, all at 5/5, verified ~21 days ago — never reached idle. `resume`/Hub kept emitting `verify on feature:<name> last ran 21 days ago — refresh before declaring idle` for every finished feature, and they would re-fire every 14 days forever. Re-running verify produced identical results; the nudge was pure noise that trained the operator to dismiss the action ladder.

- **Root cause** ([snapshot.js](../lib/snapshot.js)): `health.staleVerify` flagged any pipeline whose `verifyRanAt` was older than `STALE_VERIFY_DAYS` (14) on the calendar alone, ignoring whether anything had actually changed.
- **Fix:** a pipeline that is **all-core-approved + verify-passed + no drift** is now excluded from `staleVerify` regardless of age — its evidence still holds, nothing it tracks changed since the run. The exclusion applies to both the `staleVerify` health array and the priority-7 `verify-run` next-action, so `resume`, `status`, and Hub stay consistent. Pipelines still in flux (incomplete, verify not passed, or drifted) are unaffected and still flagged.
- **Drift is the real signal:** an artifact that changes after verify trips `driftPresent` (priority-2 action) — that path is untouched. Only the calendar proxy was removed for finished, undrifted work.
- **Not a re-run:** this is a pure change to how `resume`/`status` *derive* next-actions from existing state. Upgrading and running `resume` in a consumer writes nothing to feature pipelines, re-runs no verify, and re-opens no phase — finished features are left exactly as they are; the nudge simply stops.
- Trade-off: the calendar no longer catches code OUTSIDE a finished pipeline's tracked artifacts breaking its tests without tripping drift. Still caught by root verify (runs the whole suite) and by real drift; a dismissed calendar nag never protected against it anyway.
- Tests: +2 dedicated (terminal+clean → not stale & reaches idle; approved-but-unverified → still stale when old). Integration contract: `docs/integrations/STATUS_JSON.md` + `docs/integrations/CHANGELOG.md` updated (additive — field shape unchanged, membership narrowed to genuinely-stale).

## [2.0.0-rc.83] — 2026-06-12 — Security layer: `aitri audit security` (SEC-AUDIT-1) + trace-shipping fix (SEC-TRACE-1) — ADR-051

Evidence: an external security scan of a deployed site built with Aitri conventions (2026-05-29) returned Medium-High risk — and one finding was caused by Aitri itself (`@aitri-trace` comments leaking the internal FR/UX map through public HTML/CSS/JS, mandated by the build prompts with no shipping rule). Every other finding was deployed-surface class, invisible to static scanners, tests, and the per-phase security threading: the pipeline proved *intent*, nothing audited *exposure*.

- **SEC-TRACE-1 (fix):** `build.md` + the developer persona now rule that traceability lives in SOURCE only — never in assets served verbatim to end users (strip in a build step or keep server-side). Phase-4 Human Review gains the mechanical check (grep served output for `aitri-trace` → must return nothing).
- **SEC-AUDIT-1 (feature): `aitri audit security`** — third audit sub-command (ADR-048 pattern). New meta-persona `security-auditor`: attacker-first, outside-in, evidence-per-finding, strictly passive/non-destructive. Audits BOTH surfaces — static (code, repo, secrets, dependencies, build output) and runtime (deployed/local endpoints, headers, exposed docs, shipped assets) — with an honest coverage statement when one is unreachable. Knowledge model: framework names + the agent's current knowledge + the project's own scanners; no embedded vulnerability checklist (it would rot), no bundled analyzer (zero-dep, ADR-034/037).
- Findings land as **RQ-SEC remediation requirements** (P0/P1/P2, attack scenario, evidence, acceptance criteria) in a "Security" section of `AUDIT_REPORT.md`; `audit plan` routes them (P0 → bug, P1/P2 → requirements/backlog) and proposes creating the audit's **quality_gate verification script** — the permanent, mechanical re-check `verify` runs every cycle. The audit is the snapshot; the gate is the protection.
- `build.md` now EXPECTS a security `quality_gates` entry whenever security NFRs are declared (omission needs a declared reason in technical_debt).
- `resume` nudges `audit security` once Phase 4 is approved on a project with declared security NFRs and no/stale audit (re-fires when requirements change). Projects that explicitly decided security does not apply are never nudged — zero friction for small/offline projects.
- **Integration (Hub):** new additive `.aitri` field `securityAuditLastAt`; Hub composes its own security-gap signal from it + the security NFRs + the `### Security` heading (SCHEMA.md / ARTIFACTS.md / integrations CHANGELOG updated). No `status --json` change.
- `aitri help` lists all four audit forms; `templates/AGENTS.md` instructs consumer agents on when/how to run it.
- Tests: +15 dedicated (trace rule in briefing+persona, NFR/gates summaries, security briefing + timestamp persistence, persona posture, plan routing, 5 nudge conditions).

## [2.0.0-rc.82] — 2026-06-12 — Adversarial-review fixes (10): multi-agent review of rc.76–81 confirmed and hardened

A 5-dimension adversarial multi-agent review of the whole LAYOUT-1 series (each finding challenged by reproduce + impact refuters; I arbitrated the rest when verifier capacity ran out). 1 finding fully confirmed, 9 more validated by triage and fixed; 3 refuted (rejected with the refuters' arguments); 1 behavior change documented.

- **CONFIRMED — orphan-seed absorb was flat-only** ([from-0.1.65.js](../lib/upgrade/migrations/from-0.1.65.js)): `diagnoseOrphanIdea` looked for the seed at the literal project ROOT, so a migrated project with an unabsorbed seed never got absorbed again — `original_brief` stayed empty forever, the seed rotted at the contained live path as current-looking intent, and a factually false "was absorbed in a prior upgrade" diagnostic fired. Now layout-aware (`seedPath`), and the absorbed-mode message only claims absorption when `original_brief` actually exists (new "missing" mode otherwise). Dedicated test.
- **Preflight idea-ref gate is now scope- and layout-aware** ([idea-ref-classifier.js](../lib/upgrade/idea-ref-classifier.js)): `\bIDEA\.md\b` can never match `FEATURE_IDEA.md` ('_' is a word char), so feature approve-1 had zero protection over the file it actually archives; and the feature-spec scan hardcoded flat `features/`, silently skipping contained projects. Seed sets per scope (root: IDEA.md; feature: FEATURE_IDEA.md + the pre-rc.80 copy name) + `featuresDir` resolution; approve threads its scope.
- **Migration hardening** ([layout-migration.js](../lib/upgrade/layout-migration.js)): `features/` is claimed by OWNERSHIP MARKER (≥1 `features/<name>/.aitri`), never by name — a user-owned features/ dir (e.g. Cucumber) is left in place with a note; timestamp-suffixed archived seeds (`archive/IDEA-<stamp>.md`) are carried; gitignored files under moved paths are surfaced in the plan (git cannot restore them — the recovery hint now says so).
- **User-authored agent files survive migration** ([agent-files.js](../lib/agent-files.js)): `regenerateAgentFiles` only deletes files carrying the Aitri template marker; a hand-written pre-Aitri CLAUDE.md is kept and reported.
- **`adopt apply` never clobbers an existing unit seed** (scan→apply re-run warned instead of silently overwriting `aitri/product/IDEA.md`); **`adopt apply --from` gains the artifacts-at-root guard** plain apply already had.
- **`approve` archive move is graceful**: a failed move (e.g. a stray file named `archive`) warns and leaves the seed in place instead of crashing mid-approve (absorption is idempotent).
- **Display/paths polish**: the legacy `idea/` upgrade hint prints the layout-resolved context dir; `init`'s committed README strings are POSIX-normalized on Windows; `isAitriStatePath` keeps the historical literal `spec/` exclusion for the `'.'` artifactsDir alias.
- **Documented behavior change (kept, was silent in rc.76):** `bug close`'s `files_changed` trail now also excludes `node_modules/` and feature-pipeline artifacts (it routes through the shared `isAitriStatePath`) — an improvement over the old spec/-and-.aitri-only filter, now on the record.
- **Rejected with the refuters' arguments:** approve's artifact-write-before-move (unreachable trigger, benign idempotent half-state); the FEATURE_IDEA severity framing as "the Hub incident" (no deletion since rc.80 — fixed as hardening, not as data-loss); contract-coherence dimension ran partially (verifier capacity) — its strongest claims were spot-checked inline.
- Tests: +8 dedicated (ownership marker, archived variants, gitignored note, kept agent files, contained orphan absorb, classifier scope/layout, '.'-alias). Suite 1555 green.

## [2.0.0-rc.81] — 2026-06-12 — Round-2 canary fixes: upgrade-path absorption aligned with ADR-050 + migration notice polish

Round-2 canaries (csv-export feature pipeline 1–5 on the contained taskcli — including feature `verify-run` with a feature-relative runner, 21/21 + parent 30/30 regression green and the project deployable; Zombite, the real `'.'`-alias project: alpha.23 → upgrade with on-disk artifact renames → migration, 9 paths, approvals intact; T2, the oldest pre-version legacy: upgrade → migrate → **deployable Ready** end to end). Two findings, fixed:

- **Upgrade-path IDEA absorption now ARCHIVES instead of deleting** (`from-0.1.65.js`): the migration that absorbs an orphan `IDEA.md` into `original_brief` during `adopt --upgrade` still used the pre-rc.80 unlink — inconsistent with the approve-time lifecycle (ADR-050). It now moves the seed to the unit's `archive/`, same as approve. Test updated to the archive contract.
- **Migration success message names the transient off-pipeline notice**: between executing the layout migration and committing the move, `status`/`resume` correctly report "files changed outside pipeline" (the baseline predates the move); the message now says it clears itself at the commit — verified live on Zombite (7 transient → 0 after commit).

Suite 1547 green.

## [2.0.0-rc.80] — 2026-06-12 — Unified seed lifecycle: absorb + ARCHIVE, no materialized copies (ADR-050)

The product and its features now treat seed briefs identically — fixing the inconsistency the Phase-D canary surfaced (root `IDEA.md` deleted at approve 1 vs feature `FEATURE_IDEA.md` left to rot, plus a confusing duplicated `IDEA.md` copy inside features).

- **Approve 1 now MOVES the seed to `archive/` inside its unit instead of deleting it** (`aitri/product/archive/IDEA.md`, `<feature>/archive/FEATURE_IDEA.md`; flat legacy: `<root>/archive/`). Absorption into `01_REQUIREMENTS.json#original_brief` is unchanged — contracts and `audit coverage` intact. The human keeps the readable document; the folder name signals "history".
- **Feature materialization removed:** phases read `FEATURE_IDEA.md` directly in feature scope (`seedPath()` in state.js; the inputs map keeps the `IDEA.md` key so templates stay scope-blind). No more `FEATURE_IDEA.md` + `IDEA.md` duplication. A pre-rc.80 materialized copy is cleaned up at approve 1 when byte-identical.
- **Why keeping the file is safe:** re-runs ignore seeds BY CONTENT (once `01_REQUIREMENTS.json` exists it is the SSoT) — deletion was only ever protecting against repo-browsing agents. That protection is now the `archive/` convention: Aitri never lists `archive/` in briefings (mechanical) + a new AGENTS.md rule ("historical — never current intent, skip in reviews; it only costs context").
- Layout migration carries `archive/IDEA.md` file-level. Key seed-lifecycle paths live in `state.js` (`seedPath`/`seedArchiveDir`) per the single-point invariant.
- Tests: 4 dedicated lifecycle tests (root contained + flat archive, feature no-copy, feature absorb+archive+copy-cleanup) in `test/layout.test.js`. Suite 1547 green.

## [2.0.0-rc.79] — 2026-06-12 — LAYOUT-1 Phase D: real-canary findings fixed (4)

Phase-D validation ran all four canary configurations against real projects: a FULL pipeline (init → phases 1–5 → verify-run/complete → validate deployable → feature init) on a fresh contained project (taskcli, 30 real e2e tests, every gate exercised by an agent authoring real artifacts); a legacy flat project operating untouched under the new CLI (Zombite draft — byte-identical, no container leaks); a real adoption (SDLC-GRAPH, Next.js → contained); and a real migration (Drafts/T — a pre-versioned, root-artifact, git-less project: upgrade → git init → dry-run → migrate → pipeline resumes with approvals intact, no false drift, no reconcile noise). Findings, all fixed:

1. **Migration gate refused real root-artifact aliases.** `artifactsDir: '.'` (alpha-era projects — Zombite) was rejected as "custom", and `undefined` (pre-v0.1.20 — Drafts/T) was treated as `'spec'`, which would have MOVED NOTHING while re-pointing the config — a broken project. `planLayoutMigration` now treats `''`/`undefined`/`'.'` uniformly as root-artifact (per-file moves); only a genuinely custom value refuses.
2. **`layoutEmissionVars` rendered `spec/` for root-artifact projects** (undefined artifactsDir) — agent files pointed at a folder that doesn't exist. All three root aliases now render `'.'`.
3. **`adopt apply` advertised `idea_context/` without creating it** — init creates the folder + README; adopt now does too.
4. **Gate contradiction trapped agents on NFR-targeted TCs** (found live during the taskcli pipeline): phase-3's Three-Amigos gate DEMANDS h/e/f triplets for `requirement_id: NFR-xxx`, while the cross-artifact check at `complete 3` rejected NFR ids as nonexistent — an agent obeying one gate fails the other, in a loop. The cross-artifact check now accepts NFR ids as TC targets (phase3 already did); unknown ids still reject.

- Tests: root-alias plan cases + NFR-target cross-artifact case (test/layout-migration.test.js). Suite 1543 green.
- Phase-D status: all four scenarios CLEAN after fixes. Remaining before stable: author-canary soak at the user's pace.

## [2.0.0-rc.78] — 2026-06-11 — LAYOUT-1 Phase C: opt-in flat→contained migration + adopt produces the contained layout

The transition piece: legacy projects can now MOVE to the contained layout — explicitly, never automatically — and `adopt` stops producing new flat projects.

- **`aitri adopt --upgrade --layout`** — the only operation in Aitri that moves directories in a user's repo, so every gate is mechanical, in order: already contained → no-op; **git repo with a fully clean tree REQUIRED** (the recovery contract is `git checkout -- .` — no rollback machinery exists, by design); custom `artifactsDir` → refuse (hand-tuned project, migrate manually); `aitri/` path existing and non-empty → refuse (a partial previous attempt is inspect-and-restore, never merge). Then: full move plan printed; `--dry-run` exits there; **agents (no TTY) are hard-blocked** — moving a user's directories is a human call; TTY confirm (y/N) before anything moves. Config is written AFTER all moves succeed, so a mid-move crash leaves a coherent old-layout project for git to restore.
- **What moves:** `IDEA.md`, `idea_context/` → `aitri/product/`; artifacts → `aitri/product/spec/` (whole `spec/`, or per-file for root-artifact `artifactsDir:""` projects); `BACKLOG.md` → `aitri/`; `features/` → `aitri/features/` wholesale — feature configs are feature-relative and need **no rewrite**. Artifact CONTENT is never rewritten (hardcoded `cd spec && …` runner paths are flagged in the plan for the agent — ADR-027 §2). Agent instruction files are deleted + re-rendered so their paths match the new layout (`regenerateAgentFiles`, the destructive variant only this flow calls).
- **Offer, not nag:** a regular `adopt --upgrade` on a flat project appends one info line offering the migration (dry-run command included). Nothing else changes in the upgrade. `templates/AGENTS.md` tells agents to surface the offer to the user, never run it.
- **`adopt apply` (and `--from`) now produce the contained layout** for fresh adoptions, same as `init` — a scan-written root `IDEA.md` is moved into `aitri/product/` verbatim. The artifacts-at-root legacy guard still routes existing Aitri projects to `--upgrade`; existing projects keep their layout untouched.
- Mechanics live in `lib/upgrade/layout-migration.js` (plan/execute split — deliberately NOT a registered auto-migration); the interactive gates live in adopt.js.
- Tests: new `test/layout-migration.test.js` (14 — every refuse gate, both move-plan variants, end-to-end execution with a mid-flight feature, root-artifact variant, refusal moves nothing, dry-run wrapper) + smoke for the agent-mode block + adopt suites updated to the contained contract. Suite 1541 green.

## [2.0.0-rc.77] — 2026-06-11 — LAYOUT-1 Phase B: emission surface — agent files and briefings print layout-correct paths

rc.76 made the pipeline layout-aware; this release makes everything Aitri *prints or generates* layout-correct, so an agent in a contained project is never steered to a flat-era path.

- **Agent instruction files are now RENDERED per project** ([agent-files.js](../lib/agent-files.js) → `render('AGENTS', layoutEmissionVars(config))`). `templates/AGENTS.md` carries layout placeholders (`{{IDEA_FILE}}`, `{{IDEA_CONTEXT_DIR}}`, `{{SPEC_DIR}}`, `{{FEATURES_DIR}}`, `{{BACKLOG_FILE}}`) — a contained project's CLAUDE.md/AGENTS.md/etc. read `aitri/product/idea_context`, a legacy project's read `idea_context`. The rc.76 interim "resolve paths yourself" note is replaced by a rendered **"THIS project's paths"** line. Highest-impact surface: 1 template × 5 files per project.
- **`layoutEmissionVars(config)`** (new in [state.js](../lib/state.js) — layout knowledge stays at the single point): POSIX, root-relative display values; `SPEC_DIR` is `'.'` for legacy root-artifact projects so `{{SPEC_DIR}}/BUGS.json` stays valid there.
- **Briefings:** Phase 1's provenance rule names the layout-resolved context dir (`{{CONTEXT_DIR}}`: `feature_context` in features, `aitri/product/idea_context` contained, `idea_context` flat); Phase 4's feature-runner guidance names `{{FEATURES_DIR}}/<name>/` resolved through the PARENT project's layout; `audit coverage` names the seed brief's real location (`{{IDEA_FILE}}`).
- **`templates/IDEA.md` is rendered at init** — its asset examples (`idea_context/screens/home.png` …) now show the project's actual context path.
- `init` passes its in-memory config to `writeAgentFiles` (a loadConfig fallback there would render the pre-init layout); other callers (adopt, upgrade) load from disk post-save.
- Tests: 6 new in `test/layout.test.js` (rendered agent files contained + flat regression + no unrendered braces; IDEA.md examples; phase-1 provenance dir in root/feature scopes; phase-4 FEATURES_DIR both layouts). Suite 1526 green.
- Remaining for LAYOUT-1: Phase C (opt-in `adopt --upgrade` directory migration + adopt producing contained) and Phase D (canaries ×3, then v2 stable).

## [2.0.0-rc.76] — 2026-06-11 — LAYOUT-1 Phase A: contained project layout — new projects under an `aitri/` container (ADR-049)

New consumer projects no longer scatter Aitri's entries across the project root. `aitri init` now creates **one container**: `aitri/product/{IDEA.md, idea_context/, spec/}` + `aitri/BACKLOG.md` + (on first `feature init`) `aitri/features/<name>/`. `.aitri` stays at the project root (project identity and `findProjectRoot` are layout-independent); agent instruction files stay at the root (agents require them there). `product/` vs `features/` makes the tree teach Aitri's mental model — the product definition vs the increments. Industry-aligned (Spec Kit `.specify/`, Kiro `.kiro/`, OpenSpec `openspec/`). Full rationale + the rejected `idea/`-as-unit shape: ADR-049.

- **Schema (additive — `docs/integrations/` updated):** new `.aitri#layoutRoot` (`'aitri'` contained / `''` flat); `artifactsDir` absorbs the unit path (`'aitri/product/spec'`, POSIX) so consumers using the documented path formula keep working unchanged. Readers must not default a missing `artifactsDir` to `'spec'` (documented default is `''`).
- **Layout knowledge centralized:** `lib/state.js` gains the layout helpers (`productSubdir`/`ideaContextSubdir`/`ideaPath`/`ideaContextDir`/`backlogMdPath`/`featuresDir`) — single point, per the state.js invariant. The spec/.aitri prefix filters previously duplicated across snapshot/reconcile(×3)/bug centralize in `reconcile-patterns.js#isAitriStatePath` (layout-aware SSoT); `isFeaturePipelineArtifact` accepts a `layoutRoot`.
- **Commands made layout-aware:** feature dir resolution loads config BEFORE building paths ([feature.js](../lib/commands/feature.js) — a wrong-path feature lookup would fail silently); snapshot feature discovery + uncounted-changes filter; run-phase IDEA.md/context resolution with **relative display paths valid in both layouts** (a contained briefing lists `aitri/product/idea_context/...`; a feature's parent-context pointer hops `../../product/idea_context/`); phase1, approve (IDEA absorption at the unit path), validate, audit, wizard, review, bug.
- **Pre-init brief absorbed:** `init` on a fresh project MOVES a root `IDEA.md` (wizard-before-init flow) into `aitri/product/` instead of shadowing it with a template; `wizard` writes through the layout helper.
- **Legacy projects: byte-identical.** No `layoutRoot` → flat behavior everywhere. `adopt` still produces flat (moves to contained together with the opt-in migration, next rcs). Tests that simulate legacy projects now build fixtures via `test/fixtures.js#initFlatProject` (replica of pre-rc.76 init) instead of `cmdInit`.
- **Out of scope, deliberate (rc.77/78):** emission surface (templates/AGENTS.md placeholders, briefing/console literal paths) and the opt-in `adopt --upgrade` directory migration (clean-tree gate, dry-run default, isTTY confirm, idempotency guard).
- Tests: new `test/layout.test.js` (17 — helpers both layouts, init contract, brief absorption, flat regression, run-phase asset paths, contained features + parent pointer, approve absorption, isAitriStatePath); smoke + init/status/upgrade/backlog/rehash/adopt suites updated. Suite 1520 green.

## [2.0.0-rc.75] — 2026-06-10 — `audit coverage`: independent idea→FR completeness audit, nudged at resume (ADR-048, Phase A)

The one thing Aitri's gates and the code-`audit` never check is FIDELITY of the requirements to the original intent — the code-auditor explicitly does "not evaluate against a spec", so a requirement set that DROPPED a client request passes every gate and everything downstream is faithfully built on an incomplete spec. **Evidenced:** round-2 §3.2, the adopter's root requirements were re-captured 15→25 FRs (40% under-captured at idea→requirements). New in this release:

- **`aitri audit coverage`** ([audit.js](../lib/commands/audit.js)) — a new audit sub-command. Stage 1 (mechanical): Aitri feeds `{00_DISCOVERY.md + 01_REQUIREMENTS.json#original_brief + root IDEA.md}` + the FR list. Stage 2 (model): the agent traces each client need to an FR — COVERED / PARTIAL / UNCOVERED — and a skeptical pass drops anything explicitly out-of-scope. Findings append to a `### Requirements Coverage` section of `AUDIT_REPORT.md`. Advisory, off-pipeline — never gates.
- **New persona `coverage-auditor`** ([coverage-auditor.js](../lib/personas/coverage-auditor.js)) — distrusts requirement COMPLETENESS (assume something was dropped until each need traces to an FR or an explicit out-of-scope line), distinct from `auditor` (code quality, "not against a spec"). Template `templates/phases/auditCoverage.md`.
- **`resume` nudge** ([resume.js](../lib/commands/resume.js)) — once Phase 1 is approved and either it was never coverage-audited or the requirements changed since, `resume` suggests `aitri audit coverage`. **Why resume:** a fresh session reviews the requirements WITHOUT the self-grading bias of having written them — independence is what makes a model-judged review honest. Resume-only (kept out of the Hub-facing `status --json`).
- **`.aitri#coverageAuditLastAt`** (additive, shared) — drives the nudge (stops once run, re-fires on FR change). Documented in SCHEMA.md + integration CHANGELOG (additive).
- **One coherent audit flow (not bundled).** The two audits stay SEPARATE runs (different optimal moments — coverage post-Phase-1 / fresh session, code post-build) but are connected: the code `audit` output points to `audit coverage` and vice versa, and a SINGLE `audit plan` now routes BOTH report sections — coverage gaps go to a **scope** decision (`run-phase 1` to add the FR, or record out-of-scope), never filed as a bug/backlog item (which would bury a missing requirement as ordinary debt). `templates/phases/auditPlan.md`.
- **Why now, not theater:** evidenced (§3.2), and it lands in `audit` — already advisory/model-judged — so it adds no false-confidence-in-a-gate. Bounds false positives by feeding the explicit out-of-scope + staying advisory. **Phase B deferred** (making the CODE auditor adversarial/staged) — no evidence its single-shot form failed.
- **Fixed in passing:** `test/commands/audit.test.js` was NOT wired into `test`/`test:all` — the `audit` command had zero suite coverage. Now included (the suite jumped 1471→1502 as the 27 orphaned audit tests + the new coverage tests joined).
- Tests: `test/commands/audit.test.js` (coverage sub-command: errors, briefing content, persisted marker; `buildIntentSources`; persona posture) + `test/commands/resume.test.js` (nudge appears / suppressed / re-fires / gated on Phase-1-approved). Suite 1502 green.

## [2.0.0-rc.74] — 2026-06-10 — Phase-3 prompt: expected_result must verify what its AC names, for ALL types (TPA-8 fidelity, prompt slice)

The semantic FR↔test fidelity gap (a test tagged to an FR but verifying something easier/other — TPA-8) cannot be closed mechanically (zero-dep, no model in Aitri itself; a lexical matcher = false confidence). But most of it is already shaped by prompt: `requirements.md` requires observable acceptance_criteria per type, and `tests.md`'s "expected_result must survive mutation" rule already blocks weak results. The one missing piece was **correspondence**: `tests.md` told qualitative (UX/visual/audio) TCs to "copy the metric directly from acceptance_criteria" but never stated that rule for **all** types — so a model could write a specific, mutation-resistant expected_result that verifies an *easier neighbour* of the AC, not the AC itself.

`templates/phases/tests.md` now states it generally: every test's expected_result must assert the SAME observable its linked AC (`ac_id`) names — derive it from the AC, never substitute an easier proxy — with a concrete example ("a .pdf file exists" vs "opens as valid PDF and contains all 3 line items"). It also names the honest limit: Aitri verifies the `ac_id` link exists, never that the test honours it — taking the easy path passes every gate and ships an untested requirement.

- PROMPT mode change (no gate, no schema). The residual — mechanically catching a well-written but mislabelled test — stays the model-judged advisory study (coupled to TPA-12), justified only by a 3rd evidenced defect class.
- No new test: this is guidance the agent reads, not a mechanical behaviour (coherence judged by human per the PROMPT operational mode). Integration headers bumped to rc.74. Suite 1471 green.

## [2.0.0-rc.73] — 2026-06-10 — verify-complete surfaces a MUST NFR whose test skipped (advisory, NFR-regression)

`complete 3` already requires every `priority:MUST` NFR to have a test case, and a FAILING test hard-blocks `verify-complete` ([verify.js](../lib/commands/verify.js#L1264)). The narrow residual gap: `fr_coverage` is FR-only ([verify.js](../lib/commands/verify.js#L837)), so a MUST NFR whose test(s) **skipped** (never ran — not a fail) reached the deploy gate untested and invisible. A forgotten `test.skip` on a regression NFR could ship.

`verify-complete` now prints an **advisory** line at the deploy gate when a MUST NFR has no passing/manual test (its TCs skipped): it names the NFR(s) and asks the operator to confirm each is genuinely verified (e.g. in a separate perf/security suite) or to un-skip the test.

- **Advisory, never a gate — deliberately.** Aitri cannot distinguish a forgotten `test.skip` from a MUST NFR legitimately tested in a separate suite (both surface as status `skip`, no context). A hard block would false-alarm on the legitimate case; surfacing it turns a silent skip into a loud one at the one high-attention moment (deploy) without crying wolf. This is the low-risk slice (Option 1 of the NFR-regression study); the discriminating hard-gate stays deferred (needs skip-reason parsing — stack-specific — or a per-TC declaration — schema cost — neither justified without a real adopter defect).
- **Print-only — no schema/contract change.** Computed at runtime from `01_REQUIREMENTS.json` (MUST NFRs) + `03_TEST_CASES.json` (TC→NFR map) + `04_TEST_RESULTS.json` (statuses); nothing persisted, so Hub and `04_TEST_RESULTS.json` are untouched.
- Tests: `test/commands/verify.test.js` — a MUST NFR with a skipped test is surfaced WITHOUT blocking; the same NFR with a passing test is silent. Suite 1471 green.

## [2.0.0-rc.72] — 2026-06-10 — getFilesTouched stops leaking a Windows error on every state command (TPA-10 residual, root cause located)

rc.68 closed the deterministic half of TPA-10 (`npm`-family `.cmd` resolution) and parked the residual "The system cannot find the path specified." Windows noise as "needs a repro to locate." **It is locatable from code.** `getFilesTouched` ([lib/state.js]) — run inside `writeLastSession`, i.e. on every `complete`/`approve`/`checkpoint` — silenced git's stderr with a POSIX `2>/dev/null` redirect. `execSync` runs through `cmd.exe` on Windows, which cannot parse the POSIX null path: the redirect fails and cmd prints that exact string to the inherited stderr on every state-mutating command. It is the lone POSIX-redirect outlier; every sibling git call in `lib/` already silences stderr via `stdio:['ignore','pipe','ignore']` (11 sites).

The fix replaces the POSIX redirect with that same cross-platform `stdio` suppression, and the shell `||` HEAD→plain-diff fallback (for repos with no commits) with a try/catch. Semantics are identical on POSIX; the Windows noise source is removed.

- **Confidence, calibrated:** the stderr-leak mechanism, the fallback exit codes, and "sole `/dev/null` in lib/" are verified on this host (Node behaviour, platform-independent). The cmd.exe → exact-string link is established Windows behaviour but **not** runtime-verified here (no Windows host) — same gap rc.68 flagged. The fix is correct regardless: a POSIX null-device redirect is unparseable on cmd.exe no matter the exact error. Whether this closes 100% of the reported TPA-10 noise (vs. an additional git-not-on-PATH cause) still needs a real Windows smoke.
- Behaviour change (Windows operator output). No schema change. Integration headers bumped to rc.72.
- Tests: `test/state.test.js` — `writeLastSession` records `files_touched` in a committed repo (HEAD-diff branch) and does not throw in a repo with no commits (fallback branch); plus a portability guard that fails if any `lib/` file hardcodes the POSIX null device. Suite 1469 green.

## [2.0.0-rc.71] — 2026-06-09 — drift-gate message names run-phase as the sanctioned re-derivation path (TPA-2 residual)

Cosmetic wording fix. The agent-mode drift block said only "an agent cannot re-approve after drift" and pointed to a manual human `approve` — but `run-phase` is the sanctioned way to *redo* a drifted phase (it re-opens + cascade-invalidates downstream, fixed in rc.58). The message now gives both paths explicitly: a human `approve` to accept the edited content, or `run-phase` to re-derive the phase cleanly ([lib/commands/approve.js]).

- Output-only change. No code logic, no schema change. Integration headers bumped to rc.71. Suite 1466 green (smoke matches the preserved "artifact changed after approval" substring).

## [2.0.0-rc.70] — 2026-06-09 — verify-run warns when the runner failed to run the suite (rc.64 adopter §3.8)

When the test runner ran but the **build failed** (a running app holding the build output — e.g. .NET on Windows locking the binary — or a compile error / crash), `verify-run` detected **0 test cases** and marked every TC `skip` with a "rename the test function…" note — actively misleading the operator (the tests exist; the build broke).

`verify-run` now emits a loud, stack-agnostic warning when the runner **exits non-zero AND zero TCs were detected** (after all parsers): the suite likely did NOT run — a build/compile failure, a crash, an app holding the build output (stop it and re-run), or test functions not named after their TC ids — and the per-TC `skip` results are not a real outcome ([lib/commands/verify.js]). No runner-specific error strings; just exit code + zero detections, so it covers any compiled stack (.NET/Go/Rust/Java), not only the adopter's .NET-on-Windows case.

- Advisory only — does not change persistence or the gate. No schema change. Integration headers bumped to rc.70.
- Tests: `test/commands/verify.test.js` — a runner that exits 1 with no output triggers the warning. Suite 1466 green.

## [2.0.0-rc.69] — 2026-06-09 — Phase-3 Three-Amigos validator aggregates all coverage gaps into one error (rc.64 adopter §3.4, completion)

Completes §3.4 (rc.67 did the Phase-1 per-FR checks). The Phase-3 Three-Amigos loop threw on the first failing FR (and the first failing sub-check), so the agent fixed one FR/sub-check, re-ran `complete 3`, hit the next. It now COLLECTS every coverage shortfall — per FR (min-3 / happy / negative / `h` / `f`) AND across all FRs — and reports them in one error ([lib/phases/phase3.js]).

The structural checks (comma-separated id, unknown `requirement_id`) stay fail-fast — they mean a malformed plan, not a coverage gap. FR ids are kept before each rule phrase, so existing matchers (`/FR-001.*no happy_path/`, `/…no TC id ending in 'h'/`, etc.) still hold; the same-FR-multiple-gaps case now lists all of them.

This revises the rc.67 deferral: re-examining the test surface showed the churn was low (5 single-FR assertions, all preservable), not "high" as first judged — so the deferral did not hold up and the symmetry with Phase-1 is now complete.

- Behavior change (validator output). No schema change. Integration headers bumped to rc.69.
- Tests: `test/phases/phase3.test.js` — two FRs missing their negative scenario are reported in one error; all existing single-FR assertions still pass. Suite 1465 green.

## [2.0.0-rc.68] — 2026-06-09 — Windows npm-family gate resolution + namespaced TC-id hint (rc.64 adopter §3.10, §3.5)

Two small polish items from the rc.64 round.

- **§3.10 / Windows — npm-family gate commands now resolve on Windows.** Aitri spawns project-declared gate/test/e2e commands with `shell:false` ([verify.js]); on Windows, `npm`/`npx`/`yarn`/`pnpm` are `.cmd` shims that `spawn()` with `shell:false` cannot resolve (it ENOENTs on a bare `npm`). New `resolveWinBin(bin)` maps the known shims to their `.cmd` on win32 only — applied to all three spawn sites (quality gates, test runner, and the hardcoded `npx playwright`). It does NOT switch to `shell:true` (which would reintroduce injection surface + the DEP0190 args+shell deprecation); `node`/`dotnet`/`go`/`python` resolve as `.exe` and are untouched.
  **POSIX-safe + scope honesty:** `resolveWinBin` is a no-op on non-win32, so all POSIX behaviour (and this repo's macOS test suite) is unchanged — verified. The win32 mapping is unit-tested by overriding `process.platform`. It is **not** smoke-tested on a real Windows host (none available); it is a strict improvement (bare `npm` ENOENT → `npm.cmd` works for standard installs) with zero POSIX risk. This closes the verified, deterministic half of TPA-10; the circumstantial Git-Bash "Permission denied" / "system cannot find the path" noise is NOT addressed (needs a Windows repro to locate the failing child_process call).
- **§3.5 — namespaced TC-id hint.** The duplicate-TC-id error now suggests a namespaced prefix (`TC-AUTH-001`, `TC-PAY-001`) in addition to the letter suffix, for the case of adding a feature's TCs to a shared suite with colliding ids ([phase3.js]).

- Behavior change (Windows spawn resolution + an error message). No schema change. Integration headers bumped to rc.68.
- Tests: `test/commands/verify.test.js` — `resolveWinBin` no-op on POSIX, maps shims on win32, leaves `.exe`/extensioned bins alone. Suite 1464 green.

## [2.0.0-rc.67] — 2026-06-09 — Phase-1 validators report all FRs failing a rule in one error (rc.64 adopter §3.4)

The Phase-1 per-FR checks threw on the FIRST offending FR, so the agent fixed one FR, re-ran `complete 1`, hit the next — the adopter reported a UX-metric rule across FR-001 → FR-003 → FR-005 as **three** separate edit/complete cycles for one root cause.

The three per-FR Phase-1 checks now COLLECT all offending FRs and report them in a single error ([lib/phases/phase1.js]):
- UX/visual/audio FRs missing an observable metric → lists every offending FR id.
- MUST FRs whose acceptance_criteria are all vague → lists all.
- MUST FRs with a too-vague title → lists all.

Messages keep the FR id(s) before the rule phrase, so existing matchers (`/FR-002.*observable metric/`, `/…all acceptance_criteria are vague/`, `/…title is too vague/`) still hold. No exit-code change.

- Behavior change (validator output). No schema change. Integration headers bumped to rc.67.
- Tests: `test/phases/phase1.test.js` — two UX FRs missing a metric are reported in one error. Suite 1461 green.
- **Deferred:** the Phase-3 Three-Amigos per-FR loop (min-3 / happy / negative / h / f) also throws per-FR — left as a follow-up. It interleaves 5 sub-checks per FR with a large test-match surface, and the adopter adapted to it (pre-designing FRs); the Phase-1 UX-metric case was the evidenced, clean win. (BACKLOG V2-3.4.)

## [2.0.0-rc.66] — 2026-06-09 — surface gate rules at the right phase: Three-Amigos in the Phase-1 briefing + fix the overall_status enum (rc.64 adopter §3.3, §3.6)

Two briefing fixes from the rc.64 round, both attacking the recurring theme "gate rules are discovered late (Phase 3/5) instead of at Phase 1, forcing avoidable re-open/cascade cycles."

- **§3.3 — Three-Amigos rule now stated in the Phase-1 briefing** ([templates/phases/requirements.md]). The per-FR happy/edge/negative + `h`/`f`-suffix rule was enforced only at `complete tests` (Phase 3); the requirements briefing only mentioned a narrower "≥2 ACs for certain FR types." It now tells the agent to shape EVERY MUST FR's acceptance_criteria to support happy + edge + negative scenarios, so the Phase-3 gate is satisfiable without re-opening Phase 1. (Deliberately a briefing change, NOT a new `complete 1` gate — judging AC "scenario diversity" of free-text criteria is semantic / theater-risk.)
- **§3.6 — `overall_status` enum fixed + clarified** ([templates/phases/deploy.md]). The Phase-5 briefing's Delivery Summary listed `[compliant | partial | non-compliant]` — but `non-compliant` is NOT a valid value (the validator accepts only `compliant | partial | draft`), so following the summary produced a rejected artifact. Fixed to `draft`, and the schema note now warns not to use a per-requirement compliance `level` (e.g. "complete") as the top-level `overall_status` (the adopter's exact mistake).

- Briefing/output change → version bump; `templates/phases/{requirements,deploy}.md`. No code, no schema change. Integration headers bumped to rc.66.
- No new tests (briefing prose is human-judged; exact-wording assertions are brittle). Suite 1460 green (no test depended on the old wording).

## [2.0.0-rc.65] — 2026-06-09 — phase-ordering gate: a phase cannot be completed/approved over an unvalidated upstream (rc.64 adopter §3.1)

First fix from the **second** third-party validation round (DSB-AT-POC on rc.64 — the project grew 8→20 features, deployable Ready; strong end-to-end result). The one HIGH correctness finding: a feature printed *"🎉 All 5 phases complete and approved!"* while its Phase-1 (requirements) and UX phases were **never validated** — their initial `complete` calls had failed silently (chained with `&&`, piped to `/dev/null`), yet Aitri let architecture→tests→build→verify→deploy be completed and approved on top of a Phase 1 with no stored state, and the deploy step reported full success. `status` later exposed it ("Phase requirements has no stored hash").

Root cause (verified): `complete`/`approve`/`run-phase` each only validated their OWN phase; none checked that the phases producing their required inputs were actually completed/approved. The "All 5 complete" message was printed purely because `approve deploy` ran ([approve.js], no state check).

Fix — an ordering gate driven by the artifact dependency graph (no hardcoded phase numbers):
- New `upstreamProducers(phaseKey)` ([lib/phases/index.js]) — the phases that produce a phase's REQUIRED inputs (skips IDEA.md / 04_TEST_RESULTS.json, which have no producing phase).
- `complete N` ([complete.js]) refuses if any upstream producer is not in `completedPhases`.
- `approve N` ([approve.js]) refuses if any upstream producer is not in `approvedPhases`.
- The deploy "🎉 All 5 phases complete" message is now derived from `approvedPhases` — it celebrates only when every core phase is genuinely approved, otherwise it states which phases are not approved.

The gate uses each phase's declared `inputs`, so the 1→2→3→4→5 chain (and ux→2) is enforced transitively. Optional inputs (e.g. `01_UX_SPEC.md` on phase 2) are NOT required, preserving no-UX projects.

- Behavior change (gate + message). `templates/AGENTS.md` updated (phases complete/approve in order; never suppress gate output).
- No schema change. Integration headers bumped to rc.65.
- Tests: 5 new (`complete.test.js` upstream-ordering, `approve.test.js` upstream-ordering + honest-completion-message ×3); 4 pre-existing fixtures that approved/completed a downstream phase without seeding the upstream were corrected (they relied on the missing enforcement). Suite 1460 green.

## [2.0.0-rc.64] — 2026-06-06 — run-phase shows the upstream FR delta when re-deriving a cascaded phase (TPA-11)

Direct complement to rc.58 (TPA-1). rc.58 *forces* a cascaded downstream phase to be re-derived, but the briefing re-injected the full updated requirements without highlighting WHAT changed — so the agent could re-derive blind and re-omit the exact FR that was just added (the adopter's recurring failure mode). rc.64 *directs* that re-derivation.

- **Snapshot at approval** ([approve.js](../lib/commands/approve.js) + [state.js](../lib/state.js) `writeFrSnapshot`): on `approve` of a downstream phase (not phase 1 / discovery), record the `functional_requirements[].id` set it was built against into the new shared `.aitri#frSnapshots` map.
- **Delta at re-derivation** ([run-phase.js](../lib/commands/run-phase.js)): when re-running a phase that is cascade-pending (`cascadedPhases`), diff the current FR ids against that phase's snapshot and print the added/removed FRs: "Requirements changed since this phase was last approved — + added: FR-026 (must be covered here)". The cascade does NOT clear `frSnapshots`, so the diff survives the reset; re-approving the phase refreshes its snapshot.

Mechanical id-set diff (added/removed), zero-dep, **advisory** — the `fr_coverage` gate at `verify-complete` remains the hard enforcement for MUST FRs. Scoped to added/removed; same-id content changes are out (would need per-FR hashing — deferred, no evidence it's needed).

- Schema: additive shared field `frSnapshots` — `docs/integrations/SCHEMA.md` + `CHANGELOG.md` updated (additive marker). Not projected into `status --json`. `templates/AGENTS.md` updated (re-derivation now shows the FR delta).
- Tests: `test/commands/approve.test.js` (snapshots a downstream phase; not phase 1), `test/commands/run-phase.test.js` (re-deriving a cascaded phase names the added FR). Suite 1455 green.

## [2.0.0-rc.63] — 2026-06-06 — feature briefings surface the parent project's idea_context/ (TPA-4, third-party adopter)

Sixth fix from the DSB-AT-POC adopter. When missing scope is recovered via feature sub-pipelines, the parent's raw source material did not follow: `feature init` creates an empty `feature_context/`, and a feature's spec-phase briefing only scans `feature_context/` — never the parent's `idea_context/` (schema, blueprints, mockups). So if the parent capture was lossy (the headline TPA-3 failure), the feature had no path back to the source and re-omitted the same detail.

A feature spec-phase briefing now appends a read-only POINTER to the parent project's `idea_context/` assets ([run-phase.js](../lib/commands/run-phase.js)): "the parent's idea_context/ has N asset(s); the distilled FRs may not capture every detail — if this feature touches an area these cover, read them so you don't re-omit it." It lists them as `../../idea_context/<file>`. No copy — the feature's own `feature_context/` stays the curated authoritative set, avoiding duplication + staleness; the source is one hop away.

- Behavior change: feature `run-phase` briefing (spec phases) gains the parent-context pointer when the parent `idea_context/` is non-empty. Root pipelines unchanged.
- No schema change. Integration headers bumped to rc.63. Reuses `lib/context-assets.js#listAssets`.
- Tests: `test/commands/feature.test.js` — feature briefing points at the parent asset by name; no pointer when the parent `idea_context/` is empty. Suite 1451 green.

## [2.0.0-rc.62] — 2026-06-06 — Phase-3 critical-flow gate is stack-aware (TPA-7, third-party adopter)

Fifth fix from the DSB-AT-POC adopter (§4.6 / A2). The `≥2 e2e` Phase-3 gate was global and stack-blind, so a **backend-only** feature (no browser flow) could only pass by mislabeling API integration tests as `type: "e2e"` — corrupting the type taxonomy that other gates and the runner read.

The gate is now stack-aware ([phase3.js](../lib/phases/phase3.js)): it reads the FR types from `01_REQUIREMENTS.json` (the same pre-read that builds the id sets). If the surface has a UI (any `ux`/`visual`/`audio` FR) it still requires ≥2 real `e2e`. If it is backend-only it requires ≥2 critical-flow tests of `type` **`e2e` OR `integration`** — so API-level integration tests count, honestly labeled. When requirements can't be read (no `dir` / malformed) it stays conservative and requires `e2e`.

This is a **safe relaxation** — it never makes a currently-passing artifact fail: UI surfaces and the unknown case are unchanged; only a verified backend-only surface is allowed the more honest e2e-or-integration coverage.

- Behavior change (gate): `complete 3` / feature Phase-3. Briefing `templates/phases/tests.md` updated (the critical-flow rule now states the UI-vs-backend split + "do not mislabel integration as e2e").
- No schema change. Integration headers bumped to rc.62.
- Tests: `test/phases/phase3.test.js` — backend-only passes with integration + no e2e; UI surface still requires e2e; conservative when requirements unreadable. Existing e2e tests unchanged. Suite 1449 green.

## [2.0.0-rc.61] — 2026-06-06 — adopt --upgrade re-checks approved artifacts against the current gates (TPA-6, third-party adopter)

Fourth fix from the DSB-AT-POC adopter (§4.3). When gates evolve across versions, a previously-valid artifact can become invalid (the adopter's rc.34 test plan was rejected by rc.52's stricter `ac_id` rules). `adopt --upgrade` migrated STATE but never re-ran the artifact validators, so the breakage surfaced only later — mid-work — at the next `complete --check`.

`adopt --upgrade` now dry-runs each already-**approved** phase's `validate()` and prints a "Gate re-check" advisory listing any artifact the current gates would now reject, with the validator's own error ([upgrade/index.js](../lib/upgrade/index.js) `dryValidateApproved`). Read-only: approvals are unchanged; the gate still runs for real at the next `complete`. Runs in both real and `--dry-run` mode (it never mutates). A missing artifact is skipped (STATE-MISSING handles that).

- Behavior change (observable): `adopt --upgrade` output gains a conditional "Gate re-check" block. `templates/AGENTS.md` updated.
- No schema change. Integration headers bumped to rc.61.
- Tests: `test/upgrade.test.js` — warns on a now-invalid approved artifact, names it, leaves approvals intact, and stays silent when nothing is approved. Suite 1446 green.

## [2.0.0-rc.60] — 2026-06-06 — durable narrative session context + resume staleness/absence flag (TPA-5, third-party adopter)

Third fix from the DSB-AT-POC adopter (A9). Aitri auto-persists *where* you are (events, phase state, lastSession with action/agent/files_touched) but not *why* or *what's next* — and the one place narrative lived, `lastSession.context`, was **ephemeral**: `writeLastSession` overwrites `lastSession` on every state-mutating command, so a `checkpoint --context` was wiped by the next `approve`/`complete`. A long session that ended without a *fresh* checkpoint lost the reasoning thread even though every gate was green.

Verification re-scoped the original backlog item before coding: the proposed "auto-persist the next-action line" was **redundant** (`resume` already recomputes next-action live; `events[]` already gives shared cross-dev action traceability). The real, narrow gap was narrative *persistence* + an *absence/staleness* signal. Both are zero-token (no LLM summary — the agent writes the line, Aitri stops losing it).

- **Durable `sessionContext`.** New per-machine field `.aitri.local#sessionContext = { text, at }` ([state.js](../lib/state.js) `writeSessionContext`). `aitri checkpoint --context` now writes it in addition to `lastSession`; it SURVIVES later transitions ([checkpoint.js](../lib/commands/checkpoint.js)). Per-machine by design — the narrative is a personal thread; cross-dev action traceability stays in the committed `events[]` (so option "shared narrative in `.aitri`" was rejected — merge-conflict cost, no gain over `events[]`).
- **`resume` surfaces it.** New "Session Context" section ([resume.js](../lib/commands/resume.js)): shows the saved thread; flags it stale when a later action post-dates it (compares `lastSession.at` vs `sessionContext.at`); flags ABSENCE on an in-flight pipeline (`lastSession` present, not all-core-approved) — does not nag on a finished pipeline. Projected on the snapshot root ([snapshot.js](../lib/snapshot.js)).

- Schema: additive per-machine field — `docs/integrations/SCHEMA.md` + `CHANGELOG.md` updated (additive marker). Subproducts never read `.aitri.local`. Integration headers bumped to rc.60.
- Tests: `test/commands/checkpoint.test.js` (persists + survives a subsequent transition), `test/commands/resume.test.js` (absence / fresh / stale / no-nag-when-complete). Suite 1443 green.
- `templates/AGENTS.md` updated (save the narrative thread before pausing; no auto-summary by design).

## [2.0.0-rc.59] — 2026-06-06 — source-capture advisory at complete requirements + early legacy-idea/ notice (TPA-3, third-party adopter)

Second fix from the DSB-AT-POC adopter — the headline finding: a rich, precise brief was silently half-dropped (~50% scope loss) because (a) assets sat in a legacy `idea/` folder that is no longer scanned, and (b) **no gate measures whether the FR set reflects the provided source material** — a half-scoped spec passes every mechanical gate and reaches "deployable". The input is the only unrecoverable part of the pipeline; losing it is the worst failure mode.

Two mechanical, advisory additions (no hard gate — the omission was *silent*, not *unblocked*; a loud advisory fixes silence without the false positives a hard "asset has no FR" block would cause):

- **3a — early legacy `idea/` notice.** `init` and `adopt --upgrade` now warn when a legacy `idea/` folder holds assets (it was renamed to `idea_context/` and is no longer scanned), pointing to `mv idea/* idea_context/`. Previously this only surfaced later, at `run-phase`. ([init.js](../lib/commands/init.js), [upgrade/index.js](../lib/upgrade/index.js))
- **3b — source-capture audit at `complete requirements`.** A new `phase1` scope in `runReview` ([review.js](../lib/commands/review.js)) lists the `idea_context/`/`feature_context/` assets and asks the operator/agent to confirm the FRs reflect them. Visual assets (mockups/Figma/PDFs) — which Aitri cannot read (zero-dep, no vision) — get an explicit "confirm each maps to a UX-type FR or is out of scope" note. Advisory only: warnings, never errors; in TTY the existing acknowledge prompt applies, in agent mode it prints and proceeds. Wired through the existing `complete` review gate (phase 1/3/5). ([complete.js](../lib/commands/complete.js))

Shared `lib/context-assets.js` (`listAssets` / `visualAssets`) backs all three call sites. `runReview` scope guards tightened to explicit `phase1`/`phase3`/`phase5`/`all` so the new scope cannot accidentally trigger the req→TC coverage check. `templates/AGENTS.md` updated (agents are told to treat the capture advisory as a real checklist).

- No schema change (no new `.aitri`/artifact field). Integration headers bumped to rc.59.
- Tests: `test/context-assets.test.js` (helper), `test/commands/review.test.js` (phase1 scope: assets warn, visuals flagged, README-only silent, scope isolation, feature_context), `test/commands/init.test.js` (legacy-idea notice). Suite 1437 green.
- Deferred (TPA-3c): filename→FR heuristic to point at *specific* unreferenced assets — false-positive risk, kept advisory/out for now.

## [2.0.0-rc.58] — 2026-06-06 — re-opening an approved phase cascade-invalidates downstream (TPA-1, third-party adopter)

First fix from the **first third-party adopter** validating v2 end-to-end (DSB-AT-POC, .NET + React — the v2.0.0-stable gate). The adopter re-captured root requirements (15→25 FRs) on a complete pipeline and found Phases 2–5 stayed **"approved"** and the project stayed **"deployable"** over the larger spec (feedback §4.4).

Root cause (verified, re-diagnosed from the as-reported "root-vs-feature asymmetry"): the cascade is symmetric, but it only fires when the re-approval sees the phase still in `approvedPhases`. The agent-accessible re-derivation path goes through `run-phase` (drift re-approval is human-gated; `run-phase` is the routed alternative). `run-phase` on an approved phase **removed only that phase** from `approvedPhases` and set its drift — it never touched downstream. So at the later `complete`/`approve`, both cascade triggers (`complete`'s `wasApproved`, `approve`'s `wasAlreadyApproved`) were already false, and the cascade fell through the crack. `complete.js` already **documented** that "run-phase performs this cascade" ([complete.js:75-81](../lib/commands/complete.js)) — the assumption was just never implemented in `run-phase`.

Fix: `run-phase`'s reset branch now calls `cascadeInvalidate(config, phase)` when re-opening a previously-**approved** phase ([run-phase.js](../lib/commands/run-phase.js)) — downstream phases are removed from `approvedPhases`/`completedPhases`, marked cascade-pending (drift steering), and verify/reconcile state is reset when build/deploy are downstream. The operator is warned which phases were reset and how to re-derive them. The idempotent re-read path (unchanged artifact) is untouched — reviewing a briefing still resets nothing.

- Behavior change (observable): re-opening an approved phase via `run-phase` now resets downstream + prints a cascade warning to stderr. `templates/AGENTS.md` updated (agents are told re-opening cascades).
- No schema change — `cascadedPhases` already shipped (rc.54–56); only **when** it is populated changed. Integration doc headers bumped to rc.58 (no contract change).
- Test: `test/commands/run-phase.test.js` — re-opening Phase 1 with 2–4 approved invalidates 2–4, marks them cascade-pending, resets verify, warns. Suite 1425 green.
- TPA-2 (drift human-gate "bypass" via run-phase) resolved as covered by this fix + existing `humanApprovalGate`, not a separate behavior change — see BACKLOG TPA-2 Session Log.

## [2.0.0-rc.57] — 2026-06-05 — drift steering + rehash gate refuse an untracked artifact (regression-review follow-up)

An adversarial regression review of rc.54–rc.56 (run before promoting toward v2.0.0-stable with third-party adopters) found one real hole and confirmed everything else safe. The hole: `git diff HEAD -- <file>` is **empty for an untracked / never-committed file** (git does not diff untracked paths) — a false "clean". So for a project that gitignores its artifacts (non-default; the shipped `templates/gitignore` does NOT ignore `spec/`), a drifted artifact would read as bookkeeping-clean and:
- **C5a steering** (`lib/snapshot.js` `artifactGitClean`) would route to `aitri rehash` instead of human `approve` — re-baselining un-reviewed content without cascade.
- **`rehash`'s own gate** (`lib/commands/rehash.js` `gitFileIsClean`) had the *same* blind spot; its catch-block comment claimed "file never tracked → refuse" but the catch never fired for untracked files (the diff returns empty, not an error), so rehash would proceed.

Both now run `git ls-files --error-unmatch -- <file>` first; an untracked path throws → `artifactGitClean` returns `null` (→ conservative `approve`, human terminal) and `gitFileIsClean` returns `{ok:false}` (→ rehash refuses, telling the operator to commit or `approve`). The default committed-`spec/` flow is unchanged. Tests +2 (1418 → 1420): snapshot untracked-artifact→approve, rehash untracked→refuse.

Review also confirmed safe (no change needed): feature-scope git path resolution, fresh-non-git→approve, snapshot never crashes on git failure (all execSync try/caught, bounded to drifted phases), C2 note is stderr-only (status --json stdout clean), cascadedPhases lifecycle has no stale-mark path (reject is advisory; a cascade-pending phase can't be rehashed — its hash was deleted), cascadePending not leaked into the `status --json` phases[] contract, cascadedPhases written to the shared committed `.aitri`. The one remaining low-severity item — C2 false-positive note when a project is rooted literally at `$HOME` — is left as-is (stderr advisory, conditional wording; does not apply to the maintainer's `~/.aitri`, which is a stray abandoned project the note correctly flags).

## [2.0.0-rc.56] — 2026-06-05 — after cascade, the next action re-derives instead of laundering (C5b)

C5b, resolved with the cascade-marker design (the premise that shipped, not the one the backlog first proposed). When re-approving an upstream phase cascades, the downstream artifacts stay on disk but their hashes are cleared → they read as `in_progress`, and the snapshot recommended `complete`. But `complete 2` (architecture) `validate()` is structural — it does NOT cross-check the design against the *changed* Phase-1 FRs — so `complete` could re-validate and re-approve a **stale** downstream artifact (the rc.24 drift-launder class). The approve footer already said `run-phase`; the two surfaces disagreed and the snapshot's verb was the unsafe one.

The fix needs to tell "reset by a real upstream change → re-derive" from "being authored for the first time → complete" — and those look identical in state (artifact exists, no hash, not approved). So `cascadeInvalidate` now records the phases it reset in a new `.aitri#cascadedPhases` array; the snapshot flags those phases `cascadePending`, and `nextPhaseAction` returns `run-phase` (re-derive with the new context) for a cascade-pending `in_progress` phase, `complete` for a genuinely mid-authored one. The mark is pruned per-phase by `complete`/`approve` (the phase has now been re-derived). The approve footer was already correct (`run-phase`), so the two surfaces now agree on the safe verb.

**Coherence with C5a (rc.54):** C5a routes bookkeeping re-approvals to `rehash` (no cascade), so a cascade now almost always means a *real* upstream change — making `run-phase` (re-derive) the right downstream verb nearly every time. The two fixes compose.

New `.aitri#cascadedPhases` field (additive — SCHEMA.md + integrations CHANGELOG updated) and `clearCascadePending()` helper in `lib/state.js`; `cascadePending` on the snapshot phase object (internal — `status --json` `phases[]` shape unchanged). Tests +10 (1408 → 1418): cascadeInvalidate marks tracked-only / unions / no-mark-when-nothing-tracked; clearCascadePending prunes; snapshot cascade-pending→run-phase + mid-authoring→complete (regression lock). Smoke: status recommends `run-phase` for a marked phase and `complete` for an unmarked one; `complete 2` clears `2` and keeps `3`.

## [2.0.0-rc.55] — 2026-06-05 — surface stray `~/.aitri` capture instead of projecting phantom state (C2)

The dispatcher resolves the project dir by walking up for `.aitri` (like git finds `.git`). A stray `.aitri` at `$HOME` therefore captures every cwd beneath it: running `aitri status`/`resume` from an unrelated empty dir under `$HOME` resolved to the `$HOME` project and printed its full state with **zero signal** that the root was several levels up — it amplified an operator `cd` slip during the finance-dashboard canary.

Now, when the upward search resolves to `$HOME` exactly (and cwd is not its own project), the CLI prints a one-line note to stderr before dispatching: `No .aitri here — resolved to the project at $HOME (…). If you meant to start a new project here, run: aitri init`. Non-blocking and informational — the command still runs against the resolved project, so nothing breaks for someone who genuinely keeps a project at `$HOME`; they just get a reminder.

New pure helper `homedirCaptureNote(cwd, resolvedDir, homedir)` in `lib/state.js` (no fs, no stdout — bin emits). `init` is exempt (it creates a project, not resolves one). **Backlog correction:** the C2 item pointed at `findProjectRoot` in `state.js` as the walk to fix — but that function has **no callers** (dead code); the real upward search is `findProjectDir` in `bin/aitri.js`. The fix targets the actual path; the dead helper is left untouched (the module header claims MCP-server sharing — removal is a separate call). Tests +4 (1406 → 1410): own-project → null, non-$HOME ancestor → null, empty-dir-under-$HOME → note, cwd-is-$HOME → null. No schema change.

## [2.0.0-rc.54] — 2026-06-05 — drift next-action steers by drift kind, not always `approve` (C5a)

After drift on an approved phase, every next-action surface (`status`, `resume`, `validate`, `verify-complete`) told the operator to run `aitri approve <phase>`. But `approve` is isTTY-gated and hard-blocks an agent after drift — so in the only real mode (agent), the single authoritative next action was a command the agent structurally cannot run, dead-ending the recovery loop.

`computeNextActions` (and the `nextPhaseAction` per-pipeline path) now classify the drift the same way the `approve` drift hint already does (A5/alpha.3): a per-artifact `git diff HEAD` decides.
- **Bookkeeping drift** — artifact content matches git HEAD (stale stored hash from a prior Aitri version) → steer to **`rehash <phase>`**, which IS agent-runnable and clears the hash without cascade re-work. Feature scope emits `aitri feature rehash <name> <phase>`.
- **Real content change** (`git diff HEAD` non-empty) **or git unavailable** → keep **`approve <phase>`** but state in the reason that it must run in a human terminal (an agent cannot re-approve after a real edit). The git-unavailable path is deliberately conservative — never routes to `rehash` on an unknown.

New `driftAction()` + `artifactGitClean()` helpers in `lib/snapshot.js`; both drift sites (priority-2 `computeNextActions`, `nextPhaseAction`) route through `driftAction`. No `.aitri`/artifact schema change → no integrations CHANGELOG entry (the snapshot `nextActions[]` shape is unchanged — only the chosen command/reason for a drifted phase). Tests +4 (1402 → 1406): bookkeeping→rehash, real-edit→human-terminal approve, git-unavailable→conservative approve, feature-scope→`feature rehash`.

**Not done — C5b re-scoped (was bundled here):** the backlog claimed the cascade-invalidation footer/status disagreement (`run-phase` vs `complete`) was cosmetic with `complete` as the correct verb. Code read says otherwise: after cascade the downstream artifact is unchanged on disk but its upstream changed, and `complete 2` (architecture) does NOT cross-check the design against the new Phase-1 FRs — so `complete` could launder a stale design (the rc.24 drift-launder class). The footer's `run-phase` (re-derive with new context) is arguably the *safer* verb. Resolving this is a semantic decision (complete-vs-run-phase after cascade), not a cosmetic alignment — moved back to BACKLOG with the corrected analysis rather than guessing.

## [2.0.0-rc.53] — 2026-06-05 — finance-dashboard canary follow-ups (state-loss, gate-contract, feature ergonomics)

Code-verified fixes from a from-scratch consumer canary (React/Vite/TS + Express + SQLite MVP 1→5 + verify + validate, then `auth` and external-API `fx` feature sub-pipelines). Deep re-analysis against code corrected two of the reported items (see Discarded notes in BACKLOG).

- **P1 — `run-phase` silently wiped a prior `complete`/`approve`.** Re-reading a phase briefing unconditionally cleared the phase from `completedPhases`/`approvedPhases` and could flag drift, while the footer implied no side effects (repro: `complete build` → `run-phase build` → `approve build` failed "has not been validated"). Now an **idempotent re-read** — when the phase is already completed/approved AND its artifact is unchanged (`hasDrift` false) — prints the briefing WITHOUT clearing state or logging a `started` event. A genuine re-do (artifact changed) still clears, and now **warns loudly** that state was reset. `lib/commands/run-phase.js`.
- **P1 — `verify-complete` gated EVERY FR for a passing test, not just MUST.** This contradicted CLAUDE.md principle 8 ("every **MUST** FR traced to a passing test") and Phase 3 / `complete 3` (which never block a SHOULD/NICE FR), dead-ending the deploy gate on a legal non-MUST FR with no agent self-recovery. The hard-block set is now MUST FRs only; uncovered SHOULD/NICE FRs are surfaced as a non-blocking warning. Also un-nested the gate's `err()` calls from the JSON-parse `try/catch` that would have silently swallowed a real coverage failure had `err` not exited. `lib/commands/verify.js`.
- **P3 — feature Phase-1 FR/NFR floor relaxed for increments.** The greenfield floor (5 FR / 3 NFR) forced filler on small features (a real 4-FR `fx` increment was blocked). Feature scope now requires 2 FR / 1 NFR; root keeps the full floor. Threaded `featureRoot` into the `complete` → `validate` ctx. `lib/commands/complete.js`, `lib/phases/phase1.js`.
- **C4 — feature Phase-1 empty-section warner used ROOT IDEA section names against the FEATURE_IDEA seed**, producing spurious "## Business Rules is empty" warnings. It now uses the FEATURE_IDEA section set (Problem / Why, Target Users, New Behavior, Success Criteria) and names FEATURE_IDEA.md in scope. Fixing this surfaced a latent regex bug — `## ${name}\s*\n` over-consumed blank lines, so a truly-empty middle section captured the NEXT section's body and never warned; anchored to the header line (`[^\n]*\n`). `lib/phases/phase1.js`.
- **Template/wording (build, requirements, tests, ux personas):** C1 — the build Delivery Summary footer ordered `verify-run → … → approve 4`, but `verify-run` hard-errors until Phase 4 is approved; reordered to `complete 4 → approve 4 → verify-run → verify-complete`. #3a — the regression-boundary briefing's "fails loudly" claim now states precisely what is enforced (complete 3 requires a TC for a MUST NFR; a failing regression test blocks verify-complete) and that translating a Must-Not-Break item into an NFR is the agent's responsibility. #4 (doc-only) — build briefing now documents that `feature verify-run` executes with the feature dir as CWD and shows the `--root ../..` pattern for tests that live at the project root (the CWD itself was NOT changed — see Discarded). C5c — tests briefing "Every FR-* gets min 3" corrected to MUST-only. C3 — UX persona ROLE corrected (runs AFTER Requirements; feeds Architecture + Implementation, not "between Discovery and Phase 1").
- **AGENTS.md** — "do not re-open approved phases" clarified for the new idempotent-re-read behavior.

Tests +15 (1387 → 1402): run-phase idempotent re-read preserves state / real re-do clears+warns; verify-complete MUST-only block + SHOULD/NICE warning; feature FR/NFR floor relax + root unchanged; feature empty-section warner + regex fix. No artifact/`.aitri` schema change → no integrations CHANGELOG entry. **Deferred:** C5a/C5b (next-action wording in the snapshot SSoT) and the NFR-coverage gate at `verify-complete` (decision-matrix item — see BACKLOG).

## [2.0.0-rc.52] — 2026-06-05 — Post-split message accuracy + adopt existing-project detection (regression follow-ups to ADR-045)

Three low-severity fixes surfaced by a strict regression pass over the rc.46–rc.51 work (the `.aitri` split). None changes behavior of the pipeline gates; all correct operator-facing accuracy or a latent detection bug.

- **P1 — `checkpoint` named the wrong file.** `aitri checkpoint` printed `✅ Checkpoint saved to .aitri`, but post-split `lastSession` is a per-machine field that lands in `.aitri.local`; the shared `.aitri` is deliberately left untouched (the anti-churn guarantee). The message now names `.aitri.local`, so it no longer misleads about which file changed / whether to commit. Comments in `checkpoint.js` + `reconcile.js` (P3) corrected for the same reason (`reconcileState` is local too).
- **P2 — `adopt scan`/`apply` never detected an existing project in the normal layout.** The "project already has .aitri" note hardcoded `.aitri/config.json` (the rare directory-collision layout), so it never fired for the flat `.aitri` file every real project uses. Pre-existing since v0.1.55 — not a split regression, but the split made the directory layout even rarer. Both call sites now route through `state.js` (`configExists` + `loadConfig`), so the layout is resolved in one place — and the direct file reads that bypassed the single-I/O-point invariant are gone.
- **New helper:** `configExists(dir)` in `state.js` — true when a config file exists in either layout. Keeps path-resolution knowledge inside `state.js`.

Tests +5 (1382 → 1387): checkpoint message names `.aitri.local` (bare + `--context`); adopt note fires for flat `.aitri` and stays silent on a fresh dir; `configExists` across both layouts and absence. No artifact/`.aitri` schema change → no integrations CHANGELOG entry.

## [2.0.0-rc.49] — 2026-06-04 — AC-level coverage becomes a gate, not just a report (ADR-041 option A)

rc.48 made AC-level coverage **visible**; this makes it **binding**. A report an over-eager agent can read and ignore is weaker than a gate Aitri executes — exactly the honor-system gap principle 8 and ADR-040 warn against ("seeing untested criteria is half a solution if nothing forces them to be tested"). So `verify-complete` now **blocks** Phase 5 when any declared acceptance criterion is `untested` (no test traces to it via `ac_id`) or `uncovered` (its tests do not pass) — the finer-grained companion to the existing uncovered-FR gate.

**The opt-in is declaring structured ACs — no new flag.** A project only gets `ac_coverage` if it writes `user_stories[].acceptance_criteria` with ids; doing so signals intent for AC-level rigor, so the gate is on by default for those projects and a complete no-op for everyone else (string-AC and legacy projects write no `ac_coverage`). This avoids a parallel `.aitri` flag and matches how the uncovered-FR gate already blocks any uncovered requirement regardless of priority.

Mechanical enforcement of the criterion-level traceability `ac_id` was always meant to provide: a MUST FR can be "covered" while a specific criterion inside it ships untested — that can no longer reach deploy. Tests +3 (1346 → 1349): blocks on an untested AC, passes when all ACs covered, no-op without structured ACs. ARTIFACTS.md updated (the field now blocks); integration CHANGELOG notes the behavior change (`— additive`: the `ac_coverage` shape is unchanged and no subproduct reader is affected — the gate is between Aitri and the operator). Smoke verified: a project with an untested declared criterion is blocked at `verify-complete` until a test covers it.

## [2.0.0-rc.51] — 2026-06-04 — `.aitri` split: shared `.aitri` + per-machine `.aitri.local` (ADR-045)

The fix for a guarantee that was quietly broken in teams. Aitri's own default gitignored `.aitri` entirely ("project-specific, not shared") — so every project, by default, never committed the shared state, which includes `artifactHashes`, the baseline for **artifact-drift detection** (Aitri's core promise: the approved spec hasn't been edited behind its back). A teammate's clone therefore couldn't detect drift at all. The mix of shared + per-machine state forced the bad default: per-machine fields churn on every command, so committing `.aitri` meant git noise → teams (and Aitri's template) gitignored the whole thing → the baseline was thrown away.

**The split (ADR-045):** `.aitri` keeps only **shared** state and is committed; `lastSession` + `reconcileState` move to a gitignored sibling **`.aitri.local`**. `saveConfig` writes `.aitri` only when a shared field other than `updatedAt` changed (no per-command noise on the tracked file); `loadConfig` merges both so every reader still sees one config. New projects get the split + correct `.gitignore` from `init`; existing projects auto-migrate the file content on the next save and `adopt --upgrade` fixes their `.gitignore` (surfaced in the upgrade report). A fresh clone auto-stamps its per-machine reconcile baseline at HEAD on the first `reconcile`.

**Designed as a directory, shipped as a sibling.** ADR-045 first made `.aitri` a directory (`.aitri/config.json`); implementing it broke ~15 tests + the feature subsystem via `EISDIR` (Aitri's own code treats `.aitri` as a file). Pivoted to the sibling: `.aitri` stays a file → churn collapsed to the checkpoint tests, **Hub is untouched** (same path, same shared fields), migration needs no file→dir conversion. Same guarantee, far less risk. ADR-045 + SCHEMA.md updated to the shipped design; integration CHANGELOG marks the two relocated fields `— breaking`. Tests +16 (1364→1380… and onward): split read/write (sibling + auto-migrate + collision), the `ensureAitriGitignore` helper (wired into `test:all` — it was a fresh file), upgrade migration + dry-run, reconcile auto-init; checkpoint + smoke read `lastSession` from the merged/local path.

## [2.0.0-rc.50] — 2026-06-04 — `BACKLOG.json` richness: optional Entry-Standard detail fields + `backlog show` (additive)

The original "enrich the backlog" requirement, done as it was actually meant: **add fields, do not change format.** A detour explored consolidating the two backlogs to markdown — rejected (owner's call: do not break a working structured surface just to switch format; recorded in Discarded). What ships here is the additive part that was always the point.

`aitri backlog add` now accepts four optional flags — `--files`, `--behavior`, `--decisions`, `--acceptance` — stored as optional string fields on the item. `aitri backlog show <id>` prints one item with all its detail. This brings the BACKLOG.md "Entry Standard" richness (self-contained, implementable-later entries) onto the structured `spec/BACKLOG.json` item, for the consumer that always exists: **the client project's agent**, who reads the backlog to decide what to build and benefits from entries it can implement without re-deriving context.

Strictly additive: items without the flags are unchanged (the keys are simply absent), old readers ignore the new fields, `fr_coverage`-style gates are untouched, no version of the schema breaks. Bundled a doc correction: ARTIFACTS.md's `BACKLOG.json` schema listed `fr`/`created_at`/`updated_at` while the code writes `fr_id`/`createdAt`/`closedAt` — the doc now matches the code (no data change).

**Coverage-gap fix found while wiring the tests:** `test/commands/backlog.test.js` was **never listed in the `test`/`test:all` scripts** — the entire `aitri backlog` command (add/list/done) was untested in the gate. Added the file to both scripts; the suite jumps 1349 → 1368 (+19: 15 pre-existing backlog tests now gated + 4 new — rich fields stored / omitted-when-absent / `show` prints detail / `show` errors on missing-or-unknown id). `help` + the module usage updated.

## [2.0.0-rc.48] — 2026-06-04 — AC-level traceability: `verify-run` reports per-acceptance-criterion coverage (ADR-041 option A)

rc.36 shipped option B (`ac_id` conditional — stop requiring a join-key with no target). The original Three Amigos vision — every test traces to a specific acceptance criterion — was valid but abandoned half-built: `ac_id` had a producer (Phase 3 requires + validates it when structured ACs exist) but **no consumer**, so it was decorative. ADR-041 named the trap: "do NOT rebuild the upstream without the consumer — the consumer IS the point." This builds that consumer.

**The deliverable: `buildACCoverage` in `verify-run`.** When `01_REQUIREMENTS.json` declares structured acceptance criteria (`user_stories[].acceptance_criteria` as `{ id, text }`), `verify-run` now rolls up the runner results per criterion via each TC's `ac_id`, writes an additive `ac_coverage` array to `04_TEST_RESULTS.json`, and lists in its output any criterion that no test reaches. `fr_coverage` says "FR-001 is covered"; `ac_coverage` says "…but AC-001-3 has **no test**" — a new `untested` status that exists only at AC level. This is what catches an untested acceptance criterion inside an otherwise-covered FR (the value for regulated/enterprise adopters).

**A divergence from the backlog spec, on purpose (like N2).** The item imagined structured ACs living on `functional_requirements[].acceptance_criteria` (string-OR-object). But the mechanism that already exists (rc.36, ADR-041 B) keys `ac_id` to `user_stories[].acceptance_criteria` — and the FR-level `acceptance_criteria` gates (metric/vagueness/duplication) assume plain strings; making them objects would break those. So the consumer reads structured ACs from `user_stories` (where Phase 3 already reads them), and FR-level ACs stay strings. No second, competing AC location was introduced.

**Scope: reporting, not a new hard gate.** `ac_coverage` is surfaced and persisted; it makes `ac_id` a real join-key with a consumer. It does NOT block `verify-complete` by default (additive, evidence-base discipline — no adopter has asked for enforcement yet). An opt-in strict gate is the natural next step once one does. `complete 1` gains one additive check: structured AC ids must be non-empty + unique (protects the join key, mirrors the rc.26 FR-id gate), enforced only when structured ACs are present.

Additive on two artifacts → integration CHANGELOG updated (`— additive`). Tests +8 (1338 → 1346): `buildACCoverage` (untested/covered/uncovered, no-structured-AC skip, `{id,text}`+`{id,description}` shapes) + phase1 AC-id uniqueness (unique passes, duplicate/empty throw, plain-string additive). Smoke verified end-to-end: an AC with no TC surfaces as `untested` in `verify-run` output and in `ac_coverage`.

## [2.0.0-rc.47] — 2026-06-04 — reconcile briefing: proportional by compaction, not by relevance-filter (N2)

The `aitri reconcile` briefing embedded the FULL `01`/`03`/`04` JSON — ~70KB on large projects (Ultron canary). The backlog plan (N2) was to show "only the FRs/TCs that reference a changed file." **That design turned out to be infeasible:** a full read of the artifact contract + a code sweep confirmed there is **no file→FR mapping anywhere** — `files_created`/`files_modified` are bare path strings, no FR or TC references a source file, and nothing in `lib/` resolves one. Filtering by relevance would mean guessing the mapping, and a wrong guess under-contexts the drift classification — the exact risk the item flagged. So the approach changed from *filter* to *compact*.

**Compaction keeps every FR and TC — no coverage signal is dropped — but projects them to what classification needs:**
- **`03_TEST_CASES`** → `compactTestCases`: each TC keeps id, title, FR mapping (`requirement_id`/`frs`), `user_story_id`, `ac_id`, `type`, `scenario`, `expected_result`; the verbose execution fields (`steps`, `given`/`when`/`then`, `test_data`, `preconditions`) — 70-80% of the weight, not needed to decide new-feature / fr-change / bug-fix / refactor — are dropped.
- **`04_BUILD_REPORT`** → `compactManifest`: keeps file lists, `test_files`, `test_runner`, and `technical_debt` (which carries `fr_id`); drops `quality_gates`, `environment_variables`, `setup_commands` (irrelevant to classifying drift).
- **`01_REQUIREMENTS`** → kept in full (the primary classification reference).
- Both projections **fall back to the raw text** if the artifact does not parse — never worse than before.

**Plus the missing half:** the template told the agent to "read the actual code changes" but the briefing never included them. It now embeds a per-file `git diff` vs the baseline (git baselines only; each file capped at 200 lines with a "run git diff for the rest" note; mtime baselines keep the file list as before). Paths are passed as argv elements (`execFileSync`), not interpolated into a shell string.

Net: the briefing scales with the change, gains the diffs it always pointed at, and loses nothing the classifier uses. CLI-briefing behavior only — no artifact/`.aitri` schema change (no integration CHANGELOG entry; the four integration-doc headers bump per release-sync). Tests +6 (1332 → 1338): compaction keeps all TCs / drops verbose fields / trims the manifest / falls back on bad JSON (reconcile.test.js). Smoke verified end-to-end on a real git baseline (diff embedded, fields dropped, no TC lost, graceful fallback on malformed JSON).

## [2.0.0-rc.46] — 2026-06-04 — intake redesign Phase 5b: `--guided` discovery works in agent mode (ADR-039)

The last open phase of the ADR-039 intake redesign. `aitri run-phase discovery --guided` used to **hard-error** (`--guided requires an interactive terminal`) whenever stdin was not a TTY — which is the only real operating mode (an agent driving the CLI). The strongest elicitation primitive Aitri has — a fixed problem-definition interview — was therefore dead exactly where it mattered, so agents fell back to inferring the seed instead of asking the user. Tier-1 thread: better-confirmed problem/users/success → better requirements → better produced software.

**Fix (a) — non-TTY fallback, not an error.** In agent mode, `--guided` discovery now prints an *agent-conducts-the-interview* briefing (the same pattern `aitri wizard` already used when non-TTY): the agent is told to put the fixed questions to the user, confirm each field, mark unconfirmed values `[ASSUMPTION]`, then produce `00_DISCOVERY.md` grounded in those answers. The normal discovery briefing still follows below it. Interactive TTY (and test-injected readers) keep the live-interview path unchanged — answers are collected and injected as the briefing's primary-source Interview Context.

**Fix (b) — interview unification.** The wizard's non-TTY agent briefing was a private, IDEA.md-hardcoded function; the discovery path had nothing. Extracted one shared, exported builder `buildAgentInterviewBriefing({ questions, target, dir })` parameterized by closing action (`target: 'idea'` → write IDEA.md; `target: 'discovery'` → feed `00_DISCOVERY.md`). The `QUICK_QUESTIONS` field set and `collectInterview` were already shared by the live paths; this removes the last duplicated code path. `aitri wizard` output is byte-for-byte unchanged.

No artifact/`.aitri` schema change — CLI-briefing behavior only (no integration CHANGELOG entry; the four integration-doc version headers bump per release-sync). `templates/AGENTS.md` audited: the discovery bullet now notes `--guided` runs the interview and works in agent mode. Tests +4 (1328 → 1332): the discovery-target briefing framing + shared-builder discipline (wizard.test.js); the non-TTY agent-mode fallback no longer errors and prints the interview briefing (run-phase.test.js).

## [2.0.0-rc.45] — 2026-06-03 — intake ground-truth: provenance sources (#5) + just-in-time constraint confirmation (#8) (ADR-043)

Two intake refinements the author reopened after seeing their value once separated.

**#5 — `idea_provenance_sources` (new additive field).** Each Tier-A input now records WHERE it came from. The upgrade over the rc.44 nudge: at approve the human sees per-field sources, so a weak one stands out — `success_metric: confirmed ← inferred from product type ⚠` next to `problem: confirmed ← IDEA.md` — instead of a generic "all confirmed, double-check". `complete 1` warns (does NOT block) when a `confirmed` field has no source. Additive field (the `idea_provenance` enum is unchanged — no type change); honor-system at the edge (an agent can fabricate a source), accepted because it adds real information to the checkpoint at additive cost. `requirements.md` instructs filling it; ARTIFACTS.md + integration CHANGELOG document it.

**#8 — just-in-time constraint confirmation (briefing-only, no schema/gate).** The author's rule: if a constraint is already clear in `01_REQUIREMENTS.json` (`constraints`/`technology_preferences`), USE it — do NOT re-ask; only confirm a MISSING/vague one, just before the phase it shapes. `architecture.md` gains a "Constraint check" block (tech stack, infra, budget, timeline, existing systems, security/compliance); `phaseUX.md` gains the UX version (design system, accessibility, devices, performance budget). Producer-side, low-risk — same lever as ADR-040 #3.

Tests +5 (1323 → 1328): provenance source display + flag + warn/no-warn; the architecture constraint-check block.

## [2.0.0-rc.44] — 2026-06-03 — checkpoint hardening (ADR-040): designated-vs-self-discovered context + all-confirmed approve nudge

Two cheap producer-side levers from ADR-040 (the first-third-party checkpoint findings), shipped now; a third (`source` field on provenance) stays deferred.
- **Instruction-hardening.** `templates/AGENTS.md` (copied into all five agent files) + the Phase 1 briefing now state the rule that decides `confirmed` vs `assumed`: context the user **designated** (`idea_context/`/`feature_context/`, a path they gave) may ground `confirmed`; context the agent **self-discovered** by scanning the project is `assumed` until its source is confirmed — it could be stale or another project's material. Directly addresses the canary where the agent grabbed an arbitrary folder and marked everything confirmed. Producer-side; the irreducible residual (an agent that ignores its instruction file) is documented, not pretended-fixed.
- **Approve-time nudge.** `summarizeRequirements` now nudges on the all-`confirmed`-with-0-gaps shape — the exact output an over-eager agent produces by marking everything confirmed without asking. The human approving sees: "verify YOU confirmed these (especially the success metric), not the agent inferring from docs." Display-only.

Tests +3 (1320 → 1323). No schema/contract change (instructions + a display nudge).

**Backlog groomed in the same pass:** the `normalize`/artifact stale refs from the rc.40–41 renames are fixed; the PRD-acronym-rename (path A) is CLOSED as rejected (homologation B shipped); the `idea/`-as-unit structure is documented as a high-risk/low-value future note (not pursued); the `BACKLOG.json` schema + Copilot-detection items collapsed to one-line DEFERRED (waiting on a real signal). Open backlog now reads at a glance: one external v2 gate + a handful of real improvements + signal-gated deferrals.

## [2.0.0-rc.43] — 2026-06-03 — fix two real defects (venv test-target detection + verify-run exit-code divergence)

Two canary-surfaced defects from BACKLOG, both verified against code first.

**1. `diagnoseLegacyVenvManifest` detected the binary but not the test TARGET (Cesar canary).** A feature's `verify-run` runs from the feature dir (alpha.9), so a root-relative path *anywhere* in `test_runner` breaks there — but the check only matched a venv-prefix *binary*. The agent fixed the binary, the finding cleared ("no findings"), and `verify-run` still failed on the root-relative target (`tests/foo.py`), forcing a second drift→re-approval round. Fix: a concrete (file-existence, not heuristic) check — a relative path token in a feature manifest's runner that does not resolve under the feature dir is flagged. Skips flags, bare binaries, absolute paths, the venv binary, and globs / Go `./...` (no false positives). Finding names the unreachable target.

**2. `verify-run` swallowed a non-zero runner exit code the parsed TCs didn't explain (Hub canary).** `npm test` exited 1 but Aitri parsed 27 pass / 0 fail / 5 skip and accepted it silently — correct here (skips explained the exit), but the divergence had no signal. Fix: when the runner exits non-zero and zero TCs failed, `verify-run` now emits an informational note (benign skips, OR a real failure outside the parsed TCs — collection/setup error, post-last-test crash). Informational, not a gate — Aitri still keys pass/fail on parsed TCs.

Tests +3 (1317 → 1320): root-relative target flagged + glob/feature-local NOT flagged; exit-code divergence note fires. No schema/contract change (migrator finding shape unchanged, verify-run note is stderr) — no integration CHANGELOG entry.

## [2.0.0-rc.42] — 2026-06-03 — homologation layer: artifacts speak the industry's language (ADR-042 Phase 3 — completes ADR-042)

The low-risk closer: make the industry document type **prominent** without renaming files (the "explanatory + recognised" goal). No contract change, no migration, no breaking.
- **`aitri help`** now shows the full industry document type in cyan (prominent), not a dim grey `≈` aside: `01_REQUIREMENTS.json → Product Requirements Document (PRD / SRS)`, `02_SYSTEM_DESIGN.md → Technical Design Document (TRD / SDD)`, `03_TEST_CASES.json → Test Plan`, `05_TRACEABILITY.json → Traceability / Compliance Report`, etc.
- **Phase briefings** (`templates/phases/*.md`) now open with the artifact's industry document type, so the agent knows what kind of document it is producing and **reports it to the user by that name** ("I've drafted your PRD"). The MD-producing phases (architecture, discovery, ux) are also told to title the document with its designation.

User-facing impact, honestly: recognition + professional framing, not a new capability — an industry-literate user (PM, architect) recognises each artifact instantly; a user who doesn't know the acronyms is unaffected (the clear filenames still work). Tests +1 (1316 → 1317): help shows the full document-type names; the requirements briefing frames the PRD. No integration CHANGELOG entry (CLI display + briefing prose, no schema/contract change).

**ADR-042 is now complete** (Phase 1 reconcile + Phase 2 artifact renames + Phase 3 homologation). The PRD/idea-structure (B) decisions stay parked separately.

## [2.0.0-rc.41] — 2026-06-03 — rename the two Aitri-specific "weird" artifacts (ADR-042 Phase 2)

`04_IMPLEMENTATION_MANIFEST.json` → `04_BUILD_REPORT.json`; `05_PROOF_OF_COMPLIANCE.json` → `05_TRACEABILITY.json`. These were the artifacts the author flagged as "invented" — and unlike requirements/design/tests, they have no industry equivalent, so a clearer Aitri name is the fix (05 also gains the precise industry term: "traceability"). Clean rename, no dual-naming.

Done with the same care as Phase 1. The filenames are unambiguous strings (no generic collision), so the sweep is safe; **historical CHANGELOG/ADR entries were deliberately NOT rewritten** (that would be false history). Migration: `.aitri` keys `artifactHashes` by phase number, not filename, so state is untouched — the `adopt --upgrade` migrator just renames the file on disk (`diagnoseRenamedArtifacts`), content unchanged so the phase-keyed hash still matches and approvals are preserved. Concept prose updated too (reviewer persona, deploy briefing header, the Phase 5 validation error message). Tests +1 (1315 → 1316): the on-disk rename migration. Integration CHANGELOG marked breaking; Hub adapts.

Phase 3 (homologation layer) is the only remaining ADR-042 step.

## [2.0.0-rc.40] — 2026-06-03 — rename `normalize` → `reconcile` (ADR-042 Phase 1)

First phase of the naming cleanup. `normalize` communicated nothing about what it does ("classify code changes made outside the pipeline"); `reconcile` does. Full clean rename, NO alias (per the clean-break principle): the command, the `.aitri` state field `normalizeState` → `reconcileState`, the `status --json` contract (`normalize` object + `normalize_pending` reason → `reconcile*`), `lib/normalize-patterns.js` → `lib/reconcile-patterns.js`, `templates/phases/normalize.md` → `reconcile.md`, `lib/commands/normalize.js` → `reconcile.js`, AGENTS.md, help, contract docs.

Done with maximum care to avoid regressions (the author's explicit ask). The real risk was the ~300-reference sweep, NOT the migration: a context-aware sweep that never touched the generic `normalizeAC` / string-normalisation / `String.normalize()` (verified absent in swept files), with the full suite as the backstop after every block. The migration is trivial and idiomatic — `normalizeState → reconcileState` is a one-line field rename in the existing migrator, and it **preserves the original baseline** (re-adopt was rejected: `adopt` resets pipeline progress to phase 0). Tests +1 (1314 → 1315): the field-rename migration preserves baseRef. Integration CHANGELOG marked breaking; Hub adapts.

Phase 2 (artifact renames `04`/`05`) and Phase 3 (homologation layer) remain — same ADR.

## [2.0.0-rc.39] — 2026-06-03 — context injected only in spec-definition phases (not execution) — dissolves the staleness problem

Co-designed with the author. The insight that replaced the whole "context lifecycle / close-on-deploy" design we had been circling: **context belongs to the phases that DEFINE the spec, not the ones that EXECUTE it.** `run-phase` now injects the `idea_context/` / `feature_context/` asset list ONLY in `{discovery, requirements(1), ux, architecture(2), tests(3)}` — the phases deciding WHAT to build. The execution phases (`build(4)`, `deploy(5)`, `review`) work from the approved artifacts (the source of truth); raw context is not injected there. It stays on disk and the agent reads it on request (e.g. to check build fidelity against a mockup).

Why this beats the lifecycle mechanism we almost built: it is a **static relevance rule**, not a stateful open/closed mechanism with deploy-triggers and reopen logic. And it **bounds staleness for free** — assets only surface during spec definition, when they are fresh and relevant, so stale material can never leak into late-phase briefings. The earlier honest finding (close-on-deploy only addressed the rare "re-touch a completed unit" window, not the common one) is what pushed us here; this rule addresses relevance directly and the staleness worry dissolves as a side effect.

Tests +2 (1312 → 1314): discovery injects context; build does not. The deferred "staleness mechanism" BACKLOG item is closed — superseded by this simpler rule.

## [2.0.0-rc.38] — 2026-06-03 — context folder: rename `idea/` → `idea_context/` + per-feature `feature_context/` + staleness framing

The `idea/` assets folder collided in name with `IDEA.md` and had no lifecycle (author fresh-install review). Renamed, scoped, and framed — a **deliberate breaking change**, appropriate now: pre-v2-stable, ~5 projects, Hub being rebuilt, and **no consumer reads the folder name** (it is an internal scan, not a documented contract). Owner's call: do not freeze Aitri's evolution for the few old projects; they migrate manually (rename a folder).

- **Rename, scope-aware:** root projects use `idea_context/` (pairs with `IDEA.md`); feature sub-pipelines use `feature_context/` (pairs with `FEATURE_IDEA.md`). `run-phase` scans the right one by scope; `feature init` now creates `feature_context/` + README (features had NO context folder before — a real gap).
- **Loud migration, not silent:** if a legacy `idea/` folder still holds assets, `run-phase` prints a note (`idea/ is no longer scanned — mv idea idea_context`) rather than silently dropping the context.
- **Staleness framing (light, foresight — no incident yet):** the briefing note now says the assets are *supporting reference, not the source of truth — ignore anything superseded as the project evolved*; the README tells the operator to curate. A heavier mechanism (auto-archive / staleness detection, à la ADR-031 for IDEA.md) is deliberately deferred until a real contamination incident — building it now would be over-engineering an un-observed problem.
- Updated: `init.js`, `run-phase.js`, `feature.js`, `help.js`, `templates/IDEA.md`, `templates/AGENTS.md`. Tests +4 (1308 → 1312). No artifact/.aitri schema change (the folder is not a contract) — no integrations CHANGELOG entry.

## [2.0.0-rc.37] — 2026-06-03 — onboarding clarity: `init` output + `help` accuracy (author fresh-install review)

Author ran a clean `aitri init` with fresh eyes and surfaced onboarding friction. A deep review of `help.js` + the init output against the 21 real commands found five real issues (all CLI text — non-breaking):
- `init` description claimed it "creates IDEA.md + spec/" — it actually creates spec/, idea/, .aitri, .gitignore, BACKLOG.md, IDEA.md **and five per-agent instruction files**. Help now lists what it really creates.
- `wizard` help showed `--depth quick|deep` — the real options are `quick|standard|deep` (was missing `standard`).
- `init`'s "What to do now" never mentioned the `idea/` folder — and it collides in name with `IDEA.md`. The output now explains the folder, distinguishes it from the file ("IDEA.md is the file you write; idea/ is the folder for assets"), and notes the per-agent files exist and are auto-read. The `idea/README.md` carries the same distinction.
- `review` is a top-level command (`aitri review`) but was shown only as a phase — now annotated.
- Agent list: "Gemini Code" → "Gemini CLI"; Opencode marked "(via AGENTS.md)".

Parked (BACKLOG, decide before v2 stable — the pre-stable window is the only place a breaking rename is acceptable): (1) **industry-standard artifact vocabulary** (PRD/SRS/TRD/SDD) — owner wants Aitri to read professional, not invented; rename-files vs elevate-vocabulary. (2) **context folder** — rename `idea/` + give it a lifecycle (it contaminates briefings once stale, like IDEA.md did pre-ADR-031) + per-feature context folders. Both are naming/structure decisions deliberately batched, not snap-picked. No tests changed (1308).

## [2.0.0-rc.36] — 2026-06-02 — `ac_id` becomes conditional (ADR-041 option B) — stop requiring a join-key with no target

The ac_id-chain decision from ADR-041, resolved to **option B**. Backstory (dug out of the record): `ac_id` was introduced (commit `4c55bfc`, "Three Amigos gate") as the demand-half of a full FR→US→AC→TC traceability vision — but it was never completed: Phase 1 was meant to emit structured `acceptance_criteria` with ids and instead emits plain strings (the gate was softened to a warning when that was discovered), and **no downstream consumer ever read `ac_id`** (verify-run + phase5 key on FR/NFR ids). So it sat as a mandatory field tracing to nothing — a textbook case of the "field added without a consumer = theater" pattern the constitution now warns against. It blocked a real third-party adopter mid-Phase-3.

Option B: `aitri complete 3` requires `ac_id` **only when** Phase 1 provides structured AC ids (then it is required AND value-checked); otherwise it is optional (`lib/phases/phase3.js` — reqs read once up front, the presence check gated on `knownAcIds.size > 0`). Traceability still holds via `requirement_id` + `user_story_id`. Briefing + ARTIFACTS.md updated to describe the conditional contract; integrations CHANGELOG marked **breaking** (a TC that always carried `ac_id` may now omit it — though no consumer reads it). Tests adjusted (the two unconditional-ac_id tests → conditional: required-when-structured + optional-when-not). 1308 tests.

The original vision is **not discarded** — it is parked in BACKLOG as "AC-level traceability done right", which means building the missing **consumer** (AC-level coverage in verify-run) + accepting structured ACs additively, gated on a real adopter wanting AC-level coverage. ADR-041 records the full reasoning.

## [2.0.0-rc.35] — 2026-06-02 — Phase 3 briefing: consolidate the mechanical gates + name available ac_ids in the error

Second third-party session (same Inchcape adopter, rc.34 — `init` now works). Its headline complaint ("Phase 3 schema not documented, 45 min lost to trial-and-error") was, on verification, **mostly false** — `test_plan`, the `type`/`scenario` enums, the `h`/`f` suffix gate, min-3-per-FR, `user_story_id`/`ac_id` were all already in `templates/phases/tests.md`. But the real signal underneath is fair: the contract was *spread* across the template (lines 27, 40, 90, 114), after a large injected `REQUIREMENTS_JSON`, so an agent skimming missed it. Two agent-independent fixes (the behavioural findings — auto-approve, gate-skipping — stay N=1 on one agent/OS and are NOT acted on yet; see ADR-040):

1. **Consolidated `## Hard gates` block** at the top of the Phase 3 schema section — one scannable list of exactly what `complete 3` rejects (fields, enums, suffix↔scenario map incl. the "no `n` suffix" gotcha, min-3 + happy/negative, ≥2 e2e, and the honest truth about `ac_id` validation). Replaces the partial, lower-down "Schema contract — CRITICAL" block (consolidate, don't duplicate).
2. **`ac_id` cross-check error now lists the available ids** (`lib/phases/phase3.js`) — the agent invented `AC-FR-001-1` formats because the error never said what was valid. Now: "Available ac_id values: AC-001, AC-002 … — use one of these."

Tests +2 (1306 → 1308): briefing carries the Hard-gates block; cross-check error lists available ids. No schema/artifact/contract change. The `ac_id`-chain incoherence itself (Phase 3 requires a join-key Phase 1 doesn't enforce) is a deeper design question — captured in **ADR-041**, not patched here.

## [2.0.0-rc.34] — 2026-06-01 — fix: npm-publish strips `templates/.gitignore`, crashing `init` for every npm-registry user

First third-party adopter (Inchcape / DSB-AT-POC, GitHub Copilot CLI) hit `Error: ENOENT … templates/.gitignore` on the very first `aitri init`. Root cause is mechanical and verified with `npm pack --dry-run`: **npm always strips files named `.gitignore` from published tarballs**, so a dotted template is absent on any `npm i -g aitri` install — and [init.js](../lib/commands/init.js) read it with an unguarded `readFileSync`. Author canaries never saw it because they install from GitHub (git keeps the file). Fix: ship the template as `templates/gitignore` (no dot, survives publish); `init` writes it to the project as `.gitignore` and falls back to a minimal default rather than throwing if the template is ever absent. Tests +3 (1303 → 1306): functional write, a regression guard asserting the dotless name exists and the dotted one does not, and a missing-template no-crash test. No schema/artifact/contract change — no integrations CHANGELOG entry. This is the first defect surfaced by a real external adopter — exactly the v2.0.0 promotion gate at work.

## [2.0.0-rc.33] — 2026-05-31 — intake redesign Phase 5a: capturing intent is visible to agents

The intake review found the `wizard` (the one elicitation tool) is never mentioned in `AGENTS.md` — so in agent mode (the real mode) the intake is dead surface and the agent fills a blank IDEA.md by inference. `templates/AGENTS.md` (copied verbatim into every consumer's CLAUDE.md/GEMINI.md/.codex/copilot files) now has a **"Starting a NEW project — capturing intent is the highest-leverage step"** section: read provided context FIRST (files/folder/repo/mockups/prior PRD — derive from them, don't re-ask), CONFIRM the three high-stakes inputs (problem/success/no-go) instead of inferring (mark inferences `[ASSUMPTION]` for the provenance gate), match effort PROPORTIONALLY (a landing-page MVP is a tight pass, not a giant process; iterate agile via features), and the discovery option + industry-terminology pointer.

No code change (template only — regenerated into the five agent files). Tests unchanged (1303; the "five agent files identical" test covers the copy). Remaining: Phase 3b (deferred — thin IDEA + blocking-confirmation gate surgery) + Phase 5b (interview unification + non-TTY discovery fallback).

## [2.0.0-rc.32] — 2026-05-31 — intake redesign Phase 4: industry-terminology map

`aitri help` and ARTIFACTS.md now show what each Aitri artifact maps to in standard industry vocabulary — `01_REQUIREMENTS.json ≈ PRD / SRS`, `02_SYSTEM_DESIGN.md ≈ TRD / SDD`, `00_DISCOVERY ≈ product discovery`, etc. The author's point: Aitri's file names are descriptive but non-standard, so a user from industry doesn't recognize them. Names are a public contract and are NOT renamed (would break Hub + existing projects) — this is a pure recognition/aliasing layer. Tests +1 (1302 → 1303). Remaining: Phase 3b (deferred, delicate) + Phase 5 (wizard/agent-path coherence).

## [2.0.0-rc.31] — 2026-05-31 — intake redesign Phase 3a: Discovery ingests context + proportional depth

The safe, additive slice of the core redesign (Phase 3b — thin IDEA + blocking-confirmation gate migration — is deliberately deferred to a fresh-head session).

- **Discovery now INGESTS provided context.** The `idea/` folder + an `## Assets` section already let a user point at mockups/docs/repos/a prior PRD, and `run-phase.js` already lists them — but the discovery briefing never told the agent to actually READ them. It now does: "read what already exists → derive Problem/Users/Success from it → confirm/ask only what the sources don't answer." This is the orchestrate-don't-bundle context ingestion of ADR-039 (the agent reads files; Aitri just structures the discovery to use them).
- **Proportional depth.** The briefing now scales discovery to the project: a landing-page MVP gets a tight pass (clear problem, user, one measurable success, obvious out-of-scope — no manufactured ceremony); a complex system gets full ingestion + elicitation. Directly serves the author's "don't run a giant process for an MVP, but support agile iteration" constraint. Agile remains the feature pipeline (each iteration proportional).

Briefing-only change; no gate or template surgery. Tests +2 (1300 → 1302). Phase 3b (thin IDEA + blocking confirmation in discovery, with the provenance-gate migration) is queued — it is the delicate part and warrants a clear head.

## [2.0.0-rc.30] — 2026-05-31 — intake redesign Phase 2: feature regression boundary

Closes the one feature-specific defect class the intake review found: a feature MODIFIES a live system, but Aitri captured "what must NOT change" NOWHERE — FEATURE_IDEA.md was entirely additive, so an agent could ship a feature that silently breaks parent behavior with no gate to catch it.

- `templates/FEATURE_IDEA.md` gains **`## Touch Points`** (which existing parts the feature modifies vs adds) and **`## Must Not Break (Regression Boundary)`** (existing behaviors to protect, in testable terms).
- The feature Phase 1 briefing (`requirements.md`, rendered only when `PARENT_REQUIREMENTS` is present — i.e. a feature) now instructs: convert each Must Not Break item into a `category: "Regression", priority: "MUST"` NFR. Because it's a MUST NFR, the rc.27 NFR-MUST-coverage gate forces Phase 3 to generate a test for it, and verify-run runs it — so the pipeline fails loudly if the feature breaks existing behavior.
- **Mechanical backstop, no theater:** the regression NFRs ride the existing FR/NFR→TC→test machinery + the rc.27 gate; no fragile markdown-parsing gate was added (the briefing drives NFR creation; the gate enforces testing once created).

Tests +2 (1298 → 1300). Phase 3 (the core — thin IDEA + Context Sources + proportional discovery) is next.

## [2.0.0-rc.29] — 2026-05-31 — intake redesign decided (ADR-039) + Phase 1 (provenance visible at approve)

The intake review (3 agents, functional + UX) found the intake is optimized for INFERENCE, not elicitation: in agent mode the provenance gate reads a file the agent wrote alone, and the provenance record dies unread. The author and I redesigned the layer.

- **[ADR-039](DECISIONS.md) — intake redesign decided.** Five pillars: IDEA = raw seed (a sentence or `## Context Sources` pointers); Discovery = the CANONICAL understanding engine (ingest referenced context + elicit + confirm); **proportional** depth (a landing-page MVP is a ~30s confirmation, a complex system is ingestion + interview — agile iteration is served by the feature pipeline); BLOCKING confirmation of the three irreversible inputs (problem/success/no-go, the deferred ADR-032 D3, placed where a human is present); context ingestion orchestrated, not built (agent reads files — zero-dep). Industry-terminology mapping in docs (no rename — artifact names are a public contract). Feature regression boundary. Phased plan in BACKLOG.
- **Phase 1 (shipped here) — provenance visible at the human checkpoint.** `summarizeRequirements` (the mechanical summary `approve` prints) now surfaces `idea_provenance` as `N confirmed · M assumed` + the assumed field names + open `idea_gaps` count. The single highest-leverage intake fix per the review: it puts "5 confirmed, 0 questions asked" in front of whoever approves, instead of buried in JSON — converting the gate from agent-attests-to-itself into agent-must-show-its-seed-confidence. Additive, back-compatible (absent provenance → no line).

Also: the persona ceiling (max 8) was lifted (separate constitution commit) — add personas as the product needs (e.g. a future intake/interviewer persona). Tests +2 (1296 → 1298).

## [2.0.0-rc.28] — 2026-05-31 — pipeline audit Tiers 3 + 4 (honor-system wording + discovery handoff + design truncation)

Closes the audit. Tier 3 is wording-only (NO new content gates — that would be the "structural gate without defect evidence" theater CLAUDE.md prohibits); Tier 4 is the two structural decisions.

- **Tier 4 #9 — discovery now has a consumer (the headline).** `00_DISCOVERY.md` was produced by the optional Discovery phase but NO downstream phase read it — the agent's problem definition / users / success criteria / out-of-scope were discarded except a boolean nudge. Phase 1 `buildBriefing` now injects the approved discovery content into the requirements briefing (first-run only; on re-runs `01_REQUIREMENTS.json` is the SSoT), via a new `{{#IF_DISCOVERY_MD}}` block in `requirements.md` that frames it as primary seed context.
- **Tier 4 #10 — design truncation.** Phase 4 fed the developer `head(02_SYSTEM_DESIGN.md, 200)`; a complete design past 200 lines silently dropped its late sections (Deployment Architecture, Risk Analysis) from the implementer. Now the full design (a bounded artifact that passed the Phase 2 gate) is passed.
- **Tier 3 — honor-system wording.** Two briefings claimed mechanical enforcement the gate does not provide: `architecture.md` said an empty section / a single-option ADR "is rejected by aitri complete 2" (the gate parses neither). Reworded to state exactly what `complete 2` checks vs what the human reviewer verifies. `phaseUX.md` gained an honest header: the gate checks only section-presence + line-count; the "every component / 375px / archetype" rules are reviewer-verified, write them in good faith. Directive voice ("must") elsewhere is kept — it tells the agent what to produce, it does not falsely claim a gate.

Tests +3 (discovery handoff ×2, no-truncation ×1). 1293 → 1296. **Full-pipeline audit complete** (Tiers 1–4 across rc.26–28; 2f HAS_METRIC deferred with rationale).

## [2.0.0-rc.27] — 2026-05-31 — pipeline audit Tier 2 (gate-correctness false-accept/reject fixes)

The moderate verifiable defects from the phase audit. All code-grounded; the wording-only "honor-system masquerade" findings (Tier 3) and the structural decisions (Tier 4) are separate.

- **Anchored heading match (discovery, ux).** `content.includes('## Problem')` was satisfied by `## Problematic Areas` / inline prose — a substring scan. Now line-start + word-boundary anchored per required section.
- **NFR-MUST coverage (phase3 + phase5).** The MUST-coverage gaps only scanned `functional_requirements`; a `priority: "MUST"` NFR could have zero TCs (phase3) or be omitted from `requirement_compliance` (phase5). Both now include MUST NFRs — they are first-class testable targets.
- **Provenance gap prefix (phase1).** The seed-provenance gap match was anywhere-substring + cross-field — a `baseline:` gap mentioning "power users" satisfied the `users` assumption. Now the gap must START with the field key (the briefing's documented contract).
- **GENERIC technical_debt (phase4).** The anchored bare-word list missed `no debt incurred` / `nothing` / `not applicable` / a lone dash. Expanded (still whole-string anchored, so a real substitution containing a generic word is not caught).
- **`Performance & Scalability` connector (phase2).** The literal `&` false-rejected `Performance and Scalability` / `/`. The connector is now tolerated.
- **2f DEFERRED (HAS_METRIC any-digit, phase1).** A bare incidental number ("version 2") whitewashes the qualitative-metric check. Analyzed and deferred: any tightening risks false-rejecting legitimate quantitative ACs ("1000 users"), which BLOCK work — worse than the minor false-accept, and the FR still faces the broad-vague + title-vague gates. Per CLAUDE.md's regex-false-positive caution. Re-open with a concrete false-accept that slips all gates.

Tests +12 (1281 → 1293). Docs: ARTIFACTS.md (NFR-MUST coverage), integrations CHANGELOG. Tier 3 (wording) + Tier 4 (discovery-consumer, design truncation) follow.

## [2.0.0-rc.26] — 2026-05-31 — full-pipeline phase audit, Tier 1 (id join-key + frs + review verdict)

A phase-by-phase audit of all 8 pipeline gates (discovery/ux/1/2/3/4/review/5) on two axes — (A) gate correctness, (B) briefing↔gate↔consumer coherence — surfaced a systemic pattern: gates verify structural presence while briefings claim hard enforcement, and the FR/NFR `id` join-key is unenforced. Tier 1 fixes the three highest-value, code-verifiable defects:

- **phase1 B1/B2 — FR/NFR id never enforced (HIGH).** `complete 1` now requires every FR and NFR to have a non-empty, list-unique `id` (mirrors the duplicate-TC-id gate). It's the join key phase3 (`requirement_id`/`frs`) and phase5 (per-MUST compliance) hard-depend on; a missing id → `undefined` key downstream, a duplicate → masked coverage. Closes the root of the phase4/phase5 id-cross-check gaps too.
- **phase3 B1 — `frs` rejected though documented + consumed (HIGH).** `complete 3` now accepts a TC carrying `frs: [...]` instead of `requirement_id` and buckets it into each targeted FR; the FR-MUST gap check uses the bucketed keys. The documented multi-FR form (which verify-run prefers) was uncompletable, and phase3's coverage accounting diverged from verify-run's. They now agree.
- **review A4/B1/A3/A1/A2 — verdict parse bugs in the rc.23 reviewGate (HIGH for gate users).** `extractReviewVerdict` is now case-insensitive (a lowercase `fail` was silently passing the gate) and strips the un-bracketed menu `PASS | CONDITIONAL_PASS | FAIL` (which the briefing taught and the extractor read as a phantom FAIL). `phaseReview.validate()` now uses the same extractor instead of a substring scan (a prose mention / placeholder menu no longer counts as a verdict). The briefing teaches a single copyable `## Verdict\n<VERDICT>` form.

Tests +10 (1271 → 1281). Docs: ARTIFACTS.md (phase1 id rule, phase3 frs), integrations CHANGELOG. Tiers 2–4 (substring header matching, NFR-MUST coverage, `&` false-reject, regex breadth; wording fixes for the honor-system masquerade; discovery-has-no-consumer) follow.

## [2.0.0-rc.25] — 2026-05-30 — state-core hunt: remaining findings (rejection-clear, event-eviction, lock visibility)

Closes the three lower-severity findings from the state-core hunt (rc.24 was finding #1).

- **#2 reject (Part B fixed; Part A rejected).** `aitri approve <phase>` now clears `rejections[<phase>]` — an addressed rejection no longer lingers as a stale advisory in status/resume. **Part A (making `reject` withdraw approval + cascade) was deliberately NOT done:** the smoke suite confirmed `reject` is advisory by design — it records feedback and points at `run-phase` (which performs the withdrawal + cascade). Changing it broke 4 smoke tests that encode this contract; reverted. Not a defect — intended.
- **#3 event-log eviction.** The no-op-loop guard derived the last verify-run summary by scanning `events[]` (capped at 20); on a busy project the verify-run event got evicted, silently disabling the guard and re-looping `verify-run` after an all-skip run. Fix: `verify-run` now persists `lastVerifyRun: { passed, failed, skipped, manual, at }` as a first-class `.aitri` field (every run); the snapshot reads it (fallback to the event scan for old projects). Survives eviction.
- **#4 lock visibility (low).** `acquireLock` proceeding best-effort on a non-ENOENT failure was silent; now it emits a warning (the silent unlocked write was the hazard, not the proceed). Behavior unchanged — no new friction, just visibility. Kept best-effort deliberately (failing loud could break legit edge-FS cases with no evidence of real harm).

Tests +2 (rejection-clear on approve; guard survives eviction via lastVerifyRun). 1271 → 1273. SCHEMA.md (`lastVerifyRun`) + integrations CHANGELOG (additive). **State-core hunt complete** — verified-not-defective: phase-key type confusion, cascadeInvalidate, hasDrift, saveConfig.

## [2.0.0-rc.24] — 2026-05-30 — `complete` no longer launders drift on an approved phase (state-core hunt, finding #1)

Defect hunt on the state + phase-lifecycle core (state.js + complete/approve/reject + snapshot drift). The critical finding:

- **`complete` on a still-approved phase bypassed the drift cascade.** `complete <phase>` unconditionally re-stamped `artifactHashes[phase]` and cleared drift (`complete.js:71-78`). The normal flow (run-phase → complete → approve) is safe because run-phase removes the phase from `approvedPhases` first. But editing an approved artifact directly on disk and running `complete <phase>` re-stamped the hash — **laundering the drift** — while leaving downstream Phases 3/4/5 approved against the changed upstream. `approve`-after-drift and `run-phase` both cascade-invalidate downstream; `complete` was a silent bypass, reachable by an agent in non-interactive mode where `approve` hard-blocks. The spec→downstream chain was sealed stale with no human in the loop.
- **Fix:** when `complete` runs on a phase that is currently approved AND whose content differs from the stored hash, it now re-opens the phase (withdraws approval) and `cascadeInvalidate`s downstream — same as run-phase/approve-after-drift. Normal flow unaffected (phase isn't approved at complete time); an unchanged re-complete does not cascade. Prints a notice naming the invalidated phases. Enforces the existing cascade invariant (no new contract). +2 tests (1269 → 1271).

Other hunt findings logged for later (not yet fixed): reject never withdraws approval / rejections never clear (moderate, advisory-by-design); EVENT_CAP=20 can evict the verify-run event that the no-op-loop guard depends on (moderate); acquireLock proceeds without a lock on non-EEXIST failure (low).

## [2.0.0-rc.23] — 2026-05-30 — opt-in review gate (ADR-037 follow-up #2 / ADR-038)

Closes the second ADR-037 deferred item — code-review as a gate — **without reversing ADR-034 P1**.

- **`.aitri#reviewGate`** (opt-in, default off): when `true`, a `FAIL` verdict in `04_CODE_REVIEW.md` blocks `aitri verify-complete`. Same opt-in pattern as `strictAssertions`/`humanApprovalGate`. Default unchanged — the verdict stays advisory.
- **`extractReviewVerdict`** (phaseReview.js, exported) reads the verdict from the `## Verdict` section specifically (strips placeholder menus like `[PASS | … | FAIL]`; worst-verdict precedence FAIL > CONDITIONAL_PASS > PASS). verify.js imports it (cycle-free — phaseReview imports nothing that reaches verify).
- **Honest boundary (ADR-038):** the verdict is agent-written, so `reviewGate` makes a *written* FAIL binding — it does not detect review quality or force a review to exist (absent review never blocks; CONDITIONAL_PASS/PASS proceed). Deliberately opt-in: a universal hard block on an honor-system verdict would be the "structural gate without defect evidence" theater CLAUDE.md warns against.

Tests +4 + verdict-extractor coverage (1265 → 1269). Docs: SCHEMA.md (`reviewGate`), AGENTS.md, ADR-038. Header-only version bump again. **Both ADR-037 follow-ups now closed** (coverage rc.22, review gate rc.23).

## [2.0.0-rc.22] — 2026-05-30 — coverage unified into quality_gates (ADR-037 follow-up #1)

First of the ADR-037 deferred items. Coverage is now a declared `quality_gate`, not only an ad-hoc flag.

- **Coverage gate:** a `quality_gates` entry with a numeric `threshold` (0–100) instead of a `command`. `verify-run` derives `coverageThreshold` from the gate (or the `--coverage-threshold` flag as override), measures line coverage via the existing stack-aware path, and judges the gate: `measured ≥ threshold` → pass, below → fail, unmeasurable → error. The result `{ name, threshold, measured, required, status }` joins `quality_gates` and gates exactly like a command gate (required-fail resets `verifyPassed` + blocks `verify-complete`).
- **Before:** coverage was opt-in measurement + a non-blocking warning. **Now:** a declared coverage gate blocks the pipeline when required — coverage is part of the verification floor, not advice.
- `phase4.validate()` accepts either shape per entry (command XOR threshold; threshold ∈ [0,100]). build.md + ARTIFACTS.md document the coverage gate.

Tests +3 (below→fail+block, at/above→pass, advisory→no block). 1262 → 1265. Version header bumped on the header line ONLY this release (the prior global `sed` had drifted inline annotations — see rc.21 note). Remaining ADR-037 follow-up: code-review as a hard gate (next).

## [2.0.0-rc.21] — 2026-05-30 — code-quality gates: the verification spine enforces well-built code, not only passing tests

The session's strategic shift. The author flagged that Aitri verified *behavior* (tests pass) but not *code quality* (lint/types/security), risking process ceremony that doesn't raise the floor on produced software — against "Purpose over process". Per [ADR-037](DECISIONS.md):

- **New: `04_IMPLEMENTATION_MANIFEST.json#quality_gates`** `[{ name?, command, required? }]`. The project declares its own `eslint`/`tsc`/`ruff`/`mypy`/`go vet`/`gosec`/etc.
- **Execution (`verify.js#runQualityGates`):** each gate runs via `spawnSync` (same as the test runner), judged by exit code (0 = pass); a missing tool is `error`. Results recorded in `04_TEST_RESULTS.json#quality_gates`. **Orchestrate, not bundle** — zero-dep intact (constrains imports, not what Aitri runs).
- **Gating:** `required` defaults true; a failing required gate resets `verifyPassed` and blocks `verify-complete`, exactly like a failing test. `required: false` = advisory.
- **Discipline:** the Phase 4 (build) briefing now requires the agent to wire lint/type-check (+offer security) as `quality_gates`, with per-stack examples; `phase4.validate()` nudges (non-blocking) when none are declared, and validates the shape when present.
- **Constitution:** CLAUDE.md amended — principle 1 (zero-dep) clarified import-vs-orchestrate; new principle 8 (the verification spine enforces well-built code, not only passing tests). Clarified, not weakened.

Tests +6 (`runQualityGates` unit + verify-run/verify-complete integration: required-fail blocks + resets verifyPassed, advisory does not, pass does not). 1256 → 1262. Docs: ARTIFACTS.md (both fields), integrations CHANGELOG (additive), build.md briefing. Deferred follow-ups (ADR-037 scope): fold coverage into quality_gates; make code-review a hard gate (stays advisory). **Also fixed:** a too-broad version-header `sed` had drifted two inline `(v2.0.0-rc.N+)` annotations in ARTIFACTS.md across rc.17–21 — the canonical-TC-id note (restored to rc.16) and the summary-counts note (rc.20).

## [2.0.0-rc.20] — 2026-05-30 — verify-run matching/accounting: case-collision false pass + manual double-count

Closes the remaining verify-run hunt findings.

- **C2 (was: case-insensitive fallback collision).** The `detectedCI` lowercase fallback could link a plan TC to a *different* TC's result: `TC-001h` and `TC-001H` are both canonical (differ only by suffix case) and collapse to one lowercase key. If the runner ran only `TC-001H`, `TC-001h` borrowed its pass — a false pass on a test that never ran. Fix: the fallback now refuses any lowercase key shared by >1 detected id, and refuses to fire for any lowercase id shared by >1 plan TC (exact-match only in the ambiguous case). +1 test.
- **M2 (was: manual double-count).** `summary.manual` was `manualTCIds.size` (declared-manual) while passed/failed/skipped are status-based, so a manual TC later `tc verify`'d to pass was counted in BOTH `manual` and `passed` — the buckets did not sum to `total`. Now `manual` is status-based (`results.filter(status==='manual')`); a verified manual TC counts under its verdict, and `manual_verified` still tracks the verified subset. Buckets now sum. +1 test. ARTIFACTS.md note clarified.
- **L2 — DISCARDED (not a defect).** Suspected Playwright `×` (U+00D7) fail symbol unhandled. Playwright's list reporter emits `✘` (U+2718), already in the fail set; no runner confirmed to emit `×` in the Playwright parser. Adding it would be speculative (narrow-evidence rule). Re-open only if a real Playwright run shows a `×` failure read as skip.

1254 → 1256. No artifact schema *shape* change; `summary.manual` value semantics corrected (see integrations CHANGELOG).

## [2.0.0-rc.19] — 2026-05-30 — verify-run parser correctness: no masked failures, no false passes

Defect hunt on the verify-run flow (Aitri's crown jewel — it executes real tests and credits TCs). Three confirmed false-pass/miscount bugs, all reproduced against real runner output before fixing:

- **C1 (critical) — masked failure when a TC id repeats.** All five parsers used first-occurrence-wins (`if (detected.has(tcId)) continue;`). When one TC id appears more than once — the canonical case is a **parametrized pytest test** (`test_TC_001h[case0] PASSED` / `[case1] FAILED`), also repeated `it()` blocks or a retried test — a passing line that printed first masked a later failure. The TC (and its FR) was credited green while a real assertion failed. Fix: a shared `recordDetected` with **fail-precedence** (`STATUS_RANK fail>pass>skip`) — a fail always wins regardless of order; equal status keeps the first (notes preserved). Applied to all five parsers.
- **M1 (moderate) — node:test todo counted as pass.** `node --test` prints `✔ … # TODO` for a todo (unimplemented) test; the `✔` marker made it a pass, marking its FR covered on nothing. Now classified `skip`. (`# SKIP` already fell through correctly — only TODO was wrong.)
- **L1 (low) — a ✓ glyph inside a failing test's title flipped it to pass.** Vitest/Playwright parsers tested `/[✓✔]/` anywhere in the line; a fail like `× TC-001f: rejects the ✓ marker` matched the pass branch first. Now the verdict is anchored to the leading symbol (`/^\s*[✓✔]/`).

Tests +3 (the three scenarios, each confirmed to fail on the old code), existing first-occurrence-wins tests rewritten to assert fail-precedence. 1251 → 1254. No schema/contract change — results are simply more correct. Remaining hunt findings NOT yet addressed (logged for a decision): M2 (manual TCs double-counted in the summary buckets — display only, not a gate), C2 (case-insensitive id fallback can collide `TC-001h`/`TC-001H` — narrow), L2 (Playwright `×` U+00D7 fail symbol — unconfirmed).

## [2.0.0-rc.18] — 2026-05-30 — upgrade: same-file migrations compose instead of clobbering (C1)

- **Critical-path fix in `adopt --upgrade`.** Two auto-migratable findings can target the same artifact (`diagnoseNonFunctionalRequirements` and the orphan-IDEA absorb in `diagnoseOrphanIdea`, both rewrite `01_REQUIREMENTS.json`). Each captured a full-file `afterContent` at *diagnose* time; `migrate()` applies them sequentially with no re-read, so the last writer (always the IDEA absorb, by `diagnose()` order) silently reverted the NFR rewrite — while the report claimed both applied. The brief was preserved (absorb wrote last), but a BLOCKING NFR migration became a silent no-op on the exact pre-0.1.89 population the migrator targets. Found by a defect hunt on the upgrade module (the v2 core path).
- **Fix:** new `rewriteArtifactInPlace(full, mutate)` re-reads the file at *apply* time, applies the specific transform to the current on-disk content, and recomputes the event hashes — so same-target writes compose regardless of order. The three artifact writers (TC rename, NFR rewrite, IDEA absorb) now use it; each `mutate` is guarded to be idempotent-safe. The IDEA absorb only unlinks `IDEA.md` if the write landed, so a re-read failure can never lose the brief. Per [ADR-036](DECISIONS.md). Tests +1 (the C1 regression: NFR rewrite + IDEA absorb in one upgrade, both survive). 1250 → 1251. No schema/contract change — the post-upgrade artifact now correctly matches the schema it always should have.

## [2.0.0-rc.17] — 2026-05-30 — integration-contract audit: status --json honors the documented health fields

- **Contract-vs-code audit** of the three integration contracts a third-party adopter reads (`ARTIFACTS.md`, `SCHEMA.md`, `STATUS_JSON.md`) against the actual `phase*.validate()` + `state.js` + `snapshot.js` code. Motivated by today's discovery that "the technical case for v2 is clean" was optimistic — two latent grammar asymmetries existed (rc.16). The audit hunted the same class: a documented/required contract the code does not honor.
- **Finding 1 (code fix):** `STATUS_JSON.md` has documented `health.driftPresent` and `health.staleVerify` since v0.1.77, but `status --json` never emitted them — a ~40-version latent gap; a consumer reading them got `undefined`. The data was already computed by `computeHealth`; added both to the payload in `status.js` (additive). `driftPresent` = `[{scope, phase}]` (per-scope drift, richer than the root-only top-level `driftPhases`); `staleVerify` = `[{scope, days}]`.
- **Finding 2 (doc fix):** `SCHEMA.md`'s per-machine-state note named a non-existent `lastSession.when` — the field has always been `at`. Corrected.
- **Audit result otherwise clean:** phases 1/4/5 `validate()` (the three CLAUDE.md flagged "stale since alpha.14") match `ARTIFACTS.md` exactly; all 18 code-written `.aitri` config fields are documented in `SCHEMA.md`; the `nextActions[]` priority ladder (1,2,3,4,5,6,7,9) and every top-level `status --json` field match the code. The "stale since alpha.14" warning was over-cautious. Tests +1 (1249 → 1250).

## [2.0.0-rc.16] — 2026-05-29 — canonical TC-id gate (Phase 3 / verify-run asymmetry closed)

- **Root fix for the TC-id parser/gate asymmetry.** The template (`templates/phases/tests.md`) teaches the canonical TC-id form and `verify-run` *requires* it to link runner output to a plan id (`detected.get(tc.id)` — string equality), but `phase3.validate()` never enforced it. An agent could author a non-canonical id, pass Phase 3, then have `verify-run` silently drop the TC to `skip` because the parser could not round-trip the id. Surfaced when Hub's `hub-folder-scan` feature authored `TC-e2eFolderScan` / `TC-e2eFolderEmpty` (no numeric block); a half-finished patch had loosened the `verify-run` parser to accept digit-free ids — the wrong layer (it condoned off-convention naming and introduced a phantom-TC false-positive surface, e.g. `TC-PASS` in a log line).
- **What shipped:** (1) extracted the canonical-id grammar to `lib/tc-id.js` as the single source of truth — `extractTCId` (moved verbatim from `verify.js`, which now re-exports it) plus `isCanonicalTCId(id) = extractTCId(id) === id`; (2) reverted the digit-free parser branch; (3) added a Phase 3 gate that rejects any `test_cases[].id` that does not round-trip through the shared parser; (4) `suggestCanonicalTCId` — the gate prints the deterministic fix for a glued pure-letter namespace (`TC-NFR010h` → `TC-NFR-010h`) and refuses to guess for ambiguous (`TC-E2E001h`) or numberless (`TC-e2eFolderScan`) ids. Gate and parser are now literally the same grammar — they cannot drift. Fresh-validation only: existing approved projects are not re-validated until they re-run Phase 3.
- **Last divergent grammar unified.** A sweep found one other ad-hoc TC-id reader: the `@aitri-tc` marker scanner (`verify.js:283`) used `TC-[A-Za-z0-9]+`, truncating namespaced ids at the second hyphen (`TC-E2E-001h` → `TC-E2E`) and mislabelling the assertion-density (C2) report. Routed through `extractTCId` — all runner parsers already used it; this was the last reader off the SSoT.
- **Closes the "Phase 3 canonical TC id regex" item** that was Discarded pending a second evidence case — Hub is that case (a real consumer producing degraded output: a green test `verify-run` could not credit). Per [ADR-035](DECISIONS.md). Tests +17 (1232 → 1249). Consumer note: Hub's non-canonical ids are not migrated — Hub is being rebuilt, so the effort would be discarded.

## [2.0.0-rc.15] — 2026-05-26 — GitHub Copilot agent file + pre-2.0.0 audit backlog hygiene

- **Copilot agent file (file-write half).** `lib/agent-files.js` `AGENT_FILES` now includes `.github/copilot-instructions.md` (repo-wide custom instructions convention). Content is the shared `templates/AGENTS.md` verbatim — same as the other four files, no Copilot-specific fork. `aitri init` and `aitri adopt --upgrade` write it (non-destructive: skip if present). Existing consumers regenerate it on next `--upgrade` via the missing-file path. **Detection half deliberately NOT shipped:** `detectAgent()` keys off CLI env vars (`CLAUDE_CODE`, `CODEX_CLI`, `GEMINI_CLI`); Copilot is an IDE extension with no documented stable env signal, so `lastSession.agent` stays `unknown` for Copilot sessions — honest until a real env marker is verified. `templates/AGENTS.md` line 4 and the `help` AGENTS line now list GitHub Copilot. Tests updated: init's "all agent files identical" now covers 5 files; adopt --upgrade and dry-run loops include the copilot file. Tests +1 file assertion in `--upgrade`. No `.aitri`/artifact schema change → no integrations CHANGELOG entry (agent files are project surfaces, not subproduct-read contracts).
- **Backlog hygiene.** Removed stale `[ ]` entries for items shipped in rc.10–rc.13 — A1/A2/A3 (stack-agnosticism), P2(architect), F1 (security forcing), D1 (Phase 5 claim-vs-evidence), D2 (legacy-AC warning), B1/B2 (human approval gate). Per "backlog = open only" rule, shipped features leave the backlog and live in CHANGELOG. The pre-2.0.0 audit section is now closed.

## [2.0.0-rc.14] — 2026-05-25 — CLI polish: flag documentation (E2) + AGENTS.md next-action wording; E1 refactor rejected as non-defect

Final release of the pre-2.0.0 audit ([ADR-034](DECISIONS.md)). The CLI-polish tier.

- **E2 — flag documentation in `help`.** Documented previously-undocumented flags: `resume --full`, `status --json`, `run-phase discovery --guided`, `validate --explain`, `verify-run --coverage-threshold N`. Pure help-text additions (cosmetic).
- **AGENTS.md next-action wording corrected.** The line "Follow the PIPELINE INSTRUCTION at the end of *each* command" overstated reality — `complete`/`reject` deliberately present a *branch* (approve-or-reject), and `status`/`resume` print a human-facing `Next:`. Reworded to distinguish the singular authoritative `PIPELINE INSTRUCTION` (approve/verify) from branching next-actions.
- **E1 (unify the next-action marker) — REJECTED as a non-defect (decision on record).** Investigation found the marker "inconsistency" the audit flagged is actually three deliberate channels: `PIPELINE INSTRUCTION` = the agent's single authoritative action (approve/verify); branching hints = where the human chooses (complete/reject); `→ Next:` = human display (status). Unifying them would conflate distinct semantics and risk breaking agents that key off "PIPELINE INSTRUCTION = my one action," plus ripple through AGENTS.md and the output-contract tests. The only real issue was the AGENTS.md wording (fixed above). No refactor. The Command-surface audit study in BACKLOG records this finding.

No schema change. No integrations CHANGELOG entry (help stdout + agent template, not a subproduct contract). Tests unchanged (cosmetic help text + doc).

## [2.0.0-rc.13] — 2026-05-25 — cross-artifact consistency: Phase 5 claim-vs-evidence gate (D1) + legacy-AC warning (D2)

Fifth release of the pre-2.0.0 audit ([ADR-034](DECISIONS.md)). The lowest-impact tier (paper-trail consistency, user-deprioritized vs the code-rigor work) — shipped for completeness.

- **D1 — Phase 5 claim-vs-evidence gate.** `lib/phases/phase5.js` validate() now cross-checks `05_PROOF_OF_COMPLIANCE.json` against `04_TEST_RESULTS.json#fr_coverage`: a compliance entry with `level` `complete` or `production_ready` must have `fr_coverage` status `covered` (or `manual`). A green proof can no longer over-claim past the test evidence. Conservative — only fires when the coverage entry exists and contradicts. Not theater: claim-vs-measured-evidence consistency, the same class Aitri already enforces, preventing a dishonest proof shipping broken software (tier-1).
- **D2 — legacy-AC mismatch surfaced.** `lib/phases/phase3.js` validate() previously skipped the `ac_id`→Phase-1 cross-check silently when Phase 1 had no structured acceptance_criteria with ids. **Downgraded from the audit's proposed hard error to a warning** — `ac_id` is a required TC field, so erroring would block every project whose Phase 1 uses flat-string ACs (broad, not narrow). The warning surfaces the traceability gap without breaking the run. (Audit disposition corrected mid-implementation; recorded here.)

Schema: D1 is a new validation rule on an existing artifact (no field change) → documented in ARTIFACTS.md + integrations CHANGELOG `— additive` with a newly-blocking note. D2 is stderr-only. Tests +3 (D1 blocks over-claim / passes on covered+manual; D2 warns without throwing).

## [2.0.0-rc.12] — 2026-05-25 — human approval gate: checklist always visible + opt-in hard stop (B1/B2/E3/P1)

Fourth release of the pre-2.0.0 audit ([ADR-034](DECISIONS.md)) — the #1 finding: the human-judgment gate was structurally absent in agent mode (`approve` no-op'd its summary + checklist on `!isTTY`).

- **B1 — checklist always visible.** `lib/commands/approve.js` now prints the artifact summary AND the phase's real Human Review checklist on every approve (TTY and agent mode). The checklist is extracted from the phase template's `## Human Review` section via the new `extractHumanReview()` in `lib/prompts/render.js` — single source, no duplication. In agent mode it also prints a HUMAN REVIEW CHECKPOINT directive telling the agent to relay it to the user and not auto-chain phases.
- **B2 — opt-in hard gate.** New `.aitri#humanApprovalGate` (additive). Default off: agent-mode approval proceeds (autonomy preserved). When on: agent-mode `approve` blocks and a human must run it — all phases. The drift re-approval block (already TTY-gated) is unchanged.
- **E3 — `help` gains an "Interactive vs Agent mode" section** documenting which commands differ without a TTY and the two opt-in gates.
- **P1 — reviewer verdict documented as advisory** in `templates/AGENTS.md` (the Code Review PASS/FAIL does not mechanically gate Phase 5).

**Framing (per user clarification):** the opt-in gates are for **larger** projects, not "serious" ones — all projects are serious; small projects / MVPs run autonomously by default and that is equally valid. Wording corrected across SCHEMA.md, verify-run output, and AGENTS.md. Also fixed a version-provenance slip from the rc.10/rc.11 header bumps (a broad sed had wrongly advanced the `strictAssertions`/`line_coverage`/`low_confidence_tcs` body references from rc.9 → restored).

Schema: `.aitri#humanApprovalGate` additive → integrations CHANGELOG `— additive`. Tests +3 (B1 prints summary+checklist+checkpoint; B2 blocks when on; default proceeds). AGENTS.md updated (approve-as-checkpoint + reviewer-advisory).

## [2.0.0-rc.11] — 2026-05-25 — security applicability is a forced explicit decision in Phase 1 (F1)

Third release of the pre-2.0.0 audit ([ADR-034](DECISIONS.md)). Security was threaded through the pipeline (Phase 2 Security Design, Phase 3 attack vectors, reviewer/auditor personas) but only fired if the user happened to declare a security NFR — opt-in by omission. F1 makes Phase 1 force a conscious decision.

- **F1.** `templates/phases/requirements.md` — the operational-NFR "API security" item is promoted to a first-class **Security** category (applies to: user input, authn/authz, secrets/credentials, personal/sensitive data, network-exposed endpoints). The agent must decide explicitly: add a security NFR, OR state in one line why security does not apply — "do NOT leave security unaddressed by omission." The Human Review checklist gains a matching line. Consistent with the existing "declare not-applicable with reason" framing for the other operational categories.

Scope deliberately narrow: prompt forcing-function only. **No mechanical gate** — a code check for "a security answer exists" would parse prose (fragile) and only validate presence, which CLAUDE.md classifies as theater. A dedicated security meta-persona (F2) stays deferred per ADR-034 until a security-sensitive adopter validates the need. Tests +1 (phase1 briefing forces the security decision). No schema change → no integrations CHANGELOG entry. AGENTS.md unaffected.

## [2.0.0-rc.10] — 2026-05-25 — stack-agnosticism: Docker conditional + persona web/container assumptions removed (R2)

Second release of the pre-2.0.0 audit ([ADR-034](DECISIONS.md)). Removes stack assumptions that degraded produced software for non-web/non-containerized projects (the canaries Go-on-RPi, Ultron, Cesar). Prompts/personas only — no schema change, no integrations CHANGELOG entry.

- **A1 — Docker conditional.** `templates/phases/deploy.md` listed `Dockerfile` + `docker-compose.yml` as unconditional "Files to create" (invariant #4 violation). Now packaging is conditional on the deployment model declared in `02_SYSTEM_DESIGN.md` (containerized / binary / package / serverless / static), with an explicit "do NOT default to Docker". The Human Review checklist line is conditional too. `templates/phases/architecture.md` Deployment Architecture section now forces the agent to *state the deployment model explicitly* so Phase 5 has a declared input to read.
- **A2 — DevOps persona.** `lib/personas/devops.js` Docker constraints (non-root, HEALTHCHECK) are now gated on "when the deployment is containerized"; a new constraint forbids inventing a Dockerfile for a non-containerized project. REASONING aligned.
- **A3 — UX persona.** `lib/personas/ux.js` hardcoded web breakpoints (`375/768/1440`) for *every screen* while its own archetype list includes CLI tools — internal contradiction. Breakpoints are now conditional on the target medium (web vs fixed-medium: desktop/TV/kiosk/embedded/CLI-TUI).
- **P2 — architect persona few-shot.** `lib/personas/architect.js` was the only generative persona without a ❌/✅ example; added a bad-vs-good ADR pair.

Tests +5 (deploy briefing Docker-conditional + DevOps constraints conditional, UX breakpoints conditional, architect ADR few-shot). AGENTS.md audited — no change (prompt-content edits, not command/flag/contract surface). No `.aitri`/artifact schema change → no integrations CHANGELOG entry.

## [2.0.0-rc.9] — 2026-05-25 — verification spine: stack-agnostic coverage (C1) + opt-in assertion-density gate (C2)

First release of the pre-2.0.0 audit's verification spine — the eje that hardens rigor on **produced code** (the deliverable), not on the documentation trail. Outcome of a deep pre-promotion audit; full disposition + the rejected/deferred items are recorded in [ADR-034](DECISIONS.md). C3 (mutation testing) was **dropped**, respecting the existing immutable discard — see ADR-034 for the zero-dep reasoning correction (the discard's zero-dep argument was a category error; orchestrating a project-declared tool never violated zero-dep, but the real basis — assertion-density covers most of it at zero cost + no adopter demand — stands).

### C1 — stack-agnostic coverage

`verify-run --coverage-threshold` previously instrumented only the node built-in runner ([verify.js](../lib/commands/verify.js) gated on `testCmd.startsWith('node ')`). Now coverage is collected for any recognized runner via the new `injectCoverageFlag()` helper: node `--coverage`/`--experimental-test-coverage`, `go test -cover`, `pytest --cov`, `jest`/`vitest --coverage`. `parseCoverageOutput()` extended to read istanbul tables, `go` `coverage: X%`, and `pytest-cov` `TOTAL … X%`. The figure persists as additive `04_TEST_RESULTS.json#line_coverage`. The coverage tool lives in the **project's** env — Aitri orchestrates via spawn, never bundles it (zero-dep intact, same pattern as the Playwright dispatch). Directly serves the non-node canaries (Cesar pytest, Go-on-RPi) which got no coverage signal before.

### C2 — opt-in assertion-density gate

The assertion-density scan (TCs with ≤1 assertion) was warning-only. rc.9 persists it as additive `04_TEST_RESULTS.json#low_confidence_tcs` and adds an opt-in `.aitri#strictAssertions` flag: when `true`, `verify-complete` BLOCKS until each low-confidence TC has real assertions. **Default is unchanged** (warning only) — opt-in keeps autonomy for projects that don't want it and gives production-grade projects a real gate. This is the zero-dep test-quality lever the project already chose over mutation.

Schema: all additive (two artifact fields + one config field) → integrations CHANGELOG entry `— additive`. Tests +16 (`injectCoverageFlag` × 9, coverage parsing × 4, strictAssertions gate × 3). AGENTS.md freshness audited.

## [2.0.0-rc.8] — 2026-05-23 — `normalize --resolve` rejects an uncommitted behavioral working tree (closes the double-cycle)

**Cesar canary 2026-05-23, run via Codex, surfaced a self-inflicted second normalize cycle.** After fixes were committed (`66204df`), `verify-run` failed `TC-009f` (a linter reordered imports), the operator edited `src/web/app.py` to satisfy the literal-substring test contract, then ran the recommended closure sequence `verify-run && verify-complete → normalize --resolve`. The import edit was still **uncommitted** when `--resolve` stamped the baseline at HEAD (`66204df`). Committing the closure (`79fbb8c`) then carried that edit — `git diff 66204df..79fbb8c` surfaced `src/web/app.py` as a fresh off-pipeline change, forcing a second full `normalize` + `--resolve` (`b2824a5`). Cross-agent evidence: the same canary lineage that drove rc.6/rc.7 (Claude), now reproduced under Codex.

### Root cause (verified in code)

An asymmetry between commands designed to be used together: `verify-run` validates the **working tree** ([verify.js:436](../lib/commands/verify.js) — `spawnSync` against disk, no git ops), while `normalize`/snapshot detection and `--resolve` read **committed state only** (`git diff baseRef..HEAD`, [normalize.js:64](../lib/commands/normalize.js)) and `--resolve` stamps `baseRef = current HEAD` ([normalize.js:199](../lib/commands/normalize.js)) with no working-tree check. An uncommitted behavioral edit is therefore invisible to the classification the operator confirms, and re-triggers `normalize` the instant it is committed. The closure sequence the template prescribed (no "commit first" step) is exactly what produces the uncommitted edit, so consumer agents reading `templates/AGENTS.md` walk into it.

**Not a "blind spot" / correctness defect.** Uncommitted code is unshipped code; everything that ships passes through `baseRef..HEAD`. The re-flag is the detection *catching* the change, not missing it — an uncommitted `fr-change` is surfaced at commit time, never silently absorbed. This is a closure-sequence gap plus avoidable friction, not a safety hole. See ADR-033.

### Fix

- **Guard (`cmdNormalizeResolve`):** before the TTY confirmation, `--resolve` now **rejects** (exit 1) when the working tree has uncommitted behavioral files, listing them with an actionable message (`commit` or `git stash -u`, then re-run). Git baselines only — mtime baselines already read the working tree in `detectChanges()`, so the asymmetry does not exist for them. Fail-open if git is unavailable. Status semantics mirror `--diff-filter=ACMR` (Add/Modify/Rename/Copy + untracked; pure deletions excluded — detection never counts them, so they cannot re-trigger). Reject, not warn: an agent (the real consumer) steamrolls advisory output and answers `y`; only a non-zero exit enters its control loop and forces commit→retry.
- **Templates:** `normalize.md` Step 5 maintenance path and `templates/AGENTS.md` now prescribe **commit → verify → resolve** and name the working-tree gate explicitly.

No artifact/`.aitri`/`status --json` schema change (CLI text + exit code only) → no integrations CHANGELOG entry. Tests +3 (git dirty blocks, git clean reaches TTY gate, mtime skips the guard). AGENTS.md freshness audited — updated (the closure-sequence guidance was stale).

## [2.0.0-rc.7] — 2026-05-22 — normalize next-action points to the closer (`--resolve`), not the detect-only command

**Cesar canary 2026-05-22 surfaced a full-day approval loop driven by a capable agent misreading the contract.** With off-pipeline changes detected (`normalizeState: pending`), `status`/`resume`/the next-action ladder all suggested `aitri normalize`. But plain `aitri normalize` is a **fixed point** in the pending state — it re-prints the classification briefing and re-sets `pending`; it never advances the baseline. The baseline advances only via `aitri normalize --resolve` or re-approving build ([normalize.js:203](../lib/commands/normalize.js)). The agent (Claude, in a separate session) believed `normalize` would "leave the changes baselined," ran it repeatedly, and never escaped. This is tier-1: an agent operating a consumer project loops indefinitely and may escalate to destructive escape behavior (re-approving phases, editing `.aitri`).

### Root cause (verified in code, reproduced live)

The next-action emitted for the pending state was the detect-only command, identical to the freshly-detected state — [snapshot.js:751](../lib/snapshot.js), [resume.js:266](../lib/commands/resume.js), [status.js:141](../lib/commands/status.js). Reproduced on real Cesar: 2 genuine root test files (`tests/test_engine_groq.py`, `tests/test_frontend_remediation.py`) committed past the build baseline, surfaced as `uncountedFiles`, with every surface pointing at `aitri normalize`.

### Fix

The two normalize states now map to distinct commands:

- **`status='pending'`** (briefing already shown) → suggest **`aitri normalize --resolve`** — the closer that advances the baseline (refactor / already-registered changes), with the reason naming the fork (route `fr-change`/`new-feature` through the pipeline). `--resolve`'s own TTY gate enforces the classification and blocks fr-changes, so it is safe to suggest.
- **`status='resolved'` + `uncountedFiles>0`** (freshly detected) → keep **`aitri normalize`** — the classify step, which transitions to `pending`, which then points to the closer.

`resume`'s "Code Outside Pipeline" block and `status`'s hint mirror this and add an explicit line that plain `aitri normalize` does not advance the baseline. The normalize briefing ([templates/phases/normalize.md](../templates/phases/normalize.md)) now opens with a callout that the command detects/classifies but does not close the cycle — killing the agent-side root cause.

**Contract impact for subproducts:** `status --json` `nextActions[].command` changes value for the pending normalize state (`aitri normalize` → `aitri normalize --resolve`). Value change, no schema/type change — old readers render whatever command string is present. integrations CHANGELOG `— additive`. Tests +3 (pending→--resolve, resolved→normalize guard, blocking-bug suppression guard) + 1 updated. AGENTS.md freshness audited — no change (no agent-instruction surface documents normalize internals).

## [2.0.0-rc.6] — 2026-05-22 — normalize/snapshot symmetry: feature artifacts no longer counted as off-pipeline drift

**Canary 2026-05-22 surfaced an unresolvable normalize loop.** A deployable project ran `aitri normalize` (reported "✅ No code changes detected outside pipeline") but `aitri resume`/`status` kept reporting "1 file changed outside the pipeline" and routing to `aitri normalize` — a deterministic loop the operator could not clear.

### Root cause (verified in code, not hypothesized)

`isFeaturePipelineArtifact()` — which excludes `features/<name>/spec/` and `features/<name>/.aitri` from off-pipeline change detection, since those are governed by the feature's own gate, not the parent build baseline — was added to [normalize.js](../lib/commands/normalize.js) in rc.3 (Hub canary 2026-05-13) but **never mirrored** into [snapshot.js::detectUncountedChanges()](../lib/snapshot.js) which feeds `status`/`resume`. The two off-pipeline detectors diverged: `normalize` excluded the feature artifact (`features/hub-web-only/spec/04_TEST_RESULTS.json`, a `.json` that `isBehavioralFile` treats as behavioral), `snapshot` counted it. Any multi-feature project that touches a feature artifact after the parent build approval reproduces it. The irony: [normalize-patterns.js](../lib/normalize-patterns.js) header already declared itself the SSoT for *both* consumers — rc.3 violated its own SSoT by keeping the feature-artifact filter as a private function in normalize.js.

### Fix

`isFeaturePipelineArtifact()` moved to `lib/normalize-patterns.js` (the declared SSoT) and exported; `normalize.js` imports it (local definition removed) and `snapshot.js::detectUncountedChanges()` now applies `!isFeaturePipelineArtifact(f)` symmetrically with root `spec/` + `.aitri`. Closes the class: any future consumer of the off-pipeline contract inherits the full filter from one place.

**Contract impact for subproducts:** `status --json` `uncountedFiles` value tightens for projects with feature pipelines (drops feature-artifact false positives). Type unchanged, field unchanged — a value correction, not a schema change. integrations CHANGELOG entry `— additive` (non-breaking value correction). Tests +1 (`detectUncountedChanges` excludes `features/<x>/spec` + `.aitri`). AGENTS.md freshness audited — no change (no operator-instruction surface changed).

## [2.0.0-rc.5] — 2026-05-22 — venv-migration guidance + cwd-aware feature-not-found (Cesar canary 2026-05-22)

**Cesar canary (5 pytest features, alpha → rc.4 upgrade) surfaced two messaging defects that degraded a produced artifact.** The N1 venv-relative-runner finding (alpha.16) told the operator to fix the flagged `test_runner` and led its example with an **absolute path** — without mentioning that `verify-run` already auto-detects `.venv/`/`venv/` at the project root when the runner is a bare `pytest` ([verify.js:399-412](../lib/commands/verify.js)). The agent followed the guidance and committed machine-specific paths (`/Users/.../pytest …`) into all 5 manifests — portable failure: those break in CI and on any other clone. Aitri detected one portability problem and steered to another, having the portable fix built in.

### Fixes (all messaging — no schema, no `.aitri`, no artifact contract change)

- **Guidance leads with the portable fix.** `diagnoseLegacyVenvManifest` reason ([from-0.1.65.js](../lib/upgrade/migrations/from-0.1.65.js)) now leads with bare `pytest <args>` (auto-detected, portable), presents the absolute path only as a fallback for venvs outside the root (`env/`, poetry, conda, ~/venvs), and **warns absolute paths are machine-specific** and will not resolve in CI. The ENOENT pytest hint in `verify.js` was reworded to match (was also absolute-first).
- **"Finding cleared" ≠ "fixed".** The N1 regex matches only the binary prefix, so clearing it does not prove the runner executes — the reason now says so and points to `aitri feature verify-run` to confirm. (The deeper gap — N1 does not detect a root-relative *test target* in the same string, which forced a second drift/re-approval round on Cesar — is logged in BACKLOG as P2, deferred pending a different-stack canary.)
- **cwd-aware feature-not-found.** `aitri feature <verb> <name>` run from outside the project root (e.g. `~`) previously said *"Run: aitri feature init <name>"* — advising the operator to create a feature that already exists; the canary agent had to correct the human. `feature.js` now distinguishes wrong-cwd from genuinely-missing: when cwd is not a project root it names the ancestor project root (or reports "not an Aitri project") and reconstructs the retry command; the plain init suggestion is kept only when cwd IS the root and the feature is truly absent.

AGENTS.md freshness audited — no change (these are runtime CLI outputs, not agent-instruction surfaces). Tests +6 (upgrade reason ordering ×1, ENOENT hint ×1, feature cwd-aware message ×4). No integrations CHANGELOG entry (CLI text only; subproducts read `.aitri` + artifacts, not stdout).

## [2.0.0-rc.4] — 2026-05-21 — seed-input elicitation: provenance contract (D1 + D2)

**Closes the input-collapse class** diagnosed 2026-05-20/21 (see [ADR-032](DECISIONS.md#adr-032--2026-05-21--seed-input-elicitation-provenance-contract-over-honor-system-inference)). In agent mode (the only real operating mode) human input was structurally required at zero points: the wizard's agent briefing told the agent to *infer everything and ask nothing* (v0.1.38 collapse language); `approve`'s summary + checklist no-op on `!isTTY`; pre-flight criteria and Human-Review checklists are template text with no enforcement. The seed — the highest-value input in the pipeline — was a blank template the agent filled or reverse-engineered from code, verified across 6 canaries.

**D1 (prompt) — un-collapse the seed surfaces.** `lib/commands/wizard.js::printAgentBriefing` rewritten: present a draft, then **confirm each Tier-A field with the user**, mark inferred values `[ASSUMPTION]`. Same posture added to `templates/IDEA.md`, `templates/FEATURE_IDEA.md`, and the Phase 1 briefing `templates/phases/requirements.md` (new Seed-Input Elicitation section + provenance contract + delivery-summary/Human-Review surfacing).

**D2 (gate) — the teeth.** Optional additive fields `idea_provenance` (`problem, users, baseline, success_metric, no_go_zone` → `confirmed | assumed`) + `idea_gaps` on `01_REQUIREMENTS.json`. `phase1.validate()` blocks on a **fresh seed** (Phase 1 not approved) when provenance is missing/invalid or an `"assumed"` Tier-A field is not carried in `idea_gaps`. Tier-A vocabulary = the five existing Pre-flight criteria; constant in `lib/phases/phase1-checks.js` (SSoT, same pattern as the vagueness regexes). Gate runs **last** in `validate()`, fires only with a config present (bare `validate(content)` skips) and only on fresh seeds (approved projects skip → no migration, existing projects never break on upgrade).

**Deferred:** D3 (just-in-time constraint confirmation before Phase 2/UX) — the efficiency layer; ship after D1+D2 prove out. Hardening (provenance required on re-runs, status/resume surface) gated on a non-author consumer per ADR-032.

Tests +12 (phase1 provenance gate ×11 + wizard briefing language ×1). Integration docs: ARTIFACTS.md (new fields + gate rule), CHANGELOG `— additive`. No `.aitri` schema change.

## [2.0.0-rc.3] — 2026-05-12 — F11 refinement + Hub canary 2026-05-13 follow-ups (E2E TC parser + feature-aware normalize)

**Hub canary 2026-05-12 surfaced a stable terminal loop.** Hub (rc.2, deployable, 9 features) repeatedly entered `status → Next: aitri validate → run validate → status → Next: aitri validate` — the recommended action never resolved the condition that triggered it.

### Root cause (verified in code, not hypothesized)

`lib/snapshot.js` F11 (alpha.2) gated terminal idle on three conditions: `health.deployable && audit.exists && !health.staleAudit && health.staleVerify.length === 0`. When *any* pipeline (root or feature) had `verifyRanAt` older than 14 days, `stableTerminal` flipped false and P7 emitted `aitri validate`. But `aitri validate` is a read-only readiness checkpoint — it does not write `verifyRanAt`. So the staleness condition persisted and the loop was deterministic. Any multi-feature project with a stable feature untouched for 2+ weeks reproduces this — Hub is the first canary to hit the combination at maturity, but it's a general property of rc.2 logic, not Hub-specific data.

### Fix

When `health.deployable === true && auditFresh === true && staleVerify.length > 0`, emit **one P7 entry per stale pipeline** with the command that actually resolves the staleness:

- Root stale → `aitri verify-run`.
- Feature `<name>` stale → `aitri feature verify-run <name>`.

`aitri validate` is no longer emitted in this case — running it would not progress the state.

When `auditFresh === false` (audit missing or stale), P7 keeps emitting `aitri validate` as before. P9 (audit) continues to fire independently. Stale verify in that case is surfaced via the status display warning rather than via duplicated ladder entries; the operator addresses validate/audit first, then verify-run re-emerges when audit gates close.

When `deployable && auditFresh && verifyFresh`, no P7 is emitted (terminal idle — same as rc.2).

### Status display addition

`status` gains a `verify: stale on N pipeline(s) (oldest D days) — run: aitri verify-run` line, analogous to the existing `audit: stale (X days) — run: aitri audit` line. Closes the "operator sees `Next: aitri validate` with no explanation" half of the Hub finding.

### Tests

`test/snapshot.test.js`: the existing F11 test `'still emits P7 validate when verify is stale'` is updated to assert the new shape (`'emits P7 verify-run (not validate) when audit fresh and verify is stale'`). Two new tests cover per-feature scope and multiple stale pipelines. `test/commands/status.test.js` gains three tests for the display: line presence, line absence when fresh, and `Next:` coherence (verify-run, not validate). +5 tests (1175 → 1180, all green).

### Promotion impact

This is a Tier-1 fix per CLAUDE.md "Purpose over process" — a deterministic loop in a deployable multi-feature project degrades the agent flow in any consumer project. Bundled into rc.3 before promotion candidacy. Does not by itself unblock or block third-party adopter validation; closes one of the foreseeable first-contact friction points.

---

### Also in rc.3 — `extractTCId` accepts alphanumeric namespace segments (Hub canary 2026-05-13)

Surfaced by Hub canary 2026-05-13. Feature `hub-bug-summary-snapshot` had two E2E test cases (`TC-E2E-001h`, `TC-E2E-005h`) whose passing lines were present in the runner's raw output. `aitri feature verify-run` still wrote both as `status: "skip"` in `04_TEST_RESULTS.json`, forcing manual reconciliation before `verify-complete` would pass.

#### Root cause (verified in code)

[lib/commands/verify.js:33](../lib/commands/verify.js#L33) — `extractTCId`'s namespace pattern was `(?:[-_][A-Za-z]+)*`. The letters-only segment shape rejected `E2E` (and any other alphanumeric segment: `V1`, `S3`, `IPv4`, …). The defect was shared by all five test-runner parsers that call `extractTCId` — not Playwright-specific. Existing tests covered `TC-001`, `TC-020b`, `TC-FE-001h`, `TC-API-USER-010f` — none included a digit inside a namespace segment, so the gap survived every alpha and rc.1/rc.2.

#### Fix

Namespace segment shape becomes `[A-Za-z][A-Za-z0-9]*` — first char must be a letter (disambiguates namespace from the final numeric block), digits permitted thereafter. Backtracking still resolves single-segment (`TC-001`), suffix-only (`TC-020b`), letter-only multi-segment (`TC-FE-001h`, `TC-API-USER-010f`), and the new alphanumeric case (`TC-E2E-001h`). All seven existing `extractTCId` tests still green.

#### Tests

`test/commands/verify.test.js` — new `extractTCId()` case `'handles namespace segments with digits (E2E, V1, S3)'` covering `TC-E2E-001h`, `TC-E2E-005h`, `TC-V1-010h`, `TC-S3-BUCKET-042e`.

---

### Also in rc.3 — `aitri normalize` excludes feature pipeline artifacts (Hub canary 2026-05-13)

Surfaced by Hub canary 2026-05-13. After feature `hub-bug-summary-snapshot` shipped (5/5 approved, verify-complete passed), parent `aitri resume` reported 9 files changed outside the parent pipeline and `aitri normalize` listed `features/hub-bug-summary-snapshot/spec/01_REQUIREMENTS.json`, `…/04_TEST_RESULTS.json`, `…/05_PROOF_OF_COMPLIANCE.json`, and other feature-scoped artifacts as off-pipeline changes against the parent build baseline.

#### Root cause (verified in code)

[lib/commands/normalize.js:55-68](../lib/commands/normalize.js#L55-L68) `gitChangedFiles` and [normalize.js:70-90](../lib/commands/normalize.js#L70-L90) `mtimeChangedFiles` excluded only root `spec/`, root `.aitri`, and `node_modules/`. They had no symmetric exclusion for `features/<name>/spec/` or `features/<name>/.aitri`. The result was conceptually wrong — feature pipeline artifacts are governed by the feature's own gate (its own `04_TEST_RESULTS.json`, `05_PROOF_OF_COMPLIANCE.json`, `verifyPassed`), not by the parent's build baseline. Listing them in parent normalize forced the operator into reclassifying already-approved feature output as outside-pipeline drift.

#### Fix

New helper `isFeaturePipelineArtifact(relPath)` matches `^features/[^/]+/(spec/|\.aitri(\/|$))`. Both detection paths (git and mtime) now filter it symmetrically with the root exclusions.

Shared product code that a feature contributes outside `features/<name>/` (e.g. `lib/collector/snapshot-reader.js`, `tests/e2e/<file>.test.js` at the repo root) **stays in scope**. That's a legitimate parent baseline change and the operator confirms it via the existing `aitri normalize --resolve` TTY gate. The fix narrows the false-positive set, not the legitimate review surface.

#### Scope explicitly NOT covered

The user's Hub finding also raised a deeper question: should `aitri feature verify-complete` propagate baseline advancement to the parent automatically, so shared code contributed by a shipped feature does not need a separate `--resolve` confirmation? Answer: no, not in rc.3. That change would touch parent/feature baseline coupling (what happens with parallel features, what happens when a feature contributes to a file another feature also touched) and the evidence base is one canary. Current behavior (operator runs `--resolve` after feature ship) remains correct by design — it's the TTY gate that confirms "yes, the feature's code drop is what changed in shared dirs."

#### Tests

`test/commands/normalize.test.js` — new case `'does not include features/<name>/spec/ or .aitri in the change list (mtime path)'` covering both the exclusion (feature spec/, feature .aitri) and the legitimate inclusion (shared `lib/` code).

#### Contract & promotion impact

Tier-1 per CLAUDE.md — a deployable multi-feature project (Hub at maturity) was reporting false off-pipeline drift after a clean feature ship. Real consumer blocked on noise. integrations CHANGELOG documents the `.aitri#normalizeState.status` shift (some pending → resolved) as additive. No schema field changed.

---

## [2.0.0-rc.2] — 2026-05-12 — pre-promotion quality polish bundle (closes "Pre-promotion findings" section)

Second release candidate, same day as rc.1. **Closes the four remaining items from BACKLOG "Pre-promotion findings (Codex canary 2026-05-11)"** + reclassifies N2 from P1 → P3 with code-grounded rationale. Bundled because they share theme ("post-rc.1 quality polish without touching contracts") and because the freshness rule we are adding in this release retroactively obligates the template rewrite it documents.

### Template rewrite + freshness rule (closes P2 "Binary 'functional vs minor' classification")

`templates/AGENTS.md` was last touched at v0.1.61 (2026-03-17). One commit. 48 lines. Mentioned 5 commands — `aitri resume`, `status`, `validate`, `feature init`, `run-phase`. Aitri shipped ~21 commands by rc.1; the template was systematically misleading agents in consumer projects ("I don't know `aitri normalize` exists" → "I'll treat every change as a feature" → user's reported friction in the Codex canary).

Rewrite: 48 → 132 lines. Covers:
- Starting a session + version-mismatch routing to `adopt --upgrade`.
- Pipeline rules + optional phases (`discovery`, `ux`, `review`) usage guidance.
- Verify-run / verify-complete distinction; bug lifecycle; `tc mark-manual` for non-automatable cases.
- Normalize semantics including the rc.1 `--resolve` gate on blocking bugs.
- Drift handling (re-approve via `aitri approve` vs bookkeeping via `aitri rehash`).
- Pipeline-complete and idle-project states.
- **Three-tier change classification (trivial / small / feature)** with concrete examples ("add a form field", "make a header fixed", "rename a button") that directly addresses the user-reported "everything treated as feature" friction. Bias toward "feature" preserved only for **behavioral** ambiguity — not for size.
- Feature sub-pipelines + grammar (`aitri feature <verb> <name> [<phase>]`) + the rc.1 fix that feature approve 4 advances root baseline.
- Off-pipeline surfaces (`aitri audit`, `aitri backlog`).
- "What NOT to do" closing section.

**CLAUDE.md "Critical rules" gains a freshness obligation:** every release that adds or changes a command, phase gate, CLI flag, artifact contract, or operator-visible behavior must audit `templates/AGENTS.md` in the same commit. Existing consumer projects do NOT auto-refresh — operators see `aitri adopt --upgrade` prompts on version mismatch and can manually re-pull by deleting their local agent file (the upgrade path regenerates absent files). Producer-side freshness; consumer-side refresh stays intentionally manual until a third-party adopter asks for an automated `--refresh-agents` flag. Closes the loop on the user's request for "instrucción para que los archivos de agentes se mantengan actualizados y alineados con cada version".

### `aitri status --json` bugs payload (closes P2 "bugs payload too narrow")

`lib/snapshot.js::aggregateBugs` and `lib/commands/status.js` JSON emitter gain two additive fields:

- `bugs.bySeverity: { critical, high, medium, low }` — active-only counts (open + in_progress).
- `bugs.openIds: string[]` — IDs of bugs in `bySeverity`, sorted ascending for deterministic output.

Active-only semantics mirror the existing `blocking` counter. `fixed`, `verified`, `closed` are excluded. Unknown severity values are silently dropped from the breakdown (no crash, no false-positive bucket).

**Hub impact:** closes the contract gap surfaced 2026-05-11 where Hub's `bugsSummary` showed `medium: 0, low: 0, openIds: []` for a project with one medium + one low bug. Hub can now render per-severity warnings + clickable bug-id links from the snapshot without re-parsing `spec/BUGS.json` directly. STATUS_JSON.md schema updated; integrations CHANGELOG `— additive`.

### `aitri validate` text trim (closes P3 "validate text overlap with status ~70%")

`lib/commands/validate.js::emitText` restructured. Default text now ~12-18 lines (was ~25-40). Operational deploy info moved behind `--explain`:
- Deploy candidates block (`Dockerfile`, `docker-compose.yml`, `DEPLOYMENT.md`, `.env.example` listing).
- Setup commands block (from `04_IMPLEMENTATION_MANIFEST.json::setup_commands`).
- DEPLOYMENT.md path hint.

Features section in default text: shows only when at least one feature has rank-0 (failed verify) or rank-1 (incomplete). When all features are all-green, the section is hidden — it adds zero signal beyond the deploy-gate verdict line. `--explain` always shows the full features table + Σ.

`emitOperationalDeploy()` factored out as a new function. `emitText` calls it conditionally on `explain`.

**JSON shape (`emitJson`, lines 227-314) UNTOUCHED.** Hub contract preserved. Regression-locked by new test in `test/commands/validate.test.js` asserting `allValid / artifacts[] / deployFiles / setupCommands / deployable / deployableReasons[] / openBugs / blockingBugs` all present in `--json` regardless of text-mode trim.

### P3 "Agent-file refresh mechanism" — decided not implementing

The producer-side freshness obligation (above) + the existing `aitri adopt --upgrade` version-mismatch prompt + the non-destructive regeneration of absent files together cover the use case without new CLI surface. Operators with stale agent files in existing projects: `rm CLAUDE.md && aitri adopt --upgrade` regenerates from the current template. Re-open if a real adopter asks for an automated `--refresh-agents` flag with diff preview.

### N2 reclassified P1 → P3 (BACKLOG hygiene)

Normalize briefing proportional-to-scope optimization. Code-verified 2026-05-12: full-spec embedding still at `lib/commands/normalize.js:303-306`; ~70KB briefing on Ultron-sized projects remains accurate. But post-N1 (allowlist, alpha.4) normalize fires only on real behavioral drift — zero "briefing too big" reports in ≈ 6 weeks of canary use. Re-promotion criterion documented: any canary that measures briefing >50KB on a legitimate (post-N1, post-rc.1) drift case AND reports friction.

### Pre-promotion status (as of rc.2)

All four open items from "Pre-promotion findings (Codex canary 2026-05-11)" closed. Section empirically done. The technical case for v2.0.0-stable is clean of regressions surfaced in this session. Promotion gate remains: third-party adopter validating end-to-end (CLAUDE.md Critical rules). No author-canary further work indicated; awaiting external signal.

### Other

- Tests: 1161 → 1175 (+14). No existing test regressions.
- No schema change. `.aitri` shape untouched.
- integrations CHANGELOG entry `— additive` for the new bugs JSON fields.
- `v0.1.90` local tag (rc.1 release) pushed to origin 2026-05-12 as documented rollback target.

---

## [2.0.0-rc.1] — 2026-05-12 — pre-promotion P1 bundle + maturity signal (end of alpha cycle)

**First release candidate after 27 alpha iterations on `feat/upgrade-protocol`.** Closes both P1s surfaced by the Codex canary on Ultron 2026-05-11 (BACKLOG.md "Pre-promotion findings") AND signals end of alpha cycle. The semver bump from `alpha.27` straight to `rc.1` skips an intermediate `alpha.28` — the technical work is what an alpha.28 would have shipped, but with no further P1s pending it would have been the alpha-to-rc handover anyway. One release, one commit, one tag.

**Why rc.1 and not v2.0.0 stable.** The third-party adopter gate (CLAUDE.md Critical rules) is not yet met. All canary validation is from author-owned projects (Hub, Ultron, Zombite, Cesar, Go-on-RPi). rc.1 communicates "stable in intent, code is clean, semver-frozen until promoted" without making the irreversible commitment that `v2.0.0` would. Stable promotion happens once an external adopter exercises the pipeline end-to-end without surfacing new defect classes — that gate also got reinforced this session (four distinct Core/Hub contract gaps surfaced via the canary work; promoting on author canaries alone would have shipped them silently).

**Local rollback target.** `v0.1.90` tagged locally at `601c26c` 2026-05-12 (last release commit on main pre-v2 work). Not pushed.

Bundled because they compound — upstream P1.A fires after every feature approval on flat-codebase projects; downstream P1.B locks the operator out of resolving once any blocking bug exists. Together they produced a visible deadlock in Ultron's transcript.

### P1.A — `aitri feature approve <name> 4` now advances root `normalizeState.baseRef`

**The bug.** `cmdApprove` is scope-aware: `dir` and `loadConfig(dir)` resolve to the scope's `.aitri/config.json` — for feature scope that is `features/<name>/.aitri/config.json`, not the root. The baseline-advance block at `lib/commands/approve.js:392-402` therefore wrote only to the feature's normalizeState, leaving the root frozen at the pre-feature SHA. On flat-codebase projects (Go monolith, Rust workspace, single-package Python — where feature implementation files live at root like `internal/alerts/engine.go` rather than sandboxed under `features/<name>/`), every feature Phase 4 approval left root reporting `deployable: Not ready — Code changes outside pipeline` against its own legitimately-approved feature artifacts. Ultron Codex canary 2026-05-11 demonstrated: baseline `401678e8` (pre-feature) vs HEAD `8d7ab9b` (post-`network-alerts`), every flagged file a legitimate feature artifact. Same defect class as the 2026-04-27 normalize friction cycle that drove N1 allowlist: false-positive triggers → operator workaround commits → eroded signal credibility.

**The fix.** When approving in feature scope, after writing the feature's baseline, **also** stamp the root project's baseline at the same git HEAD. Conceptual model: root baseline = last point where any pipeline sealed its code state. Approving any Phase 4 means that pipeline's code is reviewed-and-approved; from root drift detection's perspective, that SHA is "all approved-to-date".

**Files touched.**
- `lib/state.js` — added `findProjectRoot(startDir)` (walks up looking for ancestor `.aitri/`) and `stampNormalizeBaseline(targetDir)` (idempotent helper: reads target config, advances baseline at git HEAD or mtime fallback, saves; no-op on non-aitri dirs via `!config.aitriVersion` guard).
- `lib/commands/approve.js` — in the `phase === 4` block, after the in-memory current-scope advance, call `stampNormalizeBaseline(featureRoot)` when `featureRoot` is set. Cross-references BACKLOG entry inline.

**Tests added** (`test/commands/approve.test.js` — new describe block `feature approve 4 advances ROOT normalize baseline (P1 2026-05-12)`, +4 tests):
- Feature approve 4 advances BOTH feature and root normalizeState to same git SHA (the core fix).
- Root approve 4 (no `featureRoot`) only advances root baseline — regression lock.
- Feature approve 4 with non-aitri parent dir does not crash — graceful no-op via `aitriVersion` guard.
- Sequential feature approvals advance root baseline forward each time (forward-only, monotonic).

**Edge cases covered:**
- Multiple features with WIP in parallel: first to approve advances root baseline past the other's WIP. Acceptable — uncommitted WIP gets reviewed in its own feature's Phase 4 review, not in root drift detection.
- Feature cascade-invalidation: feature's normalizeState clears (existing behavior), root's stays advanced. New post-cascade changes surface as drift correctly against the latest baseline.
- Mtime fallback (no git): both writes record timestamp; feature and root use distinct millisecond-instant timestamps — that's fine, both are valid baselines for their scope.

### P1.B — Next-actions ladder suppresses `aitri normalize` when blocking bugs exist (deadlock fix)

**The bug.** `aitri normalize --resolve` refuses to run when `bugs.blocking > 0` (gate at `lib/commands/normalize.js:148-157`). But the next-action ladder in `lib/snapshot.js:727-744` emitted `aitri normalize` as priority-4 regardless of bug state. Operator followed the ladder → ran normalize → got rejected → fixed bugs → re-checked status → ladder still said "run aitri normalize". Visible deadlock between suggestion and command. Compounded with P1.A on Ultron's transcript: feature completion triggered false-positive normalize-pending (P1.A) AND operator had 2 active bugs, blocking `--resolve` (P1.B). No clean forward path.

**The fix.** Wrap both normalize emission branches in `lib/snapshot.js:726-744` with `if (bugs.blocking === 0)`. The blocking-bug action already surfaces above normalize at priority 3 (the operator's actual blocker); normalize re-emerges automatically when bugs close. Pure ladder-display change — `normalizeState` state field unchanged, no schema impact, no subproduct contract change (subproducts read `.aitri.normalizeState` directly, not `nextActions[]` text).

**Decision: suppress, not reword.** Telling the operator "you can't normalize yet" while keeping it in the ladder is theater — the ladder's contract is "next thing to do"; an action the command rejects is not a next thing.

**Files touched.**
- `lib/snapshot.js` — conditional wrap around priority-4 normalize emission. Comment cross-references BACKLOG entry.

**Tests added** (`test/snapshot.test.js` — new describe block `nextActions — normalize suppression on blocking bugs (P1 2026-05-12)`, +4 tests):
- Critical/high + open: normalize MUST NOT appear; blocking-bug P3 surfaces instead.
- Blocking bug closed + normalize still pending: normalize re-emerges as P4.
- High + in_progress also suppresses (mirrors `--resolve` gate's `open || in_progress` semantics).
- Low severity + open does NOT suppress — regression lock for the "not-blocking" branch.

### Why these two were bundled

The compound failure mode in Ultron's transcript made testing them independently artificial. The downstream test "blocking bugs + normalize pending → no normalize in ladder" is only meaningful when feature-approval workflows can actually trigger a clean normalize-pending state — which depends on the upstream fix. Shipping P1.A alone would have left the ladder still emitting normalize incorrectly in any project with bugs; shipping P1.B alone would have left flat-codebase projects with permanent false-positive normalize-pending after feature work.

### Pre-promotion status (as of rc.1)

Both P1s from BACKLOG.md "Pre-promotion findings (Codex canary 2026-05-11)" are now closed. Four open items remain in that section (2 P2 + 2 P3), all classified as **post-promotion cleanup, not blockers**:
- P2 — Template binary classification of changes (`templates/AGENTS.md` "functional vs minor").
- P2 — `status --json` bugs payload too narrow — Hub cannot derive per-severity counts.
- P3 — Agent-file refresh mechanism (coupled to template P2).
- P3 — Validate text output overlaps ~70% with `status`.

The third-party adopter gate (CLAUDE.md Critical rules) is **NOT YET MET**. v0.1.90 was locally tagged at commit `601c26c` 2026-05-12 as the documented rollback target. Promotion decision (override + ADR vs `2.0.0-rc.1`) deferred to a separate conversation now that the technical P1s are clean.

### Other

- Tests: 1153 → 1161 (+8). No existing test regressions.
- No schema change; no `docs/integrations/CHANGELOG.md` entry needed (P1.A behavioral cadence clarification documented in SCHEMA.md note; P1.B is pure ladder display).
- Local-only `v0.1.90` tag created pointing at `601c26c` (last release on main pre-v2 work). Not pushed.

---

## [2.0.0-alpha.27] — 2026-05-03 — `aitri approve 1` pre-flight scan (producer-side at-approve gate)

Twenty-seventh staged pre-release on `feat/upgrade-protocol`. **Closes the producer-side gap of the IDEA.md absorption arc.** alpha.22/24/25/26 closed consumer-side instances (validate.js, upgrade migrator, phase inputs); alpha.27 closes the original producer at the destructive op itself — `lib/commands/approve.js::archiveIdeaIntoRequirements`.

**The producer-side bug.** Since v0.1.89, `aitri approve 1` archives IDEA.md content into `01_REQUIREMENTS.json#original_brief` and unlinks the file. **The destructive op never scanned downstream artifacts for IDEA.md path references.** Hub paid the cost: `tests/integration/hub-web-only.test.js` did `readFileSync('IDEA.md')` for TC-015h + TC-018f; `04_IMPLEMENTATION_MANIFEST.json::files_modified[i].path === "IDEA.md"`. After approve fired, those refs broke at the next `aitri verify-run` — silently invisible until tests ran.

**The fourth instance of the same class** (chronological):
1. `validate.js` gating on `fs.existsSync('IDEA.md')` — closed alpha.22.
2. `lib/upgrade/migrations/from-0.1.65.js::diagnoseOrphanIdea` unlinking without pre-flight — closed alpha.24/25.
3. `lib/phases/{phase2,phaseUX}.js` declaring IDEA.md as required input — closed alpha.26.
4. `lib/commands/approve.js::archiveIdeaIntoRequirements` running the destructive op without scanning — **closed by this release**.

**ADR-031 Addendum 2 codifies the producer-side principle.** Addendum 1 (alpha.26) was consumer-side (audit every callsite when destructive op ships). Addendum 2 (this release) is producer-side: the destructive op itself must classify + block + auto-fix at execution time. Bidirectional obligation now codified end-to-end.

**Behavior — exact rules** (mirror of alpha.25 migrator, applied at approve-time):

- Pre-flight runs only on **first approve of Phase 1** + IDEA.md present at root. Re-approves and absent-file states skip the scan (no destructive op to gate against).
- Classifier (`lib/upgrade/idea-ref-classifier.js`, alpha.25) returns three buckets:
  - `auto_fixable` — manifest array elements with value `"IDEA.md"` (string) or `{path: "IDEA.md", ...}` (Hub's enriched shape). **Mechanically dropped + re-stamp `artifactHashes['4']` if Phase 4 approved + emit `approve_preflight_autofix` event with before/after hashes.**
  - `narrative` — anywhere else (free-form JSON, project extensions, Markdown bodies, free-text strings). **BLOCK approve via `err()` with actionable error message listing each ref by file + JSON-path.**
  - `frozen` — `04_TEST_RESULTS.json` + `05_PROOF_OF_COMPLIANCE.json`. **Silently skip** — immutable historical evidence.
- Auto-fixes apply BEFORE block check. They are independently committable (operator can `git diff` and revert if intentional). On block path, `saveConfig` runs first to persist the auto-fix events.
- **No escape flag** — operator's correct path on block is to edit refs and re-run. Adding `--accept-stale-refs` would re-create the silent breakage Addendum 2 is closing.

**Files touched.**
- `lib/commands/approve.js` — added imports from classifier; added `setPhaseHashIfApproved` helper; added `applyPreflightAutoFixes` + `buildPreflightBlockMessage` helpers; integrated into `cmdApprove` between completion gate and absorb call.
- `bin/aitri.js` — VERSION bump to `2.0.0-alpha.27`.
- `package.json` — version bump.
- `test/commands/approve.test.js` — new describe block `cmdApprove() — alpha.27 pre-flight scan on first-approve of phase 1` with 7 tests covering: block on narrative; block message format (file + JSON-path enumeration); auto-fix manifest then absorb; auto-fix runs even when narrative blocks; frozen silently skipped; clean project regression guard; no trigger on re-approve.
- `docs/integrations/{README,STATUS_JSON,SCHEMA,ARTIFACTS}.md` — version header bump per release-sync.
- `docs/integrations/CHANGELOG.md` — entry tagged `— additive` (new event type `approve_preflight_autofix`; no schema field changed; no existing event-shape modified).
- `docs/Aitri_Design_Notes/DECISIONS.md` — ADR-031 Addendum 2 added.
- `docs/Aitri_Design_Notes/BACKLOG.md` — "Shipped in alpha.27" subsection added.

**Tests added.** 7 new tests in `test/commands/approve.test.js`. Suite total: 1146 → 1153 passing, 0 failures (`npm run test:all`).

**Canary validation (per ADR-029 — predictions written ahead of execution).** Synthetic projects only, since Hub + Ultron + Cesar + Zombite all have Phase 1 already approved (the gate Addendum 2 closes only fires on first-approve, not retroactively).
- Synthetic clean (no refs) → approve absorbs as before. Regression guard.
- Synthetic with manifest auto_fixable only → drops entry + absorbs in one approve.
- Synthetic with narrative ref in 02_SYSTEM_DESIGN → blocks with actionable error; IDEA.md preserved; original_brief not populated.
- Synthetic with mixed (auto-fix + narrative) → auto-fix applies, narrative blocks; IDEA.md preserved; auto-fix mutations + event persist.
- Synthetic with frozen-only (TEST_RESULTS / PROOF_OF_COMPLIANCE) → absorbs without block (frozen silently skipped).

**Why a bump.** New observable behavior in `aitri approve 1` (pre-flight scan can block; can mutate downstream manifests; can emit new event type). Per CLAUDE.md: change in approve gate behavior + new event type → bump.

**Why `— additive` in integrations CHANGELOG.** No artifact schema field changed; no `.aitri` field added or removed; no existing event-shape modified. New event type `approve_preflight_autofix` follows the existing additive-events contract (SCHEMA.md: "unknown event types MUST be tolerated"). New error message is human-facing CLI text, not a parser contract.

**Net effect of ADR-031 + Addenda 1 + 2 (the IDEA.md class is closed):**
| Phase of destructive op | Coverage | Shipped in |
|---|---|---|
| Producer-time at first-approve | Pre-flight scan + block + auto-fix | alpha.27 (this) |
| Migration-time for already-broken projects | Classifier + advisory + auto-fix | alpha.24 + alpha.25 |
| Consumer audit (codepaths assuming presence) | Per-callsite enumeration + structural guard test | alpha.22 + alpha.26 |

**Pre-stable status.** v2.0.0 stable promotion remains gated on a third-party adopter validating end-to-end. Author canaries clean as of alpha.27 (Hub, Ultron, Zombite, Cesar). The IDEA.md producer-side gap is empirically closed — six releases (alpha.17, .22, .24, .25, .26, .27) converged on the bidirectional contract codified in ADR-031.

---

## [2.0.0-alpha.26] — 2026-05-03 — phase 2 + phaseUX no longer require IDEA.md (absorbed-brief regression hotfix)

Twenty-sixth staged pre-release on `feat/upgrade-protocol`. Tier-1 hotfix surfaced 2026-05-03 by Ultron canary post alpha.25 install: re-running `aitri run-phase architecture` on an absorbed-brief project failed with `Missing required file: IDEA.md`. Same incident class as alpha.22 (validate.js), but at a different surface — phase input declarations rather than artifact validators.

**The bug.** `lib/phases/phase2.js:17` and `lib/phases/phaseUX.js:16` declared `inputs: ['IDEA.md', '01_REQUIREMENTS.json']`. Neither phase's `buildBriefing` actually consumed `inputs['IDEA.md']` — they only rendered REQUIREMENTS_JSON (which carries `original_brief` since v0.1.89). `lib/commands/run-phase.js:75-83` enforces input presence at the gate level: missing required input → `err()` throw, before `buildBriefing` is even called. Result: any project where Phase 1 was approved (IDEA.md absorbed and unlinked by `aitri approve 1` since v0.1.89) failed to re-run Phase 2 or phaseUX. The pattern affected every project that uses Aitri normally — Phase 1 approval is mandatory for any pipeline reaching Phase 2.

**Why this was not caught earlier.** Greenfield projects and CI runs typically run phases in order without re-running Phase 2 after Phase 1 approval. The bug surfaces on the **second pass** — refining the architecture after FR changes, the canonical post-approval workflow. Ultron is the first author canary to exercise this path post-alpha.17.

**Three observed instances of the same class** (per ADR-031 addendum):
1. `lib/commands/validate.js` gating on `fs.existsSync('IDEA.md')` — closed by alpha.22.
2. `lib/upgrade/migrations/from-0.1.65.js::diagnoseOrphanIdea` unlinking without pre-flight — closed by alpha.24 + alpha.25.
3. `lib/phases/{phase2,phaseUX}.js` declaring IDEA.md as required input but not using it — closed by this release.

**Three hotfixes on the same producer event = systemic gap, not three coincidences.** ADR-031 addendum codifies the bidirectional audit protocol: every callsite that depends on the file's presence must be enumerated and reclassified when a destructive on-disk op ships. Applied retroactively here for the IDEA.md case.

**Files touched.**
- `lib/phases/phase2.js` — removed `'IDEA.md'` from `inputs`; added inline comment explaining the absorbed-brief invariant. `buildBriefing` unchanged (already correct).
- `lib/phases/phaseUX.js` — same change. Plus updated the user-personas fallback message text to reference `01_REQUIREMENTS.json#original_brief` instead of `IDEA.md`.
- `templates/phases/phaseUX.md` — updated the design-tokens derivation guidance to point at `01_REQUIREMENTS.json` (with `original_brief` for absorbed seed brief, `project_summary` for refined description) instead of `IDEA.md`.
- `bin/aitri.js` — VERSION bump to `2.0.0-alpha.26`.
- `package.json` — version bump.
- `test/phases/inputs-contract.test.js` (new) — structural guard test: walks `PHASE_DEFS` and asserts no post-Phase-1 phase declares `IDEA.md` as required input. Sanity check confirms `discovery` (the only legitimate IDEA.md reader) keeps it.
- `test/commands/run-phase.test.js` — three new functional tests under `cmdRunPhase() — absorbed brief (alpha.26)` describe block: phase 2 succeeds without IDEA.md; phase 2 doesn't throw "Missing required file"; phaseUX succeeds without IDEA.md. Reproduces the exact Ultron repro shape.
- `docs/integrations/{README,STATUS_JSON,SCHEMA,ARTIFACTS}.md` — version header bump per release-sync.
- `docs/integrations/CHANGELOG.md` — entry tagged `— additive`.
- `docs/Aitri_Design_Notes/DECISIONS.md` — ADR-031 addendum added (post-destructive on-disk audit protocol).
- `docs/Aitri_Design_Notes/BACKLOG.md` — "Shipped in alpha.26" subsection added.

**Tests added.** 3 new structural + 3 new functional. Suite total: 1141 → 1147 passing, 0 failures (`npm run test:all`).

**Audit (per ADR-031 addendum protocol).** `grep -rn "IDEA\.md" lib/ templates/` enumerated and classified every callsite:
- **Pre-Phase-1 consumers (correct, no change):** `lib/commands/{init,wizard,adopt,feature}.js`, `lib/phases/phase1.js` (dynamic mode), `lib/phases/phaseDiscovery.js`, `lib/commands/run-phase.js:61` (first-run word-count warning, gated on absent 01_REQUIREMENTS.json).
- **Producer (the destructive op):** `lib/commands/approve.js` (archive + unlink on Phase 1 approve).
- **Post-Phase-1 consumers — fixed in alpha.22:** `lib/commands/validate.js`.
- **Post-Phase-1 consumers — fixed in alpha.24/25:** `lib/upgrade/migrations/from-0.1.65.js`.
- **Post-Phase-1 consumers — fixed in alpha.26 (this release):** `lib/phases/phase2.js`, `lib/phases/phaseUX.js`, `templates/phases/phaseUX.md`.
- **No remaining gaps.** Confirmed by structural guard test.

**Why a bump.** Observable behavior change: `aitri run-phase architecture` and `aitri run-phase ux` now succeed where they previously failed. Per CLAUDE.md: change in phase lifecycle / observable CLI output → bump.

**Why `— additive` in integrations CHANGELOG.** No artifact schema, no `.aitri` field, no event-type, no CLI command/flag changed. Only fix: previously-failing scenario now succeeds. No prior valid scenario regresses. Same shape as alpha.22.

**Bypass of velocity gate** justified per CLAUDE.md "Purpose over process" exception — Tier-1 bug, real consumer (Ultron) blocked, removal of an incorrect assumption (not new abstraction).

**Pre-stable status.** v2.0.0 stable promotion remains gated on a third-party adopter validating end-to-end. Author canaries clean as of alpha.26 (Hub, Ultron, Zombite, Cesar). The destructive-op audit class is now closed for IDEA.md — three hotfixes converged on a complete fix; the structural guard prevents recurrence.

---

## [2.0.0-alpha.25] — 2026-05-03 — orphan IDEA.md classified-ref handling

Twenty-fifth staged pre-release on `feat/upgrade-protocol`. Refines alpha.24's all-or-nothing pre-flight scan into a three-bucket schema-aware classifier per ADR-031, so corrections travel forward in the upgrade for fields Aitri owns and the operator's manual triage scope shrinks to references in fields Aitri does not own. Closes the third hotfix in the alpha.17 → alpha.22 → alpha.24 → alpha.25 arc: the principle is now codified, not just patched.

**The principle this codifies (ADR-031).** *Destructive migrations must pre-flight scan for downstream references before proceeding, classify each reference by schema authority, and apply mechanical drops where Aitri owns the schema.* alpha.24 implemented the scan; alpha.25 implements the classification and the auto-fix in the bound subset.

**Three buckets — `auto_fixable` / `narrative` / `frozen`.**

1. **`auto_fixable`.** Reference lives in a field Aitri owns: documented in `ARTIFACTS.md` and validated by `lib/phases/phase*.js::validate()`. Currently bound to `04_IMPLEMENTATION_MANIFEST.json::files_created[*]`, `files_modified[*]`, and `test_files[*]`. Two element forms supported (the validator only enforces arrayness, not element type, so projects use both): string element exact match `"IDEA.md"` → drop element; object element with `.path === "IDEA.md"` (Hub's enriched shape) → drop entry. After drop, `artifactHashes['4']` is re-stamped if Phase 4 was approved. Each affected file emits one `upgrade_migration` event with `before_hash` / `after_hash`.
2. **`narrative`.** Reference lives anywhere else: free-form fields (`test_data.*`), project-extension shapes (Hub's `verification.smoke_checks[i].command`, `feature`, `version_target`), narrative bodies (Markdown `.md`), free-text strings (`technical_debt[i].substitution`). Aitri does not own these. Flagged as a single `validatorGap` finding listing all narrative-bearing files; blocks the absorb until operator edits.
3. **`frozen`.** Reference lives in `04_TEST_RESULTS.json` (auto-generated by verify-run) or `05_PROOF_OF_COMPLIANCE.json` (Phase 5 evidence). These are immutable historical records by design — modifying them falsifies history. **Silently skipped.** Counted internally for tests but never surfaced as a finding requiring action. The narrative finding's educational copy mentions their filenames so the operator understands why they are exempt.

**Pre-flight blocking decision is post-auto-fix.** Migrations apply auto-fixes first (independently committable improvements to project state). Then re-evaluate: if `narrative.length > 0` after auto-fix, block the destructive op (preserves alpha.24's safety guarantee). If `narrative.length === 0`, proceed with the absorb in the same upgrade run. Frozen refs never count toward the block.

**Stale-ref mode (file already absent).** Auto-fix does NOT run — the destructive op happened in a prior upgrade and silently mutating refs now would happen without operator awareness. Only the narrative finding is emitted. Frozen silently skipped.

**Discovery primitive.** Regex `/\bIDEA\.md\b/` stays as the discovery primitive (lowest common denominator across heterogeneous artifacts); schema-walk drives `auto_fixable` over structured fields. Word boundary excludes `FEATURE_IDEA.md` (verified zero matches against Cesar/Zombite/Ultron 2026-05-03).

**Degenerate-state guard.** If dropping an `auto_fixable` element would leave both `files_created` and `files_modified` empty (a state phase4.js:40-43 rejects), the classifier reclassifies that ref to `narrative` instead of producing a manifest the validator would reject. Operator decides manually.

**§2 reading clarified.** alpha.24 rejected auto-fix as "semantic transform". ADR-031 corrects: §2 forbids semantic *inference* (guessing operator intent). Removing a structurally invalid pointer to a file the same migration is about to delete is shape, not semantics — it is the only shape transform on a known-broken pointer. Schema-validated fields are where the §2 line lives; free-form fields are the operator's domain.

**Files touched.**
- **NEW** `lib/upgrade/idea-ref-classifier.js` (~190 LOC) — exports `classifyIdeaReferences`, `applyManifestAutoFix`, `phaseForArtifact`, `PATTERN`. Pure read for classification; mutating helpers consumed by the migration's `apply()` callback.
- `lib/upgrade/migrations/from-0.1.65.js` — removed `findIdeaPathReferences` (alpha.24's regex helper); rewrote `diagnoseOrphanIdea` around the classifier output. Two new helpers (`buildAutoFixFinding`, `buildNarrativeFinding`) keep the per-finding shape consistent with the rest of the module.
- `bin/aitri.js` — VERSION bump to `2.0.0-alpha.25`.
- `package.json` — version bump.
- `test/upgrade.test.js` — replaced the alpha.24 describe block with a new alpha.25 block (~20 tests covering auto-fix mechanics, narrative blocking, frozen silently skipped, idempotency, Hub-shape regression, degenerate-state guard, A2 read-only, false-positive guard).
- `docs/integrations/{README,STATUS_JSON,SCHEMA,ARTIFACTS}.md` — version header bump per release-sync.
- `docs/integrations/CHANGELOG.md` — entry tagged `— additive`.
- `docs/Aitri_Design_Notes/DECISIONS.md` — ADR-031 added.
- `docs/Aitri_Design_Notes/BACKLOG.md` — alpha.25 entry moved from Open to Shipped.

**Tests added.** Replaced 6 alpha.24 tests with 20 alpha.25 tests in `test/upgrade.test.js`. Suite total: 1125 → 1141 passing, 0 failures (`npm run test:all`).

**Canary validation (per ADR-029 — predictions written ahead of execution).**

1. **Hub canary on tar-clone (`/tmp/hub-alpha25-test/`).** Predictions in `/tmp/hub-alpha25-predictions.md`. Hub is in stale-ref mode (IDEA.md already absorbed at alpha.17+). All 7 predictions confirmed:
   - Version banner: `2.0.0-alpha.24 → 2.0.0-alpha.25`.
   - Exactly 1 `validatorGap` finding for orphan-IDEA, target `IDEA.md (absorbed)`.
   - Actionable file list contains exactly 4 files: `spec/01_UX_SPEC.md`, `features/hub-web-only/spec/{02_SYSTEM_DESIGN.md, 03_TEST_CASES.json, 04_IMPLEMENTATION_MANIFEST.json}`. (was 6 in alpha.24.)
   - Frozen `04_TEST_RESULTS.json` + `05_PROOF_OF_COMPLIANCE.json` correctly excluded from actionable list; appear only in educational copy.
   - Manifest md5 unchanged pre/post (no auto-fix in stale-ref mode): `ae97a0eb020e43b5c699404dfe028ebe`.
   - REQUIREMENTS.json md5 unchanged.
   - feature `.aitri` md5 unchanged (A2 invariant preserved).
   - Zero `upgrade_migration` events on the manifest target.
2. **Synthetic PRE-FLIGHT canary with mixed refs (`/tmp/aitri-alpha25-preflight-canary/`).** Auto-fix dropped `files_modified[0].path === "IDEA.md"`; narrative refs in 02_SYSTEM_DESIGN.md + manifest's `technical_debt` blocked the absorb; IDEA.md preserved on disk. Manifest md5 changed (auto-fix applied), files_modified count went 2→1, src/other.js entry preserved.
3. **Synthetic clean PRE-FLIGHT canary (`/tmp/aitri-alpha25-clean-canary/`).** Auto-fixable + frozen only (no narrative): auto-fix dropped IDEA.md from files_modified, absorb proceeded, IDEA.md unlinked, original_brief populated.

**Hub recovery (out of scope of this release, separable in Hub's repo).** Hub's 4 narrative refs require manual editing in Hub's repo: TC-015h `test_data.files` array, TC-018f `given/steps/expected_result` (whole-TC re-author), 02_SYSTEM_DESIGN.md narrative paragraph, 01_UX_SPEC.md parenthetical. Aitri's job ends at correctly classifying and surfacing.

**Why a bump.** Observable behavior change in `aitri adopt --upgrade` output (new `auto_fixable` finding category, different blocking decision, different narrative scope). Per CLAUDE.md: change in upgrade migration → bump.

**Why `— additive` in integrations CHANGELOG.** No `.aitri` field added, no artifact schema field added, no event payload added; finding shape (`{category, target, transform, reason, recordedAt}`) unchanged. Only `reason` text and the count of files listed differ between versions. CLI-text-level change, not a subproduct contract change.

**Pre-stable status.** v2.0.0 stable promotion remains gated on a third-party adopter validating end-to-end. Author canaries clean as of alpha.25 (Hub, Ultron, Zombite, Cesar). The destructive-migration safety principle (ADR-031) closes the alpha.17 → alpha.22 → alpha.24 → alpha.25 arc — future migrations of the same shape will inherit the protocol.

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

**Coherence by reuse.** The parser delegates TC-id normalization to the existing `extractTCId()` helper at [verify.js:30](../lib/commands/verify.js#L30) — the same regex that handles Vitest/Pytest/Playwright. Go test names like `TestTC_NM_001h` have the `Test` prefix stripped, and `extractTCId()` then converts the underscore separator to canonical `TC-NM-001h`. No new normalization logic; one source of truth preserved.

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
