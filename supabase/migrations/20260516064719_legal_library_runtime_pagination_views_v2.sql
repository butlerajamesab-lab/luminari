-- These runtime views were authored against legal-library relations that
-- predate complete migration tracking. Publish each view only when its exact
-- source contract exists, and never replace a non-view relation.
do $compatibility$
declare
  prerequisite_count integer;
  target_kind "char";
begin
  select count(*)
    into prerequisite_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and c.relname = any(array[
      'legal_statutes',
      'legal_case_law',
      'legal_enforcement',
      'canonical_contradiction_registry',
      'weak_joint_triggers'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_legal_library_counts';

  if prerequisite_count = 5
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_legal_library_counts as
      select
        (select count(*) from public.legal_statutes) as statute_count,
        (select count(*) from public.legal_case_law) as case_law_count,
        (select count(*) from public.legal_enforcement) as enforcement_count,
        (select count(*) from public.canonical_contradiction_registry) as contradiction_count,
        (select count(*) from public.weak_joint_triggers) as weak_joint_count,
        now() as observed_at
    $view$;
  end if;

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
      'verification_status',
      'created_at'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_paginated_statutes';

  if prerequisite_count = 10
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_paginated_statutes as
      select
        row_number() over(order by created_at desc) as runtime_row,
        id,
        citation,
        short_title,
        jurisdiction,
        domains,
        summary,
        verbatim_key_text,
        source_url,
        verification_status,
        created_at
      from public.legal_statutes
    $view$;
  end if;

  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'legal_case_law'
    and column_name = any(array[
      'id',
      'case_name',
      'citation',
      'court',
      'jurisdiction',
      'summary',
      'source_url',
      'created_at'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_paginated_case_law';

  if prerequisite_count = 8
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_paginated_case_law as
      select
        row_number() over(order by created_at desc) as runtime_row,
        id,
        case_name,
        citation,
        court,
        jurisdiction,
        summary,
        source_url,
        created_at
      from public.legal_case_law
    $view$;
  end if;

  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'legal_enforcement'
    and column_name = any(array[
      'id',
      'agency_name',
      'jurisdiction',
      'domains',
      'statutory_authority',
      'complaint_url',
      'process_summary',
      'verification_status',
      'created_at'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_paginated_enforcement';

  if prerequisite_count = 9
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_paginated_enforcement as
      select
        row_number() over(order by created_at desc) as runtime_row,
        id,
        agency_name,
        jurisdiction,
        domains,
        statutory_authority,
        complaint_url,
        process_summary,
        verification_status,
        created_at
      from public.legal_enforcement
    $view$;
  end if;
end
$compatibility$;
