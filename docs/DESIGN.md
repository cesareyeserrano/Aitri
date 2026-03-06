# Aitri — Diseño de Sistema SDLC

**Versión:** 2.2
**Fecha:** 2026-03-05
**Estado:** CARTA MAGNA — todo EVO se valida contra este documento

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
- `.aitri/dependency-graph.json` — grafo de dependencias entre US + consumidores de GI (generado en Paso 1.4)

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

**Perfiles de proyecto (`--profile`):** Al iniciar `aitri design`, el usuario puede seleccionar un perfil que pre-configura qué personas emiten NO IMPACT automáticamente:

| Perfil | Comportamiento | Caso de uso |
|--------|---------------|-------------|
| `strict` (default) | Todas las personas evalúan sin pre-configuración | Producción, compliance |
| `mvp` | Security y QA emiten NO IMPACT pre-firmado con condiciones estándar; UX/UI opcional | Prototipos, hackathons, MVPs internos |

El perfil **no elimina personas** — todas corren, pero en `mvp` las personas designadas reciben instrucción de emitir NO IMPACT con justificación y condiciones estándar. Si la persona detecta impacto real a pesar del perfil (e.g., el feature maneja datos PII), **debe ignorar el perfil y emitir output completo**.

**Evolución de perfil:** Un proyecto iniciado con `--profile mvp` puede evolucionar a `strict` mediante `design-amendment`. El amendment invalida los NO IMPACT pre-firmados cuyas `condiciones` se cumplan con el nuevo alcance, forzando revisión completa de esas personas. No se requiere re-iniciar el proyecto desde cero.

**NO IMPACT STATEMENT:** Cada persona evalúa si su dominio es afectado por el feature. Si determina que no hay impacto, puede emitir un NO IMPACT STATEMENT en lugar de generar documentación completa. El statement **no es un bypass libre** — requiere justificación estructurada:

```yaml
no_impact:
  persona: Security
  feature: "read-only-endpoint"
  justificacion: "Endpoint de lectura sin autenticación nueva, sin datos sensibles, sin cambio en superficie de ataque"
  condiciones: "Si se agrega escritura o datos PII, se requiere revisión completa"
```

Reglas del NO IMPACT:
- La persona **siempre corre** — evalúa y decide si emite output completo o NO IMPACT
- La justificación debe explicar POR QUÉ no aplica (no solo "no aplica")
- El campo `condiciones` declara bajo qué cambios futuro SÍ requeriría revisión completa
- `validate-design` rechaza NO IMPACT sin justificación o con justificación genérica (< 20 palabras)
- Un `design-amendment` posterior que toque las `condiciones` declaradas invalida el NO IMPACT y fuerza revisión completa de esa persona

**Detección de conflictos:** Cada persona puede emitir flags en la sección `## Conflicts` del design.md con el siguiente schema:

```yaml
conflict:
  id: C-1
  personas: [Architect, Security]
  tipo: riesgo-cumplimiento          # riesgo-cumplimiento | performance-estructura | prioridad-valor
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

**Matriz de prioridades (resolución por dominio):**

| Tipo de conflicto | Autoridad final | Regla |
|---|---|---|
| `riesgo-cumplimiento` | Security | Veto absoluto. No negociable. |
| `performance-estructura` | Architect | Voto de calidad técnica. |
| `prioridad-valor` | Product | Decide sobre scope y valor de negocio. |

**Regla para conflictos multi-tipo:** Si un conflicto califica en más de una categoría, la autoridad se determina por orden de prioridad: `riesgo-cumplimiento` > `performance-estructura` > `prioridad-valor`. Un conflicto que involucre riesgo siempre lo resuelve Security, incluso si también toca performance.

**Arbitraje humano:** El usuario solo interviene si:
1. Un conflicto persiste sin resolución después de N rondas (ninguna persona marcó `estado: resuelto`), **o**
2. La resolución automática implicaría un cambio de scope que afecta el diseño aprobado en su totalidad.

El usuario recibe opciones concretas y well-formed. La decisión es inmutable y se registra en el flag como `estado: escalado-resuelto`.

**Regla de terminación:** Un conflicto se cierra cuando todas las personas involucradas marcan `estado: resuelto`. Si alguna mantiene `estado: abierto` después de N rondas → escalar al usuario.

### Paso 1.3 — Validación y aprobación del usuario (`aitri design-review`)

El usuario lee `design.md` completo. Tres estados posibles:

| Estado | Acción |
|---|---|
| Aprobación total | Avanzar a spec-from-design |
| Rechazo con revisión | Devolver a paso 1.2 con notas del usuario como input adicional para las personas con observaciones |
| Cancelación | Eliminar todos los artefactos de Fase 1 y volver al inicio |

El estado persiste en `.aitri/design-review-status.json`.

### Paso 1.4 — Spec Engineer: Extracción determinista de requerimientos (`aitri spec-from-design --feature X`)

El Spec Engineer no es una persona de diseño — es el rol especializado del comando `spec-from-design`. Opera con un system prompt orientado a **transformar lenguaje de diseño (ambiguo por naturaleza) en un Grafo de Requerimientos Inmutables**.

**Regla de Oro del Spec Engineer:** Si un dato necesario para construir un AC (Criterio de Aceptación) no existe en el `design.md`, el Spec Engineer emite un `LOGIC_GAP` y bloquea la fase. **No infiere. No inventa. No asume.**

```yaml
logic_gap:
  id: LG-1
  elemento: "AC-3"
  problema: "El AC-3 requiere un threshold de latencia pero el design.md no lo define"
  seccion_faltante: "## 4. Architecture > Non-Functional Requirements"
  accion_requerida: "Agregar NFR con threshold concreto en design.md y re-ejecutar spec-from-design"
