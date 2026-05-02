# Aitri — `.aitri` Schema Contract

**Aitri version:** v2.0.0-alpha.19+
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
| `artifactsDir` | `string` | `""` | Subdirectory for artifacts. `"spec"` for new projects; `""` for adopted or pre-v0.1.20 |

---

## Optional fields (present based on pipeline activity)

| Field | Type | Default when absent | Description |
|---|---|---|---|
| `artifactHashes` | `object<string, string>` | `{}` | `{ "1": "<sha256>", ... }` — SHA-256 of each artifact file. Written on `approve` and `complete` (v0.1.63+). Backfilled from on-disk artifacts by `adopt --upgrade` for projects whose approvedPhases is non-empty but the field is absent or empty (v2.0.0-alpha.13+) |
| `driftPhases` | `array<string>` | absent in old projects | Phases in drift state. Set by `run-phase` when re-running an approved phase; cleared by `complete`/`approve` |
| `events` | `array<Event>` | `[]` | Pipeline activity log (max 20, most recent last) |
| `verifyPassed` | `boolean` | `false` | `true` if `aitri verify-complete` passed. Required to unlock Phase 5. Reset to `false` by `aitri verify-run` when latest results would not pass `verify-complete` — i.e. `passed === 0` with skips, OR any failures (v2.0.0-alpha.13+). Healthy results (passed > 0, failed === 0) leave the flag alone |
| `verifySummary` | `object` | `null` | Last test run summary: `{ passed, failed, skipped, total }`. Set by `verify-complete` on success; cleared by `verify-run` when `verifyPassed` resets (v2.0.0-alpha.13+) |
| `verifyRanAt` | `string` ISO 8601 | `null` | Timestamp of last `aitri verify-run` execution (set on every run, regardless of pass/fail). Drives test-staleness signals (v0.1.79+) |
| `auditLastAt` | `string` ISO 8601 | `null` | Timestamp of last `aitri audit` invocation. Persisted because `AUDIT_REPORT.md` mtime resets on git clone (v0.1.79+) |
| `rejections` | `object<string, Rejection>` | `{}` | Map of phase key → last rejection. Key is phase as string (`"1"`, `"2"`, etc.) |
| `lastSession` | `object\|null` | `null` | Session checkpoint — see schema below. Written automatically by state-mutating commands |
| `normalizeState` | `object\|null` | `null` | Off-pipeline change baseline. Set on `approve 4`, by `aitri normalize`, and by `aitri normalize --resolve`. Schema: `{ status: "pending" \| "resolved", baseRef: "<git-sha>" \| "<ISO>", method: "git" \| "mtime", lastRun: "ISO" }` (v0.1.80+; `--resolve` flag added v0.1.84) |
| `upgradeFindings` | `array<object>` | `[]` | Unresolved flagged findings from the last `aitri adopt --upgrade`. Snapshot model — overwritten on every run; cleared when diagnose returns empty. Each entry: `{ target, transform, reason, module, category, recordedAt }`. (v2.0.0-alpha.3+) |

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

Valid `event` values: `"started"`, `"completed"`, `"approved"`, `"rejected"`, `"upgrade_migration"` (v2.0.0+)

Optional fields by type:
- `"rejected"` → includes `"feedback": "text"`
- `"approved"` → includes `"afterDrift": true` when approved after detected drift (v0.1.60+)
- `"upgrade_migration"` → see schema below (v2.0.0+)
- `"rehash"` → includes `artifact`, `before_hash`, `after_hash` (v2.0.0-alpha.3+). Emitted by `aitri rehash <phase>` when an operator updates the stored hash for a phase whose artifact content has not changed from its committed state. No content drift — bookkeeping only.

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
| `target` | `string` | yes | Artifact filename (`"03_TEST_CASES.json"`) or config field anchor (`".aitri#normalizeState"`) |
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
  "4":         "04_IMPLEMENTATION_MANIFEST.json",
  "4r":        "04_CODE_REVIEW.md",
  "5":         "05_PROOF_OF_COMPLIANCE.json"
}
```

Full path: `path.join(projectDir, artifactsDir, artifactFilename)`
When `artifactsDir` is `""` (empty string), artifact is at `projectDir` root.

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

`aitri feature init <name>` creates sub-pipelines at `<project>/features/<name>/`.
Each feature has its own `.aitri` with the same schema as the parent project.
`artifactsDir` is always `"spec"` for features.

```js
const featuresDir = path.join(projectDir, 'features');
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

**Default recommendation: commit it.** The schema is designed around the assumption that `.aitri` travels with the repository. Teams that gitignore it accept the trade-offs below. This is a deliberate project-level choice, not a bug in either direction — but the consequences must be understood.

### What breaks if `.aitri` is gitignored

| Consequence | Why |
|---|---|
| Hub and other subproducts cannot detect changes | Pull-based change detection reads `updatedAt` from the tracked file — if it is not in git, remote consumers see stale state on every clone. |
| Drift detection is per-machine | `artifactHashes` is the baseline against which `hasDrift()` compares current artifact content. A new clone starts with an empty baseline and cannot tell "approved then changed" from "just approved". |
| Approval state is per-machine | `approvedPhases` / `completedPhases` / `rejections` live only on the machine that ran the commands. Teammates see the project as un-approved until they re-run the pipeline locally. |
| `normalizeState.baseRef` references untracked state | The field stores a git SHA, but the field itself is not in git. If two operators run `normalize` on different branches, their baselines diverge silently. |

### What the schema *does* mix

`.aitri` currently serializes both **shared** state (the contract above) and **per-machine** state in the same file. Fields whose values are per-machine by nature:

- `lastSession.when` — local timestamp of the last pipeline event on this machine
- `lastSession.agent` — detected from local env
- `normalizeState.lastRun` — local event timestamp
- `normalizeState.baseRef` — meaningful only against the local git workdir

When `.aitri` is committed, these fields create commit noise on every operation that writes them (`verify-run`, `complete`, `approve`, `checkpoint`, etc.). That noise is the trigger teams cite when they decide to gitignore the file.

**There is no current mechanism to split these fields.** A future major version may introduce `.aitri/local.json` (gitignored per-machine state) alongside `.aitri/config.json` (tracked shared state); this is tracked as an open question in [ADR-028](../Aitri_Design_Notes/DECISIONS.md#adr-028--2026-04-24--open-question-aitri-mixes-shared-and-per-machine-state) and will only be acted on with second-project evidence.

### Guidance for subproducts

Hub and other consumers MUST NOT assume `.aitri` is committed. If the file is absent or its `updatedAt` is older than the project's last git commit, treat that as "state is per-machine for this project" rather than an error. A missing `.aitri` on a fresh clone of a gitignored-.aitri project is a valid state, not a corruption signal.
