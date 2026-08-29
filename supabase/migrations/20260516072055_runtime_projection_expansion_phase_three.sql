-- Legacy legal runtime tables were created outside the tracked migration
-- history. Keep a zero-based replay deterministic by publishing each view
-- only when its full source contract exists.
do $compatibility$
declare
  prerequisite_count integer;
  target_kind "char";
begin
  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'legal_case_law'
    and column_name = any(array[
      'id',
      'citation',
      'case_name',
      'jurisdiction',
      'domains',
      'year_decided',
      'court',
      'summary',
      'key_quotes',
      'source_url',
      'verification_status',
      'source_checked',
      'date_checked',
      'created_at'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_runtime_case_law';

  if prerequisite_count = 14
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_runtime_case_law as
      select
        id,
        citation,
        case_name,
        jurisdiction,
        domains,
        year_decided,
        court,
        summary,
        key_quotes,
        source_url,
        verification_status,
        source_checked,
        date_checked,
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
      'phone',
      'filing_deadline',
      'process_summary',
      'verification_status',
      'source_checked',
      'date_checked',
      'created_at'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_runtime_enforcement';

  if prerequisite_count = 13
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_runtime_enforcement as
      select
        id,
        agency_name,
        jurisdiction,
        domains,
        statutory_authority,
        complaint_url,
        phone,
        filing_deadline,
        process_summary,
        verification_status,
        source_checked,
        date_checked,
        created_at
      from public.legal_enforcement
    $view$;
  end if;

  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'legal_workflow_deadlines'
    and column_name = any(array[
      'id',
      'jurisdiction',
      'claim_type',
      'deadline_source_citation',
      'deadline_days',
      'deadline_description',
      'filing_body',
      'source_url',
      'verification_status',
      'source_checked',
      'date_checked',
      'created_at'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_runtime_deadlines';

  if prerequisite_count = 12
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_runtime_deadlines as
      select
        id,
        jurisdiction,
        claim_type,
        deadline_source_citation,
        deadline_days,
        deadline_description,
        filing_body,
        source_url,
        verification_status,
        source_checked,
        date_checked,
        created_at
      from public.legal_workflow_deadlines
    $view$;
  end if;
end
$compatibility$;
