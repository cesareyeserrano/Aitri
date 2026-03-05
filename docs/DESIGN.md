# Aitri — Diseño de Sistema SDLC

**Versión:** 2.0-draft
**Fecha:** 2026-03-04
**Estado:** REFERENCIA — todo EVO nuevo se valida contra este documento

---

## Propósito

Este documento es la especificación de diseño de Aitri. Define el flujo completo del SDLC, los contratos entre fases, las reglas de los gates, y los gaps conocidos con su resolución. Cualquier cambio al sistema debe ser evaluado contra este documento primero.

**Principio rector:** Aitri convierte una idea en producto probado, trazado y verificado — sin que nada del requerimiento pueda quedar sin implementar ni sin probar.

---

## Flujo en tres fases

```
IDEA → [FASE 1: DEFINICIÓN] → [FASE 2: IMPLEMENTACIÓN] → [FASE 3: VALIDACIÓN] → PRODUCTO
```

La dirección de causalidad es fundamental: el **diseño es la fuente de verdad**. El spec no lo inventa el agente — lo extrae del diseño aprobado. Nada llega a código sin haber pasado por la definición completa.

---

## FASE 1 — DEFINICIÓN COMPLETA E INTERCONECTADA

### Input
Idea del usuario (texto libre o documento de contexto).

### Output
Conjunto de artefactos 100% interconectados y validados:
- `specs/approved/X.md` — FR-N + AC-N con datos concretos (Given/When/Then)
- `docs/plan/X.md` — arquitectura, seguridad, UX ya resueltos
- `backlog/X/backlog.md` — EPIC-N → US-N con trazabilidad
- `tests/X/tests.md` — TC-N con inputs/outputs + Trace a FR-N, AC-N, US-N

### Paso 1.1 — Design Session (`aitri design --idea "..."`)

Las 7 personas corren en secuencia causal. Cada persona recibe como contexto el output de **todas las anteriores**.

```
Discovery  → Problema real, actores, pain points, restricciones, contexto de negocio
    ↓ alimenta
Product    → Valor de negocio, épicas, métricas de éxito, scope, trade-offs
    ↓ alimenta
UX/UI      → Flujos de usuario, pantallas, estados, interacciones, accesibilidad
             [SKIP si feature-type ≠ ui/hybrid — produce sección "not-applicable"]
    ↓ alimenta
Architect  → Stack, componentes, data flow, ADRs, constraints técnicos, dependencias
    ↓ alimenta
Security   → Threat model, controles requeridos, datos sensibles, compliance
    ↓ alimenta
QA         → Estrategia de pruebas, tipos de test requeridos, criterios de aceptación
    ↓ alimenta
Developer  → Orden de implementación, dependencias entre US, riesgos de integración
```

**Clasificación obligatoria al inicio:**
```
feature-type: api | ui | hybrid | cli | background-job | brownfield
```
Esta clasificación determina qué personas son obligatorias y qué gates aplican.

**Detección de conflictos:** Cada persona puede emitir flags en la sección `## Conflicts` del design.md con el siguiente schema:

```yaml
conflict:
  id: C-1
  personas: [Architect, Security]
  descripcion: "JWT stateless no soporta revocación inmediata"
  posicion_architect: "JWT para no mantener estado de sesión en servidor"
  posicion_security: "Sin revocación inmediata, credenciales comprometidas son un riesgo activo"
  opciones:
    - A: "Session tokens con Redis (más seguro, más infraestructura)"
    - B: "JWT con blacklist (compromiso latencia vs seguridad)"
  estado: abierto
```

### Paso 1.2 — Ronda de resolución de conflictos (máx. N rondas, default 2)

Solo las personas con conflictos activos vuelven a correr, con los flags como contexto explícito. Cada persona modifica **solo su sección**. No puede reabrir decisiones de otras personas ni de fases anteriores.

Si después de N rondas quedan conflictos → escalar al usuario con opciones concretas y well-formed. El usuario decide. La decisión es inmutable.

**Regla de terminación:** Un conflicto se cierra cuando todas las personas involucradas marcan `estado: resuelto` en el flag. Si alguna mantiene `estado: abierto` después de N rondas → escalar.

### Paso 1.3 — Validación y aprobación del usuario (`aitri design-review`)

El usuario lee `design.md` completo. Tres estados posibles:

| Estado | Acción |
|---|---|
| Aprobación total | Avanzar a spec-from-design |
| Rechazo con revisión | Devolver a paso 1.2 con notas del usuario como input adicional para las personas con observaciones |
| Cancelación | Eliminar todos los artefactos de Fase 1 y volver al inicio |

El estado persiste en `.aitri/design-review-status.json`.

### Paso 1.4 — Extracción de requerimientos (`aitri spec-from-design --feature X`)

