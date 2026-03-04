# Aitri Evolution Backlog

## 🟢 Ready for Implementation

_(vacío)_

---

## 🟡 In Progress

_(vacío)_

---

## 📋 Backlog


### EVO-052 — Stack movido a post-arch (draft solo pregunta override)

**Feedback:** La pregunta de stack aparece en `draft` como opcional antes de que el arquitecto haya revisado. El stack debería ser consecuencia del diseño arquitectónico, no una pregunta inicial.

**Scope:**
- `draft`: remover la pregunta de stack del wizard (o convertirla en: "¿Tienes restricción de stack? Si no, el arquitecto lo definirá.")
- `arch-design`: el arquitecto propone el stack como parte de su output
- `build`: leer stack desde `arch-decision.md` si existe, desde `aitri.config.json` como fallback

**Prioridad:** Media — afecta calidad de las decisiones técnicas.

---

### EVO-059 — `aitri doctor` orphan scan

**Feedback (Gemini/PANDA2 analysis):** `aitri doctor` reporta salud del proyecto pero no detecta "huérfanos": FRs sin TC asociado, código generado sin spec de origen, TCs sin FR padre.

**Scope:**
- Extender `cli/commands/doctor.js`: agregar sección "Orphan Check"
  - FRs en spec aprobada sin ningún TC en el plan (`FR-*` sin `TC-*` referenciándolo)
  - TCs en plan sin FR padre documentado
  - Funciones en contratos con `@aitri-trace` con IDs que no existen en la spec
- Output: lista de huérfanos con path del archivo y línea
- No bloquear — es informativo como el staleness check

**Prioridad:** Baja — útil pero requiere parsing de múltiples artefactos; no urgente hasta que haya proyectos con specs completas.

---

### EVO-053 — Formato de US explícito al generar

**Feedback:** Al generar User Stories no quedó claro si seguían el template Aitri (FR-01/AC-01.x) o uno ad-hoc. El usuario no tuvo referencia para validar.

**Scope:**
- Al generar spec/draft, mostrar al inicio: "Generando bajo el formato Aitri: `FR-XX` con criterios `AC-XX.x`"
- Si la spec generada tiene IDs, validarlos con `approve` antes de mostrar como "listo"

**Prioridad:** Baja — es cosmético pero afecta confianza en el output.

---


### EVO-070 — `aitri close --feature X`: closure report

**Feedback:** No existe un comando que confirme el cierre limpio de un feature. El agente inventa el resumen de cierre sin base verificable.

**Scope:**
- Nuevo comando `aitri close --feature <name>` (o `--json`)
- Output: gate status (approve ✓/✗, go ✓/✗, deliver ✓/✗), test status (proof-of-compliance summary), workspace hygiene (archivos dirty en scope del feature), commits asociados al feature (usando fecha de aprobación del spec como baseline para `git log`), leftovers abiertos (audit findings no resueltos si existe `docs/audit/audit-findings.json`)
- No destructivo — solo lectura y reporte

**Prioridad:** Media-alta — cierra el loop del pipeline, evita cierres inventados.

---

### EVO-069 — Pre-planning: verificar que el artefacto fue escrito

**Feedback:** Los comandos de pre-planning outputan el prompt y terminan con exit 0 aunque el agente no haya escrito el archivo. Siguiente comando falla sin explicación clara.

**Scope:**
- Al final de cada comando de pre-planning (`discover-idea`, `product-spec`, etc.): verificar si `.aitri/<artifact>.md` existe
- Si no existe: salir con exit code no-zero + mensaje: `"Artifact not found: .aitri/<artifact>.md — did the agent write the file? Re-run when ready."`
- Si `--non-interactive`: error inmediato (no esperar)

**Prioridad:** Media — mejora fiabilidad del pipeline sin cambio de arquitectura.

---

### EVO-068 — `deliver` workspace hygiene gate

**Feedback:** `aitri deliver` no verifica el estado del workspace. Puede completarse exitosamente con cambios sucios no relacionados al feature mezclados en el repo.

**Scope:**
- En `deliver.js`: correr `git status --porcelain` antes de los gates finales
- Clasificar archivos dirty: `.aitri/` → evidence (ok), `src/contracts/<feature>/` y `tests/<feature>/` → feature-owned (ok), resto → unrelated (warn o block)
- Si hay archivos unrelated: mostrar lista agrupada + "Stage feature-only changes and stash the rest before delivery."
- Con `--yes`: advertencia visible pero no bloquea (CI-friendly)
- Sin `--yes`: confirmación explícita requerida

**Prioridad:** Alta — `deliver` es el gate final; entregar con workspace sucio contradice el propósito del guardarraíl.

---

### EVO-067 — `checkpoint` fail-safe

**Feedback:** Si `aitri checkpoint` falla (index.lock, permisos), el error se suprime y el agente continúa sin estado guardado. La pérdida de estado entre sesiones es silenciosa.

