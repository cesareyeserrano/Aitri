# Aitri — Backlog

> Open items only. Closed items are in CHANGELOG.md.
> Priority: P1 (critical) / P2 (important) / P3 (nice to have)

---

## Entry Standard

Every backlog entry must be self-contained — implementable in a future session with zero memory of the original conversation. Before adding an item, verify it answers all of these:

| Question | Why it matters |
| :--- | :--- |
| **What is the user-visible problem?** | Prevents implementing a solution looking for a problem |
| **Which files are affected?** | Implementer knows where to start without exploring |
| **What is the exact behavior change?** | Removes ambiguity about what "done" looks like |
| **Are there technical decisions pre-resolved?** | Captures trade-offs decided during analysis, not during implementation |
| **What does `validate()` or the test need to verify?** | Defines the acceptance criterion at the code level |
| **Are there known conflicts or risks with existing code?** | Prevents regressions on parsers, schemas, or commands |

**Minimum entry format:**
```
- [ ] P? — **Title** — one-line description of the user-visible problem.
  Problem: <why this matters, what breaks without it>
  Files: <lib/..., templates/..., test/...>
  Behavior: <what changes — inputs, outputs, validation rules>
  Decisions: <any trade-offs already resolved>
  Acceptance: <how to verify it works — test or manual check>
```

Entries without `Files` and `Behavior` are considered incomplete and must be expanded before scheduling.

---

## Open

### Ecosystem — Aitri Hub

- [x] P2 — **Hub: migrate project discovery to self-managed registry** *(implemented v0.1.64)* — Hub currently reads `~/.aitri-hub/projects.json` which Aitri used to auto-populate. Since v0.1.64 Aitri no longer writes to it. Hub should clarify that `setup` is the canonical registration path and optionally scan `~/.aitri/` for projects with `.aitri` files.

  Problem: New projects won't be auto-registered in Hub after v0.1.64. Users need to know to run `aitri-hub setup` manually.

  Files (Hub repo):
  - `lib/commands/setup.js` — add optional auto-scan flow
  - `lib/commands/init.js` — update onboarding message to direct users to `setup`
  - `README.md` — update setup instructions (no longer mentions Aitri auto-registration)

  Behavior:
  - `aitri-hub setup` remains the canonical registration path (already works)
  - Optional: `aitri-hub scan <dir>` walks a directory tree finding `.aitri` files and offers to register each
  - No changes to Hub's reader — `aitri-reader.js` is already correct

  Decisions: Hub owns `~/.aitri-hub/projects.json` entirely. Aitri never touches it.

  Acceptance: `aitri init` on a new project does not add an entry to `~/.aitri-hub/projects.json`. Running `aitri-hub setup` registers the project correctly.

- [x] P3 — **Hub: standardize change detection for GitHub projects** *(implemented — github-poller.js, 60s interval, 5min backoff on 429)* — Hub monitors local projects via filesystem poll (5s). GitHub (remote) projects have no equivalent mechanism.

  Problem: Teams with separate machines using GitHub repos can't use Hub's live monitoring without a manual refresh mechanism.

  Files (Hub repo):
  - `lib/collector/aitri-reader.js` — add GitHub fetch path: fetch `.aitri` raw from GitHub, compare `updatedAt` or git SHA to detect changes
  - `lib/collector/git-reader.js` — add `getLastCommitSHA` function for remote repos
  - `lib/commands/monitor.js` — pass `updatedAt` from previous poll cycle for comparison

  Behavior:
  - Local projects: unchanged (filesystem poll on `updatedAt`)
  - Remote projects (`type: "remote"`): on each poll cycle, fetch `.aitri` raw from `raw.githubusercontent.com/<owner>/<repo>/main/.aitri`, compare `updatedAt` with cached value; if changed, re-fetch relevant artifacts
  - If GitHub rate-limits: back off and show warning; do not crash

  Decisions:
  - Use GitHub raw content (no OAuth, no API token) — same as Graph's approach
  - Only public repos supported in this version
  - Poll interval for remote projects can be longer than 5s (configurable via `AITRI_HUB_REMOTE_REFRESH_MS`, default 60s)

  Acceptance: Hub's monitor shows updated status for a GitHub project within 2 poll cycles of an `aitri approve` pushed to the repo.

