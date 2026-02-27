# Aitri Evolution Backlog

## 🟢 Ready for Implementation

_(ninguno pendiente)_

## 🟡 In Progress

---

## 📋 Backlog

> _Feedback de prueba real (2026-02-27) — proyecto existente, flujo UX/UI improvement_

### EVO-050 — Persona visibility: mostrar qué persona está contribuyendo

**Feedback:** El usuario sabe que existen Arquitecto, UX, Dev, etc. pero no los ve "trabajar". No hay señal visible de cuándo cada persona contribuye ni qué decidió.

**Scope:**
- Al invocar un comando de pre-planning (`arch-design`, `ux-design`, `sec-review`, etc.), mostrar badge: `[Arquitecto] Evaluando stack y componentes…`
- Al terminar, mostrar resumen de 2-3 líneas de qué decidió esa persona
- En `resume --json`, incluir `lastPersonaContribution: { persona, command, summary }`

**Prioridad:** Alta — las personas son el diferenciador de Aitri; si no se ven, no existen.

---

### EVO-051 — UX output pobre: resultado no alineado al requerimiento

**Feedback:** El resultado de `ux-design` fue pobre. El usuario no vio dónde vive el artefacto UX, no hubo propuesta visible para validar alineación, y el contenido generado no estuvo a la altura del requerimiento real (mejora UX/UI de dashboard).

**⚠️ Nota de contexto:** El test fue realizado con el adapter Codex **antes del upgrade completo** de SKILL.md (EVO-054/055/056). Parte del output pobre puede ser compliance/SKILL failure, no calidad del prompt de `ux-design`. Antes de cambiar el prompt, re-testear con adapter actualizado para aislar la causa raíz.

**Scope:**
- Re-testear `ux-design` con adapter actualizado (post EVO-054/055/056) para confirmar si el problema persiste
- Si persiste: mejorar el prompt para que genere flujo de usuario, wireframe textual (ASCII o descripción), decisiones de diseño con justificación
- Al terminar, mostrar path del artefacto y preview inline de 10-15 líneas
- Agregar gate de validación: "¿Esta propuesta UX refleja tu requerimiento? (sí/ajustar)"
- Si el problema era SKILL compliance: cerrar EVO sin cambio de prompt

**Prioridad:** Alta — pero implementar solo después de re-test con adapter actualizado.

---

### EVO-052 — Stack movido a post-arch (draft solo pregunta override)

**Feedback:** La pregunta de stack aparece en `draft` como opcional antes de que el arquitecto haya revisado. El stack debería ser consecuencia del diseño arquitectónico, no una pregunta inicial.

**Scope:**
- `draft`: remover la pregunta de stack del wizard (o convertirla en: "¿Tienes restricción de stack? Si no, el arquitecto lo definirá.")
- `arch-design`: el arquitecto propone el stack como parte de su output
- `build`: leer stack desde `arch-decision.md` si existe, desde `aitri.config.json` como fallback

**Prioridad:** Media — afecta calidad de las decisiones técnicas.

---

### EVO-055 — Agent output evidence: stdout obligatorio como prueba de ejecución

**Feedback (Codex UX testing):** El agente puede afirmar que ejecutó un comando sin mostrar su output real. Sin stdout visible, el usuario no puede verificar si el comando realmente corrió ni cuál fue el resultado.

**Scope:**
- Agregar regla a todos los adapters SKILL.md: "Never claim a command succeeded without showing its stdout output."
- Aplica a todos los comandos aitri — si el agente corre `aitri plan`, debe mostrar el output completo, no solo decir "plan generado"
- Agregar nota en la sección de Approval Behavior: el PLAN visible es el stdout real, no un resumen inventado
- **IDE-specific (OpenCode/Claude Code):** En entornos donde el terminal no es visible en el chat, el agente debe re-stated los puntos clave del PLAN en la conversación antes de pedir y/n (no solo "PLAN detectado")

**Prioridad:** Alta — sin esta regla, el human-in-the-loop gate puede aprobarse sobre output fabricado.

---

### EVO-056 — Mandatory footer en todo turno (no solo status/resume)

**Feedback (Codex UX testing):** El bloque `→ Next` solo está definido para `aitri status` y `aitri resume`. En cualquier otro turno de respuesta el hilo de ejecución se puede perder. Para Codex especialmente, la ambigüedad inter-turno rompe la continuidad del pipeline.

**Scope:**
- Actualizar todos los adapters SKILL.md: el bloque `→ Next` aplica a **todo turno de respuesta**, no solo status/resume
- Si el next step no es conocido: `→ Next: run \`aitri resume\` to determine next step`
- Si el feature fue entregado: `→ Feature closed. No further Aitri pipeline steps.`
- **IDE variant (OpenCode/Claude Code):** Incluir path del artefacto generado cuando aplique:
  ```
  → Next: `aitri <command> --feature <name>`
  [File]: .aitri/<filename>.md
  ```

**Prioridad:** Alta — especialmente crítico para Codex y agentes sin memoria inter-sesión.

---

### EVO-057 — Persona minimum output requirements

**Feedback (Codex UX testing):** Las personas están definidas como "active system prompts" pero no tienen criterios de calidad mínimos en el SKILL. Un agente puede invocar `aitri spec-improve` y generar un output vacío o genérico sin violar ninguna regla.

**Scope:**
- Agregar a todos los adapters SKILL.md sección "Persona Minimum Output":
  - `spec-improve` (Architect): mínimo 3 hallazgos técnicos concretos; validar contra `.aitri/architecture-decision.md` si existe
  - `testgen` (QA): debe cubrir Happy Path, Edge Cases y **Security Failures** (los tres explícitamente)
  - `contractgen` (Developer): cada función implementada debe referenciar su FR-ID; **cero lógica extra no documentada en la spec**
  - `arch-design` (Architect): debe incluir decisión de stack + justificación técnica
- Si el output no cumple el mínimo, el agente debe pedir al LLM que lo complete antes de mostrar al usuario

**Prioridad:** Media — mejora la calidad percibida de los artefactos sin cambios en el CLI.

---

### EVO-058 — `@aitri-trace` traceability header en contractgen output

**Feedback (Gemini/PANDA2 analysis):** El código generado por `contractgen` no tiene ningún vínculo explícito con la spec que lo originó. Si alguien revisa el código sin el contexto de Aitri, no puede saber a qué US o FR corresponde.

**Scope:**
- Instruir a todos los adapters SKILL.md: cuando `contractgen` genere código, cada función debe incluir header de trazabilidad:
  ```
  /**
   * @aitri-trace
   * US-ID: US-XX
   * FR-ID: FR-XX
   * TC-ID: TC-XX
   */
  ```
- Agregar a la persona Developer (`core/personas/developer.md`): output de contractgen debe incluir `@aitri-trace` en todas las funciones implementadas
- Sin cambios al CLI — es instrucción de output al LLM

**Prioridad:** Media — trazabilidad real entre código y spec, verificable en code review.

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

### SKILL-001 — Gemini Bootstrap: re-read `.aitri/` desde disco (anti-shadow-change)

**Feedback (Gemini/PANDA2 analysis):** Gemini retiene en contexto versiones anteriores de archivos. Si el usuario edita manualmente un `.aitri/*.md` fuera del pipeline, Gemini puede seguir razonando con la versión cacheada.

**Scope:**
- Agregar al Bootstrap de `adapters/gemini/SKILL.md` paso 6 (o antes del paso actual 6):
  "Before proceeding with any pipeline step, re-read all relevant `.aitri/` artifacts from disk. Never rely on in-context cached versions of these files."
- No requiere cambios al CLI

**Prioridad:** Baja — edge case, pero fácil de implementar (1 línea en SKILL.md).

