/**
 * Tests: security threading enforcement (SEC-THREADING-0722, ADR-082)
 *
 * Four surfaces, one SSoT:
 *   - lib/requirements.js — security-NFR predicates + the exclusion idiom
 *     (terminator-hardened: a promise that merely OPENS with "NA…" / "Does not
 *     apply to…" must classify ACTIVE — mis-exclusion silently disables gates,
 *     the unsafe direction).
 *   - phase 1 gate — the security applicability decision is mechanical: no
 *     category:"Security" NFR → complete 1 rejects (root always; feature
 *     increments only when they declare a security-typed FR).
 *   - phase 2 gate — active security NFRs ⇒ `## Security Design` needs a body
 *     (fence-aware; conditional; fails open on unreadable requirements).
 *   - verify nudge — active security NFRs with no security-looking quality_gate
 *     and no technical_debt record → advisory (hasSecurityGate /
 *     hasSecurityDebtEntry heuristics; suppression is the unsafe direction).
 *   - audit.js buildSecurityNfrSummary — refactored onto the SSoT; pins the
 *     deliberate rc.7 behavior change (one malformed NFR entry no longer
 *     nullifies the whole summary).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { securityNfrs, activeSecurityNfrs, isSecurityExclusion, hasSecurityFr } from '../lib/requirements.js';
import phase1 from '../lib/phases/phase1.js';
import phase2 from '../lib/phases/phase2.js';
import { hasSecurityGate, hasSecurityDebtEntry } from '../lib/commands/verify.js';
import { buildSecurityNfrSummary } from '../lib/commands/audit.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const secNfr = (requirement, extra = {}) =>
  ({ id: 'NFR-090', category: 'Security', requirement, ...extra });

/** Minimal requirements JSON that clears every OTHER phase-1 gate (root scope). */
function baseRequirements(overrides = {}) {
  const fr = (n, type) => ({
    id: `FR-00${n}`,
    title: `Persist ledger entry batch ${n}`,
    type,
    priority: 'MUST',
    acceptance_criteria: [
      `saves the record and returns its id within 200ms (case ${n})`,
      `returns a validation error listing the offending field on malformed input (case ${n})`,
    ],
  });
  const frs = [
    fr(1, 'persistence'), fr(2, 'logic'), fr(3, 'reporting'), fr(4, 'persistence'), fr(5, 'logic'),
  ];
  return {
    project_name: 'sec-threading-fixture',
    idea_provenance: {
      problem: 'confirmed', target_user: 'confirmed', core_action: 'confirmed',
      no_go_zone: 'confirmed', technology_preferences: 'confirmed',
    },
    functional_requirements: frs,
    user_stories: frs.map((f, i) => ({
      id: `US-00${i + 1}`, title: `As an operator I complete ${f.title.toLowerCase()}`,
      requirement_id: f.id,
      acceptance_criteria: [
        { id: `AC-00${i + 1}`, given: `a valid input for ${f.id}`, when: 'submitted', then: 'the outcome is stored and listed' },
      ],
    })),
    non_functional_requirements: [
      { id: 'NFR-001', category: 'Performance', requirement: 'List renders under 300ms for 1k rows', acceptance_criteria: 'p95 < 300ms at 1k rows' },
      { id: 'NFR-002', category: 'Observability', requirement: 'Every request logs [timestamp] METHOD /path STATUS to stdout', acceptance_criteria: 'log line present per request' },
      { id: 'NFR-003', category: 'Security', requirement: 'All API endpoints reject unauthenticated requests', acceptance_criteria: 'returns 401 without a valid token' },
    ],
    no_go_zone: ['no multi-tenant support', 'no mobile app', 'no external payment integration'],
    coverage_map: [],
    ...overrides,
  };
}

const validate1 = (d, ctx) => phase1.validate(JSON.stringify(d), ctx);

// ── SSoT predicates ─────────────────────────────────────────────────────────

