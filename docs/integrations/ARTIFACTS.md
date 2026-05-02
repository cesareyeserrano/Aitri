# Aitri — Artifact Schema Reference

**Aitri version:** v2.0.0-alpha.16+
**Maintenance rule:** Update this file in the same commit as any artifact schema change.
**Schema source of truth:** `lib/phases/phase1.js` – `phase5.js` `validate()` functions. This document must match what those functions enforce.

All artifacts live in `<project>/<artifactsDir>/`. For new projects `artifactsDir = "spec"`.
Check `artifactsDir` in `.aitri` before constructing paths. See [SCHEMA.md](./SCHEMA.md).

---

## 01_REQUIREMENTS.json

Written by Phase 1 (PM persona). Flat structure — no epics or nested feature hierarchies.

```json
{
  "project_name": "string",
  "project_summary": "string",
  "functional_requirements": [
    {
      "id": "FR-001",
      "title": "string",
      "priority": "MUST | SHOULD | COULD | WONT",
      "type": "string (e.g. security, ux, visual, logic, reporting, persistence, constraint)",
      "description": "string",
      "acceptance_criteria": [
        "string — observable criterion; MUST FRs of type ux/visual/audio must include a measurable metric"
      ]
    }
  ],
  "user_personas": [
    {
      "id": "UP-001",
      "name": "string",
      "description": "string"
    }
  ],
  "user_stories": [
    {
      "id": "US-001",
      "requirement_id": "FR-001",
      "as_a": "string",
      "i_want": "string",
      "so_that": "string",
      "acceptance_criteria": [
        {
          "id": "AC-001",
          "description": "string"
        }
      ]
    }
  ],
  "non_functional_requirements": [
    {
      "id": "NFR-001",
      "category": "string (e.g. Performance, Security, Reliability)",
      "requirement": "string",
      "acceptance_criteria": "string"
    }
  ],
  "constraints": ["string"],
  "technology_preferences": ["string"],
  "original_brief": "string (optional, v0.1.89+) — full content of IDEA.md absorbed at first approve of Phase 1; the file is removed from disk after archive. Historical reference only — never read by Aitri or downstream phases for behavioral decisions."
}
```

**Validation rules (enforced by `aitri complete 1`):**
- Required fields: `project_name`, `functional_requirements`, `user_stories`, `non_functional_requirements`
- Minimum 5 `functional_requirements`; minimum 3 `non_functional_requirements`
- All MUST FRs must have a `type` field and at least one `acceptance_criteria` entry
- MUST FRs of type `ux`, `visual`, or `audio` must include at least one criterion with a measurable metric (e.g. pixels, ms, %, contrast ratio)
- All MUST FRs where every AC is purely vague (e.g. "works properly", "runs smoothly") will fail validation
- MUST FRs whose `title` is fully vague (matches qualifier like "properly"/"correctly"/"correctamente" with <2 substantive tokens remaining after stopword/vague-word removal) will fail validation (v0.1.82+)
- Any pair of FRs (regardless of priority) with ≥3 acceptance_criteria each and ≥90% Jaccard similarity on their AC sets will fail validation — copy-paste of ACs is an anti-pattern (v0.1.82+)
- `user_personas` missing → non-fatal warning (not blocked)
- `original_brief` (v0.1.89+) is additive — not validated, present only after first approve of Phase 1; safe to ignore for old readers

**Phase 1 input handling (v0.1.89+):**
- **First run** (no `01_REQUIREMENTS.json` yet): the agent reads `IDEA.md` from project root as seed input.
- **Re-runs** (`01_REQUIREMENTS.json` exists and parses): the agent reads the current `01_REQUIREMENTS.json` as the SSoT and refines it. `IDEA.md` is irrelevant by design — never reloaded.
- **Archive on first approve**: `aitri approve 1` (first time) absorbs `IDEA.md` into `01_REQUIREMENTS.json.original_brief` and removes the file. Subsequent re-runs cannot drift against a stale brief because the brief no longer exists as a live input.
- **Reset to seed**: delete `01_REQUIREMENTS.json` (the `original_brief` field preserves the seed text for manual recovery).

**Phase gate:** Approved when `"1"` is in `approvedPhases[]`.

---

## 02_SYSTEM_DESIGN.md

Written by Phase 2 (Architect persona). Markdown document — no fixed JSON schema.

**Required sections** (validated by `aitri complete 2`):
- Executive Summary — architecture decisions with justification
- System Architecture — component diagram or description
- Data Model
- API Design
- Security Design
- Performance & Scalability
- Deployment Architecture
- Risk Analysis (minimum 3 risks)
- Technical Risk Flags — must have content (declare `[RISK]` flags or write "None detected" with justification)

