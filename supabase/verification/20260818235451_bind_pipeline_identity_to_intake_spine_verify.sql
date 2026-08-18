-- Read-only verification for intake pipeline identity continuity.

begin;
set local transaction_read_only = on;

-- Every case-linked live session whose case has an exact pipeline_type should
-- carry the same pipeline_key in session metadata after the migration.
select
  count(*)::int as mismatched_session_count
from public.intake_sessions s
join public.case_intake_links cil
  on cil.intake_session_id = s.intake_session_id
join public.case_identity_bridge cib
  on cib.case_uuid = cil.case_uuid
join public.cases c
  on c.id = cib.legacy_case_id
where s.session_type = 'live'
  and nullif(btrim(c.pipeline_type), '') is not null
  and coalesce(s.metadata ->> 'pipeline_key', '') is distinct from nullif(btrim(c.pipeline_type), '');

-- The primary authority should agree with the case and preserve the source of
-- the pipeline identity.
select
  c.id as case_id,
  c.pipeline_type,
  s.intake_session_id,
  s.entry_channel,
  s.completion_state,
  s.metadata ->> 'pipeline_key' as pipeline_key,
  s.metadata ->> 'pipeline_key_source' as pipeline_key_source,
  cil.is_primary,
  cil.link_type
from public.cases c
join public.case_identity_bridge cib
  on cib.legacy_case_id = c.id
join public.case_intake_links cil
  on cil.case_uuid = cib.case_uuid
join public.intake_sessions s
  on s.intake_session_id = cil.intake_session_id
where nullif(btrim(c.pipeline_type), '') is not null
order by c.created_at desc, cil.is_primary desc, s.created_at desc
limit 25;

-- Both authority functions must contain the pipeline-key handoff.
select
  p.proname,
  position('pipeline_key' in pg_get_functiondef(p.oid)) > 0 as pipeline_key_bound,
  position('cases.pipeline_type' in pg_get_functiondef(p.oid)) > 0 as pipeline_source_declared
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'luminari_ensure_case_identity_bridge_v1',
    'promote_live_upload_intake_authority_v1'
  )
order by p.proname;

rollback;
