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

const home_source = make_source("https://www.muwekma.org", "Muwekma Ohlone Tribe — Home");
const recognition_source = make_source("https://www.muwekma.org/recognition-process.html", "Federal Recognition Process — Muwekma Ohlone Tribe");
const timeline_source = make_source("https://www.muwekma.org/historical-timeline.html", "Historical Timeline — Muwekma Ohlone Tribe");
const foundation_source = make_source("https://www.muwekmafoundation.org", "Muwekma Ohlone Preservation Foundation", "muwekmafoundation.org", "muwekma_affiliated_source");

export const muwekma_truth_seed_corrected: muwekma_truth_layer = {
  layer_0_identity: {
    tribe_self_name: "Muwékma",
    tribe_self_name_source_posture: "verbatim_tribal_source",
    name_meaning: "Those Who Walk Forward",
    anglicized_name: "Muwekma Ohlone",
    primary_declaration: "We are Muwekma and we are still here.",
    primary_declaration_source_posture: "verbatim_tribal_source",
    primary_declaration_citation: home_source.url,
    territorial_declaration: "requires_tribal_review",
    territorial_declaration_note: "Thámien is a Chochenyo place name for the Santa Clara Valley; the specific phrasing remains locked for tribal review.",
    territorial_basis: "Time immemorial — ancestral villages around the South and East Bay",
    oral_tradition_anchor: "Muwékma — the people who walk forward along the river and creek systems of the South and East Bay",
    homeland_waters: ["Guadalupe River", "Coyote Creek", "Alameda Creek", "Arroyo de la Laguna"],
    homeland_geography: "San José / Santa Clara / Fremont / Pleasanton / Livermore / South and East Bay",
    present_day_member_territory: ["San José", "Santa Clara", "Fremont", "Pleasanton", "Livermore", "Sunol"],
    chochenyo_greeting: {
      chochenyo_greeting: "Makkin Mak Muwekma Wolwoolum, 'Akkoy Mak-Warep, Manne Mak Hiswi!",
      phonetic: "Mak-kin Mak Moo-WEK-ma Wol-WOO-lum, Ak-koy Mak-Wah-rep, Mahn-neh Mak Hees-wee",
      meaning: "We Are Muwekma Ohlone, Welcome To Our Land, Where We Are Born!",
      source_posture: "verbatim_tribal_source",
      citation: home_source.url,
    },
    source: home_source,
  },

  layer_1_treaty: {
    treaty_name: "No ratified treaty with the Muwékma Ohlone Tribe / Verona Band of Alameda County",
    treaty_date: "Not applicable",
    signatory_position: "No treaty-signatory chief recorded in this source packet",
    source: recognition_source,
  },

  layer_2_dispossession: {
    events: [
      { event_label: "missionization_and_reduccion", agent: "Spanish mission system" },
      { event_label: "epidemic_disease_and_mass_mortality", agent: "Introduced diseases" },
      { event_label: "mexican_secularization_and_rancho_grants", agent: "Mexican government" },
      { event_label: "gold_rush_state_dispossession_policies", agent: "California state government and settlers" },
      {
        event_label: "bia_1928_enrollment_misclassification",
        date_approx: "1928",
        agent: "Bureau of Indian Affairs",
        method: "Administrative misclassification",
        evidence: "Lucas Marine (#10298), Joseph Francis Aleas (#10299), and Bell Olivares-Nichols (#10300) application records are cited in the tribal-affiliated scholarly source.",
        source_posture: "structured_extraction_from_tribal_affiliated_scholarly_source",
        citation: "Escobar, Field & Leventhal (1999). PR(SF)NA Microfilm Series I-32.",
      },
    ],
    source: timeline_source,
  },

  layer_3_recognition_timeline: {
    events: [
      { year: 1900, event_label: "federal_agents_identified_verona_band", outcome: "granted", agent: "Federal agents" },
      { year: 1905, event_label: "verona_band_of_alameda_county_federally_recognized", outcome: "granted" },
      { year: 1927, event_label: "administratively_dropped_by_dorrington", outcome: "denied", agent: "Sacramento BIA Superintendent Lafayette A. Dorrington", citation: recognition_source.url, source_posture: "structured_extraction_from_tribal_affiliated_scholarly_source" },
      { year: 1980, event_label: "petition_for_federal_acknowledgment_filed", outcome: "filed" },
      { year: 1989, event_label: "tribal_council_passed_resolution_to_petition", outcome: "filed", agent: "Muwékma Tribal Council" },
      { year: 1990, event_label: "interior_concluded_muwekma_is_historic_and_previously_recognized", outcome: "granted", agent: "Department of the Interior" },
      { year: 1995, event_label: "petition_submitted_to_bia", outcome: "filed", date: "January 25, 1995", citation: recognition_source.url },
      { year: 1996, event_label: "bia_positive_determination_previous_unambiguous_federal_recognition", outcome: "granted", date: "May 24, 1996", basis: "25 CFR 83.8", citation: recognition_source.url },
      { year: 1998, event_label: "placed_on_ready_status", outcome: "pending", date: "March 1998", citation: recognition_source.url },
      { year: 1999, event_label: "lawsuit_filed_against_interior_over_wait_time", outcome: "filed", citation: recognition_source.url },
      { year: 2002, event_label: "bia_denied_acknowledgment_final_determination", outcome: "denied", agent: "Bureau of Indian Affairs", date: "September 6, 2002", citation: "https://www.bia.gov/as-ia/ofa/resolved/muwekma-ohlone-tribe", case: "OFA #111" },
      { year: 2009, event_label: "muwekma_ohlone_v_salazar_litigation_begins", outcome: "filed" },
      { year: 2013, event_label: "dc_circuit_upheld_bia_denial", outcome: "denied", agent: "D.C. Circuit" },
      { year: 2021, event_label: "muwekma_ohlone_preservation_foundation_established", outcome: "filed" },
      { year: 2024, event_label: "trail_of_truth_ride_across_nation", outcome: "filed" },
    ],
    current_status: "previously_identified_then_omitted_denied",
    current_status_source_posture: "structured_extraction_from_tribal_source",
    current_status_citation: recognition_source.url,
    source: recognition_source,
  },

  layer_4_lawsuit: {
    filed_date: "2009-01-01",
    court: "United States Court of Appeals for the D.C. Circuit",
    defendant: "Department of the Interior",
    claims: [
      { claim_label: "judicial_declaration", legal_basis: "Historical recognition by federal agents and Interior's prior-recognition framing" },
      { claim_label: "compel_listing", legal_basis: "Congress never terminated tribal sovereignty; Department is legally obligated to list them" },
      { claim_label: "equal_protection", legal_basis: "Interior treated the Tribe differently from other California tribes whose status was reaffirmed" },
      { claim_label: "due_process", legal_basis: "No formal hearing before deprivation of interests tied to prior recognition" },
      { claim_label: "apa_violation", legal_basis: "Department refusal is arbitrary, capricious, an abuse of discretion, and outside statutory authority" },
    ],
    current_procedural_status: "D.C. Circuit upheld Interior's denial in Muwekma Ohlone Tribe v. Salazar",
    source: recognition_source,
  },

  layer_5_living_culture: {
    language: {
      language_name: "Chochenyo",
      common_name: "Chochenyo Ohlone",
      program_name: "Muwekma language and cultural revitalization",
      program_established: 2000,
      program_purpose: "Revitalize language and cultural practices; incorporate into community life and education",
      source: foundation_source,
    },
    living_practices: [
      { practice_name: "cultural_revitalization", description: "Language, art, culinary practices, dance, regalia, and other aspects", cultural_significance: "Contemporary cultural revitalization continues to this day" },
      { practice_name: "oral_history_and_teaching", description: "Oral traditions and community teachings", cultural_significance: "Foundation for decision-making and continuity" },
      { practice_name: "environmental_stewardship", description: "Work with watersheds and lands in the South and East Bay", cultural_significance: "Connection to ancestral homelands" },
    ],
    physical_home: {
      name: "Muwekma Ohlone community and family networks",
      address: "San José / Santa Clara / Fremont / Pleasanton / Livermore / Sunol and surrounding Bay Area",
      historical_note: "Ancestral villages and territories around the South and East Bay, including Thámien",
      hours: "Community-based; not a single public building",
      public_access: false,
      functions: ["community_organizing", "cultural_preservation", "advocacy", "education"],
      source: home_source,
    },
    enrolled_members_approx: 600,
    canoe_journey_active: false,
    environmental_coalition: "Muwekma Ohlone Preservation Foundation and allied watershed groups",
    mmiw_work_active: false,
    source: foundation_source,
  },

  layer_6_ally_call: {
    template_text: "I would like to acknowledge that we are on the traditional land of the Muwékma Ohlone Tribe, the host people of Thámien, and honor with gratitude the land itself and the Muwekma Ohlone people past and present.",
    land_status: "unceded",
    ally_actions: [
      { action_label: "support_federal_recognition", description: "Support the Tribe's recognition process and reaffirmation work", url: recognition_source.url },
      { action_label: "adopt_land_acknowledgement", description: "Institutions can adopt land acknowledgements that name the Muwékma Ohlone Tribe", url: foundation_source.url },
      { action_label: "support_muwekma_stewardship", description: "Back Muwékma-led stewardship work within their homeland", url: foundation_source.url },
      { action_label: "fund_muwekma_led_projects", description: "Contribute directly to the Muwekma Ohlone Preservation Foundation", url: foundation_source.url },
      { action_label: "engage_elected_officials", description: "Urge elected officials to acknowledge the Tribe and support legislative solutions", url: recognition_source.url },
    ],
    closing_statement: "We are still here.",
    source: home_source,
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
