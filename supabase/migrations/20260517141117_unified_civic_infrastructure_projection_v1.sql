-- These three civic source relations predate complete migration tracking.
-- Publish the union only when all participating source contracts exist.
do $compatibility$
declare
  enforcement_column_count integer;
  legal_aid_column_count integer;
  coalition_column_count integer;
  target_kind "char";
begin
  select count(*)
    into enforcement_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'legal_enforcement_records'
    and column_name = any(array[
      'id',
      'agencyName',
      'jurisdiction',
      'complaintType',
      'patternDescription'
    ]);

  select count(*)
    into legal_aid_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'legal_aid_organizations'
    and column_name = any(array[
      'id',
      'organization',
      'jurisdiction_name',
      'claim_types',
      'notes'
    ]);

  select count(*)
    into coalition_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'coalition_agencies'
    and column_name = any(array[
      'id',
      'name',
      'agency_type',
      'state',
      'domains',
      'notes'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_unified_civic_infrastructure';

  if enforcement_column_count = 5
     and legal_aid_column_count = 5
     and coalition_column_count = 6
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_unified_civic_infrastructure as
      select
        'enforcement_' || id::text as node_id,
        "agencyName" as name,
        'enforcement' as node_type,
        jurisdiction,
        "complaintType" as domains,
        "patternDescription" as description,
        'legal_enforcement_records' as source_table
      from public.legal_enforcement_records
      union all
      select
        'legal_aid_' || id::text as node_id,
        organization as name,
        'legal_aid' as node_type,
        jurisdiction_name as jurisdiction,
        claim_types as domains,
        notes as description,
        'legal_aid_organizations' as source_table
      from public.legal_aid_organizations
      union all
      select
        'coalition_' || id::text as node_id,
        name,
        agency_type as node_type,
        state as jurisdiction,
        domains,
        notes as description,
        'coalition_agencies' as source_table
      from public.coalition_agencies
    $view$;
  end if;
end
$compatibility$;
