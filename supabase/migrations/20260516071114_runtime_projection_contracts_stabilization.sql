-- These projections depend on legacy runtime tables that were not captured
-- by the historical migration ledger. Publish each contract only when every
-- referenced source column exists, without fabricating data-bearing tables.
do $compatibility$
declare
  prerequisite_count integer;
  target_kind "char";
begin
  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'unified_resources'
    and column_name = any(array[
      'id',
      'sourceTable',
      'sourceId',
      'name',
      'description',
      'resourceType',
      'domain',
      'needTypes',
      'urgencyLevel',
      'jurisdictionId',
      'jurisdictionType',
      'stateCode',
      'phone',
      'website',
      'email',
      'address',
      'hardEligibility',
      'softSignals',
      'matchingPipelineTypes',
      'lastVerifiedAt',
      'isActive',
      'category',
      'agency',
      'eligibilityNotes',
      'applyNotes',
      'createdAt',
      'updatedAt',
      'verificationStatus'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_runtime_resources';

  if prerequisite_count = 28
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_runtime_resources as
      select
        id,
        "sourceTable" as source_table,
        "sourceId" as source_id,
        name as resource_name,
        description,
        "resourceType" as resource_type,
        domain,
        "needTypes" as need_types,
        "urgencyLevel" as urgency_level,
        "jurisdictionId" as jurisdiction_id,
        "jurisdictionType" as jurisdiction_type,
        "stateCode" as state_code,
        phone,
        website,
        email,
        address,
        "hardEligibility" as hard_eligibility,
        "softSignals" as soft_signals,
        "matchingPipelineTypes" as matching_pipeline_types,
        "lastVerifiedAt" as last_verified_at,
        "isActive" as is_active,
        category,
        agency,
        "eligibilityNotes" as eligibility_notes,
        "applyNotes" as apply_notes,
        "createdAt" as created_at,
        "updatedAt" as updated_at,
        "verificationStatus" as verification_status
      from public.unified_resources
    $view$;
  end if;

  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'v_runtime_resources'
    and column_name = any(array[
      'resource_type',
      'state_code',
      'is_active'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_runtime_resource_metrics';

  if prerequisite_count = 3
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_runtime_resource_metrics as
      select
        resource_type,
        count(*) as total_resources,
        count(distinct state_code) as states_covered,
        count(*) filter (where is_active = 1) as active_resources
      from public.v_runtime_resources
      group by resource_type
    $view$;
  end if;

  select count(*)
    into prerequisite_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'upload_sessions'
    and column_name = any(array[
      'id',
      'caseId',
      'userId',
      'totalFiles',
      'completedFiles',
      'failedFiles',
      'duplicateFiles',
      'sessionStatus',
      'createdAt',
      'updatedAt'
    ]);

  select c.relkind
    into target_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_runtime_active_uploads';

  if prerequisite_count = 10
     and (target_kind is null or target_kind = 'v') then
    execute $view$
      create or replace view public.v_runtime_active_uploads as
      select
        id,
        "caseId" as case_id,
        "userId" as user_id,
        "totalFiles" as total_files,
        "completedFiles" as completed_files,
        "failedFiles" as failed_files,
        "duplicateFiles" as duplicate_files,
        "sessionStatus" as session_status,
        "createdAt" as created_at,
        "updatedAt" as updated_at,
        case
          when "sessionStatus" in ('completed','failed','cancelled') then false
          else true
        end as actively_processing
      from public.upload_sessions
    $view$;
  end if;
end
$compatibility$;
