# Project Audit — On-Demand Technical Review

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

## Project context
- **Directory:** `{{PROJECT_DIR}}`
- **Pipeline state:** {{PIPELINE_STATE}}

{{#IF_REQUIREMENTS_SUMMARY}}
## Declared requirements (FR summary)
{{REQUIREMENTS_SUMMARY}}
{{/IF_REQUIREMENTS_SUMMARY}}

{{#IF_DESIGN_SUMMARY}}
## System design (excerpt)
{{DESIGN_SUMMARY}}
{{/IF_DESIGN_SUMMARY}}

{{#IF_OPEN_BUGS}}
## Known open bugs (already tracked)
{{OPEN_BUGS}}
{{/IF_OPEN_BUGS}}

## Audit Protocol
1. Read the project entry points, package manifest, and top-level structure to orient yourself
2. For each of the five audit dimensions, read the actual code — do not infer from filenames alone
3. For each finding, classify immediately: Bug, Backlog, or Observation
4. Write all findings to `{{ARTIFACTS_BASE}}/AUDIT_REPORT.md` using the required format
5. Present the Audit Summary below to the user
6. Tell the user to run `aitri audit plan` to convert findings into Aitri actions

## Audit Summary
After writing AUDIT_REPORT.md, present this to the user:

```
─── Audit Complete ─────────────────────────────────────────
Project:        {{PROJECT_NAME}}

Findings:
  Bugs:         [N]  ([critical: N] [high: N] [medium: N] [low: N])
  Backlog:      [N]  (top priority: [P1/P2/P3])
  Observations: [N]

Top finding: [one sentence — the single most important thing found]
────────────────────────────────────────────────────────────
Next: aitri audit plan   →   classify findings into Aitri actions
```

## Output: `{{ARTIFACTS_BASE}}/AUDIT_REPORT.md`
Required sections — use exactly these headings:

### Findings → Bugs
Each entry:
  **[BUG-N]** `[severity: critical|high|medium|low]` — Title
  - File: `path/to/file.js:line` (required — no file reference = invalid entry)
  - Problem: what is broken or incorrect, and what breaks as a result
  - Suggested: `aitri bug add --title "..." --severity [severity] --description "..."`

  _(If no bugs found: write "None found." and explain what was checked)_

### Findings → Backlog
Each entry:
  **[BL-N]** `[priority: P1|P2|P3]` — Title
  - File: `path/to/file.js` (if file-specific; otherwise name the module or area)
  - Problem: what is missing, fragile, or suboptimal — specific and actionable
  - Suggested: `aitri backlog add --title "..." --priority P[N] --problem "..."`

  _(If no backlog items found: write "None found." and explain what was checked)_

### Observations
Each entry:
  **[OBS-N]** — Title
  - Context: where this applies (file, module, or area)
  - Concern: what risk or implication this represents
  - Why deferred: what makes this an observation rather than a bug or backlog item

  _(If no observations: write "None.")_

## Human Review — Before running audit plan
  [ ] Every Bug entry has a specific file and line reference
  [ ] Every Backlog item has a specific problem description (not generic advice)
  [ ] Known open bugs (listed above) are not duplicated in Findings → Bugs
  [ ] Observations are genuinely non-actionable right now
  [ ] Security findings name specific files and the attack surface they expose
