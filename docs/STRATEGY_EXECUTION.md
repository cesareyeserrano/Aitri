Authoritative Reference for V1 → 1.0.0
Owner: César Augusto

⸻

1️⃣ Visión de Producto

Qué es Aitri

Aitri es un guardian spec-driven del SDLC, ejecutado desde CLI.

No genera magia.
No reemplaza criterio humano.
No automatiza decisiones sin contrato.

Aitri:
	•	Impone disciplina
	•	Exige especificación antes de ejecución
	•	Valida trazabilidad
	•	Obliga estructura
	•	Mantiene gobernanza técnica

⸻

Qué NO es Aitri
	•	No es autopilot
	•	No es generador autónomo de código
	•	No es project manager
	•	No es orquestador multiagente
	•	No es plataforma SaaS

⸻

2️⃣ Filosofía Operativa

Aitri combina:
	•	Spec-Driven Development (SDD) → todo nace en el spec
	•	SDLC disciplinado → ciclo de vida real
	•	Agile pragmático → valor rápido sin perder calidad

Principio rector:

“No se implementa nada que no esté definido, trazado y validado.”

⸻

3️⃣ Estado Actual (v0.2.5)

Núcleo funcional existente

✔ CLI global
✔ --version
✔ init
✔ draft
✔ approve
✔ discover
✔ plan
✔ validate (trazabilidad básica)
✔ status
✔ Enforcement de spec antes de avanzar
✔ Estructura versionable
✔ Ejemplo movido a /examples
✔ Scope V1 documentado
✔ Release discipline iniciado

⸻

4️⃣ Alcance Oficial V1

IN (compromiso contractual)

1. CLI estable
	•	Instalación global
	•	Comandos congelados
	•	UX consistente

2. Spec-driven enforced
	•	No se avanza sin spec aprobado
	•	Validación estructural mínima obligatoria

3. validate con trazabilidad básica
	•	FR → Stories
	•	Stories → Tests
	•	Fallo si hay placeholders

4. status
	•	Estado claro del proyecto
	•	Qué falta
	•	Qué está alineado

5. Documentación mínima sólida
	•	Quickstart
	•	Scope V1
	•	Arquitectura
	•	Ejemplo funcional

⸻

OUT (explícitamente fuera de V1)
	•	UI Web
	•	Integración Jira/Slack/GitHub App
	•	Multiagente autónomo
	•	Validación semántica avanzada
	•	Autogeneración de código sin aprobación
	•	Orquestación AI interna
	•	SaaS

⸻

5️⃣ Definición Formal de 1.0.0

Aitri llegará a 1.0.0 cuando:
	1.	Personas completas estén implementadas
	2.	validate tenga cobertura mínima robusta
	3.	status sea confiable en proyectos reales
	4.	CLI esté modularizado correctamente
	5.	Documentación permita adopción sin César
	6.	Haya smoke tests mínimos
	7.	Flujo con Codex/Claude esté probado como skill

⸻

6️⃣ Arquitectura de Personas (SDLC Real)

Aitri debe reflejar el ciclo real de desarrollo.

Personas mínimas obligatorias

1. Product (PO/BA)

Responsable de:
	•	Claridad de problema
	•	Valor de negocio
	•	Criterios medibles

Debe validar:
	•	Context
	•	Scope
	•	Acceptance Criteria
	•	Impact

⸻

2. Architect / Engineering

Responsable de:
	•	Diseño
	•	Riesgos
	•	Resiliencia
	•	Dependencias
	•	Non-functional

⸻

3. Developer

Responsable de:
	•	Implementación limpia
	•	Simplicidad
	•	Legibilidad
	•	Cumplimiento del spec

⸻

4. QA

Responsable de:
	•	Testabilidad
	•	Casos negativos
	•	Edge cases
	•	Cobertura mínima

⸻

Estas personas no son IA mágica.
Son checklists estructurales obligatorios.

⸻

7️⃣ Estrategia de Evolución (sin inflar)

No se agregan features por emoción.

Se sigue este orden:

⸻

Fase 1 – Completar Núcleo Disciplinado
	1.	Completar core/personas/
	•	product.md
	•	dev.md
	•	completar qa.md
	2.	Integrar personas en plan
	•	Que el plan incluya revisión por persona
	3.	Mejorar validate
	•	Confirmar que cada FR tenga al menos 1 US
	•	Confirmar que cada US tenga al menos 1 TC
	•	Confirmar que no haya reglas huérfanas
	4.	Mejorar status
	•	Mostrar cobertura simple (ej. 4 FR, 4 referenciadas)

⸻

Fase 2 – Robustez Técnica
	1.	Modularizar CLI (commands separados)
	2.	Añadir smoke tests básicos
	3.	Manejo consistente de exit codes
	4.	Mejor manejo de errores

⸻

Fase 3 – Integración AI (controlada)

Solo después de disciplina sólida:
	•	Skill formal para Codex
	•	Skill formal para Claude
	•	Guía de uso con agentes
	•	Protocolo de aprobación humana

No antes.

⸻

8️⃣ Modelo Operativo con Codex

Codex no improvisa.

Debe:
	1.	Ejecutar un comando por vez
	2.	Esperar aprobación humana
	3.	No editar archivos manualmente
	4.	No saltarse gates
	5.	No generar código sin spec aprobado

Contrato:

Human = Autoridad
Aitri = Guardia
AI = Asistente bajo contrato

⸻

9️⃣ Riesgos Actuales
	•	Inflar alcance
	•	Volverse SDLC Studio 2.0
	•	Intentar inteligencia antes de disciplina
	•	Perder enfoque CLI
	•	Confundir SDD con automatización

⸻

🔟 Decisión Estratégica Confirmada

Modelo elegido:

✔ Conservador
✔ Gobernanza primero
✔ Inteligencia después
✔ 1.0.0 cuando IA esté integrada formalmente y personas completas

⸻

11️⃣ Próximo Sprint Recomendado

Objetivo:

“Completar el modelo SDLC interno de Aitri sin añadir features nuevas.”

Backlog inmediato:
	1.	Crear product.md
	2.	Crear dev.md
	3.	Completar qa.md
	4.	Integrar personas al plan template
	5.	Mejorar validate cobertura
	6.	Mejorar status para mostrar cobertura

Nada más.

⸻

12️⃣ Qué Aitri debe llegar a ser

Aitri debe ser:
	•	Minimalista
	•	Disciplinado
	•	Determinista
	•	Auditable
	•	Portable
	•	Offline-first
	•	No dependiente de proveedor

Debe poder:
	•	Tomar proyecto existente
	•	Iniciar proyecto nuevo
	•	Continuar proyecto iniciado por otro dev
	•	Ser pasado entre equipos sin perder gobernanza

⸻

13️⃣ Cierre Mental Importante

Un motor disciplinado spec-first que puede integrarse con IA sin perder control humano.