/**
 * Tests: aitri help — two-level usage output (UX-PRO-0707 2.2)
 * Covers: short overview (default), full reference (--all), per-command help, phases.
 * The bare `help` is a SHORT overview; the full command surface lives under `--all`;
 * `help <command>` prints just that command's section.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cmdHelp } from '../../lib/commands/help.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureLog(fn) {
  const lines = [];
  const orig = console.log.bind(console);
  console.log = (...a) => lines.push(a.join(' '));
  try { fn(); } finally { console.log = orig; }
  return lines.join('\n');
}

const short = ()      => captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
const full  = ()      => captureLog(() => cmdHelp({ VERSION: '0.1.70', args: ['--all'] }));
const topic = (name)  => captureLog(() => cmdHelp({ VERSION: '0.1.70', args: [name] }));

// ── Short overview (the default) ───────────────────────────────────────────────

describe('cmdHelp() — short overview (default)', () => {
  it('includes version', () => {
    assert.ok(short().includes('0.1.70'), 'version must appear');
  });

  it('includes the core loop commands', () => {
    const commands = ['init', 'run-phase', 'complete', 'approve', 'reject', 'status', 'resume'];
    const out = short();
    for (const cmd of commands) assert.ok(out.includes(cmd), `command '${cmd}' must appear in the overview`);
  });

  it('maps artifacts to industry-standard terms, by full document-type name', () => {
    const out = short();
    assert.ok(out.includes('Product Requirements Document (PRD'), 'requirements PRD/SRS name');
    assert.ok(out.includes('Technical Design Document (TRD'), 'system design TRD/SDD name');
    assert.ok(out.includes('Traceability / Compliance Report'), '05_TRACEABILITY industry term');
  });

  it('includes phase names with aliases', () => {
    const out = short();
    for (const p of ['requirements', 'architecture', 'tests', 'build', 'deploy']) {
      assert.ok(out.includes(p), `phase '${p}' must appear`);
    }
  });

  it('includes optional phases', () => {
    const out = short();
    assert.ok(out.includes('discovery') && out.includes('ux') && out.includes('review'));
  });

  it('includes setup (adopt/wizard)', () => {
    const out = short();
    assert.ok(out.includes('adopt scan') && out.includes('wizard'));
  });

  it('points at the full reference and per-command help', () => {
    const out = short();
    assert.match(out, /aitri help --all/, 'must point at --all');
    assert.match(out, /aitri help <command>/, 'must point at per-command help');
  });

  it('does NOT dump the full reference sections by default', () => {
    const out = short();
    assert.doesNotMatch(out, /TRACKING/, 'tracking section is --all only');
    assert.doesNotMatch(out, /INTERACTIVE vs AGENT MODE/, 'agent-mode section is --all only');
  });
});

// ── Full reference (--all) ─────────────────────────────────────────────────────

describe('cmdHelp() — full reference (--all)', () => {
  it('is a superset: contains everything the short form omits', () => {
    const out = full();
    for (const s of ['verify-run', 'verify-complete', 'bug list', 'bug add', 'bug fix',
                     'backlog', 'feature init', 'feature run-phase', 'TRACKING',
                     'INTERACTIVE vs AGENT MODE']) {
      assert.ok(out.includes(s), `--all must include '${s}'`);
    }
  });

  it('includes checkpoint flags', () => {
    const out = full();
    assert.ok(out.includes('--context') && out.includes('--name') && out.includes('--list'));
  });

  it('mentions supported agents', () => {
    const out = full();
    assert.ok(out.includes('Claude Code') && out.includes('Codex') && out.includes('Gemini'));
  });

  it('is longer than the short overview', () => {
    assert.ok(full().length > short().length, '--all must be a superset of the short form');
  });
});

// ── Per-command help (help <command>) ──────────────────────────────────────────

describe('cmdHelp() — per-command (help <command>)', () => {
  it('help init prints the SETUP section and differs from the overview', () => {
    const out = topic('init');
    assert.ok(out.includes('SETUP') && out.includes('aitri wizard'), 'shows the setup section');
    assert.notEqual(out, short(), 'per-command help differs from the overview');
    assert.doesNotMatch(out, /TESTING GATE/, 'scoped to the command\'s section, not the whole reference');
  });

  it('help verify-run routes to the TESTING GATE section', () => {
    assert.match(topic('verify-run'), /TESTING GATE/);
  });

  it('help feature routes to the FEATURES section', () => {
    assert.match(topic('feature'), /FEATURES/);
  });

  it('help review routes to a real section (not the unknown fallback)', () => {
    // review is a first-class command documented in the PIPELINE section — it must
    // not be treated as an unknown topic (adversarial finding, UX-PRO-0707 2.2).
    const out = topic('review');
    assert.doesNotMatch(out, /No dedicated help/, 'review is a known command');
    assert.match(out, /PIPELINE/, 'routes to the pipeline section that documents review');
  });

  it('help help shows the overview, not the unknown-topic note (UX-PRO-0707 follow-up)', () => {
    // help is a real command; its own usage IS the overview's "More:" block.
    const out = topic('help');
    assert.doesNotMatch(out, /No dedicated help/, 'help is a known command');
    assert.match(out, /aitri help --all/, 'shows how to use help itself');
  });

  it('help <unknown> falls back to the overview with a note', () => {
    const out = topic('frobnicate');
    assert.match(out, /No dedicated help for "frobnicate"/);
    assert.match(out, /aitri help --all/);
  });
});
