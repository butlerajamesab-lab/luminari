-- Current-state amendment dependency routing.
--
-- Amendments are delta artifacts. They park until an exact base relationship is
-- proved and, after attachment, until a separately approved two-source executor
-- exists. Parked dependency rows must never consume retries or block sibling
-- legislative source lanes.

-- Retire the completed-bill-era URL-stem base inference. Exact amendment bases
-- are now resolved only after source acquisition from source-stated target
-- evidence plus a proved jurisdictional chronology when necessary.
do $migration$
declare
  v_sql text;
  v_old text := $old$
  update public.docket_bill_source_document document
     set base_source_document_key = (
       select base.source_document_key
       from public.docket_bill_source_document base
       where base.source_bill_id = document.source_bill_id
         and base.document_family = 'text'
         and base.source_stem = document.source_stem
       order by base.provider_sequence desc, base.provider_document_id desc
       limit 1
     ), updated_at = now()
   where document.source_bill_id = p_source_bill_id
     and document.document_family = 'amendment';
$old$;
  v_new text := $new$
  -- Amendment base identity is intentionally unresolved at registration time.
  -- URL/source_stem similarity is not legislative attachment evidence.
$new$;
begin
  select pg_get_functiondef(
    'public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure
  ) into v_sql;

  if v_sql is null then
    raise exception 'register_docket_legislative_version_spine is missing';
  end if;
  if position(v_old in v_sql)=0 then
    raise exception 'legacy source-stem amendment base inference was not found';
  end if;

  v_sql:=replace(v_sql,v_old,v_new);
  execute v_sql;

  select pg_get_functiondef(
    'public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure
  ) into v_sql;
  if position('base.source_stem = document.source_stem' in v_sql)<>0 then
    raise exception 'legacy source-stem amendment base inference remains installed';
  end if;
end;
$migration$;

comment on function public.register_docket_legislative_version_spine(integer,boolean) is
  'Registers provider-declared bill text and amendment artifacts and preserves observations. Text predecessor lineage remains deterministic. Amendment base identity is not inferred from URL/source stems; it is attached later from exact source-stated evidence.';

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

-- Historical amendment activation is intentionally not performed in this
-- schema migration. The new pre-decomposition resolver must be deployed first.
-- After runtime verification, existing parked amendment rows can be reopened as
-- one class under the new worker. This avoids an old-code eligibility window.