El agente lee `design.md` aprobado y **extrae** — no inventa. El schema de `design.md` es normativo y debe cumplirse para que la extracción sea determinista.

**Schema normativo de `design.md`:**

```markdown
## Feature Classification
- type: <api|ui|hybrid|cli|background-job|brownfield>

## 1. Discovery
### Problem Statement
### Actors
### Pain Points
### Constraints

## 2. Product
### Business Value
### Epics
- EPIC-1: <nombre>
### Success Metrics
### Scope

## 3. UX/UI  [requerido si type=ui|hybrid]
### User Flows
### Screens
### Accessibility Requirements

## 4. Architecture
### Stack Decision
### Components
### Data Flow
### Key Decisions (ADRs)
### Non-Functional Requirements
- NFR-1: <descripción> | verify-method: <benchmark|sast|audit|manual> | threshold: <valor>

## 5. Security
### Threats
### Required Controls
### Sensitive Data

## 6. QA Strategy
### Test Types Required
### Acceptance Criteria
- AC-1 [FR-N, US-N]: Given <contexto concreto>, When <acción concreta>, Then <resultado concreto con datos>

## 7. Developer Roadmap
### Epics Breakdown
- EPIC-1
  - US-1 [FR-1, FR-2]: <descripción>
  - US-2 [FR-3]: <descripción> — depends-on: US-1
### Functional Requirements
- FR-1: <regla funcional>
### Test Cases
- TC-1 [AC-1, FR-1, US-1]: <descripción> | input: <valor concreto> | expected: <valor concreto>

## Conflicts
[Sección de flags de conflicto — vacía si no hubo conflictos]
```

**Reglas de cardinalidad mínima (rechazado si no se cumple):**
- Cada FR-N tiene ≥ 1 AC-N
- Cada AC-N tiene ≥ 1 TC-N que la traza
- Cada TC-N traza a ≥ 1 FR-N y ≥ 1 US-N
- Cada US-N traza a ≥ 1 FR-N
- Cada EPIC-N tiene ≥ 1 US-N
- Los AC-N tienen datos concretos (no genéricos como "el sistema funciona")
- Los NFR-N tienen `verify-method` y `threshold` declarados

### Paso 1.5 — Gate de interconexión (`aitri validate-design`)

Gate automático. Bloquea si falla cualquier regla:

```
✅ Cardinalidad mínima cumplida (ver reglas arriba)
✅ Sin elementos huérfanos (FR sin TC, AC sin TC, TC sin FR o US)
✅ Todo EPIC-N tiene ≥ 1 US-N
✅ Todo FR-N cubierto por ≥ 1 TC-N
✅ NFR-N tienen verify-method declarado
✅ AC-N con datos concretos (Given/When/Then con valores reales, no genéricos)
✅ Los TCs tienen inputs distintos entre sí por FR (heurística anti-copy-paste)
✅ Conflictos del design.md todos en estado: resuelto o escalado+resuelto
```

Si falla → diagnóstico exacto de qué está faltando + qué paso de Fase 1 debe re-ejecutarse.

**Output:** `docs/validation/design-validation.json` con trazabilidad completa confirmada.

---

## FASE 2 — IMPLEMENTACIÓN CON AGENTE CONTENIDO

### Input
Artefactos de Fase 1 validados (100% interconectados).

### Output
Código de producción que implementa exactamente lo definido. Sin adiciones no autorizadas.

### Paso 2.1 — Go gate (`aitri go`)

Gate humano. Verifica antes de abrir desarrollo:
- Fase 1 completa y validada
- `design-validation.json` existe y `ok: true`
- `verify-intent` ejecutado sin veredictos `fail` (veredictos `partial` requieren confirmación explícita del usuario, no `--yes`)
- Aprobación explícita del humano

### Paso 2.2 — Scaffold (`aitri scaffold`)

Genera **solo** lo definido en los artefactos de Fase 1:
- `tests/<feature>/generated/TC-N.test.mjs` — stub con inputs/outputs del AC
- `src/contracts/FR-N.js` — interfaz de contrato
- `scaffold-manifest.json` — lista exacta de archivos autorizados (la ley del agente)

Los TC stubs incluyen los inputs y expected outputs del design doc, no solo `assert.fail`.

### Paso 2.3 — Loop de implementación por US

Para cada US-N en orden de dependencias (del Developer roadmap del design.md):

#### a. Brief acotado (`aitri implement --story US-N`)
El brief contiene:
- FRs a implementar: solo los de este US
- ACs que debe satisfacer: solo las de este US
- Archivos autorizados: lista del manifest
- Contratos a implementar: `src/contracts/FR-N.js` específicos
- Tests que deben pasar: TC-N.test.mjs específicos
- **PROHIBIDO explícitamente:** crear archivos no listados, implementar FRs de otras US, agregar lógica no definida en design.md, modificar el manifest

