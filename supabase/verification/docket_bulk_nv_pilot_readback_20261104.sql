-- READ-ONLY first-batch Docket acceptance receipt, not a data loader.
-- Execute after separately approved archive receipt migration, once before
-- import and once after the bounded Nevada 2027 archive has been ingested.
-- Exact archive SHA and bill IDs obtained from the verified original ZIP.
-- No legal text bytes or amendment attachments are asserted by this test.
with expected_source_ids(bill_id) as (
  values (2161319),
         (2161332),
         (2161338),
         (2161354),
         (2161352),
         (2161351),
         (2161326),
         (2161349),
         (2161353),
         (2161335),
         (2161342),
         (2161358),
         (2161364),
         (2161365),
         (2161362),
         (2161361),
         (2161359),
         (2161357),
         (2161360),
         (2161363),
         (2161337),
         (2161343),
         (2161318),
         (2161323),
         (2161327),
         (2161341),
         (2161340),
         (2161320),
         (2161321),
         (2161325),
         (2161329),
         (2161330),
         (2161348),
         (2161345),
         (2161333),
         (2161317),
         (2161336),
         (2161322),
         (2161350),
         (2161346),
         (2161328)
), cache_rows as (
  select detail.bill_id,detail.source,
         detail.bill->>'state' as state,
         detail.bill->>'session_id' as session_id
  from public.docket_bill_detail_cache detail
  join expected_source_ids x using (bill_id)
), bound_jobs as (
  select distinct binding.source_bill_id, queue.queue_id, queue.queue_state
  from public.docket_jurisdiction_activation_bill binding
  join public.docket_jurisdiction_activation_run activation
    on activation.activation_id=binding.activation_id
   and activation.source='legiscan_bulk_json'
   and activation.state='NV'
   and activation.session_id=2265
  join public.docket_bill_processing_queue queue
    on queue.queue_id=binding.queue_id
   and queue.source_bill_id=binding.source_bill_id
  join expected_source_ids x on x.bill_id=binding.source_bill_id
)
select
  'NV_2027-2027_84th_Legislature_JSON_20261028_d496c2236b64c1e0c092a0747f19a227.zip' as expected_archive,
  '2c8d28fb9a31a2cca5826b1dfb5c1aa5ef7cb0fe007f1ef38a51beca786075b4' as expected_archive_sha256,
  (select count(*)::int from expected_source_ids) as expected_unique_bill_ids,
  (select count(*)::int from cache_rows) as cached_expected_bill_ids,
  (select count(*)::int from cache_rows where source='legiscan_bulk_json') as cache_archive_bill_ids,
  (select count(*)::int from cache_rows where state='NV' and session_id='2265') as correct_identity_bill_ids,
  (select count(*)::int from cache_rows where source<>'legiscan_bulk_json') as preserved_prior_source_bill_ids,
  (select count(*)::int from public.docket_legiscan_bulk_member_receipt receipt
    where receipt.archive_sha256='2c8d28fb9a31a2cca5826b1dfb5c1aa5ef7cb0fe007f1ef38a51beca786075b4') as exact_archive_receipts,
  (select count(*)::int from public.docket_legiscan_bulk_member_receipt receipt
    where receipt.archive_sha256='2c8d28fb9a31a2cca5826b1dfb5c1aa5ef7cb0fe007f1ef38a51beca786075b4'
      and receipt.member_kind='bill' and receipt.disposition='inserted') as admitted_bill_receipts,
  (select count(*)::int from public.docket_legiscan_bulk_member_receipt receipt
    where receipt.archive_sha256='2c8d28fb9a31a2cca5826b1dfb5c1aa5ef7cb0fe007f1ef38a51beca786075b4'
      and receipt.member_kind='bill' and receipt.disposition='held_chronology') as chronology_held_bill_receipts,
  (select count(*)::int from public.docket_legiscan_bulk_member_receipt receipt
    where receipt.archive_sha256='2c8d28fb9a31a2cca5826b1dfb5c1aa5ef7cb0fe007f1ef38a51beca786075b4'
      and receipt.member_kind='person' and receipt.disposition='source_preserved') as preserved_person_receipts,
  (select count(*)::int from bound_jobs) as archive_activation_jobs,
  (select count(*)::int from bound_jobs where queue_state='completed') as archive_completed_jobs,
  (select count(*)::int from bound_jobs where queue_state in ('eligible','degraded','submitted')) as archive_incomplete_jobs,
  (select count(*)::int from bound_jobs where queue_state in ('permanent_failure','source_unavailable')) as archive_failure_or_unavailable_jobs;
