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

- [ ] P3 — **`IDEA.md` y `ADOPTION_SCAN.md` en raíz del proyecto del usuario** — Ambos archivos quedan en la raíz tras `adopt scan`, contaminando el directorio del usuario y exponiéndolos a borrado accidental.

  Problem: La raíz del proyecto del usuario no es el lugar correcto para archivos generados por Aitri. El usuario los puede borrar por error o confundirlos con sus propios archivos. Además, `spec/` ya existe como carpeta de artefactos — semánticamente `IDEA.md` pertenece ahí.

  Files:
  - `lib/commands/adopt.js` — cambiar paths de escritura de `path.join(dir, 'IDEA.md')` y `ADOPTION_SCAN.md` a `path.join(dir, 'spec', ...)`; crear `spec/` en `adoptScan` en lugar de solo en `adoptApply`
  - `lib/commands/run-phase.js` — línea 68: cambiar `adir = ''` por `adir = artifactsDir` para `IDEA.md`
  - `templates/adopt/scan.md` — actualizar paths de output (`{{PROJECT_DIR}}/spec/IDEA.md`, `{{PROJECT_DIR}}/spec/ADOPTION_SCAN.md`)
  - `test/smoke.js` — actualizar smoke tests que verifican presencia de `IDEA.md` en raíz

  Behavior:
  - `adopt scan` crea `spec/` si no existe, escribe `spec/IDEA.md` y `spec/ADOPTION_SCAN.md`
  - `run-phase 1/2/discovery` busca `IDEA.md` en `spec/` (vía `artifactsDir`)
  - `adopt apply` asume `spec/IDEA.md`

  Decisions:
  - **Defer to v0.2.0 como breaking change explícito** (decidido 2026-03-17): sin dual-path fallback — añadiría deuda permanente en run-phase.js. En v0.2.0: el usuario mueve IDEA.md manualmente o Aitri detecta el archivo en raíz y aborta con instrucción clara.
  - `ADOPTION_SCAN.md` también se mueve — mismo grupo semántico, bajo riesgo individual (solo written by agent, never read by code)

  Acceptance:
  - `adopt scan` en proyecto nuevo: `IDEA.md` y `ADOPTION_SCAN.md` aparecen en `spec/`, no en raíz
  - `run-phase 1` en proyecto con `spec/IDEA.md`: funciona sin advertencia
  - Proyecto legacy con `IDEA.md` en raíz: Aitri aborta con instrucción de migración explícita
  - Smoke tests pasan con 0 failures

---

## Design Studies

> Not implementation items. Open questions that inform future architectural decisions.

### NFR traceability in system design (Phase 2)

Phase 2 (`02_SYSTEM_DESIGN.md`) hoy valida presencia de secciones y longitud mínima, pero no verifica que los NFRs declarados en Phase 1 sean *direccionados* por el diseño. Un design puede tener todas las secciones requeridas y aún ignorar por completo los NFRs de performance/security/availability.

**Pregunta abierta:** ¿Vale la pena intentar matching prosa↔NFR en Phase 2?

**Por qué es Design Study y no ticket:**
- Matching NFR→design requiere NLP ligero sobre Markdown — alto riesgo de falsos positivos.
- Un NFR como "p95 latency <200ms" podría estar direccionado en la sección "Performance & Scalability" sin mencionar el número exacto, pero con una decisión arquitectónica válida (cache layer, CDN).
- Un validator demasiado estricto rechazaría diseños buenos.

**Criterio para madurar a ticket:**
- Un caso real donde un design aprobado ignoró un NFR crítico y rompió producción.
- Sin ese caso, la hipótesis (los agentes ignoran NFRs) no está verificada.

**Alternativa más barata si surge el caso:**
- No validator automático. Extender `aitri review` con un check que liste NFRs de Phase 1 y pregunte al agente/humano "¿cada uno de estos está direccionado en el design? Responde sí/no por cada uno." Honor-system, pero visible.

**Resolved partially (2026-04-20):** La pregunta original de la Design Study ("¿hasta dónde debe llegar Aitri en validar semántica?") quedó respondida de facto por el validation model (2026-03-14) + gates semánticos existentes (BROAD_VAGUE en Phase 1, placeholder detection en Phase 3, FR-MUST coverage en Phase 3/5). Los casos concretos de vagueness en títulos y ACs duplicados se cerraron en v0.1.82. Queda abierta solo la pregunta de NFR traceability.

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