---

### Ecosystem — Aitri Graph

- [x] P3 — **Graph: project registry from config file** *(implemented — ~/.aitri-graph/projects.json, GET/POST/DELETE /api/registry)* — Graph currently requires the user to add projects via the UI each session. There is no persistence between browser sessions beyond `localStorage`.

  Problem: Teams have to re-add projects every time. Multi-project use is friction-heavy.

  Files (Graph repo):
  - `server.js` — add `GET /api/registry` endpoint that reads `~/.aitri-graph/projects.json` (Graph-owned config)
  - `server.js` — add `POST /api/registry` to add a project (path or GitHub URL)
  - `js/sidebar.js` — on startup, call `/api/registry` and pre-populate sidebar
  - `js/app.js` — persist project list to server registry instead of only `localStorage`

  Behavior:
  - Server reads `~/.aitri-graph/projects.json` on startup; creates it if absent
  - UI on load fetches registry and renders all registered projects in sidebar
  - User can add a project (path or GitHub URL) via UI; server persists to registry
  - No changes to loader.js — local/GitHub loading already works

  Decisions:
  - Graph owns `~/.aitri-graph/` — no dependency on Aitri Core or Hub registries
  - `localStorage` can remain as fallback/cache for browser-only use without server

  Acceptance: Add a project in Graph UI → refresh browser → project still listed in sidebar.

- [x] P3 — **Graph: change detection polling for local projects** *(implemented — /api/project/status, 30s poll via sidebar.js, GitHub 60s poll)* — Graph loads artifacts on user request. It does not detect when a project's pipeline advances.

  Problem: A dev runs `aitri approve 1` and Graph still shows the old state until manually refreshed.

  Files (Graph repo):
  - `server.js` — add `GET /api/project/status?path=...` returning `{ updatedAt, currentPhase }` (lightweight poll endpoint)
  - `js/app.js` — poll `/api/project/status` every 30s for the active project; if `updatedAt` changed, reload artifacts and re-render graph
  - `js/graph.js` — support incremental re-render (update node states without full re-layout)

  Behavior:
  - Polling only for local projects (source `"local"`); GitHub projects continue on-demand
  - Poll interval: 30s default, configurable
  - If poll fails (server down): no error shown, polling continues silently

  Decisions:
  - Compare `updatedAt` from `.aitri` — same mechanism as Hub uses for local projects
  - Full artifact reload on change (not incremental artifact fetch) — simpler, acceptable latency

  Acceptance: Run `aitri approve 1` in terminal while Graph is open → within 30s the requirements nodes update to `approved` state without manual refresh.

---

### Core — Backlog management

- [x] P3 — **`aitri backlog` command — project-level backlog management** *(implemented — shipped in a prior session, discovered during design review 2026-03-30)* — `lib/commands/backlog.js`, `spec/BACKLOG.json`, integrated in `status.js` and `bin/aitri.js`. 15 tests passing.

---

### Ecosystem — Future Subproducts

> These are design seeds. Not implementation items. Expand to full entries before scheduling.

- [ ] P3 — **Aitri CI** — GitHub Actions integration that reads `.aitri` and fails the CI pipeline if any approved phase has drift (artifact modified after approval). Zero-dependency script that runs in a GitHub Actions step.

  Seed:
  - Single-file Node.js script (`aitri-ci-check.js`) — reads `.aitri`, runs `hasDrift()` logic, exits 1 if drift detected
  - GitHub Action step: `- run: node aitri-ci-check.js`
  - Optional: post a comment on the PR listing which phases have drift
  - No Aitri CLI required in CI — the script bundles its own `.aitri` reader

- [ ] P3 — **Aitri IDE (VSCode Extension)** — Shows current pipeline phase and drift alerts in the VSCode statusbar for any open project that has `.aitri`. Read-only. No execution of Aitri commands.

  Seed:
  - Extension watches `.aitri` via `fs.watch` and updates statusbar item
  - Shows: `Aitri: Phase 3 | Drift: 0` or `Aitri: Phase 2 ⚠ drift`
  - Click opens `aitri status` output in a new terminal
  - Published to VS Code Marketplace as `aitri-vscode`

