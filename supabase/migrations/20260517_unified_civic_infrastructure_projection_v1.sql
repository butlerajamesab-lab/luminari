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
from public.coalition_agencies;