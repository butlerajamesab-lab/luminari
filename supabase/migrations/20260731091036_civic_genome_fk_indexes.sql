-- Cover Civic Genome foreign-key paths used by family reassignment and
-- jurisdiction comparison reads.

create index if not exists idx_civic_genome_event_bill_family
  on public.civic_genome_event(genome_bill_id, bill_id, family_id);

create index if not exists idx_civic_genome_comparison_state_cell_family
  on public.civic_genome_comparison_state_cell(family_id);

create index if not exists idx_civic_genome_comparison_state_cell_latest_bill
  on public.civic_genome_comparison_state_cell(latest_genome_bill_id)
  where latest_genome_bill_id is not null;

create index if not exists idx_civic_genome_unresolved_best_family
  on public.civic_genome_unresolved_family_candidate(best_candidate_family_id)
  where best_candidate_family_id is not null;

create index if not exists idx_civic_genome_unresolved_resolution_family
  on public.civic_genome_unresolved_family_candidate(resolution_family_id)
  where resolution_family_id is not null;
