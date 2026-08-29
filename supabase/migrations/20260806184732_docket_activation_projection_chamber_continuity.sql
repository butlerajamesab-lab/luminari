begin;

-- LegiScan amendment chamber metadata is provider-owned and may include values
-- beyond the two single-letter legislative chambers. Preserve the exact
-- normalized provider value while the version classifier continues to map H
-- and S specifically and treats every other value as other_amendment.
alter table public.docket_bill_source_document
  drop constraint if exists docket_bill_source_document_chamber_check;
alter table public.docket_bill_source_document
  add constraint docket_bill_source_document_chamber_check
  check (
    chamber is null
    or (
      char_length(chamber) between 1 and 32
      and chamber = upper(chamber)
      and chamber ~ '^[A-Z0-9 _/-]+$'
    )
  );

alter table public.civic_genome_bill_version
  drop constraint if exists civic_genome_bill_version_chamber_check;
alter table public.civic_genome_bill_version
  add constraint civic_genome_bill_version_chamber_check
  check (
    chamber is null
    or (
      char_length(chamber) between 1 and 32
      and chamber = upper(chamber)
      and chamber ~ '^[A-Z0-9 _/-]+$'
    )
  );

-- The first production activation exposed two recoverable historical states:
-- cache rows that predated Civic Genome projection, and provider chamber
-- values rejected by the former H/S-only constraint. Preserve their recorded
-- receipts but return the current work generation to an immediately claimable
-- state after the code and schema repair.
update public.docket_bill_processing_queue
   set queue_state = 'eligible',
       attempt_count = 0,
       next_attempt_at = now(),
       locked_at = null,
       locked_by = null,
       completed_at = null,
       last_failure_class = null,
       last_error_code = null,
       updated_at = now()
 where last_error_code = 'docket_civic_genome_projection_pending'
    or last_error_code like 'new_row_for_relation__docket_bill_source_document__violates_check_constraint__docket_bill_source_document_chamber_check_%';

comment on constraint docket_bill_source_document_chamber_check
  on public.docket_bill_source_document is
  'Preserves bounded uppercase provider chamber metadata. H and S receive specific version classification; other values remain exact metadata and classify as other_amendment.';

comment on constraint civic_genome_bill_version_chamber_check
  on public.civic_genome_bill_version is
  'Preserves bounded uppercase provider chamber metadata copied from the source-document receipt without forcing non-H/S chambers into a false classification.';

commit;
