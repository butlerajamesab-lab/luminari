begin;

create or replace function public.guard_civic_genome_bill_version_terminal_state()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.processing_state in ('verified', 'verified_with_findings')
     and new.processing_state in (
       'source_ingested',
       'extracted',
       'assembled',
       'verification_partial'
     ) then
    new.processing_state := old.processing_state;
    new.prism_verification_run_id := coalesce(
      new.prism_verification_run_id,
      old.prism_verification_run_id
    );
    new.receipt_json := coalesce(new.receipt_json, '{}'::jsonb)
      || jsonb_build_object(
        'terminal_state_regression_prevented', jsonb_build_object(
          'preserved_state', old.processing_state,
          'attempted_state', new.processing_state,
          'preserved_prism_verification_run_id', old.prism_verification_run_id,
          'recorded_at', clock_timestamp()
        )
      );
  end if;

  return new;
end;
$$;

drop trigger if exists civic_genome_bill_version_terminal_state_guard
  on public.civic_genome_bill_version;
create trigger civic_genome_bill_version_terminal_state_guard
before update of processing_state
on public.civic_genome_bill_version
for each row execute function public.guard_civic_genome_bill_version_terminal_state();

update public.civic_genome_bill_version version
   set processing_state = public.civic_genome_prism_version_state(
         verification.expected_trait_count,
         verification.receipt_count,
         verification.status_counts
       ),
       receipt_json = coalesce(version.receipt_json, '{}'::jsonb)
         || jsonb_build_object(
           'prism_version_state', public.civic_genome_prism_version_state(
             verification.expected_trait_count,
             verification.receipt_count,
             verification.status_counts
           ),
           'terminal_state_reconciled_at', clock_timestamp()
         ),
       updated_at = now()
  from public.civic_genome_prism_verification_run verification
 where verification.verification_run_id = version.prism_verification_run_id
   and verification.receipt_count = verification.expected_trait_count
   and version.processing_state is distinct from public.civic_genome_prism_version_state(
         verification.expected_trait_count,
         verification.receipt_count,
         verification.status_counts
       );

revoke all on function public.guard_civic_genome_bill_version_terminal_state()
  from public, anon, authenticated;

comment on function public.guard_civic_genome_bill_version_terminal_state() is
  'Prevents a late or duplicate legislative-version worker from regressing a completed Prism terminal state to an earlier pipeline state. Explicit reprocessing remains possible by first resetting the version to registered.';

commit;
