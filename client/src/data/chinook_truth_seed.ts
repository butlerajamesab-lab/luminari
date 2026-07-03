export type chinook_source_posture =
  | "verbatim_tribal_source"
  | "structured_extraction_from_tribal_source"
  | "structured_extraction_from_public_record"
  | "external_source"
  | "lighthouse_analysis_pending_tribal_review";

export type chinook_source_ref = {
  url: string;
  page_title: string;
  source_domain: "chinooknation.org" | "chinookjustice.org" | "treaties.okstate.edu" | "federalregister.gov";
  retrieved_date: string;
  authored_by: "chinook_tribe" | "federal_record" | "external_treaty_archive" | "luminari";
  source_posture: chinook_source_posture;
};

const make_source = (
  url: string,
  page_title: string,
  source_domain: chinook_source_ref["source_domain"],
  authored_by: chinook_source_ref["authored_by"],
  source_posture: chinook_source_posture,
): chinook_source_ref => ({
  url,
  page_title,
  source_domain,
  authored_by,
  source_posture,
  retrieved_date: "2026-06-11",
});

const recognition_source = make_source(
  "https://chinooknation.org/recognition/",
  "Recognition — Chinook Indian Nation",
  "chinooknation.org",
  "chinook_tribe",
  "verbatim_tribal_source",
);

const political_history_source = make_source(
  "https://chinooknation.org/political-history/",
  "215 Years of Broken Promises & Failed Obligations — Chinook Indian Nation",
  "chinooknation.org",
  "chinook_tribe",
  "verbatim_tribal_source",
);

const government_source = make_source(
  "https://chinooknation.org/government/",
  "Government — Chinook Indian Nation",
  "chinooknation.org",
  "chinook_tribe",
  "verbatim_tribal_source",
);

const treaty_source = make_source(
  "https://treaties.okstate.edu/treaties/treaty-with-the-lower-band-of-the-chinook-1851-22261",
  "Treaty with the Lower Band of the Chinook, 1851",
  "treaties.okstate.edu",
  "external_treaty_archive",
  "verbatim_tribal_source",
);

const federal_register_2001_source = make_source(
  "https://www.federalregister.gov/documents/2001/01/09/01-609/final-determination-to-acknowledge-the-chinook-indian-tribechinook-n",
  "Final Determination to Acknowledge the Chinook Indian Tribe/Chinook Nation",
  "federalregister.gov",
  "federal_record",
  "structured_extraction_from_public_record",
);

const federal_register_2002_source = make_source(
  "https://www.federalregister.gov/documents/2002/07/12/02-17551/reconsidered-final-determination-to-decline-to-acknowledge-the-chinook-indian-tribechinook-nation",
  "Reconsidered Final Determination to Decline to Acknowledge the Chinook Indian Tribe/Chinook Nation",
  "federalregister.gov",
  "federal_record",
  "structured_extraction_from_public_record",
);

const chinook_justice_source = make_source(
  "https://chinookjustice.org/tribal-recognition/",
  "Chinook Justice — Tribal Recognition",
  "chinookjustice.org",
  "chinook_tribe",
  "structured_extraction_from_tribal_source",
);

