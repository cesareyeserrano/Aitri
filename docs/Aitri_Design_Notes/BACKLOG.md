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

### Calidad semántica de artifacts

Aitri valida la *estructura* de los artifacts (schema, campos requeridos, conteos mínimos) pero no su *calidad semántica*. Un agente puede producir `01_REQUIREMENTS.json` con 5 FRs técnicamente válidos pero conceptualmente triviales, genéricos, o desconectados del problema real descrito en IDEA.md.

**Pregunta abierta:** ¿Hasta dónde debe llegar Aitri en validar calidad semántica?

Ejemplos de lo que no se valida hoy:
- FR.title de "La app debe funcionar correctamente" pasa validación
- Acceptance criteria copiados entre FRs sin diferenciación
- System design que ignora los NFRs de Phase 1
- Test cases que no ejercen los acceptance criteria (Three Amigos gate cubre ac_id cross-reference, pero no la relevancia del test)

Opciones:
1. Heurísticas de calidad en `validate()` (longitud mínima de títulos, diversidad de ACs, detección de duplicados)
2. Phase de revisión cruzada entre artifacts
3. Dejar la calidad 100% al humano — gates solo verifican estructura

**Criterio de decisión:** No introducir complejidad que genere falsos positivos. Un validator que rechaza artifacts buenos es peor que uno que acepta artifacts mediocres.

---

## Discarded

Items analyzed and explicitly rejected.

| Item | Decision | Reason |
| :--- | :--- | :--- |
| Mutation testing | Discarded indefinitely | Violates zero-dep principle. `verify-run --assertion-density` covers 60% of the same problem at zero cost. Option B (globally-installed stryker) introduces implicit env dependency — worse than explicit dep. ROI does not justify. |
