-- Speeds exact confirmed-trait candidate discovery for Civic Genome family resolution.
-- The production rollout creates this index concurrently before this migration is
-- registered. The ordinary form below remains safe for fresh database builds.

create index if not exists idx_civic_genome_trait_confirmed_match
  on public.civic_genome_trait (
    trait_key,
    (jsonb_hash_extended(normalized_value_json, 0)),
    genome_bill_id
  )
  where signal_status = 'confirmed';

comment on index public.idx_civic_genome_trait_confirmed_match is
  'Confirmed-trait match access path for bounded Civic Genome family hydration; JSONB equality is rechecked after the hash lookup.';
