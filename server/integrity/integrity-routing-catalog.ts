export type integrity_candidate_type =
  | "phoenix_successor_pattern"
  | "exact_identifier_reuse_pattern"
  | "financial_conduit_pattern"
  | "dark_money_pattern"
  | "legislative_integrity_anomaly"
  | "procurement_integrity_anomaly"
  | "contradiction_pattern"
  | "numeric_range_anomaly"
  | "other";

export type integrity_routing_channel =
  | "inspector_general"
  | "ethics_commission"
  | "elections_regulator"
  | "attorney_general"
  | "auditor"
  | "legislative_ethics"
  | "law_enforcement"
  | "administrative_complaint"
  | "other";

export type integrity_route = {
  route_id: string;
  jurisdiction_ids: string[];
  candidate_types: integrity_candidate_type[];
  agency_name: string;
  department_name: string;
  channel_type: integrity_routing_channel;
  destination_uri: string;
  authority_basis: {
    authority_name: string;
    authority_uri: string;
    scope: string;
  };
  routing_constraints: {
    draft_only: true;
    transmission_authorized: false;
    human_review_required: true;
    notes: string[];
  };
  source_as_of: string;
};

export const INTEGRITY_ROUTE_CATALOG_VERSION = "integrity-route-catalog-v1";

const source_as_of = "2026-08-22T00:00:00.000Z";

export const integrity_route_catalog: integrity_route[] = [
  {
    route_id: "wa_pdc_compliance",
    jurisdiction_ids: ["WA", "US-WA", "Washington", "us_state_wa"],
    candidate_types: [
      "financial_conduit_pattern",
      "dark_money_pattern",
      "legislative_integrity_anomaly",
      "contradiction_pattern",
    ],
    agency_name: "Washington State Public Disclosure Commission",
    department_name: "Compliance Division",
    channel_type: "elections_regulator",
    destination_uri: "https://www.pdc.wa.gov/rules-enforcement/enforcement/enforcement-guide/filing-complaint",
    authority_basis: {
      authority_name: "Washington State Public Disclosure Commission enforcement jurisdiction",
      authority_uri: "https://www.pdc.wa.gov/rules-enforcement/enforcement/enforcement-guide",
      scope: "Washington campaign-finance, political-disclosure, lobbying, personal-financial-affairs, and public-facilities enforcement.",
    },
    routing_constraints: {
      draft_only: true,
      transmission_authorized: false,
      human_review_required: true,
      notes: [
        "A complaint requires specific facts and documentary support within PDC jurisdiction.",
        "All PDC complaints are public records; a reviewer must inspect the current filing requirements before submission.",
        "The PDC does not enforce federal campaign law, the Public Records Act, or the state Ethics in Public Service Act.",
      ],
    },
    source_as_of,
  },
  {
    route_id: "wa_legislative_ethics_board",
    jurisdiction_ids: ["WA", "US-WA", "Washington", "us_state_wa"],
    candidate_types: ["legislative_integrity_anomaly", "contradiction_pattern"],
    agency_name: "Washington State Legislative Ethics Board",
    department_name: "Legislative Ethics Board",
    channel_type: "legislative_ethics",
    destination_uri: "https://leg.wa.gov/about-the-legislature/ethics/",
    authority_basis: {
      authority_name: "Washington Ethics in Public Service Act and Legislative Ethics Board rules",
      authority_uri: "https://leg.wa.gov/about-the-legislature/legislative-procedures/ethics-board-rules/",
      scope: "Complaints involving legislators or legislative employees and conduct within the Ethics in Public Service Act and related legislative rules.",
    },
    routing_constraints: {
      draft_only: true,
      transmission_authorized: false,
      human_review_required: true,
      notes: [
        "A policy disagreement alone is not an ethics allegation.",
        "The current official complaint form, jurisdiction, oath, and delivery requirements must be reviewed before submission.",
      ],
    },
    source_as_of,
  },
  {
    route_id: "fec_office_general_counsel",
    jurisdiction_ids: ["US", "Federal", "FEDERAL", "us_federal"],
    candidate_types: [
      "financial_conduit_pattern",
      "dark_money_pattern",
      "legislative_integrity_anomaly",
      "contradiction_pattern",
    ],
    agency_name: "Federal Election Commission",
    department_name: "Office of General Counsel",
    channel_type: "elections_regulator",
    destination_uri: "https://www.fec.gov/legal-resources/enforcement/complaints-process/how-to-file-complaint-with-fec/",
    authority_basis: {
      authority_name: "Federal Election Campaign Act complaint process",
      authority_uri: "https://www.fec.gov/legal-resources/enforcement/complaints-process/",
      scope: "Written complaints alleging specific violations within Federal Election Commission jurisdiction.",
    },
    routing_constraints: {
      draft_only: true,
      transmission_authorized: false,
      human_review_required: true,
      notes: [
        "A complaint must identify the complainant and respondent, state specific facts, and satisfy current signature, oath, and notarization requirements.",
        "Lighthouse never signs, swears, notarizes, emails, or transmits a complaint.",
      ],
    },
    source_as_of,
  },
  {
    route_id: "doj_public_integrity_section",
    jurisdiction_ids: ["US", "Federal", "FEDERAL", "us_federal"],
    candidate_types: [
      "financial_conduit_pattern",
      "legislative_integrity_anomaly",
      "procurement_integrity_anomaly",
    ],
    agency_name: "United States Department of Justice",
    department_name: "Criminal Division — Public Integrity Section",
    channel_type: "law_enforcement",
    destination_uri: "https://www.justice.gov/criminal/criminal-pin/contact",
    authority_basis: {
      authority_name: "Department of Justice Public Integrity Section mission",
      authority_uri: "https://www.justice.gov/criminal/criminal-pin/about",
      scope: "Federal crimes affecting government integrity, including alleged bribery, election crimes, and criminal abuses of public trust.",
    },
    routing_constraints: {
      draft_only: true,
      transmission_authorized: false,
      human_review_required: true,
      notes: [
        "A statistical, financial, or relational pattern is not a criminal allegation.",
        "This informational destination may be selected only after independent corroboration and authorized legal review.",
      ],
    },
    source_as_of,
  },
];

function normalized_jurisdiction(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export function eligible_integrity_routes(
  jurisdiction_id: string,
  candidate_type: integrity_candidate_type,
): integrity_route[] {
  const jurisdiction = normalized_jurisdiction(jurisdiction_id);
  return integrity_route_catalog.filter(route =>
    route.candidate_types.includes(candidate_type) &&
    route.jurisdiction_ids.some(value => normalized_jurisdiction(value) === jurisdiction),
  );
}

export function resolve_integrity_route(input: {
  jurisdiction_id: string;
  candidate_type: integrity_candidate_type;
  route_id?: string;
}): integrity_route {
  const eligible = eligible_integrity_routes(input.jurisdiction_id, input.candidate_type);
  if (input.route_id) {
    const selected = eligible.find(route => route.route_id === input.route_id);
    if (!selected) throw new Error("integrity_route_not_eligible");
    return selected;
  }
  if (eligible.length === 0) throw new Error("integrity_route_not_found");
  if (eligible.length > 1) throw new Error("integrity_route_ambiguous");
  return eligible[0];
}
