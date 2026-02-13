AITRI – CODEX EXECUTION CHECKLIST

Authoritative Workflow Contract
Owner: César Augusto

⸻

🔒 REGLAS INNEGOCIABLES
	1.	Codex ejecuta un comando a la vez.
	2.	Codex nunca edita archivos directamente sin usar Aitri.
	3.	Codex nunca salta gates.
	4.	Codex nunca genera código productivo sin:
	•	Spec aprobado
	•	validate PASSED
	•	Confirmación humana explícita

Si alguna condición falla → STOP.

⸻

🧭 MODELO DE FLUJO OBLIGATORIO

Fase 0 – Estado

Codex debe empezar SIEMPRE con: aitri status
Si:
	•	Falta estructura → aitri init
	•	Falta spec aprobado → aitri draft
	•	Falta discover → aitri discover
	•	Falta plan → aitri plan
	•	Hay placeholders → aitri validate

Nunca asumir estado.

⸻

Fase 1 – Creación de Feature Nueva
	1.	aitri draft --guided
	2.	Humano revisa
	3.	aitri approve
	4.	aitri discover
	5.	aitri plan
	6.	Humano completa backlog/tests
	7.	aitri validate
	8.	Solo si VALIDATION PASSED → listo para implementación

⸻

Fase 2 – Mejora Interna de Aitri

Para evolucionar Aitri mismo:
	1.	aitri draft
	2.	Definir impacto técnico claro
	3.	aitri approve
	4.	aitri discover
	5.	aitri plan
	6.	Implementación
	7.	aitri validate
	8.	Commit

Nunca saltar spec.

⸻

🧠 PERSONAS OBLIGATORIAS EN EL PLAN

Todo plan debe reflejar revisión por:
	•	Product (valor de negocio claro)
	•	Architect (diseño y riesgos)
	•	Developer (implementación simple y limpia)
	•	QA (casos negativos y cobertura)

Si falta una perspectiva → el plan está incompleto.

⸻

🛑 CONDICIONES DE BLOQUEO

Codex debe detenerse si:
	•	No hay spec aprobado
	•	Hay placeholders FR-? AC-? US-?
	•	Hay reglas huérfanas
	•	validate falla
	•	El humano no aprobó

No intentar “arreglarlo automáticamente” sin instrucción explícita.

⸻

📊 CONTRATO DE VALIDACIÓN (V1)

validate debe asegurar:
	1.	Cada FR tiene al menos una US
	2.	Cada US tiene al menos un TC
	3.	No hay placeholders
	4.	Archivos esperados existen

Si alguna falla → exit code != 0

⸻

🎯 DEFINICIÓN DE LISTO PARA IMPLEMENTAR

Una feature está lista cuando:

✔ Spec aprobado
✔ discover ejecutado
✔ plan generado
✔ backlog completado
✔ tests definidos
✔ validate PASSED
✔ humano aprueba

Solo entonces puede generarse código.

⸻

🚫 LO QUE CODEX NO DEBE HACER
	•	No crear archivos manualmente fuera de Aitri
	•	No editar spec directamente sin draft
	•	No generar historias fuera de backlog oficial
	•	No cambiar comandos del CLI sin spec aprobado
	•	No inflar alcance

⸻

🔁 CICLO COMPLETO SDLC EN AITRI

Idea
→ Draft
→ Approve
→ Discover
→ Plan
→ Refine backlog/tests
→ Validate
→ Implement
→ Commit

Siempre en ese orden.

⸻

🏁 META HACIA 1.0.0

Antes de declarar 1.0.0:
	•	Personas completas
	•	validate robusto
	•	status confiable
	•	CLI modularizado
	•	Documentación suficiente para adopción
	•	Flujo probado con Codex y Claude

Sin eso → no es 1.0.0.

⸻

🧱 PRINCIPIO FINAL

Aitri no es un generador.
Es un sistema de disciplina.

AI asiste.
Humano decide.
Aitri impone estructura.