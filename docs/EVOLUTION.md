# Aitri Evolution Backlog

## 🟢 Ready for Implementation

_(vacío)_

---

## 🟡 In Progress

_(vacío)_

---

## 📋 Backlog

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

## 🔴 Done

> Historial completo en `git log`. Para v1.2.x e inferior ver `git log --oneline`.
> Release actual: **v1.3.0**

### EVO-080 — `aitri prove` no detecta optional chaining (`input?.prop`) como acceso real (DONE 2026-03-04)

Regex cambiada en `isTrivialContract()`: `/\binput\s*\./` → `/\binput\s*\??\./ `. Test de regresión añadido en `prove-compliance.test.mjs`.

### EVO-077 — `aitri draft --non-interactive` sin `--idea` da error poco claro (DONE 2026-03-04)

Mensajes de error en `draft.js` actualizados con ejemplo completo: `aitri draft --feature <name> --idea "<summary>" --non-interactive --yes`.

### EVO-076 — `aitri discover` deprecado sigue en SKILL.md workflows (DONE 2026-03-04)

Eliminado de los 4 SKILL.md (claude, gemini, codex, opencode): tabla de comandos, sección Pre-Go, y paso del workflow. `aitri plan` corre discovery automáticamente.

### EVO-075 — `finishedAt` staleness no explica qué cambió (DONE 2026-03-04)

`audit.js`: el finding "Proof is stale" ahora lista los archivos que cambiaron (spec, backlog, tests.md) y sugiere `aitri prove --feature <name>`. `status.js`: devuelve `staleFiles: [...]` en el objeto de status y `reason` incluye los nombres de archivos.

### EVO-081 — `verify-intent` debe escribir el JSON de verificación (DONE 2026-03-04)

Al final del agent task, `verify-intent.js` ahora imprime `--- WRITE RESULT ---` con el schema JSON completo (`ok`, `feature`, `finishedAt`, `results`, `tcCoverage`) y la ruta exacta `docs/verification/<feature>.json`. El agente ya no necesita conocer el schema de memoria.

### EVO-079 — `aitri plan` no emite agent task para completar secciones vacías (DONE 2026-03-04)

Al final de `runPlanCommand`, se emite `--- AGENT TASK: plan-fill ---` instruyendo al agente a completar `## 8. Backlog`, `## 9. Test Cases`, y `## 10. Implementation Notes` en el plan doc generado.

### EVO-078 — `aitri go` exige subsecciones sin documentar el formato (DONE 2026-03-04)

Los mensajes de error en `persona-validation.js` ahora incluyen el formato exacto esperado. Ejemplo: "Add under `### Components`:\n- component: role". Igual para `Data flow`, `Key decisions`, `Risks & mitigations`, `Observability`, `Threats`, `Required controls`.

### EVO-082 — `deliver` reporta "Uncovered ACs" sin guía de resolución (DONE 2026-03-04)

`deliver.js`: cuando detecta ACs sin trace, ahora imprime ruta de `tests.md`, el TC candidato más reciente, y ejemplo de línea `Trace:` a agregar.

### EVO-074 — `tests.md` editable no documentado (DONE 2026-03-04)

SKILL.md (4 adapters): nota explícita después de `aitri deliver` — "`tests.md` es mutable; si `deliver` reporta ACs sin cobertura, agregar el AC al `Trace:` del TC correspondiente".

### EVO-073 — Nombres de contratos scaffold ilegibles (57+ chars) (DONE 2026-03-04)

`scaffold.js`: `createInterfaceStub` limita `fnName` a 50 chars (`.slice(0, 50)`). `contractgen.js`: instrucción explícita "do NOT rename — test stubs import by exact name".

### EVO-083 — Guía para contratos de FRs de UI (HTML-string pattern) (DONE 2026-03-04)

`contractgen.js`: detecta FRs de UI con regex (`page must`, `display`, `render`, `button`, etc.) y emite guía explícita: aceptar `input.html` como string, usar regex/string checks, retornar `{ ok, reason }`.

### EVO-084 — `audit` filtra contratos por feature (DONE 2026-03-04)

Layer 4 usa `scaffoldManifest.interfaceFiles` cuando existe; sin manifest, filtra `discoverContractFiles` por prefijo de FR-ID extraído del spec. Elimina ruido cross-feature en el análisis LLM.

### EVO-085 — `audit` Layer 4: destino de hallazgos + gate (DONE 2026-03-04)

Al final del output de Layer 4, instrucción explícita: escribir todos los hallazgos a `.aitri/audit-findings.md`; `aitri deliver` bloqueará en CRITICAL/HIGH.

### EVO-067 — `checkpoint` fail-safe (DONE 2026-03-04)

`checkpoint.js`: errores de escritura en `DEV_STATE.md` ahora retornan ERROR con mensaje descriptivo (código `EACCES`, `ELOCKED`, etc.). No más pérdida silenciosa de estado.

### EVO-047 — Reducir `draft.js` por debajo del hard limit (DONE 2026-03-04)

`parseFeatureInput` + `extractInputSection` extraídos a `cli/lib/draft-utils.js`; re-exportados desde `draft.js` para compat. `draft.js`: 384 → 312 líneas (hard limit: 350).

### EVO-037 — Persona-Driven SDLC: activar personas como cerebros del pipeline (DONE 2026-03-04)

`cli/persona-loader.js` creado con `loadPersonaSystemPrompt(name)`. 7 comandos pre-planning implementados: `discover-idea`, `product-spec`, `ux-design`, `arch-design`, `sec-review`, `qa-plan`, `dev-roadmap`. `spec-improve`, `testgen`, `contractgen`, `audit` usan personas reales. Registrados en `cli/index.js` con help subsección. SKILL.md actualizado con flujo pre-planning completo.

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
