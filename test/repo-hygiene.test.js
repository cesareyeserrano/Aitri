/**
 * Tests: repo hygiene — no orphan modules or templates (REPO-HYGIENE-0722)
 *
 * Pin against the failure mode found 2026-07-22: five untracked files from the
 * WITHDRAWN ADR-061 sprint layer (lib/commands/sprint.js, lib/personas/po.js,
 * lib/phases/phaseSprintPlan.js, templates/phases/phaseSprintPlan.md,
 * test/commands/sprint.test.js) sat in the working tree for weeks — wired into
 * nothing, yet their test file was globbed by `npm run test:all` and turned the
 * repo's only hard gate red with failures unrelated to any real change.
 *
 * The rule these tests enforce: every module under lib/ must be reachable from
 * bin/aitri.js through the static import graph, and every phase briefing under
 * templates/phases/ must be referenced by some lib source. A module or template
 * nothing reaches is dead weight — either wire it (with its ADR) or delete it.
 * (Sibling of REPO-HYGIENE-0712, which pinned stray `aitri init` scaffolding.)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB  = path.join(ROOT, 'lib');

/** All .js files under a directory, recursive, as absolute paths. */
function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** Static relative-import specifiers of one ES module (this repo uses no dynamic import()). */
function relativeImports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const specs = [];
  const re = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"](\.[^'"]+)['"]/g;
  for (let m; (m = re.exec(src)); ) specs.push(m[1]);
  return specs;
}

/** Files reachable from the entry points via static relative imports. */
function reachableFrom(entries) {
  const seen = new Set();
  const queue = entries.map(e => path.resolve(e));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of relativeImports(file)) {
      const resolved = path.resolve(path.dirname(file), spec);
      if (fs.existsSync(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

describe('repo hygiene — orphan detection (REPO-HYGIENE-0722)', () => {
  it('every module under lib/ is reachable from an entry point', () => {
    // Two deliberate entry points: the CLI dispatcher, and lib/index.js — the
    // programmatic API surface (imported by consumers' scripts/CI, never by bin).
    const reachable = reachableFrom([
      path.join(ROOT, 'bin', 'aitri.js'),
      path.join(LIB, 'index.js'),
    ]);
    const orphans = walkJs(LIB).filter(f => !reachable.has(f));
    assert.deepEqual(
      orphans.map(f => path.relative(ROOT, f)), [],
      'lib/ modules nothing imports (transitively, from bin/aitri.js or lib/index.js). ' +
      'Wire them into the dispatcher/phase registry — or delete them: ' +
      'an unreachable module is dead code the record does not know about.'
    );
  });

  it('every briefing in templates/phases/ is referenced by a lib source', () => {
    // Templates load by name: render('phases/<name>') in lib/prompts/render.js.
    const libSources = walkJs(LIB).map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const orphans = fs.readdirSync(path.join(ROOT, 'templates', 'phases'))
      .filter(f => f.endsWith('.md'))
      .filter(f => !libSources.includes(`phases/${f.replace(/\.md$/, '')}`));
    assert.deepEqual(
      orphans, [],
      'templates/phases/ briefings no lib source renders. ' +
      'Reference them from a phase module — or delete them.'
    );
  });
});
