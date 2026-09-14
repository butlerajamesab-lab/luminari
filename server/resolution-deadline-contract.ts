import { DISTRICT_OF_COLUMBIA, US_STATES, US_TERRITORIES } from "../shared/jurisdiction-substrate";

export type resolution_deadline_context = {
  claim_type: string;
  jurisdiction?: string;
  forum?: string;
  trigger_event?: string;
  event_date?: string;
};

export type deadline_reference = {
  id: number;
  claim_type: string;
  jurisdiction: string;
  deadline_type: string;
  source_duration_days: number | null;
  trigger_event: string | null;
  authority: string | null;
  extended_duration_days: number | null;
  extended_condition: string | null;
  tolling_conditions: unknown;
  notes: string | null;
};

const jurisdiction_names = [...US_STATES, ...US_TERRITORIES, DISTRICT_OF_COLUMBIA];
const jurisdiction_aliases: Record<string, string> = {
  FED: "federal", FEDERAL: "federal", US: "federal", USA: "federal",
  CNMI: "MP", USVI: "VI", "US VIRGIN ISLANDS": "VI", "VIRGIN ISLANDS": "VI",
};

/** Exact aliases only. Mixed, tribal and local scopes need explicit mappings. */
export function deadline_jurisdiction_code(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim().toUpperCase();
  return jurisdiction_aliases[normalized] ?? jurisdiction_names.find(
    item => item.code === normalized || item.name.toUpperCase() === normalized,
  )?.code ?? null;
}

function text_or_null(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * deadline_rules is a reference catalog, not a reviewed calculation contract.
 * It lacks a bound forum, source verification, effective version and calendar
 * rule. Even an exact claim/jurisdiction match and a supplied event date cannot
 * establish a filing deadline, extension eligibility, expiration or urgency.
 */
export function assess_resolution_deadlines(
  records: deadline_reference[], context: resolution_deadline_context,
) {
  const jurisdiction_code = deadline_jurisdiction_code(context.jurisdiction);
  const claim_key = context.claim_type.trim().toLowerCase();
  const references = jurisdiction_code && claim_key ? records.filter(record =>
    record.claim_type.trim().toLowerCase() === claim_key &&
    deadline_jurisdiction_code(record.jurisdiction) === jurisdiction_code,
  ).sort((a, b) => a.id - b.id) : [];
  const missing_context = [
    ...(!jurisdiction_code ? ["jurisdiction"] : []),
    ...(!text_or_null(context.forum) ? ["forum"] : []),
    ...(!text_or_null(context.trigger_event) ? ["trigger_event"] : []),
    ...(!text_or_null(context.event_date) ? ["event_date"] : []),
  ];
  const reason = !jurisdiction_code ? "jurisdiction_unresolved" as const
    : references.length === 0 ? "no_exact_reference" as const
    : "applicability_unverified" as const;
  const message = reason === "jurisdiction_unresolved"
    ? "Choose the jurisdiction to review deadline references. No filing date has been established."
    : reason === "no_exact_reference"
    ? "No deadline reference is explicitly linked to this claim and jurisdiction. Other forums or legal theories may have deadlines; no filing date has been established."
    : "These source intervals have not been verified for your forum and triggering event. Confirm the governing authority, event date, counting rules and any exceptions before relying on a filing date.";

  return {
    status: "unresolved" as const,
    reason,
    message,
    jurisdiction_code,
    supplied_context: {
      forum: text_or_null(context.forum),
      trigger_event: text_or_null(context.trigger_event),
      event_date: text_or_null(context.event_date),
    },
    missing_context,
    unresolved_requirements: ["verified_authority_version", "forum_applicability", "trigger_event_applicability", "calendar_and_exception_rules"],
    references,
    reference_count: references.length,
    has_urgent_deadline: null,
    nearest_deadline_days: null,
    deadline_date: null,
  };
}

export function deadline_review_action(assessment: ReturnType<typeof assess_resolution_deadlines>) {
  return {
    priority: 1,
    action: "Confirm the applicable filing deadline",
    detail: assessment.message,
    urgency: "unknown" as const,
    type: "deadline" as const,
    href: "/deadline-calculator",
  };
}
