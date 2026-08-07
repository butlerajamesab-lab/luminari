-- Guided Intake / Universal Intake Spine case binding verification.
-- Read-only. Safe to run repeatedly.

begin;
set local transaction_read_only = on;

select
  count(*)::int as case_count,
  count(*) filter (where b.case_uuid is not null)::int as bridged_case_count,
  count(*) filter (where primary_link.intake_session_id is not null)::int as primary_intake_case_count,
  count(*) filter (where b.case_uuid is null)::int as missing_bridge_count,
  count(*) filter (where primary_link.intake_session_id is null)::int as missing_primary_intake_count
from public.cases c
left join public.case_identity_bridge b
  on b.legacy_case_id = c.id
left join lateral (
  select link.intake_session_id
  from public.case_intake_links link
  where link.case_uuid = b.case_uuid
    and link.is_primary = true
  order by link.created_at asc, link.case_intake_link_id asc
  limit 1
) primary_link on true;

select
  c.id as legacy_case_id,
  c.name,
  b.case_uuid,
  link.intake_session_id,
  s.session_type,
  s.entry_channel,
  s.session_status,
  s.completion_state,
  s.privacy_mode
from public.cases c
join public.case_identity_bridge b
  on b.legacy_case_id = c.id
left join public.case_intake_links link
  on link.case_uuid = b.case_uuid
 and link.is_primary = true
left join public.intake_sessions s
  on s.intake_session_id = link.intake_session_id
order by c.id;

select
  t.tgname as trigger_name,
  t.tgenabled as trigger_enabled,
  p.proname as function_name
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.cases'::regclass
  and not t.tgisinternal
  and t.tgname = 'trg_cases_ensure_identity_bridge_v1';

rollback;
