-- no_bare_amendment_v1 (Lighthouse wepxlinwbjrkqdzkqpar)
-- Rule: an amendment enters the Civic Genome corpus only together with its proven base text.
--
-- 1. register_docket_legislative_version_spine: three exact text edits (each asserted to match once)
--    E1  version insert skips amendment documents that have no base text document
--    E2  version queue never enqueues a base-less amendment (incl. the 16,622 legacy rows)
--    E3  receipt reports withheld_unbased_amendment_count
--    The Docket source record (docket_bill_source_document) is unchanged: Docket still observes
--    every amendment; it just doesn't become a Genome version until its base exists.
-- 2. Deferred constraint trigger on civic_genome_bill_version: at commit, refuses any NEW
--    base-less amendment row from ANY code path, and refuses removing the base from a based one.
--    Legacy base-less rows are left as they are (not deleted; cleanup is a separate decision).
--
-- Applied to production 2026-11-21 (PT). Re-running is a no-op.
-- Installed function sha256: d3c90085f6eac0d5cef604c108692d4a5bfe746f6b616ba2c6adc3ed77a43486
-- Original function sha256: 09494275832ec87ce7c6d3f16f0fc1a6811d23d1f4155341290bebf3e77cce74
-- Undo: 20261121110000_no_bare_amendment_v1.UNDO.sql
begin;

do $fix$
declare
  v_def text := pg_get_functiondef('public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure);
  v_old text; v_new text; v_n int;
begin
  -- Idempotent: already installed (applied to production 2026-11-21) -> nothing to do.
  if encode(sha256(convert_to(v_def,'UTF8')),'hex') = 'd3c90085f6eac0d5cef604c108692d4a5bfe746f6b616ba2c6adc3ed77a43486' then
    return;
  end if;
  if encode(sha256(convert_to(v_def,'UTF8')),'hex') <> '09494275832ec87ce7c6d3f16f0fc1a6811d23d1f4155341290bebf3e77cce74' then
    raise exception 'no_bare_amendment_v1: register function is not the reviewed version; refusing';
  end if;

  -- E1
  v_old := E'  from public.docket_bill_source_document document\n  where document.source_bill_id = p_source_bill_id\n  on conflict (genome_bill_id, source_document_key) do update set';
  v_new := E'  from public.docket_bill_source_document document\n  where document.source_bill_id = p_source_bill_id\n    -- no bare amendment: an amendment enters the corpus only together with its proven base text\n    and (document.document_family <> ''amendment'' or document.base_source_document_key is not null)\n  on conflict (genome_bill_id, source_document_key) do update set';
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'no_bare_amendment_v1: E1 matched % times', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  -- E2
  v_old := E'    where version.genome_bill_id = v_genome_bill_id\n      and version.processing_state not in (''verified'', ''verified_with_findings'')\n';
  v_new := E'    where version.genome_bill_id = v_genome_bill_id\n      and version.processing_state not in (''verified'', ''verified_with_findings'')\n      and not (version.document_family = ''amendment'' and version.base_bill_version_id is null)\n';
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'no_bare_amendment_v1: E2 matched % times', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  -- E3
  v_old := E'    ''queued_or_refreshed_count'', v_enqueued,';
  v_new := E'    ''withheld_unbased_amendment_count'', (select count(*) from public.docket_bill_source_document where source_bill_id = p_source_bill_id and document_family = ''amendment'' and base_source_document_key is null),\n    ''queued_or_refreshed_count'', v_enqueued,';
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_n <> 1 then raise exception 'no_bare_amendment_v1: E3 matched % times', v_n; end if;
  v_def := replace(v_def, v_old, v_new);

  execute v_def;
end
$fix$;

create or replace function public.civic_genome_bill_version_no_bare_amendment_v1() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_family text; v_base uuid;
begin
  -- Deferred: re-read the row as it stands at commit, not as it was at the event.
  select version.document_family, version.base_bill_version_id
    into v_family, v_base
  from public.civic_genome_bill_version version
  where version.bill_version_id = new.bill_version_id;
  if not found or v_family is distinct from 'amendment' or v_base is not null then
    return null;
  end if;
  if tg_op = 'INSERT'
     or old.base_bill_version_id is not null
     or old.document_family is distinct from 'amendment' then
    raise exception using
      errcode = '23514',
      message = 'civic_genome_bare_amendment_refused',
      detail = 'bill_version_id=' || new.bill_version_id || ' source_document_key=' || coalesce(new.source_document_key,'') ||
               ': an amendment version may exist only together with its proven base text version.';
  end if;
  return null;
end $$;

do $guard$ begin
  if not exists (select 1 from pg_trigger
                 where tgrelid = 'public.civic_genome_bill_version'::regclass
                   and tgname = 'civic_genome_bill_version_no_bare_amendment_v1') then
    create constraint trigger civic_genome_bill_version_no_bare_amendment_v1
      after insert or update of base_bill_version_id, document_family on public.civic_genome_bill_version
      deferrable initially deferred
      for each row execute function public.civic_genome_bill_version_no_bare_amendment_v1();
  end if;
end $guard$;

commit;