```

Si se emiten uno o más `LOGIC_GAP` → el comando falla con diagnóstico exacto. El usuario debe completar el `design.md` y re-ejecutar.

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
### Global Interfaces
- GI-1: <nombre> | description: <descripción> | shared-by: [US-1, US-3, US-5]
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

## No Impact Statements
[NO IMPACT statements de personas que determinaron que su dominio no es afectado]
```

**Nota:** La sección `### Global Interfaces` (bajo Architecture) declara los contratos compartidos entre múltiples US. Son el único contexto cross-US que el agente de implementación recibe durante Fase 2.

**Reglas de cardinalidad mínima (rechazado si no se cumple):**
- Cada FR-N tiene ≥ 1 AC-N
- Cada AC-N tiene ≥ 1 TC-N que la traza
- Cada TC-N traza a ≥ 1 FR-N y ≥ 1 US-N
- Cada US-N traza a ≥ 1 FR-N
- Cada EPIC-N tiene ≥ 1 US-N
- Los AC-N tienen datos concretos (no genéricos como "el sistema funciona")
- Los NFR-N tienen `verify-method` y `threshold` declarados

**Output adicional:** `.aitri/dependency-graph.json` — grafo estructurado de dependencias entre US:

```json
{
  "feature": "X",
  "generated": "2026-03-05T...",
  "nodes": [
    { "id": "US-1", "depends_on": [], "fr": ["FR-1", "FR-2"] },
    { "id": "US-2", "depends_on": ["US-1"], "fr": ["FR-3"] },
    { "id": "US-3", "depends_on": ["US-1", "US-2"], "fr": ["FR-4"] }
  ],
  "global_interfaces": ["GI-1", "GI-2"],
  "global_interface_consumers": {
    "GI-1": ["US-1", "US-3", "US-5"],
    "GI-2": ["US-2", "US-4"]
  },
  "execution_order": ["US-1", "US-2", "US-3"]
}
```

