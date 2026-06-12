# Audit Action Plan

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

## Context
- **Project:** {{PROJECT_NAME}}
- **Pipeline state:** {{PIPELINE_STATE}}

## Audit Report
{{AUDIT_REPORT}}

## Planning Protocol
1. Read the full Audit Report above — it may contain findings from the code audit (`aitri audit`), a requirements-coverage audit (`aitri audit coverage`), AND/OR a security audit (`aitri audit security`). Route each section to the right action.
2. For each **Findings → Bugs** entry: propose the exact `aitri bug add` command to run
3. For each **Findings → Backlog** entry: propose the exact `aitri backlog add` command to run
4. For each **Observations** entry: decide whether to defer, monitor, or promote to Backlog — give a one-line reason
5. For each **Requirements Coverage** gap (UNCOVERED / PARTIAL): this is a SCOPE decision, NOT a bug or backlog item — route it to the requirements. Propose either re-opening Phase 1 to add the missing FR (`aitri run-phase 1`, which re-derives Phase 1 and cascade-invalidates downstream), OR recording the client's need as an explicit out-of-scope decision. Never file a coverage gap as a bug/backlog item — that buries a missing requirement as ordinary debt.
6. For each **Security** finding (RQ-SEC-NNN): route by priority. P0 = an active exposure — file it as a bug (`aitri bug add --severity critical|high`) so it blocks deploy readiness. P1/P2 = hardening work — route to the requirements (re-open Phase 1 to add the security FR/NFR) or to the backlog, preserving the RQ-SEC id in the title. If the report proposes a **quality_gate verification script**, propose creating it and declaring it in `04_BUILD_REPORT.json#quality_gates` so `verify` re-checks the posture every cycle — that is the permanent half of the remediation.
7. Group all actions by urgency: Immediate (blocking bugs + security P0s), Queued (backlog items), Monitored (observations), Scope (coverage gaps — decide add-FR vs out-of-scope), Security hardening (P1/P2 + the permanent gate)
8. Add a pipeline recommendation: is the project ready to continue, or do critical findings (including uncovered MUST-level needs and security P0s) block the next phase?
9. Present the Action Plan below to the user
10. Execute each command the user confirms

## Action Plan Format
Present this plan to the user:

```
─── Audit Action Plan ──────────────────────────────────────
Project: {{PROJECT_NAME}}

IMMEDIATE — Run these now (blocking bugs):
  $ aitri bug add --title "..." --severity critical --description "..."
  [... one line per critical/high bug]

QUEUED — Add to backlog:
  $ aitri backlog add --title "..." --priority P1 --problem "..."
  [... one line per backlog item, sorted by priority]

MONITORED — Observations deferred:
  [OBS-N] [title] — [one sentence: why deferred and when to revisit]

SCOPE — Client needs missing from the requirements (from `audit coverage`):
  [GAP-N] [the client need] — add the FR OR record out-of-scope
  $ aitri run-phase 1     # if adding the FR — re-derives Phase 1, cascades downstream
  [... or: "out-of-scope — <one-line reason>" if the need is intentionally excluded]

SECURITY — Findings from `audit security` (P0s also appear under IMMEDIATE as bugs):
  [RQ-SEC-NNN] [P0|P1|P2] [the exposure] — [bug filed / add security NFR via run-phase 1 / backlog]
  Permanent gate: [create the proposed verification script + declare it in quality_gates, or "none proposed"]

Pipeline recommendation:
  [One sentence: ready to continue pipeline / blocked by N critical findings / recommend re-audit after fixes]
────────────────────────────────────────────────────────────
```

After presenting: execute each `aitri bug add` and `aitri backlog add` command the user confirms.
Do not batch-execute without confirmation — the user may want to adjust titles or severity levels.