Headers accept plain (`## Name`), integer (`## 1. Name`), or decimal (`## 1.1 Name`) prefixes.

**Minimum length:** 40 lines.
**Phase gate:** Approved when `"2"` is in `approvedPhases[]`.

---

## 03_TEST_CASES.json

Written by Phase 3 (QA persona). Test cases keyed to FRs, user stories, and acceptance criteria.

```json
{
  "test_plan": {
    "strategy": "string",
    "coverage_goal": "string",
    "test_types": ["unit", "integration", "e2e"]
  },
  "test_cases": [
    {
      "id": "TC-001h",
      "title": "string",
      "requirement_id": "FR-001",
      "user_story_id": "US-001",
      "ac_id": "AC-001",
      "type": "unit | integration | e2e",
      "scenario": "happy_path | edge_case | negative",
      "priority": "string",
      "preconditions": ["string"],
      "steps": ["string"],
      "expected_result": "string — specific, observable outcome (placeholder values like 'it works' are rejected)",
      "test_data": {},
      "given": "string",
      "when": "string",
      "then": "string"
    }
  ]
}
```

**Validation rules (enforced by `aitri complete 3`):**
- Required: `test_plan`, `test_cases` (non-empty)
- TC `id` values must be unique across `test_cases[]` (v2.0.0-alpha.13+) — duplicates break downstream cardinality (`summary.manual` = Set size vs `results.length` = array length)
- `type` must be: `unit` | `integration` | `e2e`
- `scenario` must be: `happy_path` | `edge_case` | `negative`
- Each TC must have: `requirement_id`, `user_story_id`, `ac_id`
- `expected_result` must not be a placeholder (`"it works"`, `"passes"`, `"succeeds"`, etc.)
- Each FR must have a minimum of 3 TCs, with at least one `happy_path` and one `negative` scenario (edge_case is encouraged but not enforced)
- Each FR must have at least one TC with id ending in `h` (happy path) and one ending in `f` (failure)
- Minimum 2 `e2e` test cases total
- `requirement_id` must be a single id from `01_REQUIREMENTS.json` — either a functional requirement (`FR-xxx`) or a non-functional requirement (`NFR-xxx`). NFR ids are accepted as TC targets when the NFR is declared in `non_functional_requirements[]` (v2.0.0-alpha.9+). Comma-separated ids are rejected.
- For multi-FR TCs, use `"frs": ["FR-001","FR-002"]` (string array) instead of a comma-separated `requirement_id`. `frs` is recognized by `aitri verify-run` (v0.1.90+); when present it wins over `requirement_id`.
- If `01_REQUIREMENTS.json` is present: TC `ac_id` values are cross-checked against AC ids in `user_stories[].acceptance_criteria`; all MUST FRs must have at least one TC
- `verify-run` (v0.1.90+) refuses to run and refuses to write `04_TEST_RESULTS.json` if `test_cases[]` is non-empty and no entry exposes `requirement_id` or `frs` (legacy `requirement` field alone is not enough; migrate explicitly).

**TC naming convention:** suffix `h` = happy path (e.g. `TC-001h`), `f` = failure/negative (e.g. `TC-001f`), `e` = edge case (e.g. `TC-001e`).

**Phase gate:** Approved when `"3"` is in `approvedPhases[]`.

---

## 04_IMPLEMENTATION_MANIFEST.json

Written by Phase 4 (Developer persona). Implementation tracking and test runner config.

```json
{
  "files_created": ["path/to/new-file.js"],
  "files_modified": ["path/to/existing-file.js"],
  "setup_commands": ["npm install", "npm run build"],
  "environment_variables": [
    { "name": "DATABASE_URL", "default": "postgres://localhost/dev" }
  ],
  "technical_debt": [
    {
      "fr_id": "FR-001",
      "substitution": "specific description of what was simplified — generic values like 'none' or 'n/a' are rejected"
    }
  ],
  "test_runner": "npm test",
  "test_files": ["tests/unit.test.js"]
}
```

**Validation rules (enforced by `aitri complete 4`):**
- `setup_commands` and `environment_variables` are optional. When present they must be arrays; when absent they are treated as `[]`. (v2.0.0-alpha.9+ — earlier versions required the keys to be present even when empty.)
- At least one of `files_created` or `files_modified` must be a non-empty array — supports both greenfield (new files only) and modification/redesign work
- `technical_debt` field is required — use `[]` if no substitutions were made
- Each `technical_debt` entry must have `fr_id` and a non-generic `substitution`
- `test_runner` is required (e.g. `"npm test"`, `"node --test tests/"`)
- `test_files` must be a non-empty array listing all files with `@aitri-tc` markers

