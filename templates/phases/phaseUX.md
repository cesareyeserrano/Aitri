# Phase UX — UX/UI Specification

> **Industry document type:** this artifact (`01_UX_SPEC.md`) is the project's **UX / Design Spec**. Title the document `# UX / Design Spec` and call it the UX spec when you summarise it.

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

## Constraint check — confirm BEFORE designing the UX
If `01_REQUIREMENTS.json` (`constraints` / `technology_preferences`) already states these, **USE them — do NOT re-ask**. For any that are **missing or vague**, confirm with the user **before** designing, and mark anything assumed:
- **Design system / branding** · **Accessibility level** (e.g. WCAG AA) · **Device / viewport targets** · **Performance budget** (load time)

## Output: `{{ARTIFACTS_BASE}}/01_UX_SPEC.md`
Required sections (in order):
1. ## User Flows — per screen, per user persona. For each flow: entry point, steps, exit point, error path
2. ## Component Inventory — table per screen: component | states (default/loading/error/empty/disabled) | behavior | Nielsen heuristics applied
3. ## Nielsen Compliance — per screen: list each relevant heuristic, how the design satisfies it, and any trade-off made
4. ## Design Tokens — **always required**. Every product has a visual layer the developer will implement. Define: color roles (background, surface, primary, accent, error, text-primary, text-secondary, border), type scale (font family rationale, size scale, weights), spacing scale. Derive tokens from: (1) archetype defaults, (2) explicit visual FRs if present, (3) product context — read it from `01_REQUIREMENTS.json` (the `original_brief` field carries the absorbed seed brief; `project_summary` carries the refined description) otherwise. Every token must state its reason — no arbitrary choices.

## Rules
> `aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} ux` mechanically checks only that the four required sections are present and the spec is ≥30 lines. The rules below are NOT auto-enforced — they are verified by the human reviewer at approve and inherited by the developer, who builds from this spec alone. Write them in good faith; a thin spec that clears the gate still ships a broken UI.
- Every UX/visual FR must have a corresponding screen or component in the spec
- Every component must define all 5 states — no state is optional
- Every error state must describe what the user sees AND what action they can take
- Mobile (375px) behavior must be explicit for every screen
- Design Tokens are the source of truth for all visual decisions — the developer implements exactly these tokens, no improvisation on aesthetics

{{#IF_BEST_PRACTICES}}
{{BEST_PRACTICES}}
{{/IF_BEST_PRACTICES}}

## Instructions
1. Generate complete 01_UX_SPEC.md
2. Save to: {{ARTIFACTS_BASE}}/01_UX_SPEC.md
3. Present the Delivery Summary below to the user
4. Run: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} ux

## Delivery Summary
After saving 01_UX_SPEC.md, present this report to the user:

```
─── UX Spec Complete ─────────────────────────────────────────
Archetype:    [name] — [description]
Screens:      [N] — [list names]
Components:   [N] (each with 5 states: default/loading/error/empty/disabled)

Design Tokens:
  Background:   [hex]   Surface: [hex]
  Primary:      [hex]   Accent:  [hex]   Error: [hex]
  Text primary: [hex]   Text secondary: [hex]
  Font:         [family] · [scale summary]
  Contrast:     all roles ≥4.5:1 [confirmed | gaps: list]

Responsive breakpoints: [375px · 768px · 1440px — behavior per screen]

Nielsen compliance:    [N/10 heuristics applied]
Nielsen violations:    [N found · N corrected · N accepted trade-off]
──────────────────────────────────────────────────────────────
Next: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} ux   →   aitri {{SCOPE_VERB}}approve{{SCOPE_ARG}} ux
```
