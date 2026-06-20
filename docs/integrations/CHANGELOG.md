# Aitri Integration Contract — Changelog

Changes to the `.aitri` schema or artifact schemas that affect subproduct readers.
Subproducts should check this file when upgrading their Aitri reader implementation.

## Entry format

Every top-level entry heading **must** end with exactly one of these two markers so downstream consumers (Aitri Hub, future subproducts) can distinguish safe upgrades from risky ones:

- `— additive` — fields/events/commands added. Old readers continue to work unchanged; new surfaces are optional opt-ins. This is the default posture.
- `— breaking` — an existing field/event/command shape changed, was removed, or acquired a new required semantic. Old readers will silently miscompute or fail until updated. Never use without a matching major or pre-release-major bump.

Subproducts MAY use this marker to auto-silence version-gap banners for additive-only upgrades. Subproducts MUST surface action to the operator for any `breaking` marker between their last-reviewed version and the installed CLI version.

A mixed upgrade (some additive, some breaking) is always `— breaking` — the stricter marker wins.

**Linter:** enforced by `test/release-sync.test.js` — any `## v...` heading missing one of the two markers fails CI.

---

## v2.0.0-rc.95 (2026-06-19) — All-manual `verify-run` seeds `04_TEST_RESULTS.json` (no spawn); `fr_coverage` recomputed on `tc verify` (FB-MULTI-0619 #2) — additive

When every `03_TEST_CASES.json` test case is `automation:"manual"` (no automated runner, by no_go_zone) — **root scope** — `verify-run` now writes `04_TEST_RESULTS.json` with all TCs `status:"manual"` without launching a runner (previously it could ENOENT and write nothing).

**Reader impact (all additive, no shape change):**
- An all-manual project's `04_TEST_RESULTS.json` now exists earlier (`summary.manual = N`, `passed/failed/skipped = 0`). For that seed, `test_runner` and `exit_code` are **`null`** (nothing ran) — readers already treating `test_runner` as optional (rc.86) handle this; `exit_code` may now be `null` as well as a number.
- A status next-action of `aitri tc verify` may appear for such a pipeline.
- `fr_coverage` is now **recomputed when `aitri tc verify` records a result**, not only at `verify-run` time — so after manual verification, `fr_coverage[].tests_passing`/`status` agree with `summary` (previously `summary` updated but `fr_coverage` stayed frozen at the verify-run snapshot). Readers cross-referencing the two no longer see a contradiction.

Automated projects and feature-scope pipelines are unaffected.

## v2.0.0-rc.94 (2026-06-19) — `verify-run` reads result files only from explicit `--results` (no auto-discovery) (FB-MULTI-0619 #1) — additive

Corrects the rc.85 behavior below. `verify-run` **no longer auto-discovers** TRX/JUnit-XML result files by walking the project tree — that could credit a TC PASS from a file the run never wrote (a committed fixture, or a stale result touched by `git checkout`/editor-save), a false PASS. The runner-result file path is now strictly explicit: `verify-run --results <file|dir>`. A `<dir>` resolves to the single newest file written by the run (mtime ≥ run start); stale siblings are excluded.

**Reader impact: none on artifact shape.** `04_TEST_RESULTS.json` is unchanged (the `evidence` field stays). This is a CLI-behavior correction, not a schema change. Marked additive because no artifact shape changed; flagged here because the rc.85 entry advertised auto-discovery as a capability and it is now gone.

## v2.0.0-rc.92 (2026-06-19) — `03_TEST_CASES.json#test_cases[].manual_reason` field (FB-MULTI-0619) — additive

New optional string field on a test case: `manual_reason` — why the TC can't be automated (set by `aitri tc mark-manual --reason`). Non-blocking, never validated by `complete 3`; the guided `aitri tc verify` checklist shows it and flags manual TCs that lack one, so a reviewer can tell a justified manual test from automation an agent quietly skipped. Old readers ignore it. (`automation` is also now documented in ARTIFACTS.md — it predates this entry.)

## v2.0.0-rc.86 (2026-06-19) — `04_BUILD_REPORT.json` test_runner/test_files optional in manual-verification mode (FB-MULTI-0619 T1.3) — additive

When every `03_TEST_CASES.json` test case is `automation: "manual"`, the project has no automated runner by design (its no_go_zone forbids a suite). `complete 4` now waives the previously-mandatory `test_runner` and `test_files` for that case only — matching the manual decision `complete 3` already accepts. With any automated test case present, both stay required exactly as before.

**Reader impact:** on a manual-mode build report, `test_runner` and `test_files` may be **absent**. A consumer that read `test_runner` as always-present must treat it as optional (guard before `.split()` etc.). No field changed type or was removed — a previously-required field became conditionally-optional, gated on an existing artifact's content. Marked additive because no automated-test project's output changes and the field semantics are unchanged when present.

## v2.0.0-rc.85 (2026-06-19) — `04_TEST_RESULTS.json#results[].evidence` field + TRX/JUnit-XML runner parsing (FB-MULTI-0619 T1.1) — additive

Two additive changes, both unblocking stacks whose test runners write results to a **file** rather than parseable stdout (the `.NET`/`dotnet test` blocker, also Java/Maven/Gradle, pytest `--junitxml`):

1. **`results[].evidence`** (optional string) — written by `aitri tc verify --evidence <path>`. Records an automated TC whose runner output Aitri could not parse, anchored to a real on-disk artifact instead of requiring it be pre-declared manual. Absent on auto-parsed results; old readers ignore it. Joins the existing `verified_manually`/`verified_at` (now documented).
2. **`verify-run` TRX / JUnit-XML parsing** — `verify-run --results <file|dir>` (and auto-discovery of fresh `*.trx` / `TEST-*.xml` / `junit*.xml` under the project dir — **auto-discovery removed in rc.94, see above**) reads structured per-test verdicts and merges them fill-only (live stdout parsers still win). No artifact-shape change; a stack that emits no such file is unaffected.

**No field type changed, nothing removed.** A consumer reading `04_TEST_RESULTS.json` sees one new optional field on result entries and otherwise-identical output. Hub needs no change.

## v2.0.0-rc.84 (2026-06-13) — `health.staleVerify` excludes terminal+clean pipelines (STALE-VERIFY-1) — additive

`health.staleVerify` in `status --json` now reports a pipeline as stale only when its `verifyRanAt` is older than 14 days **AND** the pipeline is still in flux — that is, NOT (all core phases approved AND verify passed AND no drift). Previously the calendar alone decided staleness, so a finished feature (or a shipped root) re-appeared as "stale" every 14 days forever and the project never reached idle.

**Field shape is unchanged** (`[ { "scope", "days" } ]`); only the membership rule narrowed — a terminal-and-clean pipeline that used to appear no longer does. This is the field doing what its name always implied (genuinely-stale evidence), so it is treated as additive: a consumer that surfaced these entries now surfaces fewer false positives; nothing previously valid breaks. Drift remains reported via `health.driftPresent` and is the real "evidence is outdated" signal. The same rule governs the priority-7 `verify-run` next-action in the snapshot ladder, so Hub-style consumers reading either surface stay consistent.

Trade-off: the calendar no longer catches the narrow case where code OUTSIDE a finished pipeline's tracked artifacts changed and silently broke its tests without tripping drift. That case is still caught by the root pipeline's own verify (it runs the whole project suite) and by any actual artifact drift; a calendar nag that the operator dismisses provided no real protection against it.

## v2.0.0-rc.83 doc-audit (2026-06-12) — documentation corrections, no contract change — additive

A line-by-line audit of these five documents against the code. No schema or behavior changed in this entry — these are corrections where the documents had drifted from long-shipped behavior:

