# Requirements Coverage Audit — idea → FR completeness

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

## Project context
- **Directory:** `{{PROJECT_DIR}}`
- **Pipeline state:** {{PIPELINE_STATE}}

{{#IF_DISCOVERY}}
## Approved discovery — the client's intent (primary source)
{{DISCOVERY}}
{{/IF_DISCOVERY}}

{{#IF_ORIGINAL_BRIEF}}
## Original brief (absorbed from IDEA at Phase 1)
{{ORIGINAL_BRIEF}}
{{/IF_ORIGINAL_BRIEF}}

{{#IF_IDEA}}
## Raw IDEA / seed
{{IDEA}}
{{/IF_IDEA}}

{{#IF_REQUIREMENTS_SUMMARY}}
## Functional requirements to check coverage against (summary — read the full file)
{{REQUIREMENTS_SUMMARY}}
{{/IF_REQUIREMENTS_SUMMARY}}

## Coverage Audit Protocol
1. Read the FULL artifacts, not just the summaries above: `{{ARTIFACTS_BASE}}/00_DISCOVERY.md` (if present), `{{ARTIFACTS_BASE}}/01_REQUIREMENTS.json` (its `original_brief` and `functional_requirements`), and any root `IDEA.md`. The summaries are orientation, not proof.
2. Extract every client-expressed need + the explicit out-of-scope boundaries (Step 1).
3. Trace each need to an FR — COVERED / PARTIAL / UNCOVERED (Step 2).
4. Run the skeptical pass — drop out-of-scope and renamed-but-covered needs (Step 3).
5. Append surviving gaps to the "Requirements Coverage" section of AUDIT_REPORT.md.
6. Present the Coverage Summary below.

## Coverage Summary
After writing AUDIT_REPORT.md, present this to the user:

```
─── Requirements Coverage Audit ────────────────────────────
Project:        {{PROJECT_NAME}}
Needs traced:   [N]
  Covered:      [N]
  Partial:      [N]  ← FR covers part, sub-capability missing
  Uncovered:    [N]  ← client asked, no FR covers it
Top gap: [one sentence — the most important uncovered need, or "none"]
────────────────────────────────────────────────────────────
Next: re-open Phase 1 to add the missing FRs, OR record each as an explicit out-of-scope decision.
```

## Output: append to `{{ARTIFACTS_BASE}}/AUDIT_REPORT.md`
Use exactly this heading:

### Requirements Coverage
Each gap:
  **[GAP-N]** `[UNCOVERED|PARTIAL]` — the client need (quote the source line)
  - Source: `00_DISCOVERY.md` / `original_brief` / `IDEA.md` — the exact line
  - Status: UNCOVERED (no FR covers it) | PARTIAL (FR-id covers X, missing Y)
  - Action: re-open Phase 1 to add an FR, OR record an explicit out-of-scope decision with a one-line reason

  _(If no gaps: write "Complete — every traced need maps to an FR or an explicit out-of-scope line." and list what you traced, so completeness is evidenced, not assumed.)_

## Human Review — before acting on the findings
  [ ] Every gap quotes the exact source need (not paraphrased)
  [ ] Out-of-scope needs are excluded, not reported as gaps
  [ ] Partial covers name the specific missing sub-capability
  [ ] No invented scope — only needs the client actually expressed
  [ ] Each gap has a clear action — add the FR (re-open Phase 1) or record the out-of-scope decision
