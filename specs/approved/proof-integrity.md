# AF-SPEC: proof-integrity

STATUS: APPROVED
Tech Stack: Node.js (ESM)

## 1. Context
Add detection of trivial contracts — contracts that always return `{ ok: true }` without reading any property of the `input` object — in `aitri prove`, `aitri audit`, and `contractgen` persona task output. A trivial contract makes proof-of-compliance structurally invalid: the test always passes regardless of the real system's behavior.
Requirement source: provided explicitly by user (EVO-062 — Ultron test session 2026-03-03).
No inferred requirements were added by Aitri.

---

## 2. Actors
- Aitri CLI user: runs `aitri prove` and `aitri audit` to verify feature delivery
- AI agent: generates contract implementations via `aitri contractgen`

## 3. Functional Rules (traceable)

- FR-1: `aitri prove` must detect contracts that return `{ ok: true }` without reading any property from the `input` parameter and mark those FRs as `trivial_contract` in the proof record.
  - Detection heuristic: the contract function body contains `return { ok: true` and does not contain any reference to `input.` (property access on input)
  - A `trivial_contract` FR is not counted as proven — it is reported separately
  - The proof `ok` field must be `false` if any FR has a `trivial_contract` verdict
- FR-2: `aitri audit` Layer 1 (pipeline compliance) must flag trivial contracts as `HIGH` findings.
  - Finding message: `<contract-file> — contract always returns ok:true without reading input (trivial contract — proof invalid)`
  - Triggered when `proof-of-compliance.json` contains any `trivial_contract` entry, or when contract files are scanned directly and match the heuristic
- FR-3: `aitri contractgen` persona task output must include an explicit instruction against trivial contracts.
  - The Developer persona task prompt must include: "A contract that returns `{ ok: true }` without reading at least one property from the `input` object is invalid. Every contract must verify at least one observable behavior of the system."
- FR-4: `aitri prove` must display `trivial_contract` FRs distinctly in its output — separate from `proven` and `unproven`.
  - Display label: `[TRIVIAL CONTRACT]` — shown before the proven/unproven summary

## 4. Edge Cases
- Contract reads `input` but only to pass it through (e.g., `return { ok: true, fr: "FR-1", input }`) — must still be flagged as trivial (passing `input` whole is not verifying a property)
- Contract conditionally returns `ok: true` based on `input.someProperty` — must NOT be flagged as trivial
- Contract file cannot be read — skip with warning, do not abort prove

## 5. Failure Conditions
- If heuristic check fails on a file, log warning and treat as non-trivial (fail safe toward false negative, not false positive)
- If `proof-of-compliance.json` is in old format without `trivial_contract` field — backward-compatible: treat as no trivial contracts detected

## 6. Non-Functional Requirements
- Trivial contract heuristic must be a pure string/regex check — no AST parsing
- Detection must be deterministic: same contract always produces same result
- All existing `prove` tests must pass after refactor

## 7. Security Considerations
- Contract file content is read and regex-tested only — no execution during heuristic check

## 8. Out of Scope
- Full AST-based static analysis of contracts
- Detecting other categories of invalid contracts (infinite loops, missing error handling)
- Auto-fixing trivial contracts

## 9. Acceptance Criteria (Given/When/Then)

- AC-1: Given a contract that contains `return { ok: true, fr: "FR-1", input }` without any `input.` property access, when `aitri prove --feature <name>` runs, then that FR appears as `trivial_contract` and proof `ok` is `false`.
- AC-2: Given a contract that conditionally returns based on `input.somePath`, when `aitri prove` runs, then that FR is NOT flagged as trivial contract.
- AC-3: Given a proof record with a `trivial_contract` entry, when `aitri audit --feature <name>` runs, then a `[HIGH]` finding appears for that contract.
- AC-4: Given `aitri contractgen --feature <name>` runs, when the Developer persona task is printed, then the output explicitly states that contracts returning `ok: true` without reading `input` properties are invalid.
- AC-5: Given `aitri prove` completes with trivial contracts present, when output is displayed, then trivial contract FRs appear under a distinct `[TRIVIAL CONTRACT]` label separate from proven/unproven sections.

## 10. Requirement Source Statement
- All requirements in this spec were provided explicitly by the user (EVO-062).
- Aitri structured the content and did not invent requirements.
