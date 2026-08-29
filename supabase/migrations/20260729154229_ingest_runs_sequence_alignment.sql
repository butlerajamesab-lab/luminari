do $block$
declare
  sequence_name text;
  maximum_id bigint;
begin
  sequence_name := pg_get_serial_sequence('public.ingest_runs', 'id');
  if sequence_name is null then
    raise exception 'public.ingest_runs.id has no owned sequence';
  end if;

  select coalesce(max(id), 0)
    into maximum_id
    from public.ingest_runs;

  if maximum_id > 0 then
    perform setval(sequence_name::regclass, maximum_id, true);
  else
    perform setval(sequence_name::regclass, 1, false);
  end if;
end
$block$;
