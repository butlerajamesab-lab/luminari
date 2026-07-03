import { duwamish_truth_seed } from "@/data/duwamish_truth_seed";
import type { duwamish_truth_layer } from "@/types/duwamish_truth_layer";

export type resolution_priority =
  | "truth_layer_first"
  | "external_only"
  | "conflict_surface";

export type resolution_context = {
  tribe_id: string;
  priority: resolution_priority;
  requested_layers?: Array<keyof duwamish_truth_layer>;
  include_source_refs: boolean;
  include_conflict_flags: boolean;
};

export type resolved_field<T> = {
  value: T;
  authored_by: "duwamish_tribe" | "bia" | "external_court" | "third_party";
  source_url: string;
  conflict_flag?: boolean;
  conflict_note?: string;
};

export type resolved_truth_record = {
  tribe_id: string;
  resolution_priority: resolution_priority;
  resolved_at: string;
  primary_declaration: resolved_field<string>;
  territorial_declaration: resolved_field<string>;
  tribe_self_name: resolved_field<string>;
  name_meaning: resolved_field<string>;
  oral_tradition_anchor: resolved_field<string>;
  homeland_waters: resolved_field<string[]>;
  present_day_member_territory: resolved_field<string[]>;
  treaty_name: resolved_field<string>;
  treaty_date: resolved_field<string>;
  signatory_position: resolved_field<string>;
  chief_name: resolved_field<string>;
  chief_lineage_note: resolved_field<string>;
  city_named_for_chief: resolved_field<string>;
  dispossession_events: resolved_field<string[]>;
  forced_removal_agent: resolved_field<string>;
  displacement_method: resolved_field<string>;
  recognition_current_status: resolved_field<string>;
  recognition_events_count: resolved_field<number>;
  recognition_granted_reversed: resolved_field<boolean>;
  reversal_agent: resolved_field<string>;
  lawsuit_filed_date: resolved_field<string>;
  lawsuit_court: resolved_field<string>;
  lawsuit_claims: resolved_field<string[]>;
  sex_discrimination_claim_present: resolved_field<boolean>;
  language_name: resolved_field<string>;
  language_program_active: resolved_field<boolean>;
  living_practices_count: resolved_field<number>;
  physical_home_address: resolved_field<string>;
  physical_home_public_access: resolved_field<boolean>;
  enrolled_members_approx: resolved_field<number>;
  canoe_journey_active: resolved_field<boolean>;
  mmiw_work_active: resolved_field<boolean>;
  land_status: resolved_field<string>;
  closing_statement: resolved_field<string>;
  ally_actions_count: resolved_field<number>;
};

function make_truth_field<T>(
  value: T,
  source_url: string,
  conflict_flag?: boolean,
  conflict_note?: string,
): resolved_field<T> {
  return {
    value,
    authored_by: "duwamish_tribe",
    source_url,
    ...(conflict_flag !== undefined && { conflict_flag }),
    ...(conflict_note !== undefined && { conflict_note }),
  };
}