**Phase gate:** Approved when `"4"` is in `approvedPhases[]`.

---

## 04_TEST_RESULTS.json

Written by `aitri verify-run`. Never written by the agent — always auto-generated from real runner output.

```json
{
  "executed_at": "ISO 8601 timestamp",
  "test_runner": "string — exact command run (e.g. 'pytest tests/ -v')",
  "exit_code": 0,
  "results": [
    {
      "tc_id": "TC-001h",
      "status": "pass | fail | skip | manual",
      "notes": "string",
      "known_gap": true
    }
  ],
  "fr_coverage": [
    {
      "fr_id": "FR-001",
      "tests_passing": 2,
      "tests_failing": 0,
      "tests_skipped": 0,
      "tests_manual": 0,
      "status": "covered | partial | uncovered | manual"
    }
  ],
  "summary": {
    "total": 10,
    "passed": 8,
    "failed": 0,
    "skipped": 1,
    "skipped_e2e": 1,
    "skipped_no_marker": 0,
    "manual": 1
  }
}
```

**Status values:**
- `pass` — TC detected in runner output as passing
- `fail` — TC detected in runner output as failing
- `skip` — TC not detected in runner output (missing marker or requires browser)
- `manual` — TC has `automation: "manual"` in `03_TEST_CASES.json`; excluded from automated runner gate

**FR coverage status values:**
- `covered` — ≥1 passing automated test
- `partial` — mix of pass/fail, or only skipped TCs
- `uncovered` — only failing tests, no passing
- `manual` — all TCs for this FR have `automation: "manual"`; not blocked by verify-complete

**Notes:**
- `known_gap: true` is written by `verify-complete` when a stub TC (from `adopt verify-spec`) is acknowledged as a gap
- Manual TCs do not block `verify-complete` and do not count toward skip percentage
- FRs with `status: "manual"` are exempt from the "zero passing tests" gate in `verify-complete`

---

## 05_PROOF_OF_COMPLIANCE.json

Written by Phase 5 (DevOps persona). FR coverage proof linking requirements to test results.

```json
{
  "project": "string",
  "version": "string",
  "phases_completed": ["1", "2", "3", "4"],
  "overall_status": "compliant | partial | draft",
  "requirement_compliance": [
    {
      "id": "FR-001",
      "level": "placeholder | functionally_present | partial | complete | production_ready",
      "evidence": "string",
      "tc_ids": ["TC-001h", "TC-001f"]
    }
  ]
}
```

**Validation rules (enforced by `aitri complete 5`):**
- Required fields: `project`, `version`, `phases_completed`, `requirement_compliance` (non-empty), `overall_status`
- `overall_status` must be: `compliant` | `partial` | `draft`
- `level` must be: `placeholder` | `functionally_present` | `partial` | `complete` | `production_ready`
- `level: "placeholder"` blocks the pipeline — placeholder implementations cannot be shipped
- Entries use field `id` (not `fr_id`) — a common mistake; validation will report the mismatch
- If `01_REQUIREMENTS.json` is present: every FR with `priority: "MUST"` must have an entry in `requirement_compliance`

**Phase gate:** Approved when `"5"` is in `approvedPhases[]`. Requires `verifyPassed: true`.

---

## BUGS.json

**Written by:** `aitri bug add` (manual) or `aitri verify-run` (auto-prompt on test failure).
**Location:** `<artifactsDir>/BUGS.json` — same directory as other artifacts.
**Optional:** absent until the first bug is registered.

First-class QA artifact. Follows standard bug report format: reproduction steps, expected/actual results, environment, evidence. Integrates with the verify pipeline: `verify-run` auto-promotes `fixed → verified` when the linked TC passes. Critical/high open bugs block `verify-complete`.

