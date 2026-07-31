-- Civic Genome operating-contract security boundary.
--
-- UI reads flow through the versioned Lighthouse tRPC DTO. Direct database
-- clients may inspect persisted Genome state only when authenticated; all
-- writes remain backend/service-role owned.

do $$
declare
  table_name text;
  read_policy_name text;
  service_policy_name text;
begin
  foreach table_name in array array[
    'civic_genome_assembly_run',
    'civic_genome_comparison_matrix',
    'civic_genome_comparison_state_cell',
    'civic_genome_edge',
    'civic_genome_momentum_component',
    'civic_genome_node',
    'civic_genome_projection_checkpoint',
    'civic_genome_relationship',
    'civic_genome_rosetta_source_binding',
    'civic_genome_source_binding',
    'civic_genome_trait',
    'civic_genome_unresolved_family_candidate'
  ]
  loop
    read_policy_name := table_name || '_authenticated_read';
    service_policy_name := table_name || '_service_role_all';

    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);

    execute format('drop policy if exists %I on public.%I', read_policy_name, table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      read_policy_name,
      table_name
    );

    execute format('drop policy if exists %I on public.%I', service_policy_name, table_name);
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      service_policy_name,
      table_name
    );
  end loop;
end
$$;

alter view public.v_civic_genome_node_summary
  set (security_invoker = true);

revoke all on table public.v_civic_genome_node_summary
  from anon, authenticated;
grant select on table public.v_civic_genome_node_summary
  to authenticated, service_role;
