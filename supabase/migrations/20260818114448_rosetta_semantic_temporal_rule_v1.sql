begin

alter table public.rosetta_clause_ir
  drop constraint if exists rosetta_clause_ir_clause_kind_check

alter table public.rosetta_clause_ir
  add constraint rosetta_clause_ir_clause_kind_check
  check (
    clause_kind = any (array[
      'duty'::text,
      'permission'::text,
      'private_right'::text,
      'private_remedy'::text,
      'prohibition'::text,
      'status_creation'::text,
      'temporal_rule'::text,
      'fee_rule'::text,
      'eligibility_rule'::text,
      'immunity_rule'::text,
      'forfeiture_rule'::text,
      'definition'::text,
      'exception'::text,
      'amendment_scaffold'::text,
      'short_title'::text,
      'unknown'::text
    ])
  )

comment on constraint rosetta_clause_ir_clause_kind_check on public.rosetta_clause_ir is
  'Semantic clause vocabulary includes temporal_rule for source-stated dates/deadlines that govern legal status or procedure without inventing the date as a legal actor.'

commit
