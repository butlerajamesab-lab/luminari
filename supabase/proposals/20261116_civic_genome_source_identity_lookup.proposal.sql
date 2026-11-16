-- REVIEW-ONLY PROPOSAL, NOT AN INSTALLED MIGRATION.
-- Bounded source identity lookup optimization for #830.
-- Never apply in a live database without independent exact-head review,
-- approved nontransactional migration plan, and post-install count/plan audit.
--
-- The original Docket -> Genome identity and legislative-history writer remain
-- unchanged. These are helper lookup indexes, not new identities or writers.
--
-- "CONCURRENTLY" is intentionally used so application writes are not held by
-- the index-build table lock. PostgreSQL disallows CONCURRENTLY in a transaction,
-- so this cannot be naively copied into a transactional migration runner.
-- Build one at a time, inspect pg_stat_progress_create_index, and verify
-- pg_index.indisvalid + pg_index.indisready after each build.

create index concurrently if not exists civic_genome_bill_source_id_text_lookup_v1
  on public.civic_genome_bill
  ((structural_dna_json ->> 'source_bill_id'));

-- Matches the existing safe-coercion join used by
-- civic_genome_normalized_source_history_v3_unscoped. Non-numeric source IDs
-- remain safely null, never cast to an integer and never discarded.
create index concurrently if not exists civic_genome_bill_source_id_safe_int_lookup_v1
  on public.civic_genome_bill
  ((case
      when coalesce(structural_dna_json ->> 'source_bill_id', '') ~ '^[0-9]+$'
      then (structural_dna_json ->> 'source_bill_id')::integer
      else null::integer
    end));
