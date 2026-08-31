begin

create or replace function public.rosetta_run_lifecycle_summary_v1(
  p_stale_before timestamptz default now() - interval '24 hours'
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with classified as (
    select
      case
        when run.run_status in ('completed','validated')
         and run.admissibility_state = 'admissible'
         and run.source_content_id is not null
         and nullif(btrim(run.engine_version), '') is not null
         and nullif(btrim(run.rule_set_version), '') is not null
         and nullif(btrim(run.rule_manifest_hash), '') is not null
         and nullif(btrim(run.configuration_hash), '') is not null
         and nullif(btrim(run.source_identity_hash), '') is not null
         and nullif(btrim(run.source_content_hash), '') is not null
         and nullif(btrim(run.output_content_hash), '') is not null
          then case
            when document.document_type = 'test_control' then 'admissible_control'
            else 'admissible_production'
          end
        when run.run_status = 'failed'
         and run.admissibility_state = 'rejected'
          then case
            when document.document_type = 'test_control' then 'rejected_control'
            else 'rejected_failure'
          end
        when run.run_status = 'in_progress'
         and run.source_content_id is null
         and nullif(btrim(run.engine_version), '') is null
         and run.created_at <= p_stale_before
          then 'stale_handoff_placeholder'
        when run.run_status = 'in_progress'
          then 'pending_handoff'
        when run.run_status in ('completed','validated')
         and run.admissibility_state = 'pending'
         and run.source_content_id is null
         and nullif(btrim(run.engine_version), '') is null
         and nullif(btrim(run.output_content_hash), '') is null
          then 'legacy_unreceipted_completed'
        when run.run_status in ('completed','validated')
         and run.admissibility_state = 'admissible'
          then 'incomplete_admissible_receipt'
        else 'unclassified'
      end as lifecycle_class
    from public.extraction_run run
    left join public.source_document document
      on document.id = run.source_document_id
  ),
  summary as (
    select
      count(*)::integer as total,
      count(*) filter (
        where lifecycle_class = 'admissible_production'
      )::integer as production_admissible,
      count(*) filter (
        where lifecycle_class = 'admissible_control'
      )::integer as control_admissible,
      count(*) filter (
        where lifecycle_class = 'rejected_control'
      )::integer as rejected_controls,
      count(*) filter (
        where lifecycle_class = 'rejected_failure'
      )::integer as rejected_failures,
      count(*) filter (
        where lifecycle_class = 'stale_handoff_placeholder'
      )::integer as stale_handoffs,
      count(*) filter (
        where lifecycle_class = 'pending_handoff'
      )::integer as pending_handoffs,
      count(*) filter (
        where lifecycle_class = 'legacy_unreceipted_completed'
      )::integer as legacy_unreceipted,
      count(*) filter (
        where lifecycle_class = 'incomplete_admissible_receipt'
      )::integer as incomplete_receipts,
      count(*) filter (
        where lifecycle_class = 'unclassified'
      )::integer as unclassified
    from classified
  )
  select jsonb_build_object(
    'contract', 'rosetta-run-lifecycle-summary-v1',
    'version', 'rosetta-run-lifecycle-v1',
    'total', total,
    'production_admissible', production_admissible,
    'control_admissible', control_admissible,
    'rejected_controls', rejected_controls,
    'rejected_failures', rejected_failures,
    'stale_handoffs', stale_handoffs,
    'pending_handoffs', pending_handoffs,
    'legacy_unreceipted', legacy_unreceipted,
    'incomplete_receipts', incomplete_receipts,
    'unclassified', unclassified,
    'control_receipts', control_admissible + rejected_controls,
    'attention_required',
      stale_handoffs + rejected_failures + incomplete_receipts + unclassified
  )
  from summary;
$$

revoke all on function public.rosetta_run_lifecycle_summary_v1(timestamptz)
from public

grant execute on function public.rosetta_run_lifecycle_summary_v1(timestamptz)
to anon, authenticated, service_role

comment on function public.rosetta_run_lifecycle_summary_v1(timestamptz) is
  'Exact aggregate of the rosetta-run-lifecycle-v1 classification contract. Returns counts only; no source text, parser output, or private record payload.'

commit