- **ARTIFACTS.md:** seed lifecycle wording updated to rc.80 reality (the seed is MOVED to `archive/` at approve 1, never deleted — the doc still described the pre-rc.80 deletion); seed read path is layout-aware (`<layoutRoot>/product/IDEA.md`, not "project root"); Phase-1 floor documents the feature-scope minimum (2 FR / 1 NFR vs root's 5/3); `04_TEST_RESULTS.json#summary` example now includes `manual_verified` and is declared the canonical shape.
- **SCHEMA.md:** `verifySummary` documented as the full persisted `summary` object (it was under-documented as 4 fields); the ADR-045 split table now lists ALL shared fields (`upgradeFindings`, `strictAssertions`, `humanApprovalGate`, `reviewGate` were missing) and states the deny-list rule (new fields are shared by default).
- **STATUS_JSON.md:** priority ladder completed — priority 3 also fires for unresolved upgrade findings; priority 7 also fires for per-pipeline stale-verify refreshes; `verifySummary` references the canonical ARTIFACTS.md shape.
- **README.md:** feature-pipelines path is layout-aware; the audit row names the coverage/security sections; the maintenance rule credits `test/release-sync.test.js` for what it actually enforces.

Readers that implemented against the previous text: the only semantic surprises were under-documentation (more fields/triggers exist than documented) — nothing previously documented was removed or changed shape.

## v2.0.0-rc.83 (2026-06-12) — `aitri audit security` + `securityAuditLastAt` ([ADR-051](../DECISIONS.md)) — additive

- New `.aitri` shared field `securityAuditLastAt` (ISO 8601, default absent) — timestamp of the last `aitri audit security` invocation. Optional; old readers unaffected. Documented in SCHEMA.md.
- `AUDIT_REPORT.md` gains an optional "### Security" section (RQ-SEC remediation requirements + a proposed quality_gate verification script). Documented in ARTIFACTS.md.
- **Security-gap signal for subproducts (Hub):** Aitri emits the raw signals only — `securityAuditLastAt` (.aitri) + security NFRs (01_REQUIREMENTS.json) + the "### Security" heading (AUDIT_REPORT.md). Composing the operator-facing nudge ("security NFRs declared but never audited / audit stale") is the subproduct's job, consistent with the passive-producer model. Aitri's own `resume` shows the equivalent nudge CLI-side.
- No changes to `status --json`.

## v2.0.0-rc.82 (2026-06-12) — BUGS.json `files_changed` filter widened (adversarial-review hardening) — additive

- The `files_changed` field of a closed bug (BUGS.json) now excludes more Aitri-owned paths: in addition to the artifacts dir and `.aitri`, it now also excludes the contained-layout container, `node_modules/`, and feature sub-pipeline artifacts (it routes through the shared `isAitriStatePath`). Consumers that read `files_changed` as "the source files a bug's fix touched" get a cleaner list; no field shape change. Documented in ARTIFACTS.md.
- No schema-shape changes in rc.81/rc.82 — both were behavior/robustness fixes on the rc.78 migration and rc.80 seed lifecycle (the `archive/` move on the upgrade path, layout-aware orphan-seed absorption, feature-scope ref classification). The `archive/` folder and `layout_migrated` event introduced rc.78–80 remain as documented.

## v2.0.0-rc.80 (2026-06-12) — seed briefs archived (not deleted) at approve 1; feature seeds read directly ([ADR-050](../DECISIONS.md)) — additive

- At approve of Phase 1, the seed file now MOVES to `archive/` inside its unit instead of being deleted. `01_REQUIREMENTS.json#original_brief` is written exactly as before — readers of that field are unaffected. Readers that inferred pipeline state from the seed file's ABSENCE should rely on `original_brief`/approvedPhases instead (the documented signals).
- Features no longer get a materialized `IDEA.md` copy; their seed is `FEATURE_IDEA.md` end-to-end.
- New conventional folder `archive/` may appear inside units (and at the root of flat legacy projects post-approve). Historical record — consumers should ignore it.

## v2.0.0-rc.78 (2026-06-11) — flat→contained migration (`adopt --upgrade --layout`) + adopt produces the contained layout — additive

- **`aitri adopt --upgrade --layout`** — opt-in migration of a legacy flat project to the contained layout. After it runs, the project's `.aitri` carries `layoutRoot: "aitri"` and `artifactsDir: "aitri/product/spec"`, and every Aitri-owned path moves under `aitri/` (features wholesale; feature configs unchanged). Readers that follow the rc.76 rules (build paths from `artifactsDir`/`layoutRoot`, never hardcode) need no change. A `layout_migrated` event is appended to `events[]` (new event type — additive; readers must tolerate unknown event types, per the existing events contract).
- **`adopt apply` / `adopt apply --from` now create contained projects** (`layoutRoot: "aitri"`, `artifactsDir: "aitri/product/spec"`) — previously `"spec"`. The legacy guard is unchanged: projects with artifacts at the root are routed to `--upgrade` and keep `""`.

## v2.0.0-rc.76 (2026-06-11) — contained project layout (LAYOUT-1): new `.aitri#layoutRoot` field, new default `artifactsDir` value ([ADR-049](../DECISIONS.md)) — additive

New projects created by `aitri init` group everything Aitri-owned under one container:
`aitri/product/{IDEA.md, idea_context/, spec/}` + `aitri/BACKLOG.md` + `aitri/features/<name>/`.
`.aitri` stays at the project root. Existing projects keep their flat layout untouched.

- **`.aitri#layoutRoot`** (shared, committed; default `""` = flat) — `"aitri"` for contained projects. Old readers that ignore it keep working **as long as they build paths from `artifactsDir`** (next bullet) and from the `path` fields in `status --json`.
- **`artifactsDir` new value** — `"aitri/product/spec"` for contained projects. No type or semantic change: the documented formula `path.join(projectDir, artifactsDir, file)` is unchanged. **Action for readers that hardcoded `"spec"` or default a missing `artifactsDir` to `"spec"`:** read the field, and default a MISSING field to `""` (the documented default) — a `"spec"` fallback silently misreads both adopted (`""`) and contained (`"aitri/product/spec"`) projects.
- **Feature discovery** — features live at `<layoutRoot>/features/<name>/`. Feature configs are unchanged (`artifactsDir: "spec"`, feature-relative; never carry `layoutRoot`).
- **`status --json` / `validate --json` are unchanged** — their payloads already carry absolute `path`/`dir` fields, which remain the right way to locate things. `layoutRoot` is read from `.aitri` directly when a consumer needs to construct non-artifact paths.
- `IDEA.md`, `idea_context/`, `BACKLOG.md` locations for contained projects: under the container as above. Readers that reference them should resolve via `layoutRoot` (`<layoutRoot>/product/IDEA.md` etc.).
- `aitri adopt` still produces the flat layout in rc.76 (it operates on existing codebases); it moves to the contained layout together with the opt-in legacy migration in a later rc.

## v2.0.0-rc.75 (2026-06-10) — new `.aitri#coverageAuditLastAt` field + `audit coverage` sub-command + AUDIT_REPORT "Requirements Coverage" section ([ADR-048](../DECISIONS.md)) — additive

- **`.aitri#coverageAuditLastAt`** (shared, committed) — ISO timestamp of the last `aitri audit coverage` run. Old readers ignore it; it only drives the `resume` coverage nudge. Hub-safe.
- **`aitri audit coverage`** — a new audit sub-command: an independent idea→FR completeness audit (does every client request map to an FR?). Off-pipeline, advisory; does not gate.
- **`AUDIT_REPORT.md`** may now carry a `### Requirements Coverage` section (appended by `audit coverage`) alongside the existing Bugs/Backlog/Observations. Readers that key on the existing headings are unaffected.

## v2.0.0-rc.64 (2026-06-06) — new `.aitri#frSnapshots` field (TPA-11) — additive

New optional shared field `frSnapshots: object<string, array<string>> | null` in `.aitri`. Keyed by phase (as string), each value is the `functional_requirements[].id` set the phase was approved against. Written on `approve` of a downstream phase; read by `run-phase` to show the FR delta (added/removed) when re-deriving a phase a cascade reset.

**Contract impact for subproducts:** **additive** — old readers that do not know the field keep working. It is committed shared state (a teammate re-deriving sees the same delta), but it is purely advisory input to the briefing — no gate or `status --json` field depends on it. No reader must change.

## v2.0.0-rc.60 (2026-06-06) — new `.aitri.local#sessionContext` field (TPA-5) — additive

New optional per-machine field `sessionContext: { text: string, at: "ISO" } | null` in `.aitri.local`. It holds the durable narrative thread (the "what/why/next") written via `aitri checkpoint --context`, which now **survives later state transitions** — previously the narrative lived only in `lastSession.context`, which every state-mutating command overwrites. `aitri resume` shows it and flags staleness (a later action) or absence (on an in-flight pipeline).

**Contract impact for subproducts:** **additive** — and per-machine: like `lastSession` and `reconcileState`, `sessionContext` lives in the gitignored `.aitri.local`, which subproducts must NOT read. Cross-dev action traceability remains in the committed `events[]`. No reader must change.

## v2.0.0-rc.56 (2026-06-05) — new `.aitri#cascadedPhases` field (C5b) — additive

New optional `.aitri` field `cascadedPhases: array<string>` — the phases reset by a cascade invalidation (a real upstream re-approval/re-complete). Aitri's next-action builder reads it to recommend `run-phase` (re-derive) instead of `complete` (re-validate) for those phases, preventing a stale downstream artifact from being re-approved without reconciliation.

**Contract impact for subproducts:** **additive** — old readers that do not know the field keep working unchanged; it is written only after a cascade and pruned per-phase on `complete`/`approve`. `status --json` `phases[]` shape is unchanged (the field is internal to `.aitri`, not projected into the legacy phases array). No reader must change.

## v2.0.0-rc.49 (2026-06-04) — `ac_coverage` becomes a `verify-complete` gate (ADR-041 option A) — additive

`verify-complete` now **blocks** Phase 5 when `04_TEST_RESULTS.json#ac_coverage` contains any criterion with status `untested` or `uncovered` (rc.48 only reported them). Active only when the project declares structured acceptance criteria — declaring them is the opt-in; string-AC and legacy projects write no `ac_coverage` and are unaffected.

**Contract impact for subproducts:** **additive** — the `ac_coverage` field shape is unchanged; no subproduct reader is affected. This is a gate between Aitri and the operator (CLI behavior), not a schema change. Subproducts that surface `ac_coverage` continue to read it as before.

## v2.0.0-rc.51 (2026-06-04) — `.aitri` split: shared `.aitri` + per-machine `.aitri.local` (ADR-045) — breaking

`.aitri` state is split (ADR-045). The shared file **`.aitri` keeps the same path and the same shared fields** Hub reads (`updatedAt`, `approvedPhases`, `completedPhases`, `rejections`, `artifactHashes`, `events[]`, verify state, `aitriVersion`, …) and is now meant to be **committed**. Two per-machine fields move OUT of `.aitri` into a new gitignored sibling **`.aitri.local`**: `lastSession` and `reconcileState`. `aitri init` / `aitri adopt --upgrade` add `.aitri.local` (+ `.aitri.lock`) to `.gitignore` and remove a legacy bare-`.aitri` ignore so the shared file is tracked.

**Contract impact for subproducts:** **breaking** for any reader of `lastSession` / `reconcileState` from `.aitri` — those fields are no longer there; read `.aitri.local` if you truly need them (you almost certainly should not — they are per-machine). Hub itself is **unaffected**: it reads `.aitri` at the same path for the same shared fields, and never read the two relocated fields. `status --json` is unchanged (`loadConfig` merges both files). Never read `.aitri.local` for shared state. A pre-existing `.aitri/` folder uses `.aitri/config.json` + `.aitri/local.json` (fallback). See SCHEMA.md §"Should `.aitri` be committed?".

## v2.0.0-rc.50 (2026-06-04) — `BACKLOG.json` items gain optional Entry-Standard detail fields — additive

`spec/BACKLOG.json` items may now carry four optional string fields — `files`, `behavior`, `decisions`, `acceptance` — set via `aitri backlog add --files/--behavior/--decisions/--acceptance` and shown by the new `aitri backlog show <id>`. They make a backlog item self-contained (implementable later without re-deriving context). The JSON structure is unchanged otherwise; the format stays JSON (a markdown switch was explicitly rejected — see design-notes Discarded).

Also a **documentation correction** (no data change): the `BACKLOG.json` schema in ARTIFACTS.md previously listed `fr`/`created_at`/`updated_at`; the code has always written `fr_id`/`createdAt`/`closedAt`. The doc now matches the code.

**Contract impact for subproducts:** **additive** — the new fields are optional and absent on items that did not set them; old readers ignore them. No existing field changed shape. A subproduct that read the doc's old `fr`/`created_at`/`updated_at` names should read `fr_id`/`createdAt`/`closedAt` (the actual written keys, unchanged since the command shipped).

## v2.0.0-rc.48 (2026-06-04) — `ac_coverage` field on `04_TEST_RESULTS.json` (ADR-041 option A) — additive

New optional array `ac_coverage` on `04_TEST_RESULTS.json` — per-acceptance-criterion coverage, the finer-grained companion to `fr_coverage`. Present **only** when `01_REQUIREMENTS.json` declares structured acceptance criteria (`user_stories[].acceptance_criteria` as `{ id, text }`); absent for string-AC and legacy projects. Each entry: `{ ac_id, fr_id, tests_passing, tests_failing, tests_skipped, tests_manual, status }`, where `status` is `covered | partial | uncovered | manual | untested` — `untested` (new value, AC-coverage only) means no test references that criterion via `ac_id` at all. `verify-run` lists `untested`/`uncovered` criteria in its output; it is reporting, not a blocking gate.

Also additive on `01_REQUIREMENTS.json`: when structured ACs are present, their `id`s must be non-empty and unique across `user_stories` (the join key `ac_id`/`ac_coverage` rely on) — enforced by `complete 1` only when structured ACs exist.

**Contract impact for subproducts:** **additive** — old readers ignore `ac_coverage`; no existing field changed. `fr_coverage` is untouched. Present only when a project opts into structured acceptance criteria.

## v2.0.0-rc.45 (2026-06-03) — `idea_provenance_sources` field on `01_REQUIREMENTS.json` (ADR-043) — additive

New optional object `idea_provenance_sources` on `01_REQUIREMENTS.json` — per-field source of each Tier-A seed input (same keys as `idea_provenance`), each a short string of where the value came from (`"IDEA.md"`, `"user confirmed"`, `"inferred …"`). Surfaced at approve so a weak source stands out next to a strong one; `complete 1` warns (does not block) when a `"confirmed"` field has no source.

**Contract impact for subproducts:** **additive** — old readers ignore the field; no existing field changed. Optional, present only when Phase 1 records it.

## v2.0.0-rc.41 (2026-06-03) — artifact renames: `04_BUILD_REPORT`, `05_TRACEABILITY` (ADR-042) — breaking

Two pipeline artifacts are renamed (the Aitri-specific names that read as "invented"; no industry equivalent exists for them):
- `04_IMPLEMENTATION_MANIFEST.json` → `04_BUILD_REPORT.json` (Phase 4 output)
- `05_PROOF_OF_COMPLIANCE.json` → `05_TRACEABILITY.json` (Phase 5 output)

The `adopt --upgrade` migrator renames the file on disk; `.aitri#artifactHashes` is keyed by phase number (not filename), so approvals/state are preserved and content is unchanged.

**Contract impact for subproducts:** **breaking** — readers that open `04_IMPLEMENTATION_MANIFEST.json` or `05_PROOF_OF_COMPLIANCE.json` by name must switch to `04_BUILD_REPORT.json` / `05_TRACEABILITY.json`. The schema/content of each artifact is unchanged — only the filename. Always resolve artifact paths via `artifactsDir` + the documented names in ARTIFACTS.md (which now show the new names). Pre-release-major bump covers it; Hub adapts.

## v2.0.0-rc.40 (2026-06-03) — `normalize` command renamed to `reconcile` (ADR-042) — breaking

The off-pipeline-change command `aitri normalize` is renamed `aitri reconcile` (the old name communicated nothing about what it does). Clean rename, no alias. Surfaces that change for subproducts reading `status --json` and `.aitri`:
- `status --json`: the `normalize` object → `reconcile`; deploy-gate reason `normalize_pending` → `reconcile_pending`; the next-action command string `aitri normalize` → `aitri reconcile`.
- `.aitri`: the state field `normalizeState` → `reconcileState` (same schema). The `adopt --upgrade` migrator renames it in place, **preserving the original baseline** (baseRef/method) — no re-stamp, no progress lost.
- `lib/normalize-patterns.js` → `lib/reconcile-patterns.js` (internal SSoT reference in STATUS_JSON.md updated).

**Contract impact for subproducts:** **breaking** — a reader keying on `status.normalize`, the `normalize_pending` reason, or `.aitri#normalizeState` must switch to the `reconcile*` names. No semantics changed, only the names. Pre-release-major bump covers it; Hub adapts to the renamed fields.

## v2.0.0-rc.36 (2026-06-02) — `03_TEST_CASES.json` `ac_id` is now conditional, not always-required (ADR-041) — breaking

- **`ac_id` on test cases is no longer unconditionally required.** `aitri complete 3` now requires `ac_id` **only when** `01_REQUIREMENTS.json` provides structured acceptance criteria (`user_stories[].acceptance_criteria` as `{ id, ... }` objects). When ACs are plain strings (no ids — the common case, since Phase 1 never enforced structured ACs), `ac_id` is **optional**; any values present are not validated (informational note). Traceability still holds via `requirement_id` + `user_story_id`, both always required.
- **Why:** `ac_id` was the demand-half of a never-completed traceability chain (Phase 1 was meant to emit AC ids but emits plain strings, and no consumer reads `ac_id` — `verify-run`/`05_PROOF_OF_COMPLIANCE` key on FR/NFR ids). Requiring a join-key with no target blocked a real third-party adopter mid-Phase-3. ADR-041 option B.

**Contract impact for subproducts:** marked **breaking** conservatively — a TC that always carried `ac_id` may now omit it (when Phase 1 ACs are unstructured). In practice no current consumer reads `ac_id` (verified across `verify-run`, `phase5`, snapshot), so readers keying on `requirement_id`/`frs` are unaffected. A reader that assumed `ac_id` is always present must treat it as optional. Pre-release-major bump covers it.

## v2.0.0-rc.27 (2026-05-31) — pipeline audit Tier 2: MUST-coverage includes NFRs + gate-correctness fixes — additive

- **MUST-coverage now spans NFRs.** `complete 3` (every MUST requirement needs a TC) and `complete 5` (every MUST requirement needs a compliance entry) now include `non_functional_requirements` with `priority: "MUST"`, not only FRs. A MUST security/CI-CD NFR could previously ship untested/unattested. Fresh-validation only.
- Gate-correctness tightenings (no schema-shape change): anchored heading matching in discovery/ux (a substring no longer satisfies a section), provenance gap must START with the field key, expanded GENERIC technical_debt rejection, and `Performance & Scalability` now also accepts the `and`/`/` connector (was a false-reject).

**Contract impact for subproducts:** additive/correctness — no field shape changed. The MUST-coverage rule is stricter (catches MUST NFRs), conformant artifacts unaffected. Fresh-validation only — existing approved projects unaffected until they re-run the phase.

## v2.0.0-rc.32 (2026-05-31) — industry-terminology map in ARTIFACTS.md — additive

Doc-only: ARTIFACTS.md gains an industry-terminology map (IDEA ≈ brief, 01_REQUIREMENTS ≈ PRD/SRS, 02_SYSTEM_DESIGN ≈ TRD/SDD, …). Artifact file names are unchanged (public contract) — this only adds recognizable aliases for human readers. No schema/field change.

## v2.0.0-rc.26 (2026-05-31) — pipeline audit Tier 1: FR/NFR id enforcement + phase3 accepts `frs` — additive

Two artifact-validation changes from the full phase-by-phase audit:
- `aitri complete 1` now requires every `functional_requirements[]` and `non_functional_requirements[]` entry to have a non-empty, list-unique `id`. The id is the cross-phase join key; a missing id collapsed to `undefined` downstream and a duplicate masked one requirement's coverage. Conformant artifacts (all real ones carry ids) are unaffected.
- `aitri complete 3` now ACCEPTS a TC that targets requirements via `frs: [...]` instead of `requirement_id` (and buckets it per-FR for coverage). Previously it rejected any TC without `requirement_id`, making the `frs` form that `verify-run` prefers and ARTIFACTS.md documents uncompletable. The two now agree on multi-FR coverage.

**Contract impact for subproducts:** additive/correctness — no field shape changed. A reader of `01_REQUIREMENTS.json` can now rely on FR/NFR ids being present and unique (they always should have been). The `frs` form is now valid end-to-end. Fresh-validation only — existing approved projects are unaffected until they re-run the phase.

## v2.0.0-rc.25 (2026-05-30) — `.aitri#lastVerifyRun` — additive

New optional `.aitri` field `lastVerifyRun: { passed, failed, skipped, manual, at }`, written by `verify-run` on EVERY run regardless of pass/fail. It persists the raw last-run counts so derived signals (the no-op-loop guard) survive event-log eviction (the `events[]` log is capped at 20). Distinct from `verifySummary`, which is only written on `verify-complete` success — read `lastVerifyRun` for "what did the last run produce", `verifySummary` for "what passed the gate".

**Contract impact for subproducts:** additive — old readers ignore it. Also: `aitri approve <phase>` now clears `rejections[<phase>]` (an addressed rejection no longer lingers in status/resume); a consumer that read `rejections` as permanent history sees a resolved entry disappear on re-approval (it always represented "the last *open* rejection", so this is a correctness alignment, not a new field shape).

## v2.0.0-rc.23 (2026-05-30) — opt-in `reviewGate` (.aitri) — additive

New optional `.aitri` boolean `reviewGate` (default `false`/absent). When `true`, a `FAIL` verdict in `04_CODE_REVIEW.md` blocks `aitri verify-complete`. Default behavior is unchanged — the code-review verdict stays advisory (ADR-034 P1). `CONDITIONAL_PASS`/`PASS` and an absent review never block. Per ADR-038.

**Contract impact for subproducts:** additive — a new opt-in config field old readers ignore. No existing field/behavior changed unless a project sets `reviewGate: true`.

## v2.0.0-rc.22 (2026-05-30) — coverage as a declared quality_gate — additive

`quality_gates` now accepts a **coverage gate**: `{ name?, threshold, required? }` — a numeric `threshold` (0–100) instead of a `command`. `verify-run` measures line coverage (same stack-aware mechanism as the `--coverage-threshold` flag) and the gate passes when `measured ≥ threshold`, `error` when coverage could not be measured. Its result `{ name, threshold, measured, required, status }` joins `04_TEST_RESULTS.json#quality_gates` and gates like any other (required-fail resets `verifyPassed` + blocks `verify-complete`). The `--coverage-threshold` flag still works as an ad-hoc override; the declared gate is the durable, pipeline-gating form.

**Contract impact for subproducts:** additive — a new entry shape in `quality_gates` (coverage entries carry `threshold`/`measured` instead of `command`/`exit_code`). Old readers ignore it; readers that surface gate status can treat both shapes uniformly via `name`/`required`/`status`.

## v2.0.0-rc.21 (2026-05-30) — code-quality gates (manifest `quality_gates` + results `quality_gates`) — additive

Two additive fields wire the project's code-quality toolchain into the verification spine:

- `04_IMPLEMENTATION_MANIFEST.json#quality_gates` (optional) — `[{ name?, command, required? }]`. The project declares its own lint/type-check/security commands.
- `04_TEST_RESULTS.json#quality_gates` (present only when declared) — `[{ name, command, required, status: "pass"|"fail"|"error", exit_code, output? }]`. Written by `verify-run`.

`verify-run` runs each gate (stack-agnostic, exit-code judged; Aitri bundles no analyzers) and a failing `required` gate resets `verifyPassed` and blocks `verify-complete` — same gating mechanism as a failing test. `required` defaults to `true`; `required: false` is advisory (surfaced, never blocks). Per ADR-037.

**Contract impact for subproducts:** purely additive — old readers ignore both fields. A consumer that wants to surface code-quality status can read `04_TEST_RESULTS.json#quality_gates`. No existing field changed. (Note: `verifyPassed` semantics are unchanged in shape — still boolean — but it now also reflects required-gate outcomes, so a project can be `verifyPassed: false` with all tests green if a required gate failed; this is the intended deploy-gate behavior.)

## v2.0.0-rc.20 (2026-05-30) — 04_TEST_RESULTS.json `summary.manual` is now status-based — breaking

`summary.manual` (in `04_TEST_RESULTS.json`, also surfaced in `.aitri#verifySummary`) changed from a **declared-manual** count (`# of TCs with automation: "manual"`) to a **status-based** count (`# of results whose status === "manual"`). Why: passed/failed/skipped were already status-based, so a manual TC that a human later verified via `aitri tc verify` (status becomes `pass`/`fail`) was counted in BOTH `manual` and `passed` — the buckets did not sum to `total`. Now `passed + failed + skipped + manual === total`, and `manual_verified` still reports how many manual TCs were human-verified.

**Contract impact for subproducts:** a consumer that read `summary.manual` as "how many TCs are declared manual" now gets "how many are still awaiting manual verification" — they differ once any manual TC is verified. Field shape unchanged (still an integer). Marked `— breaking` conservatively (existing-field semantic change), though the practical effect is a correctness fix: the buckets now reconcile. To recover the old number, count `results[]` where `status === "manual"` plus those carrying `verified_manually: true`.

## v2.0.0-rc.17 (2026-05-30) — status --json honors the documented health contract — additive

`aitri status --json` now emits `health.driftPresent` and `health.staleVerify` — two fields STATUS_JSON.md has documented as part of the `health` block since v0.1.77 but the payload never actually output (a consumer reading them got `undefined`). The data was already computed by `computeHealth`; this only adds it to the projection. `driftPresent` is `[{ scope, phase }]` (per-scope drift across root + features — richer than the root-only top-level `driftPhases`); `staleVerify` is `[{ scope, days }]` (pipelines whose `verifyRanAt` is older than 14 days). Found by a contract-vs-code audit (rc.17).

**Contract impact for subproducts:** none for existing readers (additive — new fields on an existing object). A consumer that coded against the documented `health.driftPresent`/`staleVerify` and defensively handled `undefined` now receives real arrays. Also doc-only: SCHEMA.md's per-machine-state note referenced a non-existent `lastSession.when` — corrected to `lastSession.at` (the field has always been `at`).

## v2.0.0-rc.16 (2026-05-29) — canonical TC-id gate in Phase 3 — additive

No schema field added or changed. `aitri complete 3` gains a validation rule: every `test_cases[].id` must be canonical (`TC` + optional UPPERCASE namespace + numeric block + suffix, e.g. `TC-001h`, `TC-E2E-001h`). Ids without a numeric block (`TC-e2eFolderScan`) or with a lowercase namespace (`TC-fe-001h`) are rejected. The grammar is shared with the `verify-run` output parser (`lib/tc-id.js`) so the gate and the linker cannot drift. Documented in ARTIFACTS.md.

**Contract impact for subproducts:** none — no field read changes; canonical ids are a subset of what the field already held. Marked `— additive`. Note that `complete 3` can now newly block a test plan whose ids `verify-run` could not have linked (they would have silently dropped to `skip`). Surfaced by the Hub `hub-folder-scan` feature, whose `TC-e2eFolderScan`/`TC-e2eFolderEmpty` ids slipped past Phase 3 and then could not be matched to runner output. **Existing approved projects are unaffected** until they re-run Phase 3.

## v2.0.0-rc.13 (2026-05-25) — Phase 5 claim-vs-evidence validation — additive

No schema field added or changed. `aitri complete 5` gains a validation rule: a `requirement_compliance` entry with `level` `complete` or `production_ready` must have `04_TEST_RESULTS.json#fr_coverage` status `covered` (or `manual`) for that FR. Documented in ARTIFACTS.md.

**Contract impact for subproducts:** none — no field read changes. Marked `— additive` (no field/event shape change); note that `complete 5` can now newly block a proof that over-claims a compliance level past its test evidence (a defect it previously let through). A subproduct that re-derived compliance honesty itself can now trust the level reflects coverage.

## v2.0.0-rc.12 (2026-05-25) — opt-in human approval gate — additive

- **`.aitri#humanApprovalGate`** (`boolean`, optional, default absent/false): when `true`, `aitri approve <phase>` in non-interactive (agent) mode blocks and requires a human to run it after review. Default unchanged — agent-mode approval proceeds. Independent of this flag, `approve` now always prints the artifact summary + the phase's Human Review checklist (previously silent in agent mode) — stdout only, no schema impact.

**Contract impact for subproducts:** none required. New optional config field; a reader that surfaces project policy can show whether the human gate is enabled.

## v2.0.0-rc.9 (2026-05-25) — verification spine: stack-agnostic coverage + assertion-density gate — additive

Two new optional fields on `04_TEST_RESULTS.json` and one new optional `.aitri` config field. All additive — old readers keep working.

- **`04_TEST_RESULTS.json#line_coverage`** (`number`, optional): measured line-coverage %, present only when `verify-run --coverage-threshold` ran against a recognized runner (node `--coverage`, `go test -cover`, `pytest --cov`, `jest`/`vitest --coverage`). Previously coverage instrumentation worked for the node built-in runner only; rc.9 makes it stack-agnostic and persists the figure.
- **`04_TEST_RESULTS.json#low_confidence_tcs`** (`array<{tc_id,file,assertCount}>`): TCs with ≤1 assertion in their block. Always present (possibly `[]`).
- **`.aitri#strictAssertions`** (`boolean`, optional, default absent/false): opt-in. When `true`, `verify-complete` BLOCKS on non-empty `low_confidence_tcs`. Default behavior is unchanged (warning only).

**Contract impact for subproducts:** none required. New fields are optional reads. A reader that surfaces test quality can now show `line_coverage` and a low-confidence-TC count when present; absence is the legacy/default case.

## v2.0.0-rc.7 (2026-05-22) — `nextActions[].command` for pending normalize points to `--resolve` — additive

**Value change, not a schema change.** No field added, removed, or retyped. When `reconcileState.status === 'pending'`, the `status --json` `nextActions[]` entry at priority 4 now carries `command: "aitri normalize --resolve"` (was `"aitri normalize"`); its `reason` changed accordingly. The freshly-detected state (`status='resolved'` + `uncountedFiles>0`) still carries `command: "aitri normalize"`.

**Contract impact for subproducts:** none required. `nextActions[].command` is an opaque suggestion string with no parsing contract — readers render it verbatim. Marked `— additive`: a reader that keyed terminal/idle state off the old `"aitri normalize"` string in the pending case was tracking a command that could never resolve the condition; the corrected string is the one that actually advances the baseline. No reader needs to change.

## v2.0.0-rc.6 (2026-05-22) — `status --json` `uncountedFiles` excludes feature sub-pipeline artifacts — additive

**Value correction, not a schema change.** No field added, removed, or retyped. `health`/`normalize.uncountedFiles` (and the `status --json` `normalize.uncountedFiles`) stops counting `features/<name>/spec/` and `features/<name>/.aitri` changes as parent off-pipeline drift, matching what `aitri normalize` already excluded since rc.3.

**Contract impact for subproducts:** none required. For projects with feature pipelines the count may **decrease** (false positives removed); the type and meaning are unchanged ("number of off-pipeline behavioral files since the last build approval"). Subproducts that rendered the old over-count were showing drift the operator could never clear — the corrected value is the one `aitri normalize` always agreed with. Marked `— additive`: no reader needs to change, and any reader keying terminal/deployable state off `uncountedFiles === 0` now resolves correctly instead of looping.

## v2.0.0-rc.4 (2026-05-21) — seed-input provenance fields on `01_REQUIREMENTS.json` — additive

Two optional fields added to `01_REQUIREMENTS.json` to make the highest-value human input (the Tier-A seed inputs) auditable instead of silently inferred:

- `idea_provenance` — object keyed by `problem`, `users`, `baseline`, `success_metric`, `no_go_zone`; each value `"confirmed"` or `"assumed"`.
- `idea_gaps` — `string[]` of tracked gaps for assumed fields (also accepted nested as `project_summary.idea_gaps`).

**Contract impact for subproducts:** none required. Both fields are additive and optional — old readers ignore them safely. No existing field changed shape; no field removed.

**Producer-side gate (does not affect readers).** `aitri complete 1` now blocks on a *fresh seed* (Phase 1 not yet in `approvedPhases[]`) when `idea_provenance` is missing/invalid or an `"assumed"` field is not carried in `idea_gaps`. Once Phase 1 is approved the seed is sealed and the gate is skipped — existing approved projects never break on upgrade, and no migration is required. Subproducts that want to surface seed-input confidence MAY read `idea_provenance` and render confirmed/assumed counts; this is an opt-in.

## v2.0.0-rc.3 (2026-05-12) — F11 refinement: stale-verify emits `verify-run` per pipeline (not `validate`) — additive

**Behavioral change in the `nextActions` ladder when a project is `deployable` and at least one pipeline has `verifyRanAt` older than 14 days.** No schema field changed. No field removed. Only the **command string** emitted for the P7 entry changes shape under one specific condition. Old readers continue to render whatever string is in `nextActions[*].command` — there is no parsing contract to break.

### What changed in the JSON contract

Before rc.3, when `health.deployable === true` and `health.staleVerify.length > 0`, the snapshot emitted exactly one P7 entry:

```jsonc
{ "priority": 7, "scope": "root", "command": "aitri validate", "reason": "All artifacts approved, verify passed — confirm deployment readiness", "severity": "info" }
```

From rc.3 onward, the same condition emits **one P7 entry per stale pipeline**, each carrying the command that actually resolves the staleness — `aitri verify-run` for the root pipeline, `aitri feature verify-run <name>` for each stale feature:

```jsonc
{ "priority": 7, "scope": "root",               "command": "aitri verify-run",                     "reason": "verify on root last ran 24 days ago — refresh before declaring idle", "severity": "info" },
{ "priority": 7, "scope": "feature:abc",        "command": "aitri feature verify-run abc",         "reason": "verify on feature:abc last ran 21 days ago — refresh before declaring idle", "severity": "info" }
```

When `auditFresh === false` (audit missing or stale), P7 keeps its legacy shape and emits a single `aitri validate` entry — that case is still the legitimate readiness checkpoint. The split is conditional on audit being fresh.

When `deployable === true && auditFresh === true && staleVerify.length === 0`, no P7 entry is emitted (terminal idle — same as rc.2).

### Why

Surfaced by Hub canary 2026-05-12. A deployable multi-feature project with feature `verifyRanAt` older than 14 days entered a stable loop: `aitri status` recommended `aitri validate`, the operator ran it, validate did not refresh `verifyRanAt`, and the next `status` re-emitted the same suggestion. The action recommended by the ladder did not resolve the condition that triggered it. The refinement closes the loop by emitting the command that does resolve it.

### Hub impact

Hub renders `nextActions[*].command` directly. The new shape is forward-compatible — Hub will simply render `verify-run` cards instead of a single `validate` card in the affected case. No code change required in Hub to render correctly. If Hub wants to differentiate "stale verify per pipeline" UX from "validate readiness checkpoint" UX, it can branch on the `command` value or on `reason.includes('refresh before declaring idle')`.

### Status display

`aitri status` (human text) also gains a new line, analogous to the existing `audit: stale (X days)` line:

```
verify:  stale on N pipeline(s) (oldest D days) — run: aitri verify-run
```

Not visible to subproducts (CLI stdout only).

### Also in rc.3 — `extractTCId` accepts alphanumeric namespace segments — additive

Surfaced by Hub canary 2026-05-13. The test-runner parser (`extractTCId`, shared by `parseRunnerOutput` / `parseVitestOutput` / `parsePytestOutput` / `parsePlaywrightOutput` / `parseGoOutput`) silently ignored TC IDs whose namespace contained digits — `TC-E2E-001h`, `TC-V1-010h`, `TC-S3-BUCKET-042e`. Affected TCs were written as `status: "skip"` in `04_TEST_RESULTS.json` even when the runner printed a passing line.

**Contract impact:** for projects using namespaces with embedded digits, `04_TEST_RESULTS.json#results[].status` will flip from `skip` to `pass` / `fail` after the rc.3 upgrade. `04_TEST_RESULTS.json#summary.{passed,failed,skipped}` shifts accordingly. `fr_coverage` may reclassify FRs from `uncovered` / `tests_failing` to `tests_passing`. No schema field changed.

**Hub impact:** none structural — Hub reads `04_TEST_RESULTS.json` shape unchanged. Counts may move on the affected projects.

### Also in rc.3 — `aitri normalize` excludes feature pipeline artifacts — additive

Surfaced by Hub canary 2026-05-13. `aitri normalize` was listing `features/<name>/spec/*` and `features/<name>/.aitri` as off-pipeline changes against the parent build baseline. Those paths are governed by the feature's own pipeline gate (not the parent's), and should be excluded symmetrically with root `spec/` + `.aitri`. Shared product code that a feature contributes outside its own directory (`lib/`, root `tests/`, etc.) stays in scope and still goes through the operator's `--resolve` TTY gate.

