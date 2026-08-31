begin

create table if not exists public.rosetta_structural_representation (
  id text primary key,
  corpus_id integer not null references public.corpus(id) on delete cascade,
  source_document_id integer not null references public.source_document(id) on delete cascade,
  extraction_run_id integer not null references public.extraction_run(id) on delete cascade,
  source_block_id text not null references public.hr1_raw_blocks(id) on delete cascade,
  representation_type text not null,
  representation_json jsonb not null,
  confidence numeric not null default 1.00 check (confidence >= 0 and confidence <= 1),
  signal_status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  unique (extraction_run_id, representation_type, source_block_id)
)

create index if not exists rosetta_structural_representation_run_idx
  on public.rosetta_structural_representation(extraction_run_id, representation_type, id)

alter table public.rosetta_structural_representation enable row level security

revoke all on public.rosetta_structural_representation from public, anon, authenticated

grant select, insert, update, delete on public.rosetta_structural_representation to service_role

create or replace function public.rosetta_v255_clean_amendment_operation_text(p_operation_text text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_text text := p_operation_text;
  v_next text;
begin
  loop
    v_next := regexp_replace(
      v_text,
      '[[:space:]]*(--[[:space:]]*[0-9]+[[:space:]]+of[[:space:]]+[0-9]+[[:space:]]*--|Page[[:space:]]+[0-9]+[[:space:]]+of[[:space:]]+[0-9]+)[[:space:]]*$',
      '',
      'i'
    );
    exit when v_next = v_text;
    v_text := v_next;
  end loop;
  return rtrim(v_text);
end;
$$

create or replace function public.rosetta_v255_amendment_operations(p_source_text text)
returns table(
  operation_ordinal integer,
  operation_text text,
  target_locator text,
  operation_kind text,
  char_offset_start integer,
  char_offset_end integer
)
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select
    operation.operation_ordinal,
    public.rosetta_v255_clean_amendment_operation_text(operation.operation_text) as operation_text,
    operation.target_locator,
    operation.operation_kind,
    operation.char_offset_start,
    operation.char_offset_start
      + char_length(public.rosetta_v255_clean_amendment_operation_text(operation.operation_text)) as char_offset_end
  from public.rosetta_v24_amendment_operations(p_source_text) operation
  where nullif(btrim(public.rosetta_v255_clean_amendment_operation_text(operation.operation_text)), '') is not null
  order by operation.operation_ordinal;
$$

revoke all on function public.rosetta_v255_clean_amendment_operation_text(text) from public, anon, authenticated

revoke all on function public.rosetta_v255_amendment_operations(text) from public, anon, authenticated

grant execute on function public.rosetta_v255_clean_amendment_operation_text(text) to service_role

grant execute on function public.rosetta_v255_amendment_operations(text) to service_role

create or replace view public.v_rosetta_operator_law_view_v1
with (security_invoker=true) as
select
  law.extraction_run_id,
  law.source_document_id,
  law.corpus_id,
  law.document_name,
  law.document_type,
  law.document_identifier,
  law.run_version,
  law.run_status,
  law.confidence_threshold,
  law.created_at,
  law.completed_at,
  public.rosetta_v25_enrich_objects_with_spans(law.extraction_run_id, law.objects) as objects,
  law.coverage,
  law.provenance_state,
  law.engine_version,
  law.rule_set_version,
  law.rule_manifest_hash,
  law.configuration_hash,
  law.source_identity_hash,
  law.source_content_hash,
  law.output_content_hash,
  law.admissibility_state,
  law.source_url,
  law.source_version,
  law.media_type,
  law.source_byte_hash,
  law.source_provider_hash,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'key', representation.id,
        'representation_type', representation.representation_type,
        'source_object_type', 'rosetta_structural_representation',
        'source_object_id', representation.id,
        'source_block_id', representation.source_block_id,
        'extraction_run_id', representation.extraction_run_id::text,
        'normalized_value', representation.representation_json,
        'confidence', representation.confidence,
        'confirmed', representation.signal_status = 'confirmed',
        'metadata', jsonb_build_object(
          'signal_status', representation.signal_status,
          'source_span', jsonb_build_object(
            'span_status', case when block.id is null then 'unresolved' else 'resolved' end,
            'char_offset_start', block.char_offset_start,
            'char_offset_end', block.char_offset_end,
            'block_content_hash', block.block_content_hash,
            'section_number', block.section_number,
            'projection_version', 'rosetta-layout-projection-v25'
          )
        )
      ) order by representation.id
    )
    from public.rosetta_structural_representation representation
    left join public.hr1_raw_blocks block on block.id = representation.source_block_id
    where representation.extraction_run_id = law.extraction_run_id
  ), '[]'::jsonb) as structural_representations
from public.v_civic_genome_law_view_v1_internal law

revoke all on public.v_rosetta_operator_law_view_v1 from public, anon, authenticated

grant select on public.v_rosetta_operator_law_view_v1 to service_role

comment on table public.rosetta_structural_representation is
  'Non-operative Rosetta structural representations. These rows are evidence/structure, not members of HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, or DEFINITIONS and must not become Civic Genome semantic traits by implication.'

comment on function public.rosetta_v255_amendment_operations(text) is
  'Staged amendment-operation parser that preserves exact source offsets while terminating before recognized trailing legislative page furniture.'

commit
