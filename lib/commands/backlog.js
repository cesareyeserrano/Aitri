/**
 * Module: Command — backlog
 * Purpose: Project-level backlog management stored in spec/BACKLOG.json.
 *
 * Usage:
 *   aitri backlog                              List open backlog items
 *   aitri backlog list [--all]                 List items (open, or all)
 *   aitri backlog add --title "..." --priority P1|P2|P3 --problem "..."
 *                     [--fr FR-001] [--files "..."] [--behavior "..."]
 *                     [--decisions "..."] [--acceptance "..."]   Add an item
 *   aitri backlog show <id>                    Show one item in full detail
 *   aitri backlog note <id> --text "..."       Append a dated entry to the item's log
 *   aitri backlog update <id> [--title|--priority|--problem|--fr|--files|
 *                              --behavior|--decisions|--acceptance "..."]
 *                                              Set fields on an existing item
 *   aitri backlog done <id>                    Mark item as closed
 *
 * Storage: <artifactsDir>/BACKLOG.json  (default: spec/BACKLOG.json)
 */

import fs   from 'node:fs';
import path from 'node:path';
import { loadConfig, atomicWrite } from '../state.js';
import { scopedCmd } from '../scope.js';
import { openWorkByScope } from '../snapshot.js';

const SCHEMA_VERSION = '1';

const USAGE = `Usage:
  aitri backlog                              List open backlog items
  aitri backlog list [--all]                 List backlog items
  aitri backlog add --title "..." --priority P1|P2|P3 --problem "..."
                    [--fr FR-001] [--files "..."] [--behavior "..."]
                    [--decisions "..."] [--acceptance "..."]
  aitri backlog show <id>                    Show one item in full detail
  aitri backlog note <id> --text "..."       Append a dated entry to the item's log
  aitri backlog update <id> [--title|--priority|--problem|--fr|--files|
                             --behavior|--decisions|--acceptance "..."]
  aitri backlog done <id>                    Close an item`;

// Statuses the CLI writes. Anything else is hand-written (FB-BACKLOG-AMEND-0909: with no
// way to change an item, agents edited BACKLOG.json by hand and wrote `done`, which the
// case-folded `!== 'closed'` predicate in list/snapshot/Hub counts as OPEN forever — a
// real project showed 9 open where 4 were). Warn once per file per process, like bug.js.
const KNOWN_STATUSES  = new Set(['open', 'closed']);
const warnedFiles     = new Set();

// Out-of-band malformed marker (B8 parity with bug.js): a Symbol key never reaches
// JSON.stringify, so it cannot leak into the file, and a legitimate top-level "malformed"
// key cannot false-trip the guard. Callers that MUTATE must refuse on it — before this,
// `add` on an unparseable file overwrote it with a one-item list, destroying the record.
const MALFORMED = Symbol('backlog-file-malformed');
export function isMalformedBacklog(data) { return data === null || data === undefined || data[MALFORMED] === true; }

// ── File helpers ──────────────────────────────────────────────────────────────

function backlogPath(dir, config) {
  const adir = config.artifactsDir ?? 'spec';
  return path.join(dir, adir, 'BACKLOG.json');
}

function readBacklog(filePath) {
  if (!fs.existsSync(filePath)) return { schemaVersion: SCHEMA_VERSION, items: [] };
  let data;
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { schemaVersion: SCHEMA_VERSION, items: [], [MALFORMED]: true }; }
  // Shape corruption is the same failure class as syntax corruption (mirrors
  // snapshot.readJsonList): a top-level array/scalar, or an `items` that is present but
  // not an array, must NOT be coerced to [] and written back — that rewrites the file
  // with one item and destroys the record. An absent/null `items` is a legitimate empty
  // list, as it always was.
  if (data === null || typeof data !== 'object' || Array.isArray(data) ||
      (data.items != null && !Array.isArray(data.items)))
    return { schemaVersion: SCHEMA_VERSION, items: [], [MALFORMED]: true };
  if (data.items == null) data.items = [];
  if (!warnedFiles.has(filePath)) {
    const unknown = data.items.filter(i => i?.status && !KNOWN_STATUSES.has(String(i.status).toLowerCase()));
    if (unknown.length) {
      warnedFiles.add(filePath);
      const detail = unknown.slice(0, 5).map(i => `${i.id || '(no id)'}: status="${i.status}"`).join('; ');
      process.stderr.write(
        `[aitri] Warning: ${unknown.length} backlog item(s) in ${path.basename(filePath)} carry an unrecognized status ` +
        `(${detail}) — every status other than "closed" counts as OPEN in list/status/Hub. ` +
        `Close items with \`backlog done <id>\`; grow them with \`backlog note\` / \`backlog update\` — do not hand-edit the file.\n`
      );
    }
  }
  return data;
}

