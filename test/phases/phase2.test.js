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
  '',
  '## Technical Risk Flags',
  'None detected — Node.js event loop and PostgreSQL connection pooling are compatible with all NFRs.',
  ...Array(10).fill('Additional design content line.'),
].join('\n');

describe('Phase 2 — validate()', () => {

  it('passes with valid artifact', () => {
    assert.doesNotThrow(() => PHASE_DEFS[2].validate(validP2()));
  });

  // The `&`/`and`/`/` connector is tolerated — `Performance and Scalability` must
  // not be a false-reject of the `Performance & Scalability` requirement (Tier-2).
  it('accepts "Performance and Scalability" (and / & / slash connector)', () => {
    for (const variant of ['and', '/', '&']) {
      const content = validP2().replace('## Performance & Scalability', `## Performance ${variant} Scalability`);
      assert.doesNotThrow(() => PHASE_DEFS[2].validate(content), `connector "${variant}" must be accepted`);
    }
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
      '## Technical Risk Flags', 'None detected — stack is compatible.',
    ].join('\n');
    assert.throws(() => PHASE_DEFS[2].validate(short), /too short.*min 40 lines/);
  });

  it('throws when Technical Risk Flags section is missing', () => {
    const content = validP2().replace('## Technical Risk Flags', '## Tech Risks');
    assert.throws(() => PHASE_DEFS[2].validate(content), /missing required sections[\s\S]*## Technical Risk Flags/);
  });

  it('throws when Technical Risk Flags section is empty', () => {
    // Strip everything from the section header to end-of-string, leaving only the header
    const content = validP2().replace(/\n## Technical Risk Flags[\s\S]*$/, '\n## Technical Risk Flags');
    assert.throws(() => PHASE_DEFS[2].validate(content), /Technical Risk Flags is empty/);
  });

  it('passes when Technical Risk Flags contains [RISK] flags', () => {
    const content = validP2().replace(
      'None detected — Node.js event loop and PostgreSQL connection pooling are compatible with all NFRs.',
      '[RISK] High concurrency on single thread\n  Conflict: NFR-001 requires 10k concurrent users, Node.js is single-threaded\n  Mitigation: cluster mode + load balancer\n  Severity: medium'
    );
    assert.doesNotThrow(() => PHASE_DEFS[2].validate(content));
  });

  it('passes when Technical Risk Flags contains explicit None detected justification', () => {
    assert.doesNotThrow(() => PHASE_DEFS[2].validate(validP2()));
  });
});

describe('Phase 2 — buildBriefing() (BL-002)', () => {
  const briefing = PHASE_DEFS[2].buildBriefing({ dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}' }, feedback: null });

  it('briefing contains ADR format instruction', () => {
    assert.ok(briefing.includes('ADR'), 'briefing must mention ADR');
  });

  // rc.45 (ADR-043 #8) — just-in-time constraint confirmation before designing.
  it('briefing has a constraint check (use requirements if stated, confirm if missing)', () => {
    assert.ok(/Constraint check/i.test(briefing), 'must prompt a constraint check before designing');
    assert.ok(/do NOT re-ask/i.test(briefing), 'must say to reuse constraints already in requirements');
    assert.ok(/Tech stack|Budget|Timeline/.test(briefing), 'must list architecture-shaping constraint categories');
  });

  it('briefing requires ≥2 options per ADR', () => {
    assert.ok(briefing.includes('≥2 options'), 'briefing must require ≥2 options per ADR');
  });

  // P2 (rc.10) — architect persona now carries a concrete ❌/✅ ADR few-shot
  it('briefing includes a bad/good ADR example (few-shot)', () => {
    assert.ok(/Bad ADR/i.test(briefing) && /Good ADR/i.test(briefing),
      'architect persona must show a concrete bad-vs-good ADR example');
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

  it('briefing contains Technical Risk Flag Analysis instructions', () => {
    assert.ok(briefing.includes('Technical Risk Flag'), 'briefing must include Technical Risk Flag Analysis section');
  });

  it('briefing lists concrete incompatibility patterns to check', () => {
    assert.ok(briefing.includes('real-time') || briefing.includes('concurrency'), 'briefing must mention concurrency/real-time as a pattern to check');
  });

  it('[v0.1.28] omits best practices block when bestPractices is empty', () => {
    const b = PHASE_DEFS[2].buildBriefing({
      dir: '/tmp/test', inputs: { '01_REQUIREMENTS.json': '{}' }, feedback: null,
      bestPractices: '',
    });
    assert.ok(!b.includes('Engineering Standards'), 'Engineering Standards header must not appear when bestPractices is empty');
  });
});
