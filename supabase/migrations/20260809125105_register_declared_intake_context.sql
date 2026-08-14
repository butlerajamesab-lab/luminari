-- Bind structured guided/offline intake to the same private live-upload
-- authority used by exact document bytes. The full declaration remains an
-- immutable source artifact; session metadata stores only its identity plus
-- explicit stabilization fields needed by Layer 1.

create or replace function public.register_declared_intake_context_v1(
  p_legacy_case_id integer,
  p_document_id integer,
  p_declaration_sha256 text,
  p_entry_surface text,
  p_declared_context jsonb,
  p_stabilization jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_document public.documents%rowtype;
  v_session_id uuid;
  v_artifact_id uuid;
  v_urgent_situation text;
begin
  if p_legacy_case_id is null or p_document_id is null then
    raise exception 'declared_intake_context_identity_required';
  end if;

  if p_declaration_sha256 is null or p_declaration_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'declared_intake_context_invalid_sha256';
  end if;

  if p_entry_surface not in ('guided_intake', 'conversation_intake', 'offline_bundle') then
    raise exception 'declared_intake_context_invalid_entry_surface:%', p_entry_surface;
  end if;

  if jsonb_typeof(p_declared_context) <> 'object'
     or p_declared_context ->> 'contract_version' <> 'luminari.declared_intake_context.v1.0.0'
     or p_declared_context ->> 'entry_surface' <> p_entry_surface then
    raise exception 'declared_intake_context_invalid_contract';
  end if;

  if jsonb_typeof(coalesce(p_stabilization, '{}'::jsonb)) <> 'object' then
    raise exception 'declared_intake_context_invalid_stabilization';
  end if;

  perform pg_advisory_xact_lock(76004003, p_legacy_case_id);

  select d.*
    into v_document
    from public.documents d
   where d.id = p_document_id
     and d.case_id = p_legacy_case_id
   for update;

  if not found then
    raise exception 'declared_intake_context_document_missing:%', p_document_id;
  end if;

  if v_document.sha256_hash is distinct from p_declaration_sha256 then
    raise exception 'declared_intake_context_document_hash_mismatch:%', p_document_id;
  end if;

  if lower(coalesce(v_document.mime_type, '')) <> 'application/vnd.luminari.declared-intake+json' then
    raise exception 'declared_intake_context_document_mime_mismatch:%', p_document_id;
  end if;

  -- The document trigger has already registered exact bytes. Re-promote under
  -- the case authority lock without a second invalidation write.
  v_session_id := public.promote_live_upload_intake_authority_v1(
    p_legacy_case_id,
    false
  );

  if v_session_id is null then
    raise exception 'declared_intake_context_upload_session_missing:%', p_legacy_case_id;
  end if;

  select ia.artifact_id
    into v_artifact_id
    from public.intake_artifacts ia
   where ia.intake_session_id = v_session_id
     and ia.artifact_type = 'source_document'
     and ia.sha256 = p_declaration_sha256
     and coalesce(ia.metadata ->> 'legacy_document_id', '') = p_document_id::text
   order by ia.created_at, ia.artifact_id
   limit 1;

  if v_artifact_id is null then
    raise exception 'declared_intake_context_source_artifact_missing:%', p_document_id;
  end if;

  update public.intake_artifacts
     set source_family = 'lighthouse_declared_intake_context',
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'context_contract_version', 'luminari.declared_intake_context.v1.0.0',
           'source_role', 'declared_intake_context',
           'entry_surface', p_entry_surface
         ),
         updated_at = now()
   where artifact_id = v_artifact_id;

  v_urgent_situation := nullif(btrim(coalesce(p_stabilization ->> 'urgent_situation', '')), '');

  update public.intake_sessions
     set user_selected_immediate_issue = v_urgent_situation,
         completion_state = 'evidence_registered',
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'declared_context', jsonb_build_object(
             'context_contract_version', 'luminari.declared_intake_context.v1.0.0',
             'artifact_id', v_artifact_id,
             'document_id', p_document_id,
             'sha256', p_declaration_sha256,
             'entry_surface', p_entry_surface
           ),
           'stabilization', coalesce(p_stabilization, '{}'::jsonb),
           'runtime_projection_invalidated_at', now(),
           'runtime_projection_invalidation_reason', 'declared_intake_context_registered'
         ),
         updated_at = now()
   where intake_session_id = v_session_id;

  return v_session_id;
end
$$;

revoke all on function public.register_declared_intake_context_v1(
  integer,
  integer,
  text,
  text,
  jsonb,
  jsonb
) from public, anon, authenticated;

grant execute on function public.register_declared_intake_context_v1(
  integer,
  integer,
  text,
  text,
  jsonb,
  jsonb
) to service_role;

comment on function public.register_declared_intake_context_v1(
  integer,
  integer,
  text,
  text,
  jsonb,
  jsonb
) is
  'Registers an exact-byte declared intake source with the case sole live-upload authority and copies only explicit stabilization fields into the governed session.';

