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
  aitri backlog done <id>                    Close an item`;

// ── File helpers ──────────────────────────────────────────────────────────────

function backlogPath(dir, config) {
  const adir = config.artifactsDir ?? 'spec';
  return path.join(dir, adir, 'BACKLOG.json');
}

function readBacklog(filePath) {
  if (!fs.existsSync(filePath)) return { schemaVersion: SCHEMA_VERSION, items: [] };
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { schemaVersion: SCHEMA_VERSION, items: [] };
  }
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

// ── Sub-commands ──────────────────────────────────────────────────────────────

function list(dir, config, showAll, featureRoot) {
  const fp   = backlogPath(dir, config);
  const data = readBacklog(fp);
  // "Open" = not closed, case-folded — the same predicate the status snapshot
  // aggregates with (FB-SCOPE-BLIND-0724). Filtering on `=== 'open'` made a
  // hand-written status ('deferred', 'Open') count as open in `aitri status`
  // but vanish from this list.
  const isClosed = (i) => String(i.status).toLowerCase() === 'closed';
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
    console.log(`  ${item.priority}  ${item.id}  ${item.title}${fr}${closed}`);
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

  const validPriorities = ['P1', 'P2', 'P3'];
  if (!validPriorities.includes(priority.toUpperCase())) {
    err(`Invalid priority "${priority}" — must be P1, P2, or P3`);
  }

  const fp   = backlogPath(dir, config);
  const data = readBacklog(fp);
  const id   = nextId(data.items);

  const item = {
    id,
    title,
    priority:  priority.toUpperCase(),
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
  const item = data.items.find(i => i.id === id);
  if (!item) err(`Item "${id}" not found`);

  const fr = item.fr_id ? ` (${item.fr_id})` : '';
  console.log(`\n${item.priority}  ${item.id}  ${item.title}${fr}  [${item.status}]`);
  console.log('─'.repeat(55));
  const field = (label, val) => { if (val) console.log(`  ${label}: ${val}`); };
  field('Problem',    item.problem);
  field('Files',      item.files);
  field('Behavior',   item.behavior);
  field('Decisions',  item.decisions);
  field('Acceptance', item.acceptance);
  console.log('─'.repeat(55));
  console.log(`  created ${item.createdAt}${item.closedAt ? ` · closed ${item.closedAt}` : ''}`);
}

function done(dir, config, id, err, backlogCmd = 'aitri backlog') {
  if (!id) err(`Provide an item ID — e.g.: ${backlogCmd} done BL-001`);

  const fp   = backlogPath(dir, config);
  const data = readBacklog(fp);
  const item = data.items.find(i => i.id === id);

  if (!item)              err(`Item "${id}" not found`);
  if (item.status === 'closed') {
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

  if (sub === 'add') return add(dir, config, flagValue, err);

  if (sub === 'show') return show(dir, config, rest[0], err, backlogCmd);

  if (sub === 'done') return done(dir, config, rest[0], err, backlogCmd);

  err(usage);
}

// openBacklogCount was removed in FB-SCOPE-BLIND-0724: status.js reads the snapshot's
// cross-scope aggregation (aggregateBacklog), and this helper's `=== 'open'` predicate
// had drifted from the snapshot's `!== 'closed'` — a third, divergent definition of
// "open" with no remaining consumer.
