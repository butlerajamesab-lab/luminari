-- Knowledge Backbone publication quarantine v1.
--
-- The raw knowledge_entries corpus remains intact. This migration adds a
-- deterministic, source-preserving publication layer that excludes unbound,
-- non-human, empty, ambiguous, or severity-unknown fragments from
-- person-facing reads while retaining every row in a service-only state and
-- reason-coded quarantine view.

create or replace function public.luminari_knowledge_payload_jsonb_v1(
  p_value text
)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(p_value), '') is null then
    return null;
  end if;

  return p_value::jsonb;
exception
  when others then
    return null;
end;
$$;

create or replace function public.luminari_knowledge_payload_meaningful_v1(
  p_value text
)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_typeof(parsed.payload_json) = 'object'
    and parsed.payload_json <> '{}'::jsonb,
    false
  )
  from (
    select public.luminari_knowledge_payload_jsonb_v1(p_value) as payload_json
  ) parsed;
$$;

create or replace function public.luminari_knowledge_human_name_v1(
  p_value text
)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select
    nullif(btrim(p_value), '') is not null
    and btrim(p_value) ~ '[[:alpha:]]';
$$;

create or replace function public.luminari_knowledge_normalized_severity_v1(
  p_value text
)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case
    when lower(btrim(coalesce(p_value, ''))) in (
      'info', 'low', 'medium', 'high', 'critical'
    ) then lower(btrim(p_value))
    when lower(btrim(coalesce(p_value, '')))
      ~ '^(info|low|medium|high|critical)[[:space:]]*[—–-]'
      then substring(
        lower(btrim(p_value))
        from '^(info|low|medium|high|critical)'
      )
    else null
  end;
$$;

create or replace view public.v_knowledge_entry_publication_state_v1
with (security_invoker = true) as
with source_rows as (
  select
    entry.*,
    module.id is not null as module_bound,
    module.module_type,
    module.module_name,
    nullif(lower(btrim(entry.entry_id)), '') as stable_identity_key,
    (
      nullif(btrim(entry.entry_id), '') is not null
      and btrim(entry.entry_id) ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
    ) as identity_format_ready,
    public.luminari_knowledge_human_name_v1(entry.entry_name) as human_name_ready,
    public.luminari_knowledge_payload_jsonb_v1(entry.payload) as payload_json,
    public.luminari_knowledge_payload_meaningful_v1(entry.payload) as payload_ready,
    public.luminari_knowledge_normalized_severity_v1(entry.severity) as normalized_severity,
    md5(jsonb_build_object(
      'module_id', entry.module_id,
      'entry_name', nullif(btrim(entry.entry_name), ''),
      'category', nullif(btrim(entry.category), ''),
      'severity', nullif(btrim(entry.severity), ''),
      'domain', nullif(btrim(entry.domain), ''),
      'payload', public.luminari_knowledge_payload_jsonb_v1(entry.payload),
      'tags', nullif(btrim(entry.tags), ''),
      'cross_ref_modules', nullif(btrim(entry.cross_ref_modules), '')
    )::text) as content_fingerprint
  from public.knowledge_entries entry
  left join public.knowledge_modules module
    on module.id = entry.module_id
), identity_groups as (
  select
    stable_identity_key,
    count(*)::integer as identity_row_count,
    count(distinct content_fingerprint)::integer as identity_variant_count
  from source_rows
  where stable_identity_key is not null
  group by stable_identity_key
), classified as (
  select
    source_rows.*,
    coalesce(identity_groups.identity_row_count, 1) as identity_row_count,
    coalesce(identity_groups.identity_variant_count, 0) as identity_variant_count,
    resolution.resolution_id as publication_resolution_id,
    resolution.status as publication_resolution_status,
    resolution.reason_codes as publication_resolution_reasons
  from source_rows
  left join identity_groups using (stable_identity_key)
  left join public.v_luminari_object_publication_resolution_current_v1 resolution
    on resolution.surface = 'knowledge_backbone'
   and resolution.object_kind = 'knowledge_entry'
   and resolution.source_table = 'public.knowledge_entries'
   and resolution.source_pk = source_rows.id::text
), gated as (
  select
    classified.*,
    (
      module_bound
      and identity_format_ready
      and human_name_ready
      and payload_ready
      and normalized_severity is not null
      and identity_variant_count = 1
    ) as base_publication_ready
  from classified
), candidates as (
  select
    gated.*,
    public.luminari_publication_is_visible_v1(
      base_publication_ready,
      publication_resolution_status
    ) as publication_candidate
  from gated
)
select
  candidates.*,
  case
    when publication_candidate then
      count(*) filter (where publication_candidate) over (
        partition by coalesce(stable_identity_key, '__row__:' || id::text)
        order by id
        rows between unbounded preceding and current row
      )::integer
  end as publication_rank
from candidates;

create or replace view public.v_knowledge_entry_public_v1
with (security_invoker = true) as
select
  publication_state.*,
  'publishable'::text as visibility_state
from public.v_knowledge_entry_publication_state_v1 publication_state
where publication_candidate
  and publication_rank = 1;

