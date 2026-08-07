import { computeHash, EngineResult } from './utils';

export interface StabilizationInput {
  urgent_matters: string[];
  deadlines: Array<{
    description: string;
    date: string;
    days_out: number;
  }>;
  irreversible_events: string[];
  at_risk_services: string[];
  evidence_to_preserve: string[];
  communication_limits: string[];
  support_people: string[];
  next_action: string;
  can_wait: string[];
}

export interface StabilizationOutput {
  checkpoint_key: string;
  snapshot: StabilizationInput;
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

export function processLayer1(input: StabilizationInput): EngineResult<StabilizationOutput> {
  const input_hash = computeHash(input);
  
  // Deterministic Logic: Pure structured capture with date-proximity sorting.
  const sortedDeadlines = [...input.deadlines].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const data: StabilizationOutput = {
    checkpoint_key: `stab_${input_hash.substring(0, 8)}`,
    snapshot: {
      ...input,
      deadlines: sortedDeadlines,
    },
  };

  const output_hash = computeHash(data);

  return {
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    canonicalization_version: '1.0.0',
    input_hash,
    output_hash,
    data,
    unresolved_dependencies: [],
    is_sealed: false,
  };
}
