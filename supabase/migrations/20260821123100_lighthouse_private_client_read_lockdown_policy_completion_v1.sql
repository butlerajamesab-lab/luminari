begin;

-- Complete the private client-read containment batch. The preceding migration
-- revoked client privileges from these tables; remove the matching permissive
-- authenticated policies as defense in depth.

drop policy if exists authenticated_all_access_evidence_profiles on public.evidence_profiles;
drop policy if exists authenticated_all_access_evidence_sources on public.evidence_sources;
drop policy if exists authenticated_all_access_evidence_to_element_links on public.evidence_to_element_links;

commit;