Este grafo es consumido por `implement`, `prove`, `verify-scope` y el sistema de Context Chunking para determinar orden de ejecución, contexto acotado y alcance de regresión.

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
✅ Conflictos del design.md todos en estado: resuelto o escalado-resuelto
✅ NO IMPACT statements con justificación ≥ 20 palabras y campo condiciones presente
✅ dependency-graph.json generado y sin ciclos
✅ dependency-graph.json incluye global_interface_consumers para toda GI declarada
✅ Sin LOGIC_GAP pendientes de spec-from-design
```

Si falla → diagnóstico exacto de qué está faltando + qué paso de Fase 1 debe re-ejecutarse.

**Output:** `docs/validation/design-validation.json` con trazabilidad completa confirmada.

---

## FASE 2 — IMPLEMENTACIÓN CON AGENTE CONTENIDO

### Input
Artefactos de Fase 1 validados (100% interconectados) + `.aitri/dependency-graph.json`.

### Output
Código de producción que implementa exactamente lo definido. Sin adiciones no autorizadas.

### Paso 2.1 — Go gate (`aitri go`)

Gate humano. Verifica antes de abrir desarrollo:
- Fase 1 completa y validada
- `design-validation.json` existe y `ok: true`
- `dependency-graph.json` existe y sin ciclos
- `verify-intent` ejecutado sin veredictos `fail` (veredictos `partial` requieren confirmación explícita del usuario, no `--yes`). `verify-intent` es un comando existente que valida que la especificación refleja fielmente la intención del diseño — compara el spec aprobado contra el design.md buscando discrepancias de intención.
- Aprobación explícita del humano

### Paso 2.2 — Scaffold (`aitri scaffold`)

Genera **solo** lo definido en los artefactos de Fase 1:
- `tests/<feature>/generated/TC-N.test.mjs` — stub con inputs/outputs del AC
- `src/contracts/FR-N.js` — interfaz de contrato
- `scaffold-manifest.json` — lista exacta de archivos autorizados (la ley del agente)
- `.aitri/sealed-hashes.json` — hashes de los bloques SPEC-SEALED de cada TC

Los TC stubs incluyen los inputs y expected outputs del design doc como **bloques sellados (SPEC-SEALED)** que el agente no puede modificar:

```javascript
// TC-1 [AC-1, FR-1, US-1]
// --- SPEC-SEALED: DO NOT MODIFY ---
const EXPECTED = { status: 201, body: { id: "uuid", name: "Task Alpha" } };
const INPUT = { name: "Task Alpha", priority: "high" };
// --- SPEC-SEALED: END ---

