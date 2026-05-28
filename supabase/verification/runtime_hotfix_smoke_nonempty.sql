-- Verification: non-empty runtime smoke checks
-- Intended for seeded/integration/staging DBs, not fresh CI bootstrap DB.

do $$
begin
  if (select count(*) from public.v_runtime_signal_scroll) = 0 then
    raise exception 'Zero rows: public.v_runtime_signal_scroll';
  end if;
  if (select count(*) from public.sunam_gate_log) = 0 then
    raise exception 'Zero rows: public.sunam_gate_log';
  end if;
  if (select count(*) from public.v_enforcement_record_tallies) = 0 then
    raise exception 'Zero rows: public.v_enforcement_record_tallies';
  end if;
end $$;
