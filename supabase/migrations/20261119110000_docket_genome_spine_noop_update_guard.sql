begin;

-- Separate inserts from structural updates so unchanged Docket projections do
-- not replay the full provider-version registration path on every warmer pass.
drop trigger if exists civic_genome_legislative_version_spine_registration
  on public.civic_genome_bill;
drop trigger if exists civic_genome_legislative_version_spine_registration_insert
  on public.civic_genome_bill;
drop trigger if exists civic_genome_legislative_version_spine_registration_update
  on public.civic_genome_bill;

create trigger civic_genome_legislative_version_spine_registration_insert
after insert on public.civic_genome_bill
for each row
execute function public.try_register_docket_legislative_version_spine_from_genome();

create trigger civic_genome_legislative_version_spine_registration_update
after update of structural_dna_json on public.civic_genome_bill
for each row
when (old.structural_dna_json is distinct from new.structural_dna_json)
execute function public.try_register_docket_legislative_version_spine_from_genome();

commit;
