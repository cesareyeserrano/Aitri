# Aitri Evolution Backlog

## 🟢 Ready for Implementation

_(vacío)_

---

## 🟡 In Progress

_(vacío)_

---

## 📋 Backlog

### EVO-067 — `checkpoint` fail-safe

**Feedback:** Si `aitri checkpoint` falla (index.lock, permisos), el error se suprime y el agente continúa sin estado guardado. Pérdida de estado silenciosa entre sesiones.

**Scope:**
- `cli/commands/checkpoint.js`: capturar errores de escritura en `DEV_STATE.md`
- Si falla: salir con exit code no-zero + mensaje descriptivo con causa (`EACCES`, `ELOCKED`, etc.)
- Eliminar cualquier "continue anyway" path en el flujo de checkpoint

**Prioridad:** Alta — fallo silencioso en una operación de safety es inaceptable.

---

### EVO-068 — `deliver` workspace hygiene gate

**Feedback:** `aitri deliver` puede completarse con cambios dirty no relacionados al feature mezclados en el repo.

**Scope:**
- En `deliver.js`: correr `git status --porcelain` antes de los gates finales
- Clasificar archivos dirty: `.aitri/` → evidence (ok), `src/contracts/<feature>/` y `tests/<feature>/` → feature-owned (ok), resto → unrelated (warn o block)
- Si hay unrelated: mostrar lista agrupada + "Stage feature-only changes and stash the rest before delivery."
- Con `--yes`: advertencia visible pero no bloquea (CI-friendly)
- Sin `--yes`: confirmación explícita requerida

**Prioridad:** Alta — `deliver` es el gate final; entregar con workspace sucio contradice el propósito del guardarraíl.

---

### EVO-071 — UX persona: FR explícitos + `draft` inyecta `ux-design.md` + guía SKILL

**Feedback:** `ux-design` produce un documento de visión en prosa. El agente lo trata como spec directa y escribe código sin pasar por `draft → approve → plan → build`.

**Scope:**
1. `core/personas/ux-ui.md` — agregar sección 7: **"Implementable Requirements"** con `FR-XX` + `AC-XX.x` en formato Aitri. Nota explícita: "These FRs are input for `aitri draft`, not implementation instructions."
2. `cli/commands/draft.js` — inyectar `.aitri/ux-design.md` como sección "UX Context" si existe (igual a `dev-roadmap.md`).
3. SKILL.md (4 adapters) — agregar en Command Mapping: "UX improvements that touch code → `aitri ux-design --force`, then `aitri draft --feature ui-<name>` using the FR list from section 7."

**Nota:** Implementar antes de EVO-047. EVO-071 añade líneas a `draft.js`; EVO-047 debe refactorizar después.

**Prioridad:** Alta — sin esto, UX improvements bypasean el pipeline completo.

---

### EVO-070 — `aitri close --feature X`: closure report

**Feedback:** No existe un comando que confirme el cierre limpio de un feature. El agente inventa el resumen de cierre sin base verificable.

**Scope:**
- Nuevo comando `aitri close --feature <name>` (o `--json`)
- Output: gate status (approve/go/deliver ✓/✗), proof-of-compliance summary, commits del feature (baseline: fecha de aprobación del spec), audit findings pendientes en `docs/audit/audit-findings.json`
- No destructivo — solo lectura y reporte

**Prioridad:** Media-alta — cierra el loop del pipeline, evita cierres inventados.

---

### EVO-069 — Pre-planning: verificar que el artefacto fue escrito

**Feedback:** Los comandos de pre-planning outputan el prompt y terminan con exit 0 aunque el agente no haya escrito el archivo. El siguiente comando falla sin explicación clara.

**Scope:**
- Al final de cada comando de pre-planning: verificar si `.aitri/<artifact>.md` existe
- Si no existe: exit no-zero + `"Artifact not found: .aitri/<artifact>.md — did the agent write the file? Re-run when ready."`
- Si `--non-interactive`: error inmediato

**Prioridad:** Media — mejora fiabilidad del pipeline sin cambio de arquitectura.

---

### EVO-052 — Stack movido a post-arch (`draft` solo pregunta override)

**Feedback:** La pregunta de stack aparece en `draft` antes de que el arquitecto haya definido la arquitectura. El stack debería ser consecuencia del diseño, no una pregunta inicial.

