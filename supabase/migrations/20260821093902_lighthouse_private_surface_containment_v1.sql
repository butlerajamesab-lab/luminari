begin;

-- Case material and documents are not a shared authenticated-user catalog.
drop policy if exists authenticated_all_access_cases on public.cases;
drop policy if exists authenticated_all_access_documents on public.documents;

revoke select on table public.cases, public.documents
  from anon, authenticated;

-- These views expose case, filing, or intake/provenance operational material.
-- They remain available to the server's service_role, but not through the Data API.
revoke select on table
  public.v_lighthouse_case_surface_status_v1,
  public.v_lighthouse_findings_case_coverage_v1,
  public.v_lighthouse_filing_catalog_v1,
  public.registry_record_provenance
from anon, authenticated;

commit;
