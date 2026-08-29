insert into public.civic_genome_prism_verification_queue (
  assembly_run_id,
  genome_bill_id,
  prism_rule_set_id,
  prism_rule_set_version,
  queue_state,
  expected_trait_count,
  receipt_count,
  eligible_at,
  next_attempt_at,
  completed_at
)
select
  assembly.assembly_run_id,
  assembly.genome_bill_id,
  'prism-rosetta-structural-binding',
  '2.0.0',
  case
    when verification.verification_run_id is not null
      and verification.expected_trait_count = assembly.trait_count
      and verification.receipt_count = assembly.trait_count
      then 'completed'
    when coalesce(binding.receipt_count, 0) > 0 then 'receipt_partial'
    else 'eligible'
  end,
  assembly.trait_count,
  case
    when verification.verification_run_id is not null
      and verification.expected_trait_count = assembly.trait_count
      and verification.receipt_count = assembly.trait_count
      then verification.receipt_count
    else coalesce(binding.receipt_count, 0)
  end,
  coalesce(assembly.completed_at, assembly.created_at, now()),
  now(),
  case
    when verification.verification_run_id is not null
      and verification.expected_trait_count = assembly.trait_count
      and verification.receipt_count = assembly.trait_count
      then verification.completed_at
    else null
  end
from public.civic_genome_assembly_run assembly
left join lateral (
  select count(*)::integer as receipt_count
    from public.civic_genome_prism_verification_binding receipt
   where receipt.assembly_run_id = assembly.assembly_run_id
     and receipt.prism_rule_set_id = 'prism-rosetta-structural-binding'
     and receipt.prism_rule_set_version = '2.0.0'
) binding on true
left join public.civic_genome_prism_verification_run verification
  on verification.assembly_run_id = assembly.assembly_run_id
 and verification.prism_rule_set_id = 'prism-rosetta-structural-binding'
 and verification.prism_rule_set_version = '2.0.0'
where assembly.run_status = 'completed'
  and assembly.verification_state = 'complete'
  and assembly.trait_count > 0
on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)
  do nothing
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
      '2.0.0',
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
$$
revoke execute on function public.enqueue_civic_genome_prism_verification()
  from public, anon, authenticated
