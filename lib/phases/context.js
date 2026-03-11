/**
 * Module: Phase Context Helpers
 * Purpose: Selective context extraction utilities used by phase definitions.
 *          Reduces token consumption 40-60% per phase by passing only needed fields.
 */

/** Take first N lines of a markdown artifact — captures architecture, skips risk/deploy */
export function head(content, lines = 160) {
  return content.split('\n').slice(0, lines).join('\n');
}

/** Extract only the fields downstream phases need from 01_REQUIREMENTS.json */
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

/** Extract only files/commands/debt from 04_IMPLEMENTATION_MANIFEST.json */
export function extractManifest(content) {
  try {
    const d = JSON.parse(content);
    return JSON.stringify({
      files_created: d.files_created,
      setup_commands: d.setup_commands,
      environment_variables: d.environment_variables,
      technical_debt: d.technical_debt,
    }, null, 2);
  } catch { return content; }
}
