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

## Source Idea ({{IDEA_WORD_COUNT}} words)
{{IDEA_MD}}

## Output: `{{DIR}}/00_DISCOVERY.md`
Required sections (in order):
1. ## Problem — what situation forces users to act? What pain do they experience today?
2. ## Users — who are the actual people using this? Describe each type with their context and goal.
3. ## Success Criteria — what does success look like? Use observable, falsifiable metrics (not "it works").
4. ## Out of Scope — what will this explicitly NOT do? List at least 3 boundaries.

## Rules
- Do not mention technologies, architectures, or implementation details
- Every success criterion must be measurable — "users can do X in under Y seconds" not "feels fast"
- Out of scope items must be specific — "no admin panel" not "no extra features"

## Instructions
1. Generate complete 00_DISCOVERY.md
2. Save to: {{DIR}}/00_DISCOVERY.md
3. Run: aitri complete discovery