// Single entry for every mutator: read + refuse on a malformed file. Display-only callers
// (list/show) read directly and degrade with a warning instead.
function readForWrite(filePath, err) {
  const data = readBacklog(filePath);
  if (isMalformedBacklog(data))
    err(`${path.basename(filePath)} is not valid JSON or not the expected shape ({ items: [...] }) — refusing to write over it. Fix the file (a merge conflict marker is the usual cause) and retry.`);
  return data;
}

function writeBacklog(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWrite(filePath, JSON.stringify(data, null, 2));
}

function nextId(items) {
  const nums = items
    .map(i => parseInt((i.id ?? '').replace('BL-', ''), 10))
    .filter(n => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `BL-${String(max + 1).padStart(3, '0')}`;
}

function findItem(data, id, err) {
  const item = data.items.find(i => i.id === id);
  if (!item) err(`Item "${id}" not found`);
  return item;
}

const isClosed = (i) => String(i.status).toLowerCase() === 'closed';

// ── Sub-commands ──────────────────────────────────────────────────────────────

function list(dir, config, showAll, featureRoot) {
  const fp   = backlogPath(dir, config);
  const data = readBacklog(fp);
  if (isMalformedBacklog(data)) console.log(`⚠ ${path.basename(fp)} is not valid JSON — showing nothing; fix the file before adding or closing items.`);
  // "Open" = not closed, case-folded — the same predicate the status snapshot
  // aggregates with (FB-SCOPE-BLIND-0724). Filtering on `=== 'open'` made a
  // hand-written status ('deferred', 'Open') count as open in `aitri status`
  // but vanish from this list.
  const items = showAll ? data.items : data.items.filter(i => !isClosed(i));

  const title = `📋 Backlog — ${config.projectName || path.basename(dir)}`;
  console.log(`\n${title}`);
  console.log('─'.repeat(55));

  if (items.length === 0) {
    const msg = showAll ? 'No backlog items.' : 'No open backlog items.';
    console.log(`  ${msg}`);
    // This command reads ONE scope's file — an unqualified empty line at root reads
    // as project-wide emptiness while a feature backlog may hold open items
    // (FB-SCOPE-BLIND-0724). Best-effort hint; degrades silently on unreadable state.
    if (!featureRoot) {
      const cross  = openWorkByScope(dir);
      const others = Object.entries(cross?.backlog || {}).filter(([s, n]) => s !== 'root' && n > 0);
      if (others.length > 0) {
        const nameOf = ([s]) => s.slice('feature:'.length);
        const parts  = others.map(e => `${nameOf(e)} ${e[1]}`).join(' · ');
        const target = others.length === 1 ? nameOf(others[0]) : '<name>';
        console.log(`  (open in features: ${parts} — run: aitri feature backlog ${target})`);
      }
    }
    console.log('─'.repeat(55));
    return;
  }

  const PRIORITY_ORDER = { P1: 0, P2: 1, P3: 2 };
  const sorted = [...items].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 9;
    const pb = PRIORITY_ORDER[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });

  for (const item of sorted) {
    // Tag anything that is not plain 'open' — under --all that is '[closed]'; in the
    // default view it marks hand-written states ('deferred') that count as open but
    // are not, so they stop masquerading as ordinary open items.
    const state  = String(item.status ?? '').toLowerCase();
    const closed = state !== 'open' ? ` [${state || 'no status'}]` : '';
    const fr     = item.fr_id ? ` (${item.fr_id})` : '';
    const notes  = Array.isArray(item.log) && item.log.length ? ` · ${item.log.length} note${item.log.length === 1 ? '' : 's'}` : '';
    console.log(`  ${item.priority}  ${item.id}  ${item.title}${fr}${closed}${notes}`);
    if (item.problem) {
      const trimmed = item.problem.length > 80 ? item.problem.slice(0, 77) + '…' : item.problem;
      console.log(`         ${trimmed}`);
    }
  }

  const open   = data.items.filter(i => !isClosed(i)).length;
  const closed = data.items.length - open;
  console.log('─'.repeat(55));
  console.log(`  ${open} open · ${closed} closed`);
}

