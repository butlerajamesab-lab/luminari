create index if not exists rosetta_object_correction_run_idx
  on public.rosetta_object_correction(extraction_run_id)

create index if not exists rosetta_object_correction_document_idx
  on public.rosetta_object_correction(source_document_id)

create index if not exists rosetta_clause_occurrence_canonical_idx
  on public.rosetta_clause_occurrence(canonical_clause_id)

create index if not exists rosetta_clause_occurrence_run_idx
  on public.rosetta_clause_occurrence(extraction_run_id)

create index if not exists rosetta_clause_occurrence_document_idx
  on public.rosetta_clause_occurrence(source_document_id)

create index if not exists rosetta_clause_occurrence_block_idx
  on public.rosetta_clause_occurrence(source_block_id)

create index if not exists rosetta_structural_repair_run_idx
  on public.rosetta_structural_repair_queue(extraction_run_id)

create index if not exists rosetta_structural_repair_document_idx
  on public.rosetta_structural_repair_queue(source_document_id)

revoke execute on function public.rosetta_reconcile_structural_correctness(integer)
  from public, anon, authenticated

grant execute on function public.rosetta_reconcile_structural_correctness(integer)
  to service_role
