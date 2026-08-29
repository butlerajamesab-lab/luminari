begin;

-- First client-read containment batch for Lighthouse private workspace data.
-- The browser's Supabase client is used for authentication; case, evidence,
-- intake, and benefit operations execute through server-side tRPC/database
-- routes with explicit application ownership checks. Do not expose these
-- underlying records directly to anon or authenticated PostgREST clients.
--
-- This change deliberately does not alter public civic/resource catalogs or
-- any Civic Genome, Atlas, Rosetta, Prism, or Kaleidoscope contract.

revoke all privileges on table
  public.audit_trail,
  public.benefit_applications,
  public.case_collaborators,
  public.case_exit_guarantees,
  public.case_narratives,
  public.cases,
  public.cda_documents,
  public.cda_evidence_gaps,
  public.chat_messages,
  public.checklist_items,
  public.claims,
  public.document_correlations,
  public.documents,
  public.entities,
  public.events,
  public.evidence,
  public.evidence_event_links,
  public.evidence_graph_edges,
  public.evidence_items,
  public.evidence_profiles,
  public.evidence_proof_links,
  public.evidence_sources,
  public.evidence_to_element_links,
  public.findings,
  public.intake_promotion_log,
  public.intake_records,
  public.intake_routing_logic,
  public.intake_staging,
  public.map_intake_sessions,
  public.quotes,
  public.relationships,
  public.share_links,
  public.upload_sessions,
  public.user_feedback,
  public.users
from anon, authenticated;

drop policy if exists authenticated_all_access_audit_trail on public.audit_trail;
drop policy if exists authenticated_all_access_benefit_applications on public.benefit_applications;
drop policy if exists authenticated_all_access_case_collaborators on public.case_collaborators;
drop policy if exists authenticated_all_access_case_exit_guarantees on public.case_exit_guarantees;
drop policy if exists authenticated_all_access_case_narratives on public.case_narratives;
drop policy if exists authenticated_all_access_cda_documents on public.cda_documents;
drop policy if exists authenticated_all_access_cda_evidence_gaps on public.cda_evidence_gaps;
drop policy if exists authenticated_all_access_chat_messages on public.chat_messages;
drop policy if exists authenticated_all_access_checklist_items on public.checklist_items;
drop policy if exists authenticated_all_access_claims on public.claims;
drop policy if exists authenticated_all_access_document_correlations on public.document_correlations;
drop policy if exists authenticated_all_access_events on public.events;
drop policy if exists authenticated_all_access_evidence on public.evidence;
drop policy if exists authenticated_all_access_evidence_event_links on public.evidence_event_links;
drop policy if exists authenticated_all_access_evidence_graph_edges on public.evidence_graph_edges;
drop policy if exists authenticated_all_access_evidence_items on public.evidence_items;
drop policy if exists authenticated_all_access_evidence_proof_links on public.evidence_proof_links;
drop policy if exists authenticated_all_access_findings on public.findings;
drop policy if exists auth_read_intake_promotion_log on public.intake_promotion_log;
drop policy if exists authenticated_all_access_intake_records on public.intake_records;
drop policy if exists authenticated_all_access_intake_routing_logic on public.intake_routing_logic;
drop policy if exists auth_read_intake_staging on public.intake_staging;
drop policy if exists authenticated_all_access_map_intake_sessions on public.map_intake_sessions;
drop policy if exists authenticated_all_access_quotes on public.quotes;
drop policy if exists authenticated_all_access_relationships on public.relationships;
drop policy if exists authenticated_all_access_share_links on public.share_links;
drop policy if exists authenticated_all_access_upload_sessions on public.upload_sessions;
drop policy if exists authenticated_all_access_user_feedback on public.user_feedback;
drop policy if exists authenticated_all_access_users on public.users;

commit;
