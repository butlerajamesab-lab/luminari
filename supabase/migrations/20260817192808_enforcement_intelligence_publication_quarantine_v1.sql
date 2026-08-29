-- Enforcement Intelligence publication quarantine v1.
--
-- Penalty and viability source rows remain intact. Person-facing readers use
-- strict publishable views; incomplete or duplicate candidates remain visible
-- to the service role through reason-coded quarantine views. This migration
-- performs no source-row update or deletion.

create or replace function public.luminari_enforcement_substantive_text_v1(
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
    and lower(regexp_replace(btrim(p_value), '\s+', ' ', 'g')) not in (
      'n/a',
      'na',
      'none',
      'not available',
      'not applicable',
      'unknown',
      'tbd',
      'varies',
      'varies by violation',
      'case by case',
      'case-by-case',
      'see statute'
    );
$$;

create or replace function public.luminari_enforcement_source_url_ready_v1(
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
    and btrim(p_value) ~* '^https?://[^[:space:]]+$';
$$;

create or replace function public.luminari_enforcement_penalty_value_real_v1(
  p_value text
)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select
    public.luminari_enforcement_substantive_text_v1(p_value)
    and p_value ~ '[0-9]';
$$;

-- Publication state retains one row for every penalty source row. Manual
-- publication resolutions can hide a row, but can never override its base
-- penalty/source/authority gate.
create or replace view public.v_enforcement_penalty_publication_state_v1
with (security_invoker = true) as
with classified as (
  select
    penalty.*,
    (
      public.luminari_enforcement_penalty_value_real_v1(penalty.statutory_max_penalty)
      or public.luminari_enforcement_penalty_value_real_v1(penalty.average_penalty)
      or public.luminari_enforcement_penalty_value_real_v1(penalty.typical_settlement_range)
    ) as has_real_penalty_value,
    public.luminari_enforcement_source_url_ready_v1(penalty.source_url) as source_url_ready,
    public.luminari_enforcement_substantive_text_v1(penalty.authority_citation) as authority_citation_ready,
    resolution.resolution_id as publication_resolution_id,
    resolution.status as publication_resolution_status,
    resolution.reason_codes as publication_resolution_reasons
  from public.enforcement_penalties penalty
  left join public.v_luminari_object_publication_resolution_current_v1 resolution
    on resolution.surface = 'enforcement_hub'
   and resolution.object_kind = 'penalty'
   and resolution.source_table = 'public.enforcement_penalties'
   and resolution.source_pk = penalty.id::text
), gated as (
  select
    classified.*,
    (
      has_real_penalty_value
      and source_url_ready
      and authority_citation_ready
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
  count(*) over (
    partition by
      lower(btrim(agency)),
      lower(btrim(agency_short)),
      lower(btrim(violation_type)),
      lower(btrim(coalesce(pipeline_category, '')))
  )::integer as stored_copy_count,
  case
    when publication_candidate then
      count(*) filter (where publication_candidate) over (
        partition by
          lower(btrim(agency)),
          lower(btrim(agency_short)),
          lower(btrim(violation_type)),
          lower(btrim(coalesce(pipeline_category, '')))
        order by id
        rows between unbounded preceding and current row
      )::integer
  end as publication_rank
from candidates;

create or replace view public.v_enforcement_penalty_public_v1
with (security_invoker = true) as
select
  publication_state.*,
  'publishable'::text as visibility_state
from public.v_enforcement_penalty_publication_state_v1 publication_state
where publication_candidate
  and publication_rank = 1;

create or replace view public.v_enforcement_penalty_quarantine_v1
with (security_invoker = true) as
select
  publication_state.*,
  array_remove(array[
    case
      when not has_real_penalty_value then 'missing_real_penalty_value'
    end,
    case
      when nullif(btrim(source_url), '') is null then 'missing_source_url'
      when not source_url_ready then 'invalid_source_url'
    end,
    case
      when not authority_citation_ready then 'missing_authority_citation'
    end,
    case
      when publication_resolution_status is not null
       and publication_resolution_status <> 'active'
        then 'publication_resolution_' || publication_resolution_status
    end,
    case
      when publication_candidate and publication_rank > 1
        then 'duplicate_publishable_identity'
    end
  ]::text[], null) as quarantine_reasons,
  'hidden_from_enforcement_hub'::text as visibility_state
from public.v_enforcement_penalty_publication_state_v1 publication_state
where not publication_candidate
   or publication_rank > 1;

-- Viability publication requires a source URL, controlling authority, and a
-- concrete recommended channel. Exact duplicate public candidates collapse in
-- the view; every source row remains in its source table and state projection.
create or replace view public.v_enforcement_viability_rule_publication_state_v1
with (security_invoker = true) as
with classified as (
  select
    viability.*,
    public.luminari_enforcement_source_url_ready_v1(viability.source_url) as source_url_ready,
    public.luminari_enforcement_substantive_text_v1(viability.authority_citation) as authority_citation_ready,
    public.luminari_enforcement_substantive_text_v1(viability.recommended_channel) as recommended_channel_ready,
    resolution.resolution_id as publication_resolution_id,
    resolution.status as publication_resolution_status,
    resolution.reason_codes as publication_resolution_reasons
  from public.enforcement_viability_rules viability
  left join public.v_luminari_object_publication_resolution_current_v1 resolution
    on resolution.surface = 'enforcement_hub'
   and resolution.object_kind = 'viability_rule'
   and resolution.source_table = 'public.enforcement_viability_rules'
   and resolution.source_pk = viability.id::text
), gated as (
  select
    classified.*,
    (
      source_url_ready
      and authority_citation_ready
      and recommended_channel_ready
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
  count(*) over (
    partition by
      lower(btrim(claim_type)),
      lower(btrim(jurisdiction)),
      lower(btrim(agency)),
      lower(btrim(agency_short)),
      lower(btrim(pipeline_category))
  )::integer as stored_copy_count,
  case
    when publication_candidate then
      count(*) filter (where publication_candidate) over (
        partition by
          lower(btrim(claim_type)),
          lower(btrim(jurisdiction)),
          lower(btrim(agency)),
          lower(btrim(agency_short)),
          lower(btrim(pipeline_category))
        order by id
        rows between unbounded preceding and current row
      )::integer
  end as publication_rank
from candidates;

create or replace view public.v_enforcement_viability_rule_public_v1
with (security_invoker = true) as
select
  publication_state.*,
  'publishable'::text as visibility_state
from public.v_enforcement_viability_rule_publication_state_v1 publication_state
where publication_candidate
  and publication_rank = 1;

create or replace view public.v_enforcement_viability_rule_quarantine_v1
with (security_invoker = true) as
select
  publication_state.*,
  array_remove(array[
    case
      when nullif(btrim(source_url), '') is null then 'missing_source_url'
      when not source_url_ready then 'invalid_source_url'
    end,
    case
      when not authority_citation_ready then 'missing_authority_citation'
    end,
    case
      when not recommended_channel_ready then 'missing_recommended_channel'
    end,
    case
      when publication_resolution_status is not null
       and publication_resolution_status <> 'active'
        then 'publication_resolution_' || publication_resolution_status
    end,
    case
      when publication_candidate and publication_rank > 1
        then 'duplicate_publishable_identity'
    end
  ]::text[], null) as quarantine_reasons,
  'hidden_from_enforcement_hub'::text as visibility_state
from public.v_enforcement_viability_rule_publication_state_v1 publication_state
where not publication_candidate
   or publication_rank > 1;

create index if not exists idx_enforcement_penalties_publication_scan_v1
  on public.enforcement_penalties (agency_short, pipeline_category, id)
  where (
    public.luminari_enforcement_penalty_value_real_v1(statutory_max_penalty)
    or public.luminari_enforcement_penalty_value_real_v1(average_penalty)
    or public.luminari_enforcement_penalty_value_real_v1(typical_settlement_range)
  )
  and public.luminari_enforcement_source_url_ready_v1(source_url)
  and public.luminari_enforcement_substantive_text_v1(authority_citation);

create index if not exists idx_enforcement_viability_rules_publication_scan_v1
  on public.enforcement_viability_rules (agency_short, pipeline_category, id)
  where public.luminari_enforcement_source_url_ready_v1(source_url)
    and public.luminari_enforcement_substantive_text_v1(authority_citation)
    and public.luminari_enforcement_substantive_text_v1(recommended_channel);

comment on view public.v_enforcement_penalty_public_v1 is
  'Strict Enforcement Hub penalties: one canonical public row with a real quantified penalty value, source URL, and authority citation.';
comment on view public.v_enforcement_penalty_quarantine_v1 is
  'Service-only reason-coded quarantine for incomplete, manually hidden, or duplicate penalty rows. Source rows are never deleted.';
comment on view public.v_enforcement_viability_rule_public_v1 is
  'Strict Enforcement Hub viability rules: one canonical public row with source URL, authority citation, and recommended channel.';
comment on view public.v_enforcement_viability_rule_quarantine_v1 is
  'Service-only reason-coded quarantine for incomplete, manually hidden, or duplicate viability rows. Source rows are never deleted.';

revoke all on function public.luminari_enforcement_substantive_text_v1(text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.luminari_enforcement_source_url_ready_v1(text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.luminari_enforcement_penalty_value_real_v1(text)
  from PUBLIC, anon, authenticated, service_role;
grant execute on function public.luminari_enforcement_substantive_text_v1(text)
  to service_role;
grant execute on function public.luminari_enforcement_source_url_ready_v1(text)
  to service_role;
grant execute on function public.luminari_enforcement_penalty_value_real_v1(text)
  to service_role;

revoke all on public.v_enforcement_penalty_publication_state_v1
  from PUBLIC, anon, authenticated, service_role;
revoke all on public.v_enforcement_penalty_public_v1
  from PUBLIC, anon, authenticated, service_role;
revoke all on public.v_enforcement_penalty_quarantine_v1
  from PUBLIC, anon, authenticated, service_role;
revoke all on public.v_enforcement_viability_rule_publication_state_v1
  from PUBLIC, anon, authenticated, service_role;
revoke all on public.v_enforcement_viability_rule_public_v1
  from PUBLIC, anon, authenticated, service_role;
revoke all on public.v_enforcement_viability_rule_quarantine_v1
  from PUBLIC, anon, authenticated, service_role;

grant select on public.v_enforcement_penalty_publication_state_v1
  to service_role;
grant select on public.v_enforcement_penalty_public_v1
  to service_role;
grant select on public.v_enforcement_penalty_quarantine_v1
  to service_role;
grant select on public.v_enforcement_viability_rule_publication_state_v1
  to service_role;
grant select on public.v_enforcement_viability_rule_public_v1
  to service_role;
grant select on public.v_enforcement_viability_rule_quarantine_v1
  to service_role;
