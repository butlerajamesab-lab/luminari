import { muwekma_truth_seed } from "@/data/muwekma_truth_seed";
import type { muwekma_truth_layer } from "@/types/muwekma_truth_layer";

export const muwekma_truth_seed_corrected: muwekma_truth_layer = {
  ...muwekma_truth_seed,
  layer_0_identity: {
    ...muwekma_truth_seed.layer_0_identity,
    tribe_self_name_source_posture: "verbatim_tribal_source",
    primary_declaration: "We are Muwekma and we are still here.",
    primary_declaration_source_posture: "verbatim_tribal_source",
    primary_declaration_citation: "https://www.muwekma.org",
    territorial_declaration: "requires_tribal_review",
    territorial_declaration_note: "Thámien is a Chochenyo place name for the Santa Clara Valley; the specific phrasing \"host people of Thámien\" has not been confirmed verbatim from tribal source material.",
    chochenyo_greeting: {
      chochenyo_greeting: "Makkin Mak Muwekma Wolwoolum, 'Akkoy Mak-Warep, Manne Mak Hiswi!",
      phonetic: "Mak-kin Mak Moo-WEK-ma Wol-WOO-lum, Ak-koy Mak-Wah-rep, Mahn-neh Mak Hees-wee",
      meaning: "We Are Muwekma Ohlone, Welcome To Our Land, Where We Are Born!",
      source_posture: "verbatim_tribal_source",
      citation: "https://www.muwekma.org",
    },
  },
  layer_2_dispossession: {
    ...muwekma_truth_seed.layer_2_dispossession,
    events: [
      ...muwekma_truth_seed.layer_2_dispossession.events.filter(
        (event) => event.event_label !== "omission_from_1978_federal_recognition_list",
      ),
      {
        event_label: "bia_1928_enrollment_misclassification",
        date_approx: "1928",
        agent: "Bureau of Indian Affairs",
        method: "Administrative misclassification",
        description: "BIA records classified Muwékma ancestors under a broad Costanoan label rather than by self-identified tribal affiliation on 1928 enrollment applications, obscuring distinct tribal identity in federal records.",
        evidence: "Three Muwékma family heads wrote Ohlones / Olanian on their applications — Lucas Marine (#10298), Joseph Francis Aleas (#10299), Bell Olivares-Nichols (#10300). Primary documents in National Archives microfilm PR(SF)NA Series I-32.",
        source_posture: "structured_extraction_from_tribal_affiliated_scholarly_source",
        citation: "Escobar, Field & Leventhal (1999). PR(SF)NA Microfilm Series I-32.",
      },
    ],
  },
  layer_3_recognition_timeline: {
    ...muwekma_truth_seed.layer_3_recognition_timeline,
    events: [
      { year: 1900, event_label: "federal_agents_identified_verona_band", outcome: "granted", agent: "Federal agents" },
      { year: 1905, event_label: "verona_band_of_alameda_county_federally_recognized", outcome: "granted" },
      {
        year: 1927,
        event_label: "administratively_dropped_by_dorrington",
        outcome: "denied",
        agent: "Sacramento BIA Superintendent Lafayette A. Dorrington",
        description: "Unilateral administrative action dropping California tribal communities from federal rolls without congressional termination.",
        citation: "https://www.muwekma.org/recognition-process.html · Escobar, Field & Leventhal (1999), citing Dorrington correspondence June 23, 1927, PR(SF)NA RG 75",
        source_posture: "structured_extraction_from_tribal_affiliated_scholarly_source",
      },
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
  },
};
