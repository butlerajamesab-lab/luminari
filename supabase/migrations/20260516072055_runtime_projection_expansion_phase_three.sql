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
from public.legal_case_law;

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
from public.legal_enforcement;

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
from public.legal_workflow_deadlines;
