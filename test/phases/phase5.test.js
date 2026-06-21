import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PHASE_DEFS } from '../../lib/phases/index.js';

const validP5 = () => JSON.stringify({
  project: 'Test Project',
  version: '1.0.0',
  generated_at: new Date().toISOString(),
  phases_completed: 5,
  requirement_compliance: [
    { id: 'FR-001', title: 'Login',     level: 'production_ready',     notes: 'All tests pass' },
    { id: 'FR-002', title: 'Dashboard', level: 'complete',             notes: 'Minor debt' },
    { id: 'FR-003', title: 'Export',    level: 'partial',              notes: 'CSV only' },
    { id: 'FR-004', title: 'Save',      level: 'functionally_present', notes: 'No persistence test' },
  ],
  technical_debt_inherited: [],
  overall_status: 'partial',
  approved_by: 'Aitri v2',
});

describe('Phase 5 — validate()', () => {

  it('passes with valid artifact', () => {
    assert.doesNotThrow(() => PHASE_DEFS[5].validate(validP5()));
  });

  it('throws when project is missing', () => {
    const d = JSON.parse(validP5());
    delete d.project;
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /TRACEABILITY \(05_TRACEABILITY.json\) missing fields.*project/);
  });

  it('throws when overall_status is missing', () => {
    const d = JSON.parse(validP5());
    delete d.overall_status;
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /TRACEABILITY \(05_TRACEABILITY.json\) missing fields.*overall_status/);
  });

  it('throws when requirement_compliance is empty', () => {
    const d = JSON.parse(validP5());
    d.requirement_compliance = [];
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /requirement_compliance must list per-FR status/);
  });

  it('throws when a compliance level is invalid', () => {
    const d = JSON.parse(validP5());
    d.requirement_compliance[0].level = 'done';
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), (err) => {
      // message must mention invalid levels AND identify the offending entry
      return /Invalid compliance level/i.test(err.message) && err.message.includes('FR-001') && err.message.includes('"done"');
    });
  });

  it('throws when multiple compliance levels are invalid', () => {
    const d = JSON.parse(validP5());
    d.requirement_compliance[0].level = 'done';
    d.requirement_compliance[1].level = 'complete_done';
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /Invalid compliance level/);
  });

  it('accepts all 4 non-blocking compliance levels', () => {
    const levels = ['functionally_present', 'partial', 'complete', 'production_ready'];
    for (const level of levels) {
      const d = JSON.parse(validP5());
      d.requirement_compliance = [{ id: 'FR-001', title: 'Test', level, notes: '' }];
      assert.doesNotThrow(() => PHASE_DEFS[5].validate(JSON.stringify(d)), `Level "${level}" should be valid`);
    }
  });

  it('throws when any FR has compliance level "placeholder"', () => {
    const d = JSON.parse(validP5());
    d.requirement_compliance[2].level = 'placeholder';
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /Pipeline blocked.*FR-003.*placeholder/);
  });

  it('throws listing all placeholder FRs when multiple are placeholder', () => {
    const d = JSON.parse(validP5());
    d.requirement_compliance[1].level = 'placeholder';
    d.requirement_compliance[2].level = 'placeholder';
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /FR-002.*FR-003/);
  });

  it('passes when placeholder level is not present', () => {
    const d = JSON.parse(validP5());
    assert.doesNotThrow(() => PHASE_DEFS[5].validate(JSON.stringify(d)));
  });

  it('[cross-artifact] throws when FR-MUST not in requirement_compliance', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p5-'));
    try {
      const reqs = { functional_requirements: [
        { id: 'FR-001', priority: 'MUST' },
        { id: 'FR-002', priority: 'MUST' },
        { id: 'FR-005', priority: 'MUST' }, // missing from validP5 compliance
      ]};
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      assert.throws(
        () => PHASE_DEFS[5].validate(validP5(), { dir, config: {} }),
        /MUST requirement.*not found in requirement_compliance/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // NFRs are first-class; a MUST NFR omitted from requirement_compliance must
  // also block (audit Tier-2 — the check only scanned functional_requirements).
  it('[cross-artifact] throws when a MUST NFR is missing from requirement_compliance', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p5-nfr-'));
    try {
      const reqs = {
        functional_requirements: [{ id: 'FR-001', priority: 'MUST' }, { id: 'FR-002', priority: 'MUST' }],
        non_functional_requirements: [{ id: 'NFR-001', priority: 'MUST', category: 'Security' }],
      };
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      assert.throws(
        () => PHASE_DEFS[5].validate(validP5(), { dir, config: {} }),
        /MUST requirement.*NFR-001/s
      );
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // REG-GATE-0621: a regression NFR (category:"Regression") counts as MUST even with
  // no priority, so it must carry a compliance entry — consistent with the Phase-3
  // forced-TC gate. Without this it could be forced to have a TC yet vanish from
  // traceability.
  it('[cross-artifact] throws when a category:Regression NFR (no priority) is missing from requirement_compliance', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p5-reg-'));
    try {
      const reqs = {
        functional_requirements: [{ id: 'FR-001', priority: 'MUST' }, { id: 'FR-002', priority: 'MUST' }],
        non_functional_requirements: [{ id: 'NFR-001', category: 'Regression', requirement: 'login keeps working' }],
      };
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      assert.throws(
        () => PHASE_DEFS[5].validate(validP5(), { dir, config: {} }),
        /MUST requirement.*NFR-001/s
      );
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('[cross-artifact] passes when all FR-MUSTs have compliance entries', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p5-'));
    try {
      const reqs = { functional_requirements: [
        { id: 'FR-001', priority: 'MUST' },
        { id: 'FR-002', priority: 'MUST' },
      ]};
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      assert.doesNotThrow(() => PHASE_DEFS[5].validate(validP5(), { dir, config: {} }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[cross-artifact] SHOULD FRs not in compliance do not trigger the gap check', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-p5-'));
    try {
      const reqs = { functional_requirements: [
        { id: 'FR-001', priority: 'MUST'   },
        { id: 'FR-002', priority: 'MUST'   },
        { id: 'FR-099', priority: 'SHOULD' }, // SHOULD — gap check ignores
      ]};
      fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(reqs), 'utf8');
      assert.doesNotThrow(() => PHASE_DEFS[5].validate(validP5(), { dir, config: {} }));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('[cross-artifact] skips check when dir not provided (backward compat)', () => {
    assert.doesNotThrow(() => PHASE_DEFS[5].validate(validP5()));
  });

  it('rejects compliance level "Placeholder" (capital P) as invalid — not silently passed as valid', () => {
    const d = JSON.parse(validP5());
    d.requirement_compliance[0].level = 'Placeholder';
    // "Placeholder" is not in validLevels (case-sensitive) → caught as invalid level
    assert.throws(() => PHASE_DEFS[5].validate(JSON.stringify(d)), /Invalid compliance level/);
  });
});

describe('Phase 5 — buildBriefing()', () => {
  const briefing = PHASE_DEFS[5].buildBriefing({
    dir: '/tmp/test',
    inputs: {
      '01_REQUIREMENTS.json': '{}',
      '02_SYSTEM_DESIGN.md': '',
      '04_BUILD_REPORT.json': '{}',
      '04_TEST_RESULTS.json': '{}',
    },
    feedback: null,
  });

  it('briefing contains Human Review checklist', () => {
    assert.ok(briefing.includes('Human Review'), 'briefing must include Human Review section');
  });

  it('Human Review checklist covers compliance levels and placeholder', () => {
    const reviewIdx = briefing.indexOf('Human Review');
    const reviewSection = briefing.slice(reviewIdx);
    assert.ok(reviewSection.includes('placeholder') && reviewSection.includes('compliance'),
      'Human Review must cover placeholder and compliance level checks');
  });

  it('[v0.1.28] briefing renders artifact path using artifactsBase when provided', () => {
    const b = PHASE_DEFS[5].buildBriefing({
      dir: '/tmp/test',
      inputs: { '01_REQUIREMENTS.json': '{}', '02_SYSTEM_DESIGN.md': '', '04_BUILD_REPORT.json': '{}', '04_TEST_RESULTS.json': '{}' },
      feedback: null,
      artifactsBase: '/tmp/test/spec',
    });
    assert.ok(b.includes('/tmp/test/spec/05_TRACEABILITY.json'), 'artifact path must use artifactsBase/spec');
    assert.ok(!b.includes('/tmp/test/05_TRACEABILITY.json'), 'artifact path must NOT use bare dir');
  });

  // A1 (rc.10) — Docker is conditional on the declared deployment model, not mandated
  it('deployment packaging is conditional, not an unconditional Dockerfile mandate', () => {
    // Dockerfile/docker-compose only appear under the conditional packaging block
    assert.ok(briefing.includes('deployment model') || briefing.includes('Deployment packaging'),
      'briefing must frame packaging by declared deployment model');
    assert.ok(/do NOT default to Docker/i.test(briefing),
      'briefing must explicitly tell the agent not to default to Docker');
    assert.ok(briefing.includes('Binary') && briefing.includes('Serverless'),
      'briefing must offer non-container packaging options');
    // The old unconditional "Files to create: Dockerfile" line must be gone
    assert.ok(!/^- \{\{DIR\}\}\/Dockerfile/m.test(briefing) && !/^- .*\/Dockerfile —/m.test(briefing),
      'Dockerfile must not be an unconditional top-level file-to-create');
  });

  // A2 (rc.10) — DevOps persona Docker constraints are conditional
  it('DevOps constraints gate Docker rules on containerized deployment', () => {
    assert.ok(/never invent a Dockerfile/i.test(briefing),
      'persona must forbid inventing a Dockerfile for non-containerized projects');
    assert.ok(/When the deployment is containerized/i.test(briefing),
      'container security constraints must be conditional on containerized deployment');
  });
});

describe('Phase 5 — validate() D1 claim-vs-evidence gate (rc.13)', () => {
  function seed(dir, frCoverage) {
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'spec/01_REQUIREMENTS.json'), JSON.stringify({
      functional_requirements: [
        { id: 'FR-001', priority: 'MUST', title: 'Login' },
        { id: 'FR-002', priority: 'MUST', title: 'Dash' },
      ],
    }));
    fs.writeFileSync(path.join(dir, 'spec/04_TEST_RESULTS.json'), JSON.stringify({
      executed_at: new Date().toISOString(), results: [], summary: {},
      fr_coverage: frCoverage,
    }));
  }
  // proof: FR-001 production_ready, FR-002 complete (both HIGH)
  const proof = () => JSON.stringify({
    project: 'P', version: '1.0.0', phases_completed: 5, overall_status: 'compliant',
    requirement_compliance: [
      { id: 'FR-001', title: 'Login', level: 'production_ready' },
      { id: 'FR-002', title: 'Dash',  level: 'complete' },
    ],
  });

  it('blocks production_ready when fr_coverage status is partial (over-claim)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-d1-'));
    try {
      seed(dir, [
        { fr_id: 'FR-001', status: 'partial' },
        { fr_id: 'FR-002', status: 'covered' },
      ]);
      assert.throws(() => PHASE_DEFS[5].validate(proof(), { dir, config: { artifactsDir: 'spec' } }),
        /claim a level above their test evidence[\s\S]*FR-001/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('passes when HIGH levels are backed by covered (or manual) coverage', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-d1-'));
    try {
      seed(dir, [
        { fr_id: 'FR-001', status: 'covered' },
        { fr_id: 'FR-002', status: 'manual' },
      ]);
      assert.doesNotThrow(() => PHASE_DEFS[5].validate(proof(), { dir, config: { artifactsDir: 'spec' } }));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
