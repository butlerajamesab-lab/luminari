-- Bind every Lighthouse case to a primary Universal Intake Spine session.
--
-- Existing primary sessions (including fixture/system sessions) are preserved.
-- Only cases with no primary case_intake_link receive a new restricted live
-- session. Future case inserts receive the same bridge+session atomically from
-- the existing case identity trigger.

begin;

-- Backfill only cases that currently have no primary Intake Spine session.
with missing as (
  select
    c.id as legacy_case_id,
    c.user_id as owner_user_id,
    c.name as source_label,
    b.case_uuid,
    gen_random_uuid() as intake_session_id,
    encode(
      extensions.digest(
        convert_to('lighthouse:legacy-case:' || c.id::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    ) as source_fingerprint
  from public.cases c
  join public.case_identity_bridge b
    on b.legacy_case_id = c.id
  where not exists (
    select 1
    from public.case_intake_links link
    where link.case_uuid = b.case_uuid
      and link.is_primary = true
  )
), inserted_sessions as (
  insert into public.intake_sessions (
    intake_session_id,
    owner_user_id,
    session_type,
    entry_channel,
    source_label,
    privacy_mode,
    session_status,
    completion_state,
    source_fingerprint,
    metadata
  )
  select
    intake_session_id,
    owner_user_id,
    'live',
    'case_workspace_recovery',
    source_label,
    'restricted',
    'open',
    'started',
    source_fingerprint,
    jsonb_build_object(
      'legacy_case_id', legacy_case_id,
      'adapter', 'lighthouse_intake_spine',
      'adapter_version', '1.0.0'
    )
  from missing
  returning intake_session_id
)
insert into public.case_intake_links (
  intake_session_id,
  case_uuid,
  link_type,
  is_primary,
  metadata
)
select
  m.intake_session_id,
  m.case_uuid,
  'primary_projection',
  true,
  jsonb_build_object(
    'legacy_case_id', m.legacy_case_id,
    'adapter', 'lighthouse_intake_spine',
    'adapter_version', '1.0.0'
  )
from missing m
join inserted_sessions s
  on s.intake_session_id = m.intake_session_id
on conflict (intake_session_id, case_uuid) do nothing;

-- Extend the already-installed case bridge trigger so future cases receive both
-- identity generations and a primary Intake Spine session in the same database
-- transaction as case creation. The existing bridge UUID is never replaced.
create or replace function public.luminari_ensure_case_identity_bridge_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  resolved_case_uuid uuid;
  created_intake_session_id uuid;
  source_fingerprint_value text;
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
  on conflict (legacy_case_id) do update
    set identity_version = excluded.identity_version
  returning case_uuid into resolved_case_uuid;

  if resolved_case_uuid is null then
    raise exception using
      errcode = '23514',
      message = 'case identity bridge could not be resolved';
  end if;

  if not exists (
    select 1
    from public.case_intake_links link
    where link.case_uuid = resolved_case_uuid
      and link.is_primary = true
  ) then
    source_fingerprint_value := encode(
      extensions.digest(
        convert_to('lighthouse:legacy-case:' || new.id::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

    insert into public.intake_sessions (
      owner_user_id,
      session_type,
      entry_channel,
      source_label,
      privacy_mode,
      session_status,
      completion_state,
      source_fingerprint,
      metadata
    ) values (
      new.user_id,
      'live',
      'case_create',
      new.name,
      'restricted',
      'open',
      'started',
      source_fingerprint_value,
      jsonb_build_object(
        'legacy_case_id', new.id,
        'adapter', 'lighthouse_intake_spine',
        'adapter_version', '1.0.0'
      )
    )
    returning intake_session_id into created_intake_session_id;

    insert into public.case_intake_links (
      intake_session_id,
      case_uuid,
      link_type,
      is_primary,
      metadata
    ) values (
      created_intake_session_id,
      resolved_case_uuid,
      'primary_projection',
      true,
      jsonb_build_object(
        'legacy_case_id', new.id,
        'adapter', 'lighthouse_intake_spine',
        'adapter_version', '1.0.0'
      )
    );
  end if;

  return new;
end
$function$;

comment on function public.luminari_ensure_case_identity_bridge_v1() is
  'Creates the explicit UUID case bridge and primary Universal Intake Spine session for every newly inserted legacy Lighthouse case.';

commit;
