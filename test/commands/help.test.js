/**
 * Tests: aitri help — usage output
 * Covers: key commands present, version displayed, phases listed
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cmdHelp() — output content', () => {
  let output;

  it('includes version', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    assert.ok(output.includes('0.1.70'), 'version must appear in output');
  });

  it('includes core commands', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    const commands = ['init', 'run-phase', 'complete', 'approve', 'reject', 'status', 'validate', 'resume', 'checkpoint'];
    for (const cmd of commands) {
      assert.ok(output.includes(cmd), `command '${cmd}' must appear in help`);
    }
  });

  it('includes verify commands', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    assert.ok(output.includes('verify-run'), 'verify-run must appear');
    assert.ok(output.includes('verify-complete'), 'verify-complete must appear');
  });

  it('includes bug commands', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    assert.ok(output.includes('bug list'), 'bug list must appear');
    assert.ok(output.includes('bug add'), 'bug add must appear');
    assert.ok(output.includes('bug fix'), 'bug fix must appear');
  });

  it('includes backlog commands', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    assert.ok(output.includes('backlog'), 'backlog must appear');
  });

  it('includes adopt commands', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    assert.ok(output.includes('adopt scan'), 'adopt scan must appear');
    assert.ok(output.includes('adopt apply'), 'adopt apply must appear');
    assert.ok(output.includes('adopt --upgrade'), 'adopt --upgrade must appear');
  });

  it('includes wizard command', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    assert.ok(output.includes('wizard'), 'wizard must appear');
  });

  it('includes phase names with aliases', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    const phases = ['requirements', 'architecture', 'tests', 'build', 'deploy'];
    for (const p of phases) {
      assert.ok(output.includes(p), `phase '${p}' must appear in help`);
    }
  });

  it('includes optional phases', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    assert.ok(output.includes('discovery'), 'discovery must appear');
    assert.ok(output.includes('ux'), 'ux must appear');
    assert.ok(output.includes('review'), 'review must appear');
  });

  it('includes feature workflow', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    assert.ok(output.includes('feature init'), 'feature init must appear');
    assert.ok(output.includes('feature run-phase'), 'feature run-phase must appear');
  });

  it('includes checkpoint flags', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    assert.ok(output.includes('--context'), 'checkpoint --context must appear');
    assert.ok(output.includes('--name'), 'checkpoint --name must appear');
    assert.ok(output.includes('--list'), 'checkpoint --list must appear');
  });

  it('mentions supported agents', () => {
    output = captureLog(() => cmdHelp({ VERSION: '0.1.70' }));
    assert.ok(output.includes('Claude Code'), 'Claude Code must be mentioned');
    assert.ok(output.includes('Codex'), 'Codex must be mentioned');
    assert.ok(output.includes('Gemini'), 'Gemini must be mentioned');
  });
});