// TODO: Agent completes setup, invocation, and assertions using INPUT/EXPECTED
```

El scaffold calcula el hash SHA-256 de cada bloque SPEC-SEALED y lo registra en `.aitri/sealed-hashes.json`. El agente puede completar el setup, la invocación y el teardown del test, pero los datos de prueba (INPUT/EXPECTED) son inmutables.

### Paso 2.3 — Loop de implementación por US

Para cada US-N en el `execution_order` del `dependency-graph.json`:

#### a. Brief acotado con contexto chunked (`aitri implement --story US-N`)

El brief contiene **solo el contexto necesario** (ver Sección de Gestión de Contexto):
- FRs a implementar: solo los de este US
- ACs que debe satisfacer: solo las de este US
- Archivos autorizados: lista del manifest (filtrada por US)
- Contratos a implementar: `src/contracts/FR-N.js` específicos
- Tests que deben pasar: TC-N.test.mjs específicos
- Dependencias directas: US de los que depende este US (sus contratos e interfaces)
- Global interfaces: GI-N del design.md (contexto compartido)
- **PROHIBIDO explícitamente:** crear archivos no listados, implementar FRs de otras US, agregar lógica no definida en design.md, modificar el manifest, modificar bloques SPEC-SEALED, leer el design.md completo

#### b. El agente escribe código
- Código de producción
- Implementa los contratos FR-N.js (lógica real, no placeholder)
- Completa los TC stubs: setup, invocación y assertions usando los INPUT/EXPECTED sellados
- **No modifica los bloques SPEC-SEALED** — los datos de prueba vienen del Spec Engineer

#### c. Unit gate (`aitri prove --story US-N`)
- Corre cada TC del US individualmente
- Verifica: contrato implementado (no placeholder), no trivial, TC lo invoca realmente
- Verifica: el TC usa los INPUT/EXPECTED del bloque SPEC-SEALED (no assert.ok(true))
- **Verifica integridad SPEC-SEALED:** compara hash actual de cada bloque contra `.aitri/sealed-hashes.json` — si el hash no coincide → `BLOCKED` (el agente alteró los datos de prueba)
- **Si falla → agente corrige en caliente antes de avanzar**

#### d. Regression gate (`aitri prove --affected`)
- Usa el `dependency-graph.json` para calcular el alcance de impacto del US-N:
  - TCs del US-N actual
  - TCs de US que dependen directamente de US-N (`depends_on` inverso)
  - TCs de US que consumen las mismas Global Interfaces que US-N modificó (`global_interface_consumers`)
- Detecta si la implementación del US-N rompió algo de US relacionados
- **Si falla → estado: `BLOCKED_BY_REGRESSION`** — el agente debe identificar qué cambio introdujo la regresión y corregirlo antes de poder avanzar al US siguiente
- No se avanza al US-N+1 mientras exista un `BLOCKED_BY_REGRESSION` activo

#### e. Scope gate (`aitri verify-scope --story US-N`)
- Solo archivos del manifest fueron modificados
- No se crearon archivos fuera del scaffold autorizado
- El código de producción importa y llama los contratos del US (análisis estático)
- **Ghost Code Analysis (AST):** Cualquier export nombrado del módulo de producción que no sea una función definida en el contrato `FR-N.js` correspondiente causa rechazo. El contrato es el único punto de entrada externo autorizado. Las funciones internas no exportadas son libres.
- **SPEC-SEALED integrity:** Verifica que ningún bloque sellado fue alterado (hash check contra `sealed-hashes.json`)
- No se inventaron endpoints, funciones o lógica no definida en design.md
- **Si falla → `BLOCKED` con lista exacta de violaciones**

#### f. Si el agente descubre un gap (`aitri design-amendment`)
El agente NO implementa algo no definido. En su lugar propone formalmente:
- Descripción del gap encontrado
- Impacto en FRs/ACs/TCs existentes
- FRs/ACs/TCs propuestos para cubrir el gap
- **Requiere aprobación del usuario**
- **Si aprobado:** Security y QA deben re-firmar la sección afectada del design. El protocolo de re-firma aplica la misma matriz de prioridades del Paso 1.2. Si Security o QA objetan la enmienda, se aplican máximo 1 ronda de ajuste; si persiste objeción, escala al usuario.
- **Después de re-firma:** propaga a spec + backlog + tests.md + TCs afectados + invalida stubs que referencian FRs modificados + recalcula `sealed-hashes.json` para TCs regenerados + invalida `proof-of-compliance.json`
- **Propagación a Global Interfaces:** Si la enmienda modifica una GI, todos los US en `global_interface_consumers[GI-N]` que ya pasaron prove se marcan como `REQUIRES_RE_PROVE`. No se puede avanzar a Fase 3 mientras existan US con este estado.
- **Invalidación de NO IMPACT:** Si la enmienda toca las `condiciones` declaradas en un NO IMPACT statement, ese statement se invalida y la persona debe emitir revisión completa.
- **No avanza hasta que la propagación esté completa**
- **Excepción de contexto:** Durante design-amendment, el agente tiene acceso al design.md completo para evaluar impacto cross-US

---

## FASE 3 — VALIDACIÓN EN TRES NIVELES

### Input
Código de implementación completo que pasó todos los gates de Fase 2.

### Pre-condición de entrada

Antes de iniciar Fase 3:
- `aitri prove --all` (regresión completa) — corre TODOS los TCs de TODOS los US del feature. Este es el único punto donde se ejecuta la suite completa, detectando dependencias implícitas (shared state, side effects) que el grafo no captura.
- No existe ningún US con estado `REQUIRES_RE_PROVE`
- Si `prove --all` falla → `BLOCKED_BY_REGRESSION` — no se entra a Fase 3

### Marco de verificación

La verificación completa del sistema opera en 3 niveles. El Nivel 1 se ejecuta durante Fase 2 (prove por US); los Niveles 2 y 3 se ejecutan en Fase 3.

| Nivel | Comando | Objetivo | Evidencia requerida |
|---|---|---|---|
| **Nivel 1 — Unit** | `aitri prove --story US-N` | Contrato en aislamiento | Logs de ejecución de cada TC-N con SPEC-SEALED intacto |
| **Nivel 2 — Integration** | `aitri verify` | Producción consume contrato | Traza de importación + traza de llamada real |
| **Nivel 3 — Acceptance** | `aitri qa` | Sistema real vs AC del diseño | Output real capturado mecánicamente + veredicto de agente QA independiente |

`aitri deliver` es el gate de cierre que verifica que los 3 niveles están completos y con evidencia — no es un nivel de verificación en sí mismo.

### Nivel 2 — Integration (`aitri verify`)

Verifica que producción y contratos están conectados:
- El código de producción importa los contratos FR-N.js (análisis estático de imports)
- El código de producción invoca las funciones de los contratos (no solo las importa)
- Todos los TCs pasan cuando se ejecutan contra el código de producción real (no solo contra el contrato en aislamiento)

**Nota:** Los NFRs con `verify-method: benchmark` se ejecutan aquí con su threshold definido en design.md. Los NFRs con `verify-method: sast` ejecutan el análisis estático correspondiente.

### Nivel 3 — Acceptance (`aitri qa`)

**Principio: Ningún agente evalúa su propio trabajo.**

La ejecución de QA opera en dos fases separadas con agentes distintos:

**Fase A — Captura mecánica de evidencia:**
El sistema (no el agente de implementación) ejecuta los escenarios del AC contra el sistema corriendo:
- Usa los inputs concretos definidos en el design (los mismos del SPEC-SEALED)
- Captura el output real del sistema (stdout/stderr/response body)
- La captura es mecánica — sin interpretación ni manipulación del agente

**Fase B — Verificación por agente QA independiente:**
Un agente con el system prompt de `core/personas/qa.md` recibe:
- El AC completo con su Given/When/Then y expected output
- El output real capturado en Fase A
- **No tiene acceso al código de producción** — solo ve el AC y la evidencia

Emite veredicto:
- `PASS`: el output real satisface el Then del AC
- `FAIL`: el output real no coincide con el expected, con explicación de la discrepancia

**Fix cycle (cuando QA falla):**

```
QA falla en AC-N
    ↓
