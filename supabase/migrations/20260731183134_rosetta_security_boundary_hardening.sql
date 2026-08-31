begin

alter view if exists public.v_extraction_help set (security_invoker = true)

alter view if exists public.v_extraction_workflow set (security_invoker = true)

alter view if exists public.v_extraction_accountability set (security_invoker = true)

alter view if exists public.v_extraction_overrides set (security_invoker = true)

alter view if exists public.v_extraction_definitions set (security_invoker = true)

alter view if exists public.v_layer_coverage_summary set (security_invoker = true)

alter function public.verify_extraction_hashes(integer)
  set search_path = pg_catalog, public, extensions

alter function public.get_rosetta_law_view(integer, text, text, integer)
  set search_path = pg_catalog, public

revoke all on function public.get_rosetta_law_view(integer, text, text, integer) from public

revoke all on function public.get_rosetta_law_view(integer, text, text, integer) from anon

revoke all on function public.get_rosetta_law_view(integer, text, text, integer) from authenticated

grant execute on function public.get_rosetta_law_view(integer, text, text, integer) to service_role

commit