---

### SKILL-002 — OpenCode Core Contract: ejecutar desde workspace root

**Feedback (OpenCode/PANDA2 analysis):** OpenCode permite múltiples terminales. Si `aitri` se corre desde un subdirectorio, los paths relativos de `.aitri/` fallan silenciosamente.

**Scope:**
- Agregar al Core Contract de `adapters/opencode/SKILL.md`: "All `aitri` commands must be executed from the workspace root. Verify with `pwd` if uncertain."
- No requiere cambios al CLI

**Prioridad:** Baja — 1 línea en SKILL.md, previene errores de ruta difíciles de diagnosticar.

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

> Historial completo en `git log`. Release actual: **v1.2.3**

### EVO-058 — `@aitri-trace` traceability header en contractgen output

**Problema:** El código generado por `contractgen` no tenía ningún vínculo explícito con la spec de origen. Sin el header, un reviewer no puede saber a qué US/FR/TC corresponde cada función.

**Solución:**
- `core/personas/developer.md`: agregado requerimiento en sección "Interface Contracts" — toda función implementada debe incluir header `@aitri-trace` con US-ID, FR-ID, TC-ID. Si un ID es desconocido, escribir `UNKNOWN` y flagear.
- Todos los adapters SKILL.md (claude, codex, opencode, gemini): actualizado `contractgen` en Persona Minimum Output para mencionar `@aitri-trace` explícitamente.

---

### EVO-054 — Agent compliance: no improvisar fuera de los comandos Aitri

**Problema:** El agente ignoraba el skill e improvisaba auditorías/reviews sin invocar `aitri`. Todos los gates quedaban bypassed.

**Solución:** Actualizado `~/.claude/skills/aitri/SKILL.md`:
- Regla 8: prohibición explícita de trabajo fuera del pipeline sin comando `aitri`
- Regla 9: si no hay comando para algo, decirlo y documentar el gap
- Command Mapping table: 22 acciones → comando `aitri` correspondiente

---

### EVO-048 + EVO-049 — Gate CTA + Status/Resume closing block

**Problema:** Gates terminaban con comando flotante sin instrucción clara. `status`/`resume` no anunciaban el siguiente paso.

**Solución:** Actualizado `SKILL.md`:
- Gate CTA: dos patrones explícitos (Pattern A: "¿Lo ejecuto ahora? sí/no" · Pattern B: "Cuando estés listo, corre:")
- Status/Resume: bloque `→ Siguiente` obligatorio al cierre de cada ejecución

---

### EVO-044 — Stale context detection: warn cuando pre-planning artifacts son más nuevos que downstream

**Motivación:** Post-mortem de EVO-038/042: los artefactos de pre-planning (`.aitri/architecture-decision.md`, `security-review.md`, `dev-roadmap.md`, `ux-design.md`, `qa-plan.md`) se generan y se consumen por `plan` y `build`. Pero si el usuario regenera un artefacto de pre-planning DESPUÉS de haber corrido `plan`, el plan queda obsoleto sin ningún aviso.

**Scope:**
- `cli/lib/staleness.js` — nuevo utilitario con `checkStaleness(sourceFiles, downstreamFile)` y `warnIfStale({...})`
- `cli/commands/build.js` — inyectar staleness check vs `planFile` (arch-decision, sec-review, dev-roadmap)
- `cli/commands/discovery-plan-validate.js` — inyectar staleness check antes de regenerar plan (arch-decision, sec-review, ux-design, qa-plan)
- `tests/smoke/cli-smoke-staleness.test.mjs` — 4 tests: warn cuando stale, no warn cuando clean, no warn cuando artifacts son más viejos, plan re-run avisa cuando stale

**Resultado:** 4 tests nuevos, 257 totales green. Warning es informativo, no bloqueante. `--force` en plan siempre regenera independientemente de staleness.

---

