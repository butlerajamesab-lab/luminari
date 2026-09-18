-- Current-state amendment dependency routing.
--
-- Amendments are delta artifacts. They park until an exact base relationship is
-- proved and, after attachment, until a separately approved two-source executor
-- exists. Parked dependency rows must never consume retries or block sibling
-- legislative source lanes.

create or replace function public.wake_civic_genome_amendments_for_base_v1()
returns trigger
language plpgsql
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if new.document_family <> 'text'
     or coalesce(new.receipt_json->>'source_content_hash','') !~ '^[0-9a-fA-F]{64}$'
     or (
       coalesce(old.receipt_json->>'source_content_hash','')
       = coalesce(new.receipt_json->>'source_content_hash','')
     )
  then
    return new;
  end if;

  update public.civic_genome_legislative_version_queue queue
     set queue_state='eligible',
         next_attempt_at=now(),
         locked_at=null,
         locked_by=null,
         last_failure_class=null,
         last_error_code=null,
         updated_at=now()
    from public.civic_genome_bill_version amendment
   where amendment.base_bill_version_id=new.bill_version_id
     and amendment.document_family='amendment'
     and queue.bill_version_id=amendment.bill_version_id
     and queue.queue_state='degraded'
     and queue.last_failure_class='awaiting_amendment_base'
     and queue.next_attempt_at='infinity'::timestamptz
     and queue.locked_at is null
     and queue.locked_by is null;

  return new;
end;
$$;

drop trigger if exists wake_civic_genome_amendments_for_base_v1
  on public.civic_genome_bill_version;
create trigger wake_civic_genome_amendments_for_base_v1
after update of receipt_json on public.civic_genome_bill_version
for each row execute function public.wake_civic_genome_amendments_for_base_v1();

comment on function public.wake_civic_genome_amendments_for_base_v1() is
  'Reopens only exact amendment dependencies when their already-bound base version first gains a preserved source-content hash. Does not invoke Rosetta or consume attempts.';

revoke all on function public.wake_civic_genome_amendments_for_base_v1()
  from public,anon,authenticated;
grant execute on function public.wake_civic_genome_amendments_for_base_v1()
  to service_role;

-- Reclassify only the legacy current-result holds for amendment artifacts.
-- This does not reset attempt_count and does not touch permanent failures.
-- The worker will preserve/reuse exact source content, resolve the base, append
-- an attachment receipt, then park in the correct dependency lane.
update public.civic_genome_legislative_version_queue queue
   set queue_state='eligible',
       next_attempt_at=now(),
       locked_at=null,
       locked_by=null,
       last_failure_class=null,
       last_error_code=null,
       updated_at=now()
  from public.civic_genome_bill_version version
 where version.bill_version_id=queue.bill_version_id
   and version.document_family='amendment'
   and queue.queue_state='degraded'
   and queue.last_failure_class='awaiting_current_result'
   and queue.next_attempt_at='infinity'::timestamptz
   and queue.locked_at is null
   and queue.locked_by is null;
