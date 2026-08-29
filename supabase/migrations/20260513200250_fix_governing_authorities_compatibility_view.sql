-- The legacy source table predates complete migration tracking. Publish this
-- compatibility overlay only when the full source contract is present.
do $compatibility$
declare
  prerequisite_count integer;
  existing_kind "char";
begin
  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'legal_statute_clauses'
    and column_name = any(array[
      'id',
      'statuteId',
      'sectionNumber',
      'sectionName',
      'authority',
      'status',
      'createdAt',
      'updatedAt'
    ]);

  select c.relkind
    into existing_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'governing_authorities';

  if prerequisite_count = 8
     and (existing_kind is null or existing_kind = 'v') then
    execute $view$
      create or replace view public.governing_authorities as
      select
        id,
        "statuteId",
        "sectionNumber" as authority_reference,
        "sectionName" as authority_name,
        authority as authority_text,
        status,
        "createdAt",
        "updatedAt"
      from public.legal_statute_clauses
    $view$;

    comment on view public.governing_authorities is
      'Compatibility semantic overlay view. Non-destructive alias over legal_statute_clauses for gradual CDA domain-agnostic convergence.';
  end if;
end
$compatibility$;
