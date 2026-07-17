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

  it('phase 3 and 4 briefings state the ONLY sources of TC credit (VERIFY-TC-VISIBILITY-0706)', () => {
    // A TC verified only through a quality_gates command is judged by exit
    // code and never parsed — invisible until verify-complete blocks. The
    // briefings must say so up front, in both the planning and build phases.
    for (const n of [3, 4]) {
      assert.match(renderPhase(n), /judged by exit code/,
        `phase ${n} must state quality gates are never parsed for TC ids`);
    }
    const p3 = renderPhase(3);
    assert.match(p3, /credited ONLY from/, 'phase 3 must carry the credit-channel rule');
    assert.match(p3, /One TC id per test title/,
      'phase 3 must warn that a multi-id title credits only the first');
    assert.match(renderPhase(4), /ONLY sources of TC credit/, 'phase 4 must carry the credit-channel rule');
  });

  it('phase 1 NFR category enum names the operational categories it mandates (E2E-PIPELINE-0706)', () => {
    // The briefing demands Observability + CI/CD coverage; pre-rc.160 the enum
    // forbade naming them, steering agents to Regression — the one value with
    // hard-MUST gate side-effects.
    const out = renderPhase(1);
    assert.match(out, /Performance\|Security\|Reliability\|Scalability\|Usability\|Observability\|CI\/CD\|Regression/,
      'the enum must carry the operational categories');
    assert.match(out, /do NOT file them under `Regression`/,
      'the Regression reservation must be stated next to the operational block');
  });

  // REQ-RICHNESS-0711 B (ADR-077): the briefing must state the proportional US/AC floor so the
  // agent knows depth is enforced, not just encouraged — pins the gate declaration + the
  // thin-story→thin-test rationale against a future template edit dropping it.
  it('phase 1 briefing states the US/AC floor is enforced and ties it to test richness', () => {
    const out = renderPhase(1);
    assert.match(out, /every MUST FR must have ≥1 linked user story/i, 'the A1 floor stated');
    assert.match(out, /enforced: `complete 1` blocks a MUST FR with no story/i, 'A1 named as a gate, not a nudge');
    assert.match(out, /blocks a MUST-linked story with none/i, 'A2 named as a gate');
    assert.match(out, /thin stories and one-line ACs produce thin tests downstream/i, 'the rationale that motivates depth');
  });

  // REQ-RICHNESS-0711 addendum (rc.174): the briefing must state the canonical priority
  // vocabulary as enforced — priority is the join key the whole MUST-gate family filters
  // on, and a briefing that doesn't name the rule leaves the agent to discover it by
  // gate rejection.
  it('phase 1 briefing states the exact-case priority vocabulary is enforced', () => {
    const out = renderPhase(1);
    assert.match(out, /Priority values are exact-case `MUST` \/ `SHOULD` \/ `NICE`/i, 'the vocabulary stated');
    assert.match(out, /blocks any other value, and an FR with no priority at all/i, 'named as a gate, not a nudge');
    assert.match(out, /silently exempt the FR/i, 'the dodge rationale that motivates the rule');
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

  it('a FRESH build carries the full protocol: plan file, present-before-code, per-epic build steps, checkpoints, resume rule', () => {
    const out = renderBuild();
    assert.match(out, /Plan-First Build Protocol/);
    assert.match(out, /BUILD_PLAN\.md/);
    assert.match(out, /Present the plan to the user in conversation before implementing/i);
    assert.match(out, /Within EACH epic follow the build steps/i, 'the build steps are per-epic, not whole-project');
    assert.match(out, /When a human operator is present.*pause and present/is);
    assert.match(out, /autonomous\/CI run.*record.*continue/is, 'the checkpoint must not stall an unattended run');
    assert.match(out, /read BUILD_PLAN\.md FIRST/i, 'session resume reads the plan first');
    assert.match(out, /cascade-invalidates/i, 'spec-change routing states the honest cost');
    assert.match(out, /never resume from this briefing \+ the old BUILD_PLAN\.md/i, 'stale-briefing guard after upstream re-open');
  });

  // PLAN-EPIC-0708: one vocabulary + US-as-deliverable + verifiable boundaries. The plan
  // is honor-system end to end, so the ONLY structural protection is these template pins.
  it('the plan groups USER STORIES into epics with a fixed skeleton (PLAN-EPIC-0708)', () => {
    const out = renderBuild();
    // The grouping axis is the US (owner-confirmed 2026-07-10) — never "cluster the FRs".
    assert.match(out, /Group the \*\*user stories\*\* into \*\*epics\*\*/, 'US is the grouping axis');
    // The fixed skeleton, field by field — renaming these run-to-run was the reported defect.
    assert.match(out, /## Epic <N> — <feature-area name>/, 'skeleton heading missing');
    assert.match(out, /Delivers:\s+US-0xx/, 'Delivers (the US — the deliverable) missing from the skeleton');
    assert.match(out, /Makes pass:\s+TC-0xx/, 'Makes pass (the epic done criterion) missing from the skeleton');
    assert.match(out, /Why here:/, 'per-epic ordering rationale missing');
    // FR/TC are derived references; the plan must still cover the WHOLE TC set (US-less
    // FRs' and NFRs' TCs get an explicit home — the adversarial pass showed the pure
    // US-derivation chain strands them until the end, the exact mode this protocol kills).
    assert.match(out, /DERIVED references/i, 'FR/TC must be reference-only, never restated');
    assert.match(out, /every TC id in `03_TEST_CASES\.json` appears in exactly one epic/i, 'full-TC-set coverage rule missing');
    assert.match(out, /NFRs are never a grouping axis/i, 'NFR grouping exclusion missing');
    // Chronology: the epic writes its own TCs' test code — done cannot presuppose tests exist.
    assert.match(out, /Writing the test code for the epic'?s TCs is PART of the epic/i, 'test authorship must live inside the epic');
    // Verifiable partial delivery: done has an operative definition, evidence not narrative.
    assert.match(out, /`done` only when its `Makes pass` TCs run green/i, 'the epic done criterion missing');
    assert.match(out, /test run OUTPUT/i, 'the boundary must present evidence, not a summary');
    // Proportionality: epics come from the product; small increment = ONE epic, no ceremony.
    assert.match(out, /epic count comes from the product, not from the protocol/i, 'proportionality rule missing');
    assert.match(out, /Do not manufacture granularity/i, 'anti-ceremony guard missing');
    // The drifting vocabulary is gone from the rendered briefing (the acceptance grep, as a pin).
    assert.ok(!/\bcluster\b/i.test(out), 'the old "cluster" vocabulary must not render');
    assert.ok(!/layer roadmap/i.test(out), 'the old "layer roadmap" vocabulary must not render');
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

  it('developer persona and build template agree on the per-epic build steps (C3 rule)', () => {
    const src = persona('developer');
    assert.ok(!src.includes('Work in three phases'), 'the whole-project three-phase roadmap contradicts the per-epic protocol');
    assert.ok(!src.includes('Follow the 3-phase roadmap'), 'same — the persona and template render into one prompt');
    assert.ok(src.includes('epic'), 'the persona carries the per-epic judgment');
    assert.ok(!src.includes('cluster'), 'the old vocabulary must not survive in the persona (it rendered as "capa"/"item")');
    assert.ok(!src.includes('layers'), 'same — "layers" is what a Spanish-speaking agent renders as "capa"');
  });
});

// ADR-072 (UPLAN-0703 Phase E): the adversarial method ships as briefing blocks, not an
// `aitri challenge` command (panel-rejected). Pins: the block exists where the panel found
// a real gap (Phase 2), the Phase-3 sweep carries the rc.132 method standard, Phase 1
// deliberately gets NOTHING (audit requirements + coverage_map IS its challenge), and the
// reviewer persona no longer makes the false independence claim.
// RSRCH-ADOPT-0711 W1 (ADR-075): the per-MUST-FR Implementation Approach section is the
// top measured code-gen quality lever (algorithmic detail 57% / I-O format 44%, arXiv
// 2601.13118) forced at the source. Pin the briefing instruction so a template edit cannot
// silently drop it — the gate (phase2.js validate) pins the artifact side.
describe('Implementation Approach briefing pin (RSRCH-ADOPT-0711 W1)', () => {
  it('Phase 2 briefing instructs the per-MUST-FR Implementation Approach section', () => {
    const out = renderPhase(2);
    assert.match(out, /## Implementation Approach/, 'section instruction must be present');
    assert.match(out, /For EVERY MUST FR/i, 'the per-MUST-FR mandate');
    assert.match(out, /Method.*algorithm|algorithm.*Method/is, 'the named-method requirement');
    assert.match(out, /I\/O contract/i, 'the I/O contract requirement');
    assert.match(out, /Failure behavior/i, 'the failure-behavior requirement');
    assert.match(out, /not pseudo-code/i, 'the over-specification stop (spec-as-source anti-pattern)');
    assert.match(out, /self-evident from Data Model/i, 'the explicit-skip escape hatch for pure CRUD');
    assert.match(out, /All 10 required sections/, 'Human Review count updated with the new section');
  });
});

describe('adversarial-pass briefing blocks (ADR-072 — challenge command rejected)', () => {
  it('Phase 2 briefing carries the adversarial-pass block with design attack vectors', () => {
    const out = renderPhase(2);
    assert.match(out, /adversarial pass before you report the design done/i);
    assert.match(out, /refute.*the design/is, 'the mandate is refutation, not validation');
    assert.match(out, /no home in any component/i, 'the FR→design join attack vector');
    assert.match(out, /unstated assumption/i);
    assert.match(out, /verify the adversary's load-bearing claims/i, 'the verify-the-adversary rule (rc.132 method standard)');
  });

  it('Phase 3 sweep is upgraded to the method standard: refute-what-exists + verify claims + blast-radius', () => {
    const out = renderPhase(3);
    assert.match(out, /adversarial pass before you report the test plan done/i);
    assert.match(out, /expected value is invented/i, 'attacks the TCs that DO exist, not only the missing ones');
    assert.match(out, /happy-path/i);
    assert.match(out, /verify the adversary's load-bearing claims/i);
    assert.match(out, /blast-radius/i, 'the skip-trivial/never-skip-blast-radius rule');
  });

  it('Phase 1 briefing deliberately has NO adversarial-pass block (audit requirements is its challenge)', () => {
    const out = renderPhase(1);
    assert.doesNotMatch(out, /adversarial pass before you report/i,
      'a generic refute block would duplicate the stronger audit-requirements + coverage_map mechanism (ADR-072)');
    assert.match(out, /coverage_map/, 'the comparison mechanism Phase 1 relies on instead');
  });

  it('reviewer persona no longer claims false independence; it instructs disclosure instead', () => {
    const src = persona('reviewer');
    assert.ok(!src.includes('You were NOT involved in writing the code'),
      'false in the dominant single-session flow — the live dishonesty ADR-072 fixes');
    assert.ok(!src.includes('reviewing code written by someone else'),
      'same false claim in REASONING');
    assert.match(src, /If YOU wrote the code, declare it/i, 'the honest conditional: disclose authorship');
    assert.match(src, /fresh session|subagent/i, 'independence is instructed where available');
    // C3 division rule: the persona carries the NORM (declare authorship), the template
    // carries the MECHANIC (the authorship line's placement + format in the output spec).
    const tmpl = fs.readFileSync(path.join(ROOT, 'templates', 'phases', 'phaseReview.md'), 'utf8');
    assert.match(tmpl, /Reviewer: independent \(fresh session\/subagent\)/, 'the template output spec defines the authorship line');
    assert.match(tmpl, /Reviewer: build author \(self-review — weaker signal\)/);
    assert.ok(!src.includes('first line of the review'), 'placement mechanic must NOT live in the persona (C3)');
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

  // UX-PRO-0707 1.3: the checklist used to blank-strip {{MIN_NGZ}}, printing "≥ explicit"
  // — the floor number silently lost. approve now passes the scopeFloors values through.
  it('extractHumanReview renders supplied placeholders (MIN_NGZ) instead of blanking them', () => {
    const withData = extractHumanReview('phases/requirements', { MIN_NGZ: '3' });
    assert.match(withData, /no_go_zone has ≥3 explicit/, 'the floor number must render into the checklist');
    assert.doesNotMatch(withData, /\{\{/, 'no unrendered placeholder tokens may remain');
  });

  // The general pin: after passing the data approve passes, NO Human Review checklist may
  // contain an unrendered {{…}} — catches the whole class, not just MIN_NGZ.
  it('no approve checklist leaks an unrendered {{…}} once approve-time data is supplied', () => {
    const data = { MIN_FR: '3', MIN_NFR: '2', MIN_NGZ: '3', SCOPE_VERB: '', SCOPE_ARG: '' };
    for (const tmpl of ['phases/requirements', 'phases/architecture', 'phases/tests',
                        'phases/build', 'phases/deploy', 'phases/phaseUX', 'phases/phaseDiscovery',
                        'phases/phaseReview']) {
      const cl = extractHumanReview(tmpl, data);
      if (cl) assert.doesNotMatch(cl, /\{\{/, `${tmpl} checklist leaked an unrendered placeholder`);
    }
  });
});

describe('UX phase advisory visual preview (FB-UX-MOCKUP-0708)', () => {
  // The preview is advisory (no gate, not hashed, nothing downstream reads it) — so the
  // ONLY structural protection is this template pin: the briefing must instruct it, bound
  // by the rules that keep it from forking the source of truth.
  it('the rendered UX briefing carries the preview instruction with its guardrails', () => {
    const briefing = renderPhase('ux');
    assert.match(briefing, /UX_PREVIEW\.html/, 'preview output missing from the briefing');
    assert.match(briefing, /spec\/UX_PREVIEW\.html/, 'ARTIFACTS_BASE must render into the preview path');
    // The anti-fork hard rule (adversarial finding: a preview that extends the spec
    // detonates at Phase 4 — stakeholder approved the preview, developer built the spec).
    assert.match(briefing, /RENDERS the spec, it never extends it/i, 'renders-not-extends rule missing');
    assert.match(briefing, /source row in the spec'?s Design Tokens/i, 'every rendered value must trace to the tokens table');
    // The only skip: no graphical surface. Provided-design projects still generate it.
    assert.match(briefing, /CLI\/TUI, library, service\/API/i, 'the no-graphical-surface skip must be explicit');
    assert.match(briefing, /This is the only skip/i, 'skip must be single-condition (owner call 2026-07-09)');
    // Provided-design role: transcription read-back, compared against the client mockups.
    assert.match(briefing, /transcription read-back/i, 'provided-design read-back role missing');
    // Staleness rule (adversarial finding: on re-runs the agent edits only the affected
    // spec section — without this line the preview silently goes stale).
    assert.match(briefing, /REGENERATE the preview from the updated spec/i, 're-run regeneration rule missing');
    // Stack-agnostic guard (principle 4): the medium must not imply the product's stack.
    assert.match(briefing, /does not imply the product is a web app/i, 'stack-agnostic guard missing');
    // Self-containment: the human is told to open this file in a browser.
    assert.match(briefing, /ZERO external requests/i, 'self-containment rule missing');
    // Non-binding banner on the one permitted in-context strip.
    assert.match(briefing, /ILLUSTRATIVE — non-binding; the spec is the contract/, 'illustrative banner missing');
    // The two surfaces an agent skimming to the Instructions actually acts on: the
    // imperative step, and the Delivery Summary line where a skip reason is recorded.
    // (The generic /spec\/UX_PREVIEW\.html/ pin above is satisfied by EITHER — each
    // needs its own pin or one can silently vanish.)
    // FB-UXPREVIEW-SKIPPED-0715: the step is a stated DELIVERABLE with a mechanical
    // skip-recording contract (`Preview: not generated — <reason>` inside the spec) that
    // `complete ux` reads to warn on a silent skip.
    assert.match(briefing, /Generate spec\/UX_PREVIEW\.html \(advisory output above\)\. This is a DELIVERABLE/,
      'the Instructions step for the preview is missing');
    assert.match(briefing, /Preview: not generated — <reason>` inside 01_UX_SPEC\.md/,
      'the in-spec skip-recording contract (what complete ux greps) is missing');
    assert.match(briefing, /Preview:\s+\[UX_PREVIEW\.html — open it in a browser to SEE the design \| not generated — reason\]/,
      'the Delivery Summary Preview line (the skip-recording surface) is missing');
  });

  it('the approve-time checklist covers the preview (match-the-tokens + no external URLs)', () => {
    const cl = extractHumanReview('phases/phaseUX');
    assert.match(cl, /UX_PREVIEW\.html/, 'approve ux checklist must reference the preview');
    assert.match(cl, /no external URLs/i, 'the self-containment check is the human\'s to make');
  });

  // C3 division rule: the persona carries the NORM (renders-not-extends, spec is the
  // contract); the template carries the MECHANICS (content list, skip condition, roles).
  it('persona/template division holds for the preview', () => {
    const src = persona('ux');
    assert.match(src, /never extends the spec/i, 'the persona must carry the renders-not-extends norm');
    assert.ok(!src.includes('contrast-ratio badges'), 'content mechanics must NOT live in the persona (C3)');
    assert.ok(!src.includes('side by side'), 'layout mechanics must NOT live in the persona (C3)');
  });
});

// RSRCH-ADOPT-0711 W3 (persona-role evidence): ROLE states function-in-pipeline and
// downstream audience — never an expertise claim. Expert personas measurably do not
// improve accuracy and can degrade clarity (EMNLP-2024-Findings-888, arXiv 2512.05858).
// The pin's contract is the exported ROLE string ONLY — CONSTRAINTS/REASONING may
// legitimately mention seniority in other senses (they don't today, but the rule is
// scoped to ROLE, per lib/personas/README.md).
describe('persona ROLE carries no expertise claim (RSRCH-ADOPT-0711 W3)', () => {
  it('no persona ROLE matches senior/world-class/expert', async () => {
    const personaDir = path.join(ROOT, 'lib', 'personas');
    const files = fs.readdirSync(personaDir).filter(f => f.endsWith('.js'));
    assert.ok(files.length >= 12, `persona modules found: ${files.length}`);
    for (const f of files) {
      const mod = await import(path.join(personaDir, f));
      if (typeof mod.ROLE !== 'string') continue;
      assert.doesNotMatch(mod.ROLE, /\b(senior|world-class|expert)\b/i,
        `${f} ROLE must state function-in-pipeline, not an expertise claim`);
    }
  });
});

// RSRCH-ADOPT-0711 W4 (coverage signal): line coverage does not predict fault detection
// (Just ASE 2020; ICSE 2021 — 70% of high-priority bugs sat in covered code). The Phase 3
// briefing states it next to coverage_goal so the target is authored with the caveat.
describe('coverage-signal sentence in Phase 3 briefing (RSRCH-ADOPT-0711 W4)', () => {
  it('Phase 3 briefing carries the line-coverage caveat and the mutation-score pointer', () => {
    const out = renderPhase(3);
    assert.match(out, /line coverage does not predict fault detection/i, 'the caveat sentence');
    assert.match(out, /mutation score is the honest signal/i, 'the mutation pointer');
    assert.match(out, /coverage_goal/, 'anchored next to the coverage_goal schema literal');
  });
});

// GOVERNANCE-0717 G1: the authority ladder now includes the parent product standard
// (between feature visual FRs and the archetype), amended in BOTH carriers (persona +
// template) in the same change — a block outside the ladder would reproduce ADR-065's
// inversion in mirror image (kill-review condition).
describe('parent-standards authority ladder (GOVERNANCE-0717 G1)', () => {
  it('the ux briefing ladder places the parent standard after visual FRs, before the archetype', () => {
    const out = renderPhase('ux');
    // Template leg (Design Tokens derivation order)
    assert.match(out, /\(1\) explicit visual FRs, \(2\) the \*\*parent product standard\*\*/,
      'template ladder must slot the parent standard at (2)');
    assert.match(out, /\(3\) archetype defaults, \(4\) product context/,
      'archetype and inferred context must be demoted below the parent standard');
    // Persona leg (same ladder, same order)
    assert.match(out, /\(2\) the PARENT PRODUCT STANDARD when the briefing carries one/,
      'persona ladder must carry the same slot');
    assert.match(out, /outranks anything/i, 'the standard-outranks-invention rationale is present');
  });

  it('the approve-ux checklist carries the deviation-justification line', () => {
    const cl = extractHumanReview('phases/phaseUX');
    assert.match(cl, /deviation from the parent product standard/i);
    assert.match(cl, /reused, not re-invented/i);
  });
});

// GOVERNANCE-0717 G2: the adoption audit captures conventions-to-follow, explicitly
// excluding Priority-Action defects (a neutral record would instruct features to match
// anti-patterns the same audit says to fix — kill-review finding).
describe('adopt scan captures Conventions Observed (GOVERNANCE-0717 G2)', () => {
  it('the scan template specs the section with the defect-exclusion rule', () => {
    const scan = fs.readFileSync(path.join(ROOT, 'templates', 'adopt', 'scan.md'), 'utf8');
    assert.match(scan, /#### Conventions Observed/, 'section is a #### heading (the fallback extraction anchor)');
    assert.match(scan, /EXCLUDE anything flagged in Priority Actions/, 'the defect-exclusion rule');
    assert.match(scan, /standards to follow, NOT defects to copy/i);
    assert.match(scan, /feature sub-pipeline/i, 'the section states its downstream consumer');
  });
});