const VALID_PRIORITIES = ['P1', 'P2', 'P3'];
function checkPriority(priority, err) {
  if (!VALID_PRIORITIES.includes(String(priority).toUpperCase()))
    err(`Invalid priority "${priority}" — must be P1, P2, or P3`);
  return String(priority).toUpperCase();
}

function add(dir, config, flagValue, err) {
  const title    = flagValue('--title');
  const priority = flagValue('--priority');
  const problem  = flagValue('--problem');
  const frId     = flagValue('--fr');
  // Optional Entry-Standard detail — additive. Lets an item be self-contained
  // (implementable later without re-deriving context), the same richness the
  // BACKLOG.md scaffold teaches, captured on the structured item.
  const files      = flagValue('--files');
  const behavior   = flagValue('--behavior');
  const decisions  = flagValue('--decisions');
  const acceptance = flagValue('--acceptance');

  if (!title)    err('--title is required');
  if (!priority) err('--priority is required (P1, P2, or P3)');
  if (!problem)  err('--problem is required');

  const fp   = backlogPath(dir, config);
  const data = readForWrite(fp, err);
  const id   = nextId(data.items);

  const item = {
    id,
    title,
    priority:  checkPriority(priority, err),
    problem,
    status:    'open',
    createdAt: new Date().toISOString(),
  };
  if (frId)       item.fr_id      = frId;
  if (files)      item.files      = files;
  if (behavior)   item.behavior   = behavior;
  if (decisions)  item.decisions  = decisions;
  if (acceptance) item.acceptance = acceptance;

  data.items.push(item);
  writeBacklog(fp, data);

  console.log(`✅ Added ${id}: ${title}`);
}

function show(dir, config, id, err, backlogCmd = 'aitri backlog') {
  if (!id) err(`Provide an item ID — e.g.: ${backlogCmd} show BL-001`);

  const fp   = backlogPath(dir, config);
  const data = readBacklog(fp);
  if (isMalformedBacklog(data)) err(`${path.basename(fp)} is not valid JSON — fix the file (a merge conflict marker is the usual cause) and retry.`);
  const item = findItem(data, id, err);

  const fr = item.fr_id ? ` (${item.fr_id})` : '';
  console.log(`\n${item.priority}  ${item.id}  ${item.title}${fr}  [${item.status}]`);
  console.log('─'.repeat(55));
  const field = (label, val) => { if (val) console.log(`  ${label}: ${val}`); };
  field('Problem',    item.problem);
  field('Files',      item.files);
  field('Behavior',   item.behavior);
  field('Decisions',  item.decisions);
  field('Acceptance', item.acceptance);
  // The log is printed in file order, not re-sorted by date: a merge or hand edit that
  // reorders entries stays visible rather than being silently tidied.
  if (Array.isArray(item.log) && item.log.length) {
    console.log(`  Log (${item.log.length}):`);
    for (const e of item.log) console.log(`    ${e?.at ?? '(no date)'}  ${e?.text ?? ''}`);
  }
  console.log('─'.repeat(55));
  const stamps = [`created ${item.createdAt}`];
  if (item.updatedAt) stamps.push(`updated ${item.updatedAt}`);
  if (item.closedAt)  stamps.push(`closed ${item.closedAt}`);
  console.log(`  ${stamps.join(' · ')}`);
}

// FB-BACKLOG-AMEND-0909: an item stops being immutable after creation. `note` is the
// append-only journal ("accumulate" — the analysis that grows across sessions); `update`
// sets the Entry-Standard fields the BACKLOG.md scaffold says must be expanded before
// scheduling. Both are allowed on closed items (a post-mortem note is legitimate); the
// lifecycle itself stays in `done` — `update` never takes --status.
// A backlog item reaches NO briefing: no phase or audit prompt reads BACKLOG.json (the audit
// prompt only suggests `backlog add`). The log retains intent; carrying it into a feature
// seed (FEATURE_IDEA.md) is the agent's job.
function note(dir, config, id, flagValue, err, backlogCmd = 'aitri backlog') {
  if (!id) err(`Provide an item ID — e.g.: ${backlogCmd} note BL-001 --text "..."`);
  const text = flagValue('--text');
  if (!text || !String(text).trim()) err(`--text is required — e.g.: ${backlogCmd} note ${id} --text "what was learned"`);

  const fp   = backlogPath(dir, config);
  const data = readForWrite(fp, err);
  const item = findItem(data, id, err);

  if (item.log != null && !Array.isArray(item.log))
    err(`${id}.log is not an array (hand-edited?) — refusing to overwrite it. Make it a list of { at, text } entries and retry.`);
  if (!Array.isArray(item.log)) item.log = [];
  const at = new Date().toISOString();
  item.log.push({ at, text: String(text) });
  item.updatedAt = at;
  writeBacklog(fp, data);

  console.log(`✅ ${id}: note #${item.log.length} added`);
}

