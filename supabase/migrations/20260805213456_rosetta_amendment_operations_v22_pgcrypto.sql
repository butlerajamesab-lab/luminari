begin

alter function public.rosetta_v22_finalize_extraction(
  integer,
  text,
  jsonb,
  jsonb
) set search_path = pg_catalog, public, extensions

comment on function public.rosetta_v22_finalize_extraction(integer, text, jsonb, jsonb) is
  'Rosetta 2.2 exact-source finalizer. Uses the extensions pgcrypto schema explicitly through its fixed search path, preserves exact definition punctuation, and records source-stated amendment operations without applying legal effect.'

commit