describe('security-NFR predicates (lib/requirements.js SSoT)', () => {
  it('classifies canonical exclusions in both languages', () => {
    for (const text of [
      'Not applicable: offline single-user tool — no network, no secrets, no PII',
      'not-applicable — CLI with no input surface',
      'N/A',
      'n/a: static site, no user input',
      'Does not apply. Local batch tool.',
      'No aplica: herramienta offline sin datos personales',
    ]) {
      assert.equal(isSecurityExclusion(secNfr(text)), true, `should be exclusion: ${text}`);
    }
  });

  it('terminator hardening: promises that merely OPEN with idiom letters stay ACTIVE', () => {
    for (const text of [
      'NA region access control must restrict reads to the NA tenant', // "NA " + word, no terminator
      'Does not apply to unauthenticated users, all other input is validated server-side',
      'Not applicable requests are rejected with 403 and logged',
      'Natural-language input is sanitized before evaluation',
      // rc.7 adversarial pins: comma and unspaced hyphen are NOT terminators —
      // exclusion-with-exception phrasings and compound words are PROMISES.
      'Not applicable, except the login form which must validate all input',
      'Does not apply, but session cookies must be HttpOnly',
      'NA-region access control must reject cross-region reads',
      'Not-applicable-fields must be encrypted at rest',
    ]) {
      assert.equal(isSecurityExclusion(secNfr(text)), false, `should be ACTIVE: ${text}`);
    }
  });

  it('a whitespace-preceded dash DOES terminate (canonical "Not applicable — reason")', () => {
    assert.equal(isSecurityExclusion(secNfr('Not applicable — kiosk with no network')), true);
    assert.equal(isSecurityExclusion(secNfr('n/a - static site')), true);
  });

  it('strips leading markdown decoration before matching', () => {
    assert.equal(isSecurityExclusion(secNfr('> Not applicable: kiosk with no network')), true);
    assert.equal(isSecurityExclusion(secNfr('- Not applicable: no PII handled')), true);
    // Emphasis WRAPPING the phrase leaves a `**` before the terminator → classifies
    // ACTIVE. Deliberate: mis-active costs a teaching rephrase (safe direction).
    assert.equal(isSecurityExclusion(secNfr('**Not applicable**: kiosk with no network')), false);
  });

  it('non-string fields never throw and degrade safely', () => {
    assert.equal(isSecurityExclusion({ requirement: ['not', 'applicable'] }), false);
    assert.equal(isSecurityExclusion({ requirement: 42 }), false);
    assert.equal(isSecurityExclusion(null), false);
    assert.deepEqual(securityNfrs({ non_functional_requirements: [{ category: 7 }, null] }), []);
  });

  it('securityNfrs matches category case-insensitively; activeSecurityNfrs drops exclusions only', () => {
    const reqs = { non_functional_requirements: [
      secNfr('Not applicable: offline tool', { id: 'NFR-001', category: 'security' }),
      secNfr('Inputs are validated against a whitelist', { id: 'NFR-002', category: 'SECURITY' }),
      { id: 'NFR-003', category: 'Performance', requirement: 'fast' },
    ] };
    assert.equal(securityNfrs(reqs).length, 2);
    assert.deepEqual(activeSecurityNfrs(reqs).map(n => n.id), ['NFR-002']);
  });

  it('hasSecurityFr matches FR type case-insensitively and guards non-strings', () => {
    assert.equal(hasSecurityFr({ functional_requirements: [{ type: 'Security' }] }), true);
    assert.equal(hasSecurityFr({ functional_requirements: [{ type: 'logic' }, { type: 9 }] }), false);
  });
});

// ── Phase 1 gate ────────────────────────────────────────────────────────────

describe('phase 1 — security decision gate', () => {
  it('passes with an active security NFR (base fixture)', () => {
    assert.doesNotThrow(() => validate1(baseRequirements()));
  });

  it('passes with an explicit exclusion NFR — the decision counts either way', () => {
    const d = baseRequirements();
    d.non_functional_requirements[2] = secNfr('Not applicable: offline single-user tool — no network, no secrets, no PII', { id: 'NFR-003' });
    assert.doesNotThrow(() => validate1(d));
  });

  it('rejects a root project with no security-category NFR, with a teaching message', () => {
    const d = baseRequirements();
    d.non_functional_requirements = d.non_functional_requirements.filter(n => n.category !== 'Security');
    d.non_functional_requirements.push({ id: 'NFR-004', category: 'Reliability', requirement: 'Survives restart without data loss', acceptance_criteria: 'restart test passes' });
    assert.throws(() => validate1(d), (e) => {
      assert.match(e.message, /No security decision recorded/);
      assert.match(e.message, /Not applicable:/);          // teaches the exclusion shape
      assert.match(e.message, /complete 1 --check/);       // names the safe probe
      return true;
    });
  });

  it('feature scope without security FRs is exempt', () => {
    const d = baseRequirements();
    d.functional_requirements = d.functional_requirements.slice(0, 2); // feature floor: 2 FR
    d.user_stories = d.user_stories.slice(0, 2);
    d.non_functional_requirements = [
      { id: 'NFR-001', category: 'Performance', requirement: 'List renders under 300ms', acceptance_criteria: 'p95 < 300ms' },
    ];
    d.no_go_zone = ['no schema changes'];
    assert.doesNotThrow(() => validate1(d, { featureRoot: '/tmp/fake-root' }));
  });

  it('feature scope WITH a security-typed FR requires the decision', () => {
    const d = baseRequirements();
    d.functional_requirements = [
      { id: 'FR-001', title: 'Reject expired session tokens on refresh', type: 'security', priority: 'MUST',
        acceptance_criteria: ['returns 401 for an expired token', 'accepts a token within its validity window'] },
      d.functional_requirements[1],
    ];
    d.user_stories = d.user_stories.slice(0, 2);
    d.non_functional_requirements = [
      { id: 'NFR-001', category: 'Performance', requirement: 'List renders under 300ms', acceptance_criteria: 'p95 < 300ms' },
    ];
    d.no_go_zone = ['no schema changes'];
    assert.throws(() => validate1(d, { featureRoot: '/tmp/fake-root' }), /security-typed FR/);
  });
});