¿Es defecto de implementación?
    SÍ → corregir código → aitri prove --all → aitri qa → continuar
    NO (el comportamiento esperado era incorrecto) → aitri design-amendment
        → propagar cambio → re-ejecutar Fase 3 completa desde prove --all
```

### Delivery gate (`aitri deliver`)

Cierra el ciclo. Bloquea si falla cualquiera:

```
✅ Cada FR-N: cubierto por TC que pasa (Nivel 1) + integrado en producción (Nivel 2)
✅ Cada AC-N: cubierta por TC + verificada en sistema real con PASS de agente QA independiente (Nivel 3)
✅ Cada US-N: ≥ 1 AC con PASS en qa-report
✅ Cada EPIC-N: todos sus US entregados
✅ NFRs con evidencia en artefacto correspondiente
✅ Scope no violado: solo lo definido fue implementado
✅ SPEC-SEALED integridad: todos los hashes coinciden con sealed-hashes.json
✅ Código de producción existe (git diff desde go marker)
✅ Trazabilidad completa: design → FR → AC → TC → código → QA
✅ prove --all pasó (pre-condición de Fase 3)
✅ No existe US con REQUIRES_RE_PROVE activo
✅ build exitoso ANTES de crear el release tag
```

**Output:** `docs/delivery/X.md` + `release tag aitri-release/X-vN` + `proof-of-compliance.json` con trazabilidad desde idea hasta AC verificado.

---

## Gestión de Contexto (Anti-Alucinación)

Para proyectos con múltiples épicas, pasar el `design.md` completo al agente durante codificación introduce ruido de otras épicas que contamina la lógica del US activo. Aitri aplica **Context Chunking** en todos los comandos de Fase 2.

### Qué recibe el agente por US

```
Contexto autorizado para implement --story US-N:
  ├── US-N: descripción + FRs + ACs + TCs propios
  ├── Dependencias directas (del dependency-graph.json):
  │     └── Para cada US en depends_on[US-N]: sus contratos e interfaces (no su implementación)
  ├── Global Interfaces (GI-N del design.md):
  │     └── Contratos compartidos entre múltiples US (autenticación, configuración, tipos base)
  └── scaffold-manifest.json (filtrado a archivos del US-N)

Contexto PROHIBIDO:
  ├── design.md completo
  ├── FRs, ACs, TCs de otros US no relacionados
  └── Implementaciones de otros US (solo interfaces)
