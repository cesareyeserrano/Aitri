# Aitri Evolution Backlog

## 🟢 Ready for Implementation

| ID | Feature | Notes |
|----|---------|-------|
| EVO-036 | **`aitri audit` — auditoría técnica profunda** con 4 capas: **(1) Código estático** — complejidad ciclomática, dead code, duplicación, patrones inseguros (no requiere AI); **(2) Código LLM** — persona Technical Auditor: arquitectura, escalabilidad, seguridad profunda, performance, buenas prácticas del stack detectado (requiere AI, salteable con `--no-ai`); **(3) Drift spec→código** — detección semántica de desincronización entre spec aprobado e implementación: si el código evolucionó sin actualizar el spec, audit presenta el drift al usuario quien decide si es "spec desactualizado" (→ `aitri spec-improve`) o "deuda técnica" (→ backlog); **(4) Dependencias** — CVEs conocidos, paquetes desactualizados con vulnerabilidades, licencias. **Flujo de aprobación**: hallazgos se presentan uno a uno (qué es / impacto / severidad / recomendación), usuario aprueba/descarta/pospone cada uno, solo aprobados van a `feedback.json`/backlog. Siempre advisory — nunca modifica código ni docs. `--no-ai` corre capas 1+4 únicamente. `--json` para CI. | Alto valor, alto esfuerzo |

## 🟡 In Progress

_(none)_

## 🔴 Done

> Historial completo en `git log`. Release actual: **v1.0.5**
