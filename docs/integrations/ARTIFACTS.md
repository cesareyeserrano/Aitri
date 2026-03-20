# Aitri — Artifact Schema Reference

**Aitri version:** v0.1.67+
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
  "technology_preferences": ["string"]
}
```

**Validation rules (enforced by `aitri complete 1`):**
- Required fields: `project_name`, `functional_requirements`, `user_stories`, `non_functional_requirements`
- Minimum 5 `functional_requirements`; minimum 3 `non_functional_requirements`
- All MUST FRs must have a `type` field and at least one `acceptance_criteria` entry
- MUST FRs of type `ux`, `visual`, or `audio` must include at least one criterion with a measurable metric (e.g. pixels, ms, %, contrast ratio)
- All MUST FRs where every AC is purely vague (e.g. "works properly", "runs smoothly") will fail validation
- `user_personas` missing → non-fatal warning (not blocked)

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

**Minimum length:** 30 lines.
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
- `type` must be: `unit` | `integration` | `e2e`
- `scenario` must be: `happy_path` | `edge_case` | `negative`
- Each TC must have: `requirement_id`, `user_story_id`, `ac_id`
- `expected_result` must not be a placeholder (`"it works"`, `"passes"`, `"succeeds"`, etc.)
- Each FR must have a minimum of 3 TCs: one `happy_path`, one `edge_case`, one `negative`
- Each FR must have at least one TC with id ending in `h` (happy path) and one ending in `f` (failure)
- Minimum 2 `e2e` test cases total
- `requirement_id` must be a single FR id — comma-separated ids are rejected
- If `01_REQUIREMENTS.json` is present: TC `ac_id` values are cross-checked against AC ids in `user_stories[].acceptance_criteria`; all MUST FRs must have at least one TC

**TC naming convention:** suffix `h` = happy path (e.g. `TC-001h`), `f` = failure/negative (e.g. `TC-001f`), `e` = edge case (e.g. `TC-001e`).

**Phase gate:** Approved when `"3"` is in `approvedPhases[]`.

---

## 04_IMPLEMENTATION_MANIFEST.json

Written by Phase 4 (Developer persona). Implementation tracking and test runner config.

```json
{
  "files_created": ["path/to/file.js"],
  "setup_commands": ["npm install", "npm run build"],
  "environment_variables": {
    "KEY": "description or default value"
  },
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
- Required fields: `files_created` (non-empty array), `setup_commands`, `environment_variables`
- `technical_debt` field is required — use `[]` if no substitutions were made
- Each `technical_debt` entry must have `fr_id` and a non-generic `substitution`
- `test_runner` is required (e.g. `"npm test"`, `"node --test tests/"`)
- `test_files` must be a non-empty array listing all files with `@aitri-tc` markers

**Phase gate:** Approved when `"4"` is in `approvedPhases[]`.

---

## 04_TEST_RESULTS.json

Written by `aitri verify-run`. Actual test execution output.

```json
{
  "runner": "vitest | jest | pytest | playwright | mocha",
  "passed": 0,
  "failed": 0,
  "skipped": 0,
  "total": 0,
  "test_cases": [
    {
      "id": "TC-001h",
      "status": "pass | fail | skip",
      "notes": "string"
    }
  ]
}
```

Presence implies `verifyPassed` in `.aitri` reflects the last run result.

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
      "resolution": "string | null"
    }
  ]
}
```

**Lifecycle:** `open → fixed → verified → closed`
- `fixed`: developer marks resolved (`aitri bug fix`) — optionally links a TC
- `verified`: auto-set by `verify-run` when linked TC passes, or manually via `aitri bug verify`
- `closed`: archived

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

Check `approvedPhases[]` and `completedPhases[]` in `.aitri` to determine which optional artifacts exist before attempting to read them.

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

## Node hierarchy for graph consumers

Aitri artifacts form a natural hierarchy for visualization:

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
