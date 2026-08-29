-- Person-facing Lighthouse actions are primary. Organizations, agencies,
-- statutes, programs, and datasets are supporting bindings, never action keys.
-- Every source generation remains append-only; only exact current keys upsert.

create table if not exists public.luminari_reviewed_source_record_revision_v1 (
  source_record_revision_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.luminari_corpus_rebuild_run_v1(run_id),
  source_filename text not null,
  source_content_sha256 text not null,
  source_record_id text not null,
  raw_source_record_id text,
  issue_lens text not null,
  source_order integer not null,
  source_page integer not null,
  source_table_index integer not null,
  source_title text not null,
  verification_status text not null,
  record_sha256 text not null,
  record_payload jsonb not null,
  reviewed_at timestamptz not null default now(),
  unique (run_id, source_filename, source_record_id),
  unique (run_id, record_sha256),
  constraint luminari_reviewed_source_record_sha256_check
    check (source_content_sha256 ~ '^[0-9a-f]{64}$' and record_sha256 ~ '^[0-9a-f]{64}$'),
  constraint luminari_reviewed_source_record_locator_check
    check (source_order > 0 and source_page > 0 and source_table_index > 0)
);

create index if not exists luminari_reviewed_source_record_source_idx
  on public.luminari_reviewed_source_record_revision_v1
  (source_filename, source_record_id, reviewed_at desc);
create index if not exists luminari_reviewed_source_record_run_idx
  on public.luminari_reviewed_source_record_revision_v1
  (run_id, source_order);

create table if not exists public.luminari_situation_action_revision_v1 (
  action_revision_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.luminari_corpus_rebuild_run_v1(run_id),
  action_revision_key text not null,
  action_key text not null,
  action_class text not null,
  issue_lens text not null,
  situation_key text not null,
  jurisdiction_level text not null,
  jurisdiction text not null,
  state_code text not null,
  action_kind text not null,
  action_label text not null,
  when_to_use text not null,
  target_surface text not null,
  alert_type text,
  severity text,
  deadline_summary text,
  action_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, action_revision_key),
  constraint luminari_situation_action_revision_key_check
    check (action_revision_key ~ '^[0-9a-f]{64}$'),
  constraint luminari_situation_action_revision_class_check
    check (action_class in ('route', 'alert'))
);

create index if not exists luminari_situation_action_revision_lookup_idx
  on public.luminari_situation_action_revision_v1
  (action_key, created_at desc);

create table if not exists public.luminari_situation_action_current_v1 (
  action_key text primary key,
  active_run_id uuid not null references public.luminari_corpus_rebuild_run_v1(run_id),
  active_action_revision_key text not null,
  action_class text not null,
  issue_lens text not null,
  situation_key text not null,
  jurisdiction_level text not null,
  jurisdiction text not null,
  state_code text not null,
  action_kind text not null,
  action_label text not null,
  when_to_use text not null,
  target_surface text not null,
  alert_type text,
  severity text,
  deadline_summary text,
  current_payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint luminari_situation_action_current_class_check
    check (action_class in ('route', 'alert')),
  constraint luminari_situation_action_current_no_node_identity_check
    check (position('provider_source_id' in action_key) = 0)
);

create index if not exists luminari_situation_action_current_discovery_idx
  on public.luminari_situation_action_current_v1
  (issue_lens, state_code, situation_key, action_kind);

create table if not exists public.luminari_situation_action_binding_revision_v1 (
  binding_revision_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.luminari_corpus_rebuild_run_v1(run_id),
  binding_revision_key text not null,
  binding_key text not null,
  action_key text not null,
  source_record_revision_id uuid not null
    references public.luminari_reviewed_source_record_revision_v1(source_record_revision_id),
  source_subcategory text not null,
  source_jurisdiction_level text not null,
  source_jurisdiction text not null,
  supporting_name text not null,
  supporting_source_id text not null,
  source_service_type text not null,
  what_the_person_can_do text not null,
  route_instructions text,
  filing_or_complaint_url text,
  phone text,
  email text,
  website text,
  address text,
  statutory_authority text,
  verification_status text not null,
  supporting_object_class text not null,
  supporting_target_surface text not null,
  binding_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, binding_revision_key),
  unique (run_id, binding_key),
  constraint luminari_situation_action_binding_revision_key_check
    check (binding_revision_key ~ '^[0-9a-f]{64}$')
);

create index if not exists luminari_situation_action_binding_revision_action_idx
  on public.luminari_situation_action_binding_revision_v1
  (action_key, created_at desc);