**Scope:**
- `cli/commands/checkpoint.js`: capturar errores de escritura en `DEV_STATE.md`
- Si falla: salir con exit code no-zero + mensaje descriptivo con causa (`EACCES`, `ELOCKED`, etc.)
- Eliminar cualquier "continue anyway" path en el flujo de checkpoint

**Prioridad:** Alta — fallo silencioso en una operación de safety es inaceptable.

---

### EVO-045 — Integration tests con LLM real

**Motivación:** Todo el test suite es smoke/unit. No hay ningún test que ejecute un flujo completo con AI real (incluso un modelo rápido/barato). Gaps que solo los tests de integración pueden detectar: cambios en prompt format que rompen el parsing, regresiones en la estructura del output de `discover`, `plan`, `spec-improve`.

**Scope:**
- `tests/integration/` — nuevos tests marcados `@slow` / requieren `ANTHROPIC_API_KEY`
- `npm run test:integration` — script separado que no corre en CI básico
- Cobertura mínima: `draft → approve → discover → plan` con un feature real pequeño

**Prioridad:** Media — los smoke tests cubren la lógica de orquestación, los integration tests cubrirían el contrato con el LLM.

---

### EVO-046 — `resume --feature` cross-epic awareness

**Motivación:** `resume --json` incluye `activeEpic` pero `resume --feature X` no consulta qué épica contiene el feature. Si hay 2 épicas con features entrelazados, el contexto de progreso relativo (cuántas features del epic están done) no se puede computar en `resume` sin este fix.

**Scope:**
- En `runResumeCommand`: cuando `options.feature` está presente, buscar qué épica lo contiene
- Usar `readEpicsSummaryFromDocsRoot` ya disponible en `epic.js`
- Añadir `epicContext: { epicName, position, total, delivered }` al JSON output

**Prioridad:** Baja — `activeEpic` ya funciona para el caso común (feature en curso).

---

### EVO-047 — Reducir `draft.js` por debajo del hard limit

**Motivación:** `cli/commands/draft.js` tiene 384 líneas (hard: 350). Deuda técnica acumulada.

**Scope:**
- Extraer validación de idea a helper `validateIdea(idea)` en `cli/lib/`
- Extraer construcción del prompt a función pura `buildDraftPrompt(options)`
- Sin cambio de comportamiento ni interface

**Prioridad:** Baja — deuda técnica, no urgente.

---

## 🔴 Done

> Historial completo en `git log`. Release actual: **v1.3.0**

### EVO-066 — `audit` report: formato humano + guía post-audit (DONE 2026-03-03)

`printReport` reescrito: header con fecha + scope, secciones por severidad con título narrativo, health score ("Healthy / Minor issues / Attention needed / Action required"), bloque "Next steps" contextual. `Post-Audit Behavior` añadido a los 4 SKILL.md: mostrar hallazgos, preguntar qué abordar, no crear tareas sin instrucción explícita. Test actualizado (`/Summary/` → `/Health/`).

---

### EVO-063 — pre-planning → draft: conexión automática (DONE 2026-03-03)

`runtime-flow.js` `resume` detecta cuando todos los 7 artefactos `.aitri/` existen y no hay feature en progreso: muestra "Pre-planning: complete ✓", línea "Source: .aitri/dev-roadmap.md → auto-injected into draft", recomienda `aitri draft --feature <your-feature-name>` con mensaje why explícito. JSON payload incluye `why` con instrucción completa.

---

### EVO-065 — `audit` framing confuso (CLOSED — cubierto por EVO-061)

`aitri audit` sin args corre Layer 2+3+4 sobre todo el proyecto sin pedir feature. `--feature` es opcional y activa Layer 1 (pipeline compliance). Principio implementado: "audit responde ¿está sano el proyecto hoy?".

---

### EVO-062 — Contratos triviales: proof-of-compliance estructuralmente inválido (DONE 2026-03-03)

Detectado en Ultron: contratos que retornan `ok: true` sin leer `input` → proof-of-compliance marcaba `proven: 5/5` sin verificar nada real. Fixes: `prove.js` detecta `trivial_contract`; `audit.js` Layer 1 lo reporta como finding HIGH; `contractgen` task prompt incluye instrucción explícita de invalidez.

---

### EVO-061 — `audit` refactor: scope proyecto + output-prompt pattern (DONE 2026-03-03)

Detectado en Ultron: `collectSourceFiles` solo escaneaba `src/` → Go en `internal/` nunca escaneado. Layer 4 llamaba `callAI` directamente → violaba Aitri-as-skill. Fixes: walk desde root con SCAN_EXCLUDE; Layer 4 removido de callAI → outputea prompts para agente (mismo patrón que pre-planning); Layers 2+3 siempre corren.

---

### EVO-051 — UX output pobre (CLOSED — causa raíz: SKILL compliance pre-EVO-054)

