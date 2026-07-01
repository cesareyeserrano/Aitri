/**
 * Module: Phase 1 — PM Analysis
 * Purpose: Product Manager persona. Extracts structured requirements.
 *          First run reads IDEA.md (the seed brief). Re-runs read the
 *          existing 01_REQUIREMENTS.json — that artifact is the SSoT once
 *          it exists, which removes IDEA.md drift on re-runs.
 *          IDEA.md content is archived into 01_REQUIREMENTS.json.original_brief
 *          at first approve (handled by approve.js) and the file is removed.
 * Artifact: 01_REQUIREMENTS.json
 */

import { extractRequirements } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/pm.js';
import { render } from '../prompts/render.js';
import { readArtifact, productSubdir, ideaContextSubdir } from '../state.js';
import { VAGUE, BROAD_VAGUE, HAS_METRIC, TITLE_STOP, normalizeAC, IDEA_PROVENANCE_FIELDS, PROVENANCE_VALUES } from './phase1-checks.js';

/**
 * Tier-A provenance gate (D2). Fires only on a FRESH seed — Phase 1 not yet
 * approved — and only when a config is supplied (the production complete.js
 * path always supplies one; bare validate(content) calls in tests skip it).
 *
 * Once Phase 1 is approved the seed is sealed: re-runs refine the FRs and the
 * provenance decision is not re-litigated, so the gate is skipped (mirrors the
 * briefing's "skip the IDEA.md Pre-flight on re-runs"). Existing approved
 * projects therefore never break on upgrade — no migration needed.
 *
 * Contract: every Tier-A field must declare provenance "confirmed" | "assumed";
 * any "assumed" field must be carried in idea_gaps referencing that field key.
 * This converts silent agent inference of the highest-blast-radius inputs into
 * a blocking, tracked gap. Aitri cannot verify free-text provenance — the gate
 * makes "ask & confirm" the path of least resistance and omission auditable.
 */
function validateSeedProvenance(d, ctx) {
  const cfg = ctx && ctx.config;
  if (!cfg) return;                                              // can't determine seed state — skip
  if ((cfg.approvedPhases || []).map(String).includes('1')) return; // seed already sealed

  const prov = d.idea_provenance;
  if (!prov || typeof prov !== 'object' || Array.isArray(prov)) {
    throw new Error(
      'Missing required field: idea_provenance — the seed-input provenance contract.\n' +
      '  On a fresh Phase 1, declare where each ground-truth input came from:\n' +
      `    "idea_provenance": { ${IDEA_PROVENANCE_FIELDS.map(f => `"${f}": "confirmed|assumed"`).join(', ')} }\n` +
      '  "confirmed" = the user stated or approved it. "assumed" = you inferred it.\n' +
      '  Every "assumed" field must also appear in idea_gaps (see below).\n' +
      '  Do not invent "confirmed" — if you did not get it from the user, it is "assumed".'
    );
  }

  const invalid = IDEA_PROVENANCE_FIELDS.filter(f => !PROVENANCE_VALUES.includes(prov[f]));
  if (invalid.length)
    throw new Error(
      `idea_provenance has missing or invalid entries: ${invalid.join(', ')}.\n` +
      `  Each Tier-A field must be exactly "confirmed" or "assumed". Required fields: ${IDEA_PROVENANCE_FIELDS.join(', ')}.`
    );

  const assumed = IDEA_PROVENANCE_FIELDS.filter(f => prov[f] === 'assumed');
  if (assumed.length) {
    const gapsRaw = (Array.isArray(d.idea_gaps) && d.idea_gaps)
      || (d.project_summary && Array.isArray(d.project_summary.idea_gaps) && d.project_summary.idea_gaps)
      || [];
    // The gap must START with the field key (the briefing's documented contract:
    // `"baseline: <reason>"`), not merely MENTION it anywhere. An anywhere-substring
    // match let a gap about one field satisfy another's requirement — e.g. a
    // `baseline:` gap mentioning "power users" cleared the `users` assumption
    // (audit Tier-2 false-accept). Anchor to the leading token.
    const gaps = gapsRaw.map(g => String(g).trimStart().toLowerCase());
    const uncarried = assumed.filter(f => !gaps.some(g => g.startsWith(f)));
    if (uncarried.length)
      throw new Error(
        `${uncarried.length} assumed Tier-A field(s) not carried in idea_gaps: ${uncarried.join(', ')}.\n` +
        `  An assumed ground-truth input must be a tracked gap, not a silent guess.\n` +
        `  Either confirm it with the user (set provenance "confirmed"), or add an idea_gaps\n` +
        `  entry referencing the field, e.g. "no_go_zone: inferred from product type — confirm with owner".`
      );
  }

  // Provenance source (ADR-043 #5) — each "confirmed" should cite where it came from
  // (IDEA.md / user / inferred), surfaced to the human at approve. Honor-system, so a
  // WARNING (not a block): a "confirmed" with no source is a silent claim.
  const confirmed = IDEA_PROVENANCE_FIELDS.filter(f => prov[f] === 'confirmed');
  const srcs = (d.idea_provenance_sources && typeof d.idea_provenance_sources === 'object' && !Array.isArray(d.idea_provenance_sources))
    ? d.idea_provenance_sources : {};
  const noSource = confirmed.filter(f => !(typeof srcs[f] === 'string' && srcs[f].trim()));
  if (noSource.length)
    process.stderr.write(
      `[aitri] Note: ${noSource.length} "confirmed" Tier-A field(s) have no source in idea_provenance_sources: ${noSource.join(', ')}.\n` +
      `  Record where each came from (e.g. "IDEA.md", "user confirmed", "inferred") so the human approving\n` +
      `  can tell a real confirmation from an inference. (Warning, not a block.)\n`
    );
}