**Contract impact:** `.aitri#reconcileState.status` may flip from `pending` to `resolved` on the next `aitri normalize` for projects whose only off-pipeline delta was feature-scoped artifacts. The CLI briefing's file list shrinks accordingly. Otherwise unchanged.

**Hub impact:** none structural — `reconcileState` schema unchanged.

---

## v2.0.0-rc.2 (2026-05-12) — `bugs.bySeverity` + `bugs.openIds` in status JSON; validate text trim; templates/AGENTS.md rewrite — additive

**Three additive surfaces shipped together.** No schema field removed. No event-shape changed. Old readers see identical values where the contract previously promised them.

### `aitri status --json` bugs payload: per-severity breakdown + open IDs

The `bugs` object gains two new fields alongside the existing `total / open / blocking`:

```jsonc
"bugs": {
  "total":    N,                                                  // unchanged
  "open":     N,                                                  // unchanged
  "blocking": N,                                                  // unchanged
  "bySeverity": { "critical": N, "high": N, "medium": N, "low": N },  // new
  "openIds":    ["BG-001", "BG-003", ...]                              // new — sorted ascending
}
```

**Semantics:**
- `bySeverity` counts bugs in `open` OR `in_progress` status. `fixed`, `verified`, `closed` are excluded (mirrors the active-only semantics of `blocking`). Unknown severity values (anything outside `{critical, high, medium, low}`) are silently dropped from the breakdown.
- `openIds` lists the IDs of bugs counted in `bySeverity`. Sorted ascending for deterministic snapshot output (same project → same byte sequence on repeated runs, useful for cache hits).
- Bugs from feature sub-pipelines roll up into the project-wide breakdown (`bySeverity` and `openIds` are sums across root + all features). Per-pipeline counts remain in `byPipeline` (internal-only, not in `--json`).

