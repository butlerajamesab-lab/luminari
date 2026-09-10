-- Read-only verification for 20260909143000_lighthouse_runtime_postgres_contract_v1.
-- This file is safe to run repeatedly on preview and production.

do $$
declare
  relation_name text;
  unprotected_tables text;
  leaked_privileges text;
  type_mismatches text;
begin
  foreach relation_name in array array[
    'data_stream_registry',
    'ingest_runs',
    'ingested_records',
    'live_signals',
    'registry_jurisdictions',
    'registry_programs',
    'registry_policy_alerts',
    'registry_workflows',
    'registry_oversight_bodies',
    'registry_source_traceability',
    'registry_signals',
    'patterns',
    'pattern_occurrences',
    'trend_registry',
    'strategy_registry',
    'sunam_gate_log',
    'presentations',
    'presentation_slides',
    'entity_merge_suggestions',
    'user_feedback',
    'case_state',
    'case_flags',
    'lumensend_templates',
    'lumensend_drafts',
    'remedy_templates',
    'remedy_doc_generated',
    'doc_generation_queue',
    'template_effectiveness',
    'strategy_memory',
    'restore_spine_runs',
    'pattern_timeline_events',
    'campaigns',
    'coalition_memberships',
    'coalition_campaign_targets',
    'campaign_actions',
    'campaign_outcomes',
    'v_active_trends',
    'v_active_patterns',
    'v_active_strategies',
    'v_gate_decisions',
    'v_signal_lineage',
    'v_staged_signals',
    'v_pipeline_health'
  ]
  loop
    if to_regclass(format('public.%I', relation_name)) is null then
      raise exception 'Missing Lighthouse runtime relation public.%', relation_name;
    end if;
  end loop;

  if not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'patterns'
       and c.relkind in ('r', 'p')
  ) then
    raise exception 'public.patterns is not a writable table';
  end if;

  if exists (
    select 1 from public.patterns group by pattern_key having count(*) > 1
  ) then
    raise exception 'Duplicate pattern_key values remain';
  end if;

  if exists (
    select 1
      from public.data_stream_registry
     where stream_id_dsr is not null
     group by stream_id_dsr
    having count(*) > 1
  ) then
    raise exception 'Duplicate canonical data-stream IDs remain';
  end if;

  if exists (
    select 1
      from public.live_signals
     where signal_fingerprint is not null
     group by signal_fingerprint
    having count(*) > 1
  ) then
    raise exception 'Duplicate live-signal fingerprints remain';
  end if;

  with expected(table_name, column_name, udt_name) as (
    values
      ('data_stream_registry', 'field_mapping_dsr', 'jsonb'),
      ('data_stream_registry', 'created_at_dsr', 'int8'),
      ('data_stream_registry', 'last_ingested_at_dsr', 'int8'),
      ('data_stream_registry', 'last_success_at_dsr', 'int8'),
      ('data_stream_registry', 'last_http_status_dsr', 'int4'),
      ('ingest_runs', 'errors_run', 'jsonb'),
      ('ingested_records', 'raw_json', 'jsonb'),
      ('ingested_records', 'metadata_l1_l2', 'jsonb'),
      ('ingested_records', 'normalized_date', 'timestamptz'),
      ('ingested_records', 'normalized_amount', 'numeric'),
      ('ingested_records', 'ingested_at', 'int8'),
      ('ingested_records', 'processed_for_signals', 'bool'),
      ('live_signals', 'supporting_statistics', 'jsonb'),
      ('live_signals', 'confidence_score', 'numeric'),
      ('live_signals', 'entity_aliases_json', 'jsonb'),
      ('live_signals', 'entity_confidence_score_ls', 'numeric'),
      ('live_signals', 'role_confidence', 'numeric'),
      ('registry_workflows', 'steps_rw', 'jsonb'),
      ('registry_source_traceability', 'source_documents_rst', 'jsonb'),
      ('registry_source_traceability', 'source_variants_rst', 'jsonb'),
      ('registry_source_traceability', 'conflicts_rst', 'jsonb')
  )
  select string_agg(
           format('%I.%I expected %s, found %s', e.table_name, e.column_name, e.udt_name, coalesce(c.udt_name, 'missing')),
           ', ' order by e.table_name, e.column_name
         )
    into type_mismatches
    from expected e
    left join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = e.table_name
     and c.column_name = e.column_name
   where c.udt_name is distinct from e.udt_name;

  if type_mismatches is not null then
    raise exception 'Runtime contract type mismatch: %', type_mismatches;
  end if;

  if exists (
    select 1
      from public.patterns
     where signature is not null
     group by signature
    having count(*) > 1
  ) then
    raise exception 'Duplicate non-null pattern signatures remain';
  end if;

  if exists (
    select 1
      from public.patterns
     where source_signature is not null
       and signature is not distinct from source_signature
  ) then
    raise exception 'A duplicated legacy pattern signature was not separated from its preserved source value';
  end if;

  if (select count(*) from public.v_signal_lineage)
     <> (select count(*) from public.detected_signals) then
    raise exception 'Signal-lineage projection dropped or duplicated source rows';
  end if;

  if exists (
    select 1
      from public.v_signal_lineage
     where linked_pattern_id is not null
        or linked_trend_id is not null
        or gate_log_id is not null
  ) then
    raise exception 'Signal-lineage projection invented an unsupported relationship';
  end if;

  if exists (
    select 1
      from public.v_active_patterns
     where pattern_id is null
        or signal_count <= 0
        or metadata ->> 'source' <> 'v_active_trends'
        or metadata ->> 'attribution_status' <> 'trend_only'
  ) then
    raise exception 'Active-pattern projection contains an ungoverned row';
  end if;

  if (select count(*) from public.v_active_patterns)
     > (select count(*) from public.v_active_trends) then
    raise exception 'Active-pattern projection expanded beyond its governed trend source';
  end if;

  select string_agg(c.relname, ', ' order by c.relname)
    into unprotected_tables
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and c.relname in (
       'data_stream_registry', 'ingest_runs', 'ingested_records', 'live_signals',
       'registry_policy_alerts', 'registry_workflows',
       'registry_oversight_bodies', 'registry_source_traceability',
       'registry_signals',
       'patterns', 'pattern_occurrences', 'trend_registry', 'strategy_registry',
       'sunam_gate_log', 'presentations', 'presentation_slides',
       'entity_merge_suggestions', 'user_feedback', 'case_state', 'case_flags',
       'lumensend_templates', 'lumensend_drafts', 'remedy_templates',
       'remedy_doc_generated', 'doc_generation_queue', 'template_effectiveness',
       'strategy_memory', 'restore_spine_runs', 'pattern_timeline_events',
       'campaigns', 'coalition_memberships', 'coalition_campaign_targets',
       'campaign_actions', 'campaign_outcomes'
     )
     and not c.relrowsecurity;

  if unprotected_tables is not null then
    raise exception 'Runtime tables are missing RLS: %', unprotected_tables;
  end if;

  select string_agg(distinct format('%I.%I:%I', table_schema, table_name, grantee), ', ')
    into leaked_privileges
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and table_name in (
       'data_stream_registry', 'ingest_runs', 'ingested_records', 'live_signals',
       'registry_policy_alerts', 'registry_workflows',
       'registry_oversight_bodies', 'registry_source_traceability',
       'registry_signals',
       'patterns', 'pattern_occurrences', 'trend_registry', 'strategy_registry',
       'sunam_gate_log', 'presentations', 'presentation_slides',
       'entity_merge_suggestions', 'user_feedback', 'case_state', 'case_flags',
       'lumensend_templates', 'lumensend_drafts', 'remedy_templates',
       'remedy_doc_generated', 'doc_generation_queue', 'template_effectiveness',
       'strategy_memory', 'restore_spine_runs', 'pattern_timeline_events',
       'campaigns', 'coalition_memberships', 'coalition_campaign_targets',
       'campaign_actions', 'campaign_outcomes', 'v_active_trends',
       'v_active_patterns', 'v_active_strategies', 'v_gate_decisions',
       'v_signal_lineage', 'v_staged_signals', 'v_pipeline_health'
     );

  if leaked_privileges is not null then
    raise exception 'Client database privileges remain on private runtime relations: %', leaked_privileges;
  end if;

  if not exists (
    select 1
      from public.runtime_contract_receipts
     where migration_version = '20260909143000'
       and contract_name = 'lighthouse_runtime_postgres_contract_v1'
       and notes ->> 'destructive_row_operations' = 'false'
       and notes ->> 'synthetic_user_evidence' = 'false'
       and notes ->> 'unsupported_lineage_inference' = 'false'
  ) then
    raise exception 'Lighthouse runtime contract receipt is absent or invalid';
  end if;
end;
$$;

select
  r.migration_version,
  r.contract_name,
  r.applied_at,
  r.metrics,
  r.notes,
  (select count(*) from public.v_pipeline_health) as pipeline_health_rows,
  (select count(*) from public.v_signal_lineage) as signal_lineage_rows,
  (select count(*) from public.v_active_patterns) as active_pattern_rows,
  (select count(*) from public.v_active_trends) as active_trend_rows,
  (select count(*) from public.v_active_strategies) as active_strategy_rows
  ,(select count(*) from public.data_stream_registry) as data_stream_rows
  ,(select count(*) from public.ingest_runs) as ingest_run_rows
  ,(select count(*) from public.live_signals) as live_signal_rows
  ,(select count(*) from public.registry_programs) as registry_program_rows
from public.runtime_contract_receipts r
where r.migration_version = '20260909143000';
