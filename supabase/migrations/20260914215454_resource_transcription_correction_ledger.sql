-- Exact-source transcription corrections for resources already admitted by the
-- existing person-facing gate. No source/candidate, identity, jurisdiction,
-- verification, readiness, legal-authority or deadline record is rewritten.
-- Dossier publication and reviewed-source activation contracts are unchanged.
create table public.luminari_resource_transcription_revision_v1 (
  revision_id uuid primary key default gen_random_uuid(),
  revision_sequence bigint generated always as identity unique,
  supersedes_revision_id uuid references public.luminari_resource_transcription_revision_v1(revision_id) on delete restrict,
  operation text not null check (operation in ('correct', 'retract')),
  civic_object_uid text not null check (btrim(civic_object_uid) <> ''),
  object_ref text not null check (btrim(object_ref) <> ''),
  resource_entity_id uuid not null,
  run_id uuid not null,
  artifact_key text not null check (btrim(artifact_key) <> ''),
  source_content_sha256 text not null check (source_content_sha256 ~ '^[0-9a-f]{64}$'),
  source_candidate_hash text not null check (source_candidate_hash ~ '^[0-9a-f]{64}$'),
  source_locator text not null check (btrim(source_locator) <> ''),
  before_fields jsonb not null check (jsonb_typeof(before_fields) = 'object'),
  after_fields jsonb not null check (jsonb_typeof(after_fields) = 'object'),
  source_span jsonb not null check (jsonb_typeof(source_span) = 'object'),
  source_text text not null check (btrim(source_text) <> ''),
  review_ledger_sha256 text not null check (review_ledger_sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_by text not null check (btrim(reviewed_by) <> ''),
  review_method text not null check (review_method = 'individual_source_transcription'),
  review_scope text not null check (review_scope = 'source_assertion_only'),
  review_note text not null check (btrim(review_note) <> ''),
  created_at timestamptz not null default now()
);
-- An immutable linear chain per exact source binding; concurrent writers cannot
-- fork a correction. Retraction is another event, never a destructive rollback.
create unique index luminari_resource_transcription_first_idx
  on public.luminari_resource_transcription_revision_v1
  (civic_object_uid, object_ref, run_id, source_content_sha256, source_candidate_hash, source_locator)
  where supersedes_revision_id is null;
create unique index luminari_resource_transcription_successor_idx
  on public.luminari_resource_transcription_revision_v1(supersedes_revision_id)
  where supersedes_revision_id is not null;
create index luminari_resource_transcription_target_idx
  on public.luminari_resource_transcription_revision_v1
  (civic_object_uid, object_ref, source_content_sha256, revision_sequence desc);
alter table public.luminari_resource_transcription_revision_v1 enable row level security;
revoke all on public.luminari_resource_transcription_revision_v1 from public, anon, authenticated, service_role;
grant select, insert on public.luminari_resource_transcription_revision_v1 to service_role;
do $$ begin execute format('grant usage, select on sequence %s to service_role',
  pg_get_serial_sequence('public.luminari_resource_transcription_revision_v1','revision_sequence')); end $$;
create policy resource_transcription_service_read on public.luminari_resource_transcription_revision_v1
  for select to service_role using (true);
create policy resource_transcription_service_append on public.luminari_resource_transcription_revision_v1
  for insert to service_role with check (true);

create function public.guard_luminari_resource_transcription_v1()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_current jsonb;
  v_count integer;
  v_field text;
  v_after jsonb;
  v_prior public.luminari_resource_transcription_revision_v1%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'resource_transcription_append_only';
  end if;
  select * into v_prior from public.luminari_resource_transcription_revision_v1
    where revision_id = new.revision_id;
  if found then
    if (to_jsonb(new) - 'revision_sequence' - 'created_at')
      is distinct from (to_jsonb(v_prior) - 'revision_sequence' - 'created_at') then
      raise exception 'resource_transcription_conflicting_receipt_replay';
    end if;
    return new; -- Exact receipt replay may be handled by ON CONFLICT DO NOTHING.
  end if;
  if new.supersedes_revision_id is not null then
    select * into v_prior from public.luminari_resource_transcription_revision_v1
      where revision_id = new.supersedes_revision_id;
    -- The predecessor is immutable. Its unique successor index prevents forks
    -- without requiring UPDATE privileges from the append-only service writer.
    if not found or row(v_prior.civic_object_uid, v_prior.object_ref, v_prior.run_id,
      v_prior.artifact_key, v_prior.resource_entity_id, v_prior.source_content_sha256,
      v_prior.source_candidate_hash, v_prior.source_locator)
      is distinct from row(new.civic_object_uid, new.object_ref, new.run_id,
      new.artifact_key, new.resource_entity_id, new.source_content_sha256,
      new.source_candidate_hash, new.source_locator) then
      raise exception 'resource_transcription_predecessor_binding_mismatch';
    end if;
  end if;
  if new.operation = 'retract' then
    if new.supersedes_revision_id is null or new.after_fields <> '{}'::jsonb
      or new.before_fields <> v_prior.before_fields then
      raise exception 'resource_transcription_retraction_requires_predecessor';
    end if;
    return new;
  end if;
  select count(*), (jsonb_agg(to_jsonb(v))->0) into v_count, v_current
  from public.v_lighthouse_resource_program_catalog_v2 v
  where v.civic_object_uid = new.civic_object_uid and v.object_ref = new.object_ref
    and v.run_id = new.run_id and v.artifact_key = new.artifact_key
    and v.source_content_sha256 = new.source_content_sha256
    and v.source_candidate_hash = new.source_candidate_hash
    and v.source_locator = new.source_locator
    and v.object_class = 'resource' and v.person_facing_ready is true;
  if v_count <> 1 or public.luminari_stable_uuid_v1(new.object_ref) <> new.resource_entity_id then
    raise exception 'resource_transcription_exact_published_target_required';
  end if;
  if new.after_fields = '{}'::jsonb or new.before_fields = '{}'::jsonb
    or (select array_agg(key order by key) from jsonb_object_keys(new.before_fields) key)
       is distinct from (select array_agg(key order by key) from jsonb_object_keys(new.after_fields) key) then
    raise exception 'resource_transcription_matching_field_sets_required';
  end if;
  if coalesce(new.source_span->>'part','') <> 'word/document.xml'
    or coalesce(new.source_span->>'xpath_start','') = ''
    or coalesce(new.source_span->>'xpath_end','') = '' then
    raise exception 'resource_transcription_explicit_source_span_required';
  end if;
  for v_field, v_after in select key, value from jsonb_each(new.after_fields) loop
    if v_field <> all(array['name','organization_name','phone','email','website_url','address',
      'eligibility_summary','apply_notes','description']) then
      raise exception 'resource_transcription_field_not_permitted: %', v_field;
    end if;
    if not (new.before_fields ? v_field) or new.before_fields->v_field is distinct from v_current->v_field then
      raise exception 'resource_transcription_before_value_changed: %', v_field;
    end if;
    -- Null may remove cross-record spillover. Non-null changes must be literal
    -- substrings of the reviewed source span; no inferred prose or URL repair.
    if v_field = 'website_url' and v_after <> 'null'::jsonb
      and coalesce(new.after_fields->>v_field,'') !~ '^https?://' then
      raise exception 'resource_transcription_http_url_required';
    end if;
    if v_after <> 'null'::jsonb and (jsonb_typeof(v_after) <> 'string'
      or btrim(new.after_fields->>v_field) = ''
      or strpos(new.source_text, new.after_fields->>v_field) = 0) then
      raise exception 'resource_transcription_literal_source_required: %', v_field;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_luminari_resource_transcription_v1() from public, anon, authenticated;
create trigger resource_transcription_guard before insert or update or delete
  on public.luminari_resource_transcription_revision_v1
  for each row execute function public.guard_luminari_resource_transcription_v1();
create trigger resource_transcription_no_truncate before truncate
  on public.luminari_resource_transcription_revision_v1
  for each statement execute function public.guard_luminari_resource_transcription_v1();

-- This is a correction of the admitted resource's representation, never an
-- admission route. An unchanged source binding and all before values are tested
-- again on every read. A later mismatched/retracted revision never falls back.
create view public.v_luminari_resource_transcription_current_v1 with (security_invoker = true) as
select r.*
from public.luminari_resource_transcription_revision_v1 r
join public.v_lighthouse_resource_program_catalog_v2 v
  on v.civic_object_uid = r.civic_object_uid and v.object_ref = r.object_ref
  and v.run_id = r.run_id and v.artifact_key = r.artifact_key
  and v.source_content_sha256 = r.source_content_sha256
  and v.source_candidate_hash = r.source_candidate_hash
  and v.source_locator = r.source_locator
  and v.object_class = 'resource' and v.person_facing_ready is true
  and r.resource_entity_id = public.luminari_stable_uuid_v1(v.object_ref)
where r.operation = 'correct'
  and not exists (select 1 from public.luminari_resource_transcription_revision_v1 successor
    where successor.supersedes_revision_id = r.revision_id)
  and not exists (select 1 from jsonb_each(r.before_fields) f where to_jsonb(v)->f.key is distinct from f.value);
revoke all on public.v_luminari_resource_transcription_current_v1 from public, anon, authenticated;
grant select on public.v_luminari_resource_transcription_current_v1 to service_role;

-- Preserve the complete catalog column contract. Added columns carry the
-- original transcribed fields and the limited correction receipt. No legal or
-- publication state can be set through this ledger.
do $$
declare v_columns text;
begin
  select string_agg(case when a.attname = any(array['name','organization_name','phone','email',
    'website_url','address','eligibility_summary','apply_notes','description'])
    then format('case when r.after_fields ? %L then r.after_fields->>%L else v.%I end as %I',
      a.attname, a.attname, a.attname, a.attname)
    else format('v.%I', a.attname) end, ', ' order by a.attnum) into v_columns
  from pg_attribute a where a.attrelid = 'public.v_lighthouse_resource_program_catalog_v2'::regclass
    and a.attnum > 0 and not a.attisdropped;
  execute 'create view public.v_lighthouse_resource_program_transcribed_v1 with (security_invoker = true) as select '
    || v_columns || ', case when r.revision_id is null then null else jsonb_build_object('
    || '''revision_id'',r.revision_id,''review_scope'',r.review_scope,''review_method'',r.review_method,'
    || '''before_fields'',r.before_fields,''after_fields'',r.after_fields,''source_span'',r.source_span,'
    || '''source_content_sha256'',r.source_content_sha256,''review_ledger_sha256'',r.review_ledger_sha256,'
    || '''reviewed_by'',r.reviewed_by,''review_note'',r.review_note,''created_at'',r.created_at) end as source_transcription_correction '
    || 'from public.v_lighthouse_resource_program_catalog_v2 v left join public.luminari_resource_transcription_revision_v1 r '
    || 'on r.civic_object_uid=v.civic_object_uid and r.object_ref=v.object_ref and r.run_id=v.run_id '
    || 'and r.source_content_sha256=v.source_content_sha256 and r.source_candidate_hash=v.source_candidate_hash '
    || 'and r.source_locator=v.source_locator and r.artifact_key=v.artifact_key '
    || 'and v.object_class=''resource'' and v.person_facing_ready is true and r.operation=''correct'' '
    || 'and r.resource_entity_id=public.luminari_stable_uuid_v1(v.object_ref) '
    || 'and not exists (select 1 from public.luminari_resource_transcription_revision_v1 successor where successor.supersedes_revision_id=r.revision_id) '
    || 'and not exists (select 1 from jsonb_each(r.before_fields) f where to_jsonb(v)->f.key is distinct from f.value)';
end $$;
revoke all on public.v_lighthouse_resource_program_transcribed_v1 from public, anon, authenticated;
grant select on public.v_lighthouse_resource_program_transcribed_v1 to service_role;
comment on table public.luminari_resource_transcription_revision_v1 is
  'Append-only exact-source transcription receipts. Does not verify underlying facts, activate a dossier, merge identities or admit held resources.';
comment on view public.v_lighthouse_resource_program_transcribed_v1 is
  'Existing resource catalog with exact-source transcription corrections only. Source versions and every admission/verification state are preserved; stale receipts fail closed.';
