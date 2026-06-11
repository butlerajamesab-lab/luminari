export type source_posture =
  | "verbatim_tribal_source"
  | "structured_extraction_from_tribal_source"
  | "structured_extraction_from_public_record"
  | "structured_extraction_from_tribal_affiliated_scholarly_source"
  | "tribe_affiliated_source"
  | "external_source"
  | "lighthouse_analysis_pending_tribal_review";

export type source_ref = {
  url: string;
  page_title: string;
  source_domain: "duwamishtribe.org";
  retrieved_date: string;
  authored_by: "duwamish_tribe";
  source_posture?: source_posture;
};

export type identity_core = {
  tribe_self_name: string;
  name_meaning: string;
  anglicized_name: string;
  primary_declaration: string;
  territorial_declaration: string;
  territorial_basis: string;
  oral_tradition_anchor: string;
  homeland_waters: string[];
  homeland_waters_source_posture?: source_posture;
  homeland_geography: string;
  present_day_member_territory: string[];
  source: source_ref;
};

export type dispossession_event = {
  event_label: string;
  date_approx?: string;
  agent?: string;
  method?: string;
  description?: string;
  outcome?: string;
};

export type dispossession_record = {
  events: dispossession_event[];
  source: source_ref;
};

export type chief_record = {
  name: string;
  birth_year: number;
  death_year: number;
  lineage_father: string;
  lineage_mother: string;
  lineage_note: string;
  role: string;
  known_for: string;
  city_named_for_him: string;
  source: source_ref;
};

export type treaty_record = {
  treaty_name: string;
  treaty_date: string;
  signatory_position: string;
  signatory_chief: chief_record;
  largest_village_location: string;
  village_fate: string;
  source: source_ref;
};

export type recognition_event = {
  year: number;
  month?: string;
  event_label: string;
  outcome?: "granted" | "denied" | "reversed" | "filed" | "pending" | "opposed";
  agent?: string;
};

export type recognition_timeline = {
  events: recognition_event[];
  current_status: "active_lawsuit" | "pending_remand" | "denied" | "recognized";
  source: source_ref;
};

export type lawsuit_claim = {
  claim_label: string;
  legal_basis: string;
  statute_or_doctrine?: string;
};

export type lawsuit_record = {
  filed_date: string;
  court: string;
  defendant: string;
  claims: lawsuit_claim[];
  current_procedural_status: string;
  source: source_ref;
};

export type language_record = {
  language_name: string;
  common_name: string;
  program_name: string;
  program_established: number;
  program_purpose: string;
  source: source_ref;
};

export type living_practice = {
  practice_name: string;
  description: string;
  cultural_significance: string;
};

export type physical_home = {
  name: string;
  address: string;
  historical_note: string;
  hours: string;
  public_access: boolean;
  functions: string[];
  source: source_ref;
};

export type culture_record = {
  language: language_record;
  living_practices: living_practice[];
  physical_home: physical_home;
  enrolled_members_approx: number;
  canoe_journey_active: boolean;
  environmental_coalition: string;
  mmiw_work_active: boolean;
  source: source_ref;
};

export type ally_action = {
  action_label: string;
  description: string;
  url?: string;
};

export type land_acknowledgement_record = {
  template_text: string;
  land_status: "unceded";
  ally_actions: ally_action[];
  closing_statement: string;
  source: source_ref;
};

export type duwamish_truth_layer = {
  layer_0_identity: identity_core;
  layer_1_treaty: treaty_record;
  layer_2_dispossession: dispossession_record;
  layer_3_recognition_timeline: recognition_timeline;
  layer_4_lawsuit: lawsuit_record;
  layer_5_living_culture: culture_record;
  layer_6_ally_call: land_acknowledgement_record;
  meta: {
    schema_version: string;
    truth_layer_version: string;
    all_data_authored_by: "duwamish_tribe";
    schema_convention: "snake_case";
    last_sourced: string;
    recovered_thread_unverified: boolean;
  };
};