```json
{
  "bugs": [
    {
      "id": "BG-001",
      "title": "string — action + result",
      "description": "string",
      "steps_to_reproduce": ["string"],
      "expected_result": "string",
      "actual_result": "string",
      "environment": "string (e.g. 'local / chromium / Phase 4')",
      "severity": "critical | high | medium | low",
      "status": "open | fixed | verified | closed",
      "fr": "FR-XXX | null",
      "tc_reference": "TC-XXX | null",
      "phase_detected": "number | null",
      "detected_by": "manual | verify-run | playwright | review",
      "evidence": "relative path to screenshot/video/log | null",
      "reported_by": "string | null",
      "created_at": "ISO8601",
      "updated_at": "ISO8601",
      "resolution":       "string | null",
      "fix_commit_sha":   "string (optional, v0.1.90+) — HEAD at the moment of `aitri bug fix`",
      "fix_at":           "ISO8601 (optional, v0.1.90+) — timestamp paired with fix_commit_sha",
      "close_commit_sha": "string (optional, v0.1.90+) — HEAD at the moment of `aitri bug close`",
      "close_at":         "ISO8601 (optional, v0.1.90+) — timestamp paired with close_commit_sha",
      "files_changed":    "string[] (optional, v0.1.90+) — paths modified between fix_commit_sha..close_commit_sha, excluding spec/ and .aitri"
    }
  ]
}
```

**Lifecycle:** `open → fixed → verified → closed`
- `fixed`: developer marks resolved (`aitri bug fix`) — optionally links a TC. If the project is a git repo, `fix_commit_sha` + `fix_at` are captured automatically.
- `verified`: auto-set by `verify-run` when linked TC passes, or manually via `aitri bug verify`
- `closed`: archived. If the project is a git repo, `close_commit_sha` + `close_at` are captured. When both `fix_commit_sha` and `close_commit_sha` are present and differ, `files_changed` records the diff (filtered, excludes `spec/` and `.aitri`).

**Audit trail (v0.1.90+):** the fix/close SHA pair plus `files_changed` provides a non-honor-system record of which commit range resolved each bug. Missing if the project has no git repo or HEAD is unreadable — behaviour degrades silently, lifecycle still works.

**Blocking rule:** bugs with `status: "open"` and `severity: "critical"` or `"high"` block `verify-complete`.
**Playwright integration:** when Playwright runs in `verify-run` and a TC fails, `evidence` is auto-populated from `test-results/<folder>/screenshot.png` if the folder exists.

---

## Optional artifacts

| File | Written by | Condition |
|---|---|---|
| `00_DISCOVERY.md` | `aitri run-phase discovery` | Optional phase; present if discovery was run |
| `01_UX_SPEC.md` | `aitri run-phase ux` | Optional phase; present if UX phase was run |
| `04_CODE_REVIEW.md` | `aitri review` | Present if code review was run |
| `BUGS.json` | `aitri bug add` / `aitri verify-run` | Present if any bug has been registered |
| `BACKLOG.json` | `aitri backlog add` | Present if any backlog item has been registered |
| `AUDIT_REPORT.md` | `aitri audit` | Present if an on-demand audit has been run |

Check `approvedPhases[]` and `completedPhases[]` in `.aitri` to determine which optional artifacts exist before attempting to read them.

---

## BACKLOG.json

**Written by:** `aitri backlog add` (manual).
**Location:** `<artifactsDir>/BACKLOG.json`.
**Optional:** absent until the first backlog item is registered.

Project-level tech-debt / deferred-work registry. Separate from `BUGS.json` — backlog captures "we should do this" items (refactors, hardening, observability, follow-ups), while bugs capture defects.

```json
{
  "schemaVersion": "1",
  "items": [
    {
      "id": "BL-001",
      "title": "string",
      "priority": "P1 | P2 | P3",
      "problem": "string — what is missing, fragile, or suboptimal",
      "fr": "FR-XXX | null",
      "status": "open | closed",
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ]
}
```

**Lifecycle:** `open → closed` (via `aitri backlog done <id>`).
**Priority:** `P1` (most urgent) through `P3` (least). Sort order for `aitri backlog list`.
**Integration:** `openBacklogCount` surfaces in `aitri status` and `aitri status --json`.

---

## AUDIT_REPORT.md

**Written by:** agent (instructed by `aitri audit` briefing). **Not** written by Aitri Core.
**Read by:** `aitri audit plan` (generates action plan from findings). Hub may surface it.
**Optional:** off-pipeline artifact — no pipeline phase depends on it. Never blocks validate, approve, or drift detection.

This file is produced on demand at any point in the pipeline. It contains the agent's findings from a holistic technical audit of the codebase across five dimensions: code quality, architecture, logic, security, and stack.

Required sections (exact headings):

