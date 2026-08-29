-- Restore the explicit legacy-case -> UUID case identity seam required by the
-- Universal Intake Spine and newer UUID-addressed case event substrate.
--
-- This migration does not rewrite legacy case IDs or UUID-owned event IDs.
-- It backfills missing bridge identities, ensures future cases receive a bridge,
-- and enforces the existing one-narrative-per-case application contract.

begin;

insert into public.case_identity_bridge (legacy_case_id, identity_version, metadata)
select
  c.id,
  '1.0.0',
  jsonb_build_object(
    'bridge_source', 'lighthouse_case_contract_recovery',
    'bridge_version', '1.0.0'
  )
from public.cases c
left join public.case_identity_bridge b
  on b.legacy_case_id = c.id
where b.legacy_case_id is null
on conflict (legacy_case_id) do nothing;

create or replace function public.luminari_ensure_case_identity_bridge_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  insert into public.case_identity_bridge (
    legacy_case_id,
    identity_version,
    metadata
  ) values (
    new.id,
    '1.0.0',
    jsonb_build_object(
      'bridge_source', 'cases_after_insert',
      'bridge_version', '1.0.0'
    )
  )
  on conflict (legacy_case_id) do nothing;
  return new;
end
$function$;

revoke all on function public.luminari_ensure_case_identity_bridge_v1()
  from public;

do $acl$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.luminari_ensure_case_identity_bridge_v1()
      from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.luminari_ensure_case_identity_bridge_v1()
      from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.luminari_ensure_case_identity_bridge_v1()
      to service_role;
  end if;
end
$acl$;

drop trigger if exists trg_cases_ensure_identity_bridge_v1 on public.cases;
create trigger trg_cases_ensure_identity_bridge_v1
after insert on public.cases
for each row
execute function public.luminari_ensure_case_identity_bridge_v1();

create unique index if not exists ux_case_narratives_case_id
  on public.case_narratives (case_id);

comment on function public.luminari_ensure_case_identity_bridge_v1() is
  'Creates the explicit Universal Intake Spine UUID bridge for every newly inserted legacy Lighthouse case.';
comment on index public.ux_case_narratives_case_id is
  'Enforces the Lighthouse one-current-case-narrative compatibility contract.';

commit;