### EVO-043 — Cleanup: eliminar `handoff` y limpiar deprecation list

**Feedback origen:**
El help text decía `Still work (deprecated): discover, validate, handoff, scaffold, implement, verify, policy`. Diagnóstico honesto: `handoff` es el único genuinamente removible (reemplazado por `resume`). `discover`, `verify`, `validate`, `policy`, `scaffold`, `implement` son pasos reales del pipeline con tests dedicados — el label era erróneo.

**Scope:**

- `cli/index.js`: eliminado dispatch de `handoff` + imports de `runHandoffCommand`. `scaffold` e `implement` conservados sin mensaje DEPRECATION. Help text actualizado: "Pipeline helpers" en lugar de "deprecated".
- `cli/commands/runtime-flow.js`: `runResumeCommand` ahora pasa `options.feature` a `getStatusReportOrExit` (fix latente — `resume --feature X` retornaba feature vacío).
- Tests actualizados: `handoff json` → `resume --json` en 4 archivos (e2e, validation, runtime-policy, regression). Bonus: test renombrado a "resume and go respect --feature".

**Estado:** Implementado — 253 tests verdes.

---

### EVO-041 — Épicas: container de features con progreso agregado

**Feedback origen:**
La jerarquía `Feature → FR → US → TC` no tiene estructura intermedia para agrupar features hacia un outcome de negocio. Sin épicas: no hay progreso agregado, `resume` no puede navegar cross-feature, no existe vista filtrada.

**Scope implementado:**

1. **`aitri epic create --name <name> --features <f1,f2,...>`** → `docs/epics/<name>.json` con `schemaVersion`, `features[]`, `progressSummary`
2. **`aitri epic status [--name <name>]`** — sin `--name`: lista todas las épicas; con `--name`: tabla feature/state/nextStep + progreso
3. **`aitri resume --json`** — incluye `activeEpic` y `epicProgress` en el payload
4. **`aitri status --epic <name>`** — vista filtrada por epic (redirige a `epic status`)
5. Features sin epic: intactas, backward compatible

Nuevo módulo: `cli/commands/epic.js` (189 líneas). Nuevos flags globales: `--name`, `--features`, `--epic`. Tests: `tests/smoke/cli-smoke-epic.test.mjs` (14 tests).

**Estado:** Implementado — 131 smoke + 122 regression = 253 tests verdes.

---

### EVO-042 — Semantic context injection tests

**Feedback origen:**
Tests validan mecánica (exit codes, archivos creados) pero no semántica: ¿el output realmente usa el contexto disponible? Un pipeline que ignora `architecture-decision.md` en sus briefs pasaría todos los tests existentes sin objeción.

**Scope:**

- `tests/smoke/cli-smoke-semantic-context.test.mjs` (nuevo) — 2 tests estructurales, sin LLM:
  - `build injects architecture-decision context into implementation briefs` — crea `.aitri/architecture-decision.md` con marcador único, corre `aitri build`, verifica que el brief `US-*.md` contiene el marcador
  - `build omits architecture context when .aitri/architecture-decision.md is absent` — sin artefacto, verifica que el brief NO contiene la sección de contexto
- `tests/smoke/cli-smoke-preplanning.test.mjs` — 3 tests nuevos de EVO-039 `--force` guard:
  - `discover-idea non-interactive fails with --force hint when artifact exists`
  - `discover-idea --force bypasses existing artifact guard`
  - `dev-roadmap non-interactive fails with --force hint when artifact exists`

**Por qué solo `build`:** Es el único comando del pipeline que inyecta contexto pre-planning sin invocar LLM — el marcador se escribe al archivo directamente. Los otros comandos que inyectan contexto (draft, plan) requieren LLM para producir su output, lo que hace inviable la aserción sin mock.

**Estado:** Implementado — 240 tests verdes.

---

### EVO-040 — `aitri approve` semantic gate: spec vs architecture

