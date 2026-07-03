export type write_authority =
  | "tribe_only"
  | "tribe_and_partner"
  | "read_only";

export type script_direction =
  | "ltr"
  | "rtl"
  | "ttb"
  | "mixed";

export type entry_type =
  | "word"
  | "phrase"
  | "place_name"
  | "personal_name"
  | "ceremonial_term"
  | "song_fragment"
  | "oral_history_passage"
  | "land_description"
  | "self_identifier"
  | "greeting"
  | "value_statement"
  | "ecological_term";

export type display_restriction =
  | "public"
  | "context_required"
  | "ceremonial_guard"
  | "tribe_permission";

export type language_entry = {
  entry_id: string;
  tribe_id: string;
  language_name: string;
  language_common_name: string;
  language_iso_code?: string;
  script_direction: script_direction;
  entry_type: entry_type;
  original_text: string;
  romanization?: string;
  english_gloss: string;
  extended_meaning?: string;
  usage_context?: string;
  display_restriction: display_restriction;
  source_url: string;
  authored_by: "tribe" | "tribal_linguist" | "academic_partner_approved_by_tribe";
  cast_date: string;
  immutable: true;
  deletion_policy: "never";
  override_policy: write_authority;
  verified_by_tribe: boolean;
  verification_date?: string;
  related_entries?: string[];
  notes?: string;
};

export type language_vitality_status =
  | "critically_endangered"
  | "severely_endangered"
  | "definitely_endangered"
  | "vulnerable"
  | "revitalization_active"
  | "stable";

export type language_program = {
  program_name: string;
  established_year: number;
  status: language_vitality_status;
  new_speakers_goal: string;
  program_home: string;
  partners?: string[];
  notes?: string;
};

export type place_name_entry = {
  entry_id: string;
  tribe_id: string;
  original_name: string;
  romanization?: string;
  english_imposed_name?: string;
  english_imposed_name_note: string;
  location_description: string;
  significance: string;
  waterway: boolean;
  current_status?: string;
  display_restriction: display_restriction;
  source_url: string;
  immutable: true;
  deletion_policy: "never";
  cast_date: string;
  verified_by_tribe: boolean;
};

export type language_preservation_layer = {
  tribe_id: string;
  language_name: string;
  language_common_name: string;
  language_iso_code?: string;
  vitality_status: language_vitality_status;
  program: language_program;
  entries: language_entry[];
  place_names: place_name_entry[];
  self_identifier_entry: language_entry;
  primary_declaration_entry: language_entry;
  meta: {
    layer_purpose: "permanent_language_preservation";
    write_authority: write_authority;
    immutable: true;
    deletion_policy: "never";
    schema_convention: "snake_case";
    created_date: string;
    last_updated: string;
    stewarded_by: "tribe_only";
    recovered_thread_unverified: boolean;
  };
};
