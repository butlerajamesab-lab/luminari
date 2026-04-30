export type UrgencyLevel = "critical" | "high" | "medium" | "low" | "informational";

export type UnifiedNodeType =
  | "mh_resource"
  | "signal"
  | "deadline"
  | "filing"
  | "template"
  | "benefit"
  | "program"
  | "gap"
  | "interpretation"
  | "enforcement_pathway"
  | "pattern";

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
