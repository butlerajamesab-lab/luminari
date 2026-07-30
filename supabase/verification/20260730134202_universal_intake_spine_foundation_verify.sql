-- Universal Lighthouse Intake Spine verification
-- Read-only. Safe to run repeatedly.

begin;
set local transaction_read_only = on;

-- 1. Required relations exist and RLS is enabled.
with required_relations(relation_name) as (
  values
    ('case_identity_bridge'),
    ('intake_sessions'),
    ('case_intake_links'),
    ('intake_entry_run_links'),
    ('intake_artifacts'),
    ('stabilization_snapshots'),
    ('intake_layer_runs'),
    ('intake_verification_records'),
    ('intake_state_transitions')
)
select
  rr.relation_name,
  c.oid is not null as exists,
  coalesce(c.relrowsecurity, false) as rls_enabled
from required_relations rr
left join pg_class c
  on c.relname = rr.relation_name
left join pg_namespace n
  on n.oid = c.relnamespace
 and n.nspname = 'public'
order by rr.relation_name;

-- 2. Trigger function is hardened.
select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  p.proconfig as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'luminari_set_updated_at';

-- 3. Fixture acceptance receipt.
with target_session as (
  select intake_session_id, fixture_id, fixture_version, session_status,
         completion_state, source_fingerprint
  from public.intake_sessions
  where fixture_id = 'intake_spine_fixture_cheryl_rick_cross_domain_v1'
    and fixture_version = '1.2.0'
), artifact_counts as (
  select
    ia.intake_session_id,
    count(*)::int as artifact_count,
    count(*) filter (where artifact_status = 'registered')::int as registered_count,
    count(*) filter (where artifact_status = 'referenced_missing')::int as referenced_missing_count,
    count(*) filter (where parent_artifact_id is not null)::int as child_artifact_count,
    count(*) filter (where storage_bucket is not null or storage_object_path is not null)::int as lighthouse_storage_count
  from public.intake_artifacts ia
  join target_session ts on ts.intake_session_id = ia.intake_session_id
  group by ia.intake_session_id
), layer_counts as (
  select
    ilr.intake_session_id,
    count(*)::int as layer_run_count,
    count(*) filter (where is_sealed and run_status = 'completed')::int as sealed_completed_count,
    jsonb_agg(jsonb_build_object(
      'layer_name', ilr.layer_name,
      'run_status', ilr.run_status,
      'is_sealed', ilr.is_sealed,
      'input_hash', ilr.input_hash,
      'output_hash', ilr.output_hash
    ) order by ilr.started_at) as layer_runs
  from public.intake_layer_runs ilr
  join target_session ts on ts.intake_session_id = ilr.intake_session_id
  group by ilr.intake_session_id
), stabilization as (
  select
    ss.intake_session_id,
    count(*)::int as stabilization_count,
    jsonb_agg(jsonb_build_object(
      'checkpoint_key', ss.checkpoint_key,
      'snapshot_status', ss.snapshot_status,
      'rule_version', ss.rule_version,
      'input_hash', ss.input_hash,
      'output_hash', ss.output_hash
    ) order by ss.created_at) as checkpoints
  from public.stabilization_snapshots ss
  join target_session ts on ts.intake_session_id = ss.intake_session_id
  group by ss.intake_session_id
)
select
  ts.*,
  coalesce(ac.artifact_count,0) as artifact_count,
  coalesce(ac.registered_count,0) as registered_count,
  coalesce(ac.referenced_missing_count,0) as referenced_missing_count,
  coalesce(ac.child_artifact_count,0) as child_artifact_count,
  coalesce(ac.lighthouse_storage_count,0) as lighthouse_storage_count,
  coalesce(lc.layer_run_count,0) as layer_run_count,
  coalesce(lc.sealed_completed_count,0) as sealed_completed_count,
  coalesce(lc.layer_runs,'[]'::jsonb) as layer_runs,
  coalesce(s.stabilization_count,0) as stabilization_count,
  coalesce(s.checkpoints,'[]'::jsonb) as checkpoints,
  (select count(*)::int
     from public.case_intake_links cil
    where cil.intake_session_id = ts.intake_session_id) as case_link_count
from target_session ts
left join artifact_counts ac using (intake_session_id)
left join layer_counts lc using (intake_session_id)
left join stabilization s using (intake_session_id);

rollback;