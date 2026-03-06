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

> Historial completo en `git log --oneline`. EVOs detallados vivían aquí hasta v1.3.1 — purgados para mantener el archivo limpio.
> Release actual: **v1.3.1** (EVO-037 a EVO-096 completados)
