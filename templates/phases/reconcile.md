# Reconcile — Code Outside Pipeline

{{ROLE}}

## Constraints
{{CONSTRAINTS}}

## How to reason
{{REASONING}}

---

## Context

**Project:** {{PROJECT_NAME}}
**Changes detected since:** {{BASE_LABEL}}
**Files changed outside the pipeline:** {{FILE_COUNT}}

```
{{FILE_LIST}}
```

> **This command detects and classifies — it does not close the cycle.**
> Running `aitri reconcile` again will only re-display this briefing; it never
> advances the baseline. After classifying every file below, close the cycle by:
> - `aitri reconcile --resolve` — for refactor / already-registered changes (advances the baseline), **or**
> - routing any `fr-change` / `new-feature` through the pipeline (re-approving build advances the baseline automatically).
> Until you do one of those, `status`/`resume` will keep reporting these changes.

---

## Current spec artifacts

### 01_REQUIREMENTS.json
```json
{{REQUIREMENTS}}
```

### 03_TEST_CASES.json
```json
{{TEST_CASES}}
```

### 04_IMPLEMENTATION_MANIFEST.json
```json
{{MANIFEST}}
```

---

## Your task

For each file listed above, read the actual code changes and classify the change using the spec artifacts above as reference.

### Step 1 — Classify each file

For each file, determine:

1. **What changed** — one sentence describing the behavior change (not the code change)
2. **Maps to existing FR?** — FR-XXX / none / partial
3. **Covered by existing TC?** — TC-XXX / none / partial
4. **Classification** — exactly one of:
   - `new-feature` — introduces behavior not covered by any existing FR
   - `fr-change` — modifies or extends behavior that an existing FR describes
   - `bug-fix` — restores behavior that an existing FR required but was broken
   - `refactor` — no observable behavior change (internal restructure, rename, extract)
   - `undetermined` — cannot classify without more context; state what is missing

### Step 2 — Output classification table

| File | What changed | FR | TC | Classification | Action |
|------|--------------|----|-----|---------------|--------|

### Step 3 — Propose Aitri commands

For every non-`refactor` entry, propose the exact command:

- `new-feature` → `aitri feature init <descriptive-name>`
- `fr-change` → `aitri run-phase requirements --feedback "<what changed and why>"`
  *(re-approving requirements will cascade and invalidate architecture, tests, and build)*
- `bug-fix` → `aitri bug add --title "<title>" --severity <critical|high|medium|low> --fr <FR-XXX>`
- `undetermined` → describe exactly what information is needed to classify

List commands in dependency order (bug fixes first, then fr-changes, then new features).

### Step 4 — Flag blockers

If any file cannot be classified, explain why and what the user must clarify before you can proceed.

Do not make assumptions about intent — ask.

### Step 5 — Close the cycle

After executing the proposed commands in Step 3, the warning in `aitri status` clears automatically in two cases:

- **Pipeline re-run path:** for any `fr-change` or `new-feature`, re-approving Phase 4 at the end of the re-run advances the baseline. No extra action needed — this happens automatically as part of `aitri approve build`.
- **Maintenance path:** if every entry is `refactor` or `bug-fix` that has been registered *and* verified in `BUGS.json`, the pipeline did not need spec changes. Run:

  ```
  # 1. Commit every fix first. --resolve stamps the baseline at HEAD and
  #    refuses to run while behavioral files are uncommitted.
  git add -A && git commit -m "fix: ..."
  # 2. Prove the committed code still passes.
  aitri verify-run && aitri verify-complete
  # 3. Advance the baseline.
  aitri reconcile --resolve
  ```

  `reconcile --resolve` performs mechanical gates (tests passing, no open critical/high bugs, **clean working tree of behavioral files**) plus a human TTY confirmation, then advances the baseline to current HEAD without cascading Phase 5.

  If `verify-run` forces a code edit (e.g. a linter reorders imports), commit that edit **before** `--resolve` too — the baseline is the committed HEAD, so an uncommitted edit re-triggers `reconcile` the moment you commit it, costing a second cycle.

Do NOT use `--resolve` if any entry is `fr-change`, `new-feature`, or `undetermined`. Route those through the pipeline first.