const UPDATE_FIELDS = {
  '--title':      'title',
  '--priority':   'priority',
  '--problem':    'problem',
  '--fr':         'fr_id',
  '--files':      'files',
  '--behavior':   'behavior',
  '--decisions':  'decisions',
  '--acceptance': 'acceptance',
};

function update(dir, config, id, args, flagValue, err, backlogCmd = 'aitri backlog') {
  if (!id) err(`Provide an item ID — e.g.: ${backlogCmd} update BL-001 --priority P1`);
  if (args.includes('--status'))
    err(`--status is not an update field — the lifecycle is \`${backlogCmd} done <id>\` (open → closed).`);

  const changes = {};
  for (const [flag, field] of Object.entries(UPDATE_FIELDS)) {
    if (!args.includes(flag)) continue;
    const val = flagValue(flag);
    if (val === null || val === undefined || !String(val).trim()) err(`${flag} needs a value`);
    changes[field] = field === 'priority' ? checkPriority(val, err) : String(val);
  }
  if (Object.keys(changes).length === 0)
    err(`Nothing to update — pass at least one of: ${Object.keys(UPDATE_FIELDS).join(' ')}`);

  const fp   = backlogPath(dir, config);
  const data = readForWrite(fp, err);
  const item = findItem(data, id, err);

  Object.assign(item, changes);
  item.updatedAt = new Date().toISOString();
  writeBacklog(fp, data);

  console.log(`✅ ${id}: updated ${Object.keys(changes).join(', ')}`);
}

function done(dir, config, id, err, backlogCmd = 'aitri backlog') {
  if (!id) err(`Provide an item ID — e.g.: ${backlogCmd} done BL-001`);

  const fp   = backlogPath(dir, config);
  const data = readForWrite(fp, err);
  const item = findItem(data, id, err);

  // Case-folded like every reader — a hand-written "Closed" was re-stamped here.
  if (isClosed(item)) {
    console.log(`  ${id} is already closed.`);
    return;
  }

  item.status   = 'closed';
  item.closedAt = new Date().toISOString();
  writeBacklog(fp, data);

  console.log(`✅ Closed ${id}: ${item.title}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function cmdBacklog({ dir, args, flagValue, err, featureRoot, scopeName }) {
  const config = loadConfig(dir);

  if (!config || !config.projectName) {
    err('No Aitri project found. Run: aitri init');
  }

  // Scope-aware hints (FEAT-PARITY-0620 part 2): `aitri backlog …` at root,
  // `aitri feature backlog <name> …` in feature scope. The USAGE dump is scoped by
  // rewriting its `aitri backlog` prefixes (each becomes `aitri feature backlog <name>`).
  const backlogCmd = scopedCmd(featureRoot, scopeName, 'backlog');
  const usage = featureRoot ? USAGE.replaceAll('aitri backlog', backlogCmd) : USAGE;

  const [sub, ...rest] = args;

  // aitri backlog [list] [--all]
  if (!sub || sub === 'list' || sub === '--all') {
    const showAll = args.includes('--all');
    return list(dir, config, showAll, featureRoot);
  }

  if (sub === 'add')    return add(dir, config, flagValue, err);

  if (sub === 'show')   return show(dir, config, rest[0], err, backlogCmd);

  if (sub === 'note')   return note(dir, config, rest[0], flagValue, err, backlogCmd);

  if (sub === 'update') return update(dir, config, rest[0], args, flagValue, err, backlogCmd);

  if (sub === 'done')   return done(dir, config, rest[0], err, backlogCmd);

  err(usage);
}

// openBacklogCount was removed in FB-SCOPE-BLIND-0724: status.js reads the snapshot's
// cross-scope aggregation (aggregateBacklog), and this helper's `=== 'open'` predicate
// had drifted from the snapshot's `!== 'closed'` — a third, divergent definition of
// "open" with no remaining consumer.