export const chinook_truth_seed = {
  tribe_id: "chinook",

  layer_0_identity: {
    tribe_self_name: "Chinook Indian Nation",
    self_description: "The Chinook Indian Nation is made up of the five western-most Chinookan speaking tribes at the mouth of the Columbia River.",
    constituent_peoples: "the Clatsop and Cathlamet (Kathlamet) of present-day Oregon and the Lower Chinook, Wahkiakum (Waukikum) and Willapa (Weelappa) of what is now Washington State",
    constitution_note: "Our Nation's constitution was first drafted in 1925 by the Tribal leaders of these Tribes and was later amended in the early 1950s.",
    constitution_age_claim: "one of the oldest living tribal constitutions in the Pacific Northwest",
    headquarters: {
      address: "Chinook Indian Nation • 3 Park Street • P.O. Box 368 • Bay Center, WA 98527",
      phone: "(360) 875-6670",
      email: "Office@ChinookNation.org",
      source: government_source,
    },
    governing_body: {
      name: "Chinook Tribal Council",
      structure:
        "The governing body of the Chinook Indian Nation shall consist of nine members of the Chinook Indian Nation including a Chairman, Vice-Chairman, Secretary/Treasurer. The term of office shall be three years. The Chairman, Vice-Chairman, and Secretary/Treasurer shall be elected from the General Assembly.",
      vacancies_note:
        "The official name of the governing body of the Chinook Indian Nation shall be the Chinook Tribal Council.",
      source: government_source,
    },
    source: recognition_source,
  },

  layer_1_treaty: {
    treaty_name: "Treaty with the Lower Band of the Chinook, 1851",
    treaty_date: "1851-08-09",
    treaty_place: "Tansey Point, near Clatsop Plains",
    bands_named: ["Lower Band of the Chinook", "Clatsop", "Cathlamet", "Wahkiakum", "Willapa"],
    verbatim_opening:
      "Articles of a treaty made and concluded at Tansey Point, near Clatsop Plains, this ninth day of August, eighteen hundred and fifty-one, between Anson Dart... and the undersigned, chiefs and headmen of the lower bond of the Chinook Indians.",
    verbatim_reserved_rights:
      "The said lower band of the Chinook Indians hereby reserve the privilege of occupying the grounds they now occupy, for the purpose of building, fishing, and grazing their stock, with the right to cut timber for their own building purposes and for fuel: also the right to pick cranberries on the marshes, and the right to cultivate as much land as they wish for their own purposes.",
    tribal_framing:
      "The treaties negotiated with Anson Dart allowed us to stay within our aboriginal territory, maintain access to resources and importantly remain in close proximity with the bones of our ancestors. We fulfilled our obligations under these treaties, but unbeknownst to us at that time they were not formally ratified by the United States Congress.",
    ratification_status: "read_into_congressional_record_not_ratified",
    source: treaty_source,
    tribal_source: recognition_source,
  },

  layer_2_dispossession: {
    events: [
      {
        year: 1855,
        event_label: "stevens_council_refusal_to_leave_homeland",
        description:
          "Governor Stevens insisted the tribes relocate to a single reservation far to the north; Chinook and neighbors refused and Stevens left the treaty grounds.",
        verbatim_quote:
          "We are willing to sell our land, but we do not want to go away from our homes. Our fathers, and mothers, and ancestors are buried there and by them we wish to bury our dead and be buried ourselves.",
        source_posture: "verbatim_tribal_source",
        citation: recognition_source.url,
      },
      {
        year: 1864,
        event_label: "secretary_of_interior_takes_chinookan_territory",
        description:
          "By order of the Secretary of the Interior, the U.S. government takes the whole of Chinookan territory in Southwest Washington.",
        source_posture: "verbatim_tribal_source",
        citation: political_history_source.url,
      },
      {
        year: 1951,
        event_label: "court_of_indian_claims_unconscionable_compensation_suit",
        description:
          "The Chinook Nation sues in the Court of Indian Claims arguing that the $26,308 awarded in 1912 for the 762,000 acres relinquished was unconscionable.",
        source_posture: "verbatim_tribal_source",
        citation: political_history_source.url,
      },
      {
        year: 1970,
        event_label: "claims_commission_award_undisbursed",
        description:
          "The Claims Commission awarded $75,000 for the aboriginal Clatsop and Lower Chinook lands; after deducting the previous balance, the final judgment was $48,692, or 10 cents per acre.",
        source_posture: "structured_extraction_from_tribal_source",
        citation: political_history_source.url,
      },
    ],
    source: political_history_source,
  },

  layer_3_recognition_timeline: {
    title: "215 Years of Broken Promises & Failed Obligations",
    subtitle: "Our History with the Federal Government",
    status_statement:
      "The Chinook Indian Nation is not a Federally Recognized Tribe despite years of recognition and interaction with the federal government, Chinook status still remains unclear.",
    events: [
      { year: 1805, event_label: "lewis_and_clark_arrive_in_chinook_territory", description: "Lewis & Clark arrive in Chinook territory on the North side of the Columbia. Ten days later they moved to Clatsop land on the South side to build Ft. Clatsop.", source: political_history_source },
      { year: 1848, event_label: "oregon_territorial_good_faith_land_consent_assurance", description: "Oregon Territorial status assures that the government will deal with Natives in good faith and never take their land without consent.", source: political_history_source },
      { year: 1851, event_label: "tansy_point_treaties_negotiated", description: "Superintendent of Indian Affairs Anson Dart negotiates the Tansy Point treaties. The treaties allow the Chinook to remain in their homelands and promise both provisions and annuities.", source: political_history_source },
      { year: 1852, event_label: "tansy_point_treaties_read_into_congressional_record_not_ratified", description: "The Tansy Point Treaties are read into the Congressional record, but they are not ratified at that time.", source: political_history_source },
      { year: 1853, event_label: "chinookan_peoples_artificially_divided_by_washington_territory", description: "Chinookan peoples living on opposite sides of the river are artificially divided when the government creates Washington Territory.", source: political_history_source },
      { year: 1855, event_label: "governor_stevens_relocation_demand_refused", description: "Governor Stevens insists the tribes relocate to a single reservation far to the north. When the Chinook and their neighbors refused Stevens left the treaty grounds.", source: political_history_source },
      { year: 1864, event_label: "secretary_of_interior_takes_chinookan_territory", description: "By order of the Secretary of the Interior, the U.S. government takes the whole of Chinookan territory in Southwest Washington.", source: political_history_source },
      { year: 1899, event_label: "chinook_petition_claims_commission_tansy_point_treaties", description: "Chinook petition the Claims Commission seeking damages under the Tansy Point treaties. The claim results in annuity payments in 1912.", source: political_history_source },
      { year: 1951, event_label: "court_of_indian_claims_suit_docket_234", description: "The Chinook Nation sues in the Court of Indian Claims arguing that the $26,308 awarded in 1912 for the 762,000 acres relinquished was unconscionable.", source: political_history_source },
      { year: 1970, event_label: "claims_commission_awards_final_judgment_48692", description: "The Claims Commission awarded $75,000 for the aboriginal Clatsop and Lower Chinook lands after which after deducting the previous balance results in a final judgment of $48,692 (10¢ an acre).", source: political_history_source },
      { year: 1982, event_label: "petition_for_federal_acknowledgment_under_new_process", description: "In 1982 the Chinook Indian Nation petitioned the United States for federal acknowledgment under a newly created process for doing so.", source: recognition_source },
      { year: 1994, event_label: "placed_on_active_consideration_and_preliminary_negative_determination", description: "After petitioning the government under a new process created in late 1970s, Chinook is finally placed on active consideration by the Office of Federal Acknowledgment. After several months Chinook receives a preliminary negative determination.", source: political_history_source },
      { year: 1999, event_label: "kevin_gover_independent_scholar_assessment", description: "Assistant Secretary of Indian Affairs, Kevin Gover, hires an independent scholar to assess Chinook history and advise on the tribe's federal relationship.", source: political_history_source },
      { year: 2001, month: "January", event_label: "chinook_acknowledged_as_recognized_tribe", outcome: "granted", description: "Chinook is acknowledged as a recognized tribe.", source: federal_register_2001_source },
      { year: 2002, month: "July", event_label: "recognition_reversed_by_bush_administration", outcome: "reversed", description: "The decision is reversed by the Bush Administration and Chinook is no longer a recognized Tribe.", source: federal_register_2002_source },
      { year: 2012, event_label: "bia_quit_sending_trust_fund_statements", description: "Chinook received quarterly statements on our trust fund, that has grown significantly, until 2012 when the BIA simply quit sending them without explanation or notification.", source: recognition_source },
      { year: 2015, event_label: "chairman_tony_johnson_denied_trust_fund_statements", description: "When Chairman Tony A. Johnson requested statements in 2015, he was denied and informed that because the Chinook Indian Nation is not federally acknowledged, the trust funds now did not belong to the Tribe.", source: recognition_source },
      { year: 2015, event_label: "chinook_executive_recognition_justice_project", description: "The Chinook Tribal Council initiates the Chinook Executive Recognition Justice Project and begins writing President Obama a letter a day asking for an Executive Order granting Federal Recognition.", source: political_history_source },
      { year: 2017, event_label: "chinook_indian_nation_v_zinke_filed", outcome: "filed", description: "The Chinook Indian Nation Sues for Federal Recognition in Federal Court. Chinook Indian Nation v. Zinke.", source: political_history_source },
      { year: 2018, event_label: "seven_of_eight_zinke_claims_move_forward", description: "The U.S. District Court rules that seven of eight claims brought by the Chinook Indian Nation in Chinook v. Zinke will move forward.", source: political_history_source },
    ],
    current_status: "not_federally_recognized_status_unclear",
    source: political_history_source,
  },

  layer_4_lawsuit: {
    case_name: "Chinook Indian Nation v. Zinke",
    filed_date: "2017-08",
    defendant: "U.S. Department of Interior",
    current_procedural_status: "As of the tribal recognition page source packet, the case is ongoing.",
    claims: [
      {
        claim_label: "constructive_ratification_and_constructive_federal_acknowledgment",
        legal_basis:
          "Seeking a Declaratory Judgment from the Court that the Treaty of Tansey Point between the United States and the Lower Band of Chinook Indians was constructively ratified by various Acts of Congress and these Acts have resulted in de facto or constructive federal acknowledgment of the Chinook as an Indian Tribe.",
      },
      {
        claim_label: "invalidate_repetition_ban",
        legal_basis:
          "Seeking an order invalidating the Bureau of Indian Affairs (“BIA”) regulation prohibiting the Chinook, as a Tribe once denied formal recognition from re-petitioning for recognition through the BIA.",
      },
      {
        claim_label: "right_to_claims_award_moneys",
        legal_basis:
          "Seeking a judgment acknowledging Chinook Indian Nation’s right to monies appropriated to us by Congress and awarded to us by the United States Court of Claims.",
      },
      {
        claim_label: "special_master_for_bia_mismanagement_and_malfeasance",
        legal_basis:
          "Because of the BIA’s historical and continuing mismanagement and malfeasance, the Tribe asks that a Special Master be appointed by the Court to monitor agency action or inaction in response to the Court’s orders.",
      },
    ],
    source: recognition_source,
  },

  layer_5_language_vault: {
    language_name: "Chinookan",
    community_description: "five western-most Chinookan speaking tribes at the mouth of the Columbia River",
    living_culture_note: "Language and living culture entries require tribal review before expansion beyond the confirmed Recognition source language.",
    source: recognition_source,
  },

  layer_6_ally_call: {
    recognition_request:
      "The decision to restore our recognition now lies with Congress. It’s time the U.S. government honors the treaty our ancestors signed and grant us federal recognition.",
    donate_url: "https://chinooknation.networkforgood.com",
    volunteer_url: "https://chinooknation.org/volunteer/",
    justice_campaign_url: "https://chinookjustice.org/tribal-recognition/",
    contact_congress_url: "https://chinooknation.org/contact-congress/",
    source: recognition_source,
    justice_source: chinook_justice_source,
  },

  meta: {
    schema_version: "1.0",
    truth_layer_version: "1.0",
    all_data_authored_by: "chinook_tribe_or_public_record",
    schema_convention: "snake_case",
    last_sourced: "2026-06-11",
    publication_gate: "tribe_approved",
    tribal_review_status: "locked_pending_tribal_review",
  },
} as const;
