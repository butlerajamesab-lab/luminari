select setval(
  pg_get_serial_sequence('public.documents','id'),
  greatest(coalesce((select max(id) from public.documents), 1), 1),
  true
);
