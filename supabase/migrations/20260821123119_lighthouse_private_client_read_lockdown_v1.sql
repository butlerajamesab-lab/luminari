begin;

-- First client-read containment batch for Lighthouse private workspace data.
-- The browser's Supabase client is used for authentication; case, evidence,
-- intake, and benefit operations execute through server-side tRPC/database
-- routes with explicit application ownership checks. Do not expose these
-- underlying records directly to anon or authenticated PostgREST clients.
--
-- This change deliberately does not alter public civic/resource catalogs or
-- any Civic Genome, Atlas, Rosetta, Prism, or Kaleidoscope contract.

do $containment$
declare
  v_table_name text;
  v_policy_name text;
  v_relation regclass;
begin
  foreach v_table_name in array array[
    'audit_trail',
    'benefit_applications',
    'case_collaborators',
    'case_exit_guarantees',
    'case_narratives',
    'cases',
    'cda_documents',
    'cda_evidence_gaps',
    'chat_messages',
    'checklist_items',
    'claims',
    'document_correlations',
    'documents',
    'entities',
    'events',
    'evidence',
    'evidence_event_links',
    'evidence_graph_edges',
    'evidence_items',
    'evidence_profiles',
    'evidence_proof_links',
    'evidence_sources',
    'evidence_to_element_links',
    'findings',
    'intake_promotion_log',
    'intake_records',
    'intake_routing_logic',
    'intake_staging',
    'map_intake_sessions',
    'quotes',
    'relationships',
    'share_links',
    'upload_sessions',
    'user_feedback',
    'users'
  ]
  loop
    v_relation := to_regclass(format('public.%I', v_table_name));
    if v_relation is not null then
      execute format(
        'revoke all privileges on table %s from anon, authenticated',
        v_relation
      );
    end if;
  end loop;

  for v_table_name, v_policy_name in
    select policy.table_name, policy.policy_name
    from (values
      ('audit_trail', 'authenticated_all_access_audit_trail'),
      ('benefit_applications', 'authenticated_all_access_benefit_applications'),
      ('case_collaborators', 'authenticated_all_access_case_collaborators'),
      ('case_exit_guarantees', 'authenticated_all_access_case_exit_guarantees'),
      ('case_narratives', 'authenticated_all_access_case_narratives'),
      ('cda_documents', 'authenticated_all_access_cda_documents'),
      ('cda_evidence_gaps', 'authenticated_all_access_cda_evidence_gaps'),
      ('chat_messages', 'authenticated_all_access_chat_messages'),
      ('checklist_items', 'authenticated_all_access_checklist_items'),
      ('claims', 'authenticated_all_access_claims'),
      ('document_correlations', 'authenticated_all_access_document_correlations'),
      ('events', 'authenticated_all_access_events'),
      ('evidence', 'authenticated_all_access_evidence'),
      ('evidence_event_links', 'authenticated_all_access_evidence_event_links'),
      ('evidence_graph_edges', 'authenticated_all_access_evidence_graph_edges'),
      ('evidence_items', 'authenticated_all_access_evidence_items'),
      ('evidence_proof_links', 'authenticated_all_access_evidence_proof_links'),
      ('findings', 'authenticated_all_access_findings'),
      ('intake_promotion_log', 'auth_read_intake_promotion_log'),
      ('intake_records', 'authenticated_all_access_intake_records'),
      ('intake_routing_logic', 'authenticated_all_access_intake_routing_logic'),
      ('intake_staging', 'auth_read_intake_staging'),
      ('map_intake_sessions', 'authenticated_all_access_map_intake_sessions'),
      ('quotes', 'authenticated_all_access_quotes'),
      ('relationships', 'authenticated_all_access_relationships'),
      ('share_links', 'authenticated_all_access_share_links'),
      ('upload_sessions', 'authenticated_all_access_upload_sessions'),
      ('user_feedback', 'authenticated_all_access_user_feedback'),
      ('users', 'authenticated_all_access_users')
    ) as policy(table_name, policy_name)
  loop
    v_relation := to_regclass(format('public.%I', v_table_name));
    if v_relation is not null then
      execute format(
        'drop policy if exists %I on %s',
        v_policy_name,
        v_relation
      );
    end if;
  end loop;
end
$containment$;

commit;
