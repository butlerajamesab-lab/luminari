do $$
declare
  v_table text;
  v_sequence text;
  v_max_id bigint;
begin
  foreach v_table in array array[
    'checklist_items',
    'missing_records',
    'foia_requests',
    'share_links',
    'notifications'
  ]
  loop
    v_sequence := pg_catalog.pg_get_serial_sequence(
      pg_catalog.format('public.%I', v_table),
      'id'
    );
    if v_sequence is null then
      raise exception 'missing serial sequence for public.%', v_table;
    end if;

    execute pg_catalog.format('select max(id)::bigint from public.%I', v_table)
      into v_max_id;

    perform pg_catalog.setval(
      v_sequence::pg_catalog.regclass,
      coalesce(v_max_id, 1::bigint),
      v_max_id is not null
    );
  end loop;
end
$$;
