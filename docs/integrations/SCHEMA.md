# Aitri — `.aitri` Schema Contract

**Aitri version:** v2.0.0-rc.138+
**Maintenance rule:** Update this file in the same commit as any `.aitri` schema change.

---

## File location

`.aitri` can be either a flat JSON file or a directory (`.aitri/config.json`). Subproducts must handle both:

```js
const p = path.join(projectDir, '.aitri');
const configPath = fs.statSync(p).isDirectory()
  ? path.join(p, 'config.json')
  : p;
```

---

## Guaranteed fields (all Aitri projects)

Present after any `aitri init` or `aitri adopt --upgrade`.

| Field | Type | Default when absent | Description |
|---|---|---|---|
| `currentPhase` | `number` | `0` | Active phase (0 = not started) |
| `approvedPhases` | `array<number\|string>` | `[]` | Human-approved phases. May include `"discovery"`, `"ux"` |
| `completedPhases` | `array<number\|string>` | `[]` | Agent-completed phases (pending human approval) |
| `updatedAt` | `string` ISO 8601 | `null` | Timestamp of last `saveConfig` call |

---

## Fields added by `aitri init`

| Field | Type | Default when absent | Description |
|---|---|---|---|
| `projectName` | `string` | `path.basename(dir)` | Project name |
| `createdAt` | `string` ISO 8601 | `null` | Timestamp of `aitri init` |
| `aitriVersion` | `string` | `null` | CLI version used to initialize or upgrade |
| `artifactsDir` | `string` | `""` | Subdirectory for artifacts, POSIX separators. `"aitri/product/spec"` for projects created or adopted by rc.76+/rc.78+ (contained layout) and for flat projects migrated via `adopt --upgrade --layout`; `"spec"` for rc.75-and-earlier projects; `""` for pre-rc.78 adoptions and pre-v0.1.20. Always build paths from this field — never hardcode a value |
| `layoutRoot` | `string` | `""` (flat) | **Additive, rc.76+ (LAYOUT-1/ADR-049).** Container folder for everything Aitri-owned. `"aitri"` for contained projects: the root unit lives in `<layoutRoot>/product/` (IDEA.md, idea_context/, spec/, and `archive/` for absorbed seeds — rc.80), `BACKLOG.md` at `<layoutRoot>/`, features in `<layoutRoot>/features/`. `""`/absent = legacy flat layout. The structure under `layoutRoot` is convention, not config. `.aitri` itself always stays at the project root |

---

## Optional fields (present based on pipeline activity)

