# Phase Discovery — Problem Definition

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

{{#IF_FEEDBACK}}
## Feedback to apply
{{FEEDBACK}}
{{/IF_FEEDBACK}}

{{#IF_INTERVIEW_CONTEXT}}
## Interview Context — primary source
The following answers were provided directly by the project owner.
Treat them as primary source — synthesize the discovery from these answers, do not invent beyond them.
Where answers are vague, mark the gap in Evidence gaps.

{{INTERVIEW_CONTEXT}}
{{/IF_INTERVIEW_CONTEXT}}

## Source Idea ({{IDEA_WORD_COUNT}} words)
{{IDEA_MD}}

## Output: `{{ARTIFACTS_BASE}}/00_DISCOVERY.md`
Required sections (in order):
1. ## Problem — what situation forces users to act? What pain do they experience today?
2. ## Users — who are the actual people using this? Describe each type with their context and goal.
3. ## Success Criteria — what does success look like? Use observable, falsifiable metrics (not "it works").
4. ## Out of Scope — what will this explicitly NOT do? List at least 3 boundaries.
5. ## Discovery Confidence — required last section. Format exactly:

   ```
   ## Discovery Confidence
   Confidence: low | medium | high
   Evidence gaps: <bullet list of what is unclear, or "none">
   Handoff decision: ready | blocked — <one-line reason>
   ```

   Gate rules (enforced by `aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} discovery`):
   - `Confidence: low`           → BLOCKED — clarify evidence gaps before Phase 1
   - `Confidence: medium`        → WARNING — flag gaps to stakeholders, may proceed
   - `Confidence: high`          → PASS
   - `Handoff decision: blocked` → BLOCKED regardless of confidence level

## Rules
- Do not mention technologies, architectures, or implementation details
- Every success criterion must be measurable — "users can do X in under Y seconds" not "feels fast"
- Out of scope items must be specific — "no admin panel" not "no extra features"
- Set confidence honestly: low = critical unknowns remain; medium = minor gaps; high = all sections grounded in explicit user statements

## Instructions
1. Generate complete 00_DISCOVERY.md
2. Save to: {{ARTIFACTS_BASE}}/00_DISCOVERY.md
3. Present the Delivery Summary below to the user
4. Run: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} discovery

## Delivery Summary
After saving 00_DISCOVERY.md, present this report to the user:

```
─── Discovery Complete ───────────────────────────────────────
Problem:        [1-sentence summary]
Target users:   [who + context]
Core pain:      [current situation + metric if available]
Confidence:     [low | medium | high] — [reason in one sentence]

Key assumptions flagged:
  - [assumption 1]
  - [assumption 2]
  (list all; none if confidence is high)

Evidence gaps (if any):
  - [gap 1]
──────────────────────────────────────────────────────────────
Next: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} discovery   →   aitri {{SCOPE_VERB}}approve{{SCOPE_ARG}} discovery
```
