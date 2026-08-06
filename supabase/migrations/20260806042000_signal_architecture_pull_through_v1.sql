begin;

-- The canonical signal stores already exist. This migration adds an explicit
-- pull-through classifier between the verified Atlas bridge and Domain 3.
-- Raw observations, transport records, and operational health notices remain
-- visible but cannot silently become live_data_signals.

create table if not exists public.signal_domain3_source_classification_v1 (
  classification_id uuid primary key default gen_random_uuid(),
  classifier_id text not null default 'signal_domain3_source_classifier',
  classifier_version text not null,
  source_signal_type text not null,
  source_rule_id text not null,
  source_rule_version text not null,
  source_view text not null,
  output_class text not null,
  eligible_for_canonical_registration boolean not null,
  rationale text not null,
  rule_hash text not null,
  created_at timestamptz not null default now(),
  constraint signal_domain3_source_class_output_check check (
    output_class in (
      'systemic_candidate',
      'observation_only',
      'operational_only',
      'unsupported_rule'
    )
  ),
  constraint signal_domain3_source_class_eligibility_check check (
    eligible_for_canonical_registration = (output_class = 'systemic_candidate')
  ),
  constraint signal_domain3_source_class_hash_check check (
    rule_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint signal_domain3_source_class_unique unique (
    classifier_id,
    classifier_version,
    source_signal_type,
    source_rule_id,
    source_rule_version,
    source_view
  )
);

create or replace function public.reject_signal_domain3_source_classification_mutation_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'signal_domain3_source_classification_v1 is append-only';
end
$function$;

revoke all on function public.reject_signal_domain3_source_classification_mutation_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists signal_domain3_source_classification_immutable_v1
  on public.signal_domain3_source_classification_v1;
create trigger signal_domain3_source_classification_immutable_v1
before update or delete on public.signal_domain3_source_classification_v1
for each row execute function public.reject_signal_domain3_source_classification_mutation_v1();

with declared_rules as (
  select *
  from (values
    (
      'classification_activity',
      'openstates_wa_classification_activity_v1',
      'v1',
      'public.v_civic_map_signals_production',
      'observation_only',
      false,
      'A provider classification observation is source material. It is not statistical evidence of systemic activity by itself.'
    ),
    (
      'jurisdiction_legislative_activity',
      'openstates_wa_jurisdiction_legislative_activity_v1',
      'v1',
      'public.v_civic_map_signals_production',
      'observation_only',
      false,
      'A legislative observation identifies activity in a jurisdiction. It does not establish a systemic live-data signal.'
    ),
    (
      'new_statute_or_bill',
      'openstates_wa_new_statute_or_bill_v1',
      'v1',
      'public.v_civic_map_signals_production',
      'observation_only',
      false,
      'The existence of a new bill or statute is an Atlas observation and Docket input, not a Domain 3 systemic signal.'
    ),
    (
      'stream_health_alert',
      'post_investigation_prime_pattern_bridge_v1',
      'v1',
      'public.v_civic_map_signals_production',
      'operational_only',
      false,
      'Stream health describes pipeline operation. It must not be represented as civic harm, actor misconduct, or systemic failure.'
    )
  ) as rule(
    source_signal_type,
    source_rule_id,
    source_rule_version,
    source_view,
    output_class,
    eligible_for_canonical_registration,
    rationale
  )
),
receipts as (
  select
    rule.*,
    public.signal_architecture_hash_v1(jsonb_build_object(
      'classifier_id', 'signal_domain3_source_classifier',
      'classifier_version', '1.0.0',
      'source_signal_type', rule.source_signal_type,
      'source_rule_id', rule.source_rule_id,
      'source_rule_version', rule.source_rule_version,
      'source_view', rule.source_view,
      'output_class', rule.output_class,
      'eligible_for_canonical_registration', rule.eligible_for_canonical_registration,
      'rationale', rule.rationale
    )) as rule_hash
  from declared_rules rule
)
insert into public.signal_domain3_source_classification_v1 (
  classifier_id,
  classifier_version,
  source_signal_type,
  source_rule_id,
  source_rule_version,
  source_view,
  output_class,
  eligible_for_canonical_registration,
  rationale,
  rule_hash
)
select
  'signal_domain3_source_classifier',
  '1.0.0',
  source_signal_type,
  source_rule_id,
  source_rule_version,
  source_view,
  output_class,
  eligible_for_canonical_registration,
  rationale,
  rule_hash
from receipts
on conflict (
  classifier_id,
  classifier_version,
  source_signal_type,
  source_rule_id,
  source_rule_version,
  source_view
) do nothing;

create or replace view public.v_atlas_domain3_signal_candidates_v1
with (security_invoker = true)
as
select
  bridge.bridge_record_id,
  bridge.atlas_signal_id,
  bridge.signal_type,
  bridge.source_system,
  bridge.bridge_version,
  bridge.source_connector_id,
  bridge.raw_record_id,
  bridge.statute_id,
  bridge.entity_ids,
  bridge.jurisdiction_raw_value,
  bridge.jurisdiction_id,
  bridge.source_url,
  bridge.detected_at,
  bridge.bridged_at,
  bridge.confidence_score,
  bridge.severity,
  bridge.signal_status,
  bridge.rule_id,
  bridge.rule_version,
  bridge.generation_method,
  bridge.record_origin,
  bridge.verification_status,
  bridge.source_view,
  coalesce(classification.output_class, 'unsupported_rule') as source_class,
  coalesce(classification.eligible_for_canonical_registration, false)
    as eligible_for_canonical_registration,
  coalesce(
    classification.rationale,
    'No active Domain 3 source-classification rule exists for this exact signal type, rule generation, and source view.'
  ) as classification_reason,
  classification.rule_hash as classification_rule_hash,
  public.signal_architecture_hash_v1(jsonb_build_object(
    'contract', 'atlas_domain3_signal_candidate.v1',
    'bridge_record_id', bridge.bridge_record_id,
    'atlas_signal_id', bridge.atlas_signal_id,
    'signal_type', bridge.signal_type,
    'source_rule_id', bridge.rule_id,
    'source_rule_version', bridge.rule_version,
    'source_view', bridge.source_view,
    'source_class', coalesce(classification.output_class, 'unsupported_rule'),
    'classification_rule_hash', classification.rule_hash
  )) as candidate_hash
from public.v_atlas_lighthouse_bridge_v1_verified bridge
left join public.signal_domain3_source_classification_v1 classification
  on classification.classifier_id = 'signal_domain3_source_classifier'
 and classification.classifier_version = '1.0.0'
 and classification.source_signal_type = bridge.signal_type
 and classification.source_rule_id = bridge.rule_id
 and classification.source_rule_version = bridge.rule_version
 and classification.source_view = bridge.source_view;

create or replace view public.v_signal_pull_through_inventory_v1
with (security_invoker = true)
as
with domain_counts as (
  select
    domain_code,
    domain_label,
    canonical_relation,
    source_owner,
    total_record_count,
    current_record_count,
    latest_record_at
  from public.v_signal_architecture_summary
),
atlas_classification as (
  select
    source_class,
    count(*)::bigint as record_count,
    count(*) filter (where eligible_for_canonical_registration)::bigint
      as eligible_record_count,
    max(detected_at) as latest_detected_at
  from public.v_atlas_domain3_signal_candidates_v1
  group by source_class
)
select jsonb_build_object(
  'contract_id', 'luminari.signal_pull_through.v1',
  'contract_version', '1.0.0',
  'source_domains', coalesce((
    select jsonb_agg(jsonb_build_object(
      'domain_code', domain_code,
      'domain_label', domain_label,
      'canonical_relation', canonical_relation,
      'source_owner', source_owner,
      'total_record_count', total_record_count,
      'current_record_count', current_record_count,
      'latest_record_at', latest_record_at
    ) order by case domain_code
      when 'case_intake' then 1
      when 'legal_pattern' then 2
      when 'live_data' then 3
      else 4 end)
    from domain_counts
  ), '[]'::jsonb),
  'atlas_bridge', jsonb_build_object(
    'verified_transport_rows', (
      select count(*)::bigint
      from public.v_atlas_lighthouse_bridge_v1_verified
    ),
    'classifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_class', source_class,
        'record_count', record_count,
        'eligible_record_count', eligible_record_count,
        'latest_detected_at', latest_detected_at
      ) order by source_class)
      from atlas_classification
    ), '[]'::jsonb),
    'eligible_systemic_candidates', (
      select count(*)::bigint
      from public.v_atlas_domain3_signal_candidates_v1
      where eligible_for_canonical_registration
    )
  ),
  'legacy_quarantine', jsonb_build_object(
    'detected_signals', (select count(*)::bigint from public.detected_signals),
    'live_signals', (select count(*)::bigint from public.live_signals),
    'status', 'preserved_noncanonical'
  ),
  'raw_atlas_observations', jsonb_build_object(
    'signal_events', (select count(*)::bigint from public.signal_events),
    'status', 'input_evidence_not_canonical_signal'
  ),
  'convergence_readiness', jsonb_build_object(
    'case_intake_ready', exists(select 1 from public.intake_signals where is_current),
    'legal_pattern_ready', exists(select 1 from public.legal_patterns where is_current),
    'live_data_ready', exists(select 1 from public.live_data_signals where is_current),
    'three_domain_convergence_ready',
      exists(select 1 from public.intake_signals where is_current)
      and exists(select 1 from public.legal_patterns where is_current)
      and exists(select 1 from public.live_data_signals where is_current)
  )
) as inventory;

