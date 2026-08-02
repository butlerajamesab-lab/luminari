do $$
declare
  sequence_name text;
  maximum_id bigint;
begin
  sequence_name := pg_get_serial_sequence('public.admin_change_log', 'id');

  if sequence_name is null then
    raise exception 'admin_change_log.id does not have an owned sequence';
  end if;

  select coalesce(max(id), 0)
    into maximum_id
    from public.admin_change_log;

  if maximum_id > 0 then
    perform setval(sequence_name::regclass, maximum_id, true);
  else
    perform setval(sequence_name::regclass, 1, false);
  end if;
end
$$;

comment on sequence public.admin_change_log_id_seq is
  'Sequence aligned to the append-only administrative receipt ledger.';
