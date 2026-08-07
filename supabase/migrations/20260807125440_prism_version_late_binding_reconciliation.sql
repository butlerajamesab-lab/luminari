begin;

create or replace function public.reconcile_civic_genome_bill_version_prism_completion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_verification public.civic_genome_prism_verification_run%rowtype;
  v_processing_state text;
begin
  if new.assembly_run_id is null then
    return new;
  end if;

  select verification.*
    into v_verification
    from public.civic_genome_prism_verification_run verification
   where verification.assembly_run_id = new.assembly_run_id
     and verification.prism_rule_set_id = 'prism-rosetta-structural-binding'
   order by verification.completed_at desc nulls last,
            verification.created_at desc,
            verification.verification_run_id desc
   limit 1;

  if not found then
    return new;
  end if;

  v_processing_state := public.civic_genome_prism_version_state(
    v_verification.expected_trait_count,
    v_verification.receipt_count,
    v_verification.status_counts
  );

  new.prism_verification_run_id := v_verification.verification_run_id;
  new.processing_state := v_processing_state;
  new.receipt_json := coalesce(new.receipt_json, '{}'::jsonb) || jsonb_build_object(
    'prism_verification_run_id', v_verification.verification_run_id,
    'prism_engine_version', v_verification.prism_engine_version,
    'prism_rule_set_id', v_verification.prism_rule_set_id,
    'prism_rule_set_version', v_verification.prism_rule_set_version,
    'prism_expected_trait_count', v_verification.expected_trait_count,
    'prism_receipt_count', v_verification.receipt_count,
    'prism_status_counts', v_verification.status_counts,
    'prism_output_hash', v_verification.output_hash,
    'prism_receipt_manifest_hash', v_verification.receipt_manifest_hash,
    'prism_completed_at', v_verification.completed_at,
    'prism_version_state', v_processing_state
  );
  new.updated_at := now();

  return new;
end;
$$;

revoke all on function public.reconcile_civic_genome_bill_version_prism_completion()
from public, anon, authenticated;

drop trigger if exists civic_genome_bill_version_prism_late_binding
on public.civic_genome_bill_version;

create trigger civic_genome_bill_version_prism_late_binding
before insert or update of assembly_run_id
on public.civic_genome_bill_version
for each row
execute function public.reconcile_civic_genome_bill_version_prism_completion();

-- Repair versions whose immutable Prism 2.2 run completed before the
-- legislative-version pipeline attached the assembly_run_id to the version.
-- Mentioning assembly_run_id replays the BEFORE trigger without changing the
-- assembly identity or any canonical Prism request/receipt/run.
update public.civic_genome_bill_version version
   set assembly_run_id = version.assembly_run_id
 where version.assembly_run_id is not null
   and exists (
     select 1
       from public.civic_genome_prism_verification_run verification
      where verification.assembly_run_id = version.assembly_run_id
        and verification.prism_rule_set_id = 'prism-rosetta-structural-binding'
        and verification.prism_rule_set_version = '2.2.0'
        and verification.receipt_count = verification.expected_trait_count
        and (
          version.prism_verification_run_id is distinct from verification.verification_run_id
          or version.processing_state is distinct from public.civic_genome_prism_version_state(
            verification.expected_trait_count,
            verification.receipt_count,
            verification.status_counts
          )
        )
   );

comment on function public.reconcile_civic_genome_bill_version_prism_completion() is
  'Closes the assembly-to-Prism completion race by hydrating a Civic Genome bill version from an already-existing immutable Prism Rosetta verification run when assembly_run_id is bound after verification completed.';

commit;
