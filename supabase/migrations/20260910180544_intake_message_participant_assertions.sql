begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table public.intake_message_participant_assertions (
  assertion_id uuid primary key default gen_random_uuid(),
  assertion_identity_sha256 text not null unique
    check (assertion_identity_sha256 ~ '^[0-9a-f]{64}$'),
  intake_session_id uuid not null references public.intake_sessions(intake_session_id) on delete restrict,
  case_uuid uuid not null references public.case_identity_bridge(case_uuid) on delete restrict,
  artifact_id uuid not null references public.intake_artifacts(artifact_id) on delete restrict,
  artifact_key text not null,
  message_direction text not null check (message_direction in ('received','sent')),
  source_contact_name text,
  author_canonical_name text not null check (btrim(author_canonical_name) <> ''),
  author_entity_type text not null default 'person' check (author_entity_type = 'person'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  provenance_ref text not null check (btrim(provenance_ref) <> ''),
  review_status text not null check (review_status in ('pending','verified','rejected')),
  review_receipt jsonb,
  reviewed_by integer references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  supersedes_assertion_id uuid references public.intake_message_participant_assertions(assertion_id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  check ((review_status = 'pending' and reviewed_by is null and reviewed_at is null and review_receipt is null)
      or (review_status in ('verified','rejected') and reviewed_by is not null and reviewed_at is not null
          and review_receipt is not null and jsonb_typeof(review_receipt) = 'object')),
  check (message_direction = 'sent' or nullif(btrim(source_contact_name), '') is not null),
  unique (supersedes_assertion_id)
);

create index idx_intake_message_participant_assertions_scope
  on public.intake_message_participant_assertions (intake_session_id, case_uuid, artifact_id, artifact_key);
create index idx_intake_message_participant_assertions_case
  on public.intake_message_participant_assertions (case_uuid);
create index idx_intake_message_participant_assertions_artifact
  on public.intake_message_participant_assertions (artifact_id);
create index idx_intake_message_participant_assertions_reviewer
  on public.intake_message_participant_assertions (reviewed_by);

create or replace function public.intake_message_participant_assertion_identity_v1(
  p_intake_session_id uuid, p_case_uuid uuid, p_artifact_id uuid, p_artifact_key text,
  p_message_direction text, p_source_contact_name text, p_author_canonical_name text,
  p_evidence jsonb, p_provenance_ref text, p_supersedes_assertion_id uuid
) returns text language sql immutable set search_path = '' as $fn$
  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array(
      p_intake_session_id, p_case_uuid, p_artifact_id, p_artifact_key,
      p_message_direction, p_source_contact_name, p_author_canonical_name,
      'person', p_evidence, p_provenance_ref, p_supersedes_assertion_id
    )::text, 'UTF8'), 'sha256'), 'hex')
$fn$;

create or replace function public.validate_intake_message_participant_assertion_scope_v1()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.assertion_identity_sha256 <> public.intake_message_participant_assertion_identity_v1(
    new.intake_session_id, new.case_uuid, new.artifact_id, new.artifact_key,
    new.message_direction, new.source_contact_name, new.author_canonical_name,
    new.evidence, new.provenance_ref, new.supersedes_assertion_id
  ) then
    raise exception using errcode = '23514', message = 'participant assertion identity hash mismatch';
  end if;
  perform 1 from public.intake_artifacts artifact
   where artifact.artifact_id = new.artifact_id
     and artifact.intake_session_id = new.intake_session_id
     and artifact.artifact_key = new.artifact_key;
  if not found then
    raise exception using errcode = '23514', message = 'participant assertion artifact scope mismatch';
  end if;
  perform 1 from public.case_intake_links link
   where link.intake_session_id = new.intake_session_id
     and link.case_uuid = new.case_uuid
     and link.is_primary = true
     and link.link_type = 'primary_projection';
  if not found then
    raise exception using errcode = '23514', message = 'participant assertion case scope mismatch';
  end if;
  if new.supersedes_assertion_id is not null then
    perform 1 from public.intake_message_participant_assertions prior
     where prior.assertion_id = new.supersedes_assertion_id
       and prior.intake_session_id = new.intake_session_id
       and prior.case_uuid = new.case_uuid
       and prior.artifact_id = new.artifact_id;
    if not found then
      raise exception using errcode = '23514', message = 'participant assertion supersession scope mismatch';
    end if;
  end if;
  return new;
end
$fn$;

