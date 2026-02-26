# Design Notes: EVO-025 → EVO-028

> Strategic batch — user experience, input quality, and project health.
> Documented: 2026-02-25

---

## EVO-025 — `aitri status` visual redesign

### Problem
The current status output is a flat checklist of technical flags. It doesn't tell a story,
doesn't prioritize problems, and is unreadable by non-technical stakeholders.

### Goal
A single command that answers three questions instantly:
1. Where is this feature in the pipeline?
2. Is anything broken?
3. What do I do next?

### CLI output design

```
AITRI STATUS — user-login
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PIPELINE
  ✅ Draft  ✅ Approve  ✅ Plan  ✅ Build
  🔄 Testgen  ⬜ Contractgen  ⬜ Prove  ⬜ Deliver
     ↑ current

HEALTH: 🟡 IN PROGRESS — no blockers

NEXT
  aitri contractgen --feature user-login
  Why: 2 contracts are still scaffold placeholders (FR-1, FR-3)

FEATURES (project-wide)
  3 delivered · 1 in progress · 0 blocked
```

### HTML UI design (`aitri status --ui`)
- Pipeline shown as horizontal step tracker (like order tracking)
- Health badge (red/yellow/green) prominently at top
- Issues section: sorted by severity, each with a one-line fix
- Features table: name, phase, health per feature
- Non-technical mode: hides command names, shows narrative descriptions

### Implementation notes
- `getStatusReport()` data model is NOT changed — it's already rich enough
- Only `runStatus()` (CLI output) and `renderStatusInsightHtml()` (HTML) are rewritten
- Pipeline steps derived from `report.factory` + `report.nextStep` state machine
- Health: 🟢 if `nextStep === delivery_complete`, 🔴 if any CRITICAL issue, 🟡 otherwise

---

## EVO-026 — Feature Input Template + `aitri draft` enrichment

### Problem
`aitri draft` accepts free text. Low-quality, vague, or incomplete input produces a
low-quality spec — and all downstream artifacts (testgen, contractgen) suffer as a result.

### Goal
Provide a structured but lightweight input format that any person (technical or not) can
fill out, and that gives `aitri draft` enough signal to auto-complete a high-quality spec.

### Template format (`FEATURE_INPUT_TEMPLATE.md`)

```markdown
# FEATURE INPUT: <feature-name>

## Problem
(What problem does this solve? 1-3 sentences.)

## Who uses it
(User role or persona.)

## Business rules
- Rule 1: ...
- Rule 2: ...

## Concrete examples
| Input | Expected result |
|-------|-----------------|
| ...   | ...             |

## Out of scope
- ...

## Success criteria
(How does the user know it worked?)

## Priority
- [ ] P0 — Critical, blocks everything if missing
- [ ] P1 — High value, ship soon
- [ ] P2 — Nice to have
```

### `aitri draft` behavior change
- If the input file matches the template structure (has `## Business rules` + `## Concrete examples`),
  draft uses those directly to populate FR text, AC Given/When/Then, and edge cases
- If free text is provided, behavior is unchanged (backward compatible)
- LLM prompt is enriched: concrete examples are injected as AC examples, business rules become FRs
- Wizard questions are skipped for fields already answered in the template

### Impact
- `testgen`: concrete examples → `assert.strictEqual(result, expectedValue)` instead of `assert.ok(true)`
- `contractgen`: business rules + examples → implementation with real logic instead of trivial returns
- `approve`: richer FRs raise the confidence score

---

## EVO-027 — Enrich `af_spec.md` artifact format

### Problem
The current spec format is traceable but not executable. FRs like
`FR-1: Must compute the result correctly` give insufficient signal to `testgen` and
`contractgen`. The LLM must guess input types, output types, and edge cases.

### Changes to `af_spec.md` template

