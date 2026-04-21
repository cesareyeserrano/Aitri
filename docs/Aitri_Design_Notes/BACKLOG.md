# Aitri — Backlog

> Open items only. Closed items are in CHANGELOG.md.
> Priority: P1 (critical) / P2 (important) / P3 (nice to have)

---

## Entry Standard

Every backlog entry must be self-contained — implementable in a future session with zero memory of the original conversation. Before adding an item, verify it answers all of these:

| Question | Why it matters |
| :--- | :--- |
| **What is the user-visible problem?** | Prevents implementing a solution looking for a problem |
| **Which files are affected?** | Implementer knows where to start without exploring |
| **What is the exact behavior change?** | Removes ambiguity about what "done" looks like |
| **Are there technical decisions pre-resolved?** | Captures trade-offs decided during analysis, not during implementation |
| **What does `validate()` or the test need to verify?** | Defines the acceptance criterion at the code level |
| **Are there known conflicts or risks with existing code?** | Prevents regressions on parsers, schemas, or commands |

**Minimum entry format:**
```
- [ ] P? — **Title** — one-line description of the user-visible problem.
  Problem: <why this matters, what breaks without it>
  Files: <lib/..., templates/..., test/...>
  Behavior: <what changes — inputs, outputs, validation rules>
  Decisions: <any trade-offs already resolved>
  Acceptance: <how to verify it works — test or manual check>
```

Entries without `Files` and `Behavior` are considered incomplete and must be expanded before scheduling.

---

## Open

> Ecosystem items (Hub, Graph, future subproducts) live in their own repos' backlogs.
> Core only tracks items that require changes to Aitri Core itself.

### Core — Breaking changes for v0.2.0

- [ ] P3 — **`IDEA.md` and `ADOPTION_SCAN.md` at the root of the user's project** — Both files land at the root after `adopt scan`, polluting the user's directory and exposing them to accidental deletion.

  Problem: The user's project root is not the right place for Aitri-generated files. The user can delete them by mistake or confuse them with their own files. Also, `spec/` already exists as the artifacts folder — semantically `IDEA.md` belongs there.

  Files:
  - `lib/commands/adopt.js` — change write paths from `path.join(dir, 'IDEA.md')` and `ADOPTION_SCAN.md` to `path.join(dir, 'spec', ...)`; create `spec/` in `adoptScan` instead of only in `adoptApply`
  - `lib/commands/run-phase.js` — line 68: change `adir = ''` to `adir = artifactsDir` for `IDEA.md`
  - `templates/adopt/scan.md` — update output paths (`{{PROJECT_DIR}}/spec/IDEA.md`, `{{PROJECT_DIR}}/spec/ADOPTION_SCAN.md`)
  - `test/smoke.js` — update smoke tests that check for `IDEA.md` at the root

  Behavior:
  - `adopt scan` creates `spec/` if missing, writes `spec/IDEA.md` and `spec/ADOPTION_SCAN.md`
  - `run-phase 1/2/discovery` looks up `IDEA.md` in `spec/` (via `artifactsDir`)
  - `adopt apply` assumes `spec/IDEA.md`

  Decisions:
  - **Defer to v0.2.0 as an explicit breaking change** (decided 2026-03-17): no dual-path fallback — it would add permanent debt in run-phase.js. In v0.2.0: the user moves IDEA.md manually, or Aitri detects the file at root and aborts with a clear instruction.
  - `ADOPTION_SCAN.md` moves too — same semantic group, low individual risk (only written by agent, never read by code)

  Acceptance:
  - `adopt scan` in a new project: `IDEA.md` and `ADOPTION_SCAN.md` land in `spec/`, not at root
  - `run-phase 1` in a project with `spec/IDEA.md`: works without warning
  - Legacy project with `IDEA.md` at root: Aitri aborts with explicit migration instruction
  - Smoke tests pass with 0 failures

---

## Design Studies

> Not implementation items. Open questions that inform future architectural decisions.

### NFR traceability in system design (Phase 2)

Phase 2 (`02_SYSTEM_DESIGN.md`) today validates section presence and minimum length, but does not verify that the NFRs declared in Phase 1 are *addressed* by the design. A design can have every required section and still completely ignore the performance/security/availability NFRs.

**Open question:** Is it worth attempting prose↔NFR matching in Phase 2?

**Why it is a Design Study and not a ticket:**
- NFR→design matching requires lightweight NLP over Markdown — high risk of false positives.
- An NFR like "p95 latency <200ms" could be addressed in the "Performance & Scalability" section without mentioning the exact number, but with a valid architectural decision (cache layer, CDN).
- An overly strict validator would reject good designs.

**Criterion to mature into a ticket:**
- A real case where an approved design ignored a critical NFR and broke production.
- Without that case, the hypothesis (agents ignore NFRs) is not verified.

**Cheaper alternative if the case emerges:**
- No automatic validator. Extend `aitri review` with a check that lists Phase 1 NFRs and asks the agent/human "is each one addressed in the design? Answer yes/no per NFR." Honor-system, but visible.

**Resolved partially (2026-04-20):** the Design Study's original question ("how far should Aitri go in validating semantics?") was answered de facto by the validation model (2026-03-14) + existing semantic gates (BROAD_VAGUE in Phase 1, placeholder detection in Phase 3, FR-MUST coverage in Phase 3/5). The concrete cases of title vagueness and duplicate ACs were closed in v0.1.82. Only the NFR traceability question remains open.

---

## Discarded

Items analyzed and explicitly rejected.

| Item | Decision | Reason |
| :--- | :--- | :--- |
| Mutation testing | Discarded indefinitely | Violates zero-dep principle. `verify-run --assertion-density` covers 60% of the same problem at zero cost. Option B (globally-installed stryker) introduces implicit env dependency — worse than explicit dep. ROI does not justify. |
| Aitri CI (GitHub Actions step) | Discarded 2026-04-17 | No active user demand. Contract not stable enough to publish a separate Action. If needed later, lives outside Core. |
| Aitri IDE (VSCode extension) | Discarded 2026-04-17 | Separate product with its own release cycle. Not incremental over the CLI; will be reconsidered if the CLI stabilizes across multiple external teams. |
| Aitri Report (PDF/HTML compliance report) | Discarded 2026-04-17 | User declined the surface. Compliance evidence already lives in `05_PROOF_OF_COMPLIANCE.json` + git history; rendering is a separate concern. |
| Aitri Audit (ecosystem-level cross-project aggregator) | Discarded 2026-04-17 | Functionally duplicates Hub's dashboard. Aitri Core does not maintain a global registry — adding one to support an aggregator violates the passive-producer model. Name also collides with the per-project `aitri audit` command (v0.1.71). |
