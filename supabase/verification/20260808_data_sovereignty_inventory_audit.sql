-- Luminari data-sovereignty inventory audit
-- READ ONLY. Performs no deletion or mutation.

begin;
set local transaction_read_only = on;
set local statement_timeout = '120s';

-- 1. Candidate user/case-owned columns across all non-system schemas.
select
  c.table_schema,
  c.table_name,
  string_agg(c.column_name, ', ' order by c.ordinal_position) as ownership_columns
from information_schema.columns c
where c.table_schema not in ('pg_catalog', 'information_schema')
  and (
    c.column_name in (
      'user_id','owner_user_id','created_by','uploaded_by','added_by',
      'case_id','case_uuid','legacy_case_id',
      'document_id','source_document_id','target_document_id',
      'intake_session_id','artifact_id','layer_run_id',
      'request_id','receipt_id','assembly_run_id'
    )
    or c.column_name like '%user%id%'
    or c.column_name like '%case%id%'
    or c.column_name like '%document%id%'
    or c.column_name like '%session%id%'
    or c.column_name like '%artifact%id%'
  )
group by c.table_schema, c.table_name
order by c.table_schema, c.table_name;

-- 2. Foreign-key deletion behavior for likely ownership roots.
select
  ns_child.nspname as child_schema,
  child.relname as child_table,
  con.conname as constraint_name,
  ns_parent.nspname as parent_schema,
  parent.relname as parent_table,
  case con.confdeltype
    when 'a' then 'no_action'
    when 'r' then 'restrict'
    when 'c' then 'cascade'
    when 'n' then 'set_null'
    when 'd' then 'set_default'
    else con.confdeltype::text
  end as on_delete
from pg_constraint con
join pg_class child on child.oid = con.conrelid
join pg_namespace ns_child on ns_child.oid = child.relnamespace
join pg_class parent on parent.oid = con.confrelid
join pg_namespace ns_parent on ns_parent.oid = parent.relnamespace
where con.contype = 'f'
  and (
    parent.relname in (
      'users','cases','documents','case_identity_bridge','intake_sessions',
      'intake_artifacts','intake_layer_runs','corpus_snapshots'
    )
    or child.relname in (
      'users','cases','documents','case_identity_bridge','intake_sessions',
      'intake_artifacts','intake_layer_runs','corpus_snapshots'
    )
  )
order by parent_schema, parent_table, child_schema, child_table, constraint_name;

-- 3. Tables containing source/storage identity that require object deletion or export.
select
  c.table_schema,
  c.table_name,
  string_agg(c.column_name, ', ' order by c.ordinal_position) as storage_or_source_columns
from information_schema.columns c
where c.table_schema not in ('pg_catalog', 'information_schema')
  and (
    c.column_name in (
      'storage_bucket','storage_object_path','storage_key','s3_key','s3_url',
      'sha256','sha256_hash','source_url','source_uri','source_path','file_path'
    )
    or c.column_name like '%storage%'
    or c.column_name like '%bucket%'
    or c.column_name like '%object%path%'
    or c.column_name like '%sha256%'
  )
group by c.table_schema, c.table_name
order by c.table_schema, c.table_name;

-- 4. Existing functions that may participate in export, delete, purge, retention, or erasure.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and p.proname ~* '(delete|erase|purge|forget|export|archive|retention|expire|remove)'
order by n.nspname, p.proname, identity_arguments;

-- 5. RLS status and policies on likely user/case-owned tables.
with candidate_tables as (
  select distinct c.table_schema, c.table_name
  from information_schema.columns c
  where c.table_schema not in ('pg_catalog', 'information_schema')
    and (
      c.column_name in ('user_id','owner_user_id','case_id','case_uuid','legacy_case_id','intake_session_id')
      or c.column_name like '%user%id%'
      or c.column_name like '%case%id%'
    )
)
select
  ct.table_schema,
  ct.table_name,
  cls.relrowsecurity as rls_enabled,
  pol.policyname,
  pol.cmd,
  pol.roles,
  pol.qual,
  pol.with_check
from candidate_tables ct
join pg_namespace ns on ns.nspname = ct.table_schema
join pg_class cls on cls.relnamespace = ns.oid and cls.relname = ct.table_name
left join pg_policies pol on pol.schemaname = ct.table_schema and pol.tablename = ct.table_name
order by ct.table_schema, ct.table_name, pol.policyname;

-- 6. Supabase Storage inventory shape (when storage schema is present).
select
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'storage' and table_name = 'objects'
  ) as storage_objects_table_exists;

-- 7. Intake Spine deletion topology: identifies sessions that would survive case deletion.
select
  cil.case_uuid,
  cib.legacy_case_id,
  cil.intake_session_id,
  count(distinct ia.artifact_id) as artifact_count,
  count(distinct ilr.layer_run_id) as layer_run_count,
  count(distinct ivr.verification_record_id) as verification_record_count,
  count(distinct ist.transition_id) as transition_count
from public.case_intake_links cil
join public.case_identity_bridge cib on cib.case_uuid = cil.case_uuid
left join public.intake_artifacts ia on ia.intake_session_id = cil.intake_session_id
left join public.intake_layer_runs ilr on ilr.intake_session_id = cil.intake_session_id
left join public.intake_verification_records ivr on ivr.intake_session_id = cil.intake_session_id
left join public.intake_state_transitions ist on ist.intake_session_id = cil.intake_session_id
group by cil.case_uuid, cib.legacy_case_id, cil.intake_session_id
order by cib.legacy_case_id, cil.intake_session_id;

rollback;