create or replace function public.append_reviewed_intake_message_participant_assertion_v1(
  p_intake_session_id uuid,
  p_case_uuid uuid,
  p_artifact_id uuid,
  p_artifact_key text,
  p_message_direction text,
  p_source_contact_name text,
  p_author_canonical_name text,
  p_evidence jsonb,
  p_provenance_ref text,
  p_review_status text,
  p_reviewed_by integer,
  p_review_receipt jsonb,
  p_supersedes_assertion_id uuid default null
) returns table(assertion_id uuid, assertion_identity_sha256 text)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_direction text := pg_catalog.lower(pg_catalog.btrim(p_message_direction));
  v_contact text := nullif(pg_catalog.btrim(p_source_contact_name), '');
  v_author text := pg_catalog.btrim(p_author_canonical_name);
  v_provenance text := pg_catalog.btrim(p_provenance_ref);
  v_identity text;
begin
  if p_review_status is null or p_review_status not in ('verified', 'rejected') or p_reviewed_by is null
     or pg_catalog.jsonb_typeof(p_review_receipt) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'explicit reviewed participant assertion receipt required';
  end if;
  if pg_catalog.jsonb_typeof(p_evidence) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_evidence->'source_refs') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'source-bound participant assertion evidence required';
  end if;
  if pg_catalog.jsonb_array_length(p_evidence->'source_refs') = 0 then
    raise exception using errcode = '22023', message = 'source-bound participant assertion evidence required';
  end if;
  v_identity := public.intake_message_participant_assertion_identity_v1(
    p_intake_session_id, p_case_uuid, p_artifact_id, p_artifact_key,
    v_direction, v_contact, v_author, p_evidence, v_provenance,
    p_supersedes_assertion_id
  );
  return query insert into public.intake_message_participant_assertions (
    assertion_identity_sha256, intake_session_id, case_uuid, artifact_id, artifact_key,
    message_direction, source_contact_name, author_canonical_name, evidence, provenance_ref,
    review_status, review_receipt, reviewed_by, reviewed_at, supersedes_assertion_id
  ) values (
    v_identity, p_intake_session_id, p_case_uuid, p_artifact_id, p_artifact_key,
    v_direction, v_contact, v_author, p_evidence, v_provenance,
    p_review_status, p_review_receipt, p_reviewed_by, pg_catalog.clock_timestamp(), p_supersedes_assertion_id
  ) returning intake_message_participant_assertions.assertion_id,
              intake_message_participant_assertions.assertion_identity_sha256;
end
$fn$;

create trigger intake_message_participant_assertions_validate_scope
before insert on public.intake_message_participant_assertions
for each row execute function public.validate_intake_message_participant_assertion_scope_v1();

create or replace function public.reject_intake_message_participant_assertion_mutation_v1()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  raise exception using errcode = '55000', message = 'participant assertions are append-only; append a superseding assertion';
end
$fn$;

create trigger intake_message_participant_assertions_append_only
before update or delete on public.intake_message_participant_assertions
for each row execute function public.reject_intake_message_participant_assertion_mutation_v1();

revoke all on function public.validate_intake_message_participant_assertion_scope_v1() from public;
revoke all on function public.reject_intake_message_participant_assertion_mutation_v1() from public;
revoke all on function public.intake_message_participant_assertion_identity_v1(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid) from public;
revoke all on function public.append_reviewed_intake_message_participant_assertion_v1(uuid, uuid, uuid, text, text, text, text, jsonb, text, text, integer, jsonb, uuid) from public;

alter table public.intake_message_participant_assertions enable row level security;
revoke all on table public.intake_message_participant_assertions from public;
do $acl$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.intake_message_participant_assertions from anon;
    revoke all on function public.validate_intake_message_participant_assertion_scope_v1() from anon;
    revoke all on function public.reject_intake_message_participant_assertion_mutation_v1() from anon;
    revoke all on function public.append_reviewed_intake_message_participant_assertion_v1(uuid, uuid, uuid, text, text, text, text, jsonb, text, text, integer, jsonb, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.intake_message_participant_assertions from authenticated;
    revoke all on function public.validate_intake_message_participant_assertion_scope_v1() from authenticated;
    revoke all on function public.reject_intake_message_participant_assertion_mutation_v1() from authenticated;
    revoke all on function public.append_reviewed_intake_message_participant_assertion_v1(uuid, uuid, uuid, text, text, text, text, jsonb, text, text, integer, jsonb, uuid) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on table public.intake_message_participant_assertions from service_role;
    grant select on table public.intake_message_participant_assertions to service_role;
    grant execute on function public.append_reviewed_intake_message_participant_assertion_v1(uuid, uuid, uuid, text, text, text, text, jsonb, text, text, integer, jsonb, uuid) to service_role;
  end if;
end
$acl$;

commit;
