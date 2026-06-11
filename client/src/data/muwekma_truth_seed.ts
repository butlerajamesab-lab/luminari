import type { muwekma_truth_layer, source_ref } from "@/types/muwekma_truth_layer";

const base_source: Omit<source_ref, "url" | "page_title" | "source_domain" | "authored_by"> = {
  retrieved_date: "2026-06-08",
};

const make_source = (
  url: string,
  page_title: string,
  source_domain: source_ref["source_domain"] = "muwekma.org",
  authored_by: source_ref["authored_by"] = "muwekma_tribe",
): source_ref => ({
  ...base_source,
  url,
  page_title,
  source_domain,
  authored_by,
});

export const muwekma_truth_seed: muwekma_truth_layer = {
  layer_0_identity: {
    tribe_self_name: "Muwékma",
    tribe_self_name_source_posture: "verbatim_tribal_source",
    name_meaning: "Those Who Walk Forward",
    anglicized_name: "Muwekma Ohlone",
    primary_declaration: "We are Muwekma and we are still here.",
    primary_declaration_source_posture: "verbatim_tribal_source",
    primary_declaration_citation: "https://www.muwekma.org",
    territorial_declaration: "requires_tribal_review",
    territorial_declaration_note: "Thámien is a Chochenyo place name for the Santa Clara Valley; the specific phrasing \"host people of Thámien\" has not been confirmed verbatim from tribal source material.",
    territorial_basis: "Time immemorial — oral traditions reference ancestral villages around the South and East Bay",
    oral_tradition_anchor: "Muwékma — the people who walk forward along the river and creek systems of the South and East Bay: Guadalupe River, Coyote Creek, Alameda Creek",
    homeland_waters: ["Guadalupe River", "Coyote Creek", "Alameda Creek", "Arroyo de la Laguna"],
    homeland_geography: "San José / Santa Clara / Fremont / Pleasanton / Livermore / South and East Bay",
    present_day_member_territory: ["San José", "Santa Clara", "Fremont", "Pleasanton", "Livermore", "Sunol"],
    chochenyo_greeting: {
      chochenyo_greeting: "Makkin Mak Muwekma Wolwoolum, 'Akkoy Mak-Warep, Manne Mak Hiswi!",
      phonetic: "Mak-kin Mak Moo-WEK-ma Wol-WOO-lum, Ak-koy Mak-Wah-rep, Mahn-neh Mak Hees-wee",
      meaning: "We Are Muwekma Ohlone, Welcome To Our Land, Where We Are Born!",
      source_posture: "verbatim_tribal_source",
      citation: "https://www.muwekma.org",
    },
    source: make_source("https://www.muwekma.org", "Muwekma Ohlone Tribe — Home"),
  },

  layer_1_treaty: {
    treaty_name: "No ratified treaty with the Muwékma Ohlone Tribe / Verona Band of Alameda County",
    treaty_date: "Not applicable — no ratified treaty ceding Muwékma homelands to the United States",
    signatory_position: "No treaty-signatory chief recorded; the United States exercised power over homelands without a ratified treaty",
    source: make_source("https://www.muwekma.org/recognition-process.html", "Federal Recognition Process — Muwekma Ohlone Tribe"),
  },

  layer_2_dispossession: {
    events: [
      {
        event_label: "missionization_and_reduccion",
        agent: "Spanish Franciscan mission system",
        method: "Reducción from ancestral villages into Mission compounds (Mission Santa Clara, Mission San José, Mission Dolores)",
        description: "Native people were encouraged or forced to abandon ancestral villages and resettle permanently at missions",
      },
      {
        event_label: "epidemic_disease_and_mass_mortality",
        agent: "Introduced diseases",
        description: "Unsanitary conditions, dietary changes, disease, hard labor, and violent treatment devastated Native life",
        outcome: "California Native population fell from over 300,000 to about 20,000 by the early 20th century",
      },
      {
        event_label: "mexican_secularization_and_rancho_grants",
        agent: "Mexican government",
        method: "Secularization of missions and conversion of mission lands into private ranchos",
        description: "Mission lands were subdivided into non-religious land parcels, largely awarded to non-Native Californios",
        outcome: "This would never come to pass for Native communities in many cases",
      },
      {
        event_label: "gold_rush_violence_and_state_extermination_policies",
        agent: "California state government and settlers",
        method: "Vigilante violence, bounty-funded campaigns, and state-sanctioned extermination",
        description: "Explicit extermination policies starting during the Gold Rush",
        outcome: "Further devastation of Native life and land decimation",
      },
      {
        event_label: "bia_1928_enrollment_misclassification",
        date_approx: "1928",
        agent: "Bureau of Indian Affairs",
        method: "Administrative misclassification",
        description: "BIA classified Muwékma ancestors as \"Costanoan\" rather than by their self-identified tribal affiliation on 1928 enrollment applications, obscuring distinct tribal identity in federal records.",
        evidence: "Three Muwékma family heads wrote \"Ohlones\" / \"Olanian\" on their applications — Lucas Marine (#10298), Joseph Francis Aleas (#10299), Bell Olivares-Nichols (#10300). Primary documents in National Archives microfilm PR(SF)NA Series I-32.",
        source_posture: "structured_extraction_from_tribal_affiliated_scholarly_source",
        citation: "Escobar, Field & Leventhal (1999). PR(SF)NA Microfilm Series I-32.",
      },
    ],
    source: make_source("https://www.muwekma.org/historical-timeline.html", "Historical Timeline — Muwekma Ohlone Tribe"),
  },

  layer_3_recognition_timeline: {
    events: [
      { year: 1900, event_label: "federal_agents_identified_verona_band", outcome: "granted", agent: "Federal agents" },
      { year: 1905, event_label: "verona_band_of_alameda_county_federally_recognized", outcome: "granted" },
      { year: 1927, event_label: "administratively_dropped_by_dorrington", outcome: "denied", agent: "Sacramento BIA Superintendent Lafayette A. Dorrington", description: "Unilateral unauthorized administrative action dropping 135+ California tribal communities from federal rolls. No congressional termination.", citation: "https://www.muwekma.org/recognition-process.html · Escobar, Field & Leventhal (1999), citing Dorrington correspondence June 23, 1927, PR(SF)NA RG 75", source_posture: "structured_extraction_from_tribal_affiliated_scholarly_source" },
      { year: 1980, event_label: "petition_for_federal_acknowledgment_filed", outcome: "filed" },
      { year: 1989, event_label: "tribal_council_passed_resolution_to_petition", outcome: "filed", agent: "Muwékma Tribal Council" },
      { year: 1990, event_label: "interior_concluded_muwekma_is_historic_and_previously_recognized", outcome: "granted", agent: "Department of the Interior" },
      { year: 1995, event_label: "petition_submitted_to_bia", outcome: "filed", date: "January 25, 1995", citation: "https://www.muwekma.org/recognition-process.html" },
      { year: 1996, event_label: "bia_positive_determination_previous_unambiguous_federal_recognition", outcome: "granted", date: "May 24, 1996", basis: "25 CFR 83.8", citation: "https://www.muwekma.org/recognition-process.html" },
      { year: 1998, event_label: "placed_on_ready_status", outcome: "pending", date: "March 1998", description: "22nd on waiting list", citation: "https://www.muwekma.org/recognition-process.html" },
      { year: 1999, event_label: "lawsuit_filed_against_interior_over_wait_time", outcome: "filed", citation: "https://www.muwekma.org/recognition-process.html" },
      { year: 2002, event_label: "bia_denied_acknowledgment_final_determination", outcome: "denied", agent: "Bureau of Indian Affairs", date: "September 6, 2002", citation: "https://www.bia.gov/as-ia/ofa/resolved/muwekma-ohlone-tribe", case: "OFA #111" },
      { year: 2009, event_label: "muwekma_ohlone_v_salazar_litigation_begins", outcome: "filed" },
      { year: 2013, event_label: "dc_circuit_upheld_bia_denial", outcome: "denied", agent: "D.C. Circuit" },
      { year: 2021, event_label: "muwekma_ohlone_preservation_foundation_established", outcome: "filed" },
      { year: 2024, event_label: "trail_of_truth_ride_across_nation", outcome: "filed" },
    ],
    current_status: "previously_identified_then_omitted_denied",
    current_status_source_posture: "structured_extraction_from_tribal_source",
    current_status_citation: "https://www.muwekma.org/recognition-process.html",
    source: make_source("https://www.muwekma.org/recognition-process.html", "Federal Recognition Process — Muwekma Ohlone Tribe"),
  },

  layer_4_lawsuit: {
    filed_date: "2009-01-01",
    court: "United States Court of Appeals for the D.C. Circuit (appellate review of D.C. District Court decision)",
    defendant: "Department of the Interior",
    claims: [
      {
        claim_label: "judicial_declaration",
        legal_basis: "Historical recognition by federal agents and Interior's confirmation that Muwékma is a historic and previously recognized tribe",
      },
      {
        claim_label: "compel_listing",
        legal_basis: "Congress never terminated tribal sovereignty; Department is legally obligated to list them",
      },
      {
        claim_label: "equal_protection",
        legal_basis: "Interior treated the Tribe differently from other California tribes whose status was reaffirmed",
      },
      {
        claim_label: "due_process",
        legal_basis: "No formal hearing was provided before depriving them of property interests tied to prior recognition",
      },
      {
        claim_label: "apa_violation",
        legal_basis: "Department's refusal is arbitrary, capricious, an abuse of discretion, and outside statutory authority",
      },
    ],
    current_procedural_status: "D.C. Circuit upheld Interior's denial in Muwekma Ohlone Tribe v. Salazar",
    source: make_source("https://www.muwekma.org/recognition-process.html", "Federal Recognition Process — Muwekma Ohlone Tribe"),
  },

  layer_5_living_culture: {
    language: {
      language_name: "Chochenyo",
      common_name: "Chochenyo Ohlone",
      program_name: "Muwekma language and cultural revitalization",
      program_established: 2000,
      program_purpose: "Revitalize language and cultural practices; incorporate into community life and education",
      source: make_source("https://www.muwekmafoundation.org", "Muwekma Ohlone Preservation Foundation", "muwekmafoundation.org", "muwekma_affiliated_source"),
    },
    living_practices: [
      {
        practice_name: "cultural_revitalization",
        description: "Language, art, culinary practices, dance, regalia, and other aspects",
        cultural_significance: "Contemporary cultural revitalization continues to this day",
      },
      {
        practice_name: "oral_history_and_teaching",
        description: "Oral traditions and community teachings",
        cultural_significance: "Foundation for decision-making and continuity",
      },
      {
        practice_name: "environmental_stewardship",
        description: "Work with watersheds and lands in the South and East Bay",
        cultural_significance: "Connection to ancestral homelands",
      },
    ],
    physical_home: {
      name: "Muwekma Ohlone community and family networks",
      address: "San José / Santa Clara / Fremont / Pleasanton / Livermore / Sunol and surrounding Bay Area",
      historical_note: "Ancestral villages and territories around the South and East Bay, including Thámien",
      hours: "Community-based; not a single public building",
      public_access: false,
      functions: ["community_organizing", "cultural_preservation", "advocacy", "education"],
      source: make_source("https://www.muwekma.org", "Muwekma Ohlone Tribe — Home"),
    },
    enrolled_members_approx: 600,
    canoe_journey_active: false,
    environmental_coalition: "Muwekma Ohlone Preservation Foundation and allied watershed groups",
    mmiw_work_active: false,
    source: make_source("https://www.muwekmafoundation.org", "Muwekma Ohlone Preservation Foundation", "muwekmafoundation.org", "muwekma_affiliated_source"),
  },

  layer_6_ally_call: {
    template_text: "I would like to acknowledge that we are on the traditional land of the Muwékma Ohlone Tribe, the host people of Thámien, and honor with gratitude the land itself and the Muwekma Ohlone people past and present.",
    land_status: "unceded",
    ally_actions: [
      {
        action_label: "support_federal_recognition",
        description: "Support the Tribe's demand to fix the federal acknowledgment process and reaffirm Muwékma's status",
        url: "https://www.muwekma.org/recognition-process.html",
      },
      {
        action_label: "adopt_land_acknowledgement",
        description: "Institutions can adopt land acknowledgements that name the Muwékma Ohlone Tribe and situate themselves on Thámien",
        url: "https://www.muwekmafoundation.org",
      },
      {
        action_label: "support_muwekma_stewardship",
        description: "Back efforts by the Tribe to become steward of public lands within their homeland",
        url: "https://www.muwekmafoundation.org",
      },
      {
        action_label: "fund_muwekma_led_projects",
        description: "Contribute directly to the Muwekma Ohlone Preservation Foundation",
        url: "https://www.muwekmafoundation.org",
      },
      {
        action_label: "engage_elected_officials",
        description: "Urge elected officials to acknowledge the Tribe and support legislative solutions to reaffirm status",
        url: "https://www.muwekma.org/recognition-process.html",
      },
      {
        action_label: "support_trail_of_truth",
        description: "Attend public Muwékma-hosted events such as Trail of Truth rides",
        url: "https://unicornriot.ninja/2024/muwekma-ohlone-tribe-rides-across-the-nation-for-federal-recognition-in-trail-of-truth/",
      },
    ],
    closing_statement: "We are still here.",
    source: make_source("https://www.muwekma.org", "Muwekma Ohlone Tribe — Home"),
  },

  meta: {
    schema_version: "1.0",
    truth_layer_version: "1.0",
    all_data_authored_by: "muwekma_tribe",
    schema_convention: "snake_case",
    last_sourced: "2026-06-08",
    recovered_thread_unverified: true,
  },
};
