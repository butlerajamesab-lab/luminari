-- PROPOSAL ONLY; production remains unmodified pending forward-only migration acceptance.
-- Exact installed public enqueue trigger function preserved except class-wide
-- provenance admission guard. Never disable triggers or the original API path.
CREATE OR REPLACE FUNCTION public.enqueue_docket_current_authoritative_version_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_priority integer;
begin
  if new.document_family <> 'text' then
    return new;
  end if;

  -- Source-aware admission: historical ZIP metadata is not official text.
  -- Do not create an automatic downstream eligible task for an archive source.
  -- The original trigger remains active; live API sources remain unchanged.
  if exists (
    select 1
      from public.docket_bill_detail_cache detail
     where detail.bill_id = new.source_bill_id
       and detail.source = 'legiscan_bulk_json'
  ) then
    return new;
  end if;

  if not exists (
    select 1
    from public.docket_current_authoritative_source_v1 authority
    where authority.bill_version_id = new.bill_version_id
      and authority.source_bill_id = new.source_bill_id
      and authority.source_document_key = new.source_document_key
  ) then
    return new;
  end if;

  v_priority := (new.stage_rank * 1000) + new.provider_sequence;

  insert into public.civic_genome_legislative_version_queue (
    bill_version_id,
    queue_state,
    priority,
    attempt_count,
    next_attempt_at,
    completed_at,
    locked_at,
    locked_by,
    last_failure_class,
    last_error_code
  )
  values (
    new.bill_version_id,
    'eligible',
    v_priority,
    0,
    now(),
    null,
    null,
    null,
    null,
    null
  )
  on conflict (bill_version_id) do update
     set queue_state = 'eligible',
         priority = excluded.priority,
         attempt_count = 0,
         next_attempt_at = now(),
         completed_at = null,
         locked_at = null,
         locked_by = null,
         last_failure_class = null,
         last_error_code = null,
         updated_at = now();

  return new;
end;
$function$

