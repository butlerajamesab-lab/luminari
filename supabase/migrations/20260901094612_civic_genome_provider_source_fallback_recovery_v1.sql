begin;

-- Re-open only Vermont official-source failures that became terminal before a
-- hash/size-checked provider-copy fallback existed. This includes the exact
-- TLS leaf-signature failures and one older legacy `fetch_failed` class. Every
-- target must have a bounded LegiScan copy plus an MD5 and byte size. The prior
-- failure stays in the version receipt; no Rosetta or Docket record is deleted.
-- The recovered work is held for 24 hours so this migration may land before the
-- provider-fallback worker code without letting the prior worker reclaim it.
-- Deployment verification explicitly releases this hold after the new worker
-- is live.
do $$
declare
  target_count integer;
begin
  select count(*)::integer
    into target_count
  from public.civic_genome_legislative_version_queue queue
  join public.civic_genome_bill_version version
    on version.bill_version_id = queue.bill_version_id
  join public.docket_bill_source_document document
    on document.source_document_key = version.source_document_key
  where queue.queue_state = 'permanent_failure'
    and (
      queue.last_error_code like
        'legislative_version_source_fetch_network_failed:%:UNABLE_TO_VERIFY_LEAF_SIGNATURE%'
      or queue.last_error_code = 'fetch_failed'
    )
    and split_part(lower(document.source_url), '/', 3) =
      'legislature.vermont.gov'
    and nullif(document.provider_url, '') is not null
    and document.provider_url like 'https://%'
    and split_part(lower(document.provider_url), '/', 3) in (
      'legiscan.com',
      'www.legiscan.com'
    )
    and document.provider_url is distinct from document.source_url
    and document.provider_hash ~ '^[0-9a-fA-F]{32}$'
    and document.provider_size > 0;

  if target_count > 500 then
    raise exception using
      errcode = '54000',
      message = 'civic_genome_provider_source_fallback_recovery_target_count_exceeds_bound',
      detail = target_count::text;
  end if;
end;
$$;

with target as materialized (
  select
    queue.queue_id,
    queue.bill_version_id,
    queue.attempt_count as prior_attempt_count,
    queue.last_failure_class as prior_failure_class,
    queue.last_error_code as prior_error_code,
    version.failure_code as prior_version_failure_code
  from public.civic_genome_legislative_version_queue queue
  join public.civic_genome_bill_version version
    on version.bill_version_id = queue.bill_version_id
  join public.docket_bill_source_document document
    on document.source_document_key = version.source_document_key
  where queue.queue_state = 'permanent_failure'
    and (
      queue.last_error_code like
        'legislative_version_source_fetch_network_failed:%:UNABLE_TO_VERIFY_LEAF_SIGNATURE%'
      or queue.last_error_code = 'fetch_failed'
    )
    and split_part(lower(document.source_url), '/', 3) =
      'legislature.vermont.gov'
    and nullif(document.provider_url, '') is not null
    and document.provider_url like 'https://%'
    and split_part(lower(document.provider_url), '/', 3) in (
      'legiscan.com',
      'www.legiscan.com'
    )
    and document.provider_url is distinct from document.source_url
    and document.provider_hash ~ '^[0-9a-fA-F]{32}$'
    and document.provider_size > 0
), version_recovery as (
  update public.civic_genome_bill_version version
     set processing_state = case
           when version.rosetta_source_document_id is null then 'registered'
           else version.processing_state
         end,
         failure_code = null,
         receipt_json = coalesce(version.receipt_json, '{}'::jsonb)
           || jsonb_build_object(
             'source_fallback_recovery_contract',
               'civic-genome-provider-copy-fallback-recovery-v1',
             'source_fallback_recovery_reason',
               'vermont_official_source_failure_with_hash_checked_provider_copy_available',
             'source_fallback_recovery_previous_failure_code',
               target.prior_version_failure_code,
             'source_fallback_recovery_previous_queue_failure_class',
               target.prior_failure_class,
             'source_fallback_recovery_previous_queue_error_code',
               target.prior_error_code,
             'source_fallback_recovery_previous_attempt_count',
               target.prior_attempt_count,
             'source_fallback_recovery_requeued_at', now(),
             'source_fallback_recovery_not_before',
               now() + interval '24 hours'
           ),
         updated_at = now()
    from target
   where version.bill_version_id = target.bill_version_id
  returning version.bill_version_id
)
update public.civic_genome_legislative_version_queue queue
   set queue_state = 'eligible',
       attempt_count = 0,
       next_attempt_at = now() + interval '24 hours',
       locked_at = null,
       locked_by = null,
       completed_at = null,
       last_failure_class = null,
       last_error_code = null,
       updated_at = now()
  from version_recovery recovery
 where queue.bill_version_id = recovery.bill_version_id;

commit;