// ── Phase 2 gate ────────────────────────────────────────────────────────────

describe('phase 2 — Security Design body gate', () => {
  const design = (securityBody) => [
    '## Executive Summary', 'summary text',
    '## System Architecture', 'arch text',
    '## Data Model', 'data text',
    '## API Design', 'api text',
    '## Implementation Approach', 'impl text',
    '## Security Design', securityBody,
    '## Performance & Scalability', 'perf text',
    '## Deployment Architecture', 'deploy text',
    '## Risk Analysis', 'risk text',
    '## Technical Risk Flags', 'None detected — CRUD app on a mature stack.',
    ...Array(30).fill('filler line to clear the 40-line floor'),
  ].join('\n');

  function ctxWithRequirements(reqs) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-sec-'));
    fs.mkdirSync(path.join(dir, 'aitri', 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'aitri', 'artifacts', '01_REQUIREMENTS.json'), JSON.stringify(reqs));
    return { dir, config: { artifactsDir: 'aitri/artifacts' } };
  }

  it('blocks an empty Security Design when active security NFRs exist — dual-exit message', () => {
    const ctx = ctxWithRequirements(baseRequirements());
    assert.throws(() => phase2.validate(design(''), ctx), (e) => {
      assert.match(e.message, /Security Design is empty/);
      assert.match(e.message, /Not applicable:/);          // teaches the rephrase exit
      assert.match(e.message, /complete 2 --check/);
      return true;
    });
  });

  it('passes an empty Security Design when the only security NFR is an exclusion', () => {
    const reqs = baseRequirements();
    reqs.non_functional_requirements[2] = secNfr('Not applicable: offline tool', { id: 'NFR-003' });
    const ctx = ctxWithRequirements(reqs);
    assert.doesNotThrow(() => phase2.validate(design(''), ctx));
  });

  it('fails open without ctx or with unreadable requirements', () => {
    assert.doesNotThrow(() => phase2.validate(design('')));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-sec-'));
    assert.doesNotThrow(() => phase2.validate(design(''), { dir, config: { artifactsDir: 'aitri/artifacts' } }));
  });

  it('fence-aware: a fenced `## Security Design` example does not donate a body', () => {
    const ctx = ctxWithRequirements(baseRequirements());
    // Real Security Design section is empty; a fenced example inside API Design
    // contains both a fake heading and fake content.
    const content = [
      '## Executive Summary', 'summary',
      '## System Architecture', 'arch',
      '## Data Model', 'data',
      '## API Design',
      '```markdown',
      '## Security Design',
      'this is a fenced EXAMPLE, not the real section',
      '```',
      '## Implementation Approach', 'impl',
      '## Security Design',
      '## Performance & Scalability', 'perf',
      '## Deployment Architecture', 'deploy',
      '## Risk Analysis', 'risk',
      '## Technical Risk Flags', 'None detected — justified.',
      ...Array(30).fill('filler line to clear the 40-line floor'),
    ].join('\n');
    assert.throws(() => phase2.validate(content, ctx), /Security Design is empty/);
  });

  it('fence dialect desync pin: a ~~~ line inside a ``` block is content, not a closer', () => {
    const ctx = ctxWithRequirements(baseRequirements());
    // A ``` block whose CONTENT includes a ~~~ line and a fake `## Security Design`
    // with body. A boolean fence toggle desyncs on the ~~~ and counts the fake
    // section as real; the marker-tracking walker keeps it fenced → gate still fires.
    const content = [
      '## Executive Summary', 'summary',
      '## System Architecture',
      '```',
      '~~~',
      '## Security Design',
      'fenced example body — must NOT count',
      '```',
      '## Data Model', 'data',
      '## API Design', 'api',
      '## Implementation Approach', 'impl',
      '## Security Design',
      '## Performance & Scalability', 'perf',
      '## Deployment Architecture', 'deploy',
      '## Risk Analysis', 'risk',
      '## Technical Risk Flags', 'None detected — justified.',
      ...Array(30).fill('filler line to clear the 40-line floor'),
    ].join('\n');
    assert.throws(() => phase2.validate(content, ctx), /Security Design is empty/);
  });

  it('fence-aware: a fenced fake heading inside the body does not terminate the section', () => {
    const ctx = ctxWithRequirements(baseRequirements());
    const body = ['```', '## Performance & Scalability', 'fenced sample', '```'].join('\n');
    // Body is ONLY a fence containing a fake next-section heading — still a non-empty body.
    assert.doesNotThrow(() => phase2.validate(design(body), ctx));
  });
});

