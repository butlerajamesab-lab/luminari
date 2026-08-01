export type PrismProblemType =
  | "DENIAL"
  | "ESCALATION"
  | "GAP"
  | "CONTRADICTION"
  | "SIGNAL"
  | string;

export type PrismRiskLevel = "RED" | "ORANGE" | "YELLOW" | "GREEN" | string;

export interface PrismFinding {
  id: string;
  finding_type: string;
  description: string;
  evidence_links: string[];
  confidence: number;
}

export interface PrismPathway {
  type: string;
  action: string;
  steps: string[];
  timeline: string;
  probability: number;
  resource_cost: string;
  cascade_impact: string;
}

export interface PrismEvidence {
  id: string;
  source_document: string;
  evidence_type: string;
  content: string;
  content_type: string;
  provenance_hash: string;
  status: string;
}

export interface PrismEntity {
  name: string;
  type: string;
  role: string;
}

export interface PrismAction {
  id: string;
  action_type: string;
  description: string;
  priority: number;
  status: string;
  estimated_timeline: number;
  success_probability: number;
  cascade_impact: string;
}

export interface PrismInstance {
  record_id: string;
  problem_type: PrismProblemType;
  jurisdiction: string;
  system_primary: string;
  risk_level: PrismRiskLevel;
  friction: {
    coefficient: number;
    severity: string;
    sources: Array<{ name: string; weight: number }>;
  };
  alignment: {
    micro: number;
    meso: number;
    macro: number;
    system: number;
    composite: number;
  };
  findings: PrismFinding[];
  resolution_pathways: PrismPathway[];
  evidence: PrismEvidence[];
  grounding_entities: PrismEntity[];
  actions: PrismAction[];
  feedback_history: unknown[];
  traceability: {
    created_at: string;
    updated_at: string;
    validation_status: string;
    source_refs: string[];
  };
  coordination: {
    systems_involved: string[];
    dependencies: string[];
    conflicts: string[];
    deadlock: boolean;
    deadlock_reason: string;
    blocking_entities: string[];
  };
  intake_ready: boolean;
  recommended_next_action: {
    type: string;
    target: string;
    urgency: string;
  };
}

export interface PrismBatch {
  schema_version: string;
  export_type: string;
  source_system: string;
  exported_at: string;
  filters: Record<string, unknown>;
  total_records: number;
  instances: PrismInstance[];
  validation_summary?: Record<string, unknown>;
}

export type JurisdictionLevel = "federal" | "tribal" | "county" | "city" | "state";

const TRIBAL_INDICATORS = [
  "tribal", "tribe", "nation", "navajo", "cherokee", "lakota", "sioux",
  "apache", "choctaw", "creek", "seminole", "chickasaw", "ojibwe",
  "chippewa", "pueblo", "hopi", "zuni", "ute", "paiute", "shoshone",
  "blackfeet", "crow", "arapaho", "comanche", "kiowa", "osage",
  "potawatomi", "menominee", "oneida", "mohawk", "seneca", "onondaga",
  "cayuga", "tuscarora", "iroquois", "haudenosaunee", "reservation",
  "icwa", "bia", "bureau of indian affairs", "indian child welfare",
  "tribal court", "tribal council", "tribal sovereignty",
];

const FEDERAL_INDICATORS = [
  "federal", "hud", "hhs", "uscis", "ice", "ssa", "social security",
  "va ", "veterans affairs", "doj", "department of justice", "fbi",
  "fema", "title iv", "title ix", "vawa", "ada", "hipaa", "ferpa",
  "medicare", "medicaid", "snap", "tanf", "ssi", "ssdi",
  "office of civil rights", "ocr", "eeoc", "ftc",
];

const COUNTY_INDICATORS = [
  "county", "sheriff", "district attorney", "county court", "county clerk",
  "county prosecutor", "county jail", "superior court",
];

const CITY_INDICATORS = [
  "city", "municipal", "city council", "city police", "city attorney",
  "municipal court", "city ordinance",
];

export function normalizeJurisdictionLevel(jurisdiction: string): JurisdictionLevel {
  const lower = (jurisdiction || "").toLowerCase();
  if (TRIBAL_INDICATORS.some((keyword) => lower.includes(keyword))) return "tribal";
  if (FEDERAL_INDICATORS.some((keyword) => lower.includes(keyword))) return "federal";
  if (COUNTY_INDICATORS.some((keyword) => lower.includes(keyword))) return "county";
  if (CITY_INDICATORS.some((keyword) => lower.includes(keyword))) return "city";
  return "state";
}