| Field | Type | Default when absent | Description |
|---|---|---|---|
| `artifactHashes` | `object<string, string>` | `{}` | `{ "1": "<sha256>", ... }` — SHA-256 of each artifact file. Written on `approve` and `complete` (v0.1.63+). Backfilled from on-disk artifacts by `adopt --upgrade` for projects whose approvedPhases is non-empty but the field is absent or empty (v2.0.0-alpha.13+) |
| `driftPhases` | `array<string>` | absent in old projects | Phases in drift state. Set by `run-phase` when re-running an approved phase; cleared by `complete`/`approve` |
| `cascadedPhases` | `array<string>` | absent until first cascade | Phases reset by a cascade invalidation (a real upstream re-approval/re-complete). Used by the next-action builder to recommend `run-phase` (re-derive with new context) rather than `complete` (re-validate) for these phases. Set by `cascadeInvalidate`; cleared per-phase by `complete`/`approve` (v2.0.0-rc.56+) |
| `frSnapshots` | `object<string, array<string>>` | absent until first downstream approval | Per-phase snapshot of the `functional_requirements[].id` set the phase was approved against (key = phase as string). Written on `approve` of a downstream phase (not phase 1/discovery). When a cascade later resets that phase, `run-phase` diffs the current FR ids against this snapshot to show the agent which FRs were added/removed since — so the re-derivation is directed, not blind. Advisory only (the `fr_coverage` deploy gate is the hard enforcement). (v2.0.0-rc.64+) |
| `events` | `array<Event>` | `[]` | Pipeline activity log (max 20, most recent last) |
| `verifyPassed` | `boolean` | `false` | `true` if `aitri verify-complete` passed. Required to unlock Phase 5. Reset to `false` by `aitri verify-run` when latest results would not pass `verify-complete` — i.e. `passed === 0` with skips, OR any failures (v2.0.0-alpha.13+). Healthy results (passed > 0, failed === 0) leave the flag alone |
| `verifySummary` | `object` | `null` | Last test run summary — the `04_TEST_RESULTS.json#summary` object persisted verbatim (canonical shape in [ARTIFACTS.md](./ARTIFACTS.md): `total`, `passed`, `failed`, `skipped`, `skipped_e2e`, `skipped_no_marker`, `manual`, `manual_verified`). Written by `verify-complete` on success **and** by `tc verify` (which re-syncs it so `aitri resume` shows updated numbers after a per-TC verification); cleared by `verify-run` when `verifyPassed` resets (v2.0.0-alpha.13+). **Presence is NOT proof that `verify-complete` passed** — `verifyPassed` is the authoritative deploy-gate flag; consumers must read `verifyPassed`, not the presence of `verifySummary` |
| `verifyRanAt` | `string` ISO 8601 | `null` | Timestamp of last `aitri verify-run` execution (set on every run, regardless of pass/fail). Drives test-staleness signals (v0.1.79+) |
| `lastVerifyRun` | `object\|null` | `null` | Last `verify-run`'s counts, written on EVERY run regardless of pass/fail: `{ passed, failed, skipped, manual, at }`. Unlike `verifySummary` (only on verify-complete success), this persists the raw run result so the no-op-loop guard survives event-log eviction. Read this for "what did the last run produce" (v2.0.0-rc.25+) |
| `verifyResultsHash` | `string\|null` | `null` | SHA-256 of the `04_TEST_RESULTS.json` content written by the last `verify-run` (re-stamped by `tc verify`). `verify-complete` rejects a results file whose current hash differs — binding the deploy gate to a real execution so a hand-edited results file cannot pass (v2.0.0-rc.132+). Absent (pre-rc.129, or an externally-produced results file) = not enforced, backward-compatible |
| `auditLastAt` | `string` ISO 8601 | `null` | Timestamp of last `aitri audit` invocation. Persisted because `AUDIT_REPORT.md` mtime resets on git clone (v0.1.79+) |
| `coverageAuditLastAt` | `string` ISO 8601 | `null` | Timestamp of last `aitri audit requirements` invocation (formerly `audit coverage`; the field name is retained for back-compat). The idea→FR completeness audit. Persisted so the `resume` coverage nudge stops once run and re-fires when requirements change (v2.0.0-rc.75+, [ADR-048](../DECISIONS.md)) |
| `securityAuditLastAt` | `string` ISO 8601 | `null` | Timestamp of last `aitri audit security` invocation (the adversarial security audit). Subproducts can compose a security-gap signal from this field: security NFRs declared in `01_REQUIREMENTS.json` + this field absent/stale ⇒ surface "security audit suggested" to the operator (v2.0.0-rc.83+, [ADR-051](../DECISIONS.md)) |
| `rejections` | `object<string, Rejection>` | `{}` | Map of phase key → last rejection. Key is phase as string (`"1"`, `"2"`, etc.) |
| `lastSession` | `object\|null` | `null` | Session checkpoint — see schema below. Written automatically by state-mutating commands. Its `.context` is ephemeral (overwritten by the next action); the durable narrative lives in `sessionContext` |
| `sessionContext` | `object\|null` | `null` | Durable narrative thread (the "what/why/next"). Set by `aitri checkpoint --context`; SURVIVES later state transitions (unlike `lastSession.context`). Schema: `{ text: string, at: "ISO" }`. Per-machine — the personal thread; cross-dev action traceability is in shared `events[]`. `aitri resume` shows it and flags staleness/absence (v2.0.0-rc.60+) |
| `reconcileState` | `object\|null` | `null` | Off-pipeline change baseline. Set on `approve 4`, by `aitri reconcile`, and by `aitri reconcile --resolve`. Schema: `{ status: "pending" \| "resolved", baseRef: "<git-sha>" \| "<ISO>", method: "git" \| "mtime", lastRun: "ISO" }` (v0.1.80+; `--resolve` flag added v0.1.84) |
| `upgradeFindings` | `array<object>` | `[]` | Unresolved flagged findings from the last `aitri adopt --upgrade`. Snapshot model — overwritten on every run; cleared when diagnose returns empty. Each entry: `{ target, transform, reason, module, category, recordedAt }`. (v2.0.0-alpha.3+) |
| `strictAssertions` | `boolean` | `false` (absent) | Opt-in. When `true`, `aitri verify-complete` BLOCKS if `04_TEST_RESULTS.json#low_confidence_tcs` is non-empty (any TC with ≤1 assertion). Default behavior unchanged — assertion density is a warning only. Typically set on larger projects that want stricter test-quality enforcement (v2.0.0-rc.9+) |
| `humanApprovalGate` | `boolean` | `false` (absent) | Opt-in. When `true`, `aitri approve <phase>` in non-interactive (agent) mode BLOCKS and requires a human to run it after review. Default unchanged — agent-mode approval proceeds (the summary + Human Review checklist always print regardless). Typically set on larger projects that want a human at every gate; small projects / MVPs run autonomously by default (v2.0.0-rc.12+) |
| `reviewGate` | `boolean` | `false` (absent) | Opt-in. When `true`, a `FAIL` verdict in `04_CODE_REVIEW.md` BLOCKS `aitri verify-complete` (Phase 5). Default unchanged — the code-review verdict stays advisory (ADR-034 P1). Honor-system: the verdict is agent-written, so this makes a written `FAIL` binding; it does not judge review quality. Review remains optional — an absent `04_CODE_REVIEW.md` never blocks. `CONDITIONAL_PASS`/`PASS` do not block (v2.0.0-rc.23+) |