// ── Verify heuristics ───────────────────────────────────────────────────────

describe('verify — security-gate heuristics', () => {
  it('generic tokens match gate NAME only', () => {
    assert.equal(hasSecurityGate([{ name: 'security', command: './checks.sh' }]), true);
    assert.equal(hasSecurityGate([{ name: 'sast', command: 'run-it' }]), true);
    // "security" as a path segment in a lint command must NOT suppress the nudge
    assert.equal(hasSecurityGate([{ name: 'lint', command: 'eslint src/security-rules/' }]), false);
    // rc.7 adversarial pin: bare "audit" is not a name token — a11y/lighthouse audits
    // must not suppress; a real dependency audit is caught by its command signature.
    assert.equal(hasSecurityGate([{ name: 'a11y-audit', command: 'lighthouse --a11y' }]), false);
    assert.equal(hasSecurityGate([{ name: 'audit', command: 'npm audit --audit-level=high' }]), true);
  });

  it('scanner signatures match name or command', () => {
    assert.equal(hasSecurityGate([{ name: 'lint', command: 'semgrep --config auto' }]), true);
    assert.equal(hasSecurityGate([{ name: 'deps', command: 'npm audit --audit-level=high' }]), true);
    assert.equal(hasSecurityGate([{ name: 'gosec', command: 'gosec ./...' }]), true);
    assert.equal(hasSecurityGate([{ name: 'typecheck', command: 'tsc --noEmit' }]), false);
    assert.equal(hasSecurityGate([]), false);
    assert.equal(hasSecurityGate(undefined), false);
  });

  it('hasSecurityDebtEntry: any string field mentioning security counts; SEC-GATE id counts', () => {
    assert.equal(hasSecurityDebtEntry([{ fr_id: 'SEC-GATE', substitution: 'no gate', reason: 'covered by CodeQL in CI', effort_to_fix: 'low' }]), true);
    assert.equal(hasSecurityDebtEntry([{ fr_id: 'FR-004', substitution: 'sqlite for pg', reason: 'no security scanner exists for this stack', effort_to_fix: 'low' }]), true);
    assert.equal(hasSecurityDebtEntry([{ fr_id: 'FR-004', substitution: 'sqlite for pg', reason: 'library conflict', effort_to_fix: 'low' }]), false);
    assert.equal(hasSecurityDebtEntry(undefined), false);
  });
});

// ── audit.js refactor equivalence ───────────────────────────────────────────

describe('buildSecurityNfrSummary on the SSoT', () => {
  function projectWith(nfrs) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-sec-'));
    fs.mkdirSync(path.join(dir, 'aitri', 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'aitri', 'artifacts', '01_REQUIREMENTS.json'),
      JSON.stringify({ non_functional_requirements: nfrs }));
    return dir;
  }
  const cfg = { artifactsDir: 'aitri/artifacts' };

  it('null when no security NFRs / all excluded / artifact missing', () => {
    assert.equal(buildSecurityNfrSummary(projectWith([{ id: 'NFR-001', category: 'Performance', requirement: 'fast' }]), cfg), null);
    assert.equal(buildSecurityNfrSummary(projectWith([secNfr('Not applicable: offline tool')]), cfg), null);
    assert.equal(buildSecurityNfrSummary(fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-sec-')), cfg), null);
  });

  it('summarizes active security NFRs', () => {
    const s = buildSecurityNfrSummary(projectWith([secNfr('All endpoints reject unauthenticated requests')]), cfg);
    assert.match(s, /NFR-090 \[Security\] All endpoints reject/);
  });

  it('rc.7 pin: a null entry no longer nullifies the whole summary', () => {
    // Pre-rc.7 a null entry threw inside the filter (`n.category` on null) and the
    // outer catch returned null — suppressing the resume nudge for the ENTIRE project.
    // (A non-string `requirement` never threw — template-literal coercion — so the
    // null entry is the case that actually changed.)
    const s = buildSecurityNfrSummary(projectWith([
      null,
      secNfr('Inputs validated against a whitelist', { id: 'NFR-002' }),
    ]), cfg);
    assert.notEqual(s, null);
    assert.match(s, /NFR-002/);
  });
});
