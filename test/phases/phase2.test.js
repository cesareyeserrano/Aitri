import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_DEFS } from '../../lib/phases/index.js';

const validP2 = () => [
  '## Executive Summary',
  'Using Node.js + PostgreSQL. Justified by team expertise and existing infra.',
  '',
  '## System Architecture',
  '```',
  'Client → API → DB',
  '```',
  '',
  '## Data Model',
  'Users table: id, email, password_hash, created_at',
  '',
  '## API Design',
  'POST /auth/login — returns JWT',
  '',
  '## Security Design',
  'JWT HS256, bcrypt cost 12, rate limiting 100 req/min',
  '',
  '## Performance & Scalability',
  'Connection pooling, Redis cache for sessions',
  '',
  '## Deployment Architecture',
  'Docker + docker-compose, CI/CD via GitHub Actions',
  '',
  '## Risk Analysis',
  'Risk 1: DB connection exhaustion — mitigation: pool size 20',
  'Risk 2: Token leakage — mitigation: short expiry + refresh',
  'Risk 3: Load spike — mitigation: horizontal scaling',
  ...Array(20).fill('Additional design content line.'),
].join('\n');

describe('Phase 2 — validate()', () => {

  it('passes with valid artifact', () => {
    assert.doesNotThrow(() => PHASE_DEFS[2].validate(validP2()));
  });

  it('throws when a required section is missing', () => {
    const content = validP2().replace('## Data Model', '## Data Layer');
    assert.throws(() => PHASE_DEFS[2].validate(content), /missing required sections[\s\S]*## Data Model/);
  });

  it('throws when multiple required sections are missing', () => {
    const content = validP2()
      .replace('## API Design', '## APIs')
      .replace('## Security Design', '## Auth');
    assert.throws(() => PHASE_DEFS[2].validate(content), /missing required sections/);
  });

  it('[regression] passes with numbered headers (## 1. Executive Summary style)', () => {
    const numbered = validP2()
      .replace('## Executive Summary',   '## 1. Executive Summary')
      .replace('## System Architecture', '## 2. System Architecture')
      .replace('## Data Model',          '## 3. Data Model')
      .replace('## API Design',          '## 4. API Design')
      .replace('## Security Design',     '## 5. Security Design');
    assert.doesNotThrow(() => PHASE_DEFS[2].validate(numbered));
  });

  it('[regression] passes with decimal-prefixed headers (## 1.1 style)', () => {
    const decimal = validP2()
      .replace('## Executive Summary',   '## 1.1 Executive Summary')
      .replace('## System Architecture', '## 2.0 System Architecture');
    assert.doesNotThrow(() => PHASE_DEFS[2].validate(decimal));
  });

  it('throws when content is too short (< 40 lines)', () => {
    const short = [
      '## Executive Summary', 'Short.',
      '## System Architecture', 'Tiny.',
      '## Data Model', 'Minimal.',
      '## API Design', 'Basic.',
      '## Security Design', 'None.',
      '## Performance & Scalability', 'N/A.',
      '## Deployment Architecture', 'N/A.',
      '## Risk Analysis', 'None.',
    ].join('\n');
    assert.throws(() => PHASE_DEFS[2].validate(short), /too short.*min 40 lines/);
  });
});

describe('Phase 2 — buildBriefing() (BL-002)', () => {
  const briefing = PHASE_DEFS[2].buildBriefing({ dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}' }, feedback: null });

  it('briefing contains ADR format instruction', () => {
    assert.ok(briefing.includes('ADR'), 'briefing must mention ADR');
  });

  it('briefing requires ≥2 options per ADR', () => {
    assert.ok(briefing.includes('≥2 options'), 'briefing must require ≥2 options per ADR');
  });

  it('briefing contains Failure Blast Radius section', () => {
    assert.ok(briefing.toLowerCase().includes('blast radius'), 'briefing must mention failure blast radius');
  });

  it('briefing contains traceability checklist', () => {
    assert.ok(briefing.toLowerCase().includes('traceability'), 'briefing must mention traceability checklist');
  });

  it('briefing contains Human Review checklist', () => {
    assert.ok(briefing.includes('Human Review'), 'briefing must include Human Review section');
  });

  it('Human Review checklist covers no_go_zone and ADR checks', () => {
    const reviewIdx = briefing.indexOf('Human Review');
    const reviewSection = briefing.slice(reviewIdx);
    assert.ok(reviewSection.includes('no_go_zone') && reviewSection.includes('ADR'),
      'Human Review must cover no_go_zone and ADR verification');
  });

  it('[v0.1.28] briefing renders artifact path using artifactsBase when provided', () => {
    const b = PHASE_DEFS[2].buildBriefing({
      dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}' }, feedback: null,
      artifactsBase: '/tmp/test/spec',
    });
    assert.ok(b.includes('/tmp/test/spec/02_SYSTEM_DESIGN.md'), 'artifact path must use artifactsBase/spec');
    assert.ok(!b.includes('/tmp/test/02_SYSTEM_DESIGN.md'), 'artifact path must NOT use bare dir');
  });

  it('[v0.1.28] injects bestPractices content when provided', () => {
    const b = PHASE_DEFS[2].buildBriefing({
      dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}' }, feedback: null,
      bestPractices: 'Separation of concerns: each module has one responsibility',
    });
    assert.ok(b.includes('Separation of concerns'), 'best practices content must appear in briefing');
  });

  it('[v0.1.28] omits best practices block when bestPractices is empty', () => {
    const b = PHASE_DEFS[2].buildBriefing({
      dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}' }, feedback: null,
      bestPractices: '',
    });
    assert.ok(!b.includes('Engineering Standards'), 'Engineering Standards header must not appear when bestPractices is empty');
  });
});
