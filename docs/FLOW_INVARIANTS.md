# Flow Invariants — normative intake/gate model

**Committed, living document. Last validated: rc.145 (intake-gap conformance sweep, 2026-07-02).**

This is the **normative** contract for the pipeline's data flow: what each phase MUST receive and HOW
(content vs actionable pointer), which gates apply, and what is mechanically enforceable vs an honest
honor-system ceiling. It is **prescriptive** — future conformance audits validate against THIS, so
"green" and "conformant" stop being blind assertions. It is deliberately distinct from the *descriptive*
`docs/ARCHITECTURE.md` (the stable mental map): ARCHITECTURE says what Aitri *is*; this says what the
flow *must uphold*. Keep it current in the same commit as any change to phase inputs, an `extract*`
transform, the intake/injection policy, or a gate — a stale normative doc silently re-blinds the audits
it exists to sharpen.

Origin: the 2026-07-02 conformance sweep (9 parallel tracers, one per phase + one for gates, each tracing
a concrete fixture through `cmdRunPhase` and diffing the ACTUAL briefing against prompt/persona claims).
Premise: rc.144/ADR-066 fixed a CRITICAL intake gap (context handed to the agent as bare paths, silently
skipped) that many prior audits missed by reasoning abstractly instead of tracing a real case. This model
exists so that class stays checkable, not re-missed. The method — **trace a concrete case, capture the
real briefing, diff against claims** — is the audit protocol, not just how this draft was produced.

## The three invariants (the conformance bar)

- **I1 — Input delivery.** Every input a phase/prompt/persona is supposed to use reaches the agent as
  USABLE CONTENT — not a bare path, not truncated/dropped by an `extract*`/`head()` transform
  (`lib/phases/context.js`), not blanked by a mode switch (`isRerun`, feature-vs-root scope, an unwired
  `optionalInput`).
- **I2 — Gate strength.** Every gate that COULD be mechanical is mechanical; it fires in non-TTY where
  intended (the `isTTY` + `process.exit(1)` pattern); it is not theater (validating field presence
  without preventing a real defect).
