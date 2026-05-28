-- Verification: runtime hotfix sync schema contract (fresh-DB safe)
-- Fails with exceptions on missing required objects/columns.

do $$
begin
  -- Required objects
  if to_regclass('public.v_runtime_signal_scroll') is null then
    raise exception 'Missing required object: public.v_runtime_signal_scroll';
  end if;
  if to_regclass('public.sunam_gate_log') is null then
    raise exception 'Missing required object: public.sunam_gate_log';
  end if;
  if to_regclass('public.v_enforcement_record_tallies') is null then
    raise exception 'Missing required object: public.v_enforcement_record_tallies';
  end if;
  if to_regclass('compat.v_enforcement_record_tallies') is null then
    raise exception 'Missing required object: compat.v_enforcement_record_tallies';
  end if;
  if to_regclass('compat.entities') is null then
    raise exception 'Missing required object: compat.entities';
  end if;
  if to_regclass('compat.detected_signals_base') is null then
    raise exception 'Missing required object: compat.detected_signals_base';
  end if;

  -- Source columns preserved
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='detected_signals_base' and column_name='created_at'
  ) then
    raise exception 'Missing required source column: public.detected_signals_base.created_at';
  end if;

  -- Compatibility aliases now live in compat projections, not by mutating public views.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='compat' and table_name='detected_signals_base' and column_name='createdAt'
  ) then
    raise exception 'Missing compatibility column: compat.detected_signals_base."createdAt"';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='compat' and table_name='entities' and column_name='legacy_relation_id'
  ) then
    raise exception 'Missing compatibility column: compat.entities.legacy_relation_id';
  end if;
end $$;
