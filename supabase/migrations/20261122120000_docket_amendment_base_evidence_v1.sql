-- docket_amendment_base_evidence_v1 (Lighthouse wepxlinwbjrkqdzkqpar)
-- Replaces the amendment base rule in the Docket registration spine.
-- Old rule: attach to the NEWEST text with the identical file stem, first write wins.
--   Proven wrong on real bills (receipt AMENDMENT_BASE_RULE_PROOF_2026-11-22): bases dated after the
--   amendment (OK SB206), the result depends on arrival order, Colorado matched "download" = "download",
--   Indiana's stated bases ("HB1348.02.COMH.AMH001" -> "HB1348.02.COMH") were missed.
-- New rule, recalculated on every run so arrival order cannot change the outcome:
--   1. a base proven by the amendment's own text (amendment_attachment_v1) always stands;
--   2. the amendment's file name names the base text (equal, or text name + . space - _),
--      and only names that contain the bill's own number count; most specific wins;
--   3. dates only break a tie: latest named text dated on or before the amendment
--      (dates before 1990 count as missing);
--   4. otherwise held with its reason.
-- Every base set or changed writes an append-only receipt (docket_amendment_base_receipt).
-- Option A (Alexander, 2026-11-22): an existing base the evidence does not support is kept as recorded,
--   receipted as contested, and its queue row is held (never decomposed). The no-bare guard is unchanged.
--
-- Expected function sha256 before: d3c90085f6eac0d5cef604c108692d4a5bfe746f6b616ba2c6adc3ed77a43486
-- Re-running is a no-op. Undo: supabase/verification/docket_amendment_base_evidence_v1_ROLLBACK.sql
begin;

