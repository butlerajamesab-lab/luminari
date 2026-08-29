begin;

-- Prism 2.2 is queued when an assembly becomes complete. Legislative-version
-- registration can occur later, after that assembly trigger has already fired.
-- This trigger closes that late-binding gap without rewriting any prior Prism
-- request, receipt, run, or binding.

create or replace function public.enqueue_civic_genome_bill_version_prism_v22()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_assembly public.civic_genome_assembly_run%rowtype;
begin
  if new.assembly_run_id is null then
    return new;
  end if;

  select assembly.*
  into v_assembly
  from public.civic_genome_assembly_run assembly
  where assembly.assembly_run_id = new.assembly_run_id;

  if not found then
    raise exception 'civic_genome_bill_version references missing assembly_run_id %',
      new.assembly_run_id;
  end if;

  if v_assembly.run_status = 'completed'
     and v_assembly.verification_state = 'complete'
     and v_assembly.trait_count > 0 then
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
      v_assembly.assembly_run_id,
      v_assembly.genome_bill_id,
      'prism-rosetta-structural-binding',
      '2.2.0',
      'eligible',
      v_assembly.trait_count,
      0,
      coalesce(v_assembly.completed_at, v_assembly.created_at, now()),
      now()
    )
    on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)
      do nothing;
  end if;

  return new;
end;
$function$;

drop trigger if exists civic_genome_bill_version_enqueue_prism_v22
  on public.civic_genome_bill_version;

create trigger civic_genome_bill_version_enqueue_prism_v22
after insert or update of assembly_run_id
on public.civic_genome_bill_version
for each row
when (new.assembly_run_id is not null)
execute function public.enqueue_civic_genome_bill_version_prism_v22();

-- Idempotently recover any version-linked completed assembly that was linked
-- after the original Prism 2.2 one-time backfill.
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
  '2.2.0',
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

revoke all on function public.enqueue_civic_genome_bill_version_prism_v22()
  from public, anon, authenticated, service_role;

comment on function public.enqueue_civic_genome_bill_version_prism_v22() is
  'Queues a completed Civic Genome assembly for Prism Rosetta 2.2 when the legislative-version binding is created or changed after assembly completion. Existing verification generations remain immutable.';

commit;
