-- Navigation classification is separate from literal transcription and legal
-- verification. Receipts bind an already-admitted resource to its exact source.
create table public.luminari_resource_category_revision_v1 (
  revision_id uuid primary key default gen_random_uuid(),
  revision_sequence bigint generated always as identity unique,
  supersedes_revision_id uuid references public.luminari_resource_category_revision_v1(revision_id) on delete restrict,
  operation text not null check (operation in ('classify','retract')),
  civic_object_uid text not null,
  object_ref text not null,
  resource_entity_id uuid not null,
  run_id uuid not null,
  artifact_key text not null,
  source_content_sha256 text not null check (source_content_sha256 ~ '^[0-9a-f]{64}$'),
  source_candidate_hash text not null check (source_candidate_hash ~ '^[0-9a-f]{64}$'),
  source_locator text not null,
  before_category text,
  before_layer text,
  primary_category text not null,
  source_heading jsonb not null check (jsonb_typeof(source_heading)='object'),
  source_record_span jsonb not null check (jsonb_typeof(source_record_span)='object'),
  source_text text not null,
  secondary_memberships jsonb not null default '[]' check (jsonb_typeof(secondary_memberships)='array'),
  review_scope text not null check (review_scope='navigation_classification_only'),
  review_method text not null check (review_method='individual_source_heading_and_service_review'),
  review_ledger_sha256 text not null check (review_ledger_sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_by text not null check (btrim(reviewed_by)<>''),
  review_note text not null check (btrim(review_note)<>''),
  created_at timestamptz not null default now()
);
create unique index resource_category_first_revision_idx on public.luminari_resource_category_revision_v1
  (civic_object_uid,object_ref,run_id,artifact_key,source_content_sha256,source_candidate_hash,source_locator)
  where supersedes_revision_id is null;
create unique index resource_category_successor_idx on public.luminari_resource_category_revision_v1(supersedes_revision_id)
  where supersedes_revision_id is not null;
create index resource_category_target_idx on public.luminari_resource_category_revision_v1(civic_object_uid,object_ref,source_content_sha256);
alter table public.luminari_resource_category_revision_v1 enable row level security;
revoke all on public.luminari_resource_category_revision_v1 from public,anon,authenticated,service_role;
grant select,insert on public.luminari_resource_category_revision_v1 to service_role;
grant usage,select on sequence public.luminari_resource_category_revision_v1_revision_sequence_seq to service_role;
create policy resource_category_service_read on public.luminari_resource_category_revision_v1 for select to service_role using (true);
create policy resource_category_service_append on public.luminari_resource_category_revision_v1 for insert to service_role with check (true);

create function public.guard_luminari_resource_category_v1() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  v_prior public.luminari_resource_category_revision_v1%rowtype;
  v_existing public.luminari_resource_category_revision_v1%rowtype;
  v_current jsonb;
  v_count integer;
  v_member jsonb;
  v_categories text[] := array['food_nutrition','healthcare','housing','safety_crisis','legal_civil_rights','utilities','tribal','employment_labor','disability','veterans','cash_assistance','general_resource'];
  v_seen text[];
begin
  if tg_op <> 'INSERT' then raise exception 'resource_category_append_only'; end if;
  select * into v_existing from public.luminari_resource_category_revision_v1 where revision_id=new.revision_id;
  if found and (to_jsonb(v_existing)-'created_at'-'revision_sequence') is distinct from (to_jsonb(new)-'created_at'-'revision_sequence') then
    raise exception 'resource_category_conflicting_receipt_replay';
  end if;
  if new.supersedes_revision_id is not null then
    -- Immutable predecessors and the unique successor index prevent forks.
    -- No FOR UPDATE: service_role intentionally has no UPDATE privilege.
    select * into v_prior from public.luminari_resource_category_revision_v1 where revision_id=new.supersedes_revision_id;
    if not found or row(v_prior.civic_object_uid,v_prior.object_ref,v_prior.resource_entity_id,v_prior.run_id,v_prior.artifact_key,v_prior.source_content_sha256,v_prior.source_candidate_hash,v_prior.source_locator)
      is distinct from row(new.civic_object_uid,new.object_ref,new.resource_entity_id,new.run_id,new.artifact_key,new.source_content_sha256,new.source_candidate_hash,new.source_locator) then
      raise exception 'resource_category_predecessor_binding_mismatch';
    end if;
  end if;
  if new.operation='retract' then
    if new.supersedes_revision_id is null then raise exception 'resource_category_retraction_requires_predecessor'; end if;
    return new;
  end if;
  select count(*),(jsonb_agg(to_jsonb(v))->0) into v_count,v_current
    from public.v_lighthouse_resource_program_catalog_v2 v
    where v.civic_object_uid=new.civic_object_uid and v.object_ref=new.object_ref and v.run_id=new.run_id
      and v.artifact_key=new.artifact_key and v.source_content_sha256=new.source_content_sha256
      and v.source_candidate_hash=new.source_candidate_hash and v.source_locator=new.source_locator
      and v.object_class='resource' and v.person_facing_ready is true;
  if v_count<>1 or public.luminari_stable_uuid_v1(new.object_ref)<>new.resource_entity_id then
    raise exception 'resource_category_exact_admitted_target_required';
  end if;
  if (v_current->>'category') is distinct from new.before_category or (v_current->>'layer') is distinct from new.before_layer then
    raise exception 'resource_category_before_classification_changed';
  end if;
  if new.primary_category<>all(v_categories) then raise exception 'resource_category_vocabulary_required'; end if;
  if coalesce(new.source_heading->>'quoted_text','')='' or coalesce(new.source_heading->>'xpath','')=''
    or coalesce(new.source_record_span->>'part','')<>'word/document.xml'
    or coalesce(new.source_record_span->>'xpath_start','')='' or coalesce(new.source_record_span->>'xpath_end','')=''
    or strpos(new.source_text,new.source_heading->>'quoted_text')=0 then
    raise exception 'resource_category_source_heading_and_span_required';
  end if;
  v_seen := array[new.primary_category];
  for v_member in select value from jsonb_array_elements(new.secondary_memberships) loop
    if jsonb_typeof(v_member)<>'object' or coalesce(v_member->>'category','')<>all(v_categories)
      or (v_member->>'category')=any(v_seen) then raise exception 'resource_category_distinct_vocabulary_memberships_required'; end if;
    if coalesce(v_member->>'basis','')<>'reviewed_interpretation_of_source_service'
      or coalesce(v_member->>'evidence_quote','')='' or strpos(new.source_text,v_member->>'evidence_quote')=0
      or coalesce(v_member->>'source_paragraph','') !~ '^P[0-9]+$' then
      raise exception 'resource_category_explicit_service_interpretation_required';
    end if;
    v_seen := array_append(v_seen,v_member->>'category');
  end loop;
  return new;
end;
$$;
revoke all on function public.guard_luminari_resource_category_v1() from public,anon,authenticated;
create trigger resource_category_append_guard before insert or update or delete on public.luminari_resource_category_revision_v1
  for each row execute function public.guard_luminari_resource_category_v1();
create trigger resource_category_truncate_guard before truncate on public.luminari_resource_category_revision_v1
  for each statement execute function public.guard_luminari_resource_category_v1();

-- All base columns, source category, transcription receipt and admission state
-- survive unchanged. Navigation memberships are additional, explicitly reviewed.
create view public.v_lighthouse_resource_program_classified_v1 with (security_invoker=true) as
select v.*,
  r.primary_category as reviewed_primary_category,
  case when r.revision_id is null then null else array_prepend(r.primary_category,
    array(select m.value->>'category' from jsonb_array_elements(r.secondary_memberships) m(value))) end as reviewed_category_memberships,
  case when r.revision_id is null then null else jsonb_build_object(
    'revision_id',r.revision_id,'primary_basis','reviewed_source_heading_mapping','primary_category',r.primary_category,
    'source_heading',r.source_heading,'source_record_span',r.source_record_span,'secondary_memberships',r.secondary_memberships,
    'review_scope',r.review_scope,'review_method',r.review_method,'review_ledger_sha256',r.review_ledger_sha256,
    'reviewed_by',r.reviewed_by,'review_note',r.review_note,'created_at',r.created_at) end as category_review
from public.v_lighthouse_resource_program_transcribed_v1 v
left join public.luminari_resource_category_revision_v1 r
  on r.civic_object_uid=v.civic_object_uid and r.object_ref=v.object_ref and r.run_id=v.run_id
  and r.resource_entity_id=public.luminari_stable_uuid_v1(v.object_ref)
  and r.artifact_key=v.artifact_key and r.source_content_sha256=v.source_content_sha256
  and r.source_candidate_hash=v.source_candidate_hash and r.source_locator=v.source_locator
  and r.before_category is not distinct from v.category and r.before_layer is not distinct from v.layer
  and v.object_class='resource' and v.person_facing_ready is true and r.operation='classify'
  and not exists(select 1 from public.luminari_resource_category_revision_v1 successor where successor.supersedes_revision_id=r.revision_id);
revoke all on public.v_lighthouse_resource_program_classified_v1 from public,anon,authenticated;
grant select on public.v_lighthouse_resource_program_classified_v1 to service_role;
comment on table public.luminari_resource_category_revision_v1 is 'Append-only exact-source navigation classification: quoted section mapping and separately identified service interpretations. No publication or legal verification authority.';
