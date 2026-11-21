-- UNDO for no_bare_amendment_v1. Restores the register function byte-for-byte
-- (verified against original sha256 09494275...) and removes the guard trigger.
begin;
drop trigger if exists civic_genome_bill_version_no_bare_amendment_v1 on public.civic_genome_bill_version;
drop function if exists public.civic_genome_bill_version_no_bare_amendment_v1();

do $undo$
declare
  v_def text := pg_get_functiondef('public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure);
begin
  v_def := replace(v_def, E'\n    -- no bare amendment: an amendment enters the corpus only together with its proven base text\n    and (document.document_family <> ''amendment'' or document.base_source_document_key is not null)', '');
  v_def := replace(v_def, E'\n      and not (version.document_family = ''amendment'' and version.base_bill_version_id is null)', '');
  v_def := replace(v_def, E'    ''withheld_unbased_amendment_count'', (select count(*) from public.docket_bill_source_document where source_bill_id = p_source_bill_id and document_family = ''amendment'' and base_source_document_key is null),\n', '');
  execute v_def;
  if encode(sha256(convert_to(pg_get_functiondef('public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure),'UTF8')),'hex')
     <> '09494275832ec87ce7c6d3f16f0fc1a6811d23d1f4155341290bebf3e77cce74' then
    raise exception 'no_bare_amendment_v1 undo: restored function does not match original sha256';
  end if;
end
$undo$;
commit;