**Hub impact:** closes the contract gap surfaced 2026-05-11 where Hub's `bugsSummary` showed `medium: 0, low: 0, openIds: []` for projects with mixed-severity bugs. Hub can now render per-severity warnings + clickable BG-ID links without re-parsing `spec/BUGS.json`. Old readers that don't reference `bySeverity` or `openIds` continue to read the same `total / open / blocking` values they always have.

### `aitri validate` text mode: operational deploy info behind `--explain`

Validate's default text mode trimmed from ~25-40 lines to ~12-18 lines:
- Deploy candidates listing (`Dockerfile`, `docker-compose.yml`, `DEPLOYMENT.md`, `.env.example`) — **moved behind `--explain`**.
- Setup commands listing (from `04_IMPLEMENTATION_MANIFEST.json::setup_commands`) — **moved behind `--explain`**.
- DEPLOYMENT.md path hint — **moved behind `--explain`**.
- Features section in default text — **hides when all features are all-green**; shows when any has rank-0 (failed verify) or rank-1 (incomplete). `--explain` always shows it.

**JSON shape UNTOUCHED.** `aitri validate --json` returns `{ allValid, artifacts[], deployFiles, setupCommands, deployable, deployableReasons[], openBugs, blockingBugs }` exactly as before. Hub readers consuming `--json` see no change. Regression-locked by new test asserting all eight fields present + correct types regardless of text-mode trim.

### `templates/AGENTS.md` rewrite

The template Aitri copies to every consumer project as `CLAUDE.md` / `GEMINI.md` / `.codex/instructions.md` / `AGENTS.md` was last touched at v0.1.61 (March 2026). It mentioned 5 commands out of ~21 currently in Aitri. Rewrite covers the rc.1+ command surface (`normalize`, `audit`, `rehash`, `bug`, `backlog`, `tc mark-manual`, optional phases, drift handling, version-mismatch flow) plus a three-tier change classification (trivial / small / feature) replacing the previous binary "minor vs functional" rule. Existing consumer projects keep their old agent file (the regeneration path in `lib/agent-files.js` is non-destructive); operators manually pull the rewrite by deleting their local file and re-running `aitri adopt --upgrade`. Producer-side freshness obligation now codified in CLAUDE.md "Critical rules".

**No artifact schema change. No event-stream change.** Readers that ignore the new bug fields continue to work unchanged. Readers that opt in to `bySeverity` + `openIds` gain the breakdown without any other reader-side adjustment.

---

## v2.0.0-rc.1 (2026-05-12) — feature-approve cascades root normalize baseline; ladder coherence with `normalize --resolve` gate — additive

> **Semver step note.** This release jumps past `alpha.28` directly to `rc.1` to signal end of alpha cycle. Stable v2.0.0 promotion is still gated on the third-party adopter rule (CLAUDE.md Critical rules); rc.1 means "stable in intent, awaiting external validation". Subproducts should treat rc.1 as the upgrade target for v2.0.0 readiness work, but stable consumers should keep waiting until v2.0.0 final.


**Two P1 fixes bundled from BACKLOG.md "Pre-promotion findings (Codex canary 2026-05-11)".** No schema change, no event-shape change, no new fields. Both changes correct the **behavior** of existing surfaces — the data subproducts receive becomes more accurate, never less.

### `.aitri.reconcileState.baseRef` update cadence (P1.A)

`aitri feature approve <name> 4` now also stamps the **root** project's `reconcileState.baseRef` at current git HEAD, in addition to the feature's own. Before this release, only the feature scope's reconcileState advanced — the root pipeline stayed frozen at the pre-feature SHA. On flat-codebase projects (Go monolith, Rust workspace, single-package Python) this caused root drift detection to flag every legitimately-approved feature-implementation file as "outside pipeline."

**Subproduct impact:** subproducts reading `.aitri.reconcileState` on the root pipeline (Hub dashboard, future readers) will see `status: 'resolved'` with the post-feature SHA after feature approvals, where they previously saw stale `'resolved'` from before the feature began OR `'pending'` after the operator ran `aitri normalize` to investigate the false positive. **No reader code change required** — the field shape is identical; only the value becomes correct sooner. Hub readers that previously suppressed or annotated these false positives will see fewer of them; readers that simply rendered the field value will render accurate state.

**No new events.** `appendEvent` is not called for the cross-scope advance — it is a derived bookkeeping operation, not a state-transition event. Subproducts that subscribe to `events[]` see no new entries.

### `nextActions[]` priority-4 normalize emission gated on `bugs.blocking === 0` (P1.B)

The next-actions ladder (consumed indirectly by subproducts via `aitri status --json` `nextActions[]`) no longer emits `aitri normalize` while any critical/high open or in_progress bug exists. The `aitri normalize --resolve` command has always refused to run under that condition (`lib/commands/normalize.js:148-157` gate); the ladder now respects the same gate so subproducts surfacing "next action" hints do not point operators at a command that will reject.

**Subproduct impact:** subproducts that render `nextActions[]` will see one fewer entry when both conditions hold (`normalize pending` AND `blocking bugs open`) — the blocking-bug action (priority 3) remains and is now correctly the topmost actionable. When bugs close, normalize re-emerges at priority 4 automatically. **No reader code change required.** Subproducts that gate UI on the EXISTENCE of a normalize action see the action absent during the blocked window — which is the correct semantic ("can't run normalize yet").

### What this is NOT

- Not a schema change. `.aitri` field shapes unchanged.
- Not an event-stream change. No new event types; no existing event shape modified.
- Not a `status --json` schema change. `bugs: { total, open, blocking }` shape unchanged. (Per-severity expansion for Hub remains an open P2 in BACKLOG — separate work.)

**Readers that ignore both changes continue to work unchanged.** Readers that surfaced false-positive normalize-pending on flat-codebase projects will display fewer false positives.

---

## v2.0.0-alpha.27 (2026-05-03) — `aitri approve 1` pre-flight scan (producer-side IDEA.md absorption gate) — additive

