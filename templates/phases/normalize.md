# Normalize — Code Outside Pipeline

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
