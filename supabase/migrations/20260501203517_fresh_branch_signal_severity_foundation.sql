-- Fresh-branch replay foundation.
--
-- Production already contained these objects before migration 20260505074841,
-- but no earlier migration receipt creates them. A clean branch therefore
-- cannot reproduce the Atlas/Lighthouse lineage spine. Keep this migration
-- idempotent and copy the production enum/table contracts exactly.

do $$
begin
  if to_regtype('public.run_status_enum') is null then
    create type public.run_status_enum as enum (
      'pending',
      'running',
      'completed',
      'failed',
      'cancelled'
    );
  end if;

  if to_regtype('public.artifact_type_enum') is null then
    create type public.artifact_type_enum as enum (
      'snapshot_bundle',
      'case_export',
      'report',
      'raw_export',
      'audit_export',
      'narration_payload',
      'filing_packet',
      'presentation_bundle'
    );
  end if;

  if to_regtype('public.entry_channel_enum') is null then
    create type public.entry_channel_enum as enum (
      'intake',
      'ingestion'
    );
  end if;

  if to_regtype('public.target_domain_enum') is null then
    create type public.target_domain_enum as enum (
      'case_truth',
      'knowledge_backbone',
      'stream_intake',
      'mixed'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'signal_severity_enum'
  ) then
    create type public.signal_severity_enum as enum (
      'critical',
      'high',
      'medium',
      'low'
    );

    comment on type public.signal_severity_enum is
      'Canonical Atlas/Lighthouse severity ordering recovered for deterministic fresh-branch replay.';
  end if;
end
$$;

do $migration$
begin
  if to_regprocedure(
    'public.map_atlas_severity_to_signal_enum(numeric)'
  ) is null then
    execute $function$
      create function public.map_atlas_severity_to_signal_enum(
        p_severity numeric
      )
      returns public.signal_severity_enum
      language plpgsql
      immutable
      set search_path = pg_catalog, public
      as $body$
      begin
        if coalesce(p_severity, 0.50) >= 0.90 then
          return 'critical'::public.signal_severity_enum;
        elsif coalesce(p_severity, 0.50) >= 0.80 then
          return 'high'::public.signal_severity_enum;
        elsif coalesce(p_severity, 0.50) >= 0.60 then
          return 'medium'::public.signal_severity_enum;
        else
          return 'low'::public.signal_severity_enum;
        end if;
      end;
      $body$
    $function$;

    comment on function public.map_atlas_severity_to_signal_enum(numeric) is
      'Deterministically maps an Atlas numeric severity score to the canonical Lighthouse severity enum.';
  end if;
end
$migration$;

create table if not exists public.entry_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid,
  entry_channel public.entry_channel_enum not null,
  target_domain public.target_domain_enum not null default 'case_truth',
  status public.run_status_enum not null default 'pending',
  source_label text,
  source_ref text,
  source_system text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  idempotency_key text unique
);

create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  entry_run_id uuid references public.entry_runs(id) on delete set null,
  snapshot_hash text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  sealed_at timestamptz,
  unique (case_id, snapshot_hash)
);

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  snapshot_id uuid not null references public.snapshots(id) on delete cascade,
  status public.run_status_enum not null default 'pending',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  ruleset_version text,
  error_message text
);

create table if not exists public.export_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  snapshot_id uuid not null references public.snapshots(id) on delete cascade,
  artifact_type public.artifact_type_enum not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status public.run_status_enum not null default 'pending',
  output_manifest jsonb not null default '{}'::jsonb
);

create index if not exists idx_entry_runs_case_id
  on public.entry_runs(case_id);
create index if not exists idx_entry_runs_channel
  on public.entry_runs(entry_channel);
create index if not exists idx_entry_runs_status
  on public.entry_runs(status);
create index if not exists idx_snapshots_case_id
  on public.snapshots(case_id);
create index if not exists idx_snapshots_entry_run_id
  on public.snapshots(entry_run_id);
create index if not exists idx_snapshots_status
  on public.snapshots(status);
create index if not exists idx_pipeline_runs_case_id
  on public.pipeline_runs(case_id);
create index if not exists idx_pipeline_runs_snapshot_id
  on public.pipeline_runs(snapshot_id);
create index if not exists idx_export_runs_case_id
  on public.export_runs(case_id);
create index if not exists idx_export_runs_snapshot_id
  on public.export_runs(snapshot_id);

alter table public.entry_runs enable row level security;
alter table public.snapshots enable row level security;
alter table public.pipeline_runs enable row level security;
alter table public.export_runs enable row level security;

revoke all on public.entry_runs from anon, authenticated;
revoke all on public.snapshots from anon, authenticated;
revoke all on public.pipeline_runs from anon, authenticated;
revoke all on public.export_runs from anon, authenticated;
grant select on public.entry_runs to authenticated;
grant select on public.snapshots to authenticated;
grant select on public.pipeline_runs to authenticated;
grant select on public.export_runs to authenticated;
grant all on public.entry_runs to service_role;
grant all on public.snapshots to service_role;
grant all on public.pipeline_runs to service_role;
grant all on public.export_runs to service_role;

drop policy if exists authenticated_all_access_entry_runs on public.entry_runs;
create policy authenticated_all_access_entry_runs
  on public.entry_runs for select to authenticated using (true);
drop policy if exists authenticated_all_access_export_runs on public.export_runs;
create policy authenticated_all_access_export_runs
  on public.export_runs for select to authenticated using (true);

drop policy if exists service_role_all_entry_runs_836c6f50 on public.entry_runs;
create policy service_role_all_entry_runs_836c6f50
  on public.entry_runs for all to service_role using (true) with check (true);
drop policy if exists service_role_all_snapshots on public.snapshots;
create policy service_role_all_snapshots
  on public.snapshots for all to service_role using (true) with check (true);
drop policy if exists service_role_all_pipeline_runs on public.pipeline_runs;
create policy service_role_all_pipeline_runs
  on public.pipeline_runs for all to service_role using (true) with check (true);
drop policy if exists service_role_all_export_runs on public.export_runs;
create policy service_role_all_export_runs
  on public.export_runs for all to service_role using (true) with check (true);
