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

  -- compat.sunam_gate_log is optional in fresh DB unless explicitly provisioned by upstream migration.

  -- Required columns
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='detected_signals_base' and column_name='created_at'
  ) then
    raise exception 'Missing required column: public.detected_signals_base.created_at';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='detected_signals_base' and column_name='createdAt'
  ) then
    raise exception 'Missing required column: public.detected_signals_base."createdAt"';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='entities' and column_name='legacy_relation_id'
  ) then
    raise exception 'Missing required column: public.entities.legacy_relation_id';
  end if;
end $$;