/**
 * Intent coverage map gate (AUDIT-COV-FEAT-0625 / REQ-RICHNESS-0624). Fresh-seed only,
 * same lifecycle as validateSeedProvenance (skips once Phase 1 is approved → existing
 * projects never break, no migration). This is a LIGHT gate by design — it is NOT the
 * teeth. It forces the agent to externalise its idea→requirement decomposition (which
 * the briefing already demands "in its head") into a checkable list, so a silently-dropped
 * need becomes catchable by COMPARISON — the human at approve, and the independent
 * `audit requirements` pass (which diffs its own fresh derivation against this map). The
 * gate only checks structural validity (every entry disposed to a real requirement id or
 * an explicit out_of_scope); it deliberately does NOT — and cannot — verify the map is
 * COMPLETE, because the agent fills it: a need it never surfaces is absent here too. That
 * residual is the independent comparison's job, not this gate's. (ADR-060.)
 */
function validateCoverageMap(d, ctx) {
  const cfg = ctx && ctx.config;
  if (!cfg) return;                                                 // can't determine seed state — skip
  if ((cfg.approvedPhases || []).map(String).includes('1')) return; // seed already sealed

  const map = d.coverage_map;
  if (!Array.isArray(map) || map.length === 0) {
    throw new Error(
      'Missing required field: coverage_map — the idea→requirement coverage list.\n' +
      '  On a fresh Phase 1, list every distinct need you found in the seed and where each went:\n' +
      '    "coverage_map": [ { "need": "<a need from the idea>", "disposition": "FR-001" | "out_of_scope" }, … ]\n' +
      '  One entry per distinct need or behavior in the seed — the SAME decomposition the briefing\n' +
      '  already asks for (a UI surface, a user action, a capability, an operation — whatever the target\n' +
      '  exposes). A need you build → its FR (or NFR) id; a need you consciously exclude → "out_of_scope"\n' +
      '  (with the reason in no_go_zone).\n' +
      '  Writing it down is what makes a dropped need catchable by comparison — by you at approve, and\n' +
      '  by the independent `aitri audit requirements` pass — instead of being silently absent.'
    );
  }

  const reqIds = new Set([
    ...(d.functional_requirements || []),
    ...(d.non_functional_requirements || []),
  ].map(r => r && r.id).filter(Boolean));

  const errors = [];
  map.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`entry ${i} is not an object of shape { need, disposition }`);
      return;
    }
    if (typeof entry.need !== 'string' || !entry.need.trim())
      errors.push(`entry ${i} has an empty "need"`);
    const disp = entry.disposition;
    if (typeof disp !== 'string' || !disp.trim())
      errors.push(`entry ${i} ("${entry.need || '?'}") has an empty "disposition" — use a requirement id or "out_of_scope"`);
    else if (disp !== 'out_of_scope' && !reqIds.has(disp))
      errors.push(`entry ${i} ("${entry.need}") disposition "${disp}" is neither "out_of_scope" nor an existing functional/non-functional requirement id`);
  });
  if (errors.length)
    throw new Error(
      `coverage_map has invalid entries:\n  ${errors.join('\n  ')}\n` +
      `  Each entry needs a non-empty "need" and a "disposition" that is either "out_of_scope" or a real FR/NFR id.`
    );
}

