import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';

export interface StabilizationInput {
  urgent_situation?: string;
  deadlines: Array<{ description: string; date: string; is_irreversible: boolean }>;
  essential_services_at_risk: string[];
  evidence_to_preserve: string[];
  communication_limits: string[];
  support_people: string[];
  least_burdensome_action?: string;
  what_can_wait: string[];
}

export interface StabilizationSnapshot {
  urgent_situation: string | null;
  deadlines_sorted: Array<{
    description: string;
    date: string;
    is_irreversible: boolean;
    days_from_now: number | null;
  }>;
  irreversible_events: Array<{ description: string; date: string }>;
  at_risk_services: string[];
  preservation_actions: string[];
  communication_limits: string[];
  support_people: string[];
  least_burdensome_action: string | null;
  what_can_wait: string[];
}

export const LAYER_VERSION = '2.2.0';
export const RULE_VERSION = '2.2.0';

export const RULE_MANIFEST = {
  deadline_sort: ['days_from_now_asc_nulls_last', 'date_asc', 'description_asc'],
  day_distance_basis: 'utc_calendar_date_difference',
  invalid_deadline_date_policy: 'unresolved_days_null',
  missing_stabilization_field_policy: 'preserve_null_or_empty_and_mark_unresolved',
  set_like_fields_sorted: [
    'essential_services_at_risk',
    'evidence_to_preserve',
    'communication_limits',
    'support_people',
    'what_can_wait',
  ],
  preserve_user_words_without_interpretation: true,
} as const;
export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);

export function processLayer1(
  input: StabilizationInput,
  as_of: string,
): EngineResult<StabilizationSnapshot> {
  const asOfDate = normalizeDateOnly(as_of);
  if (!asOfDate) throw new Error('layer1_as_of_invalid');

  const normalizedInput = {
    urgent_situation: input.urgent_situation?.trim() || null,
    deadlines: input.deadlines
      .map(deadline => ({ ...deadline, description: deadline.description.trim(), date: deadline.date.trim() }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description) || Number(a.is_irreversible) - Number(b.is_irreversible)),
    essential_services_at_risk: uniqueSorted(input.essential_services_at_risk),
    evidence_to_preserve: uniqueSorted(input.evidence_to_preserve),
    communication_limits: uniqueSorted(input.communication_limits),
    support_people: uniqueSorted(input.support_people),
    least_burdensome_action: input.least_burdensome_action?.trim() || null,
    what_can_wait: uniqueSorted(input.what_can_wait),
  };
  const input_hash = computeHash({ input: normalizedInput, as_of: asOfDate });
  const unresolved: UnresolvedDependency[] = [];

  if (!normalizedInput.urgent_situation) {
    unresolved.push({ field: 'urgent_situation', reason: 'incomplete', detail: 'No immediate concern has been captured for this intake session.' });
  }
  if (normalizedInput.deadlines.length === 0) {
    unresolved.push({ field: 'deadlines', reason: 'incomplete', detail: 'No deadline inventory has been captured; this does not mean no deadline exists.' });
  }
  if (normalizedInput.essential_services_at_risk.length === 0) {
    unresolved.push({ field: 'essential_services_at_risk', reason: 'incomplete', detail: 'Essential-service risk has not been assessed.' });
  }
  if (normalizedInput.evidence_to_preserve.length === 0) {
    unresolved.push({ field: 'evidence_to_preserve', reason: 'incomplete', detail: 'Evidence-preservation priorities have not been assessed.' });
  }
  if (!normalizedInput.least_burdensome_action) {
    unresolved.push({ field: 'least_burdensome_action', reason: 'incomplete', detail: 'The least-burdensome next stabilizing action has not been captured.' });
  }

  const deadlines_sorted = normalizedInput.deadlines
    .map(deadline => {
      const normalizedDate = normalizeDateOnly(deadline.date);
      if (!normalizedDate) {
        unresolved.push({
          field: `deadline:${deadline.description}`,
          reason: 'unresolved',
          detail: `Deadline date could not be parsed exactly: ${deadline.date}`,
        });
      }
      return {
        ...deadline,
        days_from_now: normalizedDate ? calendarDayDifference(asOfDate, normalizedDate) : null,
      };
    })
    .sort((a, b) => {
      if (a.days_from_now === null && b.days_from_now !== null) return 1;
      if (a.days_from_now !== null && b.days_from_now === null) return -1;
      if (a.days_from_now !== null && b.days_from_now !== null && a.days_from_now !== b.days_from_now) {
        return a.days_from_now - b.days_from_now;
      }
      return a.date.localeCompare(b.date) || a.description.localeCompare(b.description);
    });

  const data: StabilizationSnapshot = {
    urgent_situation: normalizedInput.urgent_situation,
    deadlines_sorted,
    irreversible_events: normalizedInput.deadlines
      .filter(deadline => deadline.is_irreversible)
      .map(deadline => ({ description: deadline.description, date: deadline.date })),
    at_risk_services: normalizedInput.essential_services_at_risk,
    preservation_actions: normalizedInput.evidence_to_preserve,
    communication_limits: normalizedInput.communication_limits,
    support_people: normalizedInput.support_people,
    least_burdensome_action: normalizedInput.least_burdensome_action,
    what_can_wait: normalizedInput.what_can_wait,
  };

  return {
    layer_name: 'stabilization_envelope',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(data),
    data,
    unresolved_dependencies: unresolved.sort((a, b) => a.field.localeCompare(b.field)),
    is_sealed: false,
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).sort();
}

function normalizeDateOnly(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function calendarDayDifference(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);
  return Math.round((to - from) / (24 * 3600 * 1000));
}