create table if not exists public.docket_amendment_base_receipt (
  receipt_id bigint generated always as identity primary key,
  source_document_key text not null,
  previous_base_key text,
  new_base_key text,
  status text not null,          -- attached | changed | contested_existing_base
  method text,
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create or replace function public.docket_amendment_base_receipt_append_only()
returns trigger language plpgsql as $$
begin
  raise exception using errcode='42501', message='docket_amendment_base_receipt_is_append_only';
end $$;
drop trigger if exists docket_amendment_base_receipt_append_only on public.docket_amendment_base_receipt;
create trigger docket_amendment_base_receipt_append_only
  before update or delete on public.docket_amendment_base_receipt
  for each row execute function public.docket_amendment_base_receipt_append_only();

create or replace function public.docket_amendment_base_evidence_v1(p_source_bill_id integer)
returns table (source_document_key text, base_key text, method text, reason text, evidence jsonb)
language sql stable set search_path = '' as $$
  with amendment as (
    select d.source_document_key, d.source_stem,
           case when d.provider_date >= date '1990-01-01' then d.provider_date end provider_date,
           nullif(ltrim(regexp_replace(split_part(d.provider_url, '/', 6), '\D', '', 'g'), '0'), '') bill_digits,
           d.base_source_document_key current_base,
           coalesce((select v.receipt_json ? 'amendment_attachment_v1' from public.civic_genome_bill_version v
                     where v.source_document_key = d.source_document_key limit 1), false) text_proven
    from public.docket_bill_source_document d
    where d.source_bill_id = p_source_bill_id and d.document_family = 'amendment'
  ),
  text_doc as (
    select d.source_document_key, d.source_stem,
           case when d.provider_date >= date '1990-01-01' then d.provider_date end provider_date, d.provider_sequence
    from public.docket_bill_source_document d
    where d.source_bill_id = p_source_bill_id and d.document_family = 'text'
      and coalesce(d.source_stem, '') <> ''
  ),
  name_match as (   -- every text whose stem the amendment's stem names
    select a.source_document_key amendment_key, t.*
    from amendment a join text_doc t
      on a.bill_digits is not null
     and t.source_stem ~ ('(^|[^0-9])0*' || a.bill_digits || '([^0-9]|$)')
     and (a.source_stem = t.source_stem
      or (length(a.source_stem) > length(t.source_stem)
          and left(a.source_stem, length(t.source_stem)) = t.source_stem
          and substr(a.source_stem, length(t.source_stem) + 1, 1) in ('.', ' ', '-', '_')))
  ),
  most_specific as (
    select m.* from name_match m
    where length(m.source_stem) = (select max(length(x.source_stem)) from name_match x where x.amendment_key = m.amendment_key)
  ),
  summary as (
    select a.source_document_key, a.provider_date amendment_date, a.text_proven, a.current_base,
           count(s.source_document_key) candidates,
           count(s.source_document_key) filter (where s.provider_date is null) undated_candidates,
           max(s.provider_date) filter (where s.provider_date <= a.provider_date) latest_before
    from amendment a left join most_specific s on s.amendment_key = a.source_document_key
    group by a.source_document_key, a.provider_date, a.text_proven, a.current_base
  )
  select su.source_document_key,
         case
           when su.text_proven then su.current_base
           when su.candidates = 1 then (select s.source_document_key from most_specific s where s.amendment_key = su.source_document_key)
           when su.candidates > 1 and su.amendment_date is not null and su.undated_candidates = 0 and su.latest_before is not null
                and (select count(*) from most_specific s where s.amendment_key = su.source_document_key and s.provider_date = su.latest_before) = 1
             then (select s.source_document_key from most_specific s where s.amendment_key = su.source_document_key and s.provider_date = su.latest_before)
         end,
         case
           when su.text_proven then 'amendment_text'
           when su.candidates = 1 then 'name'
           when su.candidates > 1 then 'name_then_date'
         end,
         case
           when su.text_proven then null
           when su.candidates = 0 then 'no_text_named_by_amendment'
           when su.candidates = 1 then null
           when su.amendment_date is null then 'several_texts_named_amendment_undated'
           when su.undated_candidates > 0 then 'several_texts_named_some_undated'
           when su.latest_before is null then 'no_named_text_dated_before_amendment'
           when (select count(*) from most_specific s where s.amendment_key = su.source_document_key and s.provider_date = su.latest_before) > 1
             then 'two_named_texts_same_day'
         end,
         jsonb_build_object(
           'amendment_date', su.amendment_date,
           'candidates', (select coalesce(jsonb_agg(jsonb_build_object('key', s.source_document_key, 'stem', s.source_stem, 'date', s.provider_date) order by s.provider_sequence), '[]'::jsonb)
                          from most_specific s where s.amendment_key = su.source_document_key),
           'date_after_amendment', case when su.candidates = 1 then
              (select s.provider_date > su.amendment_date from most_specific s where s.amendment_key = su.source_document_key) end
         )
  from summary su
$$;

do $fix$
declare
  v_def text := pg_get_functiondef('public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure);
  v_old text; v_new text; v_n int;
begin
  if position('docket_amendment_base_evidence_v1' in v_def) > 0 then
    return;  -- already installed
  end if;
  if encode(sha256(convert_to(v_def,'UTF8')),'hex') <> 'd3c90085f6eac0d5cef604c108692d4a5bfe746f6b616ba2c6adc3ed77a43486' then
    raise exception 'docket_amendment_base_evidence_v1: register function is not the reviewed version; refusing';
  end if;

  -- E1 base from evidence, recalculated every run, receipted
  v_old := $o$  update public.docket_bill_source_document document
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
  v_new := $n$  -- base from evidence (docket_amendment_base_evidence_v1), recalculated on every run so
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
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'docket_amendment_base_evidence_v1: E1 matched % times', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  -- E2 contested amendments are never queued
  v_old := $o$      and not (version.document_family = 'amendment' and version.base_bill_version_id is null)
    on conflict (bill_version_id) do update set$o$;
  v_new := $n$      and not (version.document_family = 'amendment' and version.base_bill_version_id is null)
      -- Option A (Alexander, 2026-11-22): a base the evidence does not support stays recorded but is
      -- never queued for decomposition.
      and not exists (select 1 from public.docket_amendment_base_evidence_v1(p_source_bill_id) evidence
                      where evidence.source_document_key = version.source_document_key
                        and version.document_family = 'amendment'
                        and evidence.base_key is null)
    on conflict (bill_version_id) do update set$n$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'docket_amendment_base_evidence_v1: E2 matched % times', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  -- E3 hold the queue row of every contested amendment
  v_old := $o$    get diagnostics v_enqueued = row_count;
  end if;
$o$;
  v_new := $n$    get diagnostics v_enqueued = row_count;
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
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'docket_amendment_base_evidence_v1: E3 matched % times', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  execute v_def;
end
$fix$;

commit;
