import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_DEFS } from '../../lib/phases/index.js';

const validUX = () => `# UX/UI Specification

## User Flows

### Screen: Login
- Entry: user opens app
- Steps: enter email → enter password → tap Login
- Exit: redirected to Dashboard
- Error path: invalid credentials → inline error message with retry option

### Screen: Dashboard
- Entry: successful login
- Steps: view metrics → navigate to detail
- Exit: logout or navigate to settings
- Error path: data load failure → skeleton with retry button

## Component Inventory

| Component | Default | Loading | Error | Empty | Disabled |
|-----------|---------|---------|-------|-------|----------|
| LoginButton | Active label | Spinner | N/A | N/A | Opacity 0.5, no click |
| MetricsCard | Shows data | Skeleton pulse | Error message + retry | "No data yet" | N/A |
| NavBar | All items active | N/A | N/A | N/A | Item grayed if unauthorized |

## Nielsen Compliance

### Login Screen
- H1 Visibility: submit button shows loading spinner during authentication (≤1s feedback)
- H5 Error prevention: email format validated before submission
- H9 Error recovery: error message states "Invalid email or password" with "Try again" action
- H8 Minimalist design: only email, password, and login button visible on first render

### Dashboard Screen
- H1 Visibility: data cards show loading skeleton while fetching
- H6 Recognition: metric labels always visible, no tooltip-only labels
- H3 User control: logout accessible from nav, no hidden paths
`;

describe('Phase UX — validate()', () => {

  it('passes with valid artifact', () => {
    assert.doesNotThrow(() => PHASE_DEFS['ux'].validate(validUX()));
  });

  it('throws when ## User Flows section is missing', () => {
    const d = validUX().replace('## User Flows', '## Screens');
    assert.throws(() => PHASE_DEFS['ux'].validate(d), /User Flows/);
  });

  it('throws when ## Component Inventory section is missing', () => {
    const d = validUX().replace('## Component Inventory', '## Components');
    assert.throws(() => PHASE_DEFS['ux'].validate(d), /Component Inventory/);
  });

  it('throws when ## Nielsen Compliance section is missing', () => {
    const d = validUX().replace('## Nielsen Compliance', '## Heuristics');
    assert.throws(() => PHASE_DEFS['ux'].validate(d), /Nielsen Compliance/);
  });

  it('throws when artifact is too short', () => {
    const d = '## User Flows\n## Component Inventory\n## Nielsen Compliance\n';
    assert.throws(() => PHASE_DEFS['ux'].validate(d), /too short/);
  });

  it('phaseUX is accessible via PHASE_DEFS["ux"]', () => {
    assert.equal(PHASE_DEFS['ux'].num, 'ux');
    assert.equal(PHASE_DEFS['ux'].artifact, '01_UX_SPEC.md');
  });
});

const validRequirements = JSON.stringify({
  project_name: 'Test Project',
  user_personas: [{ role: 'End User', tech_level: 'low', goal: 'track expenses', pain_point: 'forgetting' }],
  functional_requirements: [
    { id: 'FR-001', title: 'Login Screen', priority: 'MUST', type: 'ux', acceptance_criteria: ['renders at 375px'] },
    { id: 'FR-002', title: 'Export', priority: 'MUST', type: 'logic', acceptance_criteria: ['exports CSV'] },
  ],
  user_stories: [],
  non_functional_requirements: [],
  no_go_zone: [],
});

describe('Phase UX — buildBriefing()', () => {
  const briefing = PHASE_DEFS['ux'].buildBriefing({
    dir: '/tmp/test',
    inputs: { 'IDEA.md': 'A simple app idea.', '01_REQUIREMENTS.json': validRequirements },
    feedback: null,
  });

  it('briefing contains ROLE, CONSTRAINTS, and REASONING from ux persona', () => {
    assert.ok(briefing.includes('UX/UI Designer'), 'ROLE must be present');
    assert.ok(briefing.includes('Nielsen'), 'REASONING with Nielsen heuristics must be present');
    assert.ok(briefing.includes('Never'), 'CONSTRAINTS must be present');
  });

  it('briefing contains User Personas section', () => {
    assert.ok(briefing.includes('User Personas'), 'User Personas section must be present');
    assert.ok(briefing.includes('End User'), 'persona role must appear in briefing');
  });

  it('UX/Visual/Audio Requirements section contains UX FR but not logic FR', () => {
    const uxIdx = briefing.indexOf('## UX/Visual/Audio Requirements');
    const fullReqIdx = briefing.indexOf('## Full Requirements');
    const uxSection = briefing.slice(uxIdx, fullReqIdx);
    assert.ok(uxSection.includes('FR-001'), 'UX FR must appear in UX section');
    assert.ok(!uxSection.includes('FR-002'), 'logic FR must not appear in UX section');
  });

  it('briefing contains required output sections', () => {
    assert.ok(briefing.includes('User Flows'), 'User Flows section instruction must be present');
    assert.ok(briefing.includes('Component Inventory'), 'Component Inventory section instruction must be present');
    assert.ok(briefing.includes('Nielsen Compliance'), 'Nielsen Compliance section instruction must be present');
  });

  it('applies feedback when provided', () => {
    const withFeedback = PHASE_DEFS['ux'].buildBriefing({
      dir: '/tmp/test',
      inputs: { 'IDEA.md': 'A simple app idea.', '01_REQUIREMENTS.json': validRequirements },
      feedback: 'Make error states more explicit',
    });
    assert.ok(withFeedback.includes('Make error states more explicit'), 'feedback must appear in briefing');
  });

  it('handles missing user_personas in requirements gracefully', () => {
    const reqsNoPerson = JSON.parse(validRequirements);
    delete reqsNoPerson.user_personas;
    assert.doesNotThrow(() => PHASE_DEFS['ux'].buildBriefing({
      dir: '/tmp/test',
      inputs: { 'IDEA.md': 'idea', '01_REQUIREMENTS.json': JSON.stringify(reqsNoPerson) },
      feedback: null,
    }));
  });

  it('[v0.1.28] briefing renders artifact path using artifactsBase when provided', () => {
    const b = PHASE_DEFS['ux'].buildBriefing({
      dir: '/tmp/test',
      inputs: { 'IDEA.md': 'A simple app idea.', '01_REQUIREMENTS.json': validRequirements },
      feedback: null,
      artifactsBase: '/tmp/test/spec',
    });
    assert.ok(b.includes('/tmp/test/spec/01_UX_SPEC.md'), 'artifact path must use artifactsBase/spec');
    assert.ok(!b.includes('/tmp/test/01_UX_SPEC.md'), 'artifact path must NOT use bare dir');
  });
});
