-- Preserve the exact Lighthouse intake-card pipeline identity across the
-- Universal Intake Spine case-create and live-upload authority handoff.
--
-- The pipeline key is routing context only. It must not be inferred from the
-- case title and it must not be stored in user_selected_immediate_issue, which
-- remains reserved for explicit stabilization/urgency context.

begin;

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
  pipeline_key_value text := nullif(btrim(new.pipeline_type), '');
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
      jsonb_strip_nulls(jsonb_build_object(
        'legacy_case_id', new.id,
        'adapter', 'lighthouse_intake_spine',
        'adapter_version', '1.1.0',
        'pipeline_key', pipeline_key_value,
        'pipeline_key_source', case when pipeline_key_value is not null then 'cases.pipeline_type' else null end
      ))
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
      jsonb_strip_nulls(jsonb_build_object(
        'legacy_case_id', new.id,
        'adapter', 'lighthouse_intake_spine',
        'adapter_version', '1.1.0',
        'pipeline_key', pipeline_key_value
      ))
    );
  end if;

  return new;
end
$function$;

comment on function public.luminari_ensure_case_identity_bridge_v1() is
  'Creates the UUID case bridge and primary Universal Intake Spine session while preserving the exact cases.pipeline_type intake-card identity as session routing context.';

create or replace function public.promote_live_upload_intake_authority_v1(
  p_legacy_case_id integer,
  p_invalidate_execution boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_case_uuid uuid;
  v_session_id uuid;
  v_pipeline_key text;
begin
  if p_legacy_case_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(76004002, p_legacy_case_id);

  select cib.case_uuid, nullif(btrim(c.pipeline_type), '')
    into v_case_uuid, v_pipeline_key
    from public.case_identity_bridge cib
    join public.cases c on c.id = cib.legacy_case_id
   where cib.legacy_case_id = p_legacy_case_id
   limit 1;

  if v_case_uuid is null then
    return null;
  end if;

  select s.intake_session_id
    into v_session_id
    from public.intake_sessions s
    join public.case_intake_links cil
      on cil.intake_session_id = s.intake_session_id
     and cil.case_uuid = v_case_uuid
   where s.session_type = 'live'
     and s.entry_channel = 'upload'
     and exists (
       select 1
         from public.intake_artifacts ia
        where ia.intake_session_id = s.intake_session_id
          and ia.artifact_type = 'source_document'
     )
   order by (
     select count(*)
       from public.intake_artifacts ia_count
      where ia_count.intake_session_id = s.intake_session_id
        and ia_count.artifact_type = 'source_document'
   ) desc,
   s.created_at asc,
   s.intake_session_id
   limit 1;

  if v_session_id is null then
    return null;
  end if;

  update public.case_intake_links
     set is_primary = false,
         link_type = case
           when intake_session_id = v_session_id then link_type
           when link_type = 'primary_projection' then 'related'
           else link_type
         end
   where case_uuid = v_case_uuid
     and is_primary = true;

  update public.case_intake_links
     set is_primary = true,
         link_type = 'primary_projection',
         metadata = coalesce(metadata, '{}'::jsonb)
           || jsonb_strip_nulls(jsonb_build_object(
                'runtime_authority', 'lighthouse_live_upload_v1',
                'promoted_at', now(),
                'pipeline_key', v_pipeline_key
              ))
   where case_uuid = v_case_uuid
     and intake_session_id = v_session_id;

  update public.intake_sessions
     set completion_state = case
           when p_invalidate_execution then 'evidence_registered'
           else completion_state
         end,
         metadata = coalesce(metadata, '{}'::jsonb)
           || case
                when v_pipeline_key is not null then jsonb_build_object(
                  'pipeline_key', v_pipeline_key,
                  'pipeline_key_source', 'cases.pipeline_type'
                )
                else '{}'::jsonb
              end
           || case
                when p_invalidate_execution then jsonb_build_object(
                  'runtime_projection_invalidated_at', now(),
                  'runtime_projection_invalidation_reason', 'active_evidence_set_changed'
                )
                else '{}'::jsonb
              end,
         updated_at = now()
   where intake_session_id = v_session_id;

  return v_session_id;
end
$$;

comment on function public.promote_live_upload_intake_authority_v1(integer, boolean) is
  'Promotes the case live-upload Intake Spine session to sole runtime authority, preserves cases.pipeline_type as pipeline_key, and invalidates stale governed projections when the active evidence set changes.';

-- Backfill the exact card identity onto all existing case-linked live sessions.
-- Historical receipts remain immutable. Only a currently-primary upload session
-- with a completed projection is marked for a governed rerun when the routing
-- identity is newly attached or corrected.
with linked as (
  select
    s.intake_session_id,
    s.entry_channel,
    s.completion_state,
    cil.is_primary,
    nullif(btrim(c.pipeline_type), '') as pipeline_key
  from public.intake_sessions s
  join public.case_intake_links cil
    on cil.intake_session_id = s.intake_session_id
  join public.case_identity_bridge cib
    on cib.case_uuid = cil.case_uuid
  join public.cases c
    on c.id = cib.legacy_case_id
  where s.session_type = 'live'
    and nullif(btrim(c.pipeline_type), '') is not null
    and coalesce(s.metadata ->> 'pipeline_key', '') is distinct from nullif(btrim(c.pipeline_type), '')
)
update public.intake_sessions s
   set completion_state = case
         when linked.is_primary
          and linked.entry_channel = 'upload'
          and linked.completion_state = 'governed_execution_complete'
           then 'evidence_registered'
         else s.completion_state
       end,
       metadata = coalesce(s.metadata, '{}'::jsonb)
         || jsonb_build_object(
              'pipeline_key', linked.pipeline_key,
              'pipeline_key_source', 'cases.pipeline_type'
            )
         || case
              when linked.is_primary
               and linked.entry_channel = 'upload'
               and linked.completion_state = 'governed_execution_complete'
                then jsonb_build_object(
                  'runtime_projection_invalidated_at', now(),
                  'runtime_projection_invalidation_reason', 'pipeline_identity_bound'
                )
              else '{}'::jsonb
            end,
       updated_at = now()
  from linked
 where s.intake_session_id = linked.intake_session_id;

update public.case_intake_links cil
   set metadata = coalesce(cil.metadata, '{}'::jsonb)
     || jsonb_build_object('pipeline_key', nullif(btrim(c.pipeline_type), ''))
  from public.case_identity_bridge cib
  join public.cases c on c.id = cib.legacy_case_id
 where cil.case_uuid = cib.case_uuid
   and nullif(btrim(c.pipeline_type), '') is not null
   and coalesce(cil.metadata ->> 'pipeline_key', '') is distinct from nullif(btrim(c.pipeline_type), '');

commit;
