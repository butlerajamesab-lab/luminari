import { getPool } from "../db";

const VIEWFINDER_VIEW = "public.v_anomaly_viewfinder_live_v1";

export async function getLiveAnomalyViewfinderStates() {
  const result = await getPool().query(`
    select
      jurisdiction_code,
      jurisdiction_name,
      fips,
      population_raw,
      medicaid_raw,
      medicaid_expanded,
      minimum_wage_raw,
      minimum_wage_sort,
      ui_maximum_raw,
      ui_maximum_sort,
      ui_duration_raw,
      ui_duration_sort_weeks,
      ui_appeal_deadline_raw,
      tanf_raw,
      tanf_sort,
      wage_sol_raw,
      wage_sol_sort_years,
      civil_rights_sol_raw,
      civil_rights_sol_sort_days,
      tribal_raw,
      portability_raw,
      portability_sort,
      lgbtq_state_protection,
      regional_or_unique_raw,
      critical_deadlines_raw,
      source_verification_raw,
      policy_alert_count_raw,
      program_card_count_raw,
      workflow_count_raw,
      alerts,
      labeled_metrics,
      provenance,
      profile_state,
      data_state,
      updated_at
    from ${VIEWFINDER_VIEW}
    order by jurisdiction_name, jurisdiction_code
  `);

  return {
    contract: "anomaly_viewfinder_live_v1",
    jurisdiction_count: result.rows.length,
    states: result.rows,
  };
}