export default {
  num: 1,
  alias: 'requirements',
  name: 'Requirements',
  persona: 'Product Manager',
  artifact: '01_REQUIREMENTS.json',
  // Inputs are loaded dynamically in buildBriefing() — either IDEA.md (first run)
  // or 01_REQUIREMENTS.json (re-run). Keeping `inputs` empty avoids run-phase.js
  // hard-failing on missing IDEA.md after archive+delete on first approve.
  inputs: [],

  extractContext: extractRequirements,

  validate(content, ctx = {}) {
    let d;
    try { d = JSON.parse(content); } catch {
      throw new Error('01_REQUIREMENTS.json is not valid JSON — check that the agent did not wrap output in markdown fences, add trailing commas, or save the file with a leading byte-order mark (BOM).');
    }
    const missing = ['project_name', 'functional_requirements', 'user_stories', 'non_functional_requirements']
      .filter(k => !d[k]);
    if (missing.length) throw new Error(`Missing fields: ${missing.join(', ')}`);
    // A feature sub-pipeline is an INCREMENT and legitimately adds fewer requirements
    // than a greenfield project; the greenfield floor (5 FR / 3 NFR) forced filler on
    // small features (finance-dashboard canary 2026-06-05: a real 4-FR `fx` increment
    // was blocked). Root projects keep the full floor.
    const isFeature = !!ctx.featureRoot;
    const minFR  = isFeature ? 2 : 5;
    const minNFR = isFeature ? 1 : 3;
    if (d.functional_requirements.length < minFR)
      throw new Error(`Min ${minFR} functional_requirements required${isFeature ? ' (feature scope)' : ''}`);
    if (d.non_functional_requirements.length < minNFR)
      throw new Error(`Min ${minNFR} non_functional_requirements required${isFeature ? ' (feature scope)' : ''}`);

    // no_go_zone is declared MANDATORY by the PM persona ("ambiguous scope is a
    // defect — ≥3 out-of-scope items required") and taught across the templates,
    // but nothing enforced it: an empty or missing no_go_zone passed `complete 1`
    // unchecked, so the scope boundary that Phase 2/3/4 rely on (architecture +
    // tests + build all "do NOT implement no_go_zone items") could be absent.
    // Gate the actual content here. The idea_provenance gate only records HOW the
    // field was derived, never that it is populated. Mirror the FR/NFR feature
    // floor so small increments aren't forced to invent out-of-scope filler.
    const minNoGo = isFeature ? 1 : 3;
    if (!Array.isArray(d.no_go_zone) || d.no_go_zone.length < minNoGo)
      throw new Error(`Min ${minNoGo} no_go_zone item(s) required${isFeature ? ' (feature scope)' : ''} — declare what is explicitly out of scope (Phase 2/3/4 read this to NOT design, test, or build those items). Ambiguous scope is a defect; an empty no_go_zone is not acceptable.`);

    // FR/NFR ids are the JOIN KEY for the whole pipeline: phase3 ties every test
    // case to one via `requirement_id`, phase5 demands a compliance entry per
    // MUST id. An FR with no id collapses to an `undefined` key downstream; two
    // FRs sharing an id silently mask the second's coverage. Neither was caught
    // before. Enforce presence + uniqueness on both lists (mirrors phase3's
    // duplicate-TC-id gate). Format (FR-xxx) stays a convention the briefing
    // teaches — downstream keys on membership, not on the prefix.
    for (const [field, prefix] of [['functional_requirements', 'FR'], ['non_functional_requirements', 'NFR']]) {
      const seen = new Map();
      for (const r of d[field]) {
        if (!r || typeof r.id !== 'string' || !r.id.trim())
          throw new Error(`Every ${field} entry must have a non-empty string "id" (e.g. "${prefix}-001") — it is the join key referenced by test cases and the compliance proof.`);
        seen.set(r.id, (seen.get(r.id) || 0) + 1);
      }
      const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} (×${n})`);
      if (dupes.length)
        throw new Error(`Duplicate ${field} id(s): ${dupes.join(', ')} — ids must be unique; a duplicate silently masks one requirement's downstream test/compliance coverage.`);
    }

    // Structured acceptance-criterion ids (ADR-041 option A; canonical shape ADR-064): when
    // Phase 1 declares ACs as `{ id, given, when, then }` in user_stories[].acceptance_criteria
    // (legacy `{ id, text }` also joins), that id is the finer join
    // key `ac_coverage` rolls up on and `ac_id` traces to. A TC's ac_id must resolve to
    // exactly one criterion, so enforce non-empty + unique ids — but ONLY when structured
    // ACs are present (plain-string ACs and projects with none are untouched, additive).
    const acSeen = new Map();
    for (const us of (d.user_stories || [])) {
      for (const ac of (us.acceptance_criteria || [])) {
        if (ac && typeof ac === 'object' && 'id' in ac) {
          if (typeof ac.id !== 'string' || !ac.id.trim())
            throw new Error(`A structured acceptance criterion in user story ${us.id ?? '(unknown)'} has an empty "id" — give every structured AC a non-empty id (e.g. "AC-001"); it is the join key for ac_id / AC-level coverage.`);
          acSeen.set(ac.id, (acSeen.get(ac.id) || 0) + 1);
        }
      }
    }
    const acDupes = [...acSeen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} (×${n})`);
    if (acDupes.length)
      throw new Error(`Duplicate acceptance-criterion id(s): ${acDupes.join(', ')} — AC ids must be unique across user_stories; a duplicate masks one criterion's AC-level coverage (ac_id traceability).`);

    const mustFRs = d.functional_requirements.filter(fr => fr.priority === 'MUST');
    const missingType = mustFRs.filter(fr => !fr.type);
    if (missingType.length)
      throw new Error(`MUST FRs missing type field: ${missingType.map(f => f.id).join(', ')}`);
    const missingCriteria = mustFRs.filter(fr => !fr.acceptance_criteria?.length);
    if (missingCriteria.length)
      throw new Error(`MUST FRs missing acceptance_criteria: ${missingCriteria.map(f => f.id).join(', ')}`);
    if (!d.user_personas?.length)
      process.stderr.write(`[aitri] Warning: user_personas missing — UX requirements lack user context. Add at least 1 persona.\n`);

    // Warn when a MUST FR has no linked user story — non-blocking, nudges toward richer requirements
    const linkedFRIds = new Set((d.user_stories || []).map(us => us.requirement_id).filter(Boolean));
    const mustFRsWithoutStory = mustFRs.filter(fr => !linkedFRIds.has(fr.id));
    if (mustFRsWithoutStory.length) {
      process.stderr.write(
        `[aitri] Warning: ${mustFRsWithoutStory.length} MUST FR(s) have no linked user story:\n` +
        mustFRsWithoutStory.map(fr => `  ${fr.id}: ${fr.title}`).join('\n') + '\n' +
        `  Add user_stories with requirement_id referencing these FRs.\n`
      );
    }

    // Warn on PM-flagged assumptions — non-blocking, human reviews before approve
    const assumptions = d.functional_requirements.filter(fr =>
      fr.title?.includes('[ASSUMPTION') ||
      (fr.acceptance_criteria || []).some(ac => ac.includes('[ASSUMPTION'))
    );
    if (assumptions.length) {
      process.stderr.write(
        `[aitri] Warning: ${assumptions.length} FR(s) marked as assumptions — confirm with stakeholders before approving:\n` +
        assumptions.map(fr => `  ${fr.id}: ${fr.title}`).join('\n') + '\n'
      );
    }

    // §3.4 (rc.64 adopter): each per-FR check below COLLECTS all offending FRs and
    // reports them in one error, instead of throwing on the first — so the agent fixes
    // every FR of the same rule in a single edit/complete cycle, not one per cycle
    // (the adopter hit FR-001 → FR-003 → FR-005, three cycles for one rule).
    const qualitativeTypes = ['ux', 'visual', 'audio'];
    const qualFRs = mustFRs.filter(fr => qualitativeTypes.includes(fr.type?.toLowerCase()));
    const noMetric = [];
    for (const fr of qualFRs) {
      const criteria = fr.acceptance_criteria || [];
      const hasMetric = criteria.some(c => HAS_METRIC.test(c));
      const allVague = criteria.every(c => VAGUE.test(c) && !HAS_METRIC.test(c));
      if (!hasMetric || allVague) noMetric.push(fr.id);
    }
    if (noMetric.length)
      throw new Error(`${noMetric.join(', ')} (type ux/visual/audio) — acceptance_criteria must include at least one observable metric (e.g. "375px viewport", "≤200ms", "contrast ≥4.5:1"). Avoid vague terms like "nice", "smooth", "beautiful".`);

    // Vagueness check for ALL MUST FRs — every criterion being purely vague is always wrong.
    // BROAD_VAGUE/HAS_METRIC/TITLE_STOP/normalizeAC live in phase1-checks.js so the upgrade
    // protocol's VALIDATOR-GAP reporter consumes the same constants (single source of truth).
    const allVagueFRs = [];
    for (const fr of mustFRs) {
      const criteria = fr.acceptance_criteria || [];
      if (criteria.length === 0) continue;
      const allVague = criteria.every(c => BROAD_VAGUE.test(c) && !HAS_METRIC.test(c));
      if (allVague) allVagueFRs.push(fr.id);
    }
    if (allVagueFRs.length)
      throw new Error(`${allVagueFRs.join(', ')} — all acceptance_criteria are vague. Add at least one specific, testable criterion to each.`);

    // Title vagueness — MUST FRs whose title is a vague word with no concrete content.
    // Rule: if BROAD_VAGUE matches the title AND ≤1 substantive token remains after
    // stripping stopwords and vague words, throw. "Generate reports efficiently" passes
    // (2 substantive tokens); "La app debe funcionar correctamente" fails (0 remaining).
    const vagueTitles = [];
    for (const fr of mustFRs) {
      const title = fr.title || '';
      if (!BROAD_VAGUE.test(title)) continue;
      const substantive = title
        .replace(/\[ASSUMPTION[^\]]*\]/gi, ' ')
        .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ]/gi, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !TITLE_STOP.test(t) && !BROAD_VAGUE.test(t));
      if (substantive.length < 2) vagueTitles.push(`${fr.id} ("${title}")`);
    }
    if (vagueTitles.length)
      throw new Error(`${vagueTitles.join('; ')} — title is too vague. Title must name the specific behavior, not describe quality abstractly.`);

    // Duplicate acceptance_criteria across FRs — copy-paste of ACs is an anti-pattern
    // indicating FRs are not semantically differentiated. Jaccard similarity ≥0.9
    // (normalized: lowercase, punctuation stripped, whitespace collapsed).
    // Only applies to FRs with ≥3 ACs to avoid false positives on trivial cases.
    const richFRs = d.functional_requirements.filter(fr => (fr.acceptance_criteria || []).length >= 3);
    for (let i = 0; i < richFRs.length; i++) {
      const a = new Set(richFRs[i].acceptance_criteria.map(normalizeAC).filter(Boolean));
      for (let j = i + 1; j < richFRs.length; j++) {
        const b = new Set(richFRs[j].acceptance_criteria.map(normalizeAC).filter(Boolean));
        const intersection = new Set([...a].filter(x => b.has(x)));
        const union = new Set([...a, ...b]);
        if (union.size === 0) continue;
        const jaccard = intersection.size / union.size;
        if (jaccard >= 0.9) {
          const pct = Math.round(jaccard * 100);
          throw new Error(`${richFRs[i].id} and ${richFRs[j].id} have ${pct}% identical acceptance_criteria — differentiate the FRs or merge them into one.`);
        }
      }
    }

    // Tier-A seed-input provenance gate (D2) — runs last, fresh-seed only.
    validateSeedProvenance(d, ctx);
    // Intent coverage map gate (ADR-060) — fresh-seed only; light structural check,
    // the teeth are the independent audit comparison that consumes the map.
    validateCoverageMap(d, ctx);
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase, config = {}, featureRoot = null, scopeVerb = '', scopeArg = '' }) {
    const artifactsDir = config.artifactsDir || '';

    // Re-run mode: 01_REQUIREMENTS.json exists and parses → it is the SSoT,
    // not IDEA.md. The agent refines current FRs instead of regenerating.
    const currentRaw = readArtifact(dir, '01_REQUIREMENTS.json', artifactsDir);
    let currentRequirements = '';
    if (currentRaw) {
      try {
        JSON.parse(currentRaw);
        currentRequirements = currentRaw;
      } catch { /* malformed — fall back to IDEA.md mode */ }
    }
    const isRerun = currentRequirements !== '';

    // First-run mode: load IDEA.md from project root and run pre-flight warnings.
    // (Re-runs skip both — IDEA.md is irrelevant by design once 01_REQS exists.)
    // Seed per scope (rc.80, ADR-050): features read FEATURE_IDEA.md directly.
    const idea = isRerun ? '' : ((featureRoot
      ? readArtifact(dir, 'FEATURE_IDEA.md')
      : readArtifact(dir, 'IDEA.md', productSubdir(config))) || inputs['IDEA.md'] || '');

    // Discovery handoff: if the optional Discovery phase ran, its problem
    // definition / users / success criteria / out-of-scope are real seed context
    // for the requirements — feed them in. Before this, 00_DISCOVERY.md had NO
    // consumer (the agent's discovery work was discarded except a boolean nudge).
    // First-run only — on re-runs 01_REQUIREMENTS.json is the SSoT.
    const discovery = isRerun ? '' : (readArtifact(dir, '00_DISCOVERY.md', artifactsDir) || '');

    if (!isRerun) {
      if (!idea) {
        throw new Error(
          `Missing required file: ${featureRoot ? 'FEATURE_IDEA.md' : 'IDEA.md'}\n` +
          `  Phase 1 needs a seed brief on first run. Create ${featureRoot ? 'FEATURE_IDEA.md' : 'IDEA.md (or run aitri wizard)'}.`
        );
      }
      // The seed file (and thus its section names) differs by scope: a root project
      // uses IDEA.md; a feature sub-pipeline materializes FEATURE_IDEA.md → IDEA.md,
      // which has a DIFFERENT section set (Problem / Why, New Behavior, …). Checking
      // the root section names against a feature seed produced spurious "## Business
      // Rules is empty" warnings (finance-dashboard canary 2026-06-05, C4).
      const isFeature = !!featureRoot;
      const seedName  = isFeature ? 'FEATURE_IDEA.md' : 'IDEA.md';
      const REQUIRED  = isFeature
        ? ['Problem / Why', 'Target Users', 'New Behavior', 'Success Criteria']
        : ['Problem', 'Target Users', 'Business Rules', 'Success Criteria'];
      for (const name of REQUIRED) {
        // Anchor to the header LINE ([^\n]*\n), not \s*\n: the latter over-consumes
        // blank lines, so a truly-empty section followed by another "## " header
        // captured the NEXT section's body and never warned (surfaced fixing C4).
        const re = new RegExp(`## ${name}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
        const m = idea.match(re);
        const body = m ? m[1].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
        if (!body) {
          process.stderr.write(
            `[aitri] Warning: ${seedName} section "## ${name}" is empty — PM will mark inferred content as [ASSUMPTION].\n`
          );
        }
      }
    }

    return render('phases/requirements', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      IDEA_MD: idea,
      DISCOVERY_MD: discovery,
      CURRENT_REQUIREMENTS: currentRequirements,
      ARTIFACTS_BASE: artifactsBase || dir,
      PARENT_REQUIREMENTS: inputs['PARENT_REQUIREMENTS.json'] || '',
      // Layout-resolved context folder: feature_context/ in a feature (flat
      // interior), idea_context/ at its layout location for the root unit.
      CONTEXT_DIR: featureRoot ? 'feature_context' : ideaContextSubdir(config).replace(/\\/g, '/'),
      SCOPE_VERB: scopeVerb,
      SCOPE_ARG:  scopeArg,
    });
  },
};
