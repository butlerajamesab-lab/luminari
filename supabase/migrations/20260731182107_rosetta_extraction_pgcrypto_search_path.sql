begin

alter function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) set search_path = pg_catalog, public, extensions

commit
