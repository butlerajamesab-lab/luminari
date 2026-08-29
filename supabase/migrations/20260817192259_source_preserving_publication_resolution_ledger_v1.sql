-- Source-preserving publication resolution ledger v1.
--
-- This is an append-only decision layer for resolving duplicate, fragmented,
-- superseded, and withdrawn records without mutating or deleting their source
-- rows. Public projections must still calculate their own current base
-- integrity/readiness predicate and pass it to
-- luminari_publication_is_visible_v1(); an active resolution never overrides a
-- failed base integrity gate.

create table if not exists public.luminari_object_publication_resolution_revision_v1 (
  resolution_id uuid primary key default gen_random_uuid(),

  -- Generic source identity. A row in this ledger never replaces the source.
  surface text not null,
  object_kind text not null,
  source_table text not null,
  source_pk text not null,

  -- Canonical identity and alias preservation. Multiple source records may
  -- resolve to the same canonical_object_key while retaining their own rows.
  canonical_object_key text,
  source_display_name text,
  source_aliases text[] not null default '{}'::text[],
  match_basis text,
  match_confidence numeric(5, 4),
  match_evidence jsonb not null default '{}'::jsonb,

  -- Publication decision. Hidden states are reason-coded, never destructive.
  status text not null,
  reason_codes text[] not null default '{}'::text[],
  base_ready_at_review boolean not null default false,
  base_gate_snapshot jsonb not null default '{}'::jsonb,

  -- Source and review provenance.
  source_run_id uuid,
  source_artifact_key text,
  source_record_id text,
  source_content_sha256 text,
  source_record_sha256 text,
  source_reference text not null,
  source_provenance jsonb not null default '{}'::jsonb,

  -- A superseded revision points to the exact replacement decision. RESTRICT
  -- prevents the lineage target from being removed underneath the audit trail.
  superseded_by_resolution_id uuid
    references public.luminari_object_publication_resolution_revision_v1(resolution_id)
    on delete restrict,

  review_note text,
  review_version text not null,
  reviewed_by text not null,
  reviewed_at timestamptz not null default clock_timestamp(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),

  constraint luminari_object_publication_resolution_revision_v1_source_revision_key
    unique (surface, object_kind, source_table, source_pk, review_version),

  constraint luminari_object_publication_resolution_revision_v1_surface_check
    check (surface ~ '^[a-z][a-z0-9_]*$'),
  constraint luminari_object_publication_resolution_revision_v1_object_kind_check
    check (object_kind ~ '^[a-z][a-z0-9_]*$'),
  constraint luminari_object_publication_resolution_revision_v1_source_table_check
    check (source_table ~ '^[a-z_][a-z0-9_.]*$'),
  constraint luminari_object_publication_resolution_revision_v1_source_pk_check
    check (nullif(btrim(source_pk), '') is not null),
  constraint luminari_object_publication_resolution_revision_v1_canonical_key_check
    check (canonical_object_key is null or nullif(btrim(canonical_object_key), '') is not null),
  constraint luminari_object_publication_resolution_revision_v1_aliases_check
    check (array_position(source_aliases, null) is null),
  constraint luminari_object_publication_resolution_revision_v1_match_basis_check
    check (match_basis is null or nullif(btrim(match_basis), '') is not null),
  constraint luminari_object_publication_resolution_revision_v1_match_confidence_check
    check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),
  constraint luminari_object_publication_resolution_revision_v1_match_evidence_check
    check (jsonb_typeof(match_evidence) = 'object'),
  constraint luminari_object_publication_resolution_revision_v1_status_check
    check (status in ('active', 'review_hold', 'quarantined', 'superseded', 'withdrawn')),
  constraint luminari_object_publication_resolution_revision_v1_reason_codes_check
    check (
      array_position(reason_codes, null) is null
      and (
        status = 'active'
        or coalesce(cardinality(reason_codes), 0) > 0
      )
    ),
  constraint luminari_object_publication_resolution_revision_v1_active_gate_check
    check (status <> 'active' or base_ready_at_review),
  constraint luminari_object_publication_resolution_revision_v1_active_canonical_check
    check (
      status <> 'active'
      or nullif(btrim(canonical_object_key), '') is not null
    ),
  constraint luminari_object_publication_resolution_revision_v1_base_snapshot_check
    check (jsonb_typeof(base_gate_snapshot) = 'object'),
  constraint luminari_object_publication_resolution_revision_v1_content_hash_check
    check (source_content_sha256 is null or source_content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint luminari_object_publication_resolution_revision_v1_record_hash_check
    check (source_record_sha256 is null or source_record_sha256 ~ '^[0-9a-f]{64}$'),
  constraint luminari_object_publication_resolution_revision_v1_source_reference_check
    check (nullif(btrim(source_reference), '') is not null),
  constraint luminari_object_publication_resolution_revision_v1_source_provenance_check
    check (jsonb_typeof(source_provenance) = 'object'),
  constraint luminari_object_publication_resolution_revision_v1_superseded_lineage_check
    check (
      (
        status = 'superseded'
        and superseded_by_resolution_id is not null
        and superseded_by_resolution_id <> resolution_id
      )
      or (
        status <> 'superseded'
        and superseded_by_resolution_id is null
      )
    ),
  constraint luminari_object_publication_resolution_revision_v1_review_version_check
    check (nullif(btrim(review_version), '') is not null),
  constraint luminari_object_publication_resolution_revision_v1_reviewed_by_check
    check (nullif(btrim(reviewed_by), '') is not null),
  constraint luminari_object_publication_resolution_revision_v1_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.luminari_object_publication_resolution_revision_v1 is
  'Append-only, source-preserving publication decisions. Source rows are never deleted or rewritten by this ledger; active status cannot bypass a surface base-integrity gate.';
comment on column public.luminari_object_publication_resolution_revision_v1.canonical_object_key is
  'Stable canonical identity shared by equivalent source records; source identity and aliases remain preserved on every revision.';
comment on column public.luminari_object_publication_resolution_revision_v1.base_ready_at_review is
  'Audit snapshot only. Public projections must also recompute current base readiness before publication.';
comment on column public.luminari_object_publication_resolution_revision_v1.superseded_by_resolution_id is
  'Exact replacement decision revision; ON DELETE RESTRICT preserves lineage.';

create index if not exists luminari_object_publication_resolution_revision_v1_current_idx
  on public.luminari_object_publication_resolution_revision_v1 (
    surface,
    object_kind,
    source_table,
    source_pk,
    reviewed_at desc,
    created_at desc,
    resolution_id desc
  );

create index if not exists luminari_object_publication_resolution_revision_v1_status_idx
  on public.luminari_object_publication_resolution_revision_v1 (
    surface,
    status,
    object_kind,
    reviewed_at desc
  );

create index if not exists luminari_object_publication_resolution_revision_v1_canonical_idx
  on public.luminari_object_publication_resolution_revision_v1 (
    surface,
    object_kind,
    canonical_object_key
  )
  where canonical_object_key is not null;

create index if not exists luminari_object_publication_resolution_revision_v1_superseded_idx
  on public.luminari_object_publication_resolution_revision_v1 (superseded_by_resolution_id)
  where superseded_by_resolution_id is not null;

create index if not exists luminari_object_publication_resolution_revision_v1_provenance_idx
  on public.luminari_object_publication_resolution_revision_v1 (
    source_artifact_key,
    source_record_id
  )
  where source_artifact_key is not null;

create index if not exists luminari_object_publication_resolution_revision_v1_reason_codes_idx
  on public.luminari_object_publication_resolution_revision_v1
  using gin (reason_codes);

-- One deterministic row per source object, while the revision table retains
-- the complete decision history.
create or replace view public.v_luminari_object_publication_resolution_current_v1
with (security_invoker = true)
as
with current_resolution as (
  select distinct on (surface, object_kind, source_table, source_pk)
    r.*
  from public.luminari_object_publication_resolution_revision_v1 r
  order by
    surface,
    object_kind,
    source_table,
    source_pk,
    reviewed_at desc,
    created_at desc,
    resolution_id desc
)
select
  current_resolution.*,
  superseding_target.surface as superseding_surface,
  superseding_target.object_kind as superseding_object_kind,
  superseding_target.source_table as superseding_source_table,
  superseding_target.source_pk as superseding_source_pk,
  superseding_target.canonical_object_key as superseding_canonical_object_key
from current_resolution
left join public.luminari_object_publication_resolution_revision_v1 superseding_target
  on superseding_target.resolution_id = current_resolution.superseded_by_resolution_id;

comment on view public.v_luminari_object_publication_resolution_current_v1 is
  'Latest append-only publication decision per source object, including exact superseded lineage. Service-only; not itself a public-content view.';

-- Mandatory final publication predicate. The caller supplies a freshly
-- calculated base gate; an active ledger decision cannot make an unready row
-- visible. Missing decisions default to active so existing strict public views
-- can adopt the ledger by LEFT JOIN without changing base-gate semantics.
create or replace function public.luminari_publication_is_visible_v1(
  p_base_ready boolean,
  p_resolution_status text default null
)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select
    coalesce(p_base_ready, false)
    and coalesce(nullif(btrim(p_resolution_status), ''), 'active') = 'active';
$$;

comment on function public.luminari_publication_is_visible_v1(boolean, text) is
  'Returns true only when the current surface base gate passes and the latest resolution is active (or absent). Resolution status never overrides base integrity.';

-- Append-only and service-only. The application service may read and append
-- decisions, but it cannot update/delete history. Source tables are untouched.
alter table public.luminari_object_publication_resolution_revision_v1 enable row level security;

drop policy if exists luminari_publication_resolution_service_select
  on public.luminari_object_publication_resolution_revision_v1;
create policy luminari_publication_resolution_service_select
  on public.luminari_object_publication_resolution_revision_v1
  for select
  to service_role
  using (true);

drop policy if exists luminari_publication_resolution_service_insert
  on public.luminari_object_publication_resolution_revision_v1;
create policy luminari_publication_resolution_service_insert
  on public.luminari_object_publication_resolution_revision_v1
  for insert
  to service_role
  with check (true);

revoke all on table public.luminari_object_publication_resolution_revision_v1
  from PUBLIC, anon, authenticated, service_role;
grant select, insert on table public.luminari_object_publication_resolution_revision_v1
  to service_role;

revoke all on table public.v_luminari_object_publication_resolution_current_v1
  from PUBLIC, anon, authenticated, service_role;
grant select on table public.v_luminari_object_publication_resolution_current_v1
  to service_role;

revoke all on function public.luminari_publication_is_visible_v1(boolean, text)
  from PUBLIC, anon, authenticated, service_role;
grant execute on function public.luminari_publication_is_visible_v1(boolean, text)
  to service_role;
