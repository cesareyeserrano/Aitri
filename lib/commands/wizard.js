/**
 * Module: Command — wizard
 * Purpose: Interactive TTY interview that fills IDEA.md from user answers.
 *          Zero agent involvement — captures requirements directly from the human.
 */

import fs from 'fs';
import path from 'path';
import { readStdinSync } from '../read-stdin.js';

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
    let chunk;
    try { chunk = readStdinSync(4096); } catch { return ''; }
    return chunk.replace(/\r?\n$/, '').trim();
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

/**
 * Print a structured briefing for an agent to conduct the wizard interview.
 * Used when stdin is not a TTY (e.g. running inside Claude Code or a pipeline).
 */
function printAgentBriefing(dir, depth) {
  const questions = [
    ...QUICK_QUESTIONS,
    ...(depth !== 'quick' ? STANDARD_QUESTIONS : []),
    ...(depth === 'deep'  ? DEEP_QUESTIONS      : []),
  ];

  const ideaPath = path.join(dir, 'IDEA.md');
  const lines = [
    '── Aitri Wizard — Agent Mode ────────────────────────────────────────',
    'stdin is not a TTY. You are running as an agent.',
    '',
    'INSTRUCTIONS:',
    '1. Ask the user ONE opening question: "Tell me about the project — what problem does it solve and who is it for?"',
    '2. From their answer, infer as many of the required fields below as possible.',
    '3. Only ask follow-up questions for fields that genuinely could NOT be inferred.',
    '4. MUST present the completed IDEA.md draft to the user and ask: "Does this look right? Anything to add or change?" — do NOT write the file without this confirmation.',
    '5. Apply any corrections the user requests, then write IDEA.md to: ' + ideaPath,
    '',
    `DEPTH: ${depth}`,
    '',
    'REQUIRED FIELDS (infer from context whenever possible):',
  ];

  questions.forEach((q, i) => {
    const type = q.multiLine ? '[list]' : '[text]';
    lines.push(`  ${i + 1}. ${q.label} ${type} — ${q.prompt}`);
  });

  lines.push('');
  lines.push('IDEA.md FORMAT:');
  lines.push('─────────────────');
  lines.push('# Project Idea');
  lines.push('');
  questions.forEach(q => {
    lines.push(`## ${q.label}`);
    lines.push(q.multiLine ? '- <item 1>\n- <item 2>' : '<answer>');
    lines.push('');
  });
  lines.push('─────────────────');
  lines.push('');
  lines.push('Once IDEA.md is written, tell the user:');
  lines.push('  Next: aitri run-phase discovery   or   aitri run-phase 1');

  console.log(lines.join('\n'));
}

export function cmdWizard({ dir, args, flagValue, err, _readLine }) {
  const depth = (flagValue && flagValue('--depth')) || args.find(a => !a.startsWith('-')) || 'quick';
  if (!DEPTHS.includes(depth))
    err(`--depth must be one of: ${DEPTHS.join(' | ')}`);

  // Agent mode: no TTY — print briefing for the agent to conduct the interview
  if (!process.stdin.isTTY && !_readLine) {
    printAgentBriefing(dir, depth);
    return;
  }

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
