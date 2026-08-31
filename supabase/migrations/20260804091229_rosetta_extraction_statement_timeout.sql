begin

alter function public.run_rosetta_v3_extraction(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
) set statement_timeout = '120s'

comment on function public.run_rosetta_v3_extraction(
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  jsonb
) is 'Service-owned deterministic Rosetta V3 extraction. Function-local statement timeout is bounded at 120 seconds for large official laws; project and role defaults remain unchanged.'

commit
