/**
 * Module: Command — wizard
 * Purpose: Interactive TTY interview that fills IDEA.md from user answers.
 *          Zero agent involvement — captures requirements directly from the human.
 */

import fs from 'fs';
import path from 'path';

const DEPTHS = ['quick', 'standard', 'deep'];

const QUICK_QUESTIONS = [
  { key: 'problem',    label: 'Problem',               prompt: 'What problem does this solve? Why now?',                     multiLine: false },
  { key: 'users',      label: 'Target Users',           prompt: 'Who are the primary users? Describe their role and context.', multiLine: false },
  { key: 'pain',       label: 'Current Pain / Baseline', prompt: 'How is this solved today? What is the current metric?',      multiLine: false },
  { key: 'rules',      label: 'Business Rules',         prompt: 'Required behaviors (one per line, blank line to finish):',    multiLine: true  },
  { key: 'criteria',   label: 'Success Criteria',       prompt: 'Success criteria — Given/When/Then (one per line):',          multiLine: true  },
  { key: 'outOfScope', label: 'Out of Scope',           prompt: 'What is explicitly out of scope for this version?',           multiLine: false },
];

const STANDARD_QUESTIONS = [
  { key: 'constraints', label: 'Hard Constraints', prompt: 'Hard constraints (budget, legal, tech, deadlines):', multiLine: false },
  { key: 'techStack',   label: 'Tech Stack',        prompt: 'Preferred tech stack? (leave blank = open):',       multiLine: false },
];

const DEEP_QUESTIONS = [
  { key: 'urgency',  label: 'Urgency',    prompt: 'Why must this ship now vs later?',                                   multiLine: false },
  { key: 'noGoZone', label: 'No-Go Zone', prompt: 'What must the system NEVER do?',                                     multiLine: false },
  { key: 'risks',    label: 'Top Risks',  prompt: 'Top 2-3 risks that could kill this (one per line, blank to finish):', multiLine: true  },
];

/** Default synchronous line reader from stdin. */
function makeStdinReadLine() {
  return function readLine(prompt) {
    if (prompt) process.stdout.write(prompt);
    const buf = Buffer.alloc(4096);
    let line = '';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let n;
      try { n = fs.readSync(0, buf, 0, 1, null); } catch { break; }
      if (n === 0) break;
      const char = buf.slice(0, n).toString('utf8');
      if (char === '\n') break;
      if (char === '\r') continue;
      line += char;
    }
    return line.trim();
  };
}

/**
 * Run the interview — exported for testability.
 * @param {Array}    questions - Question definitions
 * @param {Function} readLine  - (prompt: string) => string (sync)
 * @returns {Object} answers keyed by question key
 */
export function collectInterview(questions, readLine) {
  const answers = {};
  for (const q of questions) {
    console.log('');
    if (q.multiLine) {
      console.log(q.prompt + ' (blank line to finish)');
      const lines = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const line = readLine('  > ');
        if (!line) break;
        lines.push(line);
      }
      answers[q.key] = lines;
    } else {
      answers[q.key] = readLine(q.prompt + '\n> ');
    }
  }
  return answers;
}

/**
 * Build IDEA.md content from interview answers — exported for testability.
 */
export function buildIdeaMd(answers, depth = 'quick') {
  const line = (label, value) => {
    if (!value || (Array.isArray(value) && !value.length)) return `## ${label}\n`;
    if (Array.isArray(value)) return `## ${label}\n${value.map(v => `- ${v}`).join('\n')}\n`;
    return `## ${label}\n${value}\n`;
  };

  const sections = [
    '# Project Idea\n',
    line('Problem', answers.problem),
    line('Target Users', answers.users),
    line('Current Pain / Baseline', answers.pain),
    line('Business Rules', answers.rules),
    line('Success Criteria', answers.criteria),
    line('Out of Scope', answers.outOfScope),
  ];

  if (depth !== 'quick') {
    sections.push(line('Hard Constraints', answers.constraints || ''));
    sections.push(line('Tech Stack', answers.techStack || '(open — architect will decide)'));
  }

  if (depth === 'deep') {
    sections.push(line('Urgency', answers.urgency || ''));
    sections.push(line('No-Go Zone', answers.noGoZone || ''));
    sections.push(line('Top Risks', answers.risks));
  }

  return sections.join('\n');
}

/**
 * Build interview context string to inject into discovery briefing.
 * Used by run-phase discovery --guided.
 */
export function buildInterviewContext(answers) {
  const parts = [
    'The following answers were provided directly by the project owner.',
    'Treat them as primary source — do not invent information beyond what is stated here.',
    'Where answers are vague, note the ambiguity in Evidence gaps.',
    '',
  ];

  const add = (label, value) => {
    if (!value || (Array.isArray(value) && !value.length)) return;
    if (Array.isArray(value)) {
      parts.push(`${label}:`);
      value.forEach(v => parts.push(`  - ${v}`));
    } else {
      parts.push(`${label}: ${value}`);
    }
  };

  add('Problem', answers.problem);
  add('Target Users', answers.users);
  add('Current Pain / Baseline', answers.pain);
  add('Business Rules', answers.rules);
  add('Success Criteria', answers.criteria);
  add('Out of Scope', answers.outOfScope);
  add('Hard Constraints', answers.constraints);
  add('Tech Stack preference', answers.techStack);
  add('Urgency', answers.urgency);
  add('No-Go Zone', answers.noGoZone);
  add('Top Risks', answers.risks);

  return parts.join('\n');
}

/**
 * Convenience: run quick interview and return context string for briefing injection.
 * Used by: run-phase discovery --guided
 */
export function runDiscoveryInterview(readLine) {
  const rl = readLine || makeStdinReadLine();
  console.log('\n── Discovery Interview ──────────────────────────────────');
  console.log('Answer each question. Press Enter on a blank line to finish multi-line fields.\n');
  const answers = collectInterview(QUICK_QUESTIONS, rl);
  return buildInterviewContext(answers);
}

export function cmdWizard({ dir, args, flagValue, err, _readLine }) {
  if (!process.stdin.isTTY && !_readLine)
    err('aitri wizard requires an interactive terminal (stdin is not a TTY)');

  const depth = (flagValue && flagValue('--depth')) || args.find(a => !a.startsWith('-')) || 'quick';
  if (!DEPTHS.includes(depth))
    err(`--depth must be one of: ${DEPTHS.join(' | ')}`);

  const ideaPath = path.join(dir, 'IDEA.md');
  const readLine  = _readLine || makeStdinReadLine();

  if (fs.existsSync(ideaPath)) {
    process.stdout.write('\nIDEA.md already exists. Overwrite? (y/N) ');
    const answer = readLine('');
    if (answer.toLowerCase() !== 'y') {
      console.log('Aborted — IDEA.md unchanged.');
      return;
    }
  }

  console.log(`\n── Aitri Wizard (${depth}) ──────────────────────────────`);
  console.log('Answer each question. For multi-line fields, press Enter on a blank line to finish.\n');

  const questions = [
    ...QUICK_QUESTIONS,
    ...(depth !== 'quick' ? STANDARD_QUESTIONS : []),
    ...(depth === 'deep'  ? DEEP_QUESTIONS      : []),
  ];

  const answers = collectInterview(questions, readLine);
  const content = buildIdeaMd(answers, depth);

  fs.writeFileSync(ideaPath, content, 'utf8');

  const lineCount = content.split('\n').length;
  console.log(`\n✅ IDEA.md written (${lineCount} lines)`);
  console.log('   Next: aitri run-phase discovery   or   aitri run-phase 1');
}