**`aitri approve 1` now scans downstream artifacts for IDEA.md references before executing the absorb + unlink** (additive — new event type `approve_preflight_autofix`, new error message surface; no schema field changed; no existing event-shape modified). Closes the producer-side gap of the alpha.17 → alpha.22 → alpha.24 → alpha.25 → alpha.26 → alpha.27 hotfix arc per [ADR-031 Addendum 2](../DECISIONS.md#addendum-2--2026-05-03-alpha27--producer-side-at-approve-time-pre-flight-scan).

**Behaviour change for subproducts: minimal.** No artifact field changed; no `.aitri` field added or removed; existing `upgrade_migration` event shape unchanged. New event type `approve_preflight_autofix` is additive — old readers ignore unknown event types per the existing reader-guidance contract (SCHEMA.md: "unknown event types MUST be tolerated").

**What changes for operators:**

- `aitri approve 1` (first-time approve only) now classifies downstream IDEA.md references using the alpha.25 schema-aware classifier:
  - **Auto-fixable** (manifest array elements `files_created[*]`, `files_modified[*]`, `test_files[*]` with value `"IDEA.md"` or `{path: "IDEA.md", ...}`) → mechanically dropped + `artifactHashes[<phase>]` re-stamped + `approve_preflight_autofix` event emitted.
  - **Narrative** (free-form JSON, project-extension shapes, Markdown bodies) → **BLOCKS the approve** with actionable error listing each reference by file + JSON-path. Operator edits refs and re-runs.
  - **Frozen** (`04_TEST_RESULTS.json`, `05_PROOF_OF_COMPLIANCE.json`) → silently skipped (immutable historical evidence by design; same rule as alpha.25 migrator).
- Re-approve of Phase 1 (`wasAlreadyApproved`) does NOT trigger the scan — the absorb has already happened or never will. No change to existing re-approve behavior.
- No escape flag (`--accept-stale-refs` etc.) — re-creating silent breakage is not allowed. Operator's only correct path on block is to edit refs.

**New event type — `approve_preflight_autofix`:**

```json
{
  "at": "2026-05-03T22:14:51.123Z",
  "event": "approve_preflight_autofix",
  "phase": null,
  "target": "spec/04_IMPLEMENTATION_MANIFEST.json",
  "transform": "drop 1 stale IDEA.md ref(s) from files_modified[0].path",
  "before_hash": "ae97a0eb...",
  "after_hash":  "923e43e6..."
}
```

| Field | Type | Always present | Description |
|---|---|---|---|
| `at` | `string` ISO 8601 | yes | When the auto-fix ran |
| `event` | `string` | yes | Literal `"approve_preflight_autofix"` |
| `phase` | `null` | yes | Auto-fix is independent of phase being approved (uses `null` to disambiguate from phase-bound events) |
| `target` | `string` | yes | Artifact path (relative to project root) where auto-fix applied |
| `transform` | `string` | yes | Human-readable summary listing the JSON-paths dropped |
| `before_hash` | `string` SHA-256 | yes | Hash of artifact before auto-fix |
| `after_hash` | `string` SHA-256 | yes | Hash of artifact after auto-fix |

**Why `— additive`:**

- No artifact schema field changed.
- No `.aitri` field added, removed, or renamed.
- New event type follows the existing additive-events contract — old readers tolerate unknown event types.
- New error surface (the block message) is human-facing CLI text — not a contract surface; subproducts must not parse it.
- Auto-fix mutations to manifest arrays are content-only (drop array elements); the array fields' shape is unchanged.

**Cross-references:**
- ADR-031 Addendum 2 — codifies the producer-side principle (this release).
- alpha.25 release notes — same classifier reused (`lib/upgrade/idea-ref-classifier.js`).
- alpha.26 release notes — phase 2 + phaseUX inputs hotfix; producer-side scan would have prevented this from being needed for new projects.

---

## v2.0.0-alpha.26 (2026-05-03) — phase 2 + phaseUX no longer require IDEA.md (absorbed-brief regression hotfix) — additive

**`aitri run-phase architecture` and `aitri run-phase ux` now succeed on projects whose IDEA.md was absorbed into `01_REQUIREMENTS.json#original_brief`** (additive — no schema change, no event-shape change, no `.aitri` field change). Closes the post-archive regression class established by ADR-031 addendum: every code path that previously assumed IDEA.md presence must be audited when the destructive op ships.

**Behaviour change for subproducts: none.** No artifact field changed; no `.aitri` field changed; no event-type changed; no CLI command added or renamed. The fix is internal to phase definition modules (`lib/phases/phase2.js` + `lib/phases/phaseUX.js`): both removed `'IDEA.md'` from their `inputs` arrays. `buildBriefing` already only consumes `01_REQUIREMENTS.json` (which carries `original_brief` since v0.1.89). The declaration was dead but `lib/commands/run-phase.js` enforces input presence at the gate level, hard-failing on the missing file even though the briefing did not consume it.

**Why `— additive` and not `— breaking`:**

- No artifact schema changed. Phase 2 still produces `02_SYSTEM_DESIGN.md` with the same required sections; phaseUX still produces `01_UX_SPEC.md` with the same required sections.
- No `.aitri` field added, removed, or renamed.
- No event-type added or modified.
- No CLI command added or renamed; no flag added or renamed.
- The only observable change is positive — a previously-failing scenario (`run-phase architecture` on absorbed-brief project) now succeeds. No prior valid scenario regresses.
- `templates/phases/phaseUX.md` updated narrative reference to point at `01_REQUIREMENTS.json#original_brief` instead of `IDEA.md` for design-token derivation context — text-only change to the briefing prompt; not a contract surface.

**Why a release.** Per CLAUDE.md "Purpose over process": Tier-1 hotfix justified by real consumer (Ultron) blocked. Same exception class that justified alpha.22 (validate.js absorbed-brief acceptance).

**Cross-references:**
- ADR-031 addendum (post-destructive on-disk audit protocol) — codifies the bidirectional obligation that producer-side ADR-031 was missing.
- alpha.22 release notes — first instance of this regression class (validate.js).
- alpha.25 release notes — second instance (the upgrade migration's pre-flight scan).

---

## v2.0.0-alpha.25 (2026-05-03) — orphan IDEA.md classified-ref handling — additive

**`aitri adopt --upgrade` now classifies stale IDEA.md references into three buckets and auto-fixes the structural ones in fields Aitri owns** (additive — no schema change, no event-shape change, finding text is CLI-only and not part of any subproduct contract). Refines alpha.24's all-or-nothing pre-flight scan into a schema-aware classifier per [ADR-031](../DECISIONS.md#adr-031--2026-05-03--destructive-migrations-structural-auto-fix-where-aitri-owns-the-schema-honor-system-elsewhere).

**No subproduct-visible contract change.** All effects are confined to the upgrade migration's behavior on `04_IMPLEMENTATION_MANIFEST.json` array elements (`files_created[*]`, `files_modified[*]`, `test_files[*]`) plus the `validatorGap` finding's `reason` text. Subproducts that read `.aitri.upgradeFindings[]` continue to receive the same shape (`{category, target, transform, reason, recordedAt}`) — only the `reason` text is more precise.

**What changes for upgrades from alpha.24:**

- Projects in **stale-ref state** (IDEA.md already absorbed pre-alpha.25) see a finding listing the **narrative** subset of references (free-form JSON values, project-extension fields, Markdown bodies). Frozen records (`04_TEST_RESULTS.json`, `05_PROOF_OF_COMPLIANCE.json`) are silently skipped — their content is auto-generated immutable evidence; modifying it falsifies history. **Effective change for Hub:** the upgradeFinding now lists 4 actionable artifacts (was 6 in alpha.24); the 2 frozen artifacts that were previously surfaced are correctly understood as out-of-scope.
- Projects in **pre-flight state** (IDEA.md present + Phase 1 approved + `original_brief` empty) get a richer migration: any `04_IMPLEMENTATION_MANIFEST.json` array element that exactly equals `"IDEA.md"` (string form) or has `.path === "IDEA.md"` (Hub's enriched object form, accepted by phase4.js since arrayness is the only shape constraint) is mechanically dropped. `artifactHashes['4']` is re-stamped if Phase 4 was approved. If after dropping, no `narrative` references remain, the absorb proceeds in the same upgrade run; otherwise the absorb is blocked until the operator resolves narrative references manually.

**Why `— additive` and not `— breaking`:**

- No artifact field shape changed. `04_IMPLEMENTATION_MANIFEST.json::files_modified[]` continues to be `string[]` OR `{path, ...}[]`; alpha.25 only drops elements that are `"IDEA.md"`/`{path: "IDEA.md"}` from such arrays.
- No `.aitri` field added, removed, or renamed. `upgradeFindings[]` shape unchanged.
- No event-type added; `upgrade_migration` event keeps the same payload (`from_version`, `to_version`, `category`, `target`, `transform`, `before_hash`, `after_hash`).
- `validatorGap` finding `target` value is `"IDEA.md"` (pre-flight) or `"IDEA.md (absorbed)"` (stale-ref) — same values alpha.24 used; only the `reason` text and the actionable file list count differ.
- `reason` text is human-facing and not a contract surface — no subproduct may parse it for state decisions.

**Cross-references:**
- ADR-031 — principle behind the three-bucket classification.
- alpha.24 release notes (predecessor) — alpha.24 introduced the regex pre-flight scan; alpha.25 schema-aware-refines it.
- alpha.22 — validate.js absorbed-brief acceptance; same incident class.

---

## v2.0.0-alpha.22 (2026-05-02) — validate accepts absorbed `original_brief` in lieu of IDEA.md — additive

**`aitri validate` no longer falsely flags `IDEA.md` as missing on projects where the alpha.17 orphan-IDEA migration absorbed it** (additive — no schema change, new optional `absorbed` flag on the IDEA.md artifact entry in `--json` output). Closes a contract gap shipped together in alpha.17 + alpha.21 and surfaced 2026-05-02 PM by `aitri validate` on Ultron post alpha.14 → alpha.21 upgrade.

**Behaviour change for subproducts consuming `aitri validate --json`.**

Old shape (file-presence gate, breaks on absorbed-brief projects):
```json
{ "name": "IDEA.md", "exists": false, "approved": false, "drift": false, "required": true }
```

New shape (absorption path):
```json
{ "name": "IDEA.md", "exists": false, "approved": true, "drift": false, "required": true, "absorbed": true }
```

New shape (file-on-disk path — unchanged from old when file is present):
```json
{ "name": "IDEA.md", "exists": true, "approved": true, "drift": false, "required": true }
```

Field semantics:
- `exists` stays literal — filesystem presence of `IDEA.md` at project root. Preserved for subproducts that interpret it as such.
- `approved` is now `true` when EITHER path satisfies (file on disk OR `01_REQUIREMENTS.json#original_brief` is a non-empty string). Subproducts that gate on `approved` get the correct answer for absorbed-brief projects without code changes.
- `absorbed` is a new optional field, present only when the absorption path was used. Old readers ignore it; new readers can render the absorption explicitly (e.g. "IDEA.md → 01_REQUIREMENTS.json#original_brief").

**Hub impact:** none required. Hub readers that gate validate on `approved` start passing for absorbed-brief projects automatically. Readers that want to render the absorption path explicitly can opt in to the new `absorbed` flag.

---

## v2.0.0-alpha.21 (2026-05-02) — BACKLOG.md scaffolded by init / adopt apply — additive

**`aitri init` and `aitri adopt apply` now scaffold `BACKLOG.md` at the project root** (additive — new template `templates/BACKLOG.md` copied to `<project>/BACKLOG.md` if absent). Closes the gap where every new consumer project reinvented its backlog format from scratch.

**Surface for subproducts.** `BACKLOG.md` is a hand-written, narrative, project-root file. Aitri does not read or mutate it after the initial scaffold — there is no schema, no validation, no `validate()` hook. Subproducts MAY render or parse `BACKLOG.md` if they choose; old readers that ignore the file continue to work unchanged.

**Coexistence.** Independent of `spec/BACKLOG.json` (the CLI-managed structured backlog driven by `aitri backlog add/list/done`). Both files can coexist; neither references the other.

**Idempotency.** Both `init` and `adopt apply` (regular + `--from N` paths) write the template only when `BACKLOG.md` does not already exist at the project root. Re-running either command never overwrites a hand-written file.

**Hub impact:** none required. Hub readers that already render arbitrary project-root markdown will pick up `BACKLOG.md` automatically; readers that don't are unaffected.

---

## v2.0.0-alpha.17 (2026-05-02) — orphan IDEA.md absorption at upgrade time — additive

**`adopt --upgrade` absorbs orphan IDEA.md into `01_REQUIREMENTS.json.original_brief`** (additive — new BLOCKING migration in `lib/upgrade/migrations/from-0.1.65.js::diagnoseOrphanIdea`). Closes a long-standing residue: the `aitri approve 1` archive landed in v0.1.89, so projects whose Phase 1 was approved before that release kept `IDEA.md` at the project root indefinitely — every subsequent alpha bumped `aitriVersion` without touching the file.

**Trigger.** Phase 1 is approved (`approvedPhases` contains `1` or `"1"`) AND `IDEA.md` exists at the project root AND `01_REQUIREMENTS.json` lacks a `original_brief` field. The function short-circuits on `fs.existsSync('IDEA.md')` before any JSON parse, so the post-migration cost is one stat() per upgrade run.

**Behaviour.** Auto-migratable (shape-only). Reads `IDEA.md` → writes its content into `01_REQUIREMENTS.json.original_brief` → unlinks `IDEA.md` → re-stamps `artifactHashes[1]` to match the post-archive content (no false drift on next status). One `upgrade_migration` event with `target: 'IDEA.md'` and `transform: 'absorb IDEA.md → 01_REQUIREMENTS.json.original_brief, unlink IDEA.md'`.

**Edge case (flag-only).** When `original_brief` is already populated, the migration becomes a `validatorGap` finding (`autoMigratable: false`). Overwriting a non-empty field would clobber a prior approval's archived brief; Aitri does not guess which copy is authoritative. Operator compares contents and decides.

**Why additive.** `original_brief` is an optional field that Hub-style readers either already consume or ignore. The new migration adds it deterministically; no existing reader breaks. The `upgrade_migration` event shape is unchanged.

**Hub impact:** none required. Projects that long ago lost the archive moment now self-heal on the next `adopt --upgrade`. Hub readers iterating `events[]` will see the new `target: 'IDEA.md'` once per affected project.

---

## v2.0.0-alpha.16 (2026-05-02) — N1 venv-relative manifest finding + verify-run ENOENT preservation — additive

Surfaced by Cesar canary 2026-05-02 PM (alpha.4 → alpha.15 deepening pass). Two changes ship together because they describe the same defect at two layers — one at upgrade time (flag the legacy state), one at run time (don't propagate a phantom regression when the flagged state is exercised).

**N1 — `adopt --upgrade` flags legacy `.venv/`-relative manifest `test_runner`** (additive — new finding type). New VALIDATOR-GAP finding emitted by `lib/upgrade/migrations/from-0.1.65.js::diagnoseLegacyVenvManifest`. Walks the root `04_IMPLEMENTATION_MANIFEST.json` and every `features/<name>/.../04_IMPLEMENTATION_MANIFEST.json`; emits one finding per offending manifest whose `test_runner` matches `^\.?venv/|^env/`. `autoMigratable: false` per ADR-027 §2 (shape-only transforms). Reason explains the alpha.9 cwd change (`3603a49`) and points the operator at absolute paths or PATH-resolved binaries. Findings persist via the existing `upgradeFindings[]` channel introduced in alpha.3; Hub-style readers iterating that array will now see entries with `target` strings of the form `features/<name>/spec/04_IMPLEMENTATION_MANIFEST.json`.

**N1 sub-finding — `verify-run` ENOENT does not persist degraded results** (additive — observable run-time behaviour change, no schema change). When the runner binary is not found (`spawnSync.error.code === 'ENOENT'`), `verify-run` now exits via `err()` instead of writing a degraded `04_TEST_RESULTS.json` (0 passed / N skipped) and flipping `verifyPassed = false` per Z1. The on-disk `04_TEST_RESULTS.json` and `.aitri.verifyPassed` / `.aitri.verifySummary` are preserved verbatim. **Hub impact:** none — `.aitri` and the artifact are unchanged when ENOENT fires; the only difference is fewer phantom regressions when an operator upgrades a legacy project before fixing its manifest.

**L2 mensajería — runtime wording neutral when no Playwright config** (cosmetic, no consumer contract). `verify-run` `Skipped:` summary and `SKIP_NOTE` no longer prescribe Playwright unconditionally. With `playwright.config.{js,ts}` present at the project root the wording is unchanged ("e2e/browser", "may also require a browser environment"); without it the count is labeled neutrally as "e2e" and the browser hint is dropped. Templates ("Playwright as default e2e runner") are not touched in this release — that piece is tracked separately. **Hub impact:** none — Hub does not parse `verify-run` stdout.

**What did NOT change.** No `.aitri` schema change. No artifact schema change. No new event type. No new command. No phase lifecycle change. The new finding rides the existing `upgrade_migration` / `upgradeFindings[]` plumbing.

**Why additive (not breaking).** Older Hub builds that read `upgradeFindings[]` continue to work — the new finding's shape (`category: "validatorGap"`, `target` string, `transform` string, `reason` string) matches the existing flagged-finding contract since alpha.3. The `verify-run` ENOENT change makes `.aitri.verifyPassed` *more* stable, not less — readers cannot observe a regression introduced by this release.

---

## v2.0.0-alpha.14 (2026-04-30) — e2e gate accepts `automation: "manual"` as covered — additive

Surfaced by Go-on-RaspberryPi canary (non-web project, 26 e2e TCs, no Playwright). The `verify-complete` e2e gate now treats a TC with `automation: "manual"` (recorded as `status: "manual"` by `verify-run`) as satisfying the gate, consistent with the policy already applied to FR coverage (ARTIFACTS.md `manual` semantics, alpha.4+).

**Why additive (not breaking):** no schema field changed shape, no event was renamed, no command signature changed. The change is an expansion of the conditions under which `.aitri.verifyPassed` can become `true` — it now flips to `true` on projects whose only e2e coverage is manual, where it was previously stuck at `false`. Hub-style readers tracking `verifyPassed` continue to read the same boolean with the same meaning. No reader code needs to change. The pre-alpha.14 inference "`verifyPassed=true` implies every e2e TC ran in an automated runner" was already false for FR coverage; alpha.14 closes that asymmetry on the e2e gate.

**Operator-visible behaviour change** (not a contract change, but worth knowing for any subproduct that surfaces gate-failure messages from `verify-complete` stdout):
- The "e2e gate failed" message is now stack-aware. It branches on whether `playwright.config.{js,ts}` exists at the project root and offers different remediation paths. Both branches end with `"Do NOT change the TC type to bypass this gate — the type field describes intent, not runner availability."` — replacing prior remediation that effectively suggested falsifying the TC `type`.

**What did NOT change.** Phase 3's `e2eCount >= 2` rule. TC `type` schema (`unit | integration | e2e`). The `automation` enum (`auto | manual`). The `status` enum on TC results. No `.aitri` migration. No artifact contract change.

**Hub impact:** none required. Projects that were previously blocked at `verifyPassed: false` because of unautomatable e2e TCs may now flip to `true` after a `verify-run` + `verify-complete` cycle once the operator marks those TCs `automation: "manual"` in `03_TEST_CASES.json`. The flip is honest — the previous block was a stack assumption, not a real coverage gap.

---

## v2.0.0-alpha.13 (2026-04-29) — Zombite canary fixes Z1-Z5 — breaking

Five defects surfaced by Zombite canary on alpha.12 (third-project external canary, alpha.4 → alpha.12 upgrade). Two of the five (Z1, Z2) change observable producer behaviour that subproduct readers must adopt; the others fix bugs without contract impact but are bundled here for cohesion.

**Z1 — `verify-run` invalidates stale `verifyPassed`** (breaking — deploy-gate semantics change). Re-running `verify-run` with degraded results (passed === 0 with skips, OR any failures) now resets `config.verifyPassed = false` and clears `config.verifySummary`. Healthy results (passed > 0, failed === 0) leave the flag alone. Previously `verifyPassed` only reset on phase-4/5 cascade — the verify-run path never invalidated, so subproducts reading `.aitri.verifyPassed` could trust a stale "true" while the latest verify-run was 0/0/N skipped. **Hub impact:** any reader that mirrors deploy-readiness from `.aitri.verifyPassed` may now see the flag drop to false more often (which is correct — it was lying before).

**Z2 — `adopt --upgrade` backfills missing `artifactHashes`** (additive). New STATE-MISSING migration: when `approvedPhases.length > 0` and `artifactHashes` is absent or empty, hash each approved artifact on disk and stamp the field. Idempotent (preserves existing entries). Per-phase `upgrade_migration` events with `target: '.aitri#artifactHashes[<phase>]'` and `transform: 'backfill artifactHashes[<phase>] from on-disk <artifact>'`. Closes the silent-drift-detection failure on projects that predate the field.

**Z3 — `verify-complete` next-action respects phase 5 state** (cosmetic, no consumer contract). When phase 5 is already approved, the post-success `PIPELINE INSTRUCTION` block emits `aitri validate` (root) or no instruction (feature scope) instead of always emitting `aitri run-phase 5`.

**Z4 — Phase 3 validate rejects duplicate TC ids** (additive — stricter validation). `complete 3` throws when `03_TEST_CASES.json::test_cases[]` contains repeated `id` values. Error message lists each duplicate with its count. Closes the cardinality drift between `summary.manual` (Set size) and `results.length` (array length) seen on Zombite's `stabilizacion` feature (51 entries / 46 unique).

**Z5 — `adopt --upgrade` flags legacy 04_TEST_RESULTS.json schema** (additive — new finding type). New VALIDATOR-GAP finding when `verifyPassed: true` but the artifact lacks `results[]` and/or `summary` (pre-alpha shape with `suite_summary`). Non-auto-migratable (Option A per backlog) — operator runs `aitri verify-run` to regenerate. Surfaces in `upgradeFindings[]` and the upgrade report's findings section.

**Consumer impact summary:**
- Hub-style readers tracking `verify.passed` from `.aitri` will see the value reset more frequently after verify-run with degraded results. This is honest — the prior behaviour was the bug.
- Hub-style readers iterating `.aitri.events[]` may now see `upgrade_migration` events with new target shapes (`.aitri#artifactHashes[<phase>]`). Old readers that filter on `event === 'upgrade_migration'` continue to work; readers that switch on `target` should add a wildcard or array-bracket-aware match.
- No artifact schema changes. No `.aitri` schema removals or renames.

---

## v2.0.0-alpha.12 (2026-04-29) — no-op verify-run loop guard in `nextActions[]` — additive

`status --json::nextActions[]` priority-5 entry (Phase 4 approved + verify not passed) now emits `aitri verify-complete` (or `aitri feature verify-complete <name>`) instead of `verify-run` when the previous `verify-run` produced 0 passed + 0 failed + ≥1 skipped. Reason string changes to `verify-run produced 0 passed / N skipped — verify-complete reports what's missing` and severity becomes `warn`.

**Why:** prior to alpha.12, `resume`/`status` recommended `verify-run` whenever Phase 4 was approved and verify had not passed, regardless of whether `verify-run` had already run. A project that approved Phase 4 with skeleton tests, missing `@aitri-tc` markers, or a misconfigured runner would loop on identical no-op `verify-run` recommendations. Routing to `verify-complete` surfaces the existing diagnostic ("All N test(s) are skipped — at least 1 must pass"). Surfaced by Ultron canary on `feature verify-run network-monitoring` — generalises to any project, not Ultron-specific.

**Consumer impact:** Hub-style readers that special-case the priority-5 command on the string `"verify-run"` may want to also recognise `"verify-complete"` at the same priority. Reason text remains the only operator-facing line; the priority bucket is unchanged.

**Internal snapshot extension (not in `status --json` payload):** `pipeline.verify.lastRunSummary` (consumed only by `lib/snapshot.js::nextPhaseAction`) — derived from the latest `verify-run` event. Not part of the public projection; subproducts that read the JSON do not see this field.

---

## v2.0.0-alpha.11 (2026-04-29) — `adopt --upgrade` skips cascade-stale phases — additive

Tightens the alpha.10 fix after the Ultron canary against alpha.10 surfaced a third edge case the inference logic did not cover. Aitri Hub did not surface this either: Hub's events buffer carried completed events for every approved phase. Ultron's events buffer had recent activity for phase 1 (cascade re-approval) but zero events for phases 2/3/4 — those events were either evicted past the 20-entry cap, or the cascade itself never recorded a `started` for them. Artifacts for 2/3/4 remained on disk from the prior build.

**Producer-side behaviour change in `aitri adopt --upgrade`:**

The STATE-MISSING phase-inference step now skips a phase when the events buffer is non-empty AND the phase has zero events of any kind. Rationale: in an active project, absence of any event is positive evidence the phase is not currently tracked — typically a leftover artifact from a cascade-invalidated build that the operator deliberately reset by re-approving a lower phase. Auto-completing it would silently re-introduce a phase the cascade just removed.

The legacy fallback (events buffer empty → infer from artifact presence) is preserved verbatim. Projects upgrading from old Aitri versions whose events log was never populated continue to work as before.

Skip reasons that now surface under `Preserved (operator action required)`:
- `rejected, not auto-completed` (alpha.10)
- `in progress, not auto-completed` (alpha.10)
- `no event history, possibly stale (not auto-completed)` (alpha.11)

**`.aitri` schema changes:** none. The change is purely in `lib/upgrade/index.js::inferCompletedPhases` — a new `hasNoEventHistory` helper guards the legacy fallback when the buffer indicates active tracking.

**Reader impact:** none. `completedPhases` after upgrade is more accurate, never less. Hub already tolerates phases being absent from `completedPhases`.

**No subproduct migration needed.**

---

## v2.0.0-alpha.10 (2026-04-29) — `adopt --upgrade` preserves operator intent — additive

Fixes the P1 surfaced by the Ultron canary on alpha.9 (BACKLOG: "Core — Ultron canary findings against alpha.9"). Aitri Hub did not surface the defect because all of its phases were approved; Ultron is the first project encountered with `in_progress` and `rejections` state present at upgrade time.

**Producer-side behaviour change in `aitri adopt --upgrade`:**

- The STATE-MISSING phase-inference step now skips a phase when:
  1. The phase has an entry in `config.rejections` (the operator deliberately rejected the artifact). Auto-completing it would orphan the rejection record and corrupt operator intent — symmetric with how ADR-027 §3 preserves approvals.
  2. `config.events[]` shows a `started` event for the phase without a matching later `completed` or `approved` event (the operator ran `aitri run-phase` but never `aitri complete`). Auto-completing it would bypass `validate()` on a possibly-malformed artifact.
- Skipped phases are surfaced under a new `Preserved (operator action required)` section in the upgrade report, both in `--dry-run` and real runs. The operator must run `aitri complete` / `aitri approve` deliberately, or re-run the phase if the rejection feedback applies.
- Legacy projects whose `events[]` buffer is empty (older Aitri versions, or events evicted past the 20-entry cap) continue to be inferred from artifact presence — absence of a `started` event is not treated as evidence of in-progress.

**`.aitri` schema changes:** none. `rejections` and `events[]` are unchanged. The change is purely in how `lib/upgrade/index.js::inferCompletedPhases` reads them.

**Reader impact:** none for Hub. The change makes `config.completedPhases` *more accurate* after an upgrade — phases the operator did not consciously close are no longer included. Hub already tolerates phases being absent from `completedPhases`.

**No subproduct migration needed.**

---

## v2.0.0-alpha.9 (2026-04-28) — round-trip fixes from canary + diagnosis — additive

Closes the four code defects + two presentation defects surfaced by the audit + canary + diagnosis sequence on alpha.8. All changes are additive or relaxations — old readers continue to work unchanged. Hub readers see no behavioural difference; the only producer-side change visible in artifacts is the relaxed `04_IMPLEMENTATION_MANIFEST.json` schema (see below).

**Producer-side changes visible in artifacts:**

- `04_IMPLEMENTATION_MANIFEST.json`: `setup_commands` and `environment_variables` are now optional. Absent ≡ `[]`. When present, must be an array. Per-entry shape is documented in `templates/phases/build.md` (strings for `setup_commands`; objects with `name`/`default` for `environment_variables`). Producers may now omit either key when the project has no setup steps or env vars. Old readers handle absence gracefully (the keys were already optional in practice for downstream consumers); the change is purely on the validator side. Schema doc (`ARTIFACTS.md`) updated to match the actual stored shape.
- `03_TEST_CASES.json`: `requirement_id` now accepts NFR ids (`NFR-xxx`) when the NFR is declared in `01_REQUIREMENTS.json::non_functional_requirements[]`. Previously only FR ids were accepted, forcing agents to model performance/security/accessibility requirements as FRs. No reader-side change — the field has always been a string.

**`.aitri` schema changes:** none. Read-side canonicalisation in `state.js` coerces numeric phase strings (`"1"`) back to numbers (`1`) on load and on save, preserving alias keys (`"ux"`, `"discovery"`, `"review"`) verbatim. Existing readers were already tolerant of mixed types via `.map(String)` patterns; the canonicalisation is defence in depth, not a contract change.

**Producer-side UX changes (no reader impact):**
- `aitri adopt --upgrade --dry-run` no longer claims "would be a no-op" when the version string would change.
- `aitri status` text now surfaces `health.deployable` next to the phase table.
- `aitri feature verify-run` runs the test command from the feature directory, not the parent. This affects tests-on-disk, not artifact shape.

**No subproduct migration needed.**

---

## v2.0.0-alpha.8 (2026-04-28) — Go test runner output parser — additive

`aitri verify-run` now parses `go test -v` output for `--- PASS/FAIL/SKIP: TestTC_XXX` lines and emits the same `04_TEST_RESULTS.json` shape as the four existing runners. No schema change, no `.aitri` field change, no breaking reader contract. Hub readers see no difference.

**For consumers reading `04_TEST_RESULTS.json`:** Go projects under Aitri now produce the same `results[]`, `fr_coverage[]`, and `summary` fields as JS/Python/E2E projects. Test ids are normalized to canonical form (`TestTC_NM_001h` in the test file → `TC-NM-001h` in results) — the existing `extractTCId()` helper handles the conversion.

**Behavior change for projects with `test_runner: "go test ..."` in 04_IMPLEMENTATION_MANIFEST.json:**
- Previously: TCs were auto-classified as skip; verify-complete blocked on 0 passing tests with no actionable hint.
- Now: TCs are detected and counted correctly when the manifest declares `-v` in the runner command. A stderr warning fires when `go test` lacks `-v` so the operator can fix the manifest before verify-complete blocks.

**Convention required (forward-compatible).** Go test functions must follow `func TestTC_NS_NNN<suffix>(t *testing.T)` with the `Test` prefix mandatory (Go runtime requirement) and an `@aitri-tc TC-XXX` marker comment in the test body. The underscore separator is required in Go (the language forbids `-` in identifiers); aitri normalizes to canonical dash form on parse. Documented in `templates/phases/tests.md` and `templates/phases/build.md`.

**No subproduct migration needed.** This is purely a producer-side enhancement. Existing readers parse the same artifact shape they already understood.

---

## v2.0.0-alpha.4 (2026-04-27) — normalize allowlist for non-behavioral files — additive

Fourth staged pre-release on branch `feat/upgrade-protocol`. Closes the proportionality bug (N1) reported by the Ultron canary 2026-04-27.

**Behavior change in `aitri normalize` and `status --json::nextActions[]`**

`aitri normalize`, `aitri status`, and `status --json` now treat the following file patterns as **non-behavioral** and exclude them from off-pipeline drift detection. A diff containing only allowlisted files no longer fires the normalize warning, no longer counts toward `health.uncountedFiles`, and no longer emits the priority-4 `aitri normalize` next-action.

**Allowlist (`lib/normalize-patterns.js`):**
- Build / dependency manifests: `go.mod`, `go.sum`, `package.json`, `package-lock.json`, `yarn.lock`, `Cargo.toml`, `Cargo.lock`, `Pipfile`, `Pipfile.lock`, `poetry.lock`, `pyproject.toml`, `Gemfile`, `Gemfile.lock`, `composer.lock`, `pom.xml`, `build.gradle`, any `*.lock`
- Documentation: `*.md`, `*.markdown`, `*.rst`, `*.txt`, `*.adoc`, `README*`, `LICENSE*`, `LICENCE*`, `AUTHORS*`, `NOTICE*`, `CONTRIBUTING*`, `CHANGELOG*`, `CODE_OF_CONDUCT*`, `SECURITY*`, `MAINTAINERS*`
- Dotfiles: `.env`, `.env.*`, `.gitignore`, `.gitattributes`, `.dockerignore`, `.editorconfig`, `.npmrc`, `.nvmrc`, `.node-version`, `.python-version`, `.ruby-version`
- CI / infra: `Dockerfile*`, `docker-compose*.yml/yaml`, `Makefile*`, `GNUmakefile`, `.github/**`, `.gitlab/**`, `.circleci/**`, `ci/**`, `.travis.yml`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `cloudbuild.yaml`
- Generated assets: `**/*.min.js`, `**/*.min.css`, `**/*.bundle.js`, `**/*.bundle.css`, `**/*.map`, anything inside `/dist/`, `/build/`, `/.next/`, `/.nuxt/`, `/out/`

**Subproduct impact:** **additive**.
- Hub readers that consume `status --json::health.uncountedFiles` or `nextActions[]` will see lower counts on projects with documentation/build-manifest churn. No reader behavior changes; the count is more accurate.
- Hub readers that observed the priority-4 `aitri normalize` next-action firing on doc-only PRs will see fewer such entries.
- No schema field changes. No event log additions. The change is purely in how the diff is filtered before counting.

**Evidence / motivation:** Ultron canary 2026-04-27. Three previous workaround commits already in Ultron git history (`9b68709`, `0e6786a`, `35a9a95`), each titled `chore: advance aitri normalize baseline ...` — manual compensation for the same broken contract. Latest cycle triggered by a one-line `go.mod` toolchain bump (CVE fix). Normalize briefing measured at 70,390 bytes regardless of change size, plus required full `verify-run` (45 tests) + TTY confirmation to clear the warning.

**Test coverage.** +31 tests (993/993 green). New file `test/normalize-patterns.test.js` (29 tests covering allowlist semantics + Ultron regression case). 2 tests added to `test/snapshot.test.js::detectUncountedChanges()` (Ultron regression + mixed change set). 2 tests added to `test/commands/normalize.test.js` (mtime path filters minified bundles + `/dist/`, all-allowlist diff stays in resolved state).

**Deferred from alpha.4 (by decision):**
- **N2** — proportional briefing (full spec embedded in 70KB output regardless of change size). Will reassess after Ultron confirms N1 absorbs the perceived friction.
- **N3** — `verify-complete` consults `buildProjectSnapshot()` for next-action instead of hardcoding "Phase 5 next" ([verify.js:864](../../lib/commands/verify.js#L864)). Independent bug, separate fix.

---

## v2.0.0-alpha.3 (2026-04-24) — upgrade findings persistence + rehash command — additive

Third staged pre-release on branch `feat/upgrade-protocol`. Closes the three findings surfaced by the three-canary session (Hub, Ultron, Zombite).

**`.aitri.upgradeFindings[]` — new array field (A1)**
- Populated by `aitri adopt --upgrade` with the flagged findings that diagnose cannot auto-migrate (multi-FR TCs, free-text NFR titles, VALIDATOR-GAPs, etc.). Previously these findings only appeared in the upgrade report output and scrolled past, leaving projects dirty under a "clean" status view.
- Snapshot model: overwritten on every upgrade run. When the agent re-authors the flagged items and a subsequent `adopt --upgrade` produces no findings, the array is cleared automatically. No history semantics — the event log (`.aitri.events[]`) remains the history channel.
- Each entry: `{ target, transform, reason, module, category, recordedAt }`.
- **Subproduct impact:** **additive**. Readers that did not know this field continue to work. Readers that want to surface unresolved upgrade work can render the array directly — count on dashboard, list in detail view.

**`nextActions` — new priority-3 entry: unresolved upgrade findings**
- Emitted once per pipeline whose `upgradeFindings` is non-empty. Command: `aitri resume` (root) or `aitri feature status <name>` (feature). Reason: `"N unresolved upgrade finding(s) in <scope> — artifacts need agent re-authoring"`.
- Sits alongside the existing priority-3 "blocking bugs" entry. Both represent "known-dirty state that must be resolved before pipeline work".
- **Subproduct impact:** Hub and any reader of `status --json`'s `nextActions[]` may observe new priority-3 entries with this shape. Priority ordering is preserved; the new entries never change the priority of existing entries.

**`aitri rehash <phase>` — new CLI command (A5)**
- Updates `artifactHashes[phase]` to match the current artifact content without touching `approvedPhases` / `completedPhases`. Narrow escape hatch for legacy projects where an old Aitri version stored a hash that no longer matches current content, even though the artifact was not modified since its last approval (e.g. a commit that updated the artifact without going through `aitri approve`).
- Guardrails:
  - Refuses if the phase has no stored hash (nothing to rehash).
  - No-op when stored and current hashes already match.
  - Refuses if git is not available (cannot verify cleanness).
  - Refuses if `git diff HEAD -- <artifact>` reports uncommitted changes — in that case `rehash` is the wrong tool, `approve` is (with its cascade).
  - `isTTY`-gated: an agent cannot auto-rehash.
- Also available as `aitri feature rehash <feature> <phase>` for feature sub-pipelines.
- **Subproduct impact:** none directly. Subproducts that observe `artifactHashes[phase]` may see it change on projects where rehash ran; `driftPhases` clears in the same transaction. No schema change.

**`.aitri.events[]` — new event type `"rehash"` (A5)**
- Emitted by `aitri rehash`. Fields: `artifact`, `before_hash`, `after_hash`. No content drift — bookkeeping only.
- **Subproduct impact:** event log is contract-tolerant to unknown types (per SCHEMA.md §"Reader guidance"). Existing readers keep working; consumers that want to render rehash audit trails can filter for `event === "rehash"`.

**`aitri approve` drift prompt — adds rehash hint when git is clean (A5b)**
- When drift is detected but `git diff HEAD -- <artifact>` reports no uncommitted changes, the prompt now suggests `aitri rehash <phase>` as an alternative that preserves downstream phases. Default flow (re-approve with cascade) unchanged if the operator chooses to proceed.
- **Subproduct impact:** cosmetic — affects prompt text only, no contract surface.

**`adopt --upgrade` report — A3 message fix**
- When the upgrade would change only the version string (schema already canonical), the banner now reads `"Schema already on canonical shape — only the version string will change"` instead of the previously ambiguous `"Project is already current — nothing to migrate"` combined with a visible version bump arrow.

---

## v2.0.0-alpha.2 (2026-04-24) — operator ergonomics + `.aitri` contract doc — additive

Second staged pre-release on branch `feat/upgrade-protocol`. No schema field changes — the `.aitri` and artifact schemas are unchanged from alpha.1. Ergonomics and documentation only.

**SCHEMA.md — new section "Should `.aitri` be committed?"**
- Makes the default recommendation explicit (commit `.aitri`) and enumerates the consequences of gitignoring it (Hub change detection breaks, drift baseline is per-machine, approval state is per-machine, `reconcileState.baseRef` references untracked state).
- Documents that the current schema mixes shared state (`approvedPhases`, `artifactHashes`, `events[]`, …) and per-machine state (`lastSession.when`, `reconcileState.lastRun`, `reconcileState.baseRef`) in one file. Explicit trade-off rather than unstated asymmetry.
- **Subproduct impact:** Hub and other consumers MUST NOT treat a missing `.aitri` on a fresh clone as corruption — it is a valid state for projects that chose to gitignore. Updated guidance in the section addresses this directly.
- Tension tracked as [ADR-028](../DECISIONS.md#adr-028--2026-04-24--open-question-aitri-mixes-shared-and-per-machine-state) (open question; `.aitri/local.json` split deferred until a second signal).

**`adopt --upgrade --dry-run` — new CLI flag (safety infrastructure)**
- Runs the full diagnose pipeline and prints the report with `(DRY-RUN — no changes written)` banner and `◻️` markers, without writing artifacts, mutating `.aitri`, appending `upgrade_migration` events, or regenerating agent instruction files.
- **Subproduct impact:** none. Hub and other consumers observe no change — dry-run does not persist anything. Operators can now preview migrations before applying.

**`aitri resume` — brief default + `--full` flag (UX)**
- Default output omits the reference sections (Architecture & Stack Decisions, Open Requirements, Test Coverage, Technical Debt) that duplicate content already in `02_SYSTEM_DESIGN.md` / `01_REQUIREMENTS.json` / `04_TEST_RESULTS.json` / `04_IMPLEMENTATION_MANIFEST.json`. Brief output focuses on "what do I do next": Pipeline State, Last Session, Open Bugs, Health, Next Action.
- `aitri resume --full` restores the full dump (reference material included).
- **Subproduct impact:** none. `aitri resume` is human-consumable text; no subproduct depends on its shape. Contract surfaces (`status --json`, `.aitri`, `spec/`) are unchanged.

**`nextActions` — terminal state: P7 `aitri validate` suppressed on fully-stable projects**
- When `health.deployable === true` AND audit exists AND audit is not stale AND verify is not stale, the P7 "confirm deployment readiness" suggestion is no longer emitted. Consumers should render the priority ladder as-is; when empty, render an "idle" message.
- **Subproduct impact:** Hub and any reader of `status --json`'s `nextActions[]` may observe an empty array on stable projects. Readers should treat empty `nextActions[]` as "no pending work", not as a schema error. The priority ordering of surviving actions is unchanged.

---

## v2.0.0-alpha.1 (2026-04-24) — adopt --upgrade as reconciliation protocol — additive

First staged pre-release of the v2.0.0 upgrade protocol. Shipped on branch `feat/upgrade-protocol` (not merged to main). Governed by ADR-027. Validated against two real brownfield projects: Ultron (v0.1.89 → v0.1.90, drift present) and Aitri Hub (v0.1.89 → v0.1.90, already current). Catalog evidence base remains narrow — third-project canary post-adoption will inform whether to broaden the catalog before promoting to stable.

**`.aitri.events[]` — new event type `upgrade_migration`**
- Emitted once per migration applied by `aitri adopt --upgrade`. Fields: `from_version`, `to_version`, `category` (`blocking` | `stateMissing` | `validatorGap` | `capabilityNew` | `structure`), `target` (artifact filename or `.aitri#<field>` anchor), `transform`, and optional `before_hash` / `after_hash` for artifact writes.
- **Subproduct impact:** the event array gains a type Hub does not yet understand. The contract already requires readers to tolerate unknown event types (see SCHEMA.md "Reader guidance"). No change needed to continue working; Hub can now render upgrade audit trails if it adds a renderer for this type.

**Schema migrations run automatically by `adopt --upgrade`**
- `test_cases[].requirement` → `test_cases[].requirement_id` (single-FR values only; multi-FR comma-separated values are flagged for agent review, never auto-split).
- `non_functional_requirements[].constraint` → `non_functional_requirements[].requirement` (mechanical rename).
- `non_functional_requirements[].title` → `non_functional_requirements[].category` only when `title` is a case-insensitive match of `Performance` | `Security` | `Reliability` | `Scalability` | `Usability`. Free-text titles are flagged, not inferred.
- **Subproduct impact:** projects previously readable only via the v0.1.90 defensive fallback layers (snapshot.js NFR tolerance, TC reader tolerance) will migrate to the canonical shape after an upgrade. Hub's fallback readers continue to work for projects that have not yet run upgrade.

**`.aitri` field backfills run automatically by `adopt --upgrade`**
- `updatedAt`, `lastSession`, `verifyRanAt`, `auditLastAt`, `reconcileState` are stamped when missing and a deterministic source exists (event log, artifact mtime, git HEAD).
- **Subproduct impact:** post-upgrade, projects previously missing these fields expose them. Readers that guarded behind `if (config.X)` now enter the populated branch.

**`artifactHashes[phase]` preserved across shape-only migrations**
- When a shape-only migration rewrites an approved artifact, the stored hash is updated to match the new content. Preserves the approval across the migration (§2 guarantees the agent-approved content did not change, only the serialization). `driftPhases[]` is NOT touched — pre-existing drift stays.
- **Subproduct impact:** Hub's `hasDrift` reads stay consistent across an upgrade. Without this, every migrated project would show drift on every approved phase immediately after upgrade.

**`adopt --upgrade` CLI output — new sections**
- "Schema migrations applied" — per-artifact mechanical changes.
- "Flagged for agent review" — VALIDATOR-GAP findings that require content-level decisions (multi-FR TCs, free-text NFR titles, Phase 1 vagueness).
- Existing sections ("Phases inferred", "Already tracked", agent-files guidance) unchanged.
- **Subproduct impact:** none. Output is for human/agent consumption, not parsed by Hub.

---

## v0.1.90 (2026-04-23) — Brownfield integrity + audit trail — additive

**`03_TEST_CASES.json` — alternative multi-FR shape**
- `test_cases[].frs: string[]` is now recognized as an alternative to `requirement_id: string`. When both are present, `frs` wins. Canonical single-FR shape is still `requirement_id`.
- Additive. No existing field removed, no type changed. Readers that only consume `requirement_id` keep working for single-FR TCs.

**`verify-run` schema precondition**
- New preflight check: if `test_cases[]` is non-empty and no entry exposes `requirement_id` or `frs`, `aitri verify-run` exits with an error before running the test command and before writing `04_TEST_RESULTS.json`. Behavior change only for projects adopted under the legacy v0.1.x schema (`requirement` string).
- **Subproduct impact:** `04_TEST_RESULTS.json` on legacy projects will no longer be overwritten with an all-zeros `fr_coverage`. If a Hub view previously displayed a degraded coverage block for such projects, the stale state on disk will now persist until the project migrates. Migration is manual: rename `requirement` → `requirement_id` on each test case, or use `frs: ["FR-001","FR-002"]` for multi-FR TCs.

**`01_REQUIREMENTS.json` — NFR legacy field tolerance (read-side only)**
- `aitri status --json`, `aitri resume`, and `buildProjectSnapshot()` now surface `openNFRs[].category ?? nfr.title` and `openNFRs[].requirement ?? nfr.constraint`. Reader accommodation only — Phase 1's `validate()` still enforces the canonical `{category, requirement}` fields on new artifacts.
- **Subproduct impact:** none. Hub reads `openNFRs` as produced by the snapshot, which now normalizes the shape.

**`BUGS.json` — audit-trail fields (additive)**
- New optional fields on each bug entry:
  - `fix_commit_sha: string` — git HEAD at the moment of `aitri bug fix`
  - `fix_at: ISO8601` — timestamp paired with `fix_commit_sha`
  - `close_commit_sha: string` — git HEAD at the moment of `aitri bug close`
  - `close_at: ISO8601` — timestamp paired with `close_commit_sha`
  - `files_changed: string[]` — `git diff --name-only fix_commit_sha..close_commit_sha`, filtered to exclude `spec/` and `.aitri`
- All captured automatically when the project is a git repo. In non-git projects the fields are simply absent; the bug lifecycle still works.
- **Subproduct impact:** additive. Consumers that ignored unknown fields continue to work. Hub or future dashboards can now show a per-bug commit-range link and the list of files modified to resolve it.

**`aitri normalize --init`**
- New escape hatch for projects whose Phase 4 was approved before v0.1.80 (when `reconcileState` was introduced). Stamps a baseline at the current state. Refuses to run if Phase 4 is not approved, or if a `reconcileState` already exists (no silent clobber).
- **Subproduct impact:** none on read side. Hub already reads `reconcileState` as-is.

**`aitri validate` — deploy-files output**
- No longer labels `Dockerfile`/`docker-compose.yml` as "required"; warnings like `⚠️ Dockerfile — not found (check Phase 5 output)` are removed. The `validate` output lists existing deploy files and, when none exist, prints a neutral hint about non-containerized targets.
- **Subproduct impact:** the `--json` `deployFiles` shape (`{Dockerfile: bool, "docker-compose.yml": bool, "DEPLOYMENT.md": bool, ".env.example": bool}`) is preserved byte-for-byte. Consumers depending on this shape are unaffected.

**Integration-doc header bump**
- `SCHEMA.md`, `README.md`, `ARTIFACTS.md`, `STATUS_JSON.md` now declare `v0.1.90+`. Enforced by `test/release-sync.test.js`.

---

## v0.1.89 (2026-04-22) — Phase 1 SSoT model — additive

**IDEA.md role formalized as seed-only**
- First Phase 1 run reads `IDEA.md` (the seed brief). After `aitri approve 1` (first time), `IDEA.md` content is absorbed into `01_REQUIREMENTS.json.original_brief` (new optional field) and the `IDEA.md` file is removed from disk.
- All subsequent Phase 1 re-runs use `01_REQUIREMENTS.json` as the SSoT input. The agent refines current FRs instead of regenerating from a stale brief — this closes a real drift class where re-runs silently pruned legitimate FRs that grew organically past the original brief.
- Same pattern for feature sub-pipelines: `aitri feature run-phase <name> 1` materializes `FEATURE_IDEA.md → IDEA.md` only when the feature has no `01_REQUIREMENTS.json` yet.

**New artifact field: `01_REQUIREMENTS.json.original_brief`**
- Type: `string` (full IDEA.md content, verbatim).
- Optional and additive — old readers ignoring unknown fields keep working.
- Historical reference only. Aitri does not read this field for any behavioral decision; it exists for human recovery and future audit tooling.
- Present after first `aitri approve 1` if `IDEA.md` existed at that moment. Absent if the project was approved before v0.1.89 OR if `IDEA.md` was deleted manually before approval.

**Subproduct impact:**
- **Additive.** No schema field removed, no type changed. Hub and other readers need no changes.
- Hub may optionally surface `original_brief` in project detail views (e.g. "Original brief" expandable block).
- The disappearance of `IDEA.md` from disk after first Phase 1 approve is intentional, not a bug. Readers that previously checked `IDEA.md` existence to gauge project maturity should switch to checking `01_REQUIREMENTS.json` (more reliable signal).
- Compliance with the artifacts-as-SSoT invariant: Phase 1's behavior on re-runs now matches the same "current artifact = SSoT" model that Phases 2-5 already follow.

---

## v0.1.87 (2026-04-22) — deploy gate — additive

**New deploy-gate reason: `feature_verify_failed`**
- `computeHealth()` now blocks `deployable` when a feature sub-pipeline at phases 5/5 has `verify.ran && !verify.passed`. WIP features (phases < 5/5) remain independent — a feature still in development must not block root deploy.
- New reason object shape: `{ type: 'feature_verify_failed', message: string, features: string[] }` — `features` lists the offending feature names. Present alongside (not replacing) existing reasons.
- Surfaced via `aitri validate`, `aitri validate --explain`, `aitri validate --json.deployableReasons`, and `aitri status --json.health.deployableReasons`.

**Subproduct impact:**
- **Additive.** Old readers ignoring unknown reason types keep working. No field removed, no type change.
- Readers that enumerate `deployableReasons` should handle `feature_verify_failed` and optionally use its `features[]` field for richer UI. The existing `{ type, message }` contract is preserved — any reader that only formats `message` needs no changes.
- `v0.1.87` also updates `aitri validate` text output to enumerate features + Σ aggregate (shipped in v0.1.86, schema-free rendering-only change).

---

## v0.1.85 (2026-04-22) — bugfix (no schema change) — additive

**Test-output parsers now handle multi-segment TC IDs**
- `parseRunnerOutput`, `parseVitestOutput`, `parsePytestOutput`, `parsePlaywrightOutput` previously truncated IDs like `TC-FE-001h` to `TC-FE`, causing every namespaced automated test to fall silently into `skipped_no_marker`.
- All four parsers now extract the full ID via the new shared `extractTCId()` helper. Single-segment IDs (`TC-001h`, `TC-020b`) unchanged.

**Subproduct impact:**
- None. No schema change. `04_TEST_RESULTS.json` shape, `.aitri.verifySummary`, `status --json.tests` all unchanged.
- Consumer projects with namespaced TC IDs that hit `skipped_no_marker` counts in prior versions should re-run `verify-run` + `verify-complete` per feature to get honest numbers. `.aitri.verifyPassed` persists across verify-runs until `verify-complete` re-runs.

---

## v0.1.84 — addendum (doc correction, no behavior change) — additive

**ARTIFACTS.md sync with code — closing pre-existing drift (2026-04-21)**
- Phase 2 required sections now list 9 (added `Technical Risk Flags`, matching `phase2.js` validate()). Minimum length corrected from 30 to 40 lines.
- Phase 3 `edge_case` clarified as encouraged but not enforced — only `happy_path` and `negative` are strictly required per FR.
- Headers note added: Phase 2 accepts `## Name`, `## 1. Name`, or `## 1.1 Name` prefixes.

**Subproduct impact:**
- No schema change. This is a doc-accuracy correction; the runtime gates have been stricter than the doc claimed since before v0.1.84.
- Subproducts that relied on the doc when deciding whether a Phase 2 artifact "looks complete" should add the `Technical Risk Flags` section to any local heuristic.

---

## v0.1.84 — additive

**`aitri normalize --resolve` — maintenance-path closure for normalize cycle (behavior change, not schema change)**
- New flag on existing `aitri normalize` command. Closes the pending state without re-approving Phase 4 (which would cascade-invalidate Phase 5). Intended for maintenance changes classified as `refactor` or already-registered+verified `bug-fix` — i.e. code changes that did not require spec updates.
- Mechanical gates before closure: `verifyPassed === true`, no open critical/high bugs in `BUGS.json`. A non-TTY invocation is rejected when files are detected; with zero detected files the baseline auto-advances.
- Human TTY gate: prints the detected file list and requires explicit `y/N` confirmation that every file is `refactor` or registered `bug-fix`. `fr-change` / `new-feature` / `undetermined` entries must still route through the pipeline.
- Writes `normalize-resolved` event into `.aitri.events[]` with `{ files, method, baseRefFrom, baseRefTo }`.

**Subproduct impact:**
- **Schema unchanged** — `.aitri.reconcileState` shape is identical (`{ status, baseRef, method, lastRun }`). Readers do not need updates.
- **New event type** — `events[]` may now contain entries with `event: 'normalize-resolved'`. Readers that enumerate events should add this to any allow-list.
- **Observable change** — `reconcileState.status` can transition from `pending` → `resolved` without a `approved` phase-4 event preceding it. Consumers that inferred "normalize resolved ⇒ phase 4 re-approved" must drop that assumption.
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.84` after reviewing.

---

## v0.1.82 — additive

**Phase 1 validation — stricter semantic checks on requirements (behavior change, not schema change)**
- MUST FRs with a fully-vague title (e.g. `"La app debe funcionar correctamente"`, `"System must work properly"`) now fail `aitri complete 1`. Rule: title matches `BROAD_VAGUE` regex AND has <2 substantive tokens after stopword/vague-word removal. Bilingual EN/ES vocabulary.
- Pairs of FRs (any priority) with ≥3 acceptance_criteria each and ≥90% Jaccard similarity on normalized AC sets now fail validation. Detects copy-paste across FRs.
- `BROAD_VAGUE` regex extended to cover Spanish qualifiers (`correctamente`, `adecuadamente`, `eficientemente`, etc.).

**Subproduct impact:**
- **Schema unchanged** — `01_REQUIREMENTS.json` shape is identical. Readers that parse the artifact do not need updates.
- **Constraint tightened** — existing projects whose requirements have vague titles or duplicated ACs will fail the phase gate after upgrading. Those projects should re-approve Phase 1 after the author differentiates titles/ACs. Legacy already-approved artifacts are not re-validated retroactively.
- [ARTIFACTS.md](./ARTIFACTS.md) updated with the two new rules under "01_REQUIREMENTS.json — Validation rules".
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.82` after reviewing.

---

## v0.1.81 — additive

**`aitri status --json` — new top-level `tests` block (additive)**
- New `tests` object aggregates test counts across root + all feature sub-pipelines. Shape: `{ totals: { passed, failed, skipped, manual, total }, perPipeline: [{ scope, passed, failed, total, ran }], stalenessDays }`. See [STATUS_JSON.md](./STATUS_JSON.md#tests-v0181) for semantics.
- Each pipeline's own `verify.summary` is preserved unchanged — `tests` is an additive projection so consumers don't re-implement cross-pipeline aggregation.

**CLI text output — `Σ all pipelines` aggregate**
- `aitri status` and `aitri resume` now show a `Σ all pipelines` line with combined `passed/total` when at least one feature has a verify summary. Per-feature verify indicator now includes test counts: `verify ✅ (42/42)`.
- Closes the real-world gap where `aitri status` showed `30/30` for the root pipeline while features had ~256 additional tests invisible to the top-line view.

**Subproduct impact:**
- Purely additive — readers that ignore unknown JSON fields need no changes.
- Hub-style dashboards can now surface a global test-count without walking `features[]` and summing `verifyPassed` entries.
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.81` after reviewing.

---

## v0.1.80 — additive

**`aitri status --json` — new top-level `normalize` block (additive)**
- New `normalize` object exposes the off-pipeline change baseline plus a snapshot-time detection. Shape: `{ state, method, baseRef, uncountedFiles }`. See [STATUS_JSON.md](./STATUS_JSON.md#normalize) for semantics.
- `nextActions[]` priority 4 now also fires when `normalize.uncountedFiles > 0` (git baseline, resolved state) — same `aitri normalize` command, distinct reason text. Closes the gap where users who never ran `aitri normalize` got no nudge despite changing code outside the pipeline.

**`aitri approve` — informed human review (UX, no schema change)**
- Approval prompt now prints a per-phase artifact summary (FR/AC counts, TC breakdown, manifest stats, compliance levels, design sections) before the y/N gate. Non-TTY path (CI/agents) unchanged.

**Subproduct impact:**
- Purely additive — readers that ignore unknown JSON fields need no changes.
- Hub may surface `normalize.uncountedFiles > 0` in dashboards as an early signal of off-pipeline drift (complement to `health.driftPresent` which only covers approved-artifact drift).
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.80` after reviewing.

---

## v0.1.79 — additive

**`.aitri` schema — `verifyRanAt` and `auditLastAt` (additive)**
- `verifyRanAt` (ISO 8601 string) — written by every `aitri verify-run` invocation, regardless of pass/fail. Closes the gap left in v0.1.77 where `status --json health.staleVerify` was reserved-but-empty.
- `auditLastAt` (ISO 8601 string) — written by `aitri audit`. Replaces fragile `fs.statSync(AUDIT_REPORT.md).mtimeMs` for the staleness signal — file mtime resets when a project is freshly cloned, producing false "stale audit" signals. Snapshot still falls back to mtime when `auditLastAt` is absent (legacy projects).
- `verifyTimestamp` (set on `verify-complete` only, undocumented in earlier versions) removed — it was never read by any consumer and was superseded by `verifyRanAt` which is set on every run.

**`aitri status --json` — populated previously-reserved fields**
- `health.staleVerify` now lists pipelines whose persisted `verifyRanAt` is older than 14 days: `[ { "scope": "root | feature:<name>", "days": N } ]`. Empty when no pipeline has a `verifyRanAt` yet (legacy or never-verified projects), or when all are within the threshold.
- `tests.stalenessDays` (root pipeline) now returns an integer instead of always `null`. `null` only when the root has never run `verify-run` on v0.1.79+.
- `audit.lastAt` prefers persisted `auditLastAt`; falls back to file mtime only for legacy projects or audits written off-CLI.

**Subproduct impact:**
- **Hub and other remote consumers:** purely additive — readers that ignore unknown `.aitri` fields need no changes. If you previously surfaced "audit stale" using mtime, switch to `auditLastAt` when present and you'll stop getting false positives after fresh clones.
- **`status --json` consumers:** `health.staleVerify` now returns objects, not an empty array (its prior reserved shape). Treat as additive.
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.79` after reviewing.

---

## v0.1.77 — additive

**`aitri status --json` — unified project snapshot (new surface)**
- New CLI surface documented in [STATUS_JSON.md](./STATUS_JSON.md): `aitri status --json` emits an aggregated projection covering root + feature sub-pipelines, health signals, and a priority-ordered next-action list.
- Single source of truth for the CLI's `status`, `resume`, and `validate` commands — they are now thin projections over `buildProjectSnapshot()`.
- Legacy `status --json` fields preserved (`project`, `dir`, `phases`, `driftPhases`, `nextAction`, `allComplete`, `inHub`, `rejections`, `versionMismatch`, `aitriVersion`, `cliVersion`).
- New top-level fields: `snapshotVersion`, `features[]`, `bugs`, `backlog`, `audit`, `health`, `nextActions[]`.
- `health.deployable` + `health.deployableReasons[]` — deploy-gate reasoning now consistent across all three commands (previously `status` suggested `aitri validate` when phase 4 was approved without checking verify, while `resume` correctly gated on `verifyPassed`).

**`aitri validate --json` — additive fields**
- Added top-level `deployable`, `deployableReasons[]`, `openBugs`, `blockingBugs`. Existing fields (`artifacts[]`, `allValid`, `deployFiles`, `setupCommands`) unchanged.

**`aitri validate --explain` — new flag**
- Expanded text output that enumerates deploy-gate reasons (passing or blocking) inline.

**`aitri resume` — feature awareness**
- New `## Features` section lists each feature sub-pipeline with its progress, verify state, drift flag, and per-feature next action.
- New `## Health` section (shown when project has progress but is not deployable) enumerates blocking reasons.
- Next Action section now shows a priority-ordered list (up to 5 actions), not a single command.

**Subproduct impact:**
- **Hub and other remote (GitHub-URL) consumers:** no action required — the `.aitri` + artifact file contract is unchanged. `status --json` is additive and only reachable via the local CLI.
- **CLI-colocated consumers (IDE plugins, local dashboards):** may now consume `aitri status --json` directly instead of re-deriving aggregation logic from raw files. See [STATUS_JSON.md](./STATUS_JSON.md).
- **Bump `INTEGRATION_LAST_REVIEWED`** to `0.1.77` after reviewing changes. No reader changes required for remote consumers.

---

## v0.1.76 — additive

**`04_IMPLEMENTATION_MANIFEST.json` — `files_modified` field added**
- New optional field `files_modified: []` — list of existing files changed during implementation
- Gate changed: `files_created` OR `files_modified` must be non-empty (previously only `files_created`)
- Enables modification/redesign phases where no new files are created
- `files_created` is no longer a required field — omit if work only modified existing files

**Subproduct impact:** `04_IMPLEMENTATION_MANIFEST.json` may now have `files_modified` instead of (or in addition to) `files_created`. Readers should handle both fields.

---

## v0.1.74 — additive

**`aitri tc verify` — record manual TC execution results**
- New command: `aitri tc verify <TC-ID> --result pass|fail --notes "..."`
- Updates `04_TEST_RESULTS.json` in place: sets `status` to `pass|fail`, adds `verified_manually: true`, `verified_at` timestamp
- Manually verified TCs count toward `summary.passed` — total score reflects reality
- Syncs `.aitri` `verifySummary` so `aitri resume` shows updated numbers immediately
- `verify-run`: preserves `verified_manually: true` entries on re-run — manual verifications are not wiped by a subsequent automated test run
- New `summary.manual_verified` field: how many manual TCs have been recorded
- Display updated: `Manual: N/N verified` (was just `Manual: N`)

**Subproduct impact:** `04_TEST_RESULTS.json` now has `summary.manual_verified` and result entries may have `verified_manually: true` + `verified_at` fields. `summary.passed` now includes manually-verified passing TCs.

---

## v0.1.72 — additive

**`04_TEST_RESULTS.json` — manual TC support**
- New `status` value: `"manual"` — TCs with `automation: "manual"` in `03_TEST_CASES.json` are excluded from the automated runner gate; they receive `status: "manual"` instead of `"skip"`
- New `summary.manual` field: count of manual TCs in each run
- New `fr_coverage[].tests_manual` field: count of manual TCs per FR
- New `fr_coverage[].status` value: `"manual"` — for FRs whose TCs are all manual
- `verify-complete` no longer blocks on manual TCs: they are excluded from skip checks, notes requirements, and the "zero passing tests" gate
- `verify-run`: auto-detects `.venv/bin/pytest` (or `venv/bin/pytest`) if bare `pytest` command is used — fixes silent skip-all on Python virtualenv projects
- `verify-run` / `feature verify-run` / `feature verify-complete` added to `aitri feature` sub-commands

**Subproduct impact:** consumers of `04_TEST_RESULTS.json` should treat `"manual"` as a distinct status (not equivalent to `"skip"`). FR coverage `status: "manual"` means human-verified, not untested.

---

## v0.1.71 — additive

**`aitri audit` — on-demand code & architecture audit**
- New command: `aitri audit` generates an evaluative briefing; agent writes `AUDIT_REPORT.md`
- New sub-command: `aitri audit plan` reads `AUDIT_REPORT.md` and proposes Aitri actions (`bug add`, `backlog add`) for each finding
- New persona: `auditor` — meta-persona (not phase-bound, like `adopter`); evaluative, not generative
- New artifact: `AUDIT_REPORT.md` — optional, off-pipeline (three sections: Findings → Bugs, Findings → Backlog, Observations)
- No pipeline changes: AUDIT_REPORT.md does not affect validate, approve, or drift detection

---

## v0.1.70 — additive

**`.aitri` schema: `lastSession` field added**
- New optional field `lastSession` in `.aitri` — session checkpoint written automatically by `complete`, `approve`, `verify-run`, `verify-complete`, `feature init`, and `checkpoint`
- Schema: `{ at, agent, event, context?, files_touched? }`
- Agent auto-detected from environment variables (claude, codex, gemini, opencode, cursor)
- `aitri resume` now shows "Last Session" section with this data
- Subproducts can read `lastSession.at` for "last activity" and `lastSession.event` for "what happened last"

**Agent instruction files: multi-agent support**
- `aitri init` and `aitri adopt` now generate instruction files for multiple agents: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.codex/instructions.md`
- All files have identical content sourced from `templates/AGENTS.md`
- Non-destructive: never overwrites existing files

---

## v0.1.67 — additive

**`aitri bug` — first-class QA artifact (redesign from v0.1.66 prototype)**
- Bug artifact promoted from utility to first-class artifact with full schema formalization
- `BUGS.json` schema: `id, title, description, steps_to_reproduce[], expected_result, actual_result, environment, severity, status, fr, tc_reference, phase_detected, detected_by, evidence, reported_by, created_at, updated_at, resolution`
- Lifecycle: `open → fixed → verified → closed` (`in_progress` status removed)
- `detected_by`: `"manual"` | `"verify-run"` | `"playwright"` | `"review"`
- `reported_by`: `"aitri"` (auto) or arbitrary string from `--reported-by` flag
- Blocking rule: `status: "open"` + `severity: "critical"` or `"high"` blocks `verify-complete`
- Playwright evidence: auto-populated from `test-results/<folder>/screenshot.png` on TC failure

**No `.aitri` schema changes in v0.1.67.**

---

## v0.1.66 — additive

**New artifact: `BUGS.json`**
- New optional artifact in `<artifactsDir>/BUGS.json` (same dir as `spec/`).
- Written by `aitri bug add` (manual) or prompted by `aitri verify-run` on test failure.
- Schema: `id, title, description, steps_to_reproduce[], expected_result, actual_result, environment, severity, status, fr, tc_reference, phase_detected, detected_by, evidence, reported_by, created_at, updated_at, resolution`
- Lifecycle: `open → fixed → verified → closed`
- Blocking rule: `status=open` + `severity=critical|high` → blocks `verify-complete`
- Playwright integration: `evidence` auto-populated from `test-results/` on test failure
- Subproducts can read `BUGS.json` directly — not registered in `.aitri` state

**New commands (no `.aitri` schema change):**
- `aitri review` — cross-artifact semantic consistency check (req→TC, TC→results)
- `aitri bug` — full bug lifecycle with `add`, `fix`, `verify`, `close`, `list`
- `adopt verify-spec` — brownfield TC stub generator for existing codebases

**`verify-run` behavior change:**
- On test failure with TTY: prompts `Register as bugs? [y/N]` — auto-populates from runner output
- Playwright failures: `detected_by: "playwright"`, `evidence` from `test-results/` if available
- `autoVerifyBugs`: transitions `fixed → verified` when linked TC passes

**`.aitri` schema:** no new fields in v0.1.66.

---

## v0.1.64 — additive

**Breaking for subproducts relying on Aitri auto-registration:**
- `aitri init` and `aitri adopt --upgrade` no longer write to `~/.aitri-hub/projects.json`.
- Hub and other subproducts must manage their own project registries independently.
- Existing `~/.aitri-hub/projects.json` entries are unaffected; only new project creation stops auto-registering.

**New documentation:**
- `docs/integrations/` directory introduced as canonical integration contract.
- `docs/integrations/README.md` — integration model overview.
- `docs/integrations/SCHEMA.md` — consolidates and supersedes `docs/HUB_INTEGRATION.md`.
- `docs/integrations/ARTIFACTS.md` — artifact schemas including node hierarchy for graph consumers.
- `docs/integrations/CHANGELOG.md` — this file.
- `docs/HUB_INTEGRATION.md` — removed. Content migrated to `docs/integrations/SCHEMA.md`.

---

## v0.1.63 — additive

- `complete` now updates `artifactHashes` (previously only `approve` did).
  Hash check returns `false` after successful `complete` — no drift until next modification.
- `aitriVersion` field formalized. Version mismatch detection pattern documented.
- `verifyPassed`, `verifySummary`, `rejections` fields formally added to schema.
- Event schema updated: `"started"` added as valid event type; `afterDrift` on `"approved"` events.
- Feature sub-pipelines (`features/<name>/`) documented.

## v0.1.58 — additive

- `driftPhases[]` field added. Written by `run-phase` on drift; cleared by `complete`/`approve`.
- Subproducts can use `driftPhases[]` as fast path for drift detection.
- `driftPhases[]` may be absent in projects created before v0.1.58 — fall back to hash check.

## v0.1.51 — additive

- Document initial. Fields `artifactHashes`, `events`, `artifactsDir` formalized.
- Drift detection via hash comparison documented.
- Hub integration contract established.

## v0.1.46 — additive

- `aitri init` began auto-registering projects in Hub (removed in v0.1.64).

## v0.1.45 — additive

- `events[]` field added to schema (pipeline activity log).
