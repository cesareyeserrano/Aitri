/**
 * Module: lib/tc-collisions
 * Purpose: Single source of truth for TC-id uniqueness ACROSS the pipelines of one project
 * (the root + every feature under features/).
 *
 * verify-run credits a plan TC by its id alone: it parses TC ids out of the runner output
 * and looks each plan id up in that map (lib/commands/verify.js). A pipeline's runner is
 * free to execute more than that pipeline's own tests — a whole-repo test script shared by
 * every feature is common — so its output also carries the OTHER pipelines' ids. When two
 * pipelines plan the same id, one pipeline's test result is credited to the other's TC: a
 * pass while that TC's own test is missing or renamed (a false pass), or a failure it never
 * owned. Phase 3 only checked duplicates inside one file. Ids compare case-insensitively
 * because verify-run's fallback links ids that differ only in case.
 *
 * Reads are tolerant: an unreadable sibling (conflicted `.aitri`, malformed plan) is skipped —
 * its own gates refuse it loudly, and this check must never crash another scope.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, readArtifact, featuresDir } from './state.js';

/**
 * Identity of a directory: device + inode, immune to how the path is spelled. `feature <name>`
 * builds its dir from the name as TYPED, so on a case-insensitive filesystem `features/CICLOS`
 * reaches `features/ciclos` — and a path comparison (even through `fs.realpathSync`, which keeps
 * the typed case) made the feature collide with its own plan. Also covers symlinks and
 * `/var` vs `/private/var`. Falls back to the on-disk real path where no inode is reported.
 */
function dirIdentity(p) {
  try { const s = fs.statSync(p); if (s.ino) return `ino:${s.dev}:${s.ino}`; } catch { /* fall through */ }
  try { return `path:${fs.realpathSync.native(p)}`; } catch { return `path:${path.resolve(p)}`; }
}

/** Every pipeline of the project that owns `dir`, root first: [{ label, dir }]. */
export function projectPipelines(dir, featureRoot) {
  const rootDir = featureRoot || dir;
  const out = [{ label: 'root', dir: rootDir }];
  let rootConfig;
  try { rootConfig = loadConfig(rootDir); } catch { return out; }
  let entries;
  try { entries = fs.readdirSync(featuresDir(rootDir, rootConfig), { withFileTypes: true }); } catch { return out; }
  for (const e of entries.filter(x => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const featureDir = path.join(featuresDir(rootDir, rootConfig), e.name);
    if (!fs.existsSync(path.join(featureDir, '.aitri'))) continue;   // orphan dir — not a pipeline
    out.push({ label: `feature ${e.name}`, dir: featureDir });
  }
  return out;
}

function planIds(pipelineDir) {
  try {
    const cfg = loadConfig(pipelineDir);
    const raw = readArtifact(pipelineDir, '03_TEST_CASES.json', cfg.artifactsDir || '');
    if (!raw) return [];
    const d = JSON.parse(String(raw).replace(/^﻿/, ''));
    return (Array.isArray(d.test_cases) ? d.test_cases : [])
      .map(tc => tc && tc.id)
      .filter(id => typeof id === 'string');
  } catch {
    return [];
  }
}

/**
 * The ids in `ids` that another pipeline of the same project also plans.
 * @returns {Array<{ id: string, others: Array<{ label: string, id: string }> }>}
 */
export function crossPipelineTCCollisions({ dir, featureRoot, ids }) {
  const own = new Map();
  for (const id of ids || []) if (typeof id === 'string') own.set(id.toLowerCase(), id);
  if (!own.size) return [];
  const self = dirIdentity(dir);
  const hits = new Map();
  for (const p of projectPipelines(dir, featureRoot)) {
    if (dirIdentity(p.dir) === self) continue;
    for (const otherId of new Set(planIds(p.dir))) {
      const key = otherId.toLowerCase();
      if (!own.has(key)) continue;
      if (!hits.has(key)) hits.set(key, { id: own.get(key), others: [] });
      hits.get(key).others.push({ label: p.label, id: otherId });
    }
  }
  return [...hits.values()];
}

/** One line per collision: `TC-001h — also in root, feature f2 (as TC-001H)`. */
export function describeCollision(c) {
  return `${c.id} — also in ${c.others.map(o => (o.id === c.id ? o.label : `${o.label} (as ${o.id})`)).join(', ')}`;
}

/** A namespace for a feature's ids: `ciclos` → `TC-CICLOS-`, `multi-anio` → `TC-MULTI-ANIO-`; null when underivable. */
export function suggestTCNamespace(featureName) {
  const ns = String(featureName || '').toUpperCase()
    .replace(/[^A-Z-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return ns ? `TC-${ns}-` : null;
}
