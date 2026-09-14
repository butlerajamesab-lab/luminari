/** Individually reviewed placement of the supplied sample. This is navigation, not legal authority. */
export const benefits_cascade_source = {
  filename: "luminari-benefits-cascade.docx",
  sha256: "0cd47455cc22632cde282c039b03923134f5d4e7a9bc794e187e9765ca855034",
  review_date: "2026-09-14",
  review_scope: "scenario, stage and destination placement",
  version_status: "uploaded_sample_not_reconciled_with_enriched_source",
  legal_verification: "not_verified",
  note: "This uploaded sample is a different version from the enriched staging source. Its legal assertions and durations are not used as eligibility decisions or calculated deadlines.",
} as const;

type cascade_stage = {
  stage_id: string;
  label: string;
  source_paragraphs: string;
  resource_search: string;
  benefit_search?: string;
  review_topics: string[];
  claim_references?: { source_claim_id: string; claim_type: string; label: string }[];
};

type cascade_reference = {
  scenario_id: string;
  title: string;
  trigger: string;
  source_paragraphs: string;
  routing_paragraph: string;
  cross_stage_topics: string[];
  stages: cascade_stage[];
};

export const benefits_cascade_references: cascade_reference[] = [
  {
    scenario_id: "CAS-001", title: "Job loss, health coverage and housing", trigger: "Employment termination",
    source_paragraphs: "P8–P40", routing_paragraph: "P40", cross_stage_topics: ["Employment", "Health coverage", "Housing", "Mental health"],
    stages: [
      { stage_id: "CAS-001-S1", label: "Job loss", source_paragraphs: "P14–P17; P35", resource_search: "unemployment", benefit_search: "lost job unemployment", review_topics: ["Final pay", "Unemployment application", "Employment rights"] },
      { stage_id: "CAS-001-S2", label: "Health insurance loss", source_paragraphs: "P18–P21; P36", resource_search: "health coverage", benefit_search: "lost health insurance Medicaid", review_topics: ["Coverage continuation", "Marketplace enrollment", "Medicaid and CHIP"] },
      { stage_id: "CAS-001-S3", label: "Housing instability", source_paragraphs: "P22–P25; P37", resource_search: "eviction", benefit_search: "housing rent assistance", review_topics: ["Notice review", "Eviction defense", "Rental assistance availability"] },
      { stage_id: "CAS-001-S4", label: "Medicaid disruption", source_paragraphs: "P26–P29; P38", resource_search: "Medicaid", benefit_search: "Medicaid denied coverage", review_topics: ["Adverse notice", "Hearing route", "Coverage continuation request"] },
      { stage_id: "CAS-001-S5", label: "Mental health crisis", source_paragraphs: "P30–P33; P39", resource_search: "mental health", benefit_search: "mental health care", review_topics: ["Treatment access", "Patient advocacy", "Discharge support"] },
    ],
  },
  {
    scenario_id: "CAS-002", title: "Domestic violence, work and housing", trigger: "Domestic violence or safety concerns",
    source_paragraphs: "P41–P68", routing_paragraph: "P68", cross_stage_topics: ["Safety", "VAWA applicability", "Employment", "Housing", "Survivor advocacy"],
    stages: [
      { stage_id: "CAS-002-S1", label: "Safety and support", source_paragraphs: "P47–P50; P64", resource_search: "domestic violence", benefit_search: "domestic violence safety", review_topics: ["Safety planning", "Local advocates", "Protection order options"] },
      { stage_id: "CAS-002-S2", label: "Employment impact", source_paragraphs: "P51–P54; P65", resource_search: "employment", benefit_search: "domestic violence lost job", review_topics: ["Safety-related leave", "Unemployment eligibility", "Employment discrimination concerns"] },
      { stage_id: "CAS-002-S3", label: "Housing", source_paragraphs: "P55–P58; P66", resource_search: "domestic violence housing", benefit_search: "domestic violence housing", review_topics: ["Emergency housing", "Housing-program transfer", "VAWA applicability"] },
      { stage_id: "CAS-002-S4", label: "Criminal justice involvement", source_paragraphs: "P59–P62; P67", resource_search: "public defender", review_topics: ["Criminal defense", "Survivor advocacy", "Case-specific court dates"] },
    ],
  },
  {
    scenario_id: "CAS-003", title: "Immigration contact, work and family", trigger: "Immigration enforcement contact or detention",
    source_paragraphs: "P69–P96", routing_paragraph: "P96", cross_stage_topics: ["Immigration", "Employment", "Family", "Individual benefit eligibility"],
    stages: [
      { stage_id: "CAS-003-S1", label: "Immigration contact", source_paragraphs: "P75–P78; P92", resource_search: "immigration legal", review_topics: ["Immigration counsel", "Rapid response contacts", "Notices and hearing information"] },
      { stage_id: "CAS-003-S2", label: "Job or wage loss", source_paragraphs: "P79–P82; P93", resource_search: "wage", review_topics: ["Unpaid wage records", "Retaliation concerns", "Employment advice"] },
      { stage_id: "CAS-003-S3", label: "Benefits access", source_paragraphs: "P83–P86; P94", resource_search: "benefits", benefit_search: "children food health coverage", review_topics: ["Eligibility of each family member", "Current immigration-related benefit rules", "Denial notice review"] },
      { stage_id: "CAS-003-S4", label: "Family separation", source_paragraphs: "P87–P90; P95", resource_search: "family legal", review_topics: ["Family counsel", "Custody and contact", "Tribal jurisdiction where applicable"] },
    ],
  },
  {
    scenario_id: "CAS-004", title: "Mental health care, discharge, work and housing", trigger: "Psychiatric crisis or hospitalization",
    source_paragraphs: "P97–P124", routing_paragraph: "P124", cross_stage_topics: ["Mental health", "Community support", "Employment", "Housing", "Medicaid, SSI and SSDI eligibility"],
    stages: [
      { stage_id: "CAS-004-S1", label: "Psychiatric hold", source_paragraphs: "P103–P106; P120", resource_search: "protection advocacy", review_topics: ["Patient advocacy", "Hold and hearing documents", "Advance directive"], claim_references: [
        { source_claim_id: "DIS-003", claim_type: "dis_003_olmstead_community_integration_institutionalization", label: "Community integration reference" },
      ] },
      { stage_id: "CAS-004-S2", label: "Discharge and return to community", source_paragraphs: "P107–P110; P121", resource_search: "community mental health", benefit_search: "Medicaid mental health", review_topics: ["Discharge plan", "Medication and coverage continuity", "Community support referrals"], claim_references: [
        { source_claim_id: "DIS-003", claim_type: "dis_003_olmstead_community_integration_institutionalization", label: "Community integration reference" },
        { source_claim_id: "BEN-001", claim_type: "ben_001_medicaid_denial_wrongful_termination_or_reduction", label: "Medicaid adverse-action reference" },
      ] },
      { stage_id: "CAS-004-S3", label: "Employment impact", source_paragraphs: "P111–P114; P122", resource_search: "disability employment", benefit_search: "disability lost job", review_topics: ["Accommodation request", "Leave documents", "Adverse employment action"], claim_references: [
        { source_claim_id: "EMP-003", claim_type: "emp_003_disability_discrimination_failure_to_accommodate", label: "Employment accommodation reference" },
      ] },
      { stage_id: "CAS-004-S4", label: "Housing stability", source_paragraphs: "P115–P118; P123", resource_search: "supportive housing", benefit_search: "disability housing", review_topics: ["Housing accommodation", "Supportive housing availability", "Housing application"], claim_references: [
        { source_claim_id: "HOU-002", claim_type: "hou_002_housing_discrimination_disability_reasonable_accommodation", label: "Housing accommodation reference" },
      ] },
    ],
  },
];

/** An explicit case selection must resolve to a case already returned to this user. */
export function resolve_benefits_case_id(requested: string | null, current_case_id: number | null, cases: { id: number }[] | undefined) {
  if (requested !== null) {
    if (!/^[1-9]\d*$/.test(requested)) return null;
    const id = Number(requested);
    return Number.isSafeInteger(id) && cases?.some(c => c.id === id) ? id : null;
  }
  return current_case_id && cases?.some(c => c.id === current_case_id) ? current_case_id : null;
}

export function benefits_context_href(path: string, case_id: number | null, state_code?: string | null) {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (case_id) params.set("case_id", String(case_id));
  if (state_code) params.set(pathname === "/resolve" ? "jurisdiction" : "state", state_code);
  return params.size ? `${pathname}?${params.toString()}` : pathname;
}