Re-test con adapter actualizado (2026-03-03, Ultron). `aitri ux-design` produce output correcto: path del artefacto visible, persona system prompt completo, artefacto resultante con 6 secciones mandatorias. Causa raíz era SKILL compliance del adapter Codex antes de EVO-054/055/056. Cerrado sin cambio de prompt.

---

### EVO-058 — `@aitri-trace` traceability header en contractgen output (DONE)

`core/personas/developer.md`: toda función implementada debe incluir `@aitri-trace` con US-ID/FR-ID/TC-ID. Todos los adapters SKILL.md actualizados para mencionar `@aitri-trace` en Persona Minimum Output.

---

### EVO-054 — Agent compliance: no improvisar fuera de comandos Aitri (DONE)

Regla 8 en todos los SKILL.md: prohibición explícita de trabajo fuera del pipeline sin comando `aitri`. Regla 9: documentar el gap si no existe comando. Command Mapping table: 22+ acciones → comando correspondiente.

---

### EVO-048 + EVO-049 — Gate CTA + Closing block obligatorio (DONE)

SKILL.md: Gate CTA con dos patrones (Pattern A: "¿Lo ejecuto ahora? sí/no"; Pattern B: "Cuando estés listo, corre:"). Bloque `→ Siguiente` obligatorio al cierre de cada turno.

---

### EVO-044 — Stale context detection (DONE)

`cli/lib/staleness.js` nuevo utilitario `checkStaleness`/`warnIfStale`. `build.js` y `discovery-plan-validate.js` avisan si pre-planning artifacts son más nuevos que el plan. Warning informativo, no bloqueante. 4 tests nuevos.

---

### EVO-043 — Eliminar `handoff`, limpiar deprecation list (DONE)

Eliminado `handoff` de `cli/index.js` (reemplazado por `resume`). `scaffold`/`implement` conservados sin label DEPRECATION. `runResumeCommand` pasa `options.feature` a `getStatusReportOrExit` (fix latente). Tests actualizados en 4 archivos.

---

### EVO-042 — Semantic context injection tests (DONE)

`tests/smoke/cli-smoke-semantic-context.test.mjs`: verifica que `build` inyecta `architecture-decision.md` en implementation briefs (marcador único sin LLM). 3 tests adicionales de `--force` guard para pre-planning en `cli-smoke-preplanning.test.mjs`.

---

### EVO-041 — Épicas: container de features (DONE)

`aitri epic create/status`: `docs/epics/<name>.json` con `features[]`, `progressSummary`. `resume --json` incluye `activeEpic`/`epicProgress`. `cli/commands/epic.js` (189 líneas). 14 tests en `cli-smoke-epic.test.mjs`.

---

### EVO-040 — `aitri approve` semantic gate (DONE)

Si existe `.aitri/architecture-decision.md`: persona `architect.md` evalúa coherencia spec vs arquitectura. Output `ARCH_CONCERN:` lines. `Proceed anyway? (y/n)` en interactivo; `--yes` no bloquea. Sin AI config: gate semántico omitido silenciosamente.

---

### EVO-039 — Resume pre-planning awareness + `--force` (DONE)

`resume` detecta `prePlanningStatus: not-started | in-progress | complete`. `recommendedCommand` apunta al siguiente pre-planning paso si no hay artefactos. `--force` en los 7 comandos de pre-planning sobreescribe sin borrar manualmente.

---

### EVO-038 — Pre-planning alimenta el pipeline real (DONE)

`draft` inyecta `dev-roadmap.md`; `plan` inyecta `architecture-decision.md`/`security-review.md`/`ux-design.md`/`qa-plan.md`; `build` inyecta `architecture-decision.md`/`security-review.md`. Principio: "para cada artefacto que Aitri produce, debe existir al menos un comando posterior que lo consume." `docs/architecture.md` reescrito.

---

### SKILL-002 — OpenCode: ejecutar desde workspace root (CLOSED — ya implementado)

`adapters/opencode/SKILL.md` Core Contract: "All `aitri` commands must be executed from the workspace root. Verify with `pwd` if uncertain — running from a subdirectory causes silent path failures."

---

### SKILL-001 — Gemini: anti-shadow-change (CLOSED — ya implementado)

`adapters/gemini/SKILL.md` Bootstrap paso 6: "Before any pipeline step, re-read all relevant `.aitri/` artifacts from disk. Never rely on in-context cached versions."

---

### EVO-037 — Persona-Driven SDLC (DONE)

`cli/persona-loader.js`: carga `core/personas/<name>.md` como system prompt para `callAI`. 7 nuevos comandos pre-planning (`discover-idea` → `dev-roadmap`). Refactors: `spec-improve` usa `architect.md`, `testgen` usa `qa.md`, `contractgen` usa `developer.md`, `audit` usa las 4 personas. Commits `6cebaee`, `e046663`.

---