- **I3 — Prompt-vs-mechanism.** Wherever a prompt/persona CLAIMS or INSTRUCTS something ("open the
  mockups", "these are authoritative"), the mechanism actually delivers the precondition.

## The identity ceiling (what is UN-closable, by design)

Aitri is a zero-dep, **no-vision**, passive prompt producer. Therefore:

- **Binary/visual assets (images, `.fig`, `.pdf`, `.sketch`) can NEVER be injected.** The honest maximum
  is a LOUD, actionable "OPEN each before writing — structural review does NOT verify you reflected them"
  pointer. Whether the agent truly opened a PNG is honor-system and unprovable. `[pilot-only]`.
- **"Did the agent read/reflect content" cannot be mechanically proven.** A gate that attests it is
  theater (an agent that skipped an asset lists it and marks it `reviewed` without opening it). Rejected
  in ADR-065/066. Advisory source-capture / design→FR checks (`review.js`) are the honest backstop.
- **Semantic coverage cannot be judged.** Aitri enforces mechanical structure (schema, cross-artifact FR
  coverage, vagueness heuristics); a human judges content.

Everything NOT on this list that a phase needs and can be delivered as content MUST be — a gap there is a
real defect, `[mechanical: testable]`.

---

## Per-phase model

Notation: **content** = injected in-full into the briefing (skip impossible). **pointer** = loud
"OPEN each" path (the ceiling for un-injectable material). **path-list** = light reference listing
(downstream phases building on approved artifacts). Producer transform = the `extractContext` of the
phase that PRODUCED the artifact is applied on consumption (`run-phase.js:114`), never the consumer's.

**Placement invariant (rc.150, C2):** whatever its form, the context block renders INSIDE the briefing
via the template's `{{CONTEXT_ASSETS}}` placeholder, positioned BEFORE the Output/Instructions sections
— never appended after the Delivery Summary / `Run: aitri complete` block (an agent that stops at the
instructions must still have seen the client material). A template that drops the placeholder falls back
to the after-briefing print (defensive only); `test/rendered-briefing.test.js` pins the ordering per phase.
Two more C-phase invariants the same suite pins: **scope-correct floors** ({{MIN_FR}}/{{MIN_NFR}}/{{MIN_NGZ}}
render from the `phase1.js#scopeFloors` SSoT shared with the gate, framed as floors-not-targets — sizing
comes from the seed via coverage_map, never from the floor), and the **persona/template division rule**
(`lib/personas/README.md`: personas carry role+judgment only; ALL mechanics live in the template).

### discovery (optional; `00_DISCOVERY.md`)
- **MUST receive:** `IDEA.md`/`FEATURE_IDEA.md` as **content** (identity extract, no truncation; missing
  → hard error). `idea_context/`/`feature_context/` readable text as **content** (ADR-066 injection,
  `injectContent` true); images + oversized text as **pointer**; secrets never inlined (`SECRET_BASENAME_RE`);
  budget demotion is loud on stderr. `--guided` interview → `interviewContext` as content (both TTY and
  agent-mode paths deliver).
- **Gate (`complete discovery`):** anchored section regex + min-lines + Discovery-Confidence gate
  (BLOCKS on low/blocked). `[mechanical]`, fires non-TTY. Transcription fidelity is honor-system `[pilot-only]`.
- **Conformance 2026-07-02: PASS** (all I1/I2/I3).

### 1 / requirements (`01_REQUIREMENTS.json`)
- **MUST receive:** first run → `IDEA.md` content + `idea_context/` injection (ADR-066). Re-run → its own
  `01_REQUIREMENTS.json` (raw via `readArtifact` in `buildBriefing`, NOT through `extractRequirements`, so
  no field drop on the self-refinement path); IDEA/discovery correctly blanked (distilled into FRs;
  `original_brief` archived; `00_DISCOVERY.md` never deleted, re-read by `audit requirements`), and
  `idea_context/` STILL injects on re-run (client reference survives). Feature scope → `FEATURE_IDEA.md`
  + `feature_context/` + `PARENT_REQUIREMENTS.json` content + parent `idea_context/` as read-only pointer (TPA-4).
- **Gate (`complete 1`):** `validateSeedProvenance` + `validateCoverageMap` — mechanical structural checks,
  fire non-TTY, skip once approved. `coverage_map` makes a dropped provided decision catchable (not impossible).
  ADR-065 maturity classification is honor-system `[pilot-only]`.
- **Conformance 2026-07-02: PASS** — exemplar class closed here. One low/cosmetic residual (FIND-3 below).

### ux (optional; `01_UX_SPEC.md`)
- **MUST receive:** `01_REQUIREMENTS.json` content (identity). `idea_context/`/`feature_context/` readable
  design (`.md`, **`.html`**, whitelisted text ≤32KB) as **content** (ADR-066; the `.html` prototype the
  Ledger pilot skipped now injects); mockup images + oversized design as **pointer**; `.svg` deliberately a
  pointer (visual). Framing is the `injectContent` branch ("provided material authoritative for what it
  specifies") NOT "reference only" (MINOR-3). Archetype detection renders SUBORDINATE to a provided design.
- **Gate (`complete ux`):** 4 sections + ≥30 lines; template is HONEST that transcription fidelity is
  human-verified, not gated. No theater.
- **Conformance 2026-07-02: PASS** — the ADR-065 Ledger failure (persona generating from archetype while
  mockups were "not in the hierarchy") is closed at both mechanism and prompt level.

### 2 / architecture (`02_SYSTEM_DESIGN.md`)
- **MUST receive:** `01_REQUIREMENTS.json` via `extractRequirements` (keeps constraints, no_go_zone,
  tech_prefs, personas, FR{id,title,priority,type,acceptance_criteria}, US given/when/then, NFR
  acceptance_criteria). `01_UX_SPEC.md` (optionalInput) as **content** with the "Data Model must hold every
  entity / API must expose an operation for every user action" directive (rc.139/AUDIT-0630-C — landed).
  `idea_context/` is a **path-list** with "reference only" framing (`injectContent` false) — CORRECT: phase 2
  builds on the approved, human-validated requirements, not raw pre-decision material.
- **Gate (`complete 2`):** structural section-presence; depth human-judged. Not theater.
- **Conformance 2026-07-02: PASS.** `fr.description` is stripped (affects 2/3/4) but was reviewed and
  DELIBERATELY left stripped in rc.140 (given/when/then + ACs carry the testable content) — not a new defect.

### 3 / tests (`03_TEST_CASES.json`)
- **MUST receive:** `01_REQUIREMENTS.json` via `extractRequirements` — FR/US/NFR acceptance_criteria all
  forward (AUDIT-0630-D `nfr.acceptance_criteria` regression HOLDS), no_go_zone + "do NOT test these"
  directive, constraints. `02_SYSTEM_DESIGN.md` in FULL (phase2 identity extract — no `head()` truncation),
  with the stack-neutral "test against the contract" directive (rc.139). `01_UX_SPEC.md` (optionalInput) as
  content + "Declared-design fidelity TCs" instruction (rc.137) → a build missing declared color/layout FAILS
  verify-run.
- **Gate (`complete 3`):** cross-artifact — dangling `requirement_id` → error; MUST FR/NFR with no active TC
  → error; min-3 (happy+negative) per covered requirement. `[mechanical]`, hard-blocks.
- **Conformance 2026-07-02: PASS** — one low/gate-backstopped residual (FIND-2 below).

### 4 / build (`04_BUILD_REPORT.json`)
- **MUST receive:** requirements (`extractRequirements`), tests (`extractTestIndex` — full given/when/then),
  design (identity). `01_UX_SPEC.md` (optionalInput) as **content** (rc.137 — makes design verifiable).
  NOT in `CONTEXT_PHASES` → no bulk `idea_context/` injection (deliberate anti-staleness: build works from
  approved artifacts). Three narrow phase-4 blocks: failing-tests debug mode; ADOPT-BUILD audit pointer
  (only if `ADOPTION_AUDIT.md`); AUDIT-0630-B visual-reference pointer (only if UX spec — surfaces images +
  `.html` WITH paths as "open these"). All three fire correctly and coexist (`+=`, non-clobbering).
- **Gate:** no `complete`-time content gate; the real gate is the downstream verification spine.
- **Conformance 2026-07-02: PASS with one residual** (FIND-1 below — readable `.md`/`.txt` design refs
  surface nowhere at build; images/`.html`/`.pdf` do).

### 5 / deploy (`05_TRACEABILITY.json`)
- **MUST receive:** requirements via `extractRequirements` (producer) THEN `extractRequirementsForCompliance`
  (phase5 buildBriefing — a live DOUBLE extraction, kept-fields a strict subset, composition clean; NOT dead
  code). Build report (`extractManifest`), test results (`extractTestResults` — `fr_coverage` is the SSoT for
  compliance levels). Drops NFR `priority` + NFR/FR `acceptance_criteria` from the briefing — BENIGN: the
  compliance level is driven by `fr_coverage` status, and every mechanical gate re-reads
  `01_REQUIREMENTS.json`/`04_TEST_RESULTS.json` from DISK, not the briefing.
- **Gate:** `verifyPassed` prerequisite (fires non-TTY via `err`); MUST-presence cross-check; no-placeholder;
  over-claim-above-evidence block; level/status enum — all mechanical, disk-backed. `overall_status:compliant`
  honesty is honor-system `[pilot-only]` regardless of briefing.
- **Conformance 2026-07-02: PASS** — no field the deploy audit needs is missing.

### review (optional; `04_CODE_REVIEW.md`; requires Phase 4 approved)
- **MUST receive:** requirements/tests/build report + `02_SYSTEM_DESIGN.md` & `01_UX_SPEC.md` as
  optionalInputs in FULL (AUDIT-0630-A regression HOLDS; `{{#IF_}}` blocks collapse cleanly when absent).
  Produced SOURCE CODE is NOT delivered (Aitri never reads the repo) — the persona correctly INSTRUCTS the
  agent to open `files_created` itself ("read the ACTUAL code"). Honest delegation, not theater.
- **Gate:** `extractReviewVerdict` — mechanical, non-TTY, shared by `validate` + `reviewGate`.
- **Conformance 2026-07-02: PASS.** `head(content,80)` on phaseReview is dead (nothing consumes
  `04_CODE_REVIEW.md`) but harmless. Consistency note: the "Files to review" path-list lacks the loud
  "OPEN each" pointer the build briefing has — carried today by the persona's "actual code" language.

---

## Cross-cutting gate model (I2)

- **Verification spine (`verify-run`/`verify-complete`) — CORRECTLY STRONG `[mechanical]`.** MUST FR with
  failing OR zero-passing test → BLOCKED (`fr_coverage`). Required `quality_gates` spawn real commands,
  judged by exit code (missing binary → error); advisory gates warn. `strictAssertions` opt-in blocks
  ≤1-assertion TCs. Blocking-bug gate (critical/high open|in_progress, case-folded via `isBlockingBug` SSoT)
  → BLOCKED. Run-binding hash (`hashResultsFile`, whitespace/EOL-tolerant) BLOCKS a results file whose stamp
  matches a different original. **As of rc.148 (ADR-069, B1): an ABSENT stamp is ALSO blocked** — a results
  file not produced by a sanctioned run cannot gate deployment; the rc.129–rc.147 backward-compat window is
  closed. `tc verify` holds the same line — it refuses a stamp-less file (fabrication guard: its re-stamp
  would otherwise bless a hand-written file, defeating B1 in one command) and a file edited since its stamp
  (laundering guard) (B2). The binding is re-checked on every read surface via the
  `state.js#verifyResultsBinding` SSoT (`bound`/`mismatch`/`no-stamp`/`missing-file`): `computeHealth.deployable`
  blocks on root `mismatch`/`missing-file` AND on a terminal feature's (`feature_results_tampered`),
  `validate`/`status --json` report real drift, `phase5.validate` refuses a compliance proof over a mismatch
  (B3). verify-complete's own stub-known-gap rewrite persists its re-stamp at the rewrite (not at function
  end), so a later gate exit cannot strand a falsely-"tampered" file.
- **Honest ceiling (unchanged identity):** a fully-adversarial agent that rewrites BOTH the results file AND
  `.aitri#verifyResultsHash` (both writable) still passes — the binding raises forgery cost to a deliberate
  state-file edit, it does not make the gate unforgeable. `[pilot-only]` on that residual, NOT an I3 violation.
- **isTTY-gated state commits** (approve-drift, rehash, reconcile --resolve, run-phase pipeline-complete
  re-run, feature discard) all `process.exit(1)` in non-TTY. `reject` is DELIBERATELY ungated (advisory,
  scriptable) — NOT a defect.
- **State-integrity rules (rc.149, ADR-070):** an UNKNOWN state is reported unknown, never clean — an
  unreachable reconcile baseline refuses (`--init` recovers); a CORRUPT record is refused, never reset —
  malformed `.aitri` (all parse failures, extending G-4) and malformed `BUGS.json` (all bug commands +
  bug-reading gates) both refuse with restore guidance; `.aitri.local` can only supply `LOCAL_FIELDS` on
  read (shared keys there are ignored + warned); `computeHealth` requires an approved artifact to EXIST on
  disk (`artifact_missing` blocks deploy); detecting off-pipeline drift clears `verifyPassed` (the resolve
  gate requires a verify that postdates the drift); de-blocking a critical/high bug requires evidence
  (`--resolution`/`--tc`), and only a `fixed` bug can be verified.
- **`export traceability`** derives/flags cross-artifact inconsistency (over-claim, uncovered MUST, orphan
  ids) rather than trusting fields; `--out` has a path-traversal/clobber guard. **`validate`** is a reporting
  projection over the snapshot; `--ci` opt-in exits non-zero. **`audit`** is a reasoning command emitting
  `AUDIT_REPORT.md`, not a pipeline gate (honor-system mitigation by design).
- **Advisory-by-ceiling (correct):** Phase-1 source-capture + Phase-2 design→FR checks (`review.js`) are
  warnings — a hard string gate was rejected as the "no_go_zone-leak trap" (false-fires on prose). ADR-066
  hardened their UPSTREAM (inject content) instead. `[pilot-only]`.

---

## Residual findings (2026-07-02 sweep) — ranked, verified against code

All three are `[mechanical: testable]`, none Critical, none a silent drop that ships untested code. The
exemplar class (ADR-066/065) is CLOSED across discovery/1/ux; these are bounded second-order residuals.

**Resolution (rc.145, ADR-067):** FIND-1 FIXED (build design-reference block is now form-agnostic — lists
every context asset as a pointer, no extension filter). FIND-2 FIXED (`nfr.priority` forwarded for parity —
symmetry cleanup, near no-op on canonical schema). FIND-3 HELD (investigated → the framing is accurate, not
a defect). Details below retained as the record of what was found.

### FIND-1 — readable text design refs (`.md`/`.txt`) are invisible at BUILD (I1+I3). REAL, narrow.
`VISUAL_RE` (`context-assets.js:19`) covers `png|jpg|…|pdf|fig|…` and the build visual-reference filter is
`visualAssets(all) + .html?` (`run-phase.js:430`) — so a `.png`/`.pdf`/`.html` design ref surfaces as a
pointer at build, but a readable `.md`/`.txt` design ref (e.g. `idea_context/DESIGN_SYSTEM.md`) surfaces in
NO form and with no stderr note (phase 4 is not in `CONTEXT_PHASES` → no injection). **Bounded:** ADR-066
injects that `.md` at ux/phase-1 and the UX author is told to transcribe it into `01_UX_SPEC.md` (which DOES
reach build), so this only bites as a backstop when UX transcription was lossy AND no visual asset triggers
the block. **Staleness-safe fix (NOT injection):** widen the visual-reference pointer block to list readable
non-artifact-chain text in the context folder as an "open this" pointer — surfaces existence without leaking
potentially-stale content. The asymmetry (`.pdf` surfaces, `.md` does not) is the cleanest argument.

### FIND-2 — `extractRequirements` drops `nfr.priority` (I1+I3). REAL, LOW, gate-backstopped.
FR extract keeps `priority` (`context.js:29`); NFR extract does not (`context.js:44-55`) — an unprincipled
asymmetry (uncommented, unlike the `acceptance_criteria` forward beside it). Affects phases 2/3/4. QA cannot
distinguish a plain `priority:MUST` NFR from a SHOULD NFR at design time. **NOT escaped coverage:** the phase-3
gate re-reads priority from disk (`isMustRequirement`) and forces every MUST NFR to ≥1 TC, then min-3 forces
the full set — so coverage is mechanically protected regardless of the briefing. Cost is design-time signal
loss only. **Fix:** add `priority: nfr.priority` to `extractRequirements` (+`extractRequirementsForCompliance`
for parity). One-field additive, no schema change. Tier-2 consistency fix (the gate already prevents the
defect it would otherwise cause). Found independently by the tests AND deploy tracers.

### FIND-3 — re-run asset framing "no upstream artifact is approved yet" (I3). MARGINAL / likely non-defect.
`groundingFirst` (`run-phase.js:299`) is `phase==='discovery' || phase===1`, re-run-blind. On a phase-1
re-run the asset block prints "…(no upstream artifact is approved yet)". The requirements tracer read this as
false-adjacent to the re-run template's "01_REQUIREMENTS.json already exists". **Downgraded on verification:**
Phase 1 has no upstream PIPELINE artifact that gets approved (its only prior is the IDEA seed / optional
discovery); the re-run `01_REQUIREMENTS.json` is phase 1's OWN output being refined, not upstream. So the
parenthetical is defensible; at most it's confusing next to the re-run wording. `hasCurrentReqs`
(`run-phase.js:78`) already exposes the re-run signal if a wording tweak is ever wanted. Lowest priority;
arguably do-not-fix.

### Consistency note (not a finding)
The review phase's "Files to review" path-list lacks the loud "OPEN each — Aitri did not include their
content" pointer that the build briefing carries. Not a defect today (the reviewer persona's repeated
"actual code" language carries the instruction); flagged as the single place a future persona edit could
re-open ambiguity.
