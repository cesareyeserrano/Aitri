# Phase Discovery — Problem Definition

> **Industry document type:** this artifact (`00_DISCOVERY.md`) is the project's **Product Discovery / Problem Statement**. Title the document `# Product Discovery — Problem Statement` and call it the discovery doc when you summarise it.

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
{{CONTEXT_ASSETS}}
## Ingest the context FIRST, then elicit what's missing
Discovery is not "fill in four headings." It is: **read what already exists → derive the understanding → confirm/ask only what the sources don't answer.**
- If the idea references context — an `## Assets` section, files in the `idea_context/` folder (surfaced in the "── Additional context" section of this briefing), a repo, a doc, mockups, a prior PRD — **READ them before writing anything.** Open the files, look at the mockups, read the docs. Derive Problem / Users / Success / Out-of-Scope from that material; do not re-ask what a provided doc already states.
- Mark in Evidence gaps anything the sources leave unclear, and confirm the three highest-stakes inputs with the owner (the problem, the success metric, the no-go boundaries) — those are unrecoverable if wrong.

## Match the depth to the project (proportional — do not over-process an MVP)
Scale discovery to what's being built:
- **Trivial / MVP** (a landing page, a small script, a one-screen tool): a tight pass is enough — a clear problem sentence, the user, one measurable success criterion, the obvious out-of-scope. Don't manufacture ceremony; confirm the essentials and hand off.
- **Standard / complex** (multi-flow app, integrations, an existing system to extend): full ingestion of the provided context plus real elicitation of the gaps.
The goal is an *honest* understanding sized to the work, not a fixed word count. A thin-but-correct discovery for a landing page is a success; a padded one is noise.

## Elicitation protocol — reason, ask, iterate
This protocol is subordinate to the depth-matching above: **for the trivial/MVP tier, skip to a single confirmation pass** — do not add rounds to a landing page. When uncertainty is non-trivial (complex project, vague idea, contradictory sources), discovery is a conversation, not a form:

1. **Synthesize** your current understanding from the idea + context assets: what you believe, what you doubt, what contradicts.
2. **Logic check — find the contradictions, and MANIFEST them.** Actively test the material: goals that conflict, success criteria impossible under the stated constraints, business rules that are mutually incompatible, users/scope that don't add up, load-bearing unstated assumptions. **A detected contradiction MUST be presented to the user to RESOLVE — never silently harmonized.** For each: state both sides, say why they can't both hold, ask the user which gives. Resolved → record it in `## Resolutions`. Unresolved → it goes to Evidence gaps verbatim and weighs the confidence level honestly.
3. **Derive the open questions this material itself raises** — the contradictions from the logic check, the unknowns, the risks — ranked by impact. Ask the 3-5 whose answers most change the project. NOT the generic form fields.
4. **Present a short discussion brief** to the user: your understanding + the contradictions + the ranked questions. Discuss.
5. **Iterate:** absorb answers → update your understanding → surface the next round only if high-stakes gaps remain → stop when confidence is honestly high or the user calls it.
6. **Only then** write `00_DISCOVERY.md`.

**No human available to iterate with?** Do NOT simulate the conversation — never fake resolutions or invent answers. Unresolved questions go to Evidence gaps verbatim, confidence is set honestly, and the gate below does its job.
{{#IF_PRIOR_DISCOVERY_MD}}
## Prior discovery round — close its gaps, do not restart
A prior `00_DISCOVERY.md` exists (below). Your objective THIS round is to close its Evidence gaps and resolve its open contradictions — do not restart from zero, and do not re-ask what a `## Resolutions` entry already settled. Preserve prior resolutions verbatim unless the user changes a decision.
{{PRIOR_REJECTION_NOTE}}
─── Prior round ──────────────────────────────────────────────
{{PRIOR_DISCOVERY_MD}}
─── End prior round ──────────────────────────────────────────
{{/IF_PRIOR_DISCOVERY_MD}}

## Output: `{{ARTIFACTS_BASE}}/00_DISCOVERY.md`
Required sections (in order):
1. ## Problem — what situation forces users to act? What pain do they experience today?
2. ## Users — who are the actual people using this? Describe each type with their context and goal.
3. ## Success Criteria — what does success look like? Use observable, falsifiable metrics (not "it works").
4. ## Out of Scope — what will this explicitly NOT do? List at least 3 boundaries.
5. ## Resolutions — REQUIRED whenever the conversation resolved a contradiction or made a decision (omit only if there were none). The chat dies; what Phase 1 receives is this artifact (injected whole on its first run) — a resolution not recorded here never happened. One line each: `<the tension> → <what the user decided> → <what it rules out>`. Where a decision supersedes the seed, say so explicitly (`supersedes IDEA.md §X: …`) — and NEVER edit IDEA.md itself; it is the archived historical seed, and this discovery is the newer, user-validated layer that wins on conflict.
6. ## Discovery Confidence — required last section. Format exactly:

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
Contradictions: [N resolved · N open — "none found" if the logic check surfaced nothing]
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

## Human Review — Before approving phase discovery
  [ ] The problem statement describes YOUR real problem — grounded in the idea and provided context, not the agent's reframing of it
  [ ] Target users and their pain match who this is actually for
  [ ] Success criteria are the outcomes you would actually accept as "it worked"
  [ ] Out-of-scope decisions are ones you agree to defer — nothing you need was quietly parked
  [ ] No solutioneering — the document defines the problem; it does not pre-commit architecture or implementation choices
  [ ] Key assumptions flagged by the agent are ones you accept (or correct them and re-run)
  [ ] Contradictions the agent surfaced were resolved by YOU — the agent did not pick a side; every resolution is recorded in ## Resolutions
