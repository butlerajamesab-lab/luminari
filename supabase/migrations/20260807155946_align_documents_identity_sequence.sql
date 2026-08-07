do $$
declare
  v_max_id bigint;
  v_sequence_name text;
begin
  select coalesce(max(id), 0)
    into v_max_id
    from public.documents;

  v_sequence_name := pg_get_serial_sequence('public.documents', 'id');
  if v_sequence_name is null then
    raise exception 'documents_id_sequence_missing';
  end if;

  if v_max_id > 0 then
    perform setval(v_sequence_name::regclass, v_max_id, true);
  else
    perform setval(v_sequence_name::regclass, 1, false);
  end if;
end
$$;
