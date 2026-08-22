import type { CandidateStatus, CorroborationState, EvidenceSourceClass } from "./types";

export const LEGAL_TRANSITIONS: Record<CandidateStatus, CandidateStatus[]> = {
  candidate: ["evidence_gathering", "review_hold", "dismissed"],
  evidence_gathering: ["corroboration_review", "review_hold", "dismissed"],
  corroboration_review: ["corroborated", "contradicted", "inconclusive", "review_hold"],
  corroborated: ["routing_review", "review_hold"],
  routing_review: ["escalation_ready", "review_hold", "inconclusive"],
  escalation_ready: ["review_hold"],
  escalated: ["closed", "review_hold"],
  review_hold: ["evidence_gathering", "corroboration_review", "routing_review", "dismissed"],
  contradicted: ["review_hold", "closed"],
  inconclusive: ["evidence_gathering", "closed"],
  dismissed: ["closed"],
  closed: [],
};

export const CORROBORATION_STATES: readonly CorroborationState[] = [
  "uncorroborated",
  "single_source",
  "independently_supported",
  "contradicted",
  "disputed",
  "inconclusive",
  "verified_for_routing",
];

export const EVIDENCE_SOURCE_CLASSES: readonly EvidenceSourceClass[] = [
  "official_primary",
  "official_secondary",
  "court_record",
  "legislative_record",
  "campaign_finance_record",
  "lobbying_disclosure",
  "foreign_agent_registration",
  "regulatory_record",
  "corporate_record",
  "procurement_record",
  "audited_financial_record",
  "journalistic_source",
  "user_supplied",
  "other",
];

export const MIN_RATIONALE_LENGTH = 10;
export const MIN_REVIEWER_NOTES_LENGTH = 10;
export const POLLING_INTERVAL = 30_000;
