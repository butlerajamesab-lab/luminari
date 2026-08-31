begin

create or replace function public.rosetta_backend_role_probe_v1()
returns text
language sql
stable
security invoker
set search_path = pg_catalog, public, auth
as $$
  select coalesce(auth.role(), current_user::text);
$$

revoke all on function public.rosetta_backend_role_probe_v1() from public

grant execute on function public.rosetta_backend_role_probe_v1() to anon, authenticated, service_role

revoke all on public.v_civic_genome_law_view_v1_internal from public, anon, authenticated

grant select on public.v_civic_genome_law_view_v1_internal to service_role

revoke all on public.v_rosetta_operator_law_view_v1 from public, anon, authenticated

grant select on public.v_rosetta_operator_law_view_v1 to service_role

comment on function public.rosetta_backend_role_probe_v1() is
  'Returns only the PostgREST database role for backend credential verification. It exposes no credential material.'

commit
