export type recognition_condition_key =
  | "identity_as_distinct_people"
  | "community_continuity"
  | "political_authority"
  | "present_governing_document"
  | "descent_from_historical_tribe"
  | "unique_membership"
  | "no_congressional_termination"
  | "government_created_gap";

export type recognition_condition_status =
  | "met"
  | "substantially_met"
  | "disputed"
  | "blocked_by_government_action"
  | "requires_tribal_review"
  | "unknown";

export type recognition_pathway =
  | "doi_reconsideration"
  | "federal_court"
  | "congressional_action"
  | "administrative_petition"
  | "state_recognition"
  | "local_support_resolution"
  | "tribal_self_record"
  | "lighthouse_publication_after_approval";

export type recognition_forum =
  | "bia"
  | "department_of_interior"
  | "federal_court"
  | "congress"
  | "state"
  | "local_government"
  | "tribal_government"
  | "luminari_atlas_private_review"
  | "lighthouse_public_projection";

export type recognition_pattern_flag =
  | "recognized_then_reversed"
  | "displaced_then_penalized_for_discontinuity"
  | "state_recognized_federal_denied"
  | "treaty_present_recognition_denied"
  | "language_living_status_ignored"
  | "no_termination_but_not_listed"
  | "procedural_irregularity"
  | "requires_tribal_review";

export type recognition_condition_analysis = {
  condition_key: recognition_condition_key;
  condition_label: string;
  required_showing: string;
  tribe_evidence: string[];
  government_barrier_or_contradiction: string[];
  status: recognition_condition_status;
  why_gap_should_not_count_against_tribe: string;
  source_layer_keys: string[];
  source_urls: string[];
  recovered_thread_unverified: boolean;
};

export type route_to_recognition_profile = {
  tribe_id: string;
  tribe_name: string;
  tribe_self_name?: string;
  name_meaning?: string;
  recognition_status: string;
  current_forums: recognition_forum[];
  recognition_conditions: recognition_condition_analysis[];
  strongest_approval_arguments: string[];
  active_pathways: recognition_pathway[];
  pattern_flags: recognition_pattern_flag[];
  tribal_review_status: "private_draft" | "tribe_review" | "approved_for_lighthouse" | "published";
  publication_status: "admin_preview_only" | "public_pending" | "published_to_lighthouse" | "unpublished_by_tribe";
  comparison_unit_role: "anchor_tribe" | "comparison_tribe";
};

export type recognition_gideon_axis = {
  axis_key: recognition_condition_key | recognition_pattern_flag;
  axis_label: string;
  civil_gideon_parallel: string;
  recognition_gideon_question: string;
  why_it_matters: string;
};

export type witness_network_edge = {
  edge_id: string;
  source_tribe_id: string;
  target_tribe_id: string;
  shared_pattern_flags: recognition_pattern_flag[];
  notes: string;
  tribal_review_status: "draft" | "tribe_review" | "approved";
};
