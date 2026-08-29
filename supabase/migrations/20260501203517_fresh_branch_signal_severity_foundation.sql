-- Fresh-branch replay foundation.
--
-- Production already contained these objects before migration 20260505074841,
-- but no earlier migration receipt creates them. A clean branch therefore
-- fails while parsing create_atlas_signal_chain. Keep this migration
-- idempotent so production is unchanged when the historical gap is recorded.

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
  end if;
end
$$;

create or replace function public.map_atlas_severity_to_signal_enum(
  p_severity numeric
)
returns public.signal_severity_enum
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
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
$$;

comment on type public.signal_severity_enum is
  'Canonical Atlas/Lighthouse severity ordering recovered for deterministic fresh-branch replay.';

comment on function public.map_atlas_severity_to_signal_enum(numeric) is
  'Deterministically maps an Atlas numeric severity score to the canonical Lighthouse severity enum.';
