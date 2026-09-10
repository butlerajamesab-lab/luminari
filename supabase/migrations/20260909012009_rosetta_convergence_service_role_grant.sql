-- The convergence view is operational and intentionally hidden from
-- public-facing roles. Server-side consumers use the service role.
revoke all
  on public.v_civic_genome_rosetta_generation_convergence_v1
  from public, anon, authenticated;
grant select
  on public.v_civic_genome_rosetta_generation_convergence_v1
  to service_role;