**FR block — add Examples and type hint (optional but rewarded):**
```markdown
## 3. Functional Rules (traceable)

- FR-1: Must validate email addresses. [P0]
  - Input: string
  - Returns: boolean
  - Examples: `valid@example.com` → true | `notanemail` → false | `a@b` → false
```

**New section — Business Rules (between FR and Edge Cases):**
```markdown
## 3b. Business Rules
- BR-1: Email must contain exactly one @ symbol.
- BR-2: Domain must have at least one dot after @.
- BR-3: Local part must not be empty.
```

**Priority field on FRs:** `[P0]` / `[P1]` / `[P2]` inline after the FR text.

### `aitri approve` quality gate update
- Warn (not block) when FRs have no examples
- Reward richer FRs in confidence score calculation

### `aitri testgen` + `aitri contractgen` prompt update
- Extract Examples block per FR and inject into LLM prompt
- Extract Business Rules and inject as behavioral constraints

### Backward compatibility
- All existing specs remain valid (new fields are optional)
- `approve` treats missing examples as a warning, not a failure

---

## EVO-028 — `aitri audit`

### Problem
No command exists to audit a project's overall health — whether it's a greenfield Aitri
project with specs or a brownfield project with code but no documentation.

### Two modes

**Spec-aware mode** (when approved specs exist):
1. Spec-to-code drift: for each FR, is the contract implemented (not placeholder)? Does the implementation semantically match the FR text? (LLM check)
2. Coverage gaps: FRs without contracts, TCs without proof-of-compliance, FRs marked UNPROVEN
3. Proof staleness: proof-of-compliance.json older than 30 days or spec changed after last proof
4. Mutation confidence: FRs with mutation score < 50% flagged as MEDIUM risk
5. External signals: runs ESLint/Semgrep/Bandit if available in the project

**Code-only mode** (when no specs exist):
1. Structure analysis: are there tests? are there contracts? is there documentation?
2. LLM reverse-engineering: reads source files, infers what each module does, flags ambiguous or risky behavior
3. Anti-pattern detection: missing error handling, hardcoded secrets, no input validation
4. Recommendation: "Consider running `aitri adopt` to formalize this project into the Aitri cycle."

### Output format

```
AITRI AUDIT — my-project  [spec-aware mode]
Generated: 2026-02-25

CRITICAL (2)  — blocks compliance
  [UNPROVEN]  FR-3: contract exists but proof-of-compliance says ok=false
  [DRIFT]     FR-1: spec says "validate email", contract returns true unconditionally (LLM)

HIGH (1)
  [WEAK-TEST] TC-2: mutation score 0% — assertions do not detect contract changes

MEDIUM (2)
  [STALE]     proof-of-compliance.json is 45 days old
  [LINTER]    3 ESLint errors in src/contracts/fr-2-validate-email.js

LOW (1)
  [COVERAGE]  US-3 has no TC assigned

SUMMARY
  4 features · 1 fully proven · 1 blocked · 2 in progress
  Overall confidence: 52% (medium)
  Recommended action: aitri prove --feature user-login --mutate
```

### Flags
- `aitri audit` — full audit of all features
- `aitri audit --feature <name>` — single feature
- `aitri audit --json` — machine-readable output for CI
- `aitri audit --code-only` — force code-only mode even if specs exist

### Files produced
- `docs/audit/audit-report.json` — full machine-readable findings
- `docs/audit/audit-report.md` — human-readable summary (optional, with `--save`)

---

## Implementation order (recommended)

| Order | EVO | Rationale |
|-------|-----|-----------|
| 1 | EVO-026 | Template + draft enrichment. Highest ROI, lowest effort. Pure docs + prompt change. |
| 2 | EVO-027 | Spec format enrichment. Improves testgen/contractgen immediately with no breaking changes. |
| 3 | EVO-025 | Status redesign. Medium effort, high visibility. No behavior change. |
| 4 | EVO-028 | Audit. Most ambitious. Depends on EVO-026/027 being in place for richer spec data. |
