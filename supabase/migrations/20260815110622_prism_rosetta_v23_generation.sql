begin;

create or replace function public.enqueue_civic_genome_prism_verification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.run_status = 'completed'
     and new.verification_state = 'complete'
     and new.trait_count > 0 then
    insert into public.civic_genome_prism_verification_queue (
      assembly_run_id,
      genome_bill_id,
      prism_rule_set_id,
      prism_rule_set_version,
      queue_state,
      expected_trait_count,
      receipt_count,
      eligible_at,
      next_attempt_at
    ) values (
      new.assembly_run_id,
      new.genome_bill_id,
      'prism-rosetta-structural-binding',
      '2.3.0',
      'eligible',
      new.trait_count,
      0,
      coalesce(new.completed_at, new.created_at, now()),
      now()
    )
    on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)
      do nothing;
  end if;
  return new;
end;
$$;

insert into public.civic_genome_prism_verification_queue (
  assembly_run_id,
  genome_bill_id,
  prism_rule_set_id,
  prism_rule_set_version,
  queue_state,
  expected_trait_count,
  receipt_count,
  eligible_at,
  next_attempt_at
)
select
  assembly.assembly_run_id,
  assembly.genome_bill_id,
  'prism-rosetta-structural-binding',
  '2.3.0',
  'eligible',
  assembly.trait_count,
  0,
  coalesce(assembly.completed_at, assembly.created_at, now()),
  now()
from public.civic_genome_bill_version version
join public.civic_genome_assembly_run assembly
  on assembly.assembly_run_id = version.assembly_run_id
where assembly.run_status = 'completed'
  and assembly.verification_state = 'complete'
  and assembly.trait_count > 0
on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)
  do nothing;

revoke all on function public.enqueue_civic_genome_prism_verification()
  from public, anon, authenticated;

comment on function public.enqueue_civic_genome_prism_verification() is
  'Queues every completed Civic Genome assembly for disposition-aware Prism Rosetta structural binding 2.3.0. Prior 2.1 and 2.2 queues, runs, bindings, requests, and receipts remain immutable.';

commit;