```markdown
### Findings → Bugs
Each entry:
  **[BUG-N]** `[severity: critical|high|medium|low]` — Title
  - File: `path/to/file.js:line`
  - Problem: what is broken or incorrect
  - Suggested: `aitri bug add --title "..." --severity [severity] --description "..."`

### Findings → Backlog
Each entry:
  **[BL-N]** `[priority: P1|P2|P3]` — Title
  - File: `path/to/file.js` (if file-specific)
  - Problem: what is missing, fragile, or suboptimal
  - Suggested: `aitri backlog add --title "..." --priority P[N] --problem "..."`

### Observations
Each entry:
  **[OBS-N]** — Title
  - Context: where this applies
  - Concern: what risk or implication this represents
  - Why deferred: reason it is an observation rather than a bug or backlog item
```

Findings that map to bugs should be promoted to `BUGS.json` via `aitri bug add`. Findings that map to tech debt should be promoted to `BACKLOG.json` via `aitri backlog add`. Observations remain in AUDIT_REPORT.md as awareness items.

---

## 06_EXTERNAL_SIGNALS.json

**Written by:** external tools (ESLint, npm audit, GitLeaks, Snyk, custom scripts — anything). **Not** written by Aitri Core.
**Read by:** Hub (surfaces signals as alerts). Other subproducts may ignore this file.
**Optional:** if absent or malformed, no signals are generated — no crash.

This file is the integration point for tools that Hub cannot run directly (static analysis, dependency auditing, security scanning, etc.). Each tool writes its findings here; Hub reads them as-is.

```json
{
  "generatedAt": "2026-03-18T14:00:00Z",
  "signals": [
    {
      "tool":     "eslint",
      "type":     "code-quality",
      "severity": "warning",
      "message":  "15 lint errors found in src/",
      "command":  "npm run lint"
    },
    {
      "tool":     "npm-audit",
      "type":     "dependency",
      "severity": "blocking",
      "message":  "2 critical vulnerabilities in dependencies",
      "command":  "npm audit fix"
    },
    {
      "tool":     "gitleaks",
      "type":     "security",
      "severity": "blocking",
      "message":  "Possible secret detected in src/config.js:42",
      "command":  "gitleaks detect"
    }
  ]
}
```

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `generatedAt` | ISO8601 string | No | When the tool ran — for freshness display |
| `signals` | array | Yes | Empty array = no signals |
| `signals[].tool` | string | Yes | Tool name shown in Hub alert (e.g. `"eslint"`) |
| `signals[].type` | string | Yes | Category label (e.g. `"code-quality"`, `"security"`, `"dependency"`) |
| `signals[].severity` | string | Yes | `"blocking"` \| `"warning"` \| `"info"` — invalid values coerced to `"warning"` |
| `signals[].message` | string | Yes | Human-readable description — shown as alert message |
| `signals[].command` | string | No | Command to resolve the issue — shown as inline code badge in Hub |

### How Hub renders signals

Each signal becomes one alert in Hub's health report:
- `severity: "blocking"` → appears in BLOCKING section, blocks triage
- `severity: "warning"` → appears in WARNING section
- `severity: "info"` → appears in INFO section
- Message is prefixed with `[tool]` — e.g. `[eslint] 15 lint errors found in src/`
- `command` shown as a copyable badge if present

### Integration examples

**npm audit (package.json script):**
```json
"scripts": {
  "hub:signals": "node scripts/generate-signals.js"
}
```

**Minimal shell script:**
```bash
#!/bin/bash
RESULT=$(npm audit --json 2>/dev/null)
CRITICAL=$(echo "$RESULT" | jq '.metadata.vulnerabilities.critical // 0')
cat > spec/06_EXTERNAL_SIGNALS.json << EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "signals": [
    {
      "tool": "npm-audit",
      "type": "dependency",
      "severity": $([ "$CRITICAL" -gt 0 ] && echo '"blocking"' || echo '"warning"'),
      "message": "$CRITICAL critical vulnerabilities",
      "command": "npm audit fix"
    }
  ]
}
EOF
```

Run this script in CI or as a pre-commit hook. Hub picks it up on the next poll cycle.

---

## Node hierarchy for visualization consumers

Aitri artifacts form a natural hierarchy for visualization (used by Hub and any future visual consumer):

```
FR (FR-xxx)  [priority, type]
  ├── Acceptance Criteria (AC-xxx) — within user_stories[].acceptance_criteria
  ├── User Story (US-xxx) → links to FR via requirement_id
  └── Test Case (TC-xxx) → links to FR via requirement_id, AC via ac_id
```

State of each node is derived from `.aitri`:
- Phase 1 approved → FR nodes are `approved`
- Phase 1 in drift → FR nodes are `drift`
- Phase 3 approved → Test Case nodes are `approved`
- Current phase matches → node is `in_progress`
- Otherwise → `pending`
