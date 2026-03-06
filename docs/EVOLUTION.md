# Aitri Evolution Backlog

## 🟢 Ready for Implementation

_(vacío)_

---

## 🟡 In Progress

_(vacío)_

---

## 📋 Backlog

### EVO-098 — Brownfield: ruta de entrada al flujo SDLC v2.2

Definir cómo un proyecto existente (brownfield) entra al pipeline de 3 fases sin pasar por discovery from scratch. GAP-09 en DESIGN.md.

---

## 🔴 Done

> Historial completo en `git log --oneline`. EVOs detallados vivían aquí hasta v1.3.1 — purgados para mantener el archivo limpio.
> Release actual: **v1.3.1** (EVO-037 a EVO-096 completados)

### EVO-097 — Implementar SDLC v2.2 (DESIGN.md carta magna) ✅

Implementado en 12 batches (2026-03-06). Incluye:
- Fase 1 Definition: `aitri design` (7 personas), `aitri design-review`, `aitri spec-from-design` (Spec Engineer + LOGIC_GAP + dep-graph), `aitri validate-design`
- Foundation: `cli/lib/dependency-graph.js` (Kahn's + DFS cycles), `cli/lib/sealed-hashes.js` (SHA-256 TC blocks)
- Factory: SPEC-SEALED in `aitri build`, `implement --story` context chunking, `verify-scope` Ghost Code AST
- Prove: `--story US-N`, `--affected`, `--all` modes + SPEC-SEALED integrity check
- Go gate: verify-intent prerequisite + dep-graph cycle check
- Amend: Security/QA re-sign, GI consumers propagation, NO IMPACT advisory, sealed-hash invalidation
- QA: Phase A mechanical capture + Phase B QA persona independent evaluation
- Deliver: SPEC-SEALED gate + prove-all gate + REQUIRES_RE_PROVE check
