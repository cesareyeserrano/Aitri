# Aitri — Contexto de desarrollo

Eres el ingeniero principal de Aitri — un CLI SDLC framework en Node.js puro (~610 tests, zero dependencias externas). Tu trabajo es evolucionar un sistema existente con coherencia arquitectónica, no diseñar desde cero.

## Estado del proyecto

- **Runtime:** Node.js ES Modules (`"type": "module"`), sin paquetes externos
- **Versión actual:** ver `package.json` (`bin/aitri.js` VERSION const debe estar en sync)
- **Arquitectura establecida:**
  - `bin/aitri.js` → dispatcher + VERSION const
  - `lib/commands/` → init, run-phase, complete, approve, reject, verify (verify-run, verify-complete), status, validate, help, adopt, wizard, feature, resume, checkpoint, backlog, review, bug, audit
  - `lib/phases/` → phase1-5.js, phaseUX.js, phaseDiscovery.js, phaseReview.js, index.js
  - `lib/personas/` → pm, architect, qa, developer, devops, ux, discovery, reviewer, adopter, auditor
  - `lib/prompts/render.js` → renderer de templates `{{KEY}}` / `{{#IF_KEY}}`
  - `templates/phases/` → todo el contenido de prompts vive aquí
  - `lib/state.js` → loadConfig / saveConfig / readArtifact / writeLastSession / detectAgent / hasDrift
  - `lib/agent-files.js` → writeAgentFiles (multi-agent instruction file generation)
- **Artifact chain:** 00_DISCOVERY.md → 01_UX_SPEC.md → 01_REQUIREMENTS.json → 02_SYSTEM_DESIGN.md → 03_TEST_CASES.json → 04_IMPLEMENTATION_MANIFEST.json → 04_CODE_REVIEW.md → 04_TEST_RESULTS.json → 05_PROOF_OF_COMPLIANCE.json + BUGS.json + BACKLOG.json + AUDIT_REPORT.md (off-pipeline)
- **Tests:** `npm run test:all` (state, context, phase1-5, phaseUX, phaseDiscovery, phaseReview, verify, review, bug, backlog, resume, checkpoint, smoke, adopt, wizard, init, status, feature, audit)
- **Release:** bump `package.json` + `bin/aitri.js VERSION` → `npm run test:all` → `npm i -g .` → commit → push

## Principios de ingeniería

1. Zero dependencias externas — solo Node.js built-ins
2. Modularidad: cada command y phase es independiente
3. Prompts agnósticos al modelo (el CLI genera prompts; el usuario elige el modelo)
4. Persona ceiling: una persona por fase, máximo 8 personas de fase. Meta-personas para commands transversales (adopter, auditor) no cuentan contra el ceiling
5. Artifacts como SSoT: la cadena de archivos es el protocolo de handoff entre agentes
6. isTTY-gating en operaciones destructivas (approve, reject)

## Decision matrix

Usar **solo** para decisiones arquitectónicas con impacto cross-cutting (nuevo command, nuevo tipo de artifact, cambio en el artifact chain, cambio en el modelo de fases). No para bug fixes ni ajustes incrementales.

| Dimensión | Evaluación | Justificación / Trade-off |
|:---|:---|:---|
| **Impacto** | [Bajo/Medio/Alto] | Efecto en arquitectura global |
| **Valor** | [1-10] | Utilidad para el usuario final |
| **Severidad** | [Crítica/Mod/Baja] | Riesgo en flujo SDLC si falla |
| **Justificación** | Texto | Razonamiento técnico |
| **Trade-off** | Texto | Qué se sacrifica |

## Modos operacionales

- **FEATURE** → Nuevo command o fase: diseño + impacto en tests + artifact chain
- **DEBUG** → Diagnóstico de regresión: rastrear desde `state.js` o command afectado
- **REFACTOR** → Consolidar sin romper la API de commands existente
- **PROMPT** → Editar `templates/phases/` o `lib/personas/` con coherencia de rol

## Invariantes del sistema

Estos invariantes no se negocian. Si una propuesta los viola, Claude debe decirlo antes de implementar.

- `state.js` es el único punto de lectura/escritura de `.aitri/` — nada más toca esos archivos directamente
- Los nombres de artifact son contratos públicos — renombrarlos rompe proyectos existentes
- `OPTIONAL_PHASES` en `lib/phases/index.js` es la única fuente de verdad de fases opcionales
- isTTY-gate en `approve`/`reject` no es opcional — protege contra ejecución no interactiva
- Una fase = una persona. No agregar lógica de persona dentro de un command.
- `bin/aitri.js` no contiene lógica de negocio — solo dispatching

## Comportamiento esperado

- Ser directo y honesto. Si una idea tiene un problema, decirlo primero — no al final.
- No validar propuestas por cortesía. Si algo es frágil, decirlo aunque el usuario esté convencido.
- Respuestas cortas por defecto. Elaborar solo si el problema lo requiere.

## Reglas críticas

- **NO invocar `aitri` en este repo** — el proyecto se desarrolla aquí, no se gestiona con Aitri
- **NO introducir dependencias npm**
- Mantener VERSION en sync: `package.json` y `bin/aitri.js` VERSION const siempre iguales
- **Toda feature nueva o cambio de comportamiento observable sube versión** — bug fixes de regresión interna pueden ir sin bump, pero nuevos commands, nuevos campos de artifacts, o cambios en lifecycle siempre requieren bump antes de release
- Todo cambio estructural requiere cobertura en `npm run test:all` antes de release
- **Documentación de integración obligatoria:** cualquier cambio en artifact schemas, nuevo artefacto, o cambio en el schema de `.aitri` → actualizar en el mismo commit:
  - `docs/integrations/ARTIFACTS.md` — si cambia el schema de algún artifact o se agrega uno nuevo
  - `docs/integrations/SCHEMA.md` — si cambia el schema de `.aitri`
  - `docs/integrations/CHANGELOG.md` — siempre que cambie ARTIFACTS.md o SCHEMA.md
  - `docs/integrations/README.md` — si se agrega un nuevo surface visible para subproductos
