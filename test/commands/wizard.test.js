/**
 * Tests: aitri wizard + run-phase discovery --guided
 * Covers: collectInterview, buildIdeaMd, buildInterviewContext, cmdWizard, --guided injection
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  collectInterview,
  buildIdeaMd,
  buildInterviewContext,
  runDiscoveryInterview,
  cmdWizard,
} from '../../lib/commands/wizard.js';
import { cmdRunPhase } from '../../lib/commands/run-phase.js';
import { cmdInit } from '../../lib/commands/init.js';

const ROOT_DIR = path.resolve(process.cwd());

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-wizard-'));
}

function captureLog(fn) {
  const lines = [];
  const orig = console.log.bind(console);
  console.log = (...a) => lines.push(a.join(' '));
  try { fn(); } finally { console.log = orig; }
  return lines.join('\n');
}

function captureStdout(fn) {
  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try { fn(); } finally { process.stdout.write = orig; }
  return out;
}

function makeErr() {
  const thrown = [];
  return { fn: (msg) => { thrown.push(msg); throw new Error(msg); }, thrown };
}

// Mock readLine that returns preset answers in order
function makeMockReadLine(answers) {
  let i = 0;
  return (_prompt) => {
    const a = answers[i] ?? '';
    i++;
    return a;
  };
}

// ── collectInterview ──────────────────────────────────────────────────────────

describe('collectInterview()', () => {
  it('collects single-line answers', () => {
    const questions = [
      { key: 'q1', label: 'Q1', prompt: 'First?',  multiLine: false },
      { key: 'q2', label: 'Q2', prompt: 'Second?', multiLine: false },
    ];
    const rl = makeMockReadLine(['Answer one', 'Answer two']);
    const answers = collectInterview(questions, rl);
    assert.equal(answers.q1, 'Answer one');
    assert.equal(answers.q2, 'Answer two');
  });

  it('collects multi-line answers (blank line terminates)', () => {
    const questions = [
      { key: 'rules', label: 'Rules', prompt: 'Rules:', multiLine: true },
    ];
    // blank line ends multi-line input
    const rl = makeMockReadLine(['Rule A', 'Rule B', '']);
    const answers = collectInterview(questions, rl);
    assert.deepEqual(answers.rules, ['Rule A', 'Rule B']);
  });

  it('returns empty array for multi-line with immediate blank', () => {
    const questions = [{ key: 'rules', label: 'Rules', prompt: 'Rules:', multiLine: true }];
    const rl = makeMockReadLine(['']);
    const answers = collectInterview(questions, rl);
    assert.deepEqual(answers.rules, []);
  });
});

// ── buildIdeaMd ───────────────────────────────────────────────────────────────

describe('buildIdeaMd()', () => {
  const baseAnswers = {
    problem: 'Users lose invoices',
    users: 'Freelancers, non-technical',
    pain: 'Manual spreadsheets',
    rules: ['System must send reminders', 'System must track payments'],
    criteria: ['User creates invoice in < 2 min'],
    outOfScope: 'No payroll',
  };

  it('produces markdown with all required sections', () => {
    const md = buildIdeaMd(baseAnswers, 'quick');
    assert.ok(md.includes('## Problem'), 'Problem section required');
    assert.ok(md.includes('## Target Users'), 'Target Users section required');
    assert.ok(md.includes('## Business Rules'), 'Business Rules section required');
    assert.ok(md.includes('## Success Criteria'), 'Success Criteria section required');
    assert.ok(md.includes('## Out of Scope'), 'Out of Scope section required');
  });

  it('inlines single-line answer values', () => {
    const md = buildIdeaMd(baseAnswers, 'quick');
    assert.ok(md.includes('Users lose invoices'));
    assert.ok(md.includes('Freelancers, non-technical'));
  });

  it('renders multi-line answers as bullet list', () => {
    const md = buildIdeaMd(baseAnswers, 'quick');
    assert.ok(md.includes('- System must send reminders'));
    assert.ok(md.includes('- System must track payments'));
  });

  it('standard depth adds Hard Constraints and Tech Stack', () => {
    const md = buildIdeaMd({ ...baseAnswers, constraints: 'GDPR compliant', techStack: 'Node.js' }, 'standard');
    assert.ok(md.includes('## Hard Constraints'));
    assert.ok(md.includes('GDPR compliant'));
    assert.ok(md.includes('## Tech Stack'));
    assert.ok(md.includes('Node.js'));
  });

  it('quick depth does NOT include Hard Constraints', () => {
    const md = buildIdeaMd(baseAnswers, 'quick');
    assert.ok(!md.includes('## Hard Constraints'));
  });

  it('deep depth adds Urgency, No-Go Zone, Top Risks', () => {
    const md = buildIdeaMd({ ...baseAnswers, urgency: 'Q1 deadline', noGoZone: 'No payments', risks: ['Budget risk'] }, 'deep');
    assert.ok(md.includes('## Urgency'));
    assert.ok(md.includes('## No-Go Zone'));
    assert.ok(md.includes('## Top Risks'));
  });
});

// ── buildInterviewContext ─────────────────────────────────────────────────────

describe('buildInterviewContext()', () => {
  it('includes all provided answers', () => {
    const ctx = buildInterviewContext({
      problem: 'Cash flow issues',
      users: 'Freelancers',
      rules: ['Must send reminders'],
    });
    assert.ok(ctx.includes('Cash flow issues'), 'problem must appear');
    assert.ok(ctx.includes('Freelancers'), 'users must appear');
    assert.ok(ctx.includes('Must send reminders'), 'rules must appear');
  });

  it('skips empty fields', () => {
    const ctx = buildInterviewContext({ problem: 'Some problem', users: '', techStack: undefined });
    assert.ok(ctx.includes('Some problem'));
    assert.ok(!ctx.includes('undefined'));
    assert.ok(!ctx.includes('Target Users: '));
  });

  it('renders multi-line fields as bullet list', () => {
    const ctx = buildInterviewContext({ risks: ['Risk A', 'Risk B'] });
    assert.ok(ctx.includes('  - Risk A'));
    assert.ok(ctx.includes('  - Risk B'));
  });
});

// ── runDiscoveryInterview ─────────────────────────────────────────────────────

describe('runDiscoveryInterview()', () => {
  it('returns interview context string from mock answers', () => {
    // quick questions: problem, users, pain, rules(multi), criteria(multi), outOfScope
    const rl = makeMockReadLine([
      'Users lose invoices',   // problem
      'Freelancers',            // users
      'Manual spreadsheets',    // pain
      'Must send reminders', '', // rules + blank
      'Invoice in 2 min', '',    // criteria + blank
      'No payroll',             // outOfScope
    ]);
    const ctx = runDiscoveryInterview(rl);
    assert.ok(ctx.includes('Users lose invoices'), 'problem in context');
    assert.ok(ctx.includes('Freelancers'), 'users in context');
    assert.ok(ctx.includes('Must send reminders'), 'rules in context');
  });
});

// ── cmdWizard ─────────────────────────────────────────────────────────────────

describe('cmdWizard()', () => {
  it('throws when stdin is not TTY and no _readLine injected', () => {
    const dir = tmpDir();
    const origIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    const e = makeErr();
    try {
      assert.throws(
        () => cmdWizard({ dir, args: [], flagValue: () => null, err: e.fn }),
        /interactive terminal/
      );
    } finally { process.stdin.isTTY = origIsTTY; }
  });

  it('creates IDEA.md with answers from mock readLine', () => {
    const dir = tmpDir(); // no cmdInit — IDEA.md does not exist yet

    const rl = makeMockReadLine([
      'Users lose invoices',    // problem
      'Freelancers',            // users
      'Manual spreadsheets',    // pain
      'Must send reminders', '', // rules
      'Invoice in 2 min', '',    // criteria
      'No payroll',             // outOfScope
    ]);

    cmdWizard({ dir, args: [], flagValue: () => null, err: makeErr().fn, _readLine: rl });

    assert.ok(fs.existsSync(path.join(dir, 'IDEA.md')));
    const idea = fs.readFileSync(path.join(dir, 'IDEA.md'), 'utf8');
    assert.ok(idea.includes('Users lose invoices'));
    assert.ok(idea.includes('Must send reminders'));
  });

  it('aborts when IDEA.md exists and user declines overwrite', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Original');

    const rl = makeMockReadLine(['n']); // decline overwrite
    cmdWizard({ dir, args: [], flagValue: () => null, err: makeErr().fn, _readLine: rl });

    const idea = fs.readFileSync(path.join(dir, 'IDEA.md'), 'utf8');
    assert.equal(idea, '# Original');
  });

  it('overwrites IDEA.md when user confirms', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Old content');

    const rl = makeMockReadLine([
      'y',                     // confirm overwrite
      'Invoice problem',       // problem
      'Freelancers',           // users
      'Manual work',           // pain
      'Rule A', '',            // rules
      'Criterion A', '',       // criteria
      'No payroll',            // outOfScope
    ]);

    cmdWizard({ dir, args: [], flagValue: () => null, err: makeErr().fn, _readLine: rl });

    const idea = fs.readFileSync(path.join(dir, 'IDEA.md'), 'utf8');
    assert.ok(idea.includes('Invoice problem'), 'must contain new content');
    assert.ok(!idea.includes('Old content'), 'must not contain old content');
  });

  it('errors on invalid --depth value', () => {
    const dir = tmpDir();
    const e = makeErr();
    assert.throws(
      () => cmdWizard({ dir, args: [], flagValue: () => 'turbo', err: e.fn, _readLine: () => '' }),
      /--depth must be one of/
    );
  });

  it('standard depth includes constraints and tech stack sections', () => {
    const dir = tmpDir();
    const rl = makeMockReadLine([
      'Problem',         // problem
      'Users',           // users
      'Pain',            // pain
      'Rule', '',        // rules
      'Criterion', '',   // criteria
      'Out of scope',    // outOfScope
      'GDPR',            // constraints (standard)
      'Node.js',         // techStack (standard)
    ]);

    cmdWizard({ dir, args: [], flagValue: (f) => f === '--depth' ? 'standard' : null, err: makeErr().fn, _readLine: rl });

    const idea = fs.readFileSync(path.join(dir, 'IDEA.md'), 'utf8');
    assert.ok(idea.includes('## Hard Constraints'));
    assert.ok(idea.includes('GDPR'));
  });
});

// ── run-phase discovery --guided ──────────────────────────────────────────────

describe('run-phase discovery --guided', () => {
  it('injects interview context into discovery briefing', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.36' });
    fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Idea\nA tool for freelancers.');

    const rl = makeMockReadLine([
      'Invoice tracking problem',  // problem
      'Freelancers aged 25-45',    // users
      'Manual spreadsheets',       // pain
      'System must remind', '',    // rules
      'Invoice in 2 min', '',      // criteria
      'No payroll',                // outOfScope
    ]);

    const out = captureStdout(() =>
      cmdRunPhase({
        dir, args: ['discovery', '--guided'], flagValue: () => null,
        err: makeErr().fn, rootDir: ROOT_DIR, _readLine: rl,
      })
    );

    assert.ok(out.includes('Invoice tracking problem'), 'problem must appear in briefing');
    assert.ok(out.includes('Freelancers aged 25-45'), 'users must appear in briefing');
    assert.ok(out.includes('Interview Context'), 'Interview Context section must be present');
  });

  it('--guided on non-discovery phase is silently ignored', () => {
    const dir = tmpDir();
    cmdInit({ dir, rootDir: ROOT_DIR, VERSION: '0.1.36' });
    fs.writeFileSync(path.join(dir, 'IDEA.md'), '# Idea\n' + 'A tool.\n'.repeat(20));

    // Phase 1 with --guided: no interview, no error
    assert.doesNotThrow(() =>
      captureStdout(() =>
        cmdRunPhase({
          dir, args: ['1', '--guided'], flagValue: () => null,
          err: makeErr().fn, rootDir: ROOT_DIR, _readLine: () => '',
        })
      )
    );
  });
});