**Feedback origen:**
`aitri approve` valida estructura del spec (secciones presentes, FRs formateados, ACs numerados) pero no verifica si el spec es coherente con `architecture-decision.md`. Un spec que contradice la arquitectura aprobada pasa el gate sin alerta. El audit lo detecta retroactivamente — post-daño.

**Scope:**

- Si existe `.aitri/architecture-decision.md`: agregar Layer 2 semántico al `approve` gate
- Invocar `architect.md` persona con: spec completo + architecture-decision
- Persona evalúa: ¿El spec contradice alguna decisión arquitectónica? ¿Hay tecnologías no previstas? ¿Hay gaps de seguridad evidentes?
- Output: `ARCH_CONCERN: <descripción>` lines (igual que `FINDING:` en audit)
- Si hay concerns: mostrarlos y pedir confirmación antes de aprobar (`Proceed anyway? (y/n)`)
- Con `--yes`: concerns se muestran pero no bloquean (CI-friendly)
- Sin AI config: el gate semántico se omite silenciosamente (no rompe proyectos sin AI)

**Estado:** Implementado — 234 tests verdes.

---

### EVO-039 — Resume pre-planning awareness + `--force` para pre-planning

**Feedback origen:**
Post-mortem de EVO-037/038: `aitri resume json` no detecta si el pre-planning existe. En un proyecto nuevo devuelve `recommendedCommand: "aitri draft"` aunque `.aitri/discovery.md` no exista. Un agente que siga ciegamente `resume` omite todo el pre-planning. Segundo gap: no hay forma de regenerar un artefacto de pre-planning sin borrar el archivo manualmente.

**Scope:**

1. **`aitri resume`** — detectar estado de pre-planning:
   - Si ningún artefacto `.aitri/*.md` existe (excepto `DEV_STATE.md`): `recommendedCommand: "aitri discover-idea"`, nuevo campo `prePlanningStatus: "not-started"`
   - Si pre-planning parcial (algunos artefactos existen): `prePlanningStatus: "in-progress"`, `recommendedCommand` apunta al siguiente en secuencia
   - Si pre-planning completo (`dev-roadmap.md` existe): `prePlanningStatus: "complete"`, comportamiento actual

2. **`--force` en los 7 comandos de pre-planning** — permite sobreescribir el artefacto existente sin borrar el archivo manualmente. Sin `--force`, si el artefacto ya existe, el comando pregunta si regenerar (interactivo) o falla limpio (no-interactivo).

**Estado:** Implementado — 234 tests verdes.

---

### EVO-038 — Cerrar gaps de integración: pre-planning alimenta el pipeline real

**Feedback origen:**
Post-mortem de EVO-037: los artefactos de pre-planning (`.aitri/dev-roadmap.md`, `architecture-decision.md`, `security-review.md`, `qa-plan.md`) se generan correctamente pero **ningún comando del pipeline los consume**. El gap es entre artefactos producidos y artefactos usados.

**Gaps identificados (claims vs. realidad):**

| Gap | Impacto | Comando afectado |
|-----|---------|-----------------|
| `aitri draft` no lee `.aitri/dev-roadmap.md` | Alto — el spec se escribe sin la guía del Lead Developer | `draft.js` |
| `aitri plan` ignora `architecture-decision.md`, `security-review.md`, `qa-plan.md` | Alto — el backlog y tests se generan sin contexto arquitectónico ni de seguridad | `discovery-plan-validate.js` |
| `aitri build` no lee `architecture-decision.md` | Medio — scaffolding sin guía arquitectónica | `build.js` |
| `aitri approve` no valida consistencia spec vs architecture | Medio — gate estructural pero no semántico | `approve.js` |
| No hay gate UX antes del código | Medio — solo se verifica retroactivamente en audit | — |
| Las personas no se re-invocan cuando el contexto cambia | Bajo — depende del agente | SKILL.md |

