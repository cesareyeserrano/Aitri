# Aitri — Spec-Driven SDLC Engine

**Agent-agnostic CLI that turns any idea into a production-ready app through a 5-phase pipeline.**

Works with: Claude Code · Codex · Gemini Code · Opencode · any bash-capable agent.

```
npm install -g aitri
```

---

## How it works

You provide the idea. Aitri orchestrates agents through 5 phases. You approve each artifact before moving forward. Every decision is documented, every requirement traced.

```
YOUR IDEA (IDEA.md)
    ↓
[optional] Phase Discovery — Facilitator  → 00_DISCOVERY.md
    ↓
[optional] Phase UX — UX/UI Designer      → 01_UX_SPEC.md
    ↓
Phase 1 — Product Manager     → 01_REQUIREMENTS.json
    ↓ (you approve)
Phase 2 — Software Architect  → 02_SYSTEM_DESIGN.md
    ↓ (you approve)
Phase 3 — QA Engineer         → 03_TEST_CASES.json
    ↓ (you approve)
Phase 4 — Full-Stack Dev       → src/ + tests/ + 04_IMPLEMENTATION_MANIFEST.json
    ↓ (you approve)
[optional] Phase review — Code Reviewer   → 04_CODE_REVIEW.md
    ↓
    ✦ VERIFY                  → 04_TEST_RESULTS.json  ← gate: all tests must pass
    ↓
Phase 5 — DevOps               → Dockerfile + 05_PROOF_OF_COMPLIANCE.json
    ↓
App running on localhost
```

---

## Commands

```
aitri init                                    Initialize project — creates IDEA.md
aitri run-phase <1-5|discovery|ux|review>     Output phase briefing to stdout (agent reads this)
aitri run-phase <phase> --feedback ""         Re-run with feedback after a rejection
aitri complete <phase>                        Validate artifact + record phase as complete
aitri approve <phase>                         Approve phase output, unlock next phase
aitri reject <phase> --feedback ""            Reject with feedback (re-run with aitri run-phase)
aitri verify-run                              Run tests, auto-parse output, write 04_TEST_RESULTS.json
aitri verify-run --e2e                        Also run Playwright tests (requires playwright.config.js)
aitri verify-run --coverage-threshold <N>     Enforce minimum line coverage % (node --test runners)
aitri verify-complete                         Gate: all TCs pass + FR coverage → unlocks Phase 5
aitri status                                  Show pipeline status with ASCII UI
aitri validate                                Validate all artifacts present and approved
aitri --version                               Show version
```

---

## Quickstart

```bash
# 1. Create a project directory and initialize
mkdir my-app && cd my-app
aitri init

# 2. Describe your project in IDEA.md
# (Edit the file — what does the app do? Who uses it? What are the key features?)

# 3. Run Phase 1 — agent generates structured requirements
aitri run-phase 1

# 4. Agent saves 01_REQUIREMENTS.json — you validate it
aitri complete 1

# 5. Review 01_REQUIREMENTS.json. Approve or reject.
aitri approve 1
# or
aitri reject 1 --feedback "Need more security requirements and a reporting module"

# 6. If rejected, re-run with feedback applied
aitri run-phase 1 --feedback "Need more security requirements and a reporting module"

# 7. Repeat complete → approve for phases 2, 3, 4

# 8. After Phase 4 is approved, run tests automatically
aitri verify-run                        # runs tests, parses output, writes 04_TEST_RESULTS.json
aitri verify-run --e2e                  # also run Playwright e2e tests
aitri verify-run --coverage-threshold 80  # enforce 80% line coverage
aitri verify-complete                   # gate: fails if any TC fails or any FR is uncovered

# 9. Phase 5 unlocked — deployment
aitri run-phase 5
aitri complete 5
aitri approve 5

# 10. Validate entire pipeline
aitri validate
```

---

## Artifacts

| Phase | Persona | Artifact | Format |
| :--- | :--- | :--- | :--- |
| discovery (optional) | Discovery Facilitator | `00_DISCOVERY.md` | Markdown |
| ux (optional) | UX/UI Designer | `01_UX_SPEC.md` | Markdown |
| 1 | Product Manager | `01_REQUIREMENTS.json` | JSON |
| 2 | Software Architect | `02_SYSTEM_DESIGN.md` | Markdown |
| 3 | QA Engineer | `03_TEST_CASES.json` | JSON |
| 4 | Full-Stack Developer | `04_IMPLEMENTATION_MANIFEST.json` | JSON |
| review (optional) | Code Reviewer | `04_CODE_REVIEW.md` | Markdown |
| ✦ verify-run | Aitri (auto) | `04_TEST_RESULTS.json` | JSON |
| 5 | DevOps Engineer | `05_PROOF_OF_COMPLIANCE.json` | JSON |