#### b. El agente escribe código
- Código de producción
- Implementa los contratos FR-N.js (lógica real, no placeholder)
- Implementa los TC stubs (assertions reales con los inputs/outputs del design)

#### c. Unit gate (`aitri prove --story US-N`)
- Corre cada TC del US individualmente
- Verifica: contrato implementado (no placeholder), no trivial, TC lo invoca realmente
- Verifica: el TC usa los inputs/outputs concretos del AC (no assert.ok(true))
- **Si falla → agente corrige en caliente antes de avanzar**

#### d. Regression gate (`aitri prove --all`)
- Corre TODOS los TCs acumulados hasta este punto
- Detecta si la implementación del US-N rompió algo de US anteriores
- **Si falla → agente debe identificar qué cambio introdujo la regresión y corregirlo**

#### e. Scope gate (`aitri verify-scope --story US-N`)
- Solo archivos del manifest fueron modificados
- No se crearon archivos fuera del scaffold autorizado
- El código de producción importa y llama los contratos del US (análisis estático)
- No se inventaron endpoints, funciones o lógica no definida en design.md
- **Si falla → BLOCKED con lista exacta de violaciones**

#### f. Si el agente descubre un gap (`aitri design-amendment`)
El agente NO implementa algo no definido. En su lugar propone formalmente:
- Descripción del gap encontrado
- Impacto en FRs/ACs/TCs existentes
- FRs/ACs/TCs propuestos para cubrir el gap
- **Requiere aprobación del usuario**
- **Si aprobado:** propaga a spec + backlog + tests.md + TCs afectados + invalida stubs que referencian FRs modificados + invalida `proof-of-compliance.json`
- **No avanza hasta que la propagación esté completa**

---

## FASE 3 — VALIDACIÓN EN TRES NIVELES

### Input
Código de implementación completo que pasó todos los gates de Fase 2.

### Nivel 1 — Integration (`aitri verify`)

Verifica que producción y contratos están conectados:
- El código de producción importa los contratos FR-N.js (análisis estático de imports)
- El código de producción invoca las funciones de los contratos (no solo las importa)
- Todos los TCs pasan cuando se ejecutan contra el código de producción real (no solo contra el contrato en aislamiento)

**Nota:** Los NFRs con `verify-method: benchmark` se ejecutan aquí con su threshold definido en design.md. Los NFRs con `verify-method: sast` ejecutan el análisis estático correspondiente.

### Nivel 2 — Acceptance (`aitri qa`)

Por cada AC-N (Given/When/Then con datos concretos del design.md):
- El agente ejecuta el escenario **exacto** del AC contra el sistema corriendo
- Usa los inputs concretos definidos en el design (no inputs genéricos inventados)
- Evidencia requerida: comando ejecutado + respuesta real del sistema (> 20 chars, no genérica)
- PASS solo si la respuesta coincide con el expected output del design

**Fix cycle (cuando QA falla):**

```
QA falla en AC-N
    ↓
¿Es defecto de implementación?
    SÍ → corregir código → aitri prove --all → aitri qa → continuar
    NO (el comportamiento esperado era incorrecto) → aitri design-amendment
        → propagar cambio → re-ejecutar Fase 3 completa desde verify
```

### Nivel 3 — Delivery gate (`aitri deliver`)

Cierra el ciclo. Bloquea si falla cualquiera:

```
✅ Cada FR-N: cubierto por TC que pasa (unit) + integrado en producción
✅ Cada AC-N: cubierta por TC + verificada en sistema real con PASS
✅ Cada US-N: ≥ 1 AC con PASS en qa-report
✅ Cada EPIC-N: todos sus US entregados
✅ NFRs con evidencia en artefacto correspondiente
✅ Scope no violado: solo lo definido fue implementado
✅ Código de producción existe (git diff desde go marker)
✅ Trazabilidad completa: design → FR → AC → TC → código → QA
✅ build exitoso ANTES de crear el release tag
```

**Output:** `docs/delivery/X.md` + `release tag aitri-release/X-vN` + `proof-of-compliance.json` con trazabilidad desde idea hasta AC verificado.

---

## Reglas del sistema (invariantes)

1. **Dirección única:** El flujo va hacia adelante. Para retroceder se usa `design-amendment` con aprobación — nunca edición directa de artefactos.

2. **El manifest es la ley:** El agente no puede crear archivos fuera del `scaffold-manifest.json`. Cualquier archivo nuevo requiere un `design-amendment` aprobado.

3. **Sin FRs inventados:** Si el agente encuentra que falta algo, usa `design-amendment`. No implementa lo que no está definido.

