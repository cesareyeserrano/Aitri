# Aitri — Scope Lock V1

## Estado base (v0.2.5)
- CLI global funcional
- `validate` con trazabilidad básica
- `status` implementado
- Spec-driven enforced (gating)

## Objetivo V1
Aitri V1 es un CLI que hace cumplir un proceso spec-driven y permite validar un spec con trazabilidad básica y ver el estado del proyecto.

## IN (entra en V1)
- CLI global estable (instalación y ejecución)
- Enforced spec-driven (no avanzar si falta spec válido)
- `validate`: validación + trazabilidad básica (output claro)
- `status`: estado del spec/artefactos (qué falta, qué está desalineado)
- Estructura de repo estándar:
  - `specs/` (incluye `specs/approved/`)
  - `backlog/`
  - `tests/`
  - `docs/discovery/`
  - `docs/plan/`
- Documentación mínima: Quickstart + conceptos básicos
- Smoke tests mínimos para comandos core

## OUT (queda fuera de V1)
- UI / dashboard web
- GitHub App (como producto)
- Integraciones externas (Jira/Confluence/Notion/Slack)
- Multi-agent orchestration / autopilot
- Generación avanzada de código/artefactos sin aprobación humana
- Validación “semántica fuerte” (scoring inteligente de calidad de spec)

## Definition of Done (V1 cerrado)
- Repo demo o ejemplo mínimo que pase `validate` y muestre `status`
- `validate` falla correctamente cuando falta spec o hay inconsistencias
- Mensajes de error accionables (qué falta y dónde)
- Quickstart reproducible (10 minutos)
- Smoke tests ejecutables en CI/local
- Release notes + tag de release

## Notas
- V2 se define con foco principal en: ADOPCIÓN (CI/GitHub Actions lite, outputs JSON, init, reportes).