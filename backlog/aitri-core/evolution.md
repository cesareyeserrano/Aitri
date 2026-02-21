# Aitri Evolution Backlog

## 🟢 Ready for Implementation

- **[EVO-010] Command: `aitri doctor` — Doc Policy Enforcement Gate**
  - **Source:** Critique session 2026-02-20. Promised in `docs/DOC_POLICY.md` but not implemented.
  - **Priority:** High
  - **Context:** `DOC_POLICY.md` defines a hard file budget for `docs/`. `aitri doctor` should scan `docs/` and warn (or fail with `--strict`) when unlisted files are present. Also usable as a CI gate.
  - **Scope:**
    - Read permitted file list from `docs/DOC_POLICY.md` (or a machine-readable sidecar)
    - Walk `docs/` recursively
    - Report files not in the permitted list
    - Exit `0` (warnings only) or `1` (with `--strict`)
    - JSON output with `--json`
  - **Out of scope:** Auto-deleting files.

- **[EVO-011] Enhancement: Structural Spec Quality Gate (non-LLM)**
  - **Source:** Critique session 2026-02-20. `aitri spec-improve` is LLM-only — no structural check exists.
  - **Priority:** Medium
  - **Context:** A spec can be formally approved even if it has empty sections, FRs without ACs, or duplicate IDs. These are structural defects that don't require an LLM to detect.
  - **Scope:**
    - Add a `--structural` flag to `aitri spec-improve` (or integrate into `aitri approve`)
    - Checks: every FR has at least one AC, no empty FR/AC body, no duplicate FR-*/AC-* IDs, no placeholder text (`TODO`, `TBD`, `...`)
    - Fails `aitri approve` when structural defects are found (unless `--force`)
    - No LLM call required
  - **Out of scope:** Semantic quality (that remains LLM territory).

- **[EVO-012] Enhancement: `aitri verify-coverage` — Contract Import Check**
  - **Source:** Critique session 2026-02-20. Once in Post-Go, Aitri has no enforcement that implementation actually references the contracts it generated.
  - **Priority:** Medium
  - **Context:** `aitri scaffold` generates contract files in `src/contracts/`. The agent can implement briefs without ever importing them. `aitri verify-coverage` closes this gap by checking that each contract file is imported in at least one test stub.
  - **Scope:**
    - Walk `src/contracts/<feature>/`
    - For each contract file, check if it is imported/required in any file under `tests/<feature>/generated/`
    - Report uncovered contracts
    - Exit `0` (all covered) or `1` (gaps found)
    - Integrate as an optional gate in `aitri deliver` pre-flight
  - **Out of scope:** Runtime test execution (that remains `aitri verify`).

## 🟡 In Progress

_(none)_

## 🔴 Done

| ID | Feature | Delivered |
|----|---------|-----------|
| EVO-META | Relay Protocol — `aitri checkpoint` / `aitri resume` | v0.3.x |
| EVO-001 | Auditor Mode — `aitri plan --ai-backlog --ai-tests` | v0.4.0 |
| EVO-002 | Semantic validation gate — `aitri verify-intent` | v0.4.0 |
| EVO-003 | State-aware context engine — `aitri diff` | v0.4.0 |
| EVO-004 | Architecture + docs realignment | v0.5.0 |
| EVO-005 | TC marker regex relaxed (`// TC-1` without colon) | v0.4.0 |
| EVO-006 | Contract-test scaffold linkage (`{{CONTRACT_IMPORT}}`) | v0.4.0 |
| EVO-007 | Flexible spec heading numbering in `aitri approve` | v0.4.0 |
| EVO-008 | Project adoption — `aitri adopt` (3 phases) | v0.5.0 |
| EVO-009 | Version-aware migration runner — `aitri upgrade` v2 | v0.5.0 |
