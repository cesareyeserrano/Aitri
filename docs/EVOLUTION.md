# Aitri Evolution Backlog

## 🟢 Ready for Implementation

_(vacío)_

---

## 🟡 In Progress

_(vacío)_

---

## 📋 Backlog

### EVO-097 — Implementar SDLC v2.2 (DESIGN.md carta magna)

Implementar el flujo de 3 fases definido en `docs/DESIGN.md` v2.2. Incluye: `aitri design` (design session con 7 personas + NO IMPACT), `aitri design-review` (gate de aprobación), `aitri spec-from-design` (Spec Engineer + LOGIC_GAP + dependency-graph.json), `aitri validate-design` (gate de interconexión), extensión de scaffold (SPEC-SEALED blocks + sealed-hashes.json), `prove --story/--affected/--all` (3 modos de regresión), `verify-scope` (Ghost Code AST + SPEC-SEALED check), design-amendment (propagación completa + re-firma Security/QA + GI consumers), qa (captura mecánica + agente QA independiente), deliver (build antes de tag + SPEC-SEALED + prove --all gate), implement (context chunking basado en dependency-graph.json). 24 GAPs resueltos en diseño, 13 invariantes. Ver tabla "Estado de implementación vs. diseño" en DESIGN.md.

### EVO-098 — Brownfield: ruta de entrada al flujo SDLC v2.2

Definir cómo un proyecto existente (brownfield) entra al pipeline de 3 fases sin pasar por discovery from scratch. GAP-09 en DESIGN.md.

---

## 🔴 Done

> Historial completo en `git log`. Para v1.2.x e inferior ver `git log --oneline`.
> Release actual: **v1.3.1**

### EVO-091 — `verify` per-TC execution: eliminar false PASS binario (DONE 2026-03-04)

`runtime.js:enrichVerificationWithCoverage`: reemplaza `baseResult.ok ? executableTc : []` con ejecución individual por archivo TC. Para cada archivo único en `executableTc`, corre `node --test <file>` (o `pytest`/`go test` según extensión). `_filePassMap[file] = run.status === 0`. `passingTc`/`failingTc` derivados por archivo. Soporta `AITRI_PER_TC_TIMEOUT_MS` env var (default 30s por archivo). Test de regresión en `verify-coverage.test.mjs`: suite global pasa, TC-1 pasa, TC-2 falla → `tcCoverage.passing: 1`, `frCoverage.uncovered: ["FR-2"]`. 126 tests, 0 fallos.

### EVO-096 — `deliver` prove freshness: warn si contratos cambiaron después del proof (DONE 2026-03-04)

`deliver.js`: si `proof-of-compliance.json` existe y `ok: true`, compara su mtime contra el mtime más reciente de `src/contracts/<feature>/`. Si contratos son más nuevos → WARN "stale". 125 tests, 0 fallos.

### EVO-095 — `deliver` QA evidence: validación semántica anti-gaming (DONE 2026-03-04)

`deliver.js`: para cada línea `AC-N: PASS` en qa-report.md, verifica que la evidencia tenga >20 chars y no sea genérica (`ok`, `passed`, `done`, etc.). Si es thin → WARN con ejemplo. No bloquea. 125 tests, 0 fallos.

### EVO-094 — `deliver` production code evidence: git diff desde go marker (DONE 2026-03-04)

`deliver.js`: lee timestamp de `go-marker.json`, corre `git log --since` + `git diff HEAD`, filtra archivos aitri-owned. Si hay commits pero cero archivos de producción cambiaron → WARN "No production code changed since go gate." 125 tests, 0 fallos.

### EVO-093 — `deliver` US completeness: toda US debe tener AC verificada en QA (DONE 2026-03-04)

`deliver.js`: cuando `qaOk`, lee backlog.md, mapea US-* → ACs (secciones `### US-N` + fallback vía traceMap). Parsea qa-report.md para ACs con PASS. Si algún US tiene cero ACs verificadas → BLOCKED. 125 tests, 0 fallos.

### EVO-088 — `go` validator: fallback a `.aitri/*.md` + diagnóstico exacto (DONE 2026-03-04)

`persona-validation.js`: acepta `archContent` y `securityContent`. Si `.aitri/architecture-decision.md` tiene contenido significativo → salta los 5 gates de arquitectura del plan (Components, Data flow, Key decisions, Risks, Observability). Mismo patrón para `.aitri/security-review.md` → salta Threats y Required controls. Mensajes indican archivo + sección exacta y sugieren el artefacto pre-planning como alternativa. `status.js` y `validate.js` leen y pasan los artefactos. 125 tests, 0 fallos.

### EVO-092 — `go`/`validate` salta discovery gate si pre-planning existe (DONE 2026-03-04)

`status.js` y `validate.js` (2 spots): si `.aitri/discovery.md` existe, `discoveryContent` se pasa como `null` → `collectPersonaValidationIssues` salta el gate. Check de "Missing discovery" también salta. 125 tests, 0 fallos.

### EVO-090 — `deliver` confidence: no bloquea cuando evidencia feature completa (DONE 2026-03-04)

`deliver.js`: si `frMatrix.every(covered)` AND `acMatrix.every(covered)` AND `tcCoverage.failing === 0` AND `qaOk` → confidence baja a warning con breakdown (spec%/runtime%). Si la evidencia no está completa, muestra breakdown en el blocker. QA gate re-ordenado antes del confidence check para poder evaluar `qaOk`.

### EVO-089 — `deliver` hygiene: allowlist dinámica + `extraOwnedPaths` (DONE 2026-03-04)

`deliver.js`: `checkWorkspaceHygiene` acepta `{ extraOwnedPaths, manifestPaths }`. Se leen `scaffold-manifest.json` e `implement-manifest.json` antes del check para extraer top-level dirs generados. Config `delivery.extraOwnedPaths: ["internal/", "web/"]` en `aitri.config.json`. Fix de renamed files en git porcelain format (`R  old -> new`). 125 tests, 0 fallos.

### EVO-087 — `aitri qa`: QA independiente AC-driven antes de deliver (DONE 2026-03-04)

Nuevo comando `aitri qa --feature X`: lee ACs del spec aprobado, detecta stack/puerto, genera agent task para que el agente ejecute cada AC contra el sistema corriendo y escriba resultados a `.aitri/qa-report.md`. `deliver` bloquea si qa-report.md falta o tiene entradas FAIL. Step `qa` agregado al pipeline de `resume` entre `prove` y `deliver`. 265 tests, 0 fallos.

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
