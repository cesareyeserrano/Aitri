/**
 * Module: Phase 2 — System Architecture
 * Purpose: Software Architect persona. Designs the complete system from requirements.
 * Artifact: 02_SYSTEM_DESIGN.md
 */

import { extractRequirements } from './context.js';
import { ROLE, CONSTRAINTS, REASONING } from '../personas/architect.js';
import { render } from '../prompts/render.js';
import { readArtifact } from '../state.js';
import { activeSecurityNfrs } from '../requirements.js';

// Fence-aware section body extraction (SEC-THREADING-0722). The header-presence scan
// above it (hasSection) predates rc.6's fence lesson (FB-EXTRACT-FENCE-0718): a regex
// over raw lines treats a fenced example `## Heading` as a real section. This walker
// tracks fence state, so (a) the section start must be a REAL heading outside any code
// fence, (b) a fenced `## Next Section` inside the body does not terminate it, and
// (c) fenced content between the heading and the next real heading counts as body.
// Returns the trimmed body, or null when the section heading is absent outside fences.
function fenceAwareSectionBody(content, name) {
  const headRe = new RegExp(`^##\\s+(?:[\\d.]+\\s+)?${name}\\b`, 'i');
  const lines = content.split('\n');
  // Track the OPENING marker, not a bare boolean: a `~~~` line inside a ``` block is
  // fence CONTENT, not a closer — a boolean toggle desyncs there and let an empty real
  // section borrow a fenced example's body (rc.7 adversarial finding).
  let fence = null;
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const fm = /^\s*(```|~~~)/.exec(lines[i]);
    if (fm) {
      if (!fence) fence = fm[1];
      else if (fence === fm[1]) fence = null;
      continue;
    }
    if (fence) continue;
    if (start === -1) {
      if (headRe.test(lines[i])) start = i;
    } else if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (start === -1) return null;
  return lines.slice(start + 1, end).join('\n').trim();
}

export default {
  num: 2,
  alias: 'architecture',
  name: 'System Architecture',
  persona: 'Software Architect',
  artifact: '02_SYSTEM_DESIGN.md',
  // 01_REQUIREMENTS.json carries `original_brief` since v0.1.89 (alpha.17 absorbs
  // IDEA.md on first approve of Phase 1 and unlinks the file). Phase 2 reads the
  // brief via that field — never directly from IDEA.md. Declaring IDEA.md as a
  // required input here used to fail re-runs of Phase 2 on absorbed-brief
  // projects (the run-phase gate hard-fails on missing inputs even when
  // buildBriefing does not consume them).
  inputs: ['01_REQUIREMENTS.json'],
  optionalInputs: ['01_UX_SPEC.md'],

  // No extractContext: 02_SYSTEM_DESIGN.md reaches its consumers (phases 3/4/5) IN FULL.
  // run-phase applies the PRODUCER's extractContext to every consumed input, so a head(…,160)
  // cap here silently dropped late design sections (Deployment Architecture, Risk Analysis)
  // from the developer's briefing — not just from phase 2's own context (ADV-0622-02).

  validate(content, ctx = {}) {
    const required = [
      'Executive Summary',
      'System Architecture',
      'Data Model',
      'API Design',
      // Per-MUST-FR method / I-O contract / failure behavior (RSRCH-ADOPT-0711 W1, ADR-075):
      // a design that only maps FR→component leaves Phase 4 guessing the method — the top
      // measured code-gen quality lever (algorithmic detail + I/O format) forced at the source.
      'Implementation Approach',
      'Security Design',
      'Performance & Scalability',
      'Deployment Architecture',
      'Risk Analysis',
      'Technical Risk Flags',
    ];
    // Accept plain (## Name), integer (## 1. Name), and decimal (## 1.1 Name) headers.
    // Tolerate the `&`/`and`/`/` connector so `## Performance and Scalability` is not
    // a false-reject of `Performance & Scalability` (audit Tier-2 — the literal `&`
    // rejected the common `and` spelling).
    const hasSection = name => {
      const pat = name
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s*&\s*/g, '\\s+(?:&|and|/)\\s+');
      return new RegExp(`^##\\s+(?:[\\d.]+\\s+)?${pat}`, 'mi').test(content);
    };
    const missing = required.filter(name => !hasSection(name)).map(name => `## ${name}`);
    if (missing.length)
      throw new Error(`02_SYSTEM_DESIGN.md missing required sections:\n  ${missing.join('\n  ')}`);
    // Technical Risk Flags must have content — not just the header
    const lines = content.split('\n');
    const flagsIdx = lines.findIndex(l => /^##\s+(?:[\d.]+\s+)?Technical Risk Flags/.test(l));
    if (flagsIdx !== -1) {
      const nextSection = lines.findIndex((l, i) => i > flagsIdx && /^##\s/.test(l));
      const flagsBody = lines.slice(flagsIdx + 1, nextSection === -1 ? undefined : nextSection).join('\n').trim();
      if (!flagsBody)
        throw new Error('## Technical Risk Flags is empty — declare [RISK] flags or write "None detected" with justification');
    }
    if (content.split('\n').length < 40)
      throw new Error('02_SYSTEM_DESIGN.md too short — min 40 lines expected for a complete design');

    // SEC-THREADING-0722: when the project declares ACTIVE security NFRs (promises, not
    // explicit exclusions — SSoT predicate in lib/requirements.js), the Security Design
    // section must have a body. Header presence alone let a blank security design pass
    // `complete 2` on a project that PROMISED security — the sibling Technical Risk
    // Flags check above closes exactly this for risk flags. Conditional: no security
    // promises (none declared, or all excluded at Phase 1) → no check; requirements
    // unreadable/malformed from this ctx → fail open (cross-artifact gates never turn
    // a broken read into a phase-2 block). Fence-aware (see fenceAwareSectionBody).
    if (ctx && ctx.dir && ctx.config) {
      let reqs = null;
      try { reqs = JSON.parse(readArtifact(ctx.dir, '01_REQUIREMENTS.json', ctx.config.artifactsDir || '') || ''); } catch { /* fail open */ }
      if (reqs && activeSecurityNfrs(reqs).length > 0) {
        const secBody = fenceAwareSectionBody(content, 'Security Design');
        if (!secBody)
          throw new Error(
            '## Security Design is empty, but 01_REQUIREMENTS.json declares active security NFRs — a security promise with no design is honor-system.\n' +
            '  Fix ONE of:\n' +
            '    design it   → write the section: map each security NFR to its design mitigation (authn/authz model, input validation, secret handling, transport), and name the trust boundaries.\n' +
            '    or, if security genuinely does not apply, record that decision at the source — rephrase the NFR\'s "requirement" field to the canonical exclusion idiom, e.g. "Not applicable: offline single-user tool — no network, no secrets, no PII" — and this check will not apply.\n' +
            '  (Probe without side effects: aitri complete 2 --check)'
          );
      }
    }
  },

  buildBriefing({ dir, inputs, feedback, artifactsBase, bestPractices, config = {}, scopeVerb = '', scopeArg = '', contextAssets = '' }) {
    // project_summary → Phase 2 ONLY (UPLAN-0703 C1). It cannot come through `inputs`:
    // run-phase applies the PRODUCER's extractContext to every consumed input, so
    // inputs['01_REQUIREMENTS.json'] arrives ALREADY stripped of project_summary — the
    // adversarial pass proved a re-extract of that string is a no-op ("ceremony as wired",
    // the exact defect C1 exists to fix). Read the RAW artifact from disk instead; the
    // North Star KPI / JTBD / guardrail metric genuinely inform architecture trade-offs.
    let projectSummary = '';
    try {
      const raw = readArtifact(dir, '01_REQUIREMENTS.json', config.artifactsDir || '');
      const ps = raw ? JSON.parse(raw).project_summary : undefined;
      if (ps !== undefined) projectSummary = typeof ps === 'string' ? ps : JSON.stringify(ps, null, 2);
    } catch { /* missing/malformed on disk — the section simply doesn't render */ }
    return render('phases/architecture', {
      ROLE, CONSTRAINTS, REASONING,
      FEEDBACK: feedback || '',
      PROJECT_SUMMARY: projectSummary,
      REQUIREMENTS_JSON: extractRequirements(inputs['01_REQUIREMENTS.json']),
      UX_SPEC: inputs['01_UX_SPEC.md'] || '',
      // GOVERNANCE-0717 G1: parent architecture standard (feature scope only), with the
      // adoption-audit conventions as the adopted-case fallback.
      PARENT_ARCHITECTURE: inputs['PARENT_ARCHITECTURE.md'] || '',
      PARENT_CONVENTIONS:  inputs['PARENT_CONVENTIONS.md'] || '',
      ARTIFACTS_BASE: artifactsBase || dir,
      BEST_PRACTICES: bestPractices || '',
      CONTEXT_ASSETS: contextAssets,
      SCOPE_VERB: scopeVerb,
      SCOPE_ARG:  scopeArg,
    });
  },
};