**Scope:**
- `draft`: convertir la pregunta de stack en "¿Tienes restricción de stack? Si no, el arquitecto lo definirá."
- `arch-design`: el arquitecto propone el stack como parte de su output
- `build`: leer stack desde `arch-decision.md` si existe, desde `aitri.config.json` como fallback

**Prioridad:** Media.

---

### EVO-045 — Integration tests con LLM real

**Motivación:** Todo el test suite es smoke/unit. Gaps que solo tests de integración detectan: cambios en prompt format que rompen el parsing, regresiones en el output de `discover`, `plan`, `spec-improve`.

**Scope:**
- `tests/integration/` — tests `@slow` que requieren `ANTHROPIC_API_KEY`
- `npm run test:integration` — script separado, no corre en CI básico
- Cobertura mínima: `draft → approve → discover → plan` con un feature real pequeño

**Prioridad:** Media.

---

### EVO-059 — `aitri doctor` orphan scan

**Feedback:** `aitri doctor` no detecta huérfanos: FRs sin TC asociado, TCs sin FR padre, funciones con `@aitri-trace` con IDs inexistentes en la spec.

**Scope:**
- Extender `cli/commands/doctor.js`: sección "Orphan Check"
- Output: lista de huérfanos con path + línea
- Informativo, no bloqueante

**Prioridad:** Baja — no urgente hasta que haya proyectos con specs completas.

---

### EVO-053 — Formato de US explícito al generar

**Feedback:** Al generar User Stories no quedó claro si seguían el template Aitri (`FR-01`/`AC-01.x`) o uno ad-hoc.

**Nota:** EVO-071 cubre el caso de UX (la persona ya outputa `FR-XX`). Este EVO aplica al resto del pipeline (`draft`, `plan`).

**Scope:**
- Al generar spec/draft, mostrar al inicio: "Generating spec in Aitri format: `FR-XX` with criteria `AC-XX.x`"

**Prioridad:** Baja — cosmético pero afecta confianza en el output.

---

### EVO-046 — `resume --feature` cross-epic awareness

**Motivación:** `resume --feature X` no consulta qué épica contiene el feature. El contexto de progreso relativo (cuántos features del epic están done) no se puede computar.

**Scope:**
- En `runResumeCommand`: cuando `options.feature` está presente, buscar la épica contenedora via `readEpicsSummaryFromDocsRoot` (ya disponible en `epic.js`)
- Añadir `epicContext: { epicName, position, total, delivered }` al JSON output

**Prioridad:** Baja — `activeEpic` ya funciona para el caso común.

---

### EVO-047 — Reducir `draft.js` por debajo del hard limit

**Motivación:** `draft.js` supera el hard limit (350 líneas). Deuda técnica. Implementar después de EVO-071 (que añade inyección de `ux-design.md`).

**Scope:**
- Extraer validación de idea a `validateIdea(idea)` en `cli/lib/`
- Extraer construcción del prompt a función pura `buildDraftPrompt(options)`
- Sin cambio de comportamiento ni interface

**Prioridad:** Baja — deuda técnica, depende de EVO-071.

---

## 🔴 Done

> Historial completo en `git log`. Release actual: **v1.3.0**

### EVO-066 — `audit` report: formato humano + guía post-audit (DONE 2026-03-03)

`printReport` reescrito: header con fecha + scope, secciones por severidad con título narrativo, health score ("Healthy / Minor issues / Attention needed / Action required"), bloque "Next steps" contextual. `Post-Audit Behavior` añadido a los 4 SKILL.md. Test actualizado (`/Summary/` → `/Health/`).

---

### EVO-063 — pre-planning → draft: conexión automática (DONE 2026-03-03)

`runtime-flow.js` `resume` detecta cuando todos los 7 artefactos `.aitri/` existen y no hay feature en progreso: muestra "Pre-planning: complete ✓", recomienda `aitri draft --feature <your-feature-name>` con mensaje why explícito.

---

### EVO-065 — `audit` framing confuso (CLOSED — cubierto por EVO-061)

`aitri audit` sin args corre Layer 2+3+4 sobre todo el proyecto. `--feature` activa Layer 1 (pipeline compliance). Principio: "audit responde ¿está sano el proyecto hoy?".

---

