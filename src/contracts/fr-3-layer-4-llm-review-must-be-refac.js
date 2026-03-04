/**
 * FR-3: Layer 4 (LLM review) must be refactored to output persona system prompt + analysis task for the agent to execute — it must not call `callAI` directly. Output format: same pattern as pre-planning commands (persona header + task + instructions) Personas: architect (technical review), security (spec drift), developer (implementation quality), ux-ui (conditional on `.aitri/ux-design.md`) Each persona's prompt must be printed separately with a clear section header In `--json` mode, Layer 4 must be skipped entirely (JSON output must remain machine-parseable)
 */
export async function fr_3_layer_4_llm_review_must_be_refactored_to_output_persona_system_prompt_analysis_task_for_the_agent_to_execute_it_must_not_call_callai_directly_output_format_same_pattern_as_pre_planning_commands_persona_header_task_instructions_personas_architect_technical_review_security_spec_drift_developer_implementation_quality_ux_ui_conditional_on_aitri_ux_design_md_each_persona_s_prompt_must_be_printed_separately_with_a_clear_section_header_in_json_mode_layer_4_must_be_skipped_entirely_json_output_must_remain_machine_parseable(input) {
  void input;
  throw new Error("Not implemented: FR-3");
}