- [ ] P3 — **Aitri Report** — Generates a PDF or HTML compliance report from `05_PROOF_OF_COMPLIANCE.json` + `01_REQUIREMENTS.json`. Targeted at delivering audit evidence to clients or stakeholders.

  Seed:
  - CLI tool: `aitri-report generate --project <path> --output report.html`
  - Template-based HTML (no headless browser) — printable via browser's native PDF export
  - Sections: Executive Summary, FR Coverage Table, Test Results, Rejections Log, Approval Timeline
  - Reads only from `spec/` and `.aitri` — no modifications to project

- [ ] P3 — **Aitri Audit** — Cross-project event aggregator. Reads `events[]` from N registered projects and produces a unified timeline of approvals, rejections, and drift events. Useful for teams managing multiple product pipelines.

  Seed:
  - CLI tool: `aitri-audit timeline --projects <dir>`
  - Scans all directories under `<dir>` for `.aitri` files
  - Merges and sorts `events[]` arrays chronologically
  - Output: terminal table or JSON export
  - No state — purely reads and aggregates existing data

- [ ] P3 — **`IDEA.md` y `ADOPTION_SCAN.md` en raíz del proyecto del usuario** — Ambos archivos quedan en la raíz tras `adopt scan`, contaminando el directorio del usuario y exponiéndolos a borrado accidental.

  Problem: La raíz del proyecto del usuario no es el lugar correcto para archivos generados por Aitri. El usuario los puede borrar por error o confundirlos con sus propios archivos. Además, `spec/` ya existe como carpeta de artefactos — semánticamente `IDEA.md` pertenece ahí.

  Files:
  - `lib/commands/adopt.js` — cambiar paths de escritura de `path.join(dir, 'IDEA.md')` y `ADOPTION_SCAN.md` a `path.join(dir, 'spec', ...)`; crear `spec/` en `adoptScan` en lugar de solo en `adoptApply`
  - `lib/commands/run-phase.js` — línea 68: cambiar `adir = ''` por `adir = artifactsDir` para `IDEA.md`
  - `templates/adopt/scan.md` — actualizar paths de output (`{{PROJECT_DIR}}/spec/IDEA.md`, `{{PROJECT_DIR}}/spec/ADOPTION_SCAN.md`)
  - `test/smoke.js` — actualizar smoke tests que verifican presencia de `IDEA.md` en raíz

  Behavior:
  - `adopt scan` crea `spec/` si no existe, escribe `spec/IDEA.md` y `spec/ADOPTION_SCAN.md`
  - `run-phase 1/2/discovery` busca `IDEA.md` en `spec/` (vía `artifactsDir`)
  - `adopt apply` asume `spec/IDEA.md`

  Decisions:
  - **Defer to v0.2.0 como breaking change explícito** (decidido 2026-03-17): sin dual-path fallback — añadiría deuda permanente en run-phase.js. En v0.2.0: el usuario mueve IDEA.md manualmente o Aitri detecta el archivo en raíz y aborta con instrucción clara.
  - `ADOPTION_SCAN.md` también se mueve — mismo grupo semántico, bajo riesgo individual (solo written by agent, never read by code)

  Acceptance:
  - `adopt scan` en proyecto nuevo: `IDEA.md` y `ADOPTION_SCAN.md` aparecen en `spec/`, no en raíz
  - `run-phase 1` en proyecto con `spec/IDEA.md`: funciona sin advertencia
  - Proyecto legacy con `IDEA.md` en raíz: Aitri aborta con instrucción de migración explícita
  - Smoke tests pasan con 0 failures

---

### Core — Approve UX

