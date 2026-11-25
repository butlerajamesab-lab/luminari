-- Ten functions look up civic_genome_bill by structural_dna_json->>'source_bill_id'
-- (register_docket_legislative_version_spine, sync_civic_genome_lifecycle_history_v3,
-- process/complete_docket_bill_detail_derived_work_v1, and others). With no index
-- on that expression, every lookup was a full scan of the 319 MB table
-- (measured 2026-11-25: 125,855 buffers, 375 ms, 141,372 rows filtered for one id).
-- The derived-work step does several per bill, ~870 MB of reads each.
-- One expression index; 141,364 rows, every value distinct. No data changes.
-- Production builds it concurrently first (no write lock); this statement is
-- then a no-op there and builds normally on a fresh replay.
create index if not exists idx_civic_genome_bill_source_bill_id
  on public.civic_genome_bill ((structural_dna_json ->> 'source_bill_id'));
