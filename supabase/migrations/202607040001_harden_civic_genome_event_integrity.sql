do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'civic_genome_bill_genome_bill_id_bill_id_family_id_key'
  ) then
    alter table civic_genome_bill
      add constraint civic_genome_bill_genome_bill_id_bill_id_family_id_key
      unique (genome_bill_id, bill_id, family_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'civic_genome_event_genome_bill_id_bill_id_family_id_fkey'
  ) then
    alter table civic_genome_event
      add constraint civic_genome_event_genome_bill_id_bill_id_family_id_fkey
      foreign key (genome_bill_id, bill_id, family_id)
      references civic_genome_bill (genome_bill_id, bill_id, family_id)
      on delete cascade;
  end if;
end
$$;
