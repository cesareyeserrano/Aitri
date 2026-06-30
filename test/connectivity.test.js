import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PHASE_DEFS } from '../lib/phases/index.js';

// Whole-pipeline connectivity guard (AUDIT-0630). The rc.137/rc.138 defects were all the SAME class:
// an artifact a phase needs is produced but never reaches it — invisible to change-scoped adversarial
// review (the bug is in no diff) and to every internal test (the briefing renders fine without it). It
// took a real pilot + a manual forensic trace to find. This test pins the producer→consumer graph so a
// NEW disconnection (an orphan artifact, a dangling input, or a removed design-flow edge) FAILS CI
// instead of shipping. Connectivity is checked across BOTH consumption mechanisms — a declared phase
// input AND a direct readArtifact()/readJson() in lib/ — which is the split that hid the original bug
// (00_DISCOVERY is "consumed" only via a direct read in phase1, not via inputs).

const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib');

function libSource() {
  const chunks = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) chunks.push(fs.readFileSync(p, 'utf8'));
    }
  })(LIB);
  return chunks.join('\n');
}

// Distinct phase objects (each appears under several keys: number + alias + optional name).
const phases         = [...new Set(Object.values(PHASE_DEFS))];
const producers      = new Set(phases.map(p => p.artifact).filter(Boolean));
const declaredInputs = new Set(phases.flatMap(p => [...(p.inputs || []), ...(p.optionalInputs || [])]));

// Inputs produced OUTSIDE the phase chain — legitimately have no phase producer.
const SEED_ARTIFACTS   = new Set(['IDEA.md']);               // init / wizard / operator writes the seed
const COMMAND_PRODUCED = new Set(['04_TEST_RESULTS.json']);  // produced by `aitri verify-run`, not a phase

const src = libSource();
const esc = (s) => s.replace(/[.]/g, '\\$&');
// An artifact is read by lib code if its filename appears as a literal in a read*() call.
const isReadInLib = (name) =>
  new RegExp(`(readArtifact|readArtifactFile|readJson)\\s*\\([^)]*['"]${esc(name)}['"]`).test(src);
const isConsumed  = (name) => declaredInputs.has(name) || isReadInLib(name);

describe('pipeline connectivity — producer→consumer graph (AUDIT-0630 guard)', () => {
  it('no orphan: every phase artifact is consumed by a phase input OR a read*() in lib/', () => {
    for (const art of producers) {
      assert.ok(isConsumed(art),
        `${art} is produced by a phase but consumed by NO phase input and NO readArtifact/readJson in ` +
        `lib/ — a disconnected artifact (the AUDIT-0630 bug class: produced, never delivered). ` +
        `Wire a consumer (declare it as a downstream phase input, or read it where it is needed).`);
    }
  });

  it('no dangling input: every declared phase input is produced by a phase, a command, or is a seed', () => {
    for (const inp of declaredInputs) {
      assert.ok(producers.has(inp) || COMMAND_PRODUCED.has(inp) || SEED_ARTIFACTS.has(inp),
        `${inp} is declared as a phase input but nothing produces it — a dangling input (a typo, or its ` +
        `upstream producer was removed). Add the producer, or add it to SEED_ARTIFACTS/COMMAND_PRODUCED ` +
        `here if it is intentionally produced outside the phase chain.`);
    }
  });
});

describe('pipeline connectivity — design-flow regression locks (the AUDIT-0630 fixes)', () => {
  const consumes = (key, art) => {
    const p = PHASE_DEFS[key];
    return [...(p.inputs || []), ...(p.optionalInputs || [])].includes(art);
  };

  // The Ledger pilot: a UI passed every gate but matched no mockup because the design (01_UX_SPEC)
  // never reached the build phase. It must reach EVERY phase that acts on the design.
  it('the UX/design spec reaches every phase that acts on it: architecture, tests, build, review', () => {
    for (const ph of [2, 3, 4, 'review']) {
      assert.ok(consumes(ph, '01_UX_SPEC.md'),
        `Phase "${ph}" must consume 01_UX_SPEC.md — removing it re-opens the Ledger failure ` +
        `(a UI built ignoring the approved design). See rc.137 / rc.138-A / ADR-063.`);
    }
  });

  it('code review receives the system design to flag deviations from the architecture (rc.138-A)', () => {
    assert.ok(consumes('review', '02_SYSTEM_DESIGN.md'),
      'code review must consume 02_SYSTEM_DESIGN.md — without it, review cannot flag a build that ' +
      'deviates from the approved architecture.');
  });

  it('the build phase consumes the requirements, design, and test cases it implements', () => {
    for (const art of ['01_REQUIREMENTS.json', '02_SYSTEM_DESIGN.md', '03_TEST_CASES.json']) {
      assert.ok(consumes(4, art), `the build phase must consume ${art}`);
    }
  });
});