- [x] P2 — **`aitri approve` y `validate`: instrucciones de drift muestran clave numérica en lugar de alias** *(fixed v0.1.69 — validate.js + status.js, 2026-03-30)* — Cuando `validate` detecta drift en una fase aprobada, la nota de acción muestra `aitri approve 3` / `aitri approve 4` en lugar de `aitri approve tests` / `aitri approve build`. El agente lee esa instrucción literal y la repite al usuario con el número, que no comunica nada semántico.

  Problem: El usuario (y el agente que actúa como intermediario) recibe una instrucción opaca. "approve 3" no dice qué aprueba ni por qué importa. Esto es especialmente problemático en escenarios de drift donde el usuario debe entender *qué artifact cambió* antes de re-aprobar.

  Files:
  - `lib/commands/validate.js` — línea 48: `aitri approve ${num}` → `aitri approve ${p.alias || num}` (fix puntual, 1 línea)
  - `lib/commands/status.js` — línea 93: `Phase ${e.phase}` en historial de re-approvals usa el número crudo; menor prioridad pero inconsistente
  - `lib/commands/approve.js` — revisar si el mensaje de error non-TTY (drift gate) también necesita contexto adicional: nombre del artifact + qué sección revisar

  Behavior:
  - `validate` drift note: `run: aitri approve tests` en lugar de `run: aitri approve 3`
  - `status` re-approval history: `Phase tests — re-approved on ...` en lugar de `Phase 3 — re-approved on ...`
  - `approve` non-TTY drift error: evaluar si agregar el nombre del artifact y un hint de qué revisar mejora el flujo o si es ruido

  Decisions a resolver antes de implementar:
  - El fix en `validate.js` es trivial y aislado. Pero el issue raíz es más amplio: ¿deben todos los outputs de Aitri que referencian fases usar alias canónicamente? Decidir si aplicar el fix puntual o hacer un sweep completo antes de implementar.
  - En `approve.js` non-TTY drift: el mensaje actual es correcto (ya usa `key = p.alias || phase`). Verificar antes de tocar.
  - `status.js` línea 93: `e.phase` puede ser número o string (opcional). `PHASE_DEFS[e.phase]?.alias || e.phase` resuelve ambos casos.

  Acceptance:
  - `aitri validate` con drift en fase 3: muestra `aitri approve tests`
  - `aitri validate` con drift en fase 4: muestra `aitri approve build`
  - `aitri status` con re-approval history: muestra alias, no número
  - `npm run test:all` pasa sin regresión

---

### Core — Bug Tracking

- [x] P1 — **`aitri bug` — formal bug lifecycle with FR traceability** *(implemented v0.1.66–v0.1.67)* — Post-deploy bugs go into the flat backlog with no traceability to the FR they break, no TC enforcement, and no impact on `validate` or `verify-complete`. Teams have no canonical way to track regressions without contaminating the pipeline artifact chain.

  Problem: When something breaks post-deploy, the only option today is `aitri backlog add` (untracked) or manually editing spec artifacts (triggers drift). There is no mechanism to require a test case before closing a bug, or to block deployment if open bugs affect must-have FRs.

  **Schema — `spec/BUGS.json`:**
  ```json
  {
    "bugs": [
      {
        "id": "BG-001",
        "title": "VPN peers summary resets on transient read error",
        "description": "...",
        "severity": "critical|high|medium|low",
        "status": "open|in_progress|fixed|verified|closed",
        "fr": "FR-014",
        "phase_detected": 4,
        "tc_reference": null,
        "created_at": "2026-03-18T10:00:00Z",
        "updated_at": "2026-03-18T10:00:00Z",
        "resolution": null
      }
    ]
  }
  ```
  Lifecycle: `open → in_progress → fixed → verified → closed` (+ `reopened` path from verified back to open).

  **Commands:**
  - `aitri bug add [--title "..."] [--fr FR-014] [--severity medium] [--phase 4]` — interactive if flags omitted; auto-assigns BG-NNN; writes to `spec/BUGS.json`; creates file if absent
  - `aitri bug list [--severity critical|high|medium|low] [--fr FR-XXX] [--status open]` — filters open by default
  - `aitri bug fix BG-001` — sets status `in_progress`; prints bug title + FR context from `01_REQUIREMENTS.json`
  - `aitri bug verify BG-001 --tc TC-021` — requires `--tc` flag; sets status `fixed`; records TC reference in `tc_reference`
  - `aitri bug close BG-001` — sets status `closed`; records timestamp

  **Pipeline integration:**
  - `aitri validate` — warns if any bug has status `fixed` and `tc_reference` is null ("bug fixed with no covering test")
  - `aitri verify-complete` — blocks if any bug has status `open` or `fixed` AND `fr` maps to a MUST FR in `01_REQUIREMENTS.json`
  - `aitri status` — shows open bug count next to phase status (e.g., `⚠ 2 open bugs`)

  Files:
  - `lib/commands/bug.js` — new command; handles all subcommands; owns BUGS.json read/write (not state.js)
  - `lib/commands/validate.js` — add bug check after core phase checks
  - `lib/commands/verify.js` — `cmdVerifyComplete`: load BUGS.json if exists; block on open/fixed MUST FR bugs
  - `lib/commands/status.js` — load BUGS.json if exists; append open count to output
  - `bin/aitri.js` — add `bug` dispatch case
  - `test/commands/bug.test.js` — new test file: add/list/fix/verify/close lifecycle; validate integration; verify-complete block

  Decisions:
  - `spec/BUGS.json` not `.aitri` — bugs are project artifacts, not pipeline state. Hub/Graph can read them from the integration contract path.
  - `bug.js` owns its own JSON I/O — does not go through `state.js` (state.js manages `.aitri` config only)
  - `--tc` is required for `bug verify` — no exception. Closing a bug without a TC is not allowed by the command. User must explicitly mark TC or use `bug close` directly (with a warning printed).
  - Severity is informational only — the pipeline gates on status + FR type, not severity
  - No persona for bug management — reuses the existing validation model; no new person needed

  Acceptance:
  - `aitri bug add --title "X" --fr FR-001 --severity high` creates `spec/BUGS.json` with BG-001 in status `open`
  - `aitri bug verify BG-001` without `--tc` exits with error
  - `aitri verify-complete` with an `open` bug linked to a MUST FR exits with error message listing the bug
  - `aitri validate` with a `fixed` bug and no `tc_reference` prints warning (not error — does not block)
  - `aitri status` shows `⚠ 1 open bug` when BUGS.json has open items
  - `npm run test:all` passes with no regressions

