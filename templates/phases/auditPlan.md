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
1. Read the full Audit Report above
2. For each **Findings → Bugs** entry: propose the exact `aitri bug add` command to run
3. For each **Findings → Backlog** entry: propose the exact `aitri backlog add` command to run
4. For each **Observations** entry: decide whether to defer, monitor, or promote to Backlog — give a one-line reason
5. Group all actions by urgency: Immediate (blocking bugs), Queued (backlog items), Monitored (observations)
6. Add a pipeline recommendation: is the project ready to continue, or do critical findings block the next phase?
7. Present the Action Plan below to the user
8. Execute each command the user confirms

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

Pipeline recommendation:
  [One sentence: ready to continue pipeline / blocked by N critical findings / recommend re-audit after fixes]
────────────────────────────────────────────────────────────
```

After presenting: execute each `aitri bug add` and `aitri backlog add` command the user confirms.
Do not batch-execute without confirmation — the user may want to adjust titles or severity levels.
