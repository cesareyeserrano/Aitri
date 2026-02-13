# GitHub Release Checklist: v1.0.0-rc1

## Goal
Publish `v1.0.0-rc1` with reproducible validation evidence and clear rollback path.

## Preconditions
- [ ] Branch `v2-adoption` is up to date on GitHub
- [ ] CI workflow passes on latest commit
- [ ] `npm run test:smoke` passes locally
- [ ] `docs/release/V1_CLOSEOUT_RC1.md` reviewed
- [ ] `docs/release/RELEASE_NOTES_v1.0.0-rc1.md` reviewed

## 1) Final verification commands
Run from repo root:

```bash
npm run test:smoke
node cli/index.js status --json
cd examples/validate-coverage
node ../../cli/index.js validate --feature validate-coverage --non-interactive --json
```

## 2) Create and push the RC tag
From the release branch commit you want to publish:

```bash
git tag -a v1.0.0-rc1 -m "Aitri v1.0.0-rc1"
git push origin v1.0.0-rc1
```

## 3) Create GitHub Release
On GitHub:
1. Open Releases -> Draft a new release
2. Select tag: `v1.0.0-rc1`
3. Title: `Aitri v1.0.0-rc1`
4. Body: copy from `docs/release/RELEASE_NOTES_v1.0.0-rc1.md`
5. Mark as pre-release: **Yes**
6. Publish release

## 4) Post-release checks
- [ ] Tag resolves to expected commit
- [ ] Release body includes known open item
- [ ] Team/agents are notified of non-interactive contract and exit codes

## 5) Rollback / correction plan
If release metadata/tag is incorrect:

```bash
# Delete remote tag
git push origin :refs/tags/v1.0.0-rc1
# Delete local tag
git tag -d v1.0.0-rc1
```

Then recreate the corrected tag and release.

## Notes
- Keep `v1.0.0-rc1` immutable once announced publicly.
- If fixes are needed, publish a new RC tag (example: `v1.0.0-rc2`).
