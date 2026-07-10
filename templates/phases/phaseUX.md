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
{{CONTEXT_ASSETS}}
## Constraint check — confirm BEFORE designing the UX
If `01_REQUIREMENTS.json` (`constraints` / `technology_preferences`) already states these, **USE them — do NOT re-ask**. For any that are **missing or vague**, confirm with the user **before** designing, and mark anything assumed:
- **Design system / branding** · **Accessibility level** (e.g. WCAG AA) · **Device / viewport targets** · **Performance budget** (load time)

## Output: `{{ARTIFACTS_BASE}}/01_UX_SPEC.md`
> **If the '── Additional context' section of this briefing lists or inlines client-provided mockups / a prototype / a design spec (idea_context/ or feature_context/): OPEN them and TRANSCRIBE their design into the sections below — they are the source of truth (per the first Constraint). The sections are how you WRITE the provided design down completely, element for element (every screen, component, icon, semantic-color rule, affordance, interaction). Do NOT replace a provided decision with an archetype/heuristic default. Generate from the archetype only for what the provided design does not cover, or when none was provided.**

Required sections (in order):
1. ## User Flows — per screen, per user persona. For each flow: entry point, steps, exit point, error path
2. ## Component Inventory — table per screen: component | states (default/loading/error/empty/disabled) | behavior | Nielsen heuristics applied. When a design was provided, this inventory must include EVERY component the mockups/prototype show — do not omit ones the archetype wouldn't have thought of (icons, add-rows, side panels, etc.).
3. ## Nielsen Compliance — per screen: list each relevant heuristic, how the design satisfies it, and any trade-off made
4. ## Design Tokens — **always required**. Every product has a visual layer the developer will implement. Define: color roles (background, surface, primary, accent, error, text-primary, text-secondary, border), type scale (font family rationale, size scale, weights), spacing scale. Derive tokens IN PRIORITY ORDER from: (0) the **client-provided design** if present (mockups/prototype/design spec) — read its actual colors, type, spacing and transcribe them (top authority), (1) explicit visual FRs, (2) archetype defaults, (3) product context from `01_REQUIREMENTS.json` otherwise. Every token must state its reason; a token that contradicts a provided design is wrong.

## Advisory output: `{{ARTIFACTS_BASE}}/UX_PREVIEW.html` — the spec, visible
> A reviewer cannot evaluate `#0F172A` as a color or judge a type scale from numbers. Alongside the spec, generate ONE self-contained `UX_PREVIEW.html` — a **visual manual of the spec** the human opens in a browser at the approve gate. Advisory: `complete ux` does not check it and nothing downstream reads it.

**Generate it ONLY if the product renders in a browser or a GUI toolkit.** For a product with no graphical surface (CLI/TUI, library, service/API) SKIP it and state the reason in the Delivery Summary — an HTML preview of a terminal or an API misrepresents the medium. This is the only skip.

**Hard rule — the preview RENDERS the spec, it never extends it:** every value shown must have a source row in the spec's Design Tokens. The developer implements the spec, never this file. HTML here is only the rendering medium for design approval — it does not imply the product is a web app.

Content (single file, inline CSS only, ZERO external requests — no CDN, fonts, or images):
- **Light and dark panels side by side**, each fixing its OWN palette so the comparison does not depend on the viewer's theme — only if the theme model has both; single panel otherwise.
- **Surface + text swatches**: role, hex, and the token's stated reason from the spec.
- **The type scale rendered at size** and the spacing scale (plus radii, only if the spec defines them).
- **Computed contrast-ratio badges** on accent/text pairs (e.g. `AA 4.9`) — the reviewer verifies the declared accessibility level at a glance.
- At most **ONE small in-context composition strip** (e.g. a stat card + a control + list rows using the tokens), under a visible banner: `ILLUSTRATIVE — non-binding; the spec is the contract`.
- An **honest-gaps note** if any spec token is not rendered, saying which and why.
- Provenance footer: `Generated from 01_UX_SPEC.md — non-binding; the spec is the contract.`

Role by case:
- **No design provided** → this is the proposed look. The human approves it here, where correcting it costs a feedback sentence — not a build refactor.
- **Client-provided design** → this is a **transcription read-back**: title it so, and tell the reviewer to compare it against their own mockups — any difference is a transcription error to fix before approving.
- **Feedback re-run** → REGENERATE the preview from the updated spec; a stale preview is worse than none. Where a current design exists (re-run or feature scope), current-vs-proposed columns are permitted — label the current column as superseded values (that column is exempt from the source-row rule; the proposed column is not).

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
3. Generate {{ARTIFACTS_BASE}}/UX_PREVIEW.html (advisory output above), or record the skip reason
4. Present the Delivery Summary below to the user
5. Run: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} ux

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

Viewport/medium:       [responsive: 375px · 768px · 1440px behavior per screen | fixed medium: declared resolution/terminal size]

Nielsen compliance:    [N/10 heuristics applied]
Nielsen violations:    [N found · N corrected · N accepted trade-off]

Preview:      [UX_PREVIEW.html — open it in a browser to SEE the design | not generated — reason]
──────────────────────────────────────────────────────────────
Next: aitri {{SCOPE_VERB}}complete{{SCOPE_ARG}} ux   →   aitri {{SCOPE_VERB}}approve{{SCOPE_ARG}} ux
```

## Human Review — Before approving phase ux
  [ ] The spec matches the provided design material (mockups/prototype/design doc in the context assets) element for element — no client-provided decision was replaced by an archetype default
  [ ] Every UX/visual/audio FR from Phase 1 is covered by a screen, component, or flow — none silently dropped
  [ ] No invented flows or screens beyond what the requirements and provided design imply
  [ ] Component states are complete (default/loading/error/empty/disabled) for the components that ship
  [ ] Design tokens and contrast meet the declared accessibility level — verified against the tokens table, not assumed
  [ ] The declared viewport/medium targets match the product's real surface (responsive web vs fixed medium)
  [ ] UX_PREVIEW.html was opened and matches the spec's Design Tokens table — or was skipped with a valid reason (no graphical surface). On a provided-design project, it was compared against the client's own mockups (transcription read-back)
  [ ] View-source of UX_PREVIEW.html shows no external URLs — fully self-contained, zero network requests (n/a if the preview was skipped)
