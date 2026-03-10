# Aitri — GitHub & npm Publishing Guide

> Operational reference for publishing releases. Run `npm test` before any publish.

---

## Prerequisites

```bash
# Verify tests pass
npm test              # 34/34 required

# Verify local install works
npm i -g .
aitri --version       # must match package.json version
```

---

## Version bump

Follow the policy in `docs/Aitri_Design_Notes/ARCHITECTURE.md` — Development Pipeline section.

```bash
# Patch: bug fixes, warnings, docs — no behavior change
npm version patch --no-git-tag-version

# Minor: new commands, new validation rules — backward compatible
npm version minor --no-git-tag-version

# Major: breaking schema changes, removed commands
npm version major --no-git-tag-version
```

After bumping:
1. Update `bin/aitri.js` — `const VERSION = 'x.x.x'`
2. Update `CHANGELOG.md` — move "Next release" items to new version entry
3. Run `npm test` again
4. Run `npm i -g .` and smoke test

---

## Publish to npm

```bash
# Login (first time or session expired)
npm login

# Dry run — review what gets published
npm publish --dry-run

# Publish
npm publish --access public
```

**Files published** (controlled by `package.json > files`):
```
bin/
lib/
templates/
README.md
LICENSE
```

`docs/`, `test/`, `.claude/` are NOT published.

---

## Push to GitHub

```bash
# Stage and commit
git add bin/ lib/ templates/ test/ docs/ package.json README.md CHANGELOG.md
git commit -m "release: vX.X.X — <summary>"

# Tag the release
git tag vX.X.X
git push origin main --tags
```

---

## GitHub repo

Repo: `github.com/cesareyeserrano/aitri`

Current published versions: `0.4.0` (deprecated), `1.0.0` (deprecated), `2.0.0` (latest)

To deprecate an old version:
```bash
npm deprecate aitri@0.4.0 "Superseded by v2.0.0 — install: npm i -g aitri"
npm deprecate aitri@1.0.0 "Superseded by v2.0.0 — install: npm i -g aitri"
```
