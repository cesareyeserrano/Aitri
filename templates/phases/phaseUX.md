# Phase UX — UX/UI Specification

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

{{#IF_FEEDBACK}}
## Feedback to apply
{{FEEDBACK}}
{{/IF_FEEDBACK}}

## User Personas (from Phase 1)
{{USER_PERSONAS}}

## UX/Visual/Audio Requirements
{{UX_FRS}}

## Full Requirements
```json
{{REQUIREMENTS_JSON}}
```

## Output: `{{DIR}}/01_UX_SPEC.md`
Required sections (in order):
1. ## User Flows — per screen, per user persona. For each flow: entry point, steps, exit point, error path
2. ## Component Inventory — table per screen: component | states (default/loading/error/empty/disabled) | behavior | Nielsen heuristics applied
3. ## Nielsen Compliance — per screen: list each relevant heuristic, how the design satisfies it, and any trade-off made
4. ## Design Tokens — **required when any UX/visual FR specifies visual attributes (aesthetic style, color scheme, typography, spacing)**. Define: color roles (background, surface, primary, accent, error, text-primary, text-secondary, border), type scale (font family rationale, size scale, weights), spacing scale. Tokens must be derived from the user's stated aesthetic — not arbitrary choices.

## Rules
- Every UX/visual FR must have a corresponding screen or component in the spec
- Every component must define all 5 states — no state is optional
- Every error state must describe what the user sees AND what action they can take
- Mobile (375px) behavior must be explicit for every screen
- When Design Tokens section is required: the developer must implement exactly these tokens — no improvisation on aesthetics

## Instructions
1. Generate complete 01_UX_SPEC.md
2. Save to: {{DIR}}/01_UX_SPEC.md
3. Run: aitri complete ux