export function resolve_truth_layer(
  context: resolution_context,
  seed: duwamish_truth_layer = duwamish_truth_seed,
): resolved_truth_record {
  const home_url = seed.layer_5_living_culture.physical_home.source.url;
  const treaty_url = seed.layer_1_treaty.source.url;
  const history_url = "https://www.duwamishtribe.org/history";
  const recognition_url = seed.layer_3_recognition_timeline.source.url;
  const lawsuit_url = seed.layer_4_lawsuit.source.url;
  const culture_url = seed.layer_5_living_culture.source.url;
  const ally_url = seed.layer_6_ally_call.source.url;
  const exile_url = seed.layer_2_dispossession.source.url;
  const identity_url = seed.layer_0_identity.source.url;
  const chief_url = seed.layer_1_treaty.signatory_chief.source.url;

  const recognition_reversal_conflict = context.include_conflict_flags;
  const recognition_reversal_note =
    "Clinton administration granted recognition in 2001; Bush administration reversed in 2002 — tribe asserts Congress never terminated their sovereignty and reversal was arbitrary and capricious (APA claim)";

  const sex_discrimination_conflict = context.include_conflict_flags;
  const sex_discrimination_note =
    "BIA criteria applied against a matrilineal tribe — tribe asserts this constitutes sex discrimination as membership descends primarily through Duwamish women";

  const dispossession_continuity_conflict = context.include_conflict_flags;
  const dispossession_continuity_note =
    "BIA 'continuous habitation' standard applied to land the U.S. Army burned in order to prevent return — the dispossession_events array is the structural answer to that standard";

  return {
    tribe_id: context.tribe_id,
    resolution_priority: context.priority,
    resolved_at: new Date().toISOString(),
    primary_declaration: make_truth_field(seed.layer_0_identity.primary_declaration, identity_url),
    territorial_declaration: make_truth_field(seed.layer_0_identity.territorial_declaration, identity_url),
    tribe_self_name: make_truth_field(seed.layer_0_identity.tribe_self_name, identity_url),
    name_meaning: make_truth_field(seed.layer_0_identity.name_meaning, identity_url),
    oral_tradition_anchor: make_truth_field(seed.layer_0_identity.oral_tradition_anchor, history_url),
    homeland_waters: make_truth_field(seed.layer_0_identity.homeland_waters, identity_url),
    present_day_member_territory: make_truth_field(seed.layer_0_identity.present_day_member_territory, history_url),
    treaty_name: make_truth_field(seed.layer_1_treaty.treaty_name, treaty_url),
    treaty_date: make_truth_field(seed.layer_1_treaty.treaty_date, treaty_url),
    signatory_position: make_truth_field(seed.layer_1_treaty.signatory_position, treaty_url),
    chief_name: make_truth_field(seed.layer_1_treaty.signatory_chief.name, chief_url),
    chief_lineage_note: make_truth_field(seed.layer_1_treaty.signatory_chief.lineage_note, chief_url),
    city_named_for_chief: make_truth_field(seed.layer_1_treaty.signatory_chief.city_named_for_him, chief_url),
    dispossession_events: make_truth_field(
      seed.layer_2_dispossession.events.map((event) => event.event_label),
      exile_url,
      dispossession_continuity_conflict,
      dispossession_continuity_note,
    ),
    forced_removal_agent: make_truth_field(
      seed.layer_2_dispossession.events.find((event) => event.event_label === "forced_removal_from_longhouses")?.agent ?? "unknown",
      exile_url,
      dispossession_continuity_conflict,
      dispossession_continuity_note,
    ),
    displacement_method: make_truth_field(
      seed.layer_2_dispossession.events.find((event) => event.event_label === "forced_removal_from_longhouses")?.method ?? "unknown",
      exile_url,
    ),
    recognition_current_status: make_truth_field(
      seed.layer_3_recognition_timeline.current_status,
      recognition_url,
      recognition_reversal_conflict,
      recognition_reversal_note,
    ),
    recognition_events_count: make_truth_field(seed.layer_3_recognition_timeline.events.length, recognition_url),
    recognition_granted_reversed: make_truth_field(
      seed.layer_3_recognition_timeline.events.some((event) => event.outcome === "reversed"),
      recognition_url,
      recognition_reversal_conflict,
      recognition_reversal_note,
    ),
    reversal_agent: make_truth_field(
      seed.layer_3_recognition_timeline.events.find((event) => event.outcome === "reversed")?.agent ?? "unknown",
      recognition_url,
      recognition_reversal_conflict,
      recognition_reversal_note,
    ),
    lawsuit_filed_date: make_truth_field(seed.layer_4_lawsuit.filed_date, lawsuit_url),
    lawsuit_court: make_truth_field(seed.layer_4_lawsuit.court, lawsuit_url),
    lawsuit_claims: make_truth_field(seed.layer_4_lawsuit.claims.map((claim) => claim.claim_label), lawsuit_url),
    sex_discrimination_claim_present: make_truth_field(
      seed.layer_4_lawsuit.claims.some((claim) => claim.claim_label === "equal_protection_sex_discrimination"),
      lawsuit_url,
      sex_discrimination_conflict,
      sex_discrimination_note,
    ),
    language_name: make_truth_field(seed.layer_5_living_culture.language.language_name, culture_url),
    language_program_active: make_truth_field(seed.layer_5_living_culture.language.program_established <= new Date().getFullYear(), culture_url),
    living_practices_count: make_truth_field(seed.layer_5_living_culture.living_practices.length, culture_url),
    physical_home_address: make_truth_field(seed.layer_5_living_culture.physical_home.address, home_url),
    physical_home_public_access: make_truth_field(seed.layer_5_living_culture.physical_home.public_access, home_url),
    enrolled_members_approx: make_truth_field(seed.layer_5_living_culture.enrolled_members_approx, history_url),
    canoe_journey_active: make_truth_field(seed.layer_5_living_culture.canoe_journey_active, culture_url),
    mmiw_work_active: make_truth_field(seed.layer_5_living_culture.mmiw_work_active, culture_url),
    land_status: make_truth_field(seed.layer_6_ally_call.land_status, ally_url),
    closing_statement: make_truth_field(seed.layer_6_ally_call.closing_statement, ally_url),
    ally_actions_count: make_truth_field(seed.layer_6_ally_call.ally_actions.length, ally_url),
  };
}

export function get_conflict_fields(record: resolved_truth_record): Array<{ field: string; conflict_note: string }> {
  return Object.entries(record)
    .filter(([, value]) =>
      typeof value === "object" &&
      value !== null &&
      "conflict_flag" in value &&
      value.conflict_flag === true,
    )
    .map(([field, value]) => ({
      field,
      conflict_note: (value as resolved_field<unknown>).conflict_note ?? "",
    }));
}