---

### Core — Cross-Document Consistency

- [x] P1 — **`aitri review` — cross-artifact semantic consistency check** *(implemented v0.1.66)* — Aitri validates each artifact's structure individually but not whether artifacts are consistent with each other. An FR missing from test cases is only discovered at `verify-complete`, potentially wasting multiple verify-run cycles. There is no way to proactively check the pipeline's semantic integrity before a gate blocks.

  Problem: FR-008 might be marked MUST in `01_REQUIREMENTS.json` but have zero TCs in `03_TEST_CASES.json`. Today this surfaces only at `verify-complete` with a cryptic block. `aitri review` surfaces it at any time and automatically before `complete 3`.

  **Command:**
  - `aitri review` — full cross-artifact analysis on all available artifacts
  - `aitri review --phase 3` — only checks relevant to Phase 3 gate (Requirements → Test Cases)
  - `aitri review --fr FR-008` — all checks scoped to a specific FR

  **Checks (errors block; warnings print but don't block):**

  Requirements → Test Cases (runs when both `01_REQUIREMENTS.json` and `03_TEST_CASES.json` exist):
  - Every MUST FR has ≥1 TC with `status != "skip"` → **error** if missing
  - Every SHOULD FR has ≥1 TC → **warning** if missing
  - TC has `fr_id` referencing an FR that doesn't exist in requirements → **error**
  - TC has `fr_id` null or missing → **warning**

  Test Cases → Test Results (runs when `04_TEST_RESULTS.json` exists):
  - TC in `03_TEST_CASES.json` has no entry in `04_TEST_RESULTS.json` → **warning**
  - Entry in `04_TEST_RESULTS.json` references TC ID not in `03_TEST_CASES.json` → **error**

  **Pipeline integration:**
  - `aitri complete 3` auto-runs `review --phase 3` before recording completion. Error-level findings block `complete`. Warnings print with prompt: "Warnings found — acknowledge to continue? (y/N)".
  - `aitri complete 5` auto-runs TC→Results check before recording completion.

  Files:
  - `lib/commands/review.js` — new command; all check logic here
  - `lib/commands/complete.js` — call review checks in phase 3 and 5 gates (import `runReview` from review.js)
  - `bin/aitri.js` — add `review` dispatch case
  - `test/commands/review.test.js` — new test file: each check scenario (missing TC for MUST, orphan TC ref, orphan result ref, FR filter)

  Decisions:
  - Text-free checks only — no parsing of `02_SYSTEM_DESIGN.md` prose (too many false positives). Only JSON-to-JSON cross-references.
  - Warnings do not block `complete` automatically — they require explicit acknowledgement (y/N prompt) to preserve human-in-the-loop for ambiguous cases
  - `--fr` filter is a convenience for debugging a specific FR; not required for MVP

  Acceptance:
  - `aitri review` on pipeline with a MUST FR missing from test cases: exits with error, lists the FR ID
  - `aitri complete 3` on same pipeline: blocked with same error
  - `aitri review` on clean pipeline: prints "✅ All cross-artifact checks passed"
  - `aitri review --phase 3` does not run TC→Results check (only when phase 3 checks are relevant)
  - `npm run test:all` passes with no regressions

---

### Core — Brownfield Validation

- [x] P2 — **`aitri adopt verify-spec` — validated spec-to-code alignment for brownfield projects** *(implemented v0.1.66)* — `aitri adopt apply` produces spec artifacts by declaration. There is no mechanism to verify that the generated requirements actually reflect the code's behavior. FRs can be aspirational rather than descriptive, and the gap is invisible until `verify-complete` blocks.

  Problem: On a brownfield adoption, `01_REQUIREMENTS.json` may contain AC items that the existing code does not actually satisfy. The only way to discover this today is to run Phase 4 and watch tests fail — after spending time on Phase 2, 3, and partial Phase 4.

  **Model:** Same as every other phase — Aitri generates a structured briefing; the agent writes the stubs in the project's actual test framework. Aitri does not generate code.

  **Flow:**
  ```
  aitri adopt scan
  aitri adopt apply
  aitri run-phase 1   (or adopt apply pre-populates phase 1)
  aitri complete 1
  aitri adopt verify-spec   ← new step, optional but recommended for brownfield
  aitri verify-run          ← existing command now evaluates stubs too
  aitri verify-complete     ← blocks on unverified stubs unless explicitly acknowledged
  ```

  **What `adopt verify-spec` does:**
  1. Reads `01_REQUIREMENTS.json` — collects all AC items across MUST FRs
  2. Reads `03_TEST_CASES.json` if it exists — excludes AC items already covered
  3. Generates a briefing (stdout, same model as `run-phase`) instructing the agent to:
     - Inspect the project's test framework (detect from package.json, go.mod, pyproject.toml)
     - For each uncovered AC item, write the **minimal stub** that fails clearly
     - Do NOT write full implementation tests — stubs only
     - Check existing tests first — if a test already covers the AC, mark it as `verified` instead of creating a stub
  4. After agent runs: agent calls `aitri adopt verify-spec --complete` which appends TC stubs to `03_TEST_CASES.json`:
     ```json
     {
       "id": "TC-021",
       "fr_id": "FR-001",
       "description": "Dashboard shows CPU temperature in Celsius with color indicator",
       "status": "unverified",
       "stub": true,
       "test_hint": "Check SSE payload includes temp field; check color class assignment"
     }
     ```

  **`verify-complete` behavior with stubs:**
  - Stubs with status `unverified` after verify-run: `verify-complete` lists them and requires acknowledgement ("These stubs did not pass. Mark as known gap to continue? (y/N)")
  - Marked as known gap: recorded in `04_TEST_RESULTS.json` with `"known_gap": true` and justification field required
  - `05_PROOF_OF_COMPLIANCE.json` includes known gaps in its coverage report

  Files:
  - `lib/commands/adopt.js` — add `verify-spec` and `verify-spec --complete` subcommands
  - `lib/phases/` — new `phaseAdoptVerify.js` for the briefing generation logic
  - `lib/commands/verify.js` — `cmdVerifyComplete`: handle `"stub": true` TCs; prompt for known-gap acknowledgement
  - `templates/phases/phaseAdoptVerify.md` — briefing template for the agent
  - `test/commands/adopt.test.js` — add verify-spec tests

  Decisions:
  - `verify-spec` is optional — not a required gate for non-brownfield projects
  - The briefing is language-agnostic; the agent detects the framework from the project files (same way Phase 4 works)
  - `"stub": true` TCs are excluded from the Phase 3 complete validation count (they are addenda, not part of the QA-authored test cases)
  - `verify-spec --complete` is agent-facing (same pattern as `run-phase` / `complete N`); human does not call it directly

  Acceptance:
  - `aitri adopt verify-spec` on a project with `01_REQUIREMENTS.json` and partial `03_TEST_CASES.json`: prints briefing listing uncovered AC items
  - Agent-called `--complete` adds stub TCs to `03_TEST_CASES.json` with correct schema
  - `aitri verify-complete` with unverified stubs: prompts for acknowledgement, does not silently pass
  - `npm run test:all` passes with no regressions

---

### Core — Phase 4 TDD Guidance

- [x] P3 — **TDD recommendation section in Phase 4 briefing** *(implemented v0.1.66)* — Phase 4 (Implementation) tells the agent what to build but not how to approach testing. The agent decides TDD vs Test-After independently with no traceability. A regression caused by a Test-After choice on a high-AC stateful feature has no record of the decision.

  Problem: On the Ultron-AP project, the CSRF and auth tests were written Test-After and had one regression on an edge case that would likely have been caught in TDD spec-writing. The decision to go Test-After was silent and untracked.

  **What to add to Phase 4 briefing:**
  A structured `## Testing Approach Recommendation` section generated from `01_REQUIREMENTS.json`:
  - TDD recommended if: FR has AC count > 4 AND at least one AC contains keywords indicating state, validation rules, or error conditions (`valid`, `invalid`, `must reject`, `must return`, `error`, `fail`, `unauthorized`, `token`, `session`, `rate limit`)
  - Test-After recommended if: FR type is `ux` or `visual`, or AC is primarily about rendering/display without state

  The section lists FR-by-FR recommendation with a one-line reason. It is a recommendation, not a gate — the agent can override it.

  Files:
  - `lib/phases/phase4.js` — add `buildTDDRecommendation(requirements)` function; inject into briefing context
  - `templates/phases/phase4.md` — add `{{#IF_TDD_RECOMMENDATION}}` block at end of briefing

  Decisions:
  - Keyword-based heuristic is intentionally simple — no NLP. False positives (TDD recommended when Test-After is fine) are acceptable; the agent overrides. False negatives are the risk to minimize.
  - Section is printed only if `01_REQUIREMENTS.json` is parseable and has ≥1 MUST FR
  - No new artifact produced — the recommendation is part of the briefing output only

  Acceptance:
  - `aitri run-phase 4` on a project with a stateful auth FR (>4 ACs, contains "unauthorized"): briefing includes TDD recommendation for that FR
  - `aitri run-phase 4` on a UI-only project: briefing shows Test-After recommendation
  - `aitri run-phase 4` without `01_REQUIREMENTS.json`: briefing renders without the section (no crash)
  - `npm run test:all` passes with no regressions

---

## Design Studies

> Not implementation items. Open questions that inform future architectural decisions.

### Calidad semántica de artifacts

Aitri valida la *estructura* de los artifacts (schema, campos requeridos, conteos mínimos) pero no su *calidad semántica*. Un agente puede producir `01_REQUIREMENTS.json` con 5 FRs técnicamente válidos pero conceptualmente triviales, genéricos, o desconectados del problema real descrito en IDEA.md.

**Pregunta abierta:** ¿Hasta dónde debe llegar Aitri en validar calidad semántica?

Ejemplos de lo que no se valida hoy:
- FR.title de "La app debe funcionar correctamente" pasa validación
- Acceptance criteria copiados entre FRs sin diferenciación
- System design que ignora los NFRs de Phase 1
- Test cases que no ejercen los acceptance criteria (Three Amigos gate cubre ac_id cross-reference, pero no la relevancia del test)

Opciones:
1. Heurísticas de calidad en `validate()` (longitud mínima de títulos, diversidad de ACs, detección de duplicados)
2. Phase de revisión cruzada entre artifacts
3. Dejar la calidad 100% al humano — gates solo verifican estructura

**Criterio de decisión:** No introducir complejidad que genere falsos positivos. Un validator que rechaza artifacts buenos es peor que uno que acepta artifacts mediocres.

---

## Discarded

Items analyzed and explicitly rejected.

| Item | Decision | Reason |
| :--- | :--- | :--- |
| Mutation testing | Discarded indefinitely | Violates zero-dep principle. `verify-run --assertion-density` covers 60% of the same problem at zero cost. Option B (globally-installed stryker) introduces implicit env dependency — worse than explicit dep. ROI does not justify. |
