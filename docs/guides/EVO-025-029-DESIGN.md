# Design Notes: EVO-025 → EVO-029

> Strategic batch — user experience, input quality, project health, and codebase cleanup.
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

## EVO-027 — Artifact format + parser enrichment (expanded)

### What the code audit revealed

After reading `spec-parser.js` and `content-generator.js`:

**`spec-parser.js` — `extractTaggedItems` only reads one line per FR:**
```javascript
const pattern = /^[-*]\s*(FR-\d+)\s*:\s*(.+)$/gmi  // single-line only
```
Any sub-bullets written under a FR are silently discarded. EVO-027 must fix the
parser alongside the template — they are coupled.

**`parseGherkinFromText` fails on multi-line ACs:**
Parser expects Given/When/Then on a single line. Multi-line ACs (common for complex
criteria) produce no gherkin — the system falls back to heuristic construction.

**Tech stack detection is keyword-based with silent fallback to `node-cli`:**
If the spec doesn't mention "Node", "Python", "Go", etc., scaffold defaults to
`node-cli` with no warning. An explicit `## Tech Stack:` field would prevent this.

**Epic IDs (EP-N) are cosmetic:**
`extractTaggedItems` never queries EP-N. No command downstream uses EP IDs.
They're visual groupings only. Decision required: make them traceable or remove the IDs.

**TC Steps section is generated but never parsed:**
`generateTestsContent` writes `- Steps: 1) Given... 2) When... 3) Then...` into
every TC. No command reads it. `testgen` uses FR text + AC text from the spec, not
Steps from tests.md. The section is pure noise in the generated file.

### Changes required

**`af_spec.md` template:**
- Add optional `Examples:` sub-block per FR (input → expected output pairs)
- Add optional `Type:` sub-bullet per FR (input/output type hint)
- Add `[P0/P1/P2]` priority inline after FR text
- Add `## Tech Stack: node | python | go` field (explicit, replaces keyword detection)
- Add `## 3b. Business Rules` section for constraints separate from FRs

**`spec-parser.js`:**
- Extend FR parser to capture multi-line sub-bullets (Examples, Type)
- Extend `parseGherkinFromText` to handle multi-line ACs
- Add explicit tech stack field parser (falls back to current keyword detection if absent)

**`content-generator.js` / tests template:**
- Remove TC Steps generation — it's ignored by all tools and adds token overhead
- Decide on Epics: either parse EP-N downstream or stop generating IDs

**`approve` quality gate:**
- Warn (not block) when FRs have no Examples
- Reward richer FRs in confidence score

### Backward compatibility
All changes are additive. Existing specs without the new fields remain valid.

---

## EVO-028 — `aitri audit`

### Architecture: hybrid static + LLM

**Static layer** (always runs, no AI required):
- Contract existence: does `src/contracts/fr-n-*.js` exist for each FR?
- Placeholder detection: reuses `isContractPlaceholder()` from `prove.js`
- Proof status: `proof-of-compliance.json` exists + `ok: true` + age check
- Mutation score: reads `proof.summary.mutation` — flags score < 50% as HIGH
- TC trace gaps: FRs with no TC pointing to them
- External tools: runs ESLint/Semgrep/Bandit if found in project `package.json` / config

**LLM layer** (optional, requires AI config, skippable with `--no-ai`):
- Persona: Compliance Auditor — reads FR text + contract implementation, asks:
  "Does this code implement this requirement? Any behavioral gaps?"
- Code-only mode: reads source files without spec, infers intent, flags risks

**Code-only mode** (activated when no approved spec exists):
- Replaces spec-aware checks with structural + LLM analysis
- Ends with: "No spec found. Run `aitri adopt` to formalize this project."

### Output format

```
AITRI AUDIT — my-project  [spec-aware mode]
Generated: 2026-02-25

CRITICAL (2)  — blocks compliance
  [UNPROVEN]  FR-3: contract exists but proof-of-compliance says ok=false
  [DRIFT]     FR-1: spec says "validate email", contract returns true unconditionally

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
- `aitri audit` — full audit, all features
- `aitri audit --feature <name>` — single feature
- `aitri audit --no-ai` — static layer only (no LLM calls, safe for CI without API key)
- `aitri audit --code-only` — force code-only mode even if specs exist
- `aitri audit --json` — machine-readable output

### Files produced
- `docs/audit/audit-report.json` — full findings (machine-readable)
- `docs/audit/audit-report.md` — human summary (with `--save`)

---

## EVO-029 — Codebase cleanup

### What to remove or consolidate

**`cli/commands/content-generator.js` — deprecated functions:**
Five functions are marked `@deprecated` since EVO-001 but still compiled and called
on the legacy path: `inferBenefit`, `inferCapability`, `normalizeActor`, `toGherkin`,
`fallbackActor`. They survive because `generatePlanArtifacts` has a fallback to the
heuristic path when `agentContent` is null. Decision: remove the legacy path entirely
and require `agentContent`, or keep but remove the `@deprecated` warnings if the path
is intentionally retained. Either way, the current state is inconsistent.

**TC Steps in `tests.md` template:**
`generateTestsContent` generates `- Steps: 1) Given... 2) When... 3) Then...` per TC.
No command reads this. Remove from the generated output — reduces file size and
token cost when tests.md is fed to LLM prompts (testgen, contractgen).

**Epic IDs (EP-N):**
Either make them traceable (add EP parsing + downstream linkage) or stop generating
`EP-N:` IDs. Half-baked IDs are worse than no IDs — they imply traceability that
doesn't exist.

**Docs audit under `docs/`:**
Review each file for content that no longer matches current commands or architecture.
Specifically: `docs/architecture.md`, `docs/guides/GETTING_STARTED.md`,
`docs/guides/AGENT_INTEGRATION_GUIDE.md`. These predate v0.9.0 and may reference
deprecated commands (`scaffold`, `implement`, `handoff`, `policy`).

**Token economy audit on LLM prompts:**
Review prompts in `testgen.js`, `contractgen.js`, `draft.js` for unnecessary verbosity.
Each extra sentence in a prompt costs tokens on every call. Instructions should be
minimal and unambiguous.

**Dead imports / unused exports:**
Verify no CLI command files export functions that are never imported elsewhere.

---

## Implementation order (recommended)

| Order | EVO | Rationale |
|-------|-----|-----------|
| 1 | EVO-026 | Template + draft enrichment. Highest ROI, lowest effort. Pure docs + prompt change. |
| 2 | EVO-027 | Spec + parser enrichment. Coupled changes. Improves testgen/contractgen immediately. |
| 3 | EVO-025 | Status redesign. High visibility, no behavior change. |
| 4 | EVO-028 | Audit. Most ambitious. Benefits from richer specs (EVO-027). |
| 5 | EVO-029 | Cleanup. Always last — remove what was made redundant by prior EVOs. |
