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

> Historial completo en `git log`. Para v1.2.x e inferior ver `git log --oneline`.
> Release actual: **v1.3.0**

### EVO-072 — `init` next-steps: guiar hacia pre-planning, no `draft` directo (DONE 2026-03-04)

`init.js` ahora imprime `→ Next: run \`aitri resume\` to see your next step. For new projects, start with \`aitri discover-idea\`.` `getStatusReport` en `status.js` overrides `recommendedCommand` con el primer artefacto pre-planning faltante cuando `nextStep === "aitri draft"` y `.aitri/discovery.md` no existe.

### EVO-066 — `audit` report: formato humano + guía post-audit (DONE 2026-03-03)

`printReport` reescrito: header fecha/scope, secciones por severidad, health score, bloque "Next steps". `Post-Audit Behavior` en los 4 SKILL.md: mostrar hallazgos, preguntar antes de actuar.

### EVO-063 — pre-planning → draft: conexión automática (DONE 2026-03-03)

`resume` detecta pre-planning completo sin feature en progreso → muestra "Pre-planning: complete ✓" y recomienda `aitri draft --feature <name>`.

### EVO-062 — Contratos triviales: proof-of-compliance inválido (DONE 2026-03-03)

`prove.js` detecta `trivial_contract`; `audit.js` Layer 1 reporta HIGH; `contractgen` prompt prohíbe contratos que retornan `ok:true` sin leer `input`.

### EVO-061 — `audit` refactor: scope proyecto + output-prompt pattern (DONE 2026-03-03)

Walk desde root con SCAN_EXCLUDE. Layer 4 removido de `callAI` → outputea prompts para agente. Layers 2+3 siempre corren.