**Causa raíz documentada:**
Aitri creció como herramienta de guardarraíles estructurales (gates, validación de formato). El valor semántico — que el conocimiento fluya entre etapas — se asumió implícito. Los tests validan mecánica (exit codes, archivos creados) pero no semántica (¿el output usa el contexto disponible?).

**Principio correctivo adoptado:**
> Para cada artefacto que Aitri produce, debe existir al menos un comando posterior que lo consume.

**Scope implementado:**
- `aitri draft` — inyecta `.aitri/dev-roadmap.md` como sección "Pre-Planning Context" en el spec generado
- `aitri plan` — inyecta `architecture-decision.md`, `security-review.md`, `ux-design.md` en las secciones correspondientes del plan doc; inyecta `qa-plan.md` en el tests file
- `aitri build` — inyecta `architecture-decision.md` y `security-review.md` como secciones adicionales en cada implementation brief
- `docs/architecture.md` — reescrito para reflejar el pipeline completo con personas activas, artifact topology actualizada, agent integration contract actualizado

**Estado:** Implementado — 234 tests verdes. Docs actualizados: `docs/architecture.md`, `docs/guides/GETTING_STARTED.md`, `docs/guides/AGENT_INTEGRATION_GUIDE.md`, `adapters/claude/SKILL.md`.

---

### EVO-037 — Persona-Driven SDLC: activar personas como cerebros del pipeline

**Feedback origen:**
Las 7 personas (`core/personas/*.md`) son documentos de referencia que ningún comando LLM invoca. Los comandos actuales usan prompts inline genéricos o ningún system prompt. El agente LLM opera sin lente de rol — genera UX sin pasar por el Experience Designer, genera código sin el Lead Developer, genera tests sin el Quality Engineer.

**Objetivo:**
Que cada etapa del SDLC sea ejecutada **por** su persona correspondiente. La persona se carga como system prompt desde su archivo `.md` y se pasa a `callAI()`. Así el pipeline tiene cerebros especializados en cada paso, no un LLM genérico.

**Scope:**

1. **`cli/persona-loader.js`** (nuevo) — utilitario que lee `core/personas/<name>.md`, strips `## Invocation Policy`, retorna system prompt listo para `callAI`

2. **7 nuevos comandos pre-planning** (nivel proyecto, no feature):
   - `aitri discover-idea` → Discovery Facilitator → `.aitri/discovery.md`
   - `aitri product-spec` → Product Manager → `.aitri/product-spec.md`
   - `aitri ux-design` → Experience Designer → `.aitri/ux-design.md`
   - `aitri arch-design` → System Architect → `.aitri/architecture-decision.md`
   - `aitri sec-review` → Security Champion → `.aitri/security-review.md`
   - `aitri qa-plan` → Quality Engineer → `.aitri/qa-plan.md`
   - `aitri dev-roadmap` → Lead Developer → `.aitri/dev-roadmap.md`

3. **Refactors de comandos existentes** (sin breaking changes):
   - `spec-improve` → usa `architect.md` en lugar de prompt inline
   - `testgen` → agrega `qa.md` como system prompt
   - `contractgen` → agrega `developer.md` como system prompt
   - `audit` layer 4 → usa `architect.md` + `security.md` + `developer.md` + `ux-ui.md` (condicional)

**Pipeline resultante:**

```
Pre-planning (proyecto, 1 sola vez)
  discover-idea → product-spec → ux-design → arch-design
  → sec-review → qa-plan → dev-roadmap

Pre-Go (por feature)
  draft → spec-improve[architect] → approve[architect gate] → go

Post-Go (factory)
  build → testgen[qa] → contractgen[developer] → prove → deliver

Post-delivery
  audit[architect + security + developer + ux-ui]
```

**Estado:** Implementado — commits `6cebaee`, `e046663`. Audit extendido a 4 personas (architect + security + developer + ux-ui condicional).

---