export interface PrismCorrelation {
  source: string;
  target: string;
  match_type: "shared_attributes" | "friction_alignment";
  weight: "strong" | "weak";
  friction_alignment: number;
  total_score: number;
  shared_reasons: string[];
}

/**
 * Exact deterministic correlation rule from the supplied Prism V2 enrichment layer.
 * The UI computes this read-only at response time. It does not persist or reinterpret it.
 */
export function computeCorrelation(
  source: PrismInstance,
  target: PrismInstance,
): PrismCorrelation | null {
  if (source.record_id === target.record_id) return null;

  let attributeScore = 0;
  let frictionScore = 0;
  const sharedReasons: string[] = [];

  if (target.problem_type === source.problem_type) {
    attributeScore += 0.35;
    sharedReasons.push("same_problem_type");
  }
  if (target.system_primary === source.system_primary) {
    attributeScore += 0.30;
    sharedReasons.push("same_system");
  }
  if (target.jurisdiction === source.jurisdiction) {
    attributeScore += 0.25;
    sharedReasons.push("same_jurisdiction");
  } else if (
    normalizeJurisdictionLevel(target.jurisdiction) ===
    normalizeJurisdictionLevel(source.jurisdiction)
  ) {
    attributeScore += 0.10;
    sharedReasons.push("same_jurisdiction_level");
  }

  const frictionDiff = Math.abs(
    Number(source.friction?.coefficient || 0) - Number(target.friction?.coefficient || 0),
  );
  if (frictionDiff < 0.10) frictionScore = 1.0;
  else if (frictionDiff < 0.20) frictionScore = 0.7;
  else if (frictionDiff < 0.30) frictionScore = 0.4;
  else frictionScore = 0;

  if (frictionScore > 0) sharedReasons.push("friction_alignment");

  const totalScore = attributeScore + frictionScore * 0.10;
  if (totalScore < 0.25) return null;

  return {
    source: source.record_id,
    target: target.record_id,
    match_type:
      attributeScore >= frictionScore * 0.10
        ? "shared_attributes"
        : "friction_alignment",
    weight: frictionScore > 0.75 ? "strong" : "weak",
    friction_alignment: Number(frictionScore.toFixed(3)),
    total_score: Number(totalScore.toFixed(3)),
    shared_reasons: sharedReasons,
  };
}