---

## lastSession schema (v0.1.70+)

Written automatically by `complete`, `approve`, `verify-run`, `verify-complete`, `feature init`, and `checkpoint`.

```json
{
  "at": "2026-03-30T21:00:00.000Z",
  "agent": "claude",
  "event": "complete requirements",
  "context": "implementing FR-003, JWT validation done, pending error handling",
  "files_touched": ["src/auth.js", "src/middleware.js"]
}
```

| Field | Type | Always present | Description |
|---|---|---|---|
| `at` | `string` ISO 8601 | yes | Timestamp of the checkpoint |
| `agent` | `string` | yes | Auto-detected agent: `"claude"`, `"codex"`, `"gemini"`, `"opencode"`, `"cursor"`, `"unknown"` |
| `event` | `string` | yes | What triggered the checkpoint (e.g. `"complete requirements"`, `"approve tests"`, `"checkpoint"`) |
| `context` | `string` | no | Agent/user-provided session context via `--context` flag |
| `files_touched` | `array<string>` | no | Files with uncommitted changes (from `git diff --name-only`) |

---

## Event schema

```json
{
  "at": "2025-11-01T14:23:00.000Z",
  "event": "approved",
  "phase": 1,
  "afterDrift": true
}
```

Valid `event` values: `"started"`, `"completed"`, `"approved"`, `"rejected"`, `"upgrade_migration"` (v2.0.0+), `"rehash"` (v2.0.0-alpha.3+), `"approve_preflight_autofix"` (v2.0.0-alpha.27+), `"layout_migrated"` (v2.0.0-rc.78+ — emitted once by `adopt --upgrade --layout`), `"verify-run"`, `"verify-complete"` (both carry `phase: "verify"`), `"verify-spec-complete"` (carries `phase: "adopt"`), `"reconcile-resolved"` (carries `phase: null`)

**`phase` field:** usually the numeric phase key, but it may also be a phase ALIAS string (e.g. `"discovery"`, `"ux"`, `"review"`, `"verify"`, `"adopt"`, `"upgrade"`) or **`null`** for a global/non-phase event (e.g. `reconcile-resolved`). The string set is not exhaustive — readers must accept number | string | null.

Optional fields by type:
- `"rejected"` → includes `"feedback": "text"`
- `"approved"` → includes `"afterDrift": true` when approved after detected drift (v0.1.60+), or `"ideaArchived": true` when approving Phase 1 archived the project's IDEA.md seed
- `"upgrade_migration"` → see schema below (v2.0.0+)
- `"rehash"` → includes `artifact`, `before_hash`, `after_hash` (v2.0.0-alpha.3+). Emitted by `aitri rehash <phase>` when an operator updates the stored hash for a phase whose artifact content has not changed from its committed state. No content drift — bookkeeping only.
- `"verify-run"` / `"verify-complete"` → include `{ passed, failed }` counts (v2.0.0+)

**Reader guidance:** unknown event types MUST be tolerated. New types are added without warning; a reader that filters the event log should use an allow-list of types it understands, not a deny-list.

### upgrade_migration event (v2.0.0+)

Emitted once per migration applied by `aitri adopt --upgrade`. The event log is the audit trail for the reconciliation protocol — Hub can surface it to show what an upgrade did to a project.

