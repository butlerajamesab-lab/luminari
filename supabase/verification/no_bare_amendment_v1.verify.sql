-- Read-only verification for no_bare_amendment_v1 (Lighthouse).
select
  encode(sha256(convert_to(pg_get_functiondef('public.register_docket_legislative_version_spine(integer,boolean)'::regprocedure),'UTF8')),'hex')
    = 'd3c90085f6eac0d5cef604c108692d4a5bfe746f6b616ba2c6adc3ed77a43486' as register_function_is_installed_version,
  exists (select 1 from pg_trigger
          where tgrelid = 'public.civic_genome_bill_version'::regclass
            and tgname = 'civic_genome_bill_version_no_bare_amendment_v1'
            and tgdeferrable and tginitdeferred and tgenabled <> 'D') as guard_enabled_and_deferred,
  (select count(*) from public.civic_genome_legislative_version_queue q
     join public.civic_genome_bill_version v using (bill_version_id)
    where v.document_family = 'amendment' and v.base_bill_version_id is null
      and q.queue_state = 'eligible') as bare_amendments_eligible_in_queue;
