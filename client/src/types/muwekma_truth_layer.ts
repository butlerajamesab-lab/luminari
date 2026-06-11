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
  source_domain: "muwekma.org" | "muwekmafoundation.org" | "unicornriot.ninja" | "bia.gov";
  retrieved_date: string;
  authored_by: "muwekma_tribe" | "muwekma_affiliated_source" | "external_source";
  source_posture?: source_posture;
};

export type chochenyo_greeting_record = {
  chochenyo_greeting: string;
  phonetic: string;
  meaning: string;
  source_posture: source_posture;
  citation: string;
};

export type identity_core = {
  tribe_self_name: string;
  tribe_self_name_source_posture?: source_posture;
  name_meaning: string;
  anglicized_name: string;
  primary_declaration: string;
  primary_declaration_source_posture?: source_posture;
  primary_declaration_citation?: string;
  territorial_declaration: string;
  territorial_declaration_note?: string;
  territorial_basis: string;
  oral_tradition_anchor: string;
  homeland_waters: string[];
  homeland_geography: string;
  present_day_member_territory: string[];
  chochenyo_greeting?: chochenyo_greeting_record;
  source: source_ref;
};

export type dispossession_event = {
  event_label: string;
  date_approx?: string;
  agent?: string;
  method?: string;
  description?: string;
  outcome?: string;
  evidence?: string;
  citation?: string;
  source_posture?: source_posture;
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
  city_named_for_him?: string;
  source: source_ref;
};

export type treaty_record = {
  treaty_name: string;
  treaty_date: string;
  signatory_position: string;
  signatory_chief?: chief_record;
  source: source_ref;
};

export type recognition_event = {
  year: number;
  month?: string;
  event_label: string;
  outcome?: "granted" | "denied" | "reversed" | "filed" | "pending" | "opposed";
  agent?: string;
  date?: string;
  description?: string;
  basis?: string;
  citation?: string;
  case?: string;
  source_posture?: source_posture;
};

export type recognition_timeline = {
  events: recognition_event[];
  current_status: "active_lawsuit" | "pending_remand" | "denied" | "recognized" | "previously_identified_then_omitted_denied";
  current_status_source_posture?: source_posture;
  current_status_citation?: string;
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

export type muwekma_truth_layer = {
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
    all_data_authored_by: "muwekma_tribe";
    schema_convention: "snake_case";
    last_sourced: string;
    recovered_thread_unverified: boolean;
  };
};
