import { computeHash, EngineResult, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';

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
  deadlines_sorted: Array<{ description: string; date: string; is_irreversible: boolean; days_from_now: number | null }>;
  irreversible_events: Array<{ description: string; date: string }>;
  at_risk_services: string[];
  preservation_actions: string[];
}

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

export function processLayer1(input: StabilizationInput, as_of: string): EngineResult<StabilizationSnapshot> {
  const input_hash = computeHash({ input, as_of });
  const unresolved: UnresolvedDependency[] = [];
  const asOfDate = new Date(as_of);

  const deadlines_sorted = input.deadlines
    .map(d => {
      const deadlineDate = new Date(d.date);
      const days = isNaN(deadlineDate.getTime()) ? null : Math.round((deadlineDate.getTime() - asOfDate.getTime()) / (24 * 3600 * 1000));
      return { ...d, days_from_now: days };
    })
    .sort((a, b) => {
      if (a.days_from_now === null && b.days_from_now === null) return 0;
      if (a.days_from_now === null) return 1;
      if (b.days_from_now === null) return -1;
      return a.days_from_now - b.days_from_now;
    });

  const data: StabilizationSnapshot = {
    deadlines_sorted,
    irreversible_events: input.deadlines.filter(d => d.is_irreversible).map(d => ({ description: d.description, date: d.date })),
    at_risk_services: input.essential_services_at_risk,
    preservation_actions: input.evidence_to_preserve,
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
    unresolved_dependencies: unresolved,
    is_sealed: false,
  };
}