4. **Evidencia real:** Los gates no aceptan texto genérico. QA requiere evidencia sustancial. Los TCs requieren inputs concretos del design.

5. **El usuario decide los conflictos:** Las personas proponen opciones con trade-offs. El usuario elige. La decisión es inmutable.

6. **Build antes de tag:** El release tag solo se crea si el build completa exitosamente.

7. **Regresión en cada US:** `prove --all` corre después de cada US para detectar regresiones antes de avanzar.

---

## Gaps conocidos y su resolución pendiente

| ID | Descripción | Impacto | EVO |
|---|---|---|---|
| GAP-01 | Fix cycle QA no modelado formalmente | CRÍTICO | EVO-097 |
| GAP-02 | Regresión entre US no verificada | CRÍTICO | EVO-097 |
| GAP-03 | Schema design.md no definido | CRÍTICO | EVO-097 |
| GAP-04 | FRs no-funcionales sin ruta de verificación | ALTO | EVO-097 |
| GAP-05 | design-amendment no propaga a stubs/contratos | ALTO | EVO-097 |
| GAP-06 | Rechazo de design sin estado definido | ALTO | EVO-097 |
| GAP-07 | Features sin UI con personas irrelevantes | ALTO | EVO-097 |
| GAP-08 | Una sola ronda de conflictos insuficiente | ALTO | EVO-097 |
| GAP-09 | Brownfield sin ruta de entrada al flujo | MEDIO | EVO-098 |
| GAP-10 | verify-intent no bloquea el go gate | MEDIO | EVO-097 |
| GAP-11 | Formato de flags de conflicto no definido | MEDIO | EVO-097 |
| GAP-12 | Release tag se crea antes de verificar build | BAJO | EVO-097 |
| GAP-13 | Inputs genéricos en TCs no detectados | BAJO | EVO-097 |

---

## Estado de implementación vs. diseño

| Componente | Estado actual | Estado objetivo |
|---|---|---|
| `aitri design` | No existe | CREAR — Design Session con 7 personas |
| `aitri design-review` | No existe | CREAR — gate de aprobación de design |
| `aitri spec-from-design` | No existe | CREAR — extracción desde design aprobado |
| `aitri validate-design` | Parcial (`validate.js`) | EXTENDER — interconexión completa |
| `aitri prove --story US-N` | Parcial (sin filtro por US) | EXTENDER — scope por US |
| `aitri prove --all` | No existe como gate explícito | CREAR — regression gate |
| `aitri verify-scope` | No existe | CREAR — scope gate por US |
| `aitri design-amendment` | Parcial (`amend.js`) | EXTENDER — propagación completa |
| `aitri verify` (integration) | Parcial (solo suite) | EXTENDER — import analysis |
| `aitri qa` | Existe | EXTENDER — inputs concretos del design |
| `aitri deliver` | Existe | FIX — build antes de tag, fix cycle |
| `aitri design-review-status` | No existe | CREAR — estado persistente de revisión |

---

## Comandos del pipeline (orden canónico)

### Fase 1 — Definición
```
aitri design --feature X --idea "..."    # Design Session con 7 personas
aitri design-review --feature X          # Gate de aprobación del usuario
aitri spec-from-design --feature X       # Extracción de requerimientos
aitri validate-design --feature X        # Gate de interconexión
```

### Fase 2 — Implementación
```
aitri go --feature X                     # Gate humano
aitri scaffold --feature X               # Genera TCs + contratos + manifest
aitri implement --story US-N             # Brief acotado por US
# [agente implementa]
aitri prove --story US-N                 # Unit gate por US
aitri prove --all --feature X            # Regression gate
aitri verify-scope --story US-N          # Scope gate por US
# [repetir para cada US]
```

### Fase 3 — Validación
```
aitri verify --feature X                 # Integration gate
aitri qa --feature X                     # Acceptance gate (sistema real)
aitri deliver --feature X                # Delivery gate + release tag
```

### Comandos de soporte
```
aitri design-amendment --feature X      # Propuesta de cambio formal
aitri audit --feature X                 # Auditoría post-delivery
aitri status --feature X                # Estado actual del pipeline
aitri resume                            # Próximo paso recomendado
```

---

## Criterio de validación de EVOs

Antes de implementar cualquier EVO, verificar contra este documento:

1. ¿El EVO avanza el estado de un componente de la tabla "Estado de implementación"?
2. ¿El EVO resuelve alguno de los GAPs de la tabla de gaps conocidos?
3. ¿El EVO viola alguna de las invariantes del sistema?
4. ¿El EVO introduce un breaking change en artefactos existentes? Si sí, ¿hay plan de migración?
5. ¿El EVO tiene tests que prueban el comportamiento descrito en este documento?
