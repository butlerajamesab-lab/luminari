begin;

-- Bounded bulk bootstrap batch 7/8. Transaction-local scope settings
-- limit every reconciliation stage to this inclusive source-bill range.
select set_config(
  'civic_genome.sync_source_bill_id_min',
  '2139871',
  true
);
select set_config(
  'civic_genome.sync_source_bill_id_max',
  '2154062',
  true
);

select public.sync_civic_genome_lifecycle_history_v3(null)
  as affected_count;

commit;