---

## Artifact schemas

### 01_REQUIREMENTS.json

```json
{
  "project_name": "My App",
  "project_summary": "...",
  "functional_requirements": [
    {
      "id": "FR-001",
      "title": "User Login",
      "description": "...",
      "priority": "MUST",
      "type": "security",
      "acceptance_criteria": ["returns 401 on invalid token"],
      "implementation_level": "present|functional|complete|production_ready"
    }
  ],
  "user_personas": [
    { "role": "End User", "tech_level": "low|mid|high", "goal": "...", "pain_point": "..." }
  ],
  "user_stories": [
    {
      "id": "US-001",
      "requirement_id": "FR-001",
      "as_a": "user", "i_want": "to login", "so_that": "I can access my data",
      "acceptance_criteria": [
        { "id": "AC-001", "given": "user exists in DB", "when": "POST /login with valid credentials", "then": "status 200, JWT token returned" }
      ]
    }
  ],
  "non_functional_requirements": [
    { "id": "NFR-001", "category": "Performance|Security|Reliability|Scalability|Usability", "requirement": "p99 < 200ms", "acceptance_criteria": "..." }
  ],
  "no_go_zone": ["No admin panel", "No OAuth — email/password only"],
  "constraints": [],
  "technology_preferences": []
}
```

**Validation rules:**
- Min 5 `functional_requirements`
- Min 3 `non_functional_requirements`
- Every MUST FR must have `type` (`UX|persistence|security|reporting|logic`)
- Every MUST FR must have `acceptance_criteria[]` with at least 1 measurable entry
- `no_go_zone` must have ≥3 items
- UX/visual/audio FRs must have metrics (px, ms, %, fps) in acceptance_criteria

### 03_TEST_CASES.json

```json
{
  "test_plan": { "strategy": "...", "coverage_goal": "80%", "test_types": ["unit","integration","e2e"] },
  "test_cases": [
    {
      "id": "TC-001",
      "requirement_id": "FR-001",
      "user_story_id": "US-001",
      "ac_id": "AC-001",
      "title": "Login — valid credentials",
      "type": "unit|integration|e2e",
      "scenario": "happy_path|edge_case|negative",
      "priority": "high|medium|low",
      "given": "user exists with email=test@example.com",
      "when": "POST /auth/login { email: 'test@example.com', password: 'Pass1!' }",
      "then": "status 200, body contains { token: <JWT> }",
      "steps": ["POST /auth/login with valid email+password"],
      "expected_result": "Returns 200 + JWT token",
      "test_data": {}
    }
  ]
}
```

**Validation rules:**
- Min 3 test cases per requirement (happy path, edge case, negative)
- Min 2 `e2e` tests
- `given/when/then` must use concrete values — SPEC-SEALED rule

### 04_IMPLEMENTATION_MANIFEST.json

```json
{
  "files_created": ["src/index.js", "src/db.js"],
  "setup_commands": ["npm install", "npm test"],
  "environment_variables": [{ "name": "DATABASE_URL", "default": "postgres://localhost/dev" }],
  "technical_debt": [
    { "fr_id": "FR-003", "substitution": "HTML table instead of Chart.js", "reason": "library conflict", "effort_to_fix": "medium" }
  ],
  "test_runner": "npm test",
  "test_files": ["tests/unit.test.js", "tests/integration.test.js"]
}
```

**Validation rules:**
- `files_created` must be non-empty
- `technical_debt` field is **required** (use `[]` if no substitutions made)
- `test_runner` is **required** — exact command to run all tests
- `test_files` is **required** — files containing `@aitri-tc` markers, used by `verify-run`

### 04_TEST_RESULTS.json

Written automatically by `aitri verify-run` — agent never writes this file.