create table if not exists public.luminari_situation_action_binding_current_v1 (
  binding_key text primary key,
  active_run_id uuid not null references public.luminari_corpus_rebuild_run_v1(run_id),
  active_binding_revision_key text not null,
  action_key text not null,
  source_record_revision_id uuid not null
    references public.luminari_reviewed_source_record_revision_v1(source_record_revision_id),
  source_subcategory text not null,
  source_jurisdiction_level text not null,
  source_jurisdiction text not null,
  supporting_name text not null,
  supporting_source_id text not null,
  source_service_type text not null,
  what_the_person_can_do text not null,
  route_instructions text,
  filing_or_complaint_url text,
  phone text,
  email text,
  website text,
  address text,
  statutory_authority text,
  verification_status text not null,
  supporting_object_class text not null,
  supporting_target_surface text not null,
  current_payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists luminari_situation_action_binding_current_action_idx
  on public.luminari_situation_action_binding_current_v1
  (action_key, verification_status, supporting_name);

create table if not exists public.luminari_reviewed_context_revision_v1 (
  context_revision_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.luminari_corpus_rebuild_run_v1(run_id),
  source_filename text not null,
  source_content_sha256 text not null,
  context_id text not null,
  context_binding_key text not null,
  action_key text not null,
  source_page integer not null,
  source_table_index integer not null,
  title text not null,
  body text not null,
  raw_text text not null,
  context_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, source_filename, context_id),
  constraint luminari_reviewed_context_source_sha256_check
    check (source_content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint luminari_reviewed_context_locator_check
    check (source_page > 0 and source_table_index > 0)
);

create table if not exists public.luminari_reviewed_context_current_v1 (
  context_binding_key text primary key,
  active_run_id uuid not null references public.luminari_corpus_rebuild_run_v1(run_id),
  context_revision_id uuid not null
    references public.luminari_reviewed_context_revision_v1(context_revision_id),
  action_key text not null,
  context_id text not null,
  title text not null,
  body text not null,
  raw_text text not null,
  updated_at timestamptz not null default now()
);

do $block$
declare
  v_name text;
begin
  foreach v_name in array array[
    'luminari_reviewed_source_record_revision_v1',
    'luminari_situation_action_revision_v1',
    'luminari_situation_action_current_v1',
    'luminari_situation_action_binding_revision_v1',
    'luminari_situation_action_binding_current_v1',
    'luminari_reviewed_context_revision_v1',
    'luminari_reviewed_context_current_v1'
  ] loop
    execute format('alter table public.%I enable row level security', v_name);
    execute format('revoke all on public.%I from anon, authenticated', v_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', v_name);
  end loop;
end;
$block$;

create or replace function public.assert_luminari_manual_review_run_v1(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_run public.luminari_corpus_rebuild_run_v1%rowtype;
begin
  select * into v_run
  from public.luminari_corpus_rebuild_run_v1
  where run_id = p_run_id;

  if not found then
    raise exception 'manual review run % does not exist', p_run_id;
  end if;
  if v_run.engine_version not like 'manual_source_review_reconciliation_v%' then
    raise exception 'run % is not a manual source-review run', p_run_id;
  end if;
  if v_run.status <> 'started' then
    raise exception 'manual review run % is not open for row writes', p_run_id;
  end if;
end;
$function$;

revoke all on function public.assert_luminari_manual_review_run_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.assert_luminari_manual_review_run_v1(uuid)
  to service_role;

create or replace function public.upsert_luminari_reviewed_situation_action_v1(
  p_run_id uuid,
  p_source jsonb,
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_action jsonb := p_record #> '{action_projection,canonical_action}';
  v_binding jsonb := p_record #> '{action_projection,supporting_binding}';
  v_source_filename text := nullif(btrim(p_source->>'filename'), '');
  v_source_sha text := nullif(btrim(p_source->>'content_sha256'), '');
  v_source_id text := nullif(btrim(p_record->>'normalized_resource_id'), '');
  v_record_sha text := nullif(btrim(p_record->>'record_sha256'), '');
  v_action_key text;
  v_action_revision_key text;
  v_binding_key text;
  v_binding_revision_key text;
  v_source_revision_id uuid;
  v_existing_sha text;
  v_best public.luminari_situation_action_binding_current_v1%rowtype;
  v_binding_count integer;
  v_binding_summary jsonb;
  v_action_hash text;
  v_object_ref text;
begin
  perform public.assert_luminari_manual_review_run_v1(p_run_id);

  v_action_key := nullif(btrim(v_action->>'action_key'), '');
  v_action_revision_key := nullif(btrim(v_action->>'action_revision_key'), '');
  v_binding_key := nullif(btrim(v_binding->>'binding_key'), '');
  v_binding_revision_key := nullif(btrim(v_binding->>'binding_revision_key'), '');

  if v_source_filename is null or v_source_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'reviewed source filename and sha256 are required';
  end if;
  if v_source_id is null or v_record_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'reviewed source record identity and sha256 are required';
  end if;
  if v_action_key is null or v_action_revision_key !~ '^[0-9a-f]{64}$' then
    raise exception 'canonical situation action identity is required';
  end if;
  if v_action_key like '%' || v_source_id || '%' then
    raise exception 'source/provider identity may not appear in action key %', v_action_key;
  end if;
  if v_binding_key is null or v_binding_revision_key !~ '^[0-9a-f]{64}$' then
    raise exception 'supporting binding identity is required';
  end if;
  if v_binding->>'action_key' is distinct from v_action_key then
    raise exception 'binding action key does not match canonical action key';
  end if;
  if nullif(btrim(v_binding->>'provider_name'), '') is not null
     and position(
       lower(v_binding->>'provider_name')
       in lower(coalesce(v_action->>'action_label', ''))
     ) > 0 then
    raise exception 'provider identity may not appear in canonical action label';
  end if;

  insert into public.luminari_reviewed_source_record_revision_v1 (
    run_id, source_filename, source_content_sha256, source_record_id,
    raw_source_record_id, issue_lens, source_order, source_page,
    source_table_index, source_title, verification_status, record_sha256,
    record_payload
  ) values (
    p_run_id, v_source_filename, v_source_sha, v_source_id,
    nullif(btrim(p_record->>'source_resource_id'), ''),
    v_action->>'issue_lens', (p_record->>'source_order')::integer,
    (p_record->>'source_page')::integer,
    (p_record->>'source_table_index')::integer,
    p_record->>'source_title', p_record->>'effective_verification_status',
    v_record_sha, p_record
  )
  on conflict (run_id, source_filename, source_record_id) do nothing
  returning source_record_revision_id into v_source_revision_id;

  if v_source_revision_id is null then
    select source_record_revision_id, record_sha256
      into v_source_revision_id, v_existing_sha
    from public.luminari_reviewed_source_record_revision_v1
    where run_id = p_run_id
      and source_filename = v_source_filename
      and source_record_id = v_source_id;
    if v_existing_sha is distinct from v_record_sha then
      raise exception 'same reviewed source record was presented with different content';
    end if;
  end if;

  insert into public.luminari_situation_action_revision_v1 (
    run_id, action_revision_key, action_key, action_class, issue_lens,
    situation_key, jurisdiction_level, jurisdiction, state_code, action_kind,
    action_label, when_to_use, target_surface, action_payload
  ) values (
    p_run_id, v_action_revision_key, v_action_key, 'route',
    v_action->>'issue_lens', v_action->>'situation_key',
    v_action->>'jurisdiction_level', v_action->>'jurisdiction',
    v_action->>'state_code', v_action->>'action_kind',
    v_action->>'action_label', v_action->>'when_to_use',
    v_action->>'target_surface', v_action
  )
  on conflict (run_id, action_revision_key) do nothing;

  insert into public.luminari_situation_action_current_v1 (
    action_key, active_run_id, active_action_revision_key, action_class,
    issue_lens, situation_key, jurisdiction_level, jurisdiction, state_code,
    action_kind, action_label, when_to_use, target_surface, current_payload,
    updated_at
  ) values (
    v_action_key, p_run_id, v_action_revision_key, 'route',
    v_action->>'issue_lens', v_action->>'situation_key',
    v_action->>'jurisdiction_level', v_action->>'jurisdiction',
    v_action->>'state_code', v_action->>'action_kind',
    v_action->>'action_label', v_action->>'when_to_use',
    v_action->>'target_surface', v_action, now()
  )
  on conflict (action_key) do update set
    active_run_id = excluded.active_run_id,
    active_action_revision_key = excluded.active_action_revision_key,
    action_class = excluded.action_class,
    issue_lens = excluded.issue_lens,
    situation_key = excluded.situation_key,
    jurisdiction_level = excluded.jurisdiction_level,
    jurisdiction = excluded.jurisdiction,
    state_code = excluded.state_code,
    action_kind = excluded.action_kind,
    action_label = excluded.action_label,
    when_to_use = excluded.when_to_use,
    target_surface = excluded.target_surface,
    alert_type = null,
    severity = null,
    deadline_summary = null,
    current_payload = excluded.current_payload,
    updated_at = excluded.updated_at;

  insert into public.luminari_situation_action_binding_revision_v1 (
    run_id, binding_revision_key, binding_key, action_key,
    source_record_revision_id, source_subcategory,
    source_jurisdiction_level, source_jurisdiction, supporting_name,
    supporting_source_id, source_service_type, what_the_person_can_do,
    route_instructions, filing_or_complaint_url, phone, email, website,
    address, statutory_authority, verification_status,
    supporting_object_class, supporting_target_surface, binding_payload
  ) values (
    p_run_id, v_binding_revision_key, v_binding_key, v_action_key,
    v_source_revision_id, v_binding->>'source_subcategory',
    v_binding->>'source_jurisdiction_level', v_binding->>'source_jurisdiction',
    v_binding->>'provider_name', v_binding->>'provider_source_id',
    v_binding->>'source_service_type', v_binding->>'what_the_person_can_do',
    nullif(v_binding->>'route_instructions', ''),
    nullif(v_binding->>'filing_or_complaint_url', ''),
    nullif(v_binding->>'phone', ''), nullif(v_binding->>'email', ''),
    nullif(v_binding->>'website', ''), nullif(v_binding->>'address', ''),
    nullif(v_binding->>'statutory_authority', ''),
    v_binding->>'verification_status', v_binding->>'supporting_object_class',
    v_binding->>'supporting_target_surface', v_binding
  )
  on conflict (run_id, binding_key) do nothing;

  insert into public.luminari_situation_action_binding_current_v1 (
    binding_key, active_run_id, active_binding_revision_key, action_key,
    source_record_revision_id, source_subcategory,
    source_jurisdiction_level, source_jurisdiction, supporting_name,
    supporting_source_id, source_service_type, what_the_person_can_do,
    route_instructions, filing_or_complaint_url, phone, email, website,
    address, statutory_authority, verification_status,
    supporting_object_class, supporting_target_surface, current_payload,
    updated_at
  ) values (
    v_binding_key, p_run_id, v_binding_revision_key, v_action_key,
    v_source_revision_id, v_binding->>'source_subcategory',
    v_binding->>'source_jurisdiction_level', v_binding->>'source_jurisdiction',
    v_binding->>'provider_name', v_binding->>'provider_source_id',
    v_binding->>'source_service_type', v_binding->>'what_the_person_can_do',
    nullif(v_binding->>'route_instructions', ''),
    nullif(v_binding->>'filing_or_complaint_url', ''),
    nullif(v_binding->>'phone', ''), nullif(v_binding->>'email', ''),
    nullif(v_binding->>'website', ''), nullif(v_binding->>'address', ''),
    nullif(v_binding->>'statutory_authority', ''),
    v_binding->>'verification_status', v_binding->>'supporting_object_class',
    v_binding->>'supporting_target_surface', v_binding, now()
  )
  on conflict (binding_key) do update set
    active_run_id = excluded.active_run_id,
    active_binding_revision_key = excluded.active_binding_revision_key,
    action_key = excluded.action_key,
    source_record_revision_id = excluded.source_record_revision_id,
    source_subcategory = excluded.source_subcategory,
    source_jurisdiction_level = excluded.source_jurisdiction_level,
    source_jurisdiction = excluded.source_jurisdiction,
    supporting_name = excluded.supporting_name,
    supporting_source_id = excluded.supporting_source_id,
    source_service_type = excluded.source_service_type,
    what_the_person_can_do = excluded.what_the_person_can_do,
    route_instructions = excluded.route_instructions,
    filing_or_complaint_url = excluded.filing_or_complaint_url,
    phone = excluded.phone,
    email = excluded.email,
    website = excluded.website,
    address = excluded.address,
    statutory_authority = excluded.statutory_authority,
    verification_status = excluded.verification_status,
    supporting_object_class = excluded.supporting_object_class,
    supporting_target_surface = excluded.supporting_target_surface,
    current_payload = excluded.current_payload,
    updated_at = excluded.updated_at;

  select * into v_best
  from public.luminari_situation_action_binding_current_v1
  where action_key = v_action_key
  order by
    (verification_status = 'VERIFIED') desc,
    (filing_or_complaint_url is not null) desc,
    (phone is not null) desc,
    (email is not null) desc,
    (website is not null) desc,
    supporting_name,
    binding_key
  limit 1;

  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'binding_key', binding_key,
           'supporting_name', supporting_name,
           'supporting_source_id', supporting_source_id,
           'verification_status', verification_status,
           'filing_or_complaint_url', filing_or_complaint_url,
           'phone', phone,
           'email', email,
           'website', website
         ) order by supporting_name, binding_key), '[]'::jsonb)
    into v_binding_count, v_binding_summary
  from public.luminari_situation_action_binding_current_v1
  where action_key = v_action_key;

  v_action_hash := encode(extensions.digest(v_action_key, 'sha256'), 'hex');
  v_object_ref := 'reviewed_action:' || p_run_id::text || ':' || v_action_hash;

  insert into public.luminari_civic_object_reconciliation_v1 (
    object_ref, source_object_type, object_class, target_surface, run_id,
    artifact_key, artifact_role, source_locator, source_content_sha256,
    source_candidate_hash, parser_version, jurisdiction, state_code,
    jurisdiction_resolution_state, section_name, name, organization_name,
    category, layer, phone, email, website_url, address,
    eligibility_summary, apply_notes, description, filing_portal,
    filing_portal_url, statutory_authority, deadline, hours, languages,
    organization_type, candidate_state, source_created_at, field_provenance,
    has_access_point, projection_state, projection_version, reconciled_at
  ) values (
    v_object_ref, 'situation_action', 'resource', 'resource_directory', p_run_id,
    v_source_filename, 'reviewed_source', 'manual-review-action:' || v_action_key,
    v_source_sha, v_action_hash, 'manual_source_review_reconciliation_v1.1.0',
    v_action->>'jurisdiction', v_action->>'state_code', 'resolved',
    'Reviewed situation actions', v_action->>'action_label', null,
    v_action->>'issue_lens', v_action->>'situation_key', v_best.phone,
    v_best.email, v_best.website, v_best.address, v_action->>'when_to_use',
    format('Choose from %s reviewed source-backed route option%s.',
      v_binding_count, case when v_binding_count = 1 then '' else 's' end),
    v_best.what_the_person_can_do, v_best.route_instructions,
    v_best.filing_or_complaint_url, v_best.statutory_authority, null, null,
    null, 'situation_action_with_supporting_bindings', 'typed', now(),
    jsonb_build_object(
      'source_review', jsonb_build_object(
        'source_filename', v_source_filename,
        'record_count', v_binding_count
      ),
      'situation_action', v_action,
      'supporting_bindings', v_binding_summary
    ),
    (v_best.filing_or_complaint_url is not null or v_best.phone is not null
      or v_best.email is not null or v_best.website is not null),
    'person_facing_reviewed', 'situation_action_projection_v1', now()
  )
  on conflict (object_ref) do update set
    source_content_sha256 = excluded.source_content_sha256,
    name = excluded.name,
    category = excluded.category,
    layer = excluded.layer,
    phone = excluded.phone,
    email = excluded.email,
    website_url = excluded.website_url,
    address = excluded.address,
    eligibility_summary = excluded.eligibility_summary,
    apply_notes = excluded.apply_notes,
    description = excluded.description,
    filing_portal = excluded.filing_portal,
    filing_portal_url = excluded.filing_portal_url,
    statutory_authority = excluded.statutory_authority,
    field_provenance = excluded.field_provenance,
    has_access_point = excluded.has_access_point,
    reconciled_at = excluded.reconciled_at;

  return jsonb_build_object(
    'source_record_id', v_source_id,
    'source_record_revision_id', v_source_revision_id,
    'action_key', v_action_key,
    'binding_key', v_binding_key,
    'current_binding_count', v_binding_count
  );
end;
$function$;

revoke all on function public.upsert_luminari_reviewed_situation_action_v1(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_luminari_reviewed_situation_action_v1(uuid, jsonb, jsonb)
  to service_role;

create or replace function public.upsert_luminari_reviewed_action_context_v1(
  p_run_id uuid,
  p_source jsonb,
  p_context jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_action jsonb := p_context #> '{action_projection,canonical_action_alert}';
  v_support jsonb := p_context #> '{action_projection,supporting_context}';
  v_source_filename text := nullif(btrim(p_source->>'filename'), '');
  v_source_sha text := nullif(btrim(p_source->>'content_sha256'), '');
  v_context_id text := nullif(btrim(p_context->>'context_id'), '');
  v_context_binding_key text := nullif(btrim(v_support->>'context_binding_key'), '');
  v_action_key text := nullif(btrim(v_action->>'action_key'), '');
  v_action_revision_key text := nullif(btrim(v_action->>'action_revision_key'), '');
  v_context_revision_id uuid;
  v_action_hash text;
  v_object_ref text;
begin
  perform public.assert_luminari_manual_review_run_v1(p_run_id);

  if v_source_filename is null or v_source_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'reviewed context source filename and sha256 are required';
  end if;
  if v_context_id is null or v_context_binding_key is null or v_action_key is null then
    raise exception 'reviewed context identity and action identity are required';
  end if;
  if v_action_revision_key !~ '^[0-9a-f]{64}$' then
    raise exception 'reviewed context action revision key is invalid';
  end if;

  insert into public.luminari_reviewed_context_revision_v1 (
    run_id, source_filename, source_content_sha256, context_id,
    context_binding_key, action_key, source_page, source_table_index,
    title, body, raw_text, context_payload
  ) values (
    p_run_id, v_source_filename, v_source_sha, v_context_id,
    v_context_binding_key, v_action_key, (p_context->>'source_page')::integer,
    (p_context->>'source_table_index')::integer, p_context->>'title',
    p_context->>'body', p_context->>'raw_text', p_context
  )
  on conflict (run_id, source_filename, context_id) do nothing
  returning context_revision_id into v_context_revision_id;

  if v_context_revision_id is null then
    select context_revision_id into v_context_revision_id
    from public.luminari_reviewed_context_revision_v1
    where run_id = p_run_id
      and source_filename = v_source_filename
      and context_id = v_context_id;
  end if;

  insert into public.luminari_reviewed_context_current_v1 (
    context_binding_key, active_run_id, context_revision_id, action_key,
    context_id, title, body, raw_text, updated_at
  ) values (
    v_context_binding_key, p_run_id, v_context_revision_id, v_action_key,
    v_context_id, p_context->>'title', p_context->>'body',
    p_context->>'raw_text', now()
  )
  on conflict (context_binding_key) do update set
    active_run_id = excluded.active_run_id,
    context_revision_id = excluded.context_revision_id,
    action_key = excluded.action_key,
    context_id = excluded.context_id,
    title = excluded.title,
    body = excluded.body,
    raw_text = excluded.raw_text,
    updated_at = excluded.updated_at;

  insert into public.luminari_situation_action_revision_v1 (
    run_id, action_revision_key, action_key, action_class, issue_lens,
    situation_key, jurisdiction_level, jurisdiction, state_code, action_kind,
    action_label, when_to_use, target_surface, alert_type, severity,
    deadline_summary, action_payload
  ) values (
    p_run_id, v_action_revision_key, v_action_key, 'alert',
    v_action->>'issue_lens', v_action->>'situation_key',
    v_action->>'jurisdiction_level', v_action->>'jurisdiction',
    v_action->>'state_code', v_action->>'action_kind',
    v_action->>'action_label', v_action->>'when_to_use',
    v_action->>'target_surface', v_action->>'alert_type',
    v_action->>'severity', nullif(v_action->>'deadline_summary', ''), v_action
  )
  on conflict (run_id, action_revision_key) do nothing;

  insert into public.luminari_situation_action_current_v1 (
    action_key, active_run_id, active_action_revision_key, action_class,
    issue_lens, situation_key, jurisdiction_level, jurisdiction, state_code,
    action_kind, action_label, when_to_use, target_surface, alert_type,
    severity, deadline_summary, current_payload, updated_at
  ) values (
    v_action_key, p_run_id, v_action_revision_key, 'alert',
    v_action->>'issue_lens', v_action->>'situation_key',
    v_action->>'jurisdiction_level', v_action->>'jurisdiction',
    v_action->>'state_code', v_action->>'action_kind',
    v_action->>'action_label', v_action->>'when_to_use',
    v_action->>'target_surface', v_action->>'alert_type',
    v_action->>'severity', nullif(v_action->>'deadline_summary', ''),
    v_action, now()
  )
  on conflict (action_key) do update set
    active_run_id = excluded.active_run_id,
    active_action_revision_key = excluded.active_action_revision_key,
    action_class = excluded.action_class,
    issue_lens = excluded.issue_lens,
    situation_key = excluded.situation_key,
    jurisdiction_level = excluded.jurisdiction_level,
    jurisdiction = excluded.jurisdiction,
    state_code = excluded.state_code,
    action_kind = excluded.action_kind,
    action_label = excluded.action_label,
    when_to_use = excluded.when_to_use,
    target_surface = excluded.target_surface,
    alert_type = excluded.alert_type,
    severity = excluded.severity,
    deadline_summary = excluded.deadline_summary,
    current_payload = excluded.current_payload,
    updated_at = excluded.updated_at;

  v_action_hash := encode(extensions.digest(v_action_key, 'sha256'), 'hex');
  v_object_ref := 'reviewed_action:' || p_run_id::text || ':' || v_action_hash;

  insert into public.luminari_civic_object_reconciliation_v1 (
    object_ref, source_object_type, object_class, target_surface, run_id,
    artifact_key, artifact_role, source_locator, source_content_sha256,
    source_candidate_hash, parser_version, jurisdiction, state_code,
    jurisdiction_resolution_state, section_name, name, organization_name,
    category, layer, phone, email, website_url, address,
    eligibility_summary, apply_notes, description, filing_portal,
    filing_portal_url, statutory_authority, deadline, hours, languages,
    organization_type, candidate_state, source_created_at, field_provenance,
    has_access_point, projection_state, projection_version, reconciled_at
  ) values (
    v_object_ref, 'situation_action_alert', 'program', 'resource_directory',
    p_run_id, v_source_filename, 'reviewed_source_context',
    'manual-review-context:' || v_context_id, v_source_sha, v_action_hash,
    'manual_source_review_reconciliation_v1.1.0',
    v_action->>'jurisdiction', v_action->>'state_code', 'resolved',
    'Reviewed deadlines and routing alerts', v_action->>'action_label', null,
    v_action->>'issue_lens', v_action->>'situation_key', null, null, null,
    null, v_action->>'when_to_use', p_context->>'title', p_context->>'body',
    null, null, null, nullif(v_action->>'deadline_summary', ''), null, null,
    'situation_action_alert', 'typed', now(),
    jsonb_build_object(
      'source_review', jsonb_build_object(
        'source_filename', v_source_filename,
        'context_id', v_context_id,
        'source_page', p_context->>'source_page'
      ),
      'situation_action', v_action,
      'supporting_context', v_support
    ),
    false, 'person_facing_reviewed_alert', 'situation_action_projection_v1', now()
  )
  on conflict (object_ref) do update set
    source_content_sha256 = excluded.source_content_sha256,
    name = excluded.name,
    eligibility_summary = excluded.eligibility_summary,
    apply_notes = excluded.apply_notes,
    description = excluded.description,
    deadline = excluded.deadline,
    field_provenance = excluded.field_provenance,
    reconciled_at = excluded.reconciled_at;

  return jsonb_build_object(
    'context_id', v_context_id,
    'context_revision_id', v_context_revision_id,
    'action_key', v_action_key
  );
end;
$function$;

revoke all on function public.upsert_luminari_reviewed_action_context_v1(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_luminari_reviewed_action_context_v1(uuid, jsonb, jsonb)
  to service_role;

create or replace view public.v_lighthouse_situation_action_current_v1
with (security_invoker = true) as
with active_action_revisions as (
  select
    a.*,
    o.activated_at,
    row_number() over (
      partition by a.action_key
      order by o.activated_at desc, a.created_at desc, a.action_revision_id desc
    ) as action_rank
  from public.luminari_situation_action_revision_v1 a
  join public.luminari_reviewed_source_overlay_v1 o
    on o.active_run_id = a.run_id
), actions as (
  select *
  from active_action_revisions
  where action_rank = 1
), active_binding_revisions as (
  select
    b.*,
    o.activated_at,
    row_number() over (
      partition by b.binding_key
      order by o.activated_at desc, b.created_at desc, b.binding_revision_id desc
    ) as binding_rank
  from public.luminari_situation_action_binding_revision_v1 b
  join public.luminari_reviewed_source_overlay_v1 o
    on o.active_run_id = b.run_id
), bindings_current as (
  select *
  from active_binding_revisions
  where binding_rank = 1
), active_context_revisions as (
  select
    c.*,
    o.activated_at,
    row_number() over (
      partition by c.context_binding_key
      order by o.activated_at desc, c.created_at desc, c.context_revision_id desc
    ) as context_rank
  from public.luminari_reviewed_context_revision_v1 c
  join public.luminari_reviewed_source_overlay_v1 o
    on o.active_run_id = c.run_id
), contexts_current as (
  select *
  from active_context_revisions
  where context_rank = 1
)
select
  a.action_key,
  a.action_class,
  a.issue_lens,
  a.situation_key,
  a.jurisdiction_level,
  a.jurisdiction,
  a.state_code,
  a.action_kind,
  a.action_label,
  a.when_to_use,
  a.target_surface,
  a.alert_type,
  a.severity,
  a.deadline_summary,
  a.run_id as active_run_id,
  a.action_revision_key as active_action_revision_key,
  a.created_at as updated_at,
  coalesce(bindings.binding_count, 0) as binding_count,
  coalesce(bindings.bindings, '[]'::jsonb) as bindings,
  coalesce(contexts.context_count, 0) as context_count,
  coalesce(contexts.contexts, '[]'::jsonb) as contexts,
  coalesce(bindings.has_access_point, false) as has_access_point
from actions a
left join lateral (
  select
    count(*)::integer as binding_count,
    bool_or(
      b.filing_or_complaint_url is not null or b.phone is not null
      or b.email is not null or b.website is not null
    ) as has_access_point,
    jsonb_agg(jsonb_build_object(
      'binding_key', b.binding_key,
      'source_subcategory', b.source_subcategory,
      'source_jurisdiction_level', b.source_jurisdiction_level,
      'source_jurisdiction', b.source_jurisdiction,
      'supporting_name', b.supporting_name,
      'supporting_source_id', b.supporting_source_id,
      'source_service_type', b.source_service_type,
      'what_the_person_can_do', b.what_the_person_can_do,
      'route_instructions', b.route_instructions,
      'filing_or_complaint_url', b.filing_or_complaint_url,
      'phone', b.phone,
      'email', b.email,
      'website', b.website,
      'address', b.address,
      'statutory_authority', b.statutory_authority,
      'verification_status', b.verification_status,
      'supporting_object_class', b.supporting_object_class,
      'supporting_target_surface', b.supporting_target_surface,
      'source_record_revision_id', b.source_record_revision_id
    ) order by
      (b.verification_status = 'VERIFIED') desc,
      b.supporting_name,
      b.binding_key
    ) as bindings
  from bindings_current b
  where b.action_key = a.action_key
) bindings on true
left join lateral (
  select
    count(*)::integer as context_count,
    jsonb_agg(jsonb_build_object(
      'context_binding_key', c.context_binding_key,
      'context_id', c.context_id,
      'title', c.title,
      'body', c.body,
      'raw_text', c.raw_text,
      'context_revision_id', c.context_revision_id
    ) order by c.context_id) as contexts
  from contexts_current c
  where c.action_key = a.action_key
) contexts on true;

revoke all on public.v_lighthouse_situation_action_current_v1 from anon, authenticated;
grant select on public.v_lighthouse_situation_action_current_v1 to service_role;

create or replace function public.activate_luminari_reviewed_source_overlay_v1(
  p_overlay_key text,
  p_run_id uuid,
  p_source_filename text,
  p_source_content_sha256 text,
  p_generation_label text,
  p_page_count integer,
  p_reviewed_page_count integer,
  p_expected_record_count integer,
  p_reviewed_record_count integer,
  p_activation_receipt jsonb default '{}'::jsonb
)
returns public.luminari_reviewed_source_overlay_v1
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_run public.luminari_corpus_rebuild_run_v1%rowtype;
  v_source_record_count integer;
  v_binding_count integer;
  v_action_count integer;
  v_context_count integer;
  v_expected_action_count integer := coalesce((p_activation_receipt->>'expected_action_count')::integer, 0);
  v_expected_context_count integer := coalesce((p_activation_receipt->>'expected_context_count')::integer, 0);
  v_overlay public.luminari_reviewed_source_overlay_v1%rowtype;
begin
  if nullif(btrim(p_overlay_key), '') is null then
    raise exception 'overlay_key is required';
  end if;
  if nullif(btrim(p_source_filename), '') is null then
    raise exception 'source_filename is required';
  end if;
  if p_page_count is null or p_reviewed_page_count is distinct from p_page_count then
    raise exception 'all source pages must be reviewed before activation';
  end if;
  if p_expected_record_count is null
     or p_reviewed_record_count is distinct from p_expected_record_count then
    raise exception 'all expected source records must be reviewed before activation';
  end if;

  select * into v_run
  from public.luminari_corpus_rebuild_run_v1
  where run_id = p_run_id;

  if not found then
    raise exception 'reviewed overlay run % does not exist', p_run_id;
  end if;
  if v_run.status <> 'completed' then
    raise exception 'reviewed overlay run % is not completed', p_run_id;
  end if;
  if v_run.engine_version not like 'manual_source_review_reconciliation_v%' then
    raise exception 'run % is not a manual source-review run', p_run_id;
  end if;

  select count(distinct source_record_id)::integer
    into v_source_record_count
  from public.luminari_reviewed_source_record_revision_v1
  where run_id = p_run_id and source_filename = btrim(p_source_filename);

  select count(distinct binding_key)::integer,
         count(distinct action_key)::integer
    into v_binding_count, v_action_count
  from public.luminari_situation_action_binding_revision_v1
  where run_id = p_run_id;

  select count(distinct context_id)::integer
    into v_context_count
  from public.luminari_reviewed_context_revision_v1
  where run_id = p_run_id and source_filename = btrim(p_source_filename);

  if v_source_record_count <> p_expected_record_count then
    raise exception 'run % has % reviewed records; expected %',
      p_run_id, v_source_record_count, p_expected_record_count;
  end if;
  if v_binding_count <> p_expected_record_count then
    raise exception 'run % has % supporting bindings; expected %',
      p_run_id, v_binding_count, p_expected_record_count;
  end if;
  if v_expected_action_count > 0 and v_action_count <> v_expected_action_count then
    raise exception 'run % has % canonical actions; expected %',
      p_run_id, v_action_count, v_expected_action_count;
  end if;
  if v_context_count <> v_expected_context_count then
    raise exception 'run % has % context alerts; expected %',
      p_run_id, v_context_count, v_expected_context_count;
  end if;

  insert into public.luminari_reviewed_source_overlay_v1 (
    overlay_key, active_run_id, source_filename, source_content_sha256,
    generation_label, page_count, reviewed_page_count,
    expected_record_count, reviewed_record_count, activated_at,
    activation_receipt
  ) values (
    btrim(p_overlay_key), p_run_id, btrim(p_source_filename),
    p_source_content_sha256, nullif(btrim(p_generation_label), ''),
    p_page_count, p_reviewed_page_count, p_expected_record_count,
    p_reviewed_record_count, now(), coalesce(p_activation_receipt, '{}'::jsonb)
      || jsonb_build_object(
        'reviewed_source_record_count', v_source_record_count,
        'supporting_binding_count', v_binding_count,
        'canonical_action_count', v_action_count,
        'context_action_alert_count', v_context_count
      )
  )
  on conflict (overlay_key) do update set
    active_run_id = excluded.active_run_id,
    source_filename = excluded.source_filename,
    source_content_sha256 = excluded.source_content_sha256,
    generation_label = excluded.generation_label,
    page_count = excluded.page_count,
    reviewed_page_count = excluded.reviewed_page_count,
    expected_record_count = excluded.expected_record_count,
    reviewed_record_count = excluded.reviewed_record_count,
    activated_at = excluded.activated_at,
    activation_receipt = excluded.activation_receipt
  returning * into v_overlay;

  return v_overlay;
end;
$function$;

revoke all on function public.activate_luminari_reviewed_source_overlay_v1(
  text, uuid, text, text, text, integer, integer, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.activate_luminari_reviewed_source_overlay_v1(
  text, uuid, text, text, text, integer, integer, integer, integer, jsonb
) to service_role;