export function buildCorrelationGraph(instances: PrismInstance[]): PrismCorrelation[] {
  const edgeMap = new Map<string, PrismCorrelation>();
  for (const source of instances) {
    for (const target of instances) {
      const edge = computeCorrelation(source, target);
      if (!edge) continue;
      const [a, b] = edge.source < edge.target
        ? [edge.source, edge.target]
        : [edge.target, edge.source];
      const key = `${a}-${b}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, { ...edge, source: a, target: b });
      }
    }
  }
  return Array.from(edgeMap.values()).sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    return `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`);
  });
}

export function correlationsForInstance(
  instance: PrismInstance,
  instances: PrismInstance[],
): Array<PrismCorrelation & { matched: PrismInstance }> {
  return instances
    .map((candidate) => {
      const edge = computeCorrelation(instance, candidate);
      return edge ? { ...edge, matched: candidate } : null;
    })
    .filter((value): value is PrismCorrelation & { matched: PrismInstance } => Boolean(value))
    .sort((a, b) => {
      if (b.friction_alignment !== a.friction_alignment) {
        return b.friction_alignment - a.friction_alignment;
      }
      if (b.total_score !== a.total_score) return b.total_score - a.total_score;
      return a.matched.record_id.localeCompare(b.matched.record_id);
    });
}

export interface PrismAggregates {
  totalInstances: number;
  avgFriction: number;
  avgAlignment: number;
  totalEvidence: number;
  totalFindings: number;
  totalPathways: number;
  totalActions: number;
  riskDistribution: Record<string, number>;
  typeDistribution: Record<string, number>;
  systemDistribution: Record<string, number>;
  jurisdictionDistribution: Record<string, number>;
}

export function computeAggregates(instances: PrismInstance[]): PrismAggregates {
  const total = instances.length || 1;
  const sum = (values: number[]) => values.reduce((acc, value) => acc + value, 0);
  const countBy = (selector: (instance: PrismInstance) => string) =>
    instances.reduce<Record<string, number>>((result, instance) => {
      const key = selector(instance) || "Unknown";
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});

  return {
    totalInstances: instances.length,
    avgFriction: sum(instances.map((instance) => Number(instance.friction?.coefficient || 0))) / total,
    avgAlignment: sum(instances.map((instance) => Number(instance.alignment?.composite || 0))) / total,
    totalEvidence: sum(instances.map((instance) => instance.evidence?.length || 0)),
    totalFindings: sum(instances.map((instance) => instance.findings?.length || 0)),
    totalPathways: sum(instances.map((instance) => instance.resolution_pathways?.length || 0)),
    totalActions: sum(instances.map((instance) => instance.actions?.length || 0)),
    riskDistribution: countBy((instance) => instance.risk_level),
    typeDistribution: countBy((instance) => instance.problem_type),
    systemDistribution: countBy((instance) => instance.system_primary),
    jurisdictionDistribution: countBy((instance) => instance.jurisdiction),
  };
}

export interface PrismHotspot {
  id: string;
  jurisdiction: string;
  system: string;
  instanceCount: number;
  averageFriction: number;
  averageAlignment: number;
  dominantProblemType: string;
  dominantRisk: string;
  instances: PrismInstance[];
}

export function computeHotspots(instances: PrismInstance[]): PrismHotspot[] {
  const groups = new Map<string, PrismInstance[]>();
  for (const instance of instances) {
    const key = `${instance.jurisdiction}::${instance.system_primary}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(instance);
  }

  return Array.from(groups.entries())
    .map(([id, group]) => {
      const types = group.reduce<Record<string, number>>((result, instance) => {
        result[instance.problem_type] = (result[instance.problem_type] || 0) + 1;
        return result;
      }, {});
      const risks = group.reduce<Record<string, number>>((result, instance) => {
        result[instance.risk_level] = (result[instance.risk_level] || 0) + 1;
        return result;
      }, {});
      const dominant = (counts: Record<string, number>) =>
        Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "Unknown";
      return {
        id,
        jurisdiction: group[0]?.jurisdiction || "Unknown",
        system: group[0]?.system_primary || "Unknown",
        instanceCount: group.length,
        averageFriction:
          group.reduce((sum, item) => sum + Number(item.friction?.coefficient || 0), 0) /
          group.length,
        averageAlignment:
          group.reduce((sum, item) => sum + Number(item.alignment?.composite || 0), 0) /
          group.length,
        dominantProblemType: dominant(types),
        dominantRisk: dominant(risks),
        instances: [...group].sort((a, b) =>
          b.friction.coefficient - a.friction.coefficient ||
          a.record_id.localeCompare(b.record_id),
        ),
      };
    })
    .sort((a, b) =>
      b.averageFriction - a.averageFriction ||
      b.instanceCount - a.instanceCount ||
      a.id.localeCompare(b.id),
    );
}

export function deterministicLayout(
  instances: PrismInstance[],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const grouped = instances.reduce<Record<string, PrismInstance[]>>((result, instance) => {
    const key = instance.jurisdiction || "Unknown";
    if (!result[key]) result[key] = [];
    result[key].push(instance);
    return result;
  }, {});
  const groups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  const centerX = width / 2;
  const centerY = height / 2;
  const outerRadius = Math.max(100, Math.min(width, height) * 0.36);

  groups.forEach(([jurisdiction, group], groupIndex) => {
    const groupAngle = (Math.PI * 2 * groupIndex) / Math.max(groups.length, 1) - Math.PI / 2;
    const clusterX = centerX + Math.cos(groupAngle) * outerRadius;
    const clusterY = centerY + Math.sin(groupAngle) * outerRadius;
    const clusterRadius = Math.max(25, Math.min(72, 18 + group.length * 6));
    const ordered = [...group].sort((a, b) =>
      a.problem_type.localeCompare(b.problem_type) || a.record_id.localeCompare(b.record_id),
    );
    ordered.forEach((instance, instanceIndex) => {
      const angle = (Math.PI * 2 * instanceIndex) / Math.max(ordered.length, 1) + groupAngle;
      const radius = ordered.length === 1 ? 0 : clusterRadius;
      positions.set(instance.record_id, {
        x: clusterX + Math.cos(angle) * radius,
        y: clusterY + Math.sin(angle) * radius,
      });
    });
  });

  return positions;
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
