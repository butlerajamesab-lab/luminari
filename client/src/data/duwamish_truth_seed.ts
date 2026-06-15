import type { duwamish_truth_layer, source_ref } from "@/types/duwamish_truth_layer";

const base_source: Omit<source_ref, "url" | "page_title"> = {
  source_domain: "duwamishtribe.org",
  retrieved_date: "2026-05-30",
  authored_by: "duwamish_tribe",
};

const make_source = (url: string, page_title: string): source_ref => ({
  ...base_source,
  url,
  page_title,
});

export const duwamish_truth_seed: duwamish_truth_layer = {
  layer_0_identity: {
    tribe_self_name: "dxʷdəwʔabš",
    name_meaning: "People of the Inside",
    anglicized_name: "Duwamish",
    primary_declaration: "WE ARE STILL HERE.",
    territorial_declaration: "We are the host tribe of Seattle",
    territorial_basis: "Time immemorial — oral traditions reference the last Ice Age",
    oral_tradition_anchor: "North Wind, South Wind — references the Ice Weir breaking over the Duwamish River",
    homeland_waters: ["Elliott Bay", "Duwamish River Watershed", "Black River", "Cedar River"],
    homeland_waters_source_posture: "structured_extraction_from_public_record",
    homeland_geography: "Seattle / Greater King County",
    present_day_member_territory: ["Seattle", "Burien", "Tukwila", "Renton", "Redmond"],
    source: make_source("https://www.duwamishtribe.org", "Duwamish Tribe — Home"),
  },

  layer_1_treaty: {
    treaty_name: "Treaty of Point Elliott",
    treaty_date: "1855",
    signatory_position: "First signatories — Chief Si'ahl signed first",
    signatory_chief: {
      name: "Si'ahl",
      birth_year: 1780,
      death_year: 1866,
      lineage_father: "Shweabe (Suquamish)",
      lineage_mother: "Sholeetsa (dxʷdəwʔabš)",
      lineage_note: "Inherited chieftainship matrilineally from maternal uncle",
      role: "Chief of dxʷdəwʔabš; led confederation of six central Puget Sound tribes",
      known_for: "Peaceful diplomacy; friendly relations between his people and European-American immigrants",
      city_named_for_him: "Seattle",
      source: make_source("https://www.duwamishtribe.org/chief-siahl", "Chief Si'ahl — Duwamish Tribe"),
    },
    largest_village_location: "Across from current Duwamish Longhouse site",
    village_fate: "Burned by settlers in 1895",
    source: make_source("https://www.duwamishtribe.org/treaty-of-point-elliott", "Treaty of Point Elliott — Duwamish Tribe"),
  },

  layer_2_dispossession: {
    events: [
      {
        event_label: "forced_removal_from_longhouses",
        agent: "United States Army and settlers",
        method: "Burning of Longhouses to prevent return to traditional homeland",
      },
      {
        event_label: "exile_to_ballast_island",
        description: "A bleak parcel of land devoid of fresh water and vital resources",
        outcome: "Island subsequently taken from Duwamish as well",
      },
      {
        event_label: "final_displacement_from_ballast_island",
        date_approx: "by 1917",
        description: "Presence of Native Americans on the island became a distant memory",
      },
      {
        event_label: "largest_village_burned",
        date_approx: "1895",
        agent: "Settlers",
        description: "Situated across from present-day Duwamish Longhouse site",
      },
    ],
    source: make_source("https://www.duwamishtribe.org/exile-to-ballast-island", "Exile to Ballast Island — Duwamish Tribe"),
  },

  layer_3_recognition_timeline: {
    events: [
      { year: 1925, event_label: "tribe_filed_suit_against_us_government", outcome: "granted" },
      { year: 1934, event_label: "positive_judgment_received", outcome: "granted" },
      { year: 1964, event_label: "government_payments_made_to_members", outcome: "granted" },
      { year: 1971, event_label: "congress_recognized_for_settlement_purposes", agent: "Congress", outcome: "granted" },
      { year: 1978, event_label: "first_petition_for_federal_recognition_filed", outcome: "filed" },
      { year: 1983, event_label: "duwamish_tribal_services_dts_established", outcome: "filed" },
      { year: 2001, event_label: "acknowledgement_granted_clinton_administration", agent: "Clinton Administration", outcome: "granted" },
      { year: 2002, event_label: "recognition_reversed_bush_administration", agent: "Bush Administration", outcome: "reversed" },
      { year: 2015, event_label: "appeal_filed_interior_board_of_indian_appeals", outcome: "filed" },
      { year: 2022, month: "May", event_label: "lawsuit_filed_us_district_court_western_district_washington", outcome: "filed" },
      { year: 2023, month: "December", event_label: "department_of_interior_requested_remand", agent: "Department of Interior", outcome: "pending" },
      { year: 2024, month: "January", event_label: "tribe_opposed_remand", outcome: "opposed" },
    ],
    current_status: "active_lawsuit",
    source: make_source("https://www.duwamishtribe.org/federal-recognition", "Federal Acknowledgement — Duwamish Tribe"),
  },

  layer_4_lawsuit: {
    filed_date: "2022-05-11",
    court: "U.S. District Court for the Western District of Washington",
    defendant: "Department of the Interior",
    claims: [
      {
        claim_label: "compel_listing",
        legal_basis: "Congress never terminated tribal sovereignty; Department legally obligated to list the tribe",
      },
      {
        claim_label: "equal_protection_sex_discrimination",
        legal_basis: "Tribe is matrilineal; membership descends primarily from Duwamish women; Department discriminated on basis of sex",
      },
      {
        claim_label: "due_process",
        legal_basis: "No formal hearing before depriving tribe of property interests tied to prior recognition",
      },
      {
        claim_label: "apa_violation",
        legal_basis: "Department refusal is arbitrary, capricious, abuse of discretion, outside statutory authority",
        statute_or_doctrine: "Administrative Procedure Act",
      },
    ],
    current_procedural_status: "Court deciding whether to grant remand or address substantive legal arguments",
    source: make_source("https://www.duwamishtribe.org/lawsuit-for-federal-recognition", "Lawsuit for Federal Recognition — Duwamish Tribe"),
  },

  layer_5_living_culture: {
    language: {
      language_name: "tʷəlšucid",
      common_name: "Lushootseed",
      program_name: "Duwamish Language Program",
      program_established: 2002,
      program_purpose: "Revitalize language and create new speakers; incorporated into the Longhouse",
      source: make_source("https://www.duwamishtribe.org/culture-today", "Culture Today — Duwamish Tribe"),
    },
    living_practices: [
      {
        practice_name: "potlatch",
        description: "Traditional gatherings for giving, inter-tribal community binding, and honoring members",
        cultural_significance: "Venue for personal, family, and tribal decisions; sharing of food, ancestral songs, and dance",
      },
      {
        practice_name: "oral_history_and_storytelling",
        description: "Foundation for healthy decision-making",
        cultural_significance: "Reinforces ethics of generosity, kindness, hard work, and good health",
      },
      {
        practice_name: "canoeing",
        description: "Traditional canoes for hunting, fishing, gathering, and trade",
        cultural_significance: "Described as 'a home on the water' — same rules of proper conduct as in a home",
      },
      {
        practice_name: "weaving_and_carving",
        description: "Essential skills for clothing, baskets, tools, structures",
        cultural_significance: "Weaving ties members to nature; carving fundamental to traditional homes and canoes",
      },
      {
        practice_name: "traditional_health_and_medicine",
        description: "Herbal medicines; diet of salmon, shellfish, roots, berries",
        cultural_significance: "Emphasizes physical, mental, and spiritual well-being",
      },
      {
        practice_name: "song_and_dance",
        description: "Songs express love, strength, blessings — function as prayers",
        cultural_significance: "Drum described as 'the heartbeat of the First People'",
      },
      {
        practice_name: "the_home",
        description: "Cedar planked houses organized in extended family units",
        cultural_significance: "Sacred space for security, balance, mental and spiritual health",
      },
    ],
    physical_home: {
      name: "Duwamish Longhouse and Cultural Center",
      address: "4705 W Marginal Way SW, Seattle, WA 98106",
      historical_note: "Situated across from their largest historical village, which was burned by settlers in 1895",
      hours: "Tuesday–Saturday 10AM–5PM",
      public_access: true,
      functions: ["tribal_headquarters", "museum", "art_gallery", "ceremonial_space", "cultural_center"],
      source: make_source("https://www.duwamishtribe.org/visit-longhouse", "Visit the Longhouse — Duwamish Tribe"),
    },
    enrolled_members_approx: 600,
    canoe_journey_active: true,
    environmental_coalition: "Duwamish River Community Coalition (DRCC) — founding member",
    mmiw_work_active: true,
    source: make_source("https://www.duwamishtribe.org/culture-today", "Culture Today — Duwamish Tribe"),
  },

  layer_6_ally_call: {
    template_text: "I would like to acknowledge that we are on the traditional land of the first people of Seattle, the Duwamish People past and present and honor with gratitude the land itself and the Duwamish Tribe.",
    land_status: "unceded",
    ally_actions: [
      {
        action_label: "real_rent_duwamish",
        description: "Voluntary rent payment to the original landholders of Seattle",
        url: "https://www.realrentduwamish.org/",
      },
      {
        action_label: "sign_federal_recognition_petition",
        description: "Sign the Change.org petition in support of federal recognition",
        url: "https://www.change.org/p/federal-recognition-for-the-duwamish-tribe",
      },
      {
        action_label: "organizational_endorsement",
        description: "Have your organization submit an endorsement form for the tribe's acknowledgement efforts",
        url: "https://docs.google.com/forms/d/e/1FAIpQLSd3BSJaUQIbeQYsyyIm3htbSJt3cvSalFcg0tQPCkkgWivzCA/viewform",
      },
      {
        action_label: "advocate_with_elected_officials",
        description: "Contact local and federal representatives — request they meet tribal leaders and introduce resolutions of support",
      },
      {
        action_label: "visit_the_longhouse",
        description: "Visit the Duwamish Longhouse and Cultural Center for exhibits and events",
        url: "https://www.duwamishtribe.org/visit-longhouse",
      },
    ],
    closing_statement: "We are still here.",
    source: make_source("https://www.duwamishtribe.org/stand-with-the-duwamish", "Stand with the Duwamish — Duwamish Tribe"),
  },

  meta: {
    schema_version: "1.0.0",
    truth_layer_version: "duwamish_seed_v1",
    all_data_authored_by: "duwamish_tribe",
    schema_convention: "snake_case",
    last_sourced: "2026-05-30",
    recovered_thread_unverified: true,
  },
};