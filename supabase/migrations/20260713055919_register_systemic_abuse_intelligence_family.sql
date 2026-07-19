
INSERT INTO luminari_document_family_contracts (
  family_key,
  family_name,
  scope_description,
  required_object_classes,
  expected_runtime_consumers,
  canonical_destination_notes,
  is_active,
  created_at,
  updated_at
) VALUES (
  'systemic_abuse_intelligence',
  'Systemic Abuse Intelligence Series',
  'Ten-document series mapping institutional and corporate abuse mechanisms that harm vulnerable people navigating broken systems. Each document targets one mechanism of harm: wrongful incarceration, pharmaceutical abuse, corporate landlord predation, financial predation, dark money and political corruption, antitrust and monopoly abuse, regulatory capture, gig economy worker exploitation, data privacy and algorithmic discrimination, and environmental injustice. Documents are intentionally narrow and digestible -- one problem, one pathway, one door. Architecture matches the Condition Ecosystem Registry: narrative body with canonical structured appendix keyed by resource_id for direct Supabase ingest. SOL callouts on every relevant entry. VERIFIED / UNVERIFIED status on every resource. Designed for people with no legal background navigating systems designed to defeat them.',
  ARRAY[
    'abuse_mechanism_metadata',
    'resource_cards',
    'contact_points',
    'filing_pathways',
    'sol_deadlines',
    'statutory_authority',
    'enforcement_agencies',
    'watchdog_organizations',
    'legal_aid_referrals',
    'accountability_pathways',
    'jurisdiction_overlays',
    'provenance_spans'
  ],
  ARRAY[
    'v_ui_intake_routing_v1',
    'v_ui_workflow_router_v1',
    'v_ui_legal_library_v1',
    'v_ui_registry_quality_v1',
    'v_ui_civic_map_v2'
  ],
  'Extract to: abuse_mechanism_entities (canonical_id = resource_id), resource_contact_points, filing_pathway_nodes, deadline_rules, legal_authority_nodes, accountability_pathway_edges. Cross-reference to condition_ecosystem_registry where abuse mechanism intersects with population-specific harm (e.g., pharmaceutical abuse + disability, landlord predation + housing deep dive). Family key: systemic_abuse_intelligence. Series revision: v1.0. Build order: (1) wrongful_incarceration_accountability, (2) pharmaceutical_abuse, (3) corporate_landlord_predation, (4) financial_predation, (5) dark_money_political_corruption, (6) antitrust_monopoly, (7) regulatory_capture, (8) gig_economy_worker_exploitation, (9) data_privacy_algorithmic_discrimination, (10) environmental_injustice.',
  true,
  now(),
  now()
);
