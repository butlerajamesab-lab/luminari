-- Production ledger version: 20260808231628.
-- Make the live case-upload session the sole runtime authority for Lighthouse.
-- Fixture/case-create sessions remain immutable history, but they cannot own
-- the case projection once real evidence has been registered.

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
begin
  if p_legacy_case_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(76004002, p_legacy_case_id);

  select cib.case_uuid
    into v_case_uuid
    from public.case_identity_bridge cib
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
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'runtime_authority', 'lighthouse_live_upload_v1',
           'promoted_at', now()
         )
   where case_uuid = v_case_uuid
     and intake_session_id = v_session_id;

  if p_invalidate_execution then
    update public.intake_sessions
       set completion_state = 'evidence_registered',
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'runtime_projection_invalidated_at', now(),
             'runtime_projection_invalidation_reason', 'active_evidence_set_changed'
           ),
           updated_at = now()
     where intake_session_id = v_session_id;
  end if;

  return v_session_id;
end
$$;

create or replace function public.promote_live_upload_intake_authority_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.promote_live_upload_intake_authority_v1(new.case_id, true);
  return new;
end
$$;

drop trigger if exists documents_promote_live_upload_intake_authority_v1_trg on public.documents;
create trigger documents_promote_live_upload_intake_authority_v1_trg
after insert or update of document_resolution, replaced_by_document_id on public.documents
for each row
when (new.case_id is not null)
execute function public.promote_live_upload_intake_authority_trigger_v1();

do $$
declare
  v_case_id integer;
begin
  for v_case_id in
    select distinct cib.legacy_case_id
      from public.case_identity_bridge cib
      join public.case_intake_links cil on cil.case_uuid = cib.case_uuid
      join public.intake_sessions s on s.intake_session_id = cil.intake_session_id
     where s.session_type = 'live'
       and s.entry_channel = 'upload'
       and exists (
         select 1
           from public.intake_artifacts ia
          where ia.intake_session_id = s.intake_session_id
            and ia.artifact_type = 'source_document'
       )
     order by cib.legacy_case_id
  loop
    perform public.promote_live_upload_intake_authority_v1(v_case_id, false);
  end loop;
end
$$;

revoke all on function public.promote_live_upload_intake_authority_v1(integer, boolean) from public, anon, authenticated;
revoke all on function public.promote_live_upload_intake_authority_trigger_v1() from public, anon, authenticated;
revoke all on function public.bind_document_to_intake_spine_v1(integer) from public, anon, authenticated;
revoke all on function public.bind_document_to_intake_spine_trigger_v1() from public, anon, authenticated;

grant execute on function public.promote_live_upload_intake_authority_v1(integer, boolean) to service_role;

comment on function public.promote_live_upload_intake_authority_v1(integer, boolean) is
  'Promotes the case live-upload intake session to sole Lighthouse runtime authority and invalidates stale governed projections when the active evidence set changes.';
