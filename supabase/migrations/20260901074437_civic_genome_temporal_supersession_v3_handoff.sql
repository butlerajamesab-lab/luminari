begin;

-- Block source writes only for the short final reconciliation and trigger swap.
lock table
  public.civic_genome_bill,
  public.docket_bill_detail_cache
in share row exclusive mode;

do $$
declare
  changed_source record;
begin
  for changed_source in
    select distinct current_mapping.source_bill_id
    from (
      select
        bill.genome_bill_id,
        case
          when coalesce(
            bill.structural_dna_json->>'source_bill_id',
            ''
          ) ~ '^[0-9]+$'
            then (bill.structural_dna_json->>'source_bill_id')::integer
          else null
        end as source_bill_id
      from public.civic_genome_bill bill
    ) current_mapping
    join public.docket_bill_detail_cache source_cache
      on source_cache.bill_id = current_mapping.source_bill_id
    where not exists (
      select 1
      from public.civic_genome_lifecycle_source_revision_v3 revision
      where revision.genome_bill_id = current_mapping.genome_bill_id
    )
       or source_cache.fetched_at >= coalesce(
         (
           select min(revision.created_at)
           from public.civic_genome_lifecycle_source_revision_v3 revision
         ),
         clock_timestamp()
       )
  loop
    perform public.sync_civic_genome_lifecycle_history_v3(
      changed_source.source_bill_id
    );
  end loop;
end;
$$;

drop trigger if exists docket_bill_detail_cache_lifecycle_event_time_v2
  on public.docket_bill_detail_cache;
drop trigger if exists civic_genome_bill_lifecycle_event_time_v2
  on public.civic_genome_bill;

create or replace function public.sync_civic_genome_lifecycle_from_detail_cache_v3()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  target_bill record;
begin
  perform public.sync_civic_genome_lifecycle_history_v3(new.bill_id);

  for target_bill in
    select bill.genome_bill_id
    from public.civic_genome_bill bill
    where case
      when coalesce(bill.structural_dna_json->>'source_bill_id', '') ~ '^[0-9]+$'
        then (bill.structural_dna_json->>'source_bill_id')::integer
      else null
    end = new.bill_id
  loop
    perform public.refresh_civic_genome_bill_temporal_projection_v2(
      target_bill.genome_bill_id
    );
  end loop;

  return new;
end;
$$;

revoke all on function public.sync_civic_genome_lifecycle_from_detail_cache_v3()
  from public, anon, authenticated;

drop trigger if exists docket_bill_detail_cache_lifecycle_event_time_v3
  on public.docket_bill_detail_cache;
create trigger docket_bill_detail_cache_lifecycle_event_time_v3
after insert or update of bill, fetched_at on public.docket_bill_detail_cache
for each row execute function public.sync_civic_genome_lifecycle_from_detail_cache_v3();

create or replace function public.sync_civic_genome_lifecycle_from_bill_v3()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  source_bill_id integer;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if coalesce(new.structural_dna_json->>'source_bill_id', '') !~ '^[0-9]+$' then
    return new;
  end if;

  source_bill_id := (new.structural_dna_json->>'source_bill_id')::integer;
  perform public.sync_civic_genome_lifecycle_history_v3(source_bill_id);
  perform public.refresh_civic_genome_bill_temporal_projection_v2(
    new.genome_bill_id
  );
  return new;
end;
$$;

revoke all on function public.sync_civic_genome_lifecycle_from_bill_v3()
  from public, anon, authenticated;

drop trigger if exists civic_genome_bill_lifecycle_event_time_v3
  on public.civic_genome_bill;
create trigger civic_genome_bill_lifecycle_event_time_v3
after insert or update of structural_dna_json on public.civic_genome_bill
for each row execute function public.sync_civic_genome_lifecycle_from_bill_v3();

commit;

