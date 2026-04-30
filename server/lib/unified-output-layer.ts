import { CaseInterpretation } from "../services/interpretation-service";

export type UrgencyLevel = "critical" | "high" | "medium" | "low" | "informational";
export type UnifiedNodeType = "interpretation" | "gap" | "mh_resource" | "signal" | "deadline" | "filing" | "template" | "benefit" | "program" | "enforcement_pathway" | "pattern";

export interface NodeLocation {
  lat: number | null;
  lng: number | null;
  jurisdiction: string | null;
  state: string | null;
  county: string | null;
  city: string | null;
  tribal_nation: string | null;
}

export interface NodeAction {
  id: string;
  label: string;
  type: "navigate" | "generate_document" | "external_link" | "action";
  target: string;
  urgency: UrgencyLevel;
  available: boolean;
}

export interface UnifiedNode {
  id: string;
  type: UnifiedNodeType;
  category: string;
  location: NodeLocation;
  urgency: UrgencyLevel;
  sourcePipeline: string;
  sourceId: string;
  title: string;
  summary: string;
  data: any;
  actions: NodeAction[];
  tags: string[];
  createdAt: string;
  expiresAt: string | null;
  policyEventIds: string[];
  caseId: string;
}

export function projectInterpretation(
  interpretation: CaseInterpretation,
  caseId: number,
  jurisdiction: string
): UnifiedNode[] {
  const nodes: UnifiedNode[] = [];

  // 1. Doctrine matches → interpretation nodes
  for (const row of interpretation.comparisonMatrix) {
    let urgency: UrgencyLevel = "informational";
    if (row.matchType === "unsupported") urgency = "critical";
    else if (row.matchType === "partial") urgency = "high";
    else if (row.matchType === "supported") urgency = "medium";

    const actions: NodeAction[] = [
      {
        id: `interpret-${caseId}-${row.adverseReason.slice(0, 30)}`,
        label: "View in Case",
        type: "navigate",
        target: `/cases/${caseId}`,
        urgency,
        available: true,
      },
    ];

    nodes.push({
      id: `interpretation:${caseId}:${row.adverseReason.slice(0, 30)}`,
      type: "interpretation",
      category: "legal",
      location: {
        lat: null,
        lng: null,
        jurisdiction: jurisdiction,
        state: null,
        county: null,
        city: null,
        tribal_nation: null,
      },
      urgency,
      sourcePipeline: "analysis_pipeline",
      sourceId: `case-${caseId}`,
      title: row.governingRule.slice(0, 80),
      summary: `Match: ${row.matchType} — ${row.suggestedClarification}`,
      data: row,
      actions,
      tags: ["interpretation", row.matchType, row.ruleSource],
      createdAt: new Date().toISOString(),
      expiresAt: null,
      policyEventIds: [],
      caseId: String(caseId),
    });
  }

  // 2. Gaps → gap nodes
  for (const gap of interpretation.evidenceGaps) {
    const urgency: UrgencyLevel = gap.priority === "critical" ? "critical" : gap.priority === "important" ? "high" : "medium";
    const actions: NodeAction[] = [
      {
        id: `gap-${gap.id}-obtain`,
        label: "How to Obtain",
        type: "navigate",
        target: `/cases/${caseId}`,
        urgency,
        available: true,
      },
    ];

    nodes.push({
      id: `gap:${gap.id}`,
      type: "gap",
      category: gap.gapType,
      location: {
        lat: null,
        lng: null,
        jurisdiction: jurisdiction,
        state: null,
        county: null,
        city: null,
        tribal_nation: null,
      },
      urgency,
      sourcePipeline: "analysis_pipeline",
      sourceId: String(gap.id),
      title: gap.requiredItem,
      summary: gap.whyRequired,
      data: gap,
      actions,
      tags: ["gap", gap.gapType, gap.priority],
      createdAt: new Date().toISOString(),
      expiresAt: null,
      policyEventIds: [],
      caseId: String(caseId),
    });
  }

  return nodes;
}
