begin;

create or replace function public.try_register_docket_legislative_version_spine_from_cache()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  begin
    perform public.register_docket_legislative_version_spine(new.bill_id, true);
  exception
    when sqlstate 'P0002' then null;
  end;
  return new;
end;
$$;

create or replace function public.try_register_docket_legislative_version_spine_from_genome()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source_bill_id integer;
begin
  v_source_bill_id := nullif(new.structural_dna_json ->> 'source_bill_id', '')::integer;
  if v_source_bill_id is null then return new; end if;
  if not exists (
    select 1
    from public.docket_bill_detail_cache cache
    where cache.bill_id = v_source_bill_id
  ) then
    return new;
  end if;

  perform public.register_docket_legislative_version_spine(v_source_bill_id, true);
  return new;
exception
  when invalid_text_representation then return new;
  when sqlstate 'P0002' then return new;
end;
$$;

drop trigger if exists docket_legislative_version_spine_registration
  on public.docket_bill_detail_cache;
create trigger docket_legislative_version_spine_registration
after insert or update of bill
on public.docket_bill_detail_cache
for each row execute function public.try_register_docket_legislative_version_spine_from_cache();

drop trigger if exists civic_genome_legislative_version_spine_registration
  on public.civic_genome_bill;
create trigger civic_genome_legislative_version_spine_registration
after insert or update of structural_dna_json
on public.civic_genome_bill
for each row execute function public.try_register_docket_legislative_version_spine_from_genome();

revoke all on function public.try_register_docket_legislative_version_spine_from_cache()
  from public, anon, authenticated;
revoke all on function public.try_register_docket_legislative_version_spine_from_genome()
  from public, anon, authenticated;

comment on function public.try_register_docket_legislative_version_spine_from_cache() is
  'Automatically registers exact provider-declared bill texts and amendments after Docket cache refresh when the corresponding Civic Genome bill already exists. Missing cross-platform identity is preserved as a no-op, not inferred.';
comment on function public.try_register_docket_legislative_version_spine_from_genome() is
  'Automatically registers exact provider-declared bill texts and amendments when a Civic Genome bill becomes available after its Docket cache. Source identity comes only from the explicit source_bill_id receipt.';

commit;
