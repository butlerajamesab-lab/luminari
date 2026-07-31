-- Reproduce the direct database boundary for the original Civic Genome
-- substrate. Public UI reads intentionally flow through Lighthouse tRPC;
-- direct database clients are authenticated-read and service-write only.

do $$
declare
  table_name text;
  read_policy_name text;
  service_policy_name text;
begin
  foreach table_name in array array[
    'civic_genome_family',
    'civic_genome_bill',
    'civic_genome_event',
    'bill_lineage_edge',
    'family_momentum_snapshot'
  ]
  loop
    read_policy_name := table_name || '_authenticated_read';
    service_policy_name := table_name || '_service_role_all';

    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);

    execute format(
      'drop policy if exists %I on public.%I',
      'auth_read_' || table_name,
      table_name
    );
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_authenticated_read',
      table_name
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      read_policy_name,
      table_name
    );

    execute format(
      'drop policy if exists %I on public.%I',
      'service_all_' || table_name,
      table_name
    );
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_service_role_all',
      table_name
    );
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      service_policy_name,
      table_name
    );
  end loop;
end
$$;
