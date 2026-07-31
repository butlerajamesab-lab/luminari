-- Keep a bill and its owned events on the same family during structural
-- reassignment. The composite identity constraint remains authoritative,
-- while ON UPDATE CASCADE makes the transition atomic.

alter table public.civic_genome_event
  drop constraint if exists civic_genome_event_genome_bill_id_bill_id_family_id_fkey;

alter table public.civic_genome_event
  add constraint civic_genome_event_genome_bill_id_bill_id_family_id_fkey
  foreign key (genome_bill_id, bill_id, family_id)
  references public.civic_genome_bill(genome_bill_id, bill_id, family_id)
  on update cascade
  on delete cascade;
