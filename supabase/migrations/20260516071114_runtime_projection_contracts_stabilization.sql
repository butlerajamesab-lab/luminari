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
from public.unified_resources;

create or replace view public.v_runtime_resource_metrics as
select
  resource_type,
  count(*) as total_resources,
  count(distinct state_code) as states_covered,
  count(*) filter (where is_active = 1) as active_resources
from public.v_runtime_resources
group by resource_type;

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
from public.upload_sessions;
