create table if not exists public.rosetta_clause_ir (
  id uuid primary key default gen_random_uuid(),
  extraction_run_id integer not null references public.extraction_run(id),
  source_document_id integer not null references public.source_document(id),
  source_block_id text not null references public.hr1_raw_blocks(id),
  parser_version text not null,
  clause_index integer not null check (clause_index > 0),
  source_text text not null,
  char_offset_start integer not null check (char_offset_start >= 0),
  char_offset_end integer not null check (char_offset_end > char_offset_start),
  source_content_hash text not null check (source_content_hash ~ '^[a-f0-9]{64}$'),
  clause_kind text not null check (
    clause_kind in (
      'duty','permission','private_right','private_remedy','prohibition',
      'status_creation','fee_rule','eligibility_rule','immunity_rule',
      'forfeiture_rule','definition','exception','amendment_scaffold',
      'short_title','unknown'
    )
  ),
  actor_text text,
  actor_canon_id text references public.actor_canon(id),
  actor_role text,
  modal text check (
    modal is null or modal in ('shall','must','may','may_not','must_not')
  ),
  action_text text,
  object_text text,
  condition_text text,
  deadline_text text,
  exception_text text,
  enumeration_status text not null default 'none' check (
    enumeration_status in ('none','complete','lead_in','incomplete','orphan_child')
  ),
  parse_status text not null check (
    parse_status in (
      'clean','ambiguous_modal','incomplete_enumeration',
      'malformed_source','unresolved','needs_review'
    )
  ),
  diagnostics jsonb not null default '[]'::jsonb check (jsonb_typeof(diagnostics) = 'array'),
  normalized_value jsonb check (normalized_value is null or jsonb_typeof(normalized_value) = 'object'),
  created_at timestamptz not null default now(),
  unique (extraction_run_id, parser_version, source_block_id, clause_index)
)

create index if not exists rosetta_clause_ir_run_parser_idx
  on public.rosetta_clause_ir(extraction_run_id, parser_version, source_block_id, clause_index)

create index if not exists rosetta_clause_ir_kind_status_idx
  on public.rosetta_clause_ir(clause_kind, parse_status, extraction_run_id)

create table if not exists public.rosetta_semantic_receipt (
  id bigint generated always as identity primary key,
  extraction_run_id integer not null references public.extraction_run(id),
  parser_version text not null,
  test_name text not null,
  passed boolean not null,
  failure_count integer not null check (failure_count >= 0),
  failures jsonb not null default '[]'::jsonb check (jsonb_typeof(failures) = 'array'),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  output_hash text not null check (output_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (extraction_run_id, parser_version, test_name)
)

create index if not exists rosetta_semantic_receipt_run_parser_idx
  on public.rosetta_semantic_receipt(extraction_run_id, parser_version, passed, test_name)

alter table public.rosetta_clause_ir enable row level security

alter table public.rosetta_semantic_receipt enable row level security

revoke all on public.rosetta_clause_ir from public, anon, authenticated

revoke all on public.rosetta_semantic_receipt from public, anon, authenticated

grant select, insert on public.rosetta_clause_ir to service_role

grant select, insert on public.rosetta_semantic_receipt to service_role

grant usage, select on sequence public.rosetta_semantic_receipt_id_seq to service_role

comment on table public.rosetta_clause_ir is
  'Noncanonical deterministic clause IR subordinate to immutable Rosetta extraction/source receipts. Does not replace five-layer canonical objects.'

comment on table public.rosetta_semantic_receipt is
  'Noncanonical deterministic semantic validation receipts for a versioned clause parser. Failed receipts preserve the extraction and block downstream eligibility.'
