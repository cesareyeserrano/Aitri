# Aitri Evolution Backlog

## 🟢 Ready for Implementation

| ID | Feature | Notes |
|----|---------|-------|

## 🟡 In Progress

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

**Scope:**

1. **`aitri draft`** — si existe `.aitri/dev-roadmap.md`, inyectarlo como contexto en el prompt de generación de spec (no lo fuerza, lo usa como referencia)

2. **`aitri plan`** — si existen artefactos de pre-planning, pasarlos como contexto adicional al LLM que genera backlog y tests: architecture-decision informa decisiones técnicas del backlog, security-review informa casos de test de seguridad, qa-plan informa estructura del test suite

3. **`aitri build`** — si existe `architecture-decision.md`, incluirlo como contexto en los implementation briefs generados por story

4. **Documentación oficial** — reescribir `docs/architecture.md` y actualizar `docs/guides/` para reflejar el pipeline completo con pre-planning. El README principal también requiere actualización.

**Causa raíz documentada:**
Aitri creció como herramienta de guardarraíles estructurales (gates, validación de formato). El valor semántico — que el conocimiento fluya entre etapas — se asumió implícito. Los tests validan mecánica (exit codes, archivos creados) pero no semántica (¿el output usa el contexto disponible?).

**Principio correctivo adoptado:**
> Para cada artefacto que Aitri produce, debe existir al menos un comando posterior que lo consume.

**Scope implementado:**
- `aitri draft` — inyecta `.aitri/dev-roadmap.md` como sección "Pre-Planning Context" en el spec generado
- `aitri plan` — inyecta `architecture-decision.md`, `security-review.md`, `ux-design.md` en las secciones correspondientes del plan doc; inyecta `qa-plan.md` en el tests file
- `aitri build` — inyecta `architecture-decision.md` y `security-review.md` como secciones adicionales en cada implementation brief
- `docs/architecture.md` — reescrito para reflejar el pipeline completo con personas activas, artifact topology actualizada, agent integration contract actualizado

**Estado:** Implementado — 234 tests verdes.

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
   - `audit` layer 4 → usa `architect.md` + `security.md` en lugar de prompts inline

**Pipeline resultante:**

```
Pre-planning (proyecto, 1 sola vez)
  discover-idea → product-spec → ux-design → arch-design
  → sec-review → qa-plan → dev-roadmap

Pre-Go (por feature)
  draft → spec-improve[architect] → approve → go

Post-Go (factory)
  build → testgen[qa] → contractgen[developer] → prove → deliver

Post-delivery
  audit[architect + security]
```

**Escenarios cubiertos:**
- Proyecto nuevo: correr pre-planning completo, luego pipeline normal por feature
- Feature nueva en proyecto existente: los artefactos `.aitri/*.md` ya existen, ir directo a draft
- Backlog/mejoras menores: draft directo sin tocar pre-planning
- Cambio de dirección: regenerar los artefactos `.aitri/` afectados
- Proyecto importado: `aitri audit` + `aitri discover-idea` para documentar lo existente

**Sin breaking changes.** Todos los comandos existentes mantienen su interface. Los refactors solo mejoran la calidad del output LLM.

**Estado:** Implementado — commits `6cebaee`, `e046663`. Audit extendido a 4 personas (architect + security + developer + ux-ui condicional).

---

## 🔴 Done

> Historial completo en `git log`. Release actual: **v1.0.6**
