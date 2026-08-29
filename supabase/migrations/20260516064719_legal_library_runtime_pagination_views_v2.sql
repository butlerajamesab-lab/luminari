create or replace view public.v_legal_library_counts as
select
  (select count(*) from public.legal_statutes) as statute_count,
  (select count(*) from public.legal_case_law) as case_law_count,
  (select count(*) from public.legal_enforcement) as enforcement_count,
  (select count(*) from public.canonical_contradiction_registry) as contradiction_count,
  (select count(*) from public.weak_joint_triggers) as weak_joint_count,
  now() as observed_at;

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
from public.legal_statutes;

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
from public.legal_case_law;

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
from public.legal_enforcement;