```json
{
  "at": "2026-04-24T01:56:55.385Z",
  "event": "upgrade_migration",
  "phase": "upgrade",
  "from_version": "0.1.65",
  "to_version": "2.0.0-alpha.1",
  "category": "blocking",
  "target": "03_TEST_CASES.json",
  "transform": "rename test_cases[*].requirement → requirement_id (16 TCs)",
  "before_hash": "a19d25a7...",
  "after_hash":  "02efaf94..."
}
```

| Field | Type | Always present | Description |
|---|---|---|---|
| `at` | `string` ISO 8601 | yes | Timestamp of the migration |
| `event` | `string` | yes | Literal `"upgrade_migration"` |
| `phase` | `string` | yes | Literal `"upgrade"` (disambiguates from phase-bound events) |
| `from_version` | `string` | yes | Source-version anchor of the migration module (e.g. `"0.1.65"`) |
| `to_version` | `string` | yes | Aitri CLI version at the time of migration |
| `category` | `string` | yes | One of: `"blocking"`, `"stateMissing"`, `"validatorGap"`, `"capabilityNew"`, `"structure"` |
| `target` | `string` | yes | Artifact filename (`"03_TEST_CASES.json"`) or config field anchor (`".aitri#reconcileState"`) |
| `transform` | `string` | yes | Human-readable summary of what changed |
| `before_hash` | `string` SHA-256 | no | Content hash before write (artifact migrations only; absent for state backfills) |
| `after_hash` | `string` SHA-256 | no | Content hash after write (paired with `before_hash`) |

---

## Rejection schema

```json
{
  "at": "2025-11-01T14:23:00.000Z",
  "feedback": "Rejection feedback text"
}
```

`rejections` contains only the most recent rejection per phase.

---

## Artifact map (phase key → filename)

```json
{
  "discovery": "00_DISCOVERY.md",
  "ux":        "01_UX_SPEC.md",
  "1":         "01_REQUIREMENTS.json",
  "2":         "02_SYSTEM_DESIGN.md",
  "3":         "03_TEST_CASES.json",
  "4":         "04_BUILD_REPORT.json",
  "4r":        "04_CODE_REVIEW.md",
  "5":         "05_TRACEABILITY.json"
}
```

Full path: `path.join(projectDir, artifactsDir, artifactFilename)`
When `artifactsDir` is `""` (empty string), artifact is at `projectDir` root.
This formula already covers the contained layout (rc.76+): `artifactsDir` is
`"aitri/product/spec"` there, so readers that build paths from the field keep
working with zero layout knowledge. Readers that hardcoded `"spec"` break —
always read the field, and default a MISSING field to `""` (not `"spec"`).

---

## Drift detection

Drift = an approved artifact was modified after approval.

```js
function hasDrift(projectDir, config, phaseKey) {
  // Fast path: driftPhases[] written by run-phase (v0.1.58+)
  if (Array.isArray(config.driftPhases) &&
      config.driftPhases.map(String).includes(String(phaseKey))) {
    return true;
  }
  // Dynamic hash check: catches direct file edits outside run-phase
  const stored = (config.artifactHashes || {})[String(phaseKey)];
  if (!stored) return false; // No hash = approved before v0.1.51 = not drift
  const artifactFile = ARTIFACT_MAP[phaseKey];
  const base = config.artifactsDir || '';
  const full = base
    ? path.join(projectDir, base, artifactFile)
    : path.join(projectDir, artifactFile);
  try {
    const content = fs.readFileSync(full, 'utf8');
    return sha256(content) !== stored;
  } catch { return false; }
}
```

**v0.1.63+ note:** `complete` also updates `artifactHashes`. Hash check returns `false` (no drift) after a successful `complete` — artifact is in accepted state. Real drift only exists if the artifact was modified after the last `complete` or `approve`.

`driftPhases[]` contains strings (`["1", "ux"]`). Always compare with `String(phaseKey)`.

---

## Feature sub-pipelines

`aitri feature init <name>` creates sub-pipelines at
`<project>/<layoutRoot>/features/<name>/` — i.e. `<project>/aitri/features/<name>/`
for contained projects (rc.76+), `<project>/features/<name>/` for legacy flat ones.
Each feature has its own `.aitri` with the same schema as the parent project.
`artifactsDir` is always `"spec"` for features (feature-relative — the feature
interior stays flat in both layouts; a feature config never carries `layoutRoot`).

```js
const parentState = readStateFile(projectDir);
const featuresDir = path.join(projectDir, parentState.layoutRoot || '', 'features');
if (fs.existsSync(featuresDir)) {
  for (const entry of fs.readdirSync(featuresDir)) {
    const featureDir = path.join(featuresDir, entry);
    const featureState = readStateFile(featureDir); // same reader as parent
  }
}
```

---

## Version detection

Compare the version the project was initialized with against the installed CLI:

```js
import { execFileSync } from 'node:child_process';
function getInstalledAitriVersion() {
  try {
    return execFileSync('aitri', ['--version'], { encoding: 'utf8' })
      .match(/v?(\d+\.\d+\.\d+)/)?.[1] ?? null;
  } catch { return null; }
}
const projectVersion   = aitriState.aitriVersion;
const installedVersion = getInstalledAitriVersion();
const versionMismatch  = projectVersion && installedVersion && projectVersion !== installedVersion;
// If mismatch: emit VERSION_MISMATCH alert — project should run `aitri adopt --upgrade`
```

---

## Backward compatibility

Always be defensive — an old project may be missing any field. Use the defaults from the tables above. `loadConfig` in Aitri applies `{ ...DEFAULTS, ...raw }` internally.

Projects that run `aitri adopt --upgrade` will have missing fields written to disk automatically.

---

## Should `.aitri` be committed?

**Yes — commit `.aitri`; its per-machine sibling `.aitri.local` is gitignored.** As of v2.0.0-rc.51 ([ADR-045](../DECISIONS.md)) the state is **split**: `.aitri` carries only **shared** state and is meant to travel with the repo; per-machine state lives in `.aitri.local`, which `aitri init` / `aitri adopt --upgrade` add to `.gitignore`. Committing `.aitri` is what makes the pipeline state and the drift baseline available to teammates and to Hub.

### The split (ADR-045)

| File | Content | Git |
|---|---|---|
| `.aitri` | **Shared** — everything except the three per-machine fields below: `projectName`, `aitriVersion`, `createdAt`, `updatedAt`, `artifactsDir`, `layoutRoot`, `currentPhase`, `approvedPhases`, `completedPhases`, `driftPhases`, `cascadedPhases`, `frSnapshots`, `rejections`, `artifactHashes`, `events[]`, `verifyPassed`/`verifySummary`/`verifyRanAt`/`lastVerifyRun`/`verifyResultsHash`, `auditLastAt`, `coverageAuditLastAt`, `securityAuditLastAt`, `upgradeFindings`, and the opt-in flags (`strictAssertions`, `humanApprovalGate`, `reviewGate`). The split is a per-machine DENY-list — any new field is shared by default | **committed** |
| `.aitri.local` | **Per-machine** — `lastSession` (`.at`, `.agent`, …), `sessionContext` (`.text`, `.at`) and `reconcileState` (`baseRef`, `method`, `status`, `lastRun`) | **gitignored** |

`saveConfig` writes `.aitri` only when a shared field other than `updatedAt` changed, so committing it no longer creates per-command noise — the noise that previously pushed teams to gitignore the whole file now lives in `.aitri.local`. `loadConfig` merges both files; every reader still sees one config object. (An old single-file `.aitri` with per-machine fields inline auto-migrates on its first save; `adopt --upgrade` also fixes the project's `.gitignore`. A pre-existing `.aitri/` *folder* uses `.aitri/config.json` + `.aitri/local.json` instead — supported as a fallback.)

### Why committing `.aitri` matters (what the split preserves)

| Guarantee | How |
|---|---|
| Cross-machine drift detection | `artifactHashes` (the `hasDrift()` baseline) is in the committed `.aitri`, so a teammate's clone CAN tell "approved then changed" from "just approved". Before the split, gitignoring `.aitri` to escape the noise silently disabled this — Aitri's core promise failed in teams. |
| Shared approval state | `approvedPhases` / `completedPhases` / `rejections` travel with the repo — teammates see the real pipeline state. |
| Hub change detection | `updatedAt` is in the committed `.aitri`. |

`reconcileState.baseRef` is intentionally per-machine (`.aitri.local`): a fresh clone re-establishes its own code-drift baseline (auto-stamped at HEAD on the first `reconcile` when Phase 4 is approved); artifact-drift detection needs no per-machine baseline — it works from the committed `artifactHashes`.

### Guidance for subproducts

Read `.aitri` (shared) exactly as before — the path and the shared fields are unchanged. **Never read `.aitri.local`** — it is per-machine and gitignored, and its fields (`lastSession`, `sessionContext`, `reconcileState`) are not in `.aitri`. A project may still legitimately gitignore the whole `.aitri` (the owner's choice); if `.aitri` is absent or its `updatedAt` is older than the project's last git commit, treat that as "state is per-machine for this project," not a corruption signal.
