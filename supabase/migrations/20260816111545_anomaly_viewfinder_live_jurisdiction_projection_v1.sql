create or replace view public.v_anomaly_viewfinder_live_v1 as
with snapshot as (
  select
    p.jurisdiction_code,
    p.logical_record_id,
    p.run_id,
    p.record_fingerprint,
    p.source_row_index,
    p.row_payload,
    p.updated_at
  from public.state_directory_profile_promotion p
  where p.row_class = 'jurisdiction_snapshot'
),
base as (
  select
    s.jurisdiction_code,
    s.logical_record_id,
    s.run_id,
    s.record_fingerprint,
    coalesce(s.row_payload->>'state', s.row_payload->>'territory', s.row_payload->>'jurisdiction') as identity_raw,
    s.row_payload->>'medicaid' as medicaid_raw,
    s.row_payload->>'min__wage' as minimum_wage_raw,
    s.row_payload->>'population' as population_raw,
    s.updated_at
  from snapshot s
  where s.source_row_index = 1
),
label_rows as (
  select
    s.jurisdiction_code,
    s.logical_record_id,
    s.source_row_index,
    e.key as source_column,
    btrim(e.value) as metric_label
  from snapshot s
  cross join lateral jsonb_each_text(s.row_payload) e(key, value)
  where s.source_row_index in (2,4)
),
pairs as (
  select
    l.jurisdiction_code,
    l.logical_record_id,
    lower(regexp_replace(l.metric_label, '[^a-zA-Z0-9]+', '_', 'g')) as metric_key,
    l.metric_label,
    v.row_payload->>l.source_column as metric_value
  from label_rows l
  join snapshot v
    on v.jurisdiction_code = l.jurisdiction_code
   and v.logical_record_id = l.logical_record_id
   and v.source_row_index = l.source_row_index + 1
  where v.row_payload ? l.source_column
),
pair_pivot as (
  select
    jurisdiction_code,
    logical_record_id,
    max(metric_value) filter (where metric_key like 'ui_maximum%') as ui_maximum_raw,
    max(metric_value) filter (where metric_key like 'ui_duration%') as ui_duration_raw,
    max(metric_value) filter (where metric_key like 'ui_appeal_deadline%') as ui_appeal_deadline_raw,
    max(metric_value) filter (where metric_key like 'tanf%' or metric_key like 'tanf_maximum%') as tanf_raw,
    max(metric_value) filter (where metric_key like 'wage_sol%') as wage_sol_raw,
    max(metric_value) filter (where metric_key like 'civil_rights_sol%') as civil_rights_sol_raw,
    max(metric_value) filter (where metric_key like 'tribal_nation%' or metric_key like 'tribal_nations%') as tribal_raw,
    max(metric_value) filter (where metric_key like 'critical_region%' or metric_key like 'regional_%' or metric_key like 'unique_%') as regional_or_unique_raw,
    jsonb_object_agg(metric_label, metric_value order by metric_label) as labeled_metrics
  from pairs
  group by jurisdiction_code, logical_record_id
),
registry_metrics as (
  select
    p.jurisdiction_code,
    max(p.row_payload->>'value') filter (where lower(p.row_payload->>'registry_metric') = 'portability score') as portability_raw,
    max(p.row_payload->>'value') filter (where lower(p.row_payload->>'registry_metric') = 'tribal coverage') as tribal_coverage_raw,
    max(p.row_payload->>'value') filter (where lower(p.row_payload->>'registry_metric') = 'critical deadlines') as critical_deadlines_raw,
    max(p.row_payload->>'value') filter (where lower(p.row_payload->>'registry_metric') = 'source verification') as source_verification_raw,
    max(p.row_payload->>'value') filter (where lower(p.row_payload->>'registry_metric') = 'layer 0 policy alerts' or lower(p.row_payload->>'registry_metric') = 'layer 0 critical flags') as policy_alert_count_raw,
    max(p.row_payload->>'value') filter (where lower(p.row_payload->>'registry_metric') = 'layer 1 program cards') as program_card_count_raw,
    max(p.row_payload->>'value') filter (where lower(p.row_payload->>'registry_metric') = 'layer 2 workflows') as workflow_count_raw,
    max(p.row_payload->>'value') filter (where lower(p.row_payload->>'registry_metric') in ('regional profiles','metro profiles','metro/regional profiles','critical special region')) as regional_profile_raw,
    max(p.row_payload->>'value') filter (where lower(p.row_payload->>'registry_metric') like 'unique % features') as unique_features_raw,
    max(p.updated_at) as metric_updated_at
  from public.state_directory_profile_promotion p
  where p.row_class = 'registry_metric'
  group by p.jurisdiction_code
),
alerts_ranked as (
  select
    c.state_code as jurisdiction_code,
    coalesce(nullif(c.name,''), nullif(c.organization_name,''), nullif(c.description,'')) as alert_text,
    c.object_ref,
    c.source_locator,
    c.source_candidate_hash,
    row_number() over (
      partition by c.state_code
      order by
        case when c.section_name = 'pass3_policy_alert' then 0 else 1 end,
        c.source_created_at desc nulls last,
        c.object_ref
    ) as rn
  from public.v_lighthouse_civic_object_current_v1 c
  where c.object_class = 'policy_alert'
    and c.state_code is not null
    and c.typed_ready
    and coalesce(nullif(c.name,''), nullif(c.organization_name,''), nullif(c.description,'')) is not null
    and (
      c.section_name = 'pass3_policy_alert'
      or (length(coalesce(c.name,'')) between 8 and 320 and coalesce(c.name,'') !~ '<w:')
    )
),
alerts as (
  select
    jurisdiction_code,
    jsonb_agg(alert_text order by rn) filter (where rn <= 8) as alerts,
    jsonb_agg(
      jsonb_build_object(
        'object_ref', object_ref,
        'source_locator', source_locator,
        'source_candidate_hash', source_candidate_hash
      ) order by rn
    ) filter (where rn <= 8) as alert_provenance
  from alerts_ranked
  where rn <= 8
  group by jurisdiction_code
),
promoted as (
  select
    b.jurisdiction_code,
    btrim(regexp_replace(coalesce(b.identity_raw, b.jurisdiction_code), '\s*\([^)]*\).*$', '')) as jurisdiction_name,
    coalesce((regexp_match(coalesce(b.identity_raw,''), '(?i)FIPS\s*([0-9]{2})'))[1], null) as fips,
    b.population_raw,
    b.medicaid_raw,
    case
      when lower(coalesce(b.medicaid_raw,'')) like '%not expanded%' then false
      when lower(coalesce(b.medicaid_raw,'')) like '%expanded%' and lower(coalesce(b.medicaid_raw,'')) not like '%not full expansion%' then true
      else null
    end as medicaid_expanded,
    b.minimum_wage_raw,
    case when b.minimum_wage_raw ~ '\$[0-9]+([.][0-9]+)?' then ((regexp_match(b.minimum_wage_raw, '\$([0-9]+(?:[.][0-9]+)?)'))[1])::numeric else null end as minimum_wage_sort,
    pp.ui_maximum_raw,
    case when pp.ui_maximum_raw ~ '\$[0-9,]+([.][0-9]+)?' then replace((regexp_match(pp.ui_maximum_raw, '\$([0-9,]+(?:[.][0-9]+)?)'))[1], ',', '')::numeric else null end as ui_maximum_sort,
    pp.ui_duration_raw,
    case when pp.ui_duration_raw ~ '^\s*[0-9]+\s+weeks?' then ((regexp_match(pp.ui_duration_raw, '^\s*([0-9]+)'))[1])::integer else null end as ui_duration_sort_weeks,
    pp.ui_appeal_deadline_raw,
    pp.tanf_raw,
    case when pp.tanf_raw ~ '\$[0-9,]+([.][0-9]+)?' then replace((regexp_match(pp.tanf_raw, '\$([0-9,]+(?:[.][0-9]+)?)'))[1], ',', '')::numeric else null end as tanf_sort,
    pp.wage_sol_raw,
    case when pp.wage_sol_raw ~* '[0-9]+\s*years?' then ((regexp_match(pp.wage_sol_raw, '(?i)([0-9]+)\s*years?'))[1])::numeric else null end as wage_sol_sort_years,
    pp.civil_rights_sol_raw,
    case
      when pp.civil_rights_sol_raw ~* '[0-9]+\s*days?' then ((regexp_match(pp.civil_rights_sol_raw, '(?i)([0-9]+)\s*days?'))[1])::numeric
      when pp.civil_rights_sol_raw ~* '[0-9]+\s*years?' then ((regexp_match(pp.civil_rights_sol_raw, '(?i)([0-9]+)\s*years?'))[1])::numeric * 365
      when pp.civil_rights_sol_raw ~* '[0-9]+\s*months?' then ((regexp_match(pp.civil_rights_sol_raw, '(?i)([0-9]+)\s*months?'))[1])::numeric * 30
      else null
    end as civil_rights_sol_sort_days,
    coalesce(pp.tribal_raw, rm.tribal_coverage_raw) as tribal_raw,
    rm.portability_raw,
    case when rm.portability_raw ~ '[0-9]+([.][0-9]+)?%' then ((regexp_match(rm.portability_raw, '([0-9]+(?:[.][0-9]+)?)%'))[1])::numeric else null end as portability_sort,
    null::boolean as lgbtq_state_protection,
    coalesce(pp.regional_or_unique_raw, rm.regional_profile_raw, rm.unique_features_raw) as regional_or_unique_raw,
    rm.critical_deadlines_raw,
    rm.source_verification_raw,
    rm.policy_alert_count_raw,
    rm.program_card_count_raw,
    rm.workflow_count_raw,
    coalesce(a.alerts, '[]'::jsonb) as alerts,
    pp.labeled_metrics,
    jsonb_build_object(
      'source', 'state_directory_profile_promotion',
      'logical_record_id', b.logical_record_id,
      'run_id', b.run_id,
      'record_fingerprint', b.record_fingerprint,
      'profile_updated_at', b.updated_at,
      'alert_sources', coalesce(a.alert_provenance, '[]'::jsonb)
    ) as provenance,
    'promoted_profile'::text as profile_state,
    greatest(b.updated_at, rm.metric_updated_at) as updated_at
  from base b
  left join pair_pivot pp using (jurisdiction_code, logical_record_id)
  left join registry_metrics rm using (jurisdiction_code)
  left join alerts a using (jurisdiction_code)
),
co_sources as (
  select
    (select coalesce(c.eligibility_summary, c.description) from public.v_lighthouse_civic_object_current_v1 c where c.state_code='CO' and c.object_class='resource' and c.organization_name ilike 'Colorado Department of Health Care Policy and Financing%' and coalesce(c.eligibility_summary,c.description) is not null order by length(coalesce(c.eligibility_summary,c.description)) desc, c.source_created_at desc nulls last limit 1) as medicaid_raw,
    (select c.description from public.v_lighthouse_civic_object_current_v1 c where c.state_code='CO' and c.object_class='resource' and c.organization_name ilike 'Colorado Department of Labor and Employment%' and c.description ilike '%minimum wage%' order by c.source_created_at desc nulls last, length(c.description) desc limit 1) as minimum_wage_raw,
    (select c.eligibility_summary from public.v_lighthouse_civic_object_current_v1 c where c.state_code='CO' and c.object_class='program' and c.section_name='pass3_program_card' and c.eligibility_summary ilike '%week%' and c.eligibility_summary ilike '%weeks maximum%' order by c.source_created_at desc nulls last limit 1) as ui_raw,
    (select c.deadline from public.v_lighthouse_civic_object_current_v1 c where c.state_code='CO' and c.object_class='workflow' and c.section_name='pass3_workflow_step' and c.deadline ilike '%20 days%' order by c.source_created_at desc nulls last limit 1) as ui_appeal_raw,
    (select c.eligibility_summary from public.v_lighthouse_civic_object_current_v1 c where c.state_code='CO' and c.object_class='program' and c.section_name='pass3_program_card' and c.eligibility_summary ilike '%family of 3%' order by c.source_created_at desc nulls last limit 1) as tanf_raw,
    (select coalesce(c.name,c.description) from public.v_lighthouse_civic_object_current_v1 c where c.state_code='CO' and c.object_class='policy_alert' and c.section_name='pass3_policy_alert' and coalesce(c.name,c.description) ilike '%3-Year Wage SOL%' order by c.source_created_at desc nulls last limit 1) as wage_sol_raw,
    (select c.description from public.v_lighthouse_civic_object_current_v1 c where c.state_code='CO' and c.object_class='resource' and c.organization_name ilike 'Colorado Civil Rights Division%' and c.description ilike '%employment 300 days%' order by c.source_created_at desc nulls last, length(c.description) desc limit 1) as civil_rights_sol_raw
),
colorado as (
  select
    'CO'::text as jurisdiction_code,
    'Colorado'::text as jurisdiction_name,
    '08'::text as fips,
    null::text as population_raw,
    cs.medicaid_raw,
    case when lower(coalesce(cs.medicaid_raw,'')) like '%no coverage gap%' or lower(coalesce(cs.medicaid_raw,'')) like '%expanded%' then true else null end as medicaid_expanded,
    cs.minimum_wage_raw,
    case when cs.minimum_wage_raw ~ '\$[0-9]+([.][0-9]+)?' then ((regexp_match(cs.minimum_wage_raw, '\$([0-9]+(?:[.][0-9]+)?)'))[1])::numeric else null end as minimum_wage_sort,
    cs.ui_raw as ui_maximum_raw,
    case when cs.ui_raw ~ '\$[0-9,]+([.][0-9]+)?' then replace((regexp_match(cs.ui_raw, '\$([0-9,]+(?:[.][0-9]+)?)'))[1], ',', '')::numeric else null end as ui_maximum_sort,
    cs.ui_raw as ui_duration_raw,
    case when cs.ui_raw ~* '[0-9]+\s+weeks?\s+maximum' then ((regexp_match(cs.ui_raw, '(?i)([0-9]+)\s+weeks?\s+maximum'))[1])::integer else null end as ui_duration_sort_weeks,
    cs.ui_appeal_raw as ui_appeal_deadline_raw,
    cs.tanf_raw,
    case when cs.tanf_raw ~ '\$[0-9,]+([.][0-9]+)?' then replace((regexp_match(cs.tanf_raw, '\$([0-9,]+(?:[.][0-9]+)?)'))[1], ',', '')::numeric else null end as tanf_sort,
    cs.wage_sol_raw,
    case when cs.wage_sol_raw ~* '[0-9]+[- ]year' then ((regexp_match(cs.wage_sol_raw, '(?i)([0-9]+)[- ]year'))[1])::numeric else null end as wage_sol_sort_years,
    cs.civil_rights_sol_raw,
    case when cs.civil_rights_sol_raw ~* 'employment\s+([0-9]+)\s+days' then ((regexp_match(cs.civil_rights_sol_raw, '(?i)employment\s+([0-9]+)\s+days'))[1])::numeric else null end as civil_rights_sol_sort_days,
    coalesce(rm.tribal_coverage_raw, 'Southern Ute Indian Tribe; Ute Mountain Ute Tribe') as tribal_raw,
    rm.portability_raw,
    case when rm.portability_raw ~ '[0-9]+([.][0-9]+)?%' then ((regexp_match(rm.portability_raw, '([0-9]+(?:[.][0-9]+)?)%'))[1])::numeric else null end as portability_sort,
    null::boolean as lgbtq_state_protection,
    coalesce(rm.regional_profile_raw, rm.unique_features_raw) as regional_or_unique_raw,
    rm.critical_deadlines_raw,
    rm.source_verification_raw,
    rm.policy_alert_count_raw,
    rm.program_card_count_raw,
    rm.workflow_count_raw,
    coalesce(a.alerts, '[]'::jsonb) as alerts,
    jsonb_build_object(
      'UI Maximum / Duration', cs.ui_raw,
      'UI Appeal Deadline', cs.ui_appeal_raw,
      'TANF', cs.tanf_raw,
      'Wage SOL', cs.wage_sol_raw,
      'Civil Rights Windows', cs.civil_rights_sol_raw
    ) as labeled_metrics,
    jsonb_build_object(
      'source', 'current_corpus_fallback',
      'jurisdiction_code', 'CO',
      'alert_sources', coalesce(a.alert_provenance, '[]'::jsonb),
      'note', 'Colorado has no jurisdiction_snapshot promotion row; values are selected from current provenance-bound civic objects and promoted registry metrics.'
    ) as provenance,
    'corpus_fallback'::text as profile_state,
    rm.metric_updated_at as updated_at
  from co_sources cs
  left join registry_metrics rm on rm.jurisdiction_code='CO'
  left join alerts a on a.jurisdiction_code='CO'
),
all_profiles as (
  select * from promoted where jurisdiction_code <> 'CO'
  union all
  select * from colorado
)
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
  updated_at,
  case
    when jurisdiction_code='CO' then 'source_bound_fallback'
    when medicaid_raw is null and minimum_wage_raw is null and population_raw is null then 'insufficient'
    else 'source_bound'
  end as data_state
from all_profiles;

comment on view public.v_anomaly_viewfinder_live_v1 is 'Live source-bound 56-jurisdiction read model for Anomaly Viewfinder. Raw source text is authoritative; numeric *_sort fields are display/sort helpers only. Missing unsupported fields remain NULL.';

revoke all on public.v_anomaly_viewfinder_live_v1 from public;
revoke all on public.v_anomaly_viewfinder_live_v1 from anon;
revoke all on public.v_anomaly_viewfinder_live_v1 from authenticated;
grant select on public.v_anomaly_viewfinder_live_v1 to service_role;
