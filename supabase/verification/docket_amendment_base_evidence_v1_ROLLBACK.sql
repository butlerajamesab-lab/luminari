-- ROLLBACK for docket_amendment_base_evidence_v1 (Lighthouse). Run only on Alexander's yes.
-- Restores register_docket_legislative_version_spine to the reviewed pre-migration function
-- (sha256 d3c90085f6eac0d5cef604c108692d4a5bfe746f6b616ba2c6adc3ed77a43486), checked after restore.
-- Deletes nothing: docket_amendment_base_receipt (append-only evidence) and the evidence function stay.
-- Bases already set by the new rule stay recorded in docket_bill_source_document; held contested
-- queue rows stay held. Reversing those is a separate, receipted decision.
begin;
do $undo$
declare
  v_def text := pg_get_functiondef('public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure);
  v_old text; v_new text; v_n int;
begin
  if encode(sha256(convert_to(v_def,'UTF8')),'hex') = 'd3c90085f6eac0d5cef604c108692d4a5bfe746f6b616ba2c6adc3ed77a43486' then
    return;  -- already rolled back
  end if;

  -- undo E1 base from evidence, recalculated every run, receipted
  v_old := $n$  -- base from evidence (docket_amendment_base_evidence_v1), recalculated on every run so
  -- arrival order cannot change the outcome. Every base set or changed leaves a receipt.
  -- An existing base the evidence no longer supports is kept and receipted as contested
  -- (the no-bare guard refuses removing a base); deciding those is Alexander's call.
  insert into public.docket_amendment_base_receipt (source_document_key, previous_base_key, new_base_key, status, method, reason, evidence)
  select document.source_document_key, document.base_source_document_key,
         coalesce(evidence.base_key, document.base_source_document_key),
         case when evidence.base_key is null then 'contested_existing_base'
              when document.base_source_document_key is null then 'attached'
              else 'changed' end,
         evidence.method, evidence.reason, evidence.evidence
  from public.docket_bill_source_document document
  join public.docket_amendment_base_evidence_v1(p_source_bill_id) evidence
    on evidence.source_document_key = document.source_document_key
  where document.source_bill_id = p_source_bill_id
    and document.document_family = 'amendment'
    and evidence.base_key is distinct from document.base_source_document_key
    and not (evidence.base_key is null and document.base_source_document_key is null)
    and not (evidence.base_key is null and exists (
      select 1 from public.docket_amendment_base_receipt prior
      where prior.source_document_key = document.source_document_key
        and prior.status = 'contested_existing_base'
        and prior.new_base_key = document.base_source_document_key));

  update public.docket_bill_source_document document
     set base_source_document_key = evidence.base_key, updated_at = now()
  from public.docket_amendment_base_evidence_v1(p_source_bill_id) evidence
  where evidence.source_document_key = document.source_document_key
    and document.source_bill_id = p_source_bill_id
    and document.document_family = 'amendment'
    and evidence.base_key is not null
    and evidence.base_key is distinct from document.base_source_document_key;$n$;
  v_new := $o$  update public.docket_bill_source_document document
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
     and document.document_family = 'amendment'
     and document.base_source_document_key is null;$o$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'docket_amendment_base_evidence_v1 rollback: E1 matched % times', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  -- undo E2 contested amendments are never queued
  v_old := $n$      and not (version.document_family = 'amendment' and version.base_bill_version_id is null)
      -- Option A (Alexander, 2026-11-22): a base the evidence does not support stays recorded but is
      -- never queued for decomposition.
      and not exists (select 1 from public.docket_amendment_base_evidence_v1(p_source_bill_id) evidence
                      where evidence.source_document_key = version.source_document_key
                        and version.document_family = 'amendment'
                        and evidence.base_key is null)
    on conflict (bill_version_id) do update set$n$;
  v_new := $o$      and not (version.document_family = 'amendment' and version.base_bill_version_id is null)
    on conflict (bill_version_id) do update set$o$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'docket_amendment_base_evidence_v1 rollback: E2 matched % times', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  -- undo E3 hold the queue row of every contested amendment
  v_old := $n$    get diagnostics v_enqueued = row_count;
  end if;

  -- Option A: hold the queue row of every amendment whose recorded base the evidence does not support.
  update public.civic_genome_legislative_version_queue queue
     set queue_state = 'held',
         last_failure_class = 'amendment_base_contested',
         last_error_code = 'docket_amendment_base_evidence_v1_contested',
         next_attempt_at = 'infinity'::timestamptz,
         updated_at = now()
    from public.civic_genome_bill_version version
    join public.docket_amendment_base_evidence_v1(p_source_bill_id) evidence
      on evidence.source_document_key = version.source_document_key
   where queue.bill_version_id = version.bill_version_id
     and version.genome_bill_id = v_genome_bill_id
     and version.document_family = 'amendment'
     and version.base_bill_version_id is not null
     and evidence.base_key is null
     and queue.queue_state in ('eligible', 'degraded')
     and queue.locked_at is null;
$n$;
  v_new := $o$    get diagnostics v_enqueued = row_count;
  end if;
$o$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'docket_amendment_base_evidence_v1 rollback: E3 matched % times', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  execute v_def;
  if encode(sha256(convert_to(pg_get_functiondef('public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure),'UTF8')),'hex')
     <> 'd3c90085f6eac0d5cef604c108692d4a5bfe746f6b616ba2c6adc3ed77a43486' then
    raise exception 'docket_amendment_base_evidence_v1 rollback: restored function does not match the reviewed version';
  end if;
end
$undo$;
commit;
