import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PHASE_DEFS } from '../lib/phases/index.js';
import { extractRequirements } from '../lib/phases/context.js';

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

  // UPLAN-0703 C1: field-level forwards through extractRequirements. This suite existed to
  // catch silent input drops and missed the LARGEST field — fr.description (the behavioral
  // prose of the PRD) never reached phases 2/3/4, and project_summary (North Star KPI /
  // guardrails) had zero consumers.
  it('extractRequirements forwards fr.description — the PRD prose reaches downstream phases (C1)', () => {
    const prd = JSON.stringify({
      functional_requirements: [{
        id: 'FR-001', title: 'Login', priority: 'MUST', type: 'logic',
        description: 'The user authenticates with email+password; lockout after 5 failures.',
        acceptance_criteria: ['AC1'],
      }],
    });
    const out = JSON.parse(extractRequirements(prd));
    assert.equal(out.functional_requirements[0].description,
      'The user authenticates with email+password; lockout after 5 failures.',
      'dropping fr.description leaves architecture/tests/build designing from the title alone');
  });

  // COMPOSITION-LEVEL (adversarial-pass fix): the first cut forwarded project_summary via an
  // extractRequirements option — a no-op in the real flow, because run-phase applies the
  // PRODUCER's transform first, so phase 2's re-extract ran on an already-stripped string.
  // This test composes the two passes exactly as production does: producer transform →
  // phase2.buildBriefing (which reads the RAW artifact from disk for project_summary).
  it('project_summary reaches the Phase 2 BRIEFING through the real producer-transform flow (C1)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-c1-ps-'));
    try {
      const prd = JSON.stringify({
        project_name: 'demo',
        project_summary: { north_star: 'weekly active savers', jtbd: 'track budget' },
        functional_requirements: [{ id: 'FR-001', title: 't', priority: 'MUST' }],
      });
      fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), prd);
      // What run-phase actually hands phase 2: the producer's extract (strips project_summary).
      const transported = PHASE_DEFS[1].extractContext(prd);
      assert.ok(!transported.includes('north_star'), 'precondition: the transported input IS stripped');
      const briefing = PHASE_DEFS[2].buildBriefing({
        dir, inputs: { '01_REQUIREMENTS.json': transported },
        feedback: '', artifactsBase: 'spec', bestPractices: '',
        config: { artifactsDir: 'spec' }, scopeVerb: '', scopeArg: '', contextAssets: '',
      });
      assert.match(briefing, /north_star/,
        'phase 2 must receive project_summary from the raw artifact on disk — KPI/guardrails inform architecture trade-offs');
      assert.match(briefing, /Product intent/, 'the dedicated briefing section must render');
      // And the other phases do NOT carry it: their input is the stripped transport form.
      for (const key of [3, 4]) {
        const other = PHASE_DEFS[key].buildBriefing({
          dir, inputs: { '01_REQUIREMENTS.json': transported, '02_SYSTEM_DESIGN.md': '# D', '03_TEST_CASES.json': '{"test_cases":[]}' },
          feedback: '', artifactsBase: 'spec', bestPractices: '', config: { artifactsDir: 'spec' },
          scopeVerb: '', scopeArg: '', contextAssets: '',
        });
        assert.ok(!other.includes('north_star'), `phase ${key} must NOT carry project_summary — targeted forward, not prompt bloat`);
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// Instruction-level connectivity (whole-flow audit 2026-06-30). A declared+interpolated input is not
// enough — the rc.137 defect was a design that reached the briefing but was never INSTRUCTED to be used
// ("present-but-not-instructed"). The connectivity audit found two more of the same class: phase 2 got
// the UX spec as a passive "read-only context" dump, and phase 3 got the system design under a bare
// header, neither with a directive to consume it. These locks assert the briefing carries a real
// consumption directive, and that the optional one is stripped on a project that lacks the input.
describe('pipeline connectivity — declared inputs must be INSTRUCTED, not just interpolated (AUDIT-0630-C)', () => {
  it('phase 2 (architecture) is instructed to build the architecture to support the UX spec when present', () => {
    const b = PHASE_DEFS[2].buildBriefing({
      dir: '/tmp/test',
      inputs: { '01_REQUIREMENTS.json': '{}', '01_UX_SPEC.md': '# UX Spec\n\nScreens, flows, component inventory.' },
      feedback: null,
    });
    assert.match(b, /architecture MUST support/i,
      'phase 2 briefing must direct the architect to support the UX spec (Data Model / API Design / System Architecture) — ' +
      'not dump it as read-only context (the rc.137 silent-input class).');
  });

  it('phase 2 strips the UX directive (and leaks no raw tokens) on a project with no UX spec', () => {
    const b = PHASE_DEFS[2].buildBriefing({
      dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}' }, feedback: null,
    });
    assert.ok(!/architecture MUST support/i.test(b), 'no UX directive when 01_UX_SPEC.md is absent (backend-only project)');
    assert.ok(!/\{\{#?\/?IF_UX_SPEC\}\}|\{\{UX_SPEC\}\}/.test(b), 'no raw template tokens leak');
  });

  it('phase 3 (tests) is instructed to design the tests against the system design contract', () => {
    const b = PHASE_DEFS[3].buildBriefing({
      dir: '/tmp/test',
      inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '# Design\n\n## API Design\nPOST /x' },
      feedback: null,
    });
    assert.match(b, /design your tests against this contract/i,
      'phase 3 briefing must direct the QA agent to design integration/e2e tests against the API/Data Model in the ' +
      'system design — not receive it as a silent dump under a bare header.');
  });
});

// The inverse of a silent input: a template that ORDERS the agent to emit a field NO consumer reads
// (connectivity audit 2026-06-30, AUDIT-0630-D). type_coverage_matrix / implementation_level /
// product_analysis were mandated in the JSON output but had zero readers and were not even in the
// ARTIFACTS.md schema — dead authoring. These locks keep the emission orders from being re-added.
describe('pipeline connectivity — no template orders emitting a field no consumer reads (AUDIT-0630-D)', () => {
  const TEMPLATES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'phases');
  const tmpl = (name) => fs.readFileSync(path.join(TEMPLATES, name), 'utf8');

  it('tests.md does not order emitting type_coverage_matrix as a JSON field (0 readers, not in schema)', () => {
    assert.ok(!/type_coverage_matrix/.test(tmpl('tests.md')),
      'nothing consumes type_coverage_matrix — keep the coverage matrix as a planning aid, do not order it emitted as a JSON field.');
  });

  it('requirements.md does not order emitting implementation_level or a product_analysis field (0 readers)', () => {
    const src = tmpl('requirements.md');
    assert.ok(!/implementation_level/.test(src), 'implementation_level has no reader and is not in the schema — do not instruct emitting it.');
    assert.ok(!/product_analysis/.test(src), 'no consumer reads a product_analysis field — fold that analysis into project_summary instead.');
  });
});
