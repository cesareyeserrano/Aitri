# Aitri Evolution Backlog

## 🟢 Ready for Implementation

_(vacío)_

---

## 🟡 In Progress

_(vacío)_

---

## 📋 Backlog

_(vacío)_

---

## 🔴 Done

> Historial completo en `git log`. Para v1.2.x e inferior ver `git log --oneline`.
> Release actual: **v1.3.0**

### EVO-086 — `aitri close` muestra `?/?` en Proof (DONE 2026-03-04)

`close.js` leía `proof.passing` y `proof.total` pero el JSON real usa `proof.summary.proven` y `proof.summary.total`. Fix: leer la ruta correcta en human output y JSON output.

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

### EVO-068 — `deliver` workspace hygiene gate (DONE 2026-03-04)

`deliver.js`: `checkWorkspaceHygiene()` runs `git status --porcelain`, classifies files as feature-owned (`.aitri/`, `src/contracts/`, `tests/<feature>/`, etc.) or unrelated. Without `--yes`: DELIVER BLOCKED. With `--yes`/`--non-interactive`: visible warn, continues.

### EVO-071 — UX persona section 7 + draft injects ux-design + SKILL.md (DONE 2026-03-04)

`ux-ui.md` section 7 "Implementable Requirements": FR-XX / AC-XX.x with note "input for `aitri draft`, not implementation instructions." `draft.js` injects `.aitri/ux-design.md` as "## UX Context" when present. All 4 SKILL.md adapters: new row "UX improvements that touch code → ux-design --force, then draft --feature ui-<name>".

### EVO-069 — Pre-planning prerequisite errors now actionable (DONE 2026-03-04)

All 6 follow-up pre-planning commands: "Artifact not found: .aitri/<name>.md — did the agent write the file? Re-run: aitri <cmd>". All 7 commands output "→ WRITE artifact: ... — the next command requires this file."

### EVO-052 — Stack moved to post-arch (DONE 2026-03-04)

`draft.js` guided wizard question 6: "Stack constraint (optional — skip if architect should define it)". `scaffold.js detectStackFamily`: reads `.aitri/architecture-decision.md` for language hint when spec has no stack. `architect.md` Output Schema: adds section 2 "Tech Stack Recommendation".

### EVO-053 — Aitri format reminder on draft + plan creation (DONE 2026-03-04)

`draft.js`: prints "Spec format: FR-XX with criteria AC-XX.x" before writing file. `discovery-plan-validate.js`: prints "Plan format: FR-XX · TC-XX · AC-XX.x · US-XX" after plan is created.

### EVO-070 — `aitri close --feature X`: closure report (DONE 2026-03-04)

Nuevo comando `cli/commands/close.js` (134 líneas): ✓/✗ de 6 gates (spec, go, build, proof, verification, delivery), stats de proof, open CRITICAL/HIGH audit findings, commits recientes. Soporte `--json`. Registrado en `index.js`.

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