```json
{
  "executed_at": "2026-03-11T12:00:00Z",
  "test_runner": "npm test",
  "results": [
    { "tc_id": "TC-001", "status": "pass|fail|skip", "notes": "" }
  ],
  "fr_coverage": [
    { "fr_id": "FR-001", "tests_passing": 3, "tests_failing": 0, "status": "covered|partial|uncovered" }
  ],
  "summary": { "total": 10, "passed": 10, "failed": 0, "skipped": 0 }
}
```

**Gate rules (`aitri verify-complete`):**
- Every TC from Phase 3 must have a result entry
- Every FR must appear in `fr_coverage` with ≥1 passing test
- Zero `fail` results — any failure blocks Phase 5
- No `uncovered` FRs

### 05_PROOF_OF_COMPLIANCE.json

```json
{
  "project": "My App",
  "version": "1.0.0",
  "phases_completed": [1, 2, 3, 4, 5],
  "overall_status": "compliant|partial|draft",
  "requirement_compliance": [
    { "id": "FR-001", "title": "User Login", "level": "complete", "evidence": "TC-001, TC-002, TC-003 pass" }
  ],
  "technical_debt_inherited": []
}
```

**Compliance levels:** `placeholder` (blocks pipeline) · `functionally_present` · `partial` · `complete` · `production_ready`

---

## Test quality gates

`aitri verify-run` enforces quality beyond just pass/fail:

- **Assertion density scan** — flags TCs with ≤1 `assert.*`/`expect()` call as low-confidence warnings
- **FR traceability** — every FR from Phase 1 must appear in `fr_coverage` with ≥1 passing test; blocks verify-complete if gap detected
- **Coverage gate** — `--coverage-threshold N` enforces minimum line coverage (Node 22+)
- **Playwright e2e** — `--e2e` runs Playwright as a second runner when `playwright.config.js` exists; TC results merged automatically

**Test naming convention** (required for auto-detection):
```js
it('TC-001: description of what is tested', () => {
  // @aitri-tc TC-001
  assert.equal(result, expected);
});
```

---

## Feedback loop

If an agent produces a phase that doesn't meet your standards:

```bash
# Reject with specific feedback
aitri reject 2 --feedback "The data model is missing the audit log table required by NFR-002"

# Re-run — the briefing includes your feedback
aitri run-phase 2 --feedback "The data model is missing the audit log table required by NFR-002"

# Validate the new artifact
aitri complete 2

# Approve when satisfied
aitri approve 2
```

---

## Context drift mitigation

Each phase receives only the fields it needs from previous artifacts. This reduces agent token consumption 40–60% per phase:

| Phase | Receives from Phase 1 | Receives from Phase 3 |
| :--- | :--- | :--- |
| 2 (Architect) | id, title, priority, type, acceptance_criteria | — |
| 3 (QA) | id, title, priority, type, acceptance_criteria | — |
| 4 (Dev) | id, title, priority, type, acceptance_criteria | id, title, type, priority |
| 5 (DevOps) | id, title, priority, type, acceptance_criteria | summary, fr_coverage, failed_tests |

Phase 4 also receives a **Requirements Snapshot** (compact FR list) directly in the briefing — independent of context truncation, resistant to drift.

---

## Design principles

- **Stateless** — every command reads/writes `.aitri` config. Reproducible in CI/CD.
- **Zero dependencies** — only Node.js built-ins (`fs`, `path`, `url`, `child_process`). Works anywhere Node 18+ is installed.
- **stdout as protocol** — `aitri run-phase` prints the briefing. Any agent reads stdout. No agent-specific integration needed.
- **FS as IPC** — artifacts are plain files. Phases communicate through the filesystem. Auditable, inspectable, diffable.
- **Strict gates** — `aitri complete` validates schema and compliance before recording a phase as done.
- **Auto-parsed test results** — `verify-run` runs real tests and parses `✔/✖ TC-XXX` patterns from runner output. Agent never self-reports results.
- **Mandatory technical debt declaration** — Phase 4 blocks completion if `technical_debt` field is absent or generic.
- **Human always approves** — every phase requires explicit `aitri approve` with an interactive checklist. No phase auto-advances.

---

## Compatible agents

Any agent that can:
1. Read stdout from a command
2. Create files in the filesystem
3. Run `aitri complete <n>` when done

**Tested with:** Claude Code · Codex CLI · Gemini Code · Opencode

---

## Requirements

- Node.js 18+
- npm

---

## License

Apache 2.0 — © César Augusto Reyes Serrano
