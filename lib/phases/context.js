/**
 * Module: Phase Context Helpers
 * Purpose: Selective context extraction utilities used by phase definitions.
 *          Reduces token consumption 40-60% per phase by passing only needed fields.
 */

/** Take first N lines of a markdown artifact — captures architecture, skips risk/deploy */
export function head(content, lines = 160) {
  return content.split('\n').slice(0, lines).join('\n');
}

/**
 * Extract only the fields downstream phases need from 01_REQUIREMENTS.json.
 * Deliberately does NOT forward `project_summary`: its one consumer is Phase 2, which reads
 * it from the RAW artifact on disk (phase2.js) — it cannot travel through this extract
 * because run-phase applies the producer transform before any consumer option could ask for
 * it (UPLAN-0703 C1, adversarial-pass fix: the opt-in-parameter version was a no-op in the
 * real flow — the input was already stripped by the time the option ran).
 */
export function extractRequirements(content) {
  try {
    const d = JSON.parse(content);
    return JSON.stringify({
      project_name: d.project_name,
      technology_preferences: d.technology_preferences,
      constraints: d.constraints,
      no_go_zone: d.no_go_zone,
      user_personas: d.user_personas?.map(p => ({
        role: p.role,
        tech_level: p.tech_level,
        goal: p.goal,
        pain_point: p.pain_point,
      })),
      functional_requirements: d.functional_requirements?.map(fr => ({
        id: fr.id,
        title: fr.title,
        // The FR's behavioral prose — the richest field in the PRD (the template's own "good
        // FR" example is description-shaped). It was never forwarded, so phases 2/3/4 designed,
        // tested, and built from the title alone — the field-level silent-drop class the
        // connectivity audit exists to catch (UPLAN-0703 C1; same fix shape as the rc.140
        // nfr.acceptance_criteria forward).
        description: fr.description,
        priority: fr.priority,
        type: fr.type,
        acceptance_criteria: fr.acceptance_criteria,
      })),
      user_stories: d.user_stories?.map(us => ({
        id: us.id,
        requirement_id: us.requirement_id,
        acceptance_criteria: us.acceptance_criteria?.map(ac => ({
          id: ac.id,
          given: ac.given,
          when: ac.when,
          then: ac.then,
        })),
      })),
      non_functional_requirements: d.non_functional_requirements?.map(nfr => ({
        id: nfr.id,
        category: nfr.category,
        // priority forwarded for parity with the FR arm (F2 sweep 2026-07-02). NFR priority is OPTIONAL/
        // off-canonical (the canonical NFR MUST signal is category:"Regression", which is forwarded above);
        // but when an author DOES mark an NFR priority:"MUST", the FR arm already carries priority while this
        // arm dropped it — an unprincipled asymmetry that hid the author's explicit MUST from the architect/QA
        // at design time. Additive: undefined when the author omits it (the common case). Coverage was never
        // at risk (the phase-3 gate re-reads priority from disk) — this restores the design-time signal only.
        priority: nfr.priority,
        requirement: nfr.requirement,
        // A MUST/regression NFR's acceptance_criteria is the observable target QA designs the test
        // against — for a regression NFR the template defines it as "how a test confirms it still
        // works" (requirements.md). Dropping it here left phase 3 (and the downstream phases) designing
        // NFR tests blind to the very criterion Phase 1 authored — the field-level shape of the
        // rc.137 silent-drop (connectivity audit 2026-06-30, AUDIT-0630-D). Forward it, like the
        // FR-level acceptance_criteria already is.
        acceptance_criteria: nfr.acceptance_criteria,
      })),
    }, null, 2);
  } catch { return content; }
}

/**
 * Extract minimal requirements for Phase 5 compliance audit.
 * Phase 5 only needs FR ids/titles/priorities and NFR summaries — not user stories,
 * personas, or AC detail (those were validated in earlier phases).
 */
export function extractRequirementsForCompliance(content) {
  try {
    const d = JSON.parse(content);
    return JSON.stringify({
      project_name: d.project_name,
      no_go_zone: d.no_go_zone,
      functional_requirements: d.functional_requirements?.map(fr => ({
        id: fr.id,
        title: fr.title,
        priority: fr.priority,
        type: fr.type,
      })),
      non_functional_requirements: d.non_functional_requirements?.map(nfr => ({
        id: nfr.id,
        category: nfr.category,
        priority: nfr.priority,   // parity with the FR arm + extractRequirements (F2 sweep 2026-07-02)
        requirement: nfr.requirement,
      })),
    }, null, 2);
  } catch { return content; }
}

/** Extract full test specs from 03_TEST_CASES.json — includes given/when/then for implementation fidelity */
export function extractTestIndex(content) {
  try {
    const d = JSON.parse(content);
    return JSON.stringify({
      test_plan: d.test_plan,
      test_cases: d.test_cases?.map(tc => ({
        id: tc.id,
        requirement_id: tc.requirement_id,
        user_story_id: tc.user_story_id,
        ac_id: tc.ac_id,
        title: tc.title,
        type: tc.type,
        scenario: tc.scenario,
        priority: tc.priority,
        given: tc.given,
        when: tc.when,
        then: tc.then,
        expected_result: tc.expected_result,
      })),
    }, null, 2);
  } catch { return content; }
}

/** Extract summary + FR coverage + failures from 04_TEST_RESULTS.json for Phase 5 */
export function extractTestResults(content) {
  try {
    const d = JSON.parse(content);
    return JSON.stringify({
      executed_at: d.executed_at,
      test_runner: d.test_runner,
      summary: d.summary,
      fr_coverage: d.fr_coverage,
      failed_tests: d.results?.filter(r => r.status === 'fail').map(r => ({ tc_id: r.tc_id, notes: r.notes })),
    }, null, 2);
  } catch { return content; }
}

/** Extract only files/commands/debt from 04_BUILD_REPORT.json */
export function extractManifest(content) {
  try {
    const d = JSON.parse(content);
    return JSON.stringify({
      files_created: d.files_created,
      files_modified: d.files_modified,   // R3-18: dropping this gave the reviewer + Phase 5 an
      setup_commands: d.setup_commands,    // empty file list on modified-only (brownfield) builds.
      environment_variables: d.environment_variables,
      technical_debt: d.technical_debt,
    }, null, 2);
  } catch { return content; }
}
