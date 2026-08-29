-- The historical runtime legal-library view was created only when three
-- optional legacy sources shared one exact shape.  On a clean ledger those
-- sources are absent or incompatible, so expose an explicit empty contract
-- rather than leaving the relation undefined or fabricating legal records.

do $foundation$
begin
  if to_regclass('public.v_runtime_legal_library') is null then
    execute $view$
      create view public.v_runtime_legal_library
      with (security_invoker = true) as
      select
        null::text as record_type,
        null::text as display_title,
        null::text as citation,
        null::text as summary,
        null::text as source_url,
        null::timestamptz as created_at
      where false
    $view$;
  end if;
end
$foundation$;

revoke all on public.v_runtime_legal_library from public, anon, authenticated;
grant select on public.v_runtime_legal_library to service_role;

comment on view public.v_runtime_legal_library is
  'Fail-closed legal-library contract for clean replay when optional legacy legal sources are unavailable; zero rows is explicit and not a recovery claim.';
