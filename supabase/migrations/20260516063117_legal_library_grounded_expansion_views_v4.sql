-- This historical view overlay was authored against a later legal_statutes
-- shape than a database rebuilt from the tracked migration ledger. Publish
-- the views only when their complete source contract exists; never invent
-- legal data columns or replace a non-view relation during replay.
do $compatibility$
declare
  prerequisite_count integer;
  grounded_kind "char";
  expanded_kind "char";
begin
  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'legal_statutes'
    and column_name = any(array[
      'id',
      'citation',
      'short_title',
      'jurisdiction',
      'domains',
      'summary',
      'verbatim_key_text',
      'source_url',
      'effective_date',
      'verification_status',
      'created_at'
    ]);

  select c.relkind
    into grounded_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_grounded_statutes';

  select c.relkind
    into expanded_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_legal_library_expanded';

  if prerequisite_count = 11
     and (grounded_kind is null or grounded_kind = 'v')
     and (expanded_kind is null or expanded_kind = 'v') then
    execute $view$
      create or replace view public.v_grounded_statutes as
      select
        s.id,
        s.citation,
        s.short_title as title,
        s.jurisdiction,
        s.domains as domain,
        s.summary,
        s.verbatim_key_text as full_text,
        s.source_url,
        s.effective_date,
        s.verification_status,
        s.created_at
      from public.legal_statutes s
    $view$;

    execute $view$
      create or replace view public.v_legal_library_expanded as
      select
        'statute' as entry_type,
        citation as primary_reference,
        title as entry_title,
        jurisdiction,
        domain,
        summary,
        full_text,
        source_url,
        verification_status as verification_state,
        created_at
      from public.v_grounded_statutes
    $view$;
  end if;
end
$compatibility$;
