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
    ].join('\n');
    assert.throws(() => PHASE_DEFS[2].validate(short), /too short.*min 40 lines/);
  });
});