### EVO-062 — Contratos triviales: proof-of-compliance inválido (DONE 2026-03-03)

`prove.js` detecta `trivial_contract`; `audit.js` Layer 1 lo reporta como HIGH; `contractgen` task prompt incluye instrucción explícita de invalidez.

---

### EVO-061 — `audit` refactor: scope proyecto + output-prompt pattern (DONE 2026-03-03)

Walk desde root con SCAN_EXCLUDE (no solo `src/`). Layer 4 removido de `callAI` → outputea prompts para agente. Layers 2+3 siempre corren.

---

### EVO-051 — UX output pobre (CLOSED — causa raíz: SKILL compliance pre-EVO-054)

Re-test en Ultron con adapter actualizado: output correcto. Causa raíz era SKILL compliance del adapter Codex antes de EVO-054/055/056. Cerrado sin cambio de prompt. (Calidad del contenido → EVO-071.)

---

### EVO-058 — `@aitri-trace` traceability header en contractgen (DONE)

`core/personas/developer.md`: toda función debe incluir `@aitri-trace` con US-ID/FR-ID/TC-ID. Todos los adapters SKILL.md actualizados.

---

### EVO-054 — Agent compliance: no improvisar fuera de comandos Aitri (DONE)

Regla 8: prohibición explícita de trabajo fuera del pipeline. Regla 9: documentar gap si no existe comando. Command Mapping table: 22+ acciones → comando correspondiente.

---

### EVO-048 + EVO-049 — Gate CTA + Closing block obligatorio (DONE)

Gate CTA: Pattern A ("¿Lo ejecuto ahora?") / Pattern B ("Cuando estés listo, corre:"). Bloque `→ Siguiente` obligatorio al cierre de cada turno.

---

### EVO-044 — Stale context detection (DONE)

`cli/lib/staleness.js`: `checkStaleness`/`warnIfStale`. `build.js` y `discovery-plan-validate.js` avisan si pre-planning artifacts son más nuevos que el plan. Warning informativo, no bloqueante.

---

### EVO-043 — Eliminar `handoff`, limpiar deprecation list (DONE)

Eliminado `handoff` de `cli/index.js`. `scaffold`/`implement` conservados sin label DEPRECATION. Fix latente: `resume --feature X` ya pasa el feature correctamente.

---

### EVO-042 — Semantic context injection tests (DONE)

`cli-smoke-semantic-context.test.mjs`: verifica que `build` inyecta `architecture-decision.md` en implementation briefs. 3 tests de `--force` guard para pre-planning.

---

### EVO-041 — Épicas: container de features (DONE)

`aitri epic create/status`: `docs/epics/<name>.json`. `resume --json` incluye `activeEpic`/`epicProgress`. 14 tests en `cli-smoke-epic.test.mjs`.

---

### EVO-040 — `aitri approve` semantic gate (DONE)

Persona `architect.md` evalúa coherencia spec vs `architecture-decision.md`. Output `ARCH_CONCERN:` lines. `--yes` no bloquea; sin AI config se omite silenciosamente.

---

### EVO-039 — Resume pre-planning awareness + `--force` (DONE)

`resume` detecta `prePlanningStatus: not-started | in-progress | complete`. `--force` en los 7 comandos de pre-planning sobreescribe sin borrar manualmente.

---

### EVO-038 — Pre-planning alimenta el pipeline real (DONE)

`draft` inyecta `dev-roadmap.md`; `plan` inyecta `architecture-decision.md`/`security-review.md`/`ux-design.md`/`qa-plan.md`; `build` inyecta `architecture-decision.md`/`security-review.md`. `docs/architecture.md` reescrito.

---

### SKILL-002 — OpenCode: ejecutar desde workspace root (CLOSED — ya implementado)

`adapters/opencode/SKILL.md` Core Contract: ejecutar desde workspace root, verificar con `pwd`.

---

### SKILL-001 — Gemini: anti-shadow-change (CLOSED — ya implementado)

`adapters/gemini/SKILL.md` Bootstrap paso 6: re-read artifacts desde disco antes de cada paso.

---

### EVO-037 — Persona-Driven SDLC (DONE)

`cli/persona-loader.js`: 7 comandos pre-planning. `spec-improve` usa `architect.md`, `testgen` usa `qa.md`, `contractgen` usa `developer.md`, `audit` usa 4 personas.

---
