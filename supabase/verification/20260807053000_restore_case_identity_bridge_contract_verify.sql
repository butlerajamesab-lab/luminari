-- Lighthouse case identity / narrative compatibility verification.
-- Read-only. Safe to run repeatedly.

begin;
set local transaction_read_only = on;

-- Every legacy case must have exactly one UUID bridge identity.
select
  count(*)::int as legacy_case_count,
  count(b.case_uuid)::int as bridged_case_count,
  count(*) filter (where b.case_uuid is null)::int as missing_bridge_count
from public.cases c
left join public.case_identity_bridge b
  on b.legacy_case_id = c.id;

-- The future-case bridge trigger must be installed and enabled.
select
  t.tgname as trigger_name,
  t.tgenabled as trigger_enabled,
  p.proname as function_name
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.cases'::regclass
  and not t.tgisinternal
  and t.tgname = 'trg_cases_ensure_identity_bridge_v1';

-- Case narrative identity must be unambiguous for deterministic upsert.
select
  i.indexname,
  i.indexdef
from pg_indexes i
where i.schemaname = 'public'
  and i.tablename = 'case_narratives'
  and i.indexname = 'ux_case_narratives_case_id';

-- Exercise the mixed case-key count seam without writing anything.
with bridge as (
  select legacy_case_id, case_uuid
  from public.case_identity_bridge
)
select
  c.id as legacy_case_id,
  b.case_uuid,
  (select count(*)::int from public.documents d where d.case_id = c.id) as document_count,
  (select count(*)::int from public.events e where e.case_id = b.case_uuid) as event_count
from public.cases c
left join bridge b on b.legacy_case_id = c.id
order by c.id;

rollback;