create or replace view public.v_knowledge_entry_quarantine_v1
with (security_invoker = true) as
select
  publication_state.*,
  array_remove(array[
    case
      when module_id is null then 'unbound_module_id'
      when not module_bound then 'orphan_module_id'
    end,
    case
      when not identity_format_ready then 'missing_or_unstable_entry_id'
    end,
    case
      when not human_name_ready then 'numeric_or_nonhuman_entry_name'
    end,
    case
      when payload_json is null then 'missing_or_invalid_payload_json'
      when not payload_ready then 'empty_or_unsupported_payload'
    end,
    case
      when normalized_severity is null
       and nullif(btrim(severity), '') is null
        then 'missing_or_unknown_severity'
      when normalized_severity is null
        then 'unsupported_severity_value'
    end,
    case
      when identity_variant_count > 1 then 'conflicting_duplicate_entry_id'
    end,
    case
      when publication_resolution_status is not null
       and publication_resolution_status <> 'active'
        then 'publication_resolution_' || publication_resolution_status
    end,
    case
      when publication_candidate and publication_rank > 1
        then 'exact_duplicate_copy'
    end
  ]::text[], null) as quarantine_reasons,
  'hidden_from_person_facing_knowledge_backbone'::text as visibility_state
from public.v_knowledge_entry_publication_state_v1 publication_state
where not publication_candidate
   or publication_rank > 1;

-- Active module counts now reflect only deterministic, publishable entries.
create or replace view public.v_knowledge_module_public_v1
with (security_invoker = true) as
select
  module.id,
  module.module_type,
  module.module_name,
  module.description,
  module.source_file,
  count(entry.id)::integer as total_entries,
  module.version,
  module.loaded_at,
  module.is_active
from public.knowledge_modules module
left join public.v_knowledge_entry_public_v1 entry
  on entry.module_id = module.id
where coalesce(module.is_active, 0) = 1
group by
  module.id,
  module.module_type,
  module.module_name,
  module.description,
  module.source_file,
  module.version,
  module.loaded_at,
  module.is_active;

-- A public cross-reference must resolve its source entry and, when it names a
-- target entry, that target entry as well. Raw cross-reference rows remain in
-- knowledge_cross_refs.
create or replace view public.v_knowledge_cross_ref_public_v1
with (security_invoker = true) as
select cross_ref.*
from public.knowledge_cross_refs cross_ref
join public.v_knowledge_entry_public_v1 source_entry
  on source_entry.module_id = cross_ref.source_module_id
 and source_entry.stable_identity_key = lower(btrim(cross_ref.source_entry_id))
left join public.v_knowledge_entry_public_v1 target_entry
  on target_entry.module_id = cross_ref.target_module_id
 and target_entry.stable_identity_key = lower(btrim(cross_ref.target_entry_id))
where cross_ref.target_entry_id is null
   or target_entry.id is not null;

-- Non-unique indexes accelerate deterministic gating without asserting a
-- false uniqueness contract over the preserved duplicate corpus.
create index if not exists idx_knowledge_entries_publication_identity_v1
  on public.knowledge_entries ((lower(btrim(entry_id))), id);

create index if not exists idx_knowledge_entries_publication_module_v1
  on public.knowledge_entries (module_id, id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.knowledge_entries'::regclass
      and conname = 'knowledge_entries_module_id_fk_v1'
  ) then
    alter table public.knowledge_entries
      add constraint knowledge_entries_module_id_fk_v1
      foreign key (module_id)
      references public.knowledge_modules(id)
      on delete restrict
      not valid;
  end if;
end
$$;

comment on view public.v_knowledge_entry_public_v1 is
  'Deterministic person-facing Knowledge Backbone entries: module-bound, human-named, payload-bearing, severity-normalized, and globally unambiguous by entry_id.';
comment on view public.v_knowledge_entry_quarantine_v1 is
  'Service-only reason-coded Knowledge Backbone quarantine. Every source row remains in knowledge_entries; no source content is deleted.';
comment on constraint knowledge_entries_module_id_fk_v1 on public.knowledge_entries is
  'NOT VALID preserves the existing nullable corpus while preventing new orphan module references. Null module_id rows remain quarantined rather than deleted.';

revoke all on function public.luminari_knowledge_payload_jsonb_v1(text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.luminari_knowledge_payload_meaningful_v1(text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.luminari_knowledge_human_name_v1(text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.luminari_knowledge_normalized_severity_v1(text)
  from PUBLIC, anon, authenticated, service_role;
grant execute on function public.luminari_knowledge_payload_jsonb_v1(text)
  to service_role;
grant execute on function public.luminari_knowledge_payload_meaningful_v1(text)
  to service_role;
grant execute on function public.luminari_knowledge_human_name_v1(text)
  to service_role;
grant execute on function public.luminari_knowledge_normalized_severity_v1(text)
  to service_role;

revoke all on public.v_knowledge_entry_publication_state_v1
  from PUBLIC, anon, authenticated, service_role;
revoke all on public.v_knowledge_entry_public_v1
  from PUBLIC, anon, authenticated, service_role;
revoke all on public.v_knowledge_entry_quarantine_v1
  from PUBLIC, anon, authenticated, service_role;
revoke all on public.v_knowledge_module_public_v1
  from PUBLIC, anon, authenticated, service_role;
revoke all on public.v_knowledge_cross_ref_public_v1
  from PUBLIC, anon, authenticated, service_role;

grant select on public.v_knowledge_entry_publication_state_v1
  to service_role;
grant select on public.v_knowledge_entry_public_v1
  to service_role;
grant select on public.v_knowledge_entry_quarantine_v1
  to service_role;
grant select on public.v_knowledge_module_public_v1
  to service_role;
grant select on public.v_knowledge_cross_ref_public_v1
  to service_role;
