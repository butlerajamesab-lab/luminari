begin;

-- Docket refresh owns source acquisition and version registration only.
-- It must never authorize Rosetta execution as a side effect.
create or replace function public.try_register_docket_legislative_version_spine_from_cache()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  begin
    perform public.register_docket_legislative_version_spine(new.bill_id, false);
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

  perform public.register_docket_legislative_version_spine(v_source_bill_id, false);
  return new;
exception
  when invalid_text_representation then return new;
  when sqlstate 'P0002' then return new;
end;
$$;

comment on function public.try_register_docket_legislative_version_spine_from_cache() is
  'Registers exact provider-declared bill texts and amendments after Docket cache refresh without enqueuing Rosetta execution. Source refresh and analysis authorization are separate control planes.';
comment on function public.try_register_docket_legislative_version_spine_from_genome() is
  'Registers exact provider-declared bill texts and amendments when Civic Genome identity becomes available, without enqueuing Rosetta execution.';

commit;
