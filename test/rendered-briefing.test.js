/**
 * Rendered-briefing consistency (UPLAN-0703 C7).
 *
 * connectivity.test.js pins MECHANICAL connectivity (declared inputs, instructed
 * consumption). This suite pins the RHETORICAL layer the audit found drifting with no
 * detector: what the agent actually READS, in reading order, after persona + template +
 * JS-built strings render into one prompt. Three defect classes it locks:
 *   1. silent-empty render — render() replaces a MISSING data key with '' (by design), so a
 *      phase that forgets to pass {{MIN_FR}} ships "≥ FRs" with green tests;
 *   2. positional lies — text referencing content "above/below" that renders elsewhere
 *      (the C2 finding: client material printed AFTER the instructions block);
 *   3. persona/template drift — a mechanic restated in a persona that contradicts the
 *      template it renders next to (the C3 findings). String canaries on the KNOWN drift
 *      vocabulary; the division rule in lib/personas/README.md is the real protection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { PHASE_DEFS } from '../lib/phases/index.js';
import { extractHumanReview } from '../lib/prompts/render.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const persona = (name) => fs.readFileSync(path.join(ROOT, 'lib', 'personas', `${name}.js`), 'utf8');

// A sentinel context-assets block, shaped like the real one run-phase builds.
const ASSETS = `\n── Additional context (idea_context/ folder) ──────────────\nSENTINEL-ASSET-BLOCK content the agent must see before instructions.\n`;

const IDEA = [
  '# Idea', '## Problem', 'Manual budget tracking loses receipts.', '## Target Users',
  'Freelancers invoicing monthly.', '## Business Rules', 'Totals in EUR.',
  '## Success Criteria', 'First expense recorded within 60s.',
].join('\n');

const PRD = JSON.stringify({
  project_name: 'demo',
  functional_requirements: [{ id: 'FR-001', title: 'Record expense', description: 'User records an expense with amount+category.', priority: 'MUST', type: 'logic', acceptance_criteria: ['stored and listed'] }],
  non_functional_requirements: [], user_stories: [], no_go_zone: ['no auth in v1'],
});
const DESIGN = '# Design\n## System Architecture\nCLI + JSON store.\n## API Design\naddExpense(amount, category).\n';
const TCS = JSON.stringify({ test_cases: [{ id: 'TC-001h', title: 'records expense', requirement_id: 'FR-001', type: 'unit', scenario: 'happy_path', given: 'empty store', when: 'addExpense(5,"food")', then: 'store has 1 entry', expected_result: 'entry persisted' }] });

function renderPhase(key, { featureRoot = null } = {}) {
  const inputs = {
    'IDEA.md': IDEA,
    '01_REQUIREMENTS.json': PRD,
    '02_SYSTEM_DESIGN.md': DESIGN,
    '03_TEST_CASES.json': TCS,
    '01_UX_SPEC.md': '',
  };
  return PHASE_DEFS[key].buildBriefing({
    dir: path.join(ROOT, 'test'),   // never written; readArtifact misses fall back to inputs
    inputs, feedback: '', artifactsBase: 'spec', bestPractices: '', config: {},
    featureRoot, scopeVerb: featureRoot ? 'feature ' : '', scopeArg: featureRoot ? ' demo' : '',
    contextAssets: ASSETS,
  });
}

describe('rendered briefing — placeholders resolve and floors match scope (C4/C7)', () => {
  it('no template leaks an unresolved {{PLACEHOLDER}} into any rendered core briefing', () => {
    for (const key of [1, 2, 3, 4, 'ux', 'discovery']) {
      const out = renderPhase(key);
      assert.ok(!/\{\{\w+\}\}/.test(out), `phase ${key} briefing contains a raw {{...}} token`);
    }
  });

  it('root phase 1 renders the ROOT floors, framed as floors not targets', () => {
    const out = renderPhase(1);
    assert.match(out, /≥5 FRs, ≥3 NFRs, ≥3 no_go_zone/,
      'root floors must render with their values — a missing MIN_* key renders "≥ FRs" silently');
    assert.match(out, /floors, NOT targets/i, 'the anti-anchoring frame must survive edits');
    assert.match(out, /stopping at the floor when the seed implies more is silent scope loss/i,
      'the do-not-stop-at-the-minimum instruction is the point of C4');
    assert.doesNotMatch(out, /Min 5 FRs/, 'the old unconditional root literal must be gone');
  });

  it('feature phase 1 renders the FEATURE floors (2/1/1) — not the root values', () => {
    const out = renderPhase(1, { featureRoot: path.join(ROOT, 'test') });
    assert.match(out, /≥2 FRs, ≥1 NFRs, ≥1 no_go_zone/,
      'a feature agent reading root floors pads with filler — the defect C4 removes');
  });
});

describe('rendered briefing — context assets render INSIDE, before the instructions (C2)', () => {
  for (const key of [1, 2, 3, 4, 'ux', 'discovery']) {
    it(`phase ${key}: the assets block precedes the Output/Instructions sections`, () => {
      const out = renderPhase(key);
      const asset = out.indexOf('SENTINEL-ASSET-BLOCK');
      assert.ok(asset !== -1, `phase ${key} must interpolate {{CONTEXT_ASSETS}} — a dropped placeholder falls back to the after-briefing print (the C2 defect)`);
      const anchors = [out.indexOf('\n## Output'), out.indexOf('\n## Instructions')].filter(i => i !== -1);
      assert.ok(anchors.length > 0, `phase ${key} briefing has an Output/Instructions section to order against`);
      assert.ok(asset < Math.min(...anchors),
        `phase ${key}: client material must render BEFORE the instructions block — an agent that stops at the instructions never sees it`);
    });
  }

  it('no template claims the context sits "below the briefing" anymore', () => {
    for (const key of [1, 'ux', 'discovery']) {
      assert.ok(!/listed below the briefing/.test(renderPhase(key)),
        'stale positional language — the assets render inside the briefing since C2');
    }
  });

  // Adversarial-pass fix: the first cut put {{CONTEXT_ASSETS}} inside {{#IF_IDEA_MD}}, so on
  // a RE-RUN (01_REQUIREMENTS.json exists → IDEA.md mode off) the whole block was stripped
  // and the client material fell back to the after-checklist print — the exact C2 defect,
  // regressing precisely in the reject→refine loop where feedback and the client spec must
  // coexist. The placeholder must render in BOTH phase-1 modes.
  it('phase 1 RE-RUN mode still renders the assets block before the instructions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-c2-rerun-'));
    try {
      fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), PRD);   // re-run trigger
      const out = PHASE_DEFS[1].buildBriefing({
        dir, inputs: {}, feedback: 'tighten FR-001', artifactsBase: 'spec', bestPractices: '',
        config: { artifactsDir: 'spec' }, featureRoot: null, scopeVerb: '', scopeArg: '',
        contextAssets: ASSETS,
      });
      assert.match(out, /SSoT for this re-run/, 'precondition: re-run mode is active');
      const asset = out.indexOf('SENTINEL-ASSET-BLOCK');
      assert.ok(asset !== -1, 're-run briefings must still interpolate the client material');
      assert.ok(asset < out.indexOf('\n## Output'),
        're-run: client material must still precede the instructions block');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('persona/template drift canaries (C3 — known-drifted vocabulary must stay dead)', () => {
  it('qa persona no longer contradicts tests.md on multi-FR TCs or ac_id', () => {
    const src = persona('qa');
    assert.ok(!src.includes('one test case, one FR'),
      'tests.md sanctions frs:[...] — the persona rule contradicted it');
    assert.ok(!src.includes('Never omit user_story_id and ac_id'),
      'tests.md forbids inventing ac_id formats for plain-string-AC projects');
  });

  it('devops persona no longer restates the deploy.md compliance mapping table', () => {
    assert.ok(!persona('devops').includes('covered + zero debt → complete'),
      'the mapping lives in deploy.md ONLY — the persona copy had already drifted (dropped production_ready)');
  });

  it('pm persona no longer hardcodes the root no_go_zone floor', () => {
    assert.ok(!persona('pm').includes('≥3'),
      'floors are scope-dependent render placeholders — a persona literal is wrong in feature scope');
  });

  it('phase 3 briefing carries the conditional medium rule, not the unconditional 375px gate', () => {
    const out = renderPhase(3);
    assert.doesNotMatch(out, /must include test for responsive layout at 375px viewport AND/,
      'the unconditional 375px mandate was a stack assumption (principle 4) — kiosk/TUI/desktop products');
    assert.match(out, /fixed-medium surface/, 'the conditional carve-out must be present');
  });
});

describe('Phase 4 plan-first protocol (C8/ADR-071)', () => {
  function renderBuild({ failingTests = null } = {}) {
    return PHASE_DEFS[4].buildBriefing({
      dir: path.join(ROOT, 'test'),
      inputs: { '01_REQUIREMENTS.json': PRD, '02_SYSTEM_DESIGN.md': DESIGN, '03_TEST_CASES.json': TCS, '01_UX_SPEC.md': '' },
      feedback: '', failingTests, artifactsBase: 'spec', bestPractices: '', config: {},
      featureRoot: null, scopeVerb: '', scopeArg: '', contextAssets: '',
    });
  }

  it('a FRESH build carries the full protocol: plan file, present-before-code, per-cluster roadmap, checkpoints, resume rule', () => {
    const out = renderBuild();
    assert.match(out, /Plan-First Build Protocol/);
    assert.match(out, /BUILD_PLAN\.md/);
    assert.match(out, /Present the plan to the user in conversation before implementing/i);
    assert.match(out, /Within EACH cluster follow the layer roadmap/i, 'the roadmap is per-cluster, not whole-project');
    assert.match(out, /When a human operator is present.*pause and present progress/is);
    assert.match(out, /autonomous\/CI run.*record.*continue/is, 'the checkpoint must not stall an unattended run');
    assert.match(out, /read BUILD_PLAN\.md FIRST/i, 'session resume reads the plan first');
    assert.match(out, /cascade-invalidates/i, 'spec-change routing states the honest cost');
    assert.match(out, /never resume from this briefing \+ the old BUILD_PLAN\.md/i, 'stale-briefing guard after upstream re-open');
  });

  it('a DEBUG re-entry renders NEITHER the protocol nor the plan instructions (minimal-fix protocol instead)', () => {
    const out = renderBuild({ failingTests: [{ tc_id: 'TC-001h', notes: 'assertion failed' }] });
    assert.doesNotMatch(out, /Plan-First Build Protocol/, 'debug mode must not instruct re-planning');
    assert.doesNotMatch(out, /BUILD_PLAN\.md/, 'the plan file has no role in a minimal-fix re-entry');
    assert.match(out, /Instructions \(debug re-entry\)/, 'the debug instruction variant renders instead');
    assert.match(out, /Debug Mode — Fix Failing Tests/, 'the debug protocol block still renders');
  });

  it('FR_SNAPSHOT no longer echoes acceptance_criteria (the one honest dedup) — TC_LOCK untouched', () => {
    const out = renderBuild();
    const snapshot = out.slice(out.indexOf('Requirements Snapshot'), out.indexOf('## Requirements\n'));
    assert.ok(!snapshot.includes('— AC:'), 'the AC text was duplicated with the Requirements block below');
    assert.match(snapshot, /FR-001 \[MUST\/logic\] Record expense/, 'id/priority/type/title survive');
    assert.match(out, /Test Authorship Lock/, 'TC_LOCK carries the verify-run naming contract — never trim it');
    assert.match(out, /TC-001h \(FR-001\)/, 'the TC id list is intact');
  });

  it('developer persona and build template agree on the per-cluster roadmap (C3 rule)', () => {
    const src = persona('developer');
    assert.ok(!src.includes('Work in three phases'), 'the whole-project three-phase roadmap contradicts the per-cluster protocol');
    assert.ok(!src.includes('Follow the 3-phase roadmap'), 'same — the persona and template render into one prompt');
    assert.ok(src.includes('cluster'), 'the persona carries the per-cluster judgment');
  });
});

describe('optional phases print a Human Review checklist (C5)', () => {
  for (const key of ['ux', 'discovery']) {
    it(`phase ${key} template has a ## Human Review section (approve extracts it from here)`, () => {
      assert.match(renderPhase(key), /## Human Review — Before approving phase/,
        `approve ${key} printed NO checklist — the weakest-gated phases were the only ones without one`);
    });
  }

  // The approve-side plumbing: extractHumanReview is exactly what cmdApprove calls (via
  // TEMPLATE_BY_PHASE) to print the checklist — a non-empty extract here IS the checklist
  // the human sees at `approve ux`/`approve discovery`.
  it('extractHumanReview returns the new checklists (the approve-time print source)', () => {
    const ux = extractHumanReview('phases/phaseUX');
    assert.ok(ux && /fidelity|provided design/i.test(ux), 'approve ux must print a real checklist');
    const disc = extractHumanReview('phases/phaseDiscovery');
    assert.ok(disc && /solutioneering/i.test(disc), 'approve discovery must print a real checklist');
  });
});
