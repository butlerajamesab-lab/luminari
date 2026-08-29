-- This activation step depends on civic and legal tables created outside the
-- tracked ledger. Preserve its replacement semantics only when the complete
-- source contracts exist; otherwise leave the replayed schema untouched.
do $compatibility$
declare
  registry_column_count integer;
  normalized_column_count integer;
  legal_statute_column_count integer;
  case_law_column_count integer;
  enforcement_column_count integer;
  target_kind "char";
begin
  select count(*)
    into registry_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'registry_programs'
    and column_name = any(array[
      'id',
      'name_rp',
      'category_rp',
      'agency_rp',
      'jurisdiction_id_rp',
      'website_rp',
      'contact_rp',
      'created_at_rp'
    ]);

  select count(*)
    into normalized_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'normalized_civic_resource'
    and column_name = any(array[
      'id',
      'name',
      'resource_type',
      'organization_name',
      'state',
      'website_url',
      'phone',
      'created_at'
    ]);

  if registry_column_count = 8
     and normalized_column_count = 8 then
    select c.relkind
      into target_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'v_civic_map_runtime';

    if target_kind is not null and target_kind <> 'v' then
      raise exception 'public.v_civic_map_runtime exists and is not a view';
    end if;

    select c.relkind
      into target_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'v_unified_civic_circulation';

    if target_kind is not null and target_kind <> 'v' then
      raise exception 'public.v_unified_civic_circulation exists and is not a view';
    end if;

    drop view if exists public.v_civic_map_runtime cascade;
    drop view if exists public.v_unified_civic_circulation cascade;

    execute $view$
      create view public.v_unified_civic_circulation as
      select
        id::text as canonical_id,
        name_rp::text as display_name,
        category_rp::text as resource_category,
        agency_rp::text as organization,
        jurisdiction_id_rp::text as jurisdiction_id,
        website_rp::text as website,
        contact_rp::text as contact,
        to_timestamp(created_at_rp) as created_at,
        'registry_program'::text as source_layer
      from public.registry_programs

      union all

      select
        id::text as canonical_id,
        name::text as display_name,
        resource_type::text as resource_category,
        organization_name::text as organization,
        state::text as jurisdiction_id,
        website_url::text as website,
        phone::text as contact,
        created_at,
        'normalized_civic_resource'::text as source_layer
      from public.normalized_civic_resource
    $view$;

    execute $view$
      create view public.v_civic_map_runtime as
      select
        canonical_id,
        display_name,
        resource_category,
        organization,
        jurisdiction_id,
        website,
        contact,
        created_at,
        source_layer
      from public.v_unified_civic_circulation
    $view$;
  end if;

  select count(*)
    into legal_statute_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'legal_statutes'
    and column_name = any(array[
      'short_title',
      'citation',
      'summary',
      'source_url',
      'created_at'
    ]);

  select count(*)
    into case_law_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'v_runtime_case_law'
    and column_name = any(array[
      'case_name',
      'citation',
      'summary',
      'source_url',
      'created_at'
    ]);

  select count(*)
    into enforcement_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'v_runtime_enforcement'
    and column_name = any(array[
      'agency_name',
      'statutory_authority',
      'process_summary',
      'complaint_url',
      'created_at'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_runtime_legal_library';

  if legal_statute_column_count = 5
     and case_law_column_count = 5
     and enforcement_column_count = 5
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_runtime_legal_library as
      select
        'statute'::text as record_type,
        coalesce(short_title, citation)::text as display_title,
        citation::text as citation,
        summary::text as summary,
        source_url::text as source_url,
        created_at
      from public.legal_statutes

      union all

      select
        'case_law'::text as record_type,
        coalesce(case_name, citation)::text as display_title,
        citation::text as citation,
        summary::text as summary,
        source_url::text as source_url,
        created_at
      from public.v_runtime_case_law

      union all

      select
        'enforcement'::text as record_type,
        agency_name::text as display_title,
        statutory_authority::text as citation,
        process_summary::text as summary,
        complaint_url::text as source_url,
        created_at
      from public.v_runtime_enforcement
    $view$;
  end if;
end
$compatibility$;
