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

> Historial completo en `git log --oneline`. EVOs detallados vivían aquí hasta v1.3.1 — purgados para mantener el archivo limpio.
> Release actual: **v1.3.2** (EVO-037 a EVO-098 completados)

### EVO-098 — Brownfield: ruta de entrada al flujo SDLC v2.2 ✅

Implementado (2026-03-06). Cierra GAP-09. Ruta:
- `aitri adopt --depth deep` → genera adoption manifest + draft specs + TC map
- `aitri design --brownfield` → Design Session con 7 personas en modo retrograde (infer from existing code)
- Continúa el pipeline v2.2 estándar: `design-review → spec-from-design → validate-design → go`
- feature-type `brownfield` registrado en DESIGN.md (sección Feature Classification)
- `.aitri/brownfield-entry.json` como marker de ruta de entrada

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