create or replace function public.get_signal_pull_through_snapshot_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_inventory jsonb;
  v_semantic_body jsonb;
begin
  select inventory into v_inventory
  from public.v_signal_pull_through_inventory_v1;

  v_semantic_body := jsonb_build_object(
    'contract_id', v_inventory->>'contract_id',
    'contract_version', v_inventory->>'contract_version',
    'source_domains', v_inventory->'source_domains',
    'atlas_bridge', v_inventory->'atlas_bridge',
    'legacy_quarantine', v_inventory->'legacy_quarantine',
    'raw_atlas_observations', v_inventory->'raw_atlas_observations',
    'convergence_readiness', v_inventory->'convergence_readiness'
  );

  return v_semantic_body || jsonb_build_object(
    'snapshot_hash', public.signal_architecture_hash_v1(v_semantic_body),
    'generated_at', now()
  );
end
$function$;

alter table public.signal_domain3_source_classification_v1 enable row level security;

revoke all on table public.signal_domain3_source_classification_v1
  from public, anon, authenticated;
revoke all on table public.v_atlas_domain3_signal_candidates_v1
  from public, anon, authenticated;
revoke all on table public.v_signal_pull_through_inventory_v1
  from public, anon, authenticated;
revoke all on function public.get_signal_pull_through_snapshot_v1()
  from public, anon, authenticated;

grant select on table public.signal_domain3_source_classification_v1
  to service_role;
grant select on table public.v_atlas_domain3_signal_candidates_v1
  to service_role;
grant select on table public.v_signal_pull_through_inventory_v1
  to service_role;
grant execute on function public.get_signal_pull_through_snapshot_v1()
  to service_role;

comment on table public.signal_domain3_source_classification_v1 is
  'Immutable rules classifying exact verified Atlas bridge outputs before any Domain 3 canonical registration. Observation and operational records remain noncanonical.';
comment on view public.v_atlas_domain3_signal_candidates_v1 is
  'Read-only classification of verified Atlas transport rows. Eligibility is explicit and defaults to false for unknown rule generations.';
comment on view public.v_signal_pull_through_inventory_v1 is
  'Public-safe shape, service-role restricted, summarizing three canonical source domains, Atlas source classifications, legacy quarantine, and convergence readiness without exposing intake details.';
comment on function public.get_signal_pull_through_snapshot_v1() is
  'Returns a deterministic semantic snapshot for the Prism live-convergence handoff. generated_at is excluded from snapshot_hash.';

commit;
