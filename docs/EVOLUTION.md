# Aitri Evolution Backlog

## 🟢 Ready for Implementation

| ID | Feature | Notes |
|----|---------|-------|
| EVO-041 | Épicas — container de features con progreso agregado | Arquitectónico, scope mayor |

---

### EVO-041 — Épicas: container de features con progreso agregado

**Feedback origen:**
La jerarquía actual es `Feature → FR → US → TC`. En proyectos reales los backlogs se organizan en épicas que agrupan features relacionadas hacia un outcome de negocio. Sin épicas: no hay progreso agregado, `resume` no puede navegar cross-feature, el `dev-roadmap.md` no tiene estructura intermedia.

**Scope propuesto:**

1. **`aitri epic create --name <name> --features <f1,f2,...>`** → `epics/<name>.json`
2. **`aitri epic status --name <name>`** — progreso de features dentro del epic (delivered/in-progress/not-started)
3. **`aitri resume`** — si hay épicas, incluir `activeEpic` y `epicProgress` en el output JSON
4. **`aitri status --epic <name>`** — vista filtrada por epic
5. Features sin epic: siguen funcionando exactamente igual (backward compatible)

**Epics no requieren pre-planning.** Son contenedores de organización, no una etapa del SDLC.

**Nota:** Este EVO es el más grande y debe implementarse cuando el pipeline base esté estabilizado.

## 🟡 In Progress

---

## 🔴 Done

> Historial completo en `git log`. Release actual: **v1.1.0**

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