```

### Excepción: design-amendment

Durante una propuesta de `design-amendment`, el agente recibe el design.md completo para evaluar impacto cross-épica. Esta es la única excepción al chunking.

### Prerequisito

El Context Chunking requiere `.aitri/dependency-graph.json` (generado en Paso 1.4). Sin este artefacto, `implement` no puede construir el contexto acotado y bloqueará.

---

## Modelo de regresión en dos tiers

El sistema usa dos niveles de regresión para balancear velocidad de desarrollo con garantía de cobertura.

### Tier 1 — Regresión por impacto (`prove --affected`)

Se ejecuta **después de cada US** en el loop de implementación (Paso 2.3d).

Alcance: calculado desde el `dependency-graph.json`:
- TCs del US-N actual
- TCs de US que dependen directamente de US-N (dependencia inversa)
- TCs de US que consumen las mismas Global Interfaces que US-N modificó

**Trade-off aceptado:** Las dependencias implícitas (shared DB state, side effects, race conditions) no se capturan en `--affected`. Un US que modifica una tabla de base de datos podría romper otro US sin relación directa en el grafo. Estas regresiones se detectan en Tier 2.

### Tier 2 — Regresión completa (`prove --all`)

Se ejecuta **una sola vez** como pre-condición de entrada a Fase 3.

Alcance: TODOS los TCs de TODOS los US del feature completo.

Este es el safety net que detecta dependencias implícitas no capturadas por el grafo. Si falla, la regresión se introdujo en algún US del loop y debe identificarse y corregirse antes de entrar a validación.

### Por qué no prove --all en cada US

Con N user stories, `prove --all` en cada US produce O(N²) ejecuciones de tests. Para features con 50+ US, esto es prohibitivo en tiempo y tokens. La regresión por impacto reduce esto a O(N × K) donde K es el número promedio de dependencias directas + consumidores de GI — típicamente mucho menor que N.

---

## Reglas del sistema (invariantes)

1. **Dirección única:** El flujo va hacia adelante. Para retroceder se usa `design-amendment` con aprobación — nunca edición directa de artefactos.

2. **El manifest es la ley:** El agente no puede crear archivos fuera del `scaffold-manifest.json`. Cualquier archivo nuevo requiere un `design-amendment` aprobado.

3. **Sin FRs inventados:** Si el agente encuentra que falta algo, usa `design-amendment`. No implementa lo que no está definido.

4. **Evidencia real:** Los gates no aceptan texto genérico. QA requiere evidencia capturada mecánicamente y verificada por agente independiente. Los TCs usan datos sellados del Spec Engineer.

5. **Ningún agente evalúa su propio trabajo:** El agente de implementación no controla los datos de prueba (SPEC-SEALED) ni evalúa la evidencia de QA (agente QA independiente).

6. **El usuario decide los conflictos:** Las personas proponen opciones con trade-offs. El usuario elige cuando la resolución automática no aplica. La decisión es inmutable.

7. **Build antes de tag:** El release tag solo se crea si el build completa exitosamente.

8. **Regresión en dos tiers:** `prove --affected` por impacto después de cada US; `prove --all` completo antes de Fase 3. Un `BLOCKED_BY_REGRESSION` bloquea el avance.

9. **Contexto acotado:** El agente de implementación nunca recibe más contexto del necesario para su US activo. El design.md completo solo es accesible en design-amendment.

10. **Sin LOGIC_GAP pendientes:** No se puede avanzar a Fase 2 si quedan LOGIC_GAP sin resolver del Paso 1.4.

11. **Security veta riesgo:** En cualquier conflicto que involucre riesgo o compliance — incluyendo enmiendas — Security tiene autoridad final.

12. **SPEC-SEALED inmutable:** Los datos de prueba generados por el scaffold son inmutables. Cualquier alteración de un bloque sellado bloquea el pipeline.

13. **Cambio de GI propaga re-prove:** Si una Global Interface cambia vía design-amendment, todos los US consumidores se marcan `REQUIRES_RE_PROVE`. No se entra a Fase 3 con re-proves pendientes.

---

## Gaps conocidos y su resolución

| ID | Descripción | Impacto | EVO | Estado |
|---|---|---|---|---|
| GAP-01 | Fix cycle QA no modelado formalmente | CRÍTICO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-02 | Regresión entre US no verificada | CRÍTICO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-03 | Schema design.md no definido | CRÍTICO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-04 | FRs no-funcionales sin ruta de verificación | ALTO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-05 | design-amendment no propaga a stubs/contratos | ALTO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-06 | Rechazo de design sin estado definido | ALTO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-07 | Features sin UI con personas irrelevantes | ALTO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-08 | Una sola ronda de conflictos insuficiente | ALTO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-09 | Brownfield sin ruta de entrada al flujo | MEDIO | EVO-098 | Resuelto: `aitri adopt --depth deep` → `aitri design --brownfield` → pipeline v2.2 |
| GAP-10 | verify-intent no bloquea el go gate | MEDIO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-11 | Formato de flags de conflicto no definido | MEDIO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-12 | Release tag se crea antes de verificar build | BAJO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-13 | Inputs genéricos en TCs no detectados | BAJO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-14 | Agente recibe design.md completo durante codificación | ALTO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-15 | Dependencias entre US implícitas en texto | ALTO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-16 | spec-from-design puede inventar ACs con datos incompletos | CRÍTICO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-17 | Ghost code (exports no definidos en contrato) no detectado | ALTO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-18 | Conflictos multi-tipo sin tiebreaker definido | MEDIO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-19 | design-amendment sin re-validación de Security/QA | ALTO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-20 | Agente puede alterar datos de prueba en TC stubs | CRÍTICO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-21 | Cambio de GI no propaga re-prove a US consumidores | CRÍTICO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-22 | Mismo agente implementa y evalúa evidencia de QA | ALTO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-23 | prove --all en cada US es O(N²) para features grandes | MEDIO | EVO-097 | Resuelto en diseño (v2.2) |
| GAP-24 | Personas generan documentación pesada para features de bajo impacto | MEDIO | EVO-097 | Resuelto en diseño (v2.2) |

---

## Estado de implementación vs. diseño

| Componente | Estado actual | Estado objetivo |
|---|---|---|
| `aitri design` | No existe | CREAR — Design Session con 7 personas + NO IMPACT |
| `aitri go` | Parcial (`go.js`) | EXTENDER — verify-intent prerequisite + dependency-graph cycle check |
| `aitri design-review` | No existe | CREAR — gate de aprobación de design |
| `aitri spec-from-design` | No existe | CREAR — Spec Engineer con LOGIC_GAP + dependency-graph.json |
| `aitri validate-design` | Parcial (`validate.js`) | EXTENDER — interconexión completa + validar dependency-graph + NO IMPACT |
| `aitri scaffold` | Existe | EXTENDER — SPEC-SEALED blocks + sealed-hashes.json |
| `aitri prove --story US-N` | Parcial (sin filtro por US) | EXTENDER — scope por US + SPEC-SEALED hash check |
| `aitri prove --affected` | No existe | CREAR — regresión por impacto basada en dependency-graph |
| `aitri prove --all` | No existe como gate explícito | CREAR — regresión completa (pre-Fase 3) |
| `aitri verify-scope` | No existe | CREAR — scope gate por US con Ghost Code AST + SPEC-SEALED check |
| `aitri design-amendment` | Parcial (`amend.js`) | EXTENDER — propagación completa + re-firma Security/QA + GI consumers + NO IMPACT invalidation |
| `aitri verify` (integration) | Parcial (solo suite) | EXTENDER — import analysis + call trace |
| `aitri qa` | Existe | EXTENDER — captura mecánica + agente QA independiente |
| `aitri deliver` | Existe | FIX — build antes de tag, SPEC-SEALED check, prove --all gate, REQUIRES_RE_PROVE check |
| `aitri implement` (context chunking) | No existe | CREAR — context chunking basado en dependency-graph.json |
| `aitri verify-intent` | Existe | EXTENDER — bloquear go gate si veredicto fail |

---

## Comandos del pipeline (orden canónico)

### Fase 1 — Definición
```
aitri design --feature X --idea "..."    # Design Session con 7 personas (NO IMPACT habilitado)
aitri design-review --feature X          # Gate de aprobación del usuario
aitri spec-from-design --feature X       # Spec Engineer: extracción + LOGIC_GAP + dependency-graph
aitri validate-design --feature X        # Gate de interconexión + NO IMPACT validation
```

### Fase 2 — Implementación
```
aitri go --feature X                     # Gate humano
aitri scaffold --feature X               # Genera TCs (SPEC-SEALED) + contratos + manifest + sealed-hashes
aitri implement --story US-N             # Brief acotado por US (context chunked)
# [agente implementa — no modifica SPEC-SEALED]
aitri prove --story US-N                 # Nivel 1 (Unit) + SPEC-SEALED hash check
aitri prove --affected --story US-N      # Tier 1: regresión por impacto (deps directas + GI consumers)
aitri verify-scope --story US-N          # Scope gate + Ghost Code AST + SPEC-SEALED check
# [repetir para cada US en execution_order]
aitri prove --all --feature X            # Tier 2: regresión completa (pre-condición Fase 3)
```

### Fase 3 — Validación
```
aitri verify --feature X                 # Nivel 2 (Integration) — import + call trace
aitri qa --feature X                     # Nivel 3 (Acceptance) — captura mecánica + agente QA independiente
aitri deliver --feature X                # Delivery gate + build + release tag
```

### Comandos de soporte (no incluidos en tabla de implementación — son transversales)
```
aitri design-amendment --feature X      # Propuesta de cambio formal (re-firma + GI propagation)
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
