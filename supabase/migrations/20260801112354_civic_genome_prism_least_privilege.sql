revoke all privileges on table public.civic_genome_prism_verification_binding
  from public, anon, authenticated, service_role;
revoke all privileges on table public.civic_genome_prism_verification_run
  from public, anon, authenticated, service_role;
revoke all privileges on table public.v_civic_genome_prism_verification_status
  from public, anon, authenticated, service_role;

grant select, insert on table public.civic_genome_prism_verification_binding
  to service_role;
grant select, insert on table public.civic_genome_prism_verification_run
  to service_role;
grant select on table public.v_civic_genome_prism_verification_status
  to service_role;

revoke execute on function public.prevent_civic_genome_prism_verification_mutation()
  from public, anon, authenticated, service_role;
