import { db } from "../db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import {
  systemMapNodes,
  systemMapEdges,
  mapAnnotations,
  institutionRiskProfiles,
  institutionTimeline,
  detectedSignals,
  type SystemMapNodeRow,
  type SystemMapEdgeRow,
  type InstitutionRiskProfileRow,
} from "../../drizzle/schema";

// ─── Node Types ──────────────────────────────────────────────────────
export const NODE_TYPES = [
  "industry", "institution", "corporation", "agency", "pattern", "jurisdiction",
] as const;

export const EDGE_TYPES = [
  "regulates", "complaint_target", "enforcement_target", "lobbies",
  "litigates", "oversees", "correlates_with",
] as const;

// ─── Create/Update Map Node ─────────────────────────────────────────

export async function upsertMapNode(params: {
  nodeType: string;
  nodeName: string;
  jurisdiction?: string;
  industry?: string;
  riskScore?: number;
  patternCount?: number;
}): Promise<SystemMapNodeRow> {
  const now = Date.now();

  const existing = await db.select().from(systemMapNodes)
    .where(and(
      eq(systemMapNodes.nodeType, params.nodeType),
      eq(systemMapNodes.nodeName, params.nodeName)
    ))
    .limit(1);

  if (existing[0]) {
    await db.update(systemMapNodes)
      .set({
        riskScore: params.riskScore ?? existing[0].riskScore,
        patternCount: params.patternCount ?? existing[0].patternCount,
        updatedAt: now,
      })
      .where(eq(systemMapNodes.id, existing[0].id));

    const [updated] = await db.select().from(systemMapNodes).where(eq(systemMapNodes.id, existing[0].id));
    return updated;
  }

  await db.insert(systemMapNodes).values({
    nodeType: params.nodeType,
    nodeName: params.nodeName,
    jurisdiction: params.jurisdiction || null,
    industry: params.industry || null,
    riskScore: params.riskScore || 0,
    patternCount: params.patternCount || 0,
    createdAt: now,
    updatedAt: now,
  });

  const [inserted] = await db.select().from(systemMapNodes)
    .where(and(
      eq(systemMapNodes.nodeType, params.nodeType),
      eq(systemMapNodes.nodeName, params.nodeName)
    ))
    .orderBy(desc(systemMapNodes.id))
    .limit(1);

  return inserted;
}

// ─── Create Map Edge ─────────────────────────────────────────────────

export async function createMapEdge(params: {
  sourceNodeId: number;
  targetNodeId: number;
  edgeType: string;
  weight?: number;
}): Promise<SystemMapEdgeRow> {
  const now = Date.now();

  const existing = await db.select().from(systemMapEdges)
    .where(and(
      eq(systemMapEdges.sourceNode, params.sourceNodeId),
      eq(systemMapEdges.targetNode, params.targetNodeId),
      eq(systemMapEdges.relationshipType, params.edgeType)
    ))
    .limit(1);

  if (existing[0]) {
    await db.update(systemMapEdges)
      .set({ relationshipStrength: params.weight ?? existing[0].relationshipStrength })
      .where(eq(systemMapEdges.id, existing[0].id));

    const [updated] = await db.select().from(systemMapEdges).where(eq(systemMapEdges.id, existing[0].id));
    return updated;
  }

  await db.insert(systemMapEdges).values({
    sourceNode: params.sourceNodeId,
    targetNode: params.targetNodeId,
    relationshipType: params.edgeType,
    relationshipStrength: params.weight || 1,
    createdAt: now,
  });

  const [inserted] = await db.select().from(systemMapEdges)
    .where(and(
      eq(systemMapEdges.sourceNode, params.sourceNodeId),
      eq(systemMapEdges.targetNode, params.targetNodeId),
      eq(systemMapEdges.relationshipType, params.edgeType)
    ))
    .orderBy(desc(systemMapEdges.id))
    .limit(1);

  return inserted;
}

// ─── Build Map from Signals ──────────────────────────────────────────

export async function buildMapFromSignals(): Promise<{ nodesCreated: number; edgesCreated: number }> {
  let nodesCreated = 0;
  let edgesCreated = 0;

  const signals = await db.select().from(detectedSignals);

  const entityCounts = new Map<string, { signals: number; patterns: Set<number> }>();
  const industryCounts = new Map<string, { signals: number; patterns: Set<number> }>();

  for (const signal of signals) {
    if (signal.entityId) {
      const entry = entityCounts.get(signal.entityId) || { signals: 0, patterns: new Set() };
      entry.signals++;
      if (signal.patternTypeId) entry.patterns.add(Number(signal.patternTypeId));
      entityCounts.set(signal.entityId, entry);
    }
    if (signal.complaintCategory) {
      const entry = industryCounts.get(signal.complaintCategory) || { signals: 0, patterns: new Set() };
      entry.signals++;
      if (signal.patternTypeId) entry.patterns.add(Number(signal.patternTypeId));
      industryCounts.set(signal.complaintCategory, entry);
    }
  }

  const entityNodeMap = new Map<string, number>();
  for (const [name, data] of entityCounts) {
    const riskScore = Math.min(100, data.signals * 5 + data.patterns.size * 10);
    const node = await upsertMapNode({
      nodeType: "corporation",
      nodeName: name,
      riskScore,
      patternCount: data.patterns.size,
    });
    entityNodeMap.set(name, node.id);
    nodesCreated++;
  }

  const industryNodeMap = new Map<string, number>();
  for (const [name, data] of industryCounts) {
    const riskScore = Math.min(100, data.signals * 3 + data.patterns.size * 8);
    const node = await upsertMapNode({
      nodeType: "industry",
      nodeName: name,
      riskScore,
      patternCount: data.patterns.size,
    });
    industryNodeMap.set(name, node.id);
    nodesCreated++;
  }

  // Create edges: entity → industry
  const edgesSeen = new Set<string>();
  for (const signal of signals) {
    if (signal.entityId && signal.complaintCategory) {
      const key = `${signal.entityId}→${signal.complaintCategory}`;
      if (edgesSeen.has(key)) continue;
      edgesSeen.add(key);
      const sourceId = entityNodeMap.get(signal.entityId);
      const targetId = industryNodeMap.get(signal.complaintCategory);
      if (sourceId && targetId) {
        await createMapEdge({
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          edgeType: "complaint_target",
          weight: 1,
        });
        edgesCreated++;
      }
    }
  }

  return { nodesCreated, edgesCreated };
}

// ─── Get Map Data ────────────────────────────────────────────────────

export async function getMapData(filters?: { nodeType?: string; minRiskScore?: number }) {
  let nodesQuery = db.select().from(systemMapNodes);
  if (filters?.nodeType) {
    nodesQuery = nodesQuery.where(eq(systemMapNodes.nodeType, filters.nodeType)) as typeof nodesQuery;
  }
  if (filters?.minRiskScore) {
    nodesQuery = nodesQuery.where(gte(systemMapNodes.riskScore, filters.minRiskScore)) as typeof nodesQuery;
  }

  const nodes = await nodesQuery.orderBy(desc(systemMapNodes.riskScore)).limit(200);
  const nodeIds = new Set(nodes.map((n: any) => n.id));

  const allEdges = await db.select().from(systemMapEdges).limit(1000);
  const edges = allEdges.filter((e: any) => nodeIds.has(e.sourceNode) && nodeIds.has(e.targetNode));

  return { nodes, edges };
}

// ─── Add Annotation ──────────────────────────────────────────────────

export async function addAnnotation(params: {
  nodeId: number;
  analyst: string;
  note: string;
}): Promise<void> {
  await db.insert(mapAnnotations).values({
    nodeId: params.nodeId,
    analyst: params.analyst,
    note: params.note,
    createdAt: Date.now(),
  });
}

// ─── Get Map Stats ───────────────────────────────────────────────────

export async function getMapStats() {
  const [totalNodes] = await db.select({ count: sql<number>`COUNT(*)` }).from(systemMapNodes);
  const [totalEdges] = await db.select({ count: sql<number>`COUNT(*)` }).from(systemMapEdges);
  const [highRiskNodes] = await db.select({ count: sql<number>`COUNT(*)` }).from(systemMapNodes)
    .where(gte(systemMapNodes.riskScore, 60));
  const [totalAnnotations] = await db.select({ count: sql<number>`COUNT(*)` }).from(mapAnnotations);

  return {
    totalNodes: totalNodes?.count || 0,
    totalEdges: totalEdges?.count || 0,
    highRiskNodes: highRiskNodes?.count || 0,
    totalAnnotations: totalAnnotations?.count || 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Institutional Failure Prediction Engine
// ═══════════════════════════════════════════════════════════════════════

// ─── Create/Update Risk Profile ──────────────────────────────────────

export async function upsertFailureProfile(params: {
  institutionId: number;
  complaintVolume?: number;
  litigationVolume?: number;
  regulatoryActions?: number;
  enforcementActions?: number;
  appealReversalRate?: number;
  processingDelayIndex?: number;
  policyShockScore?: number;
}): Promise<InstitutionRiskProfileRow> {
  const now = Date.now();

  // Calculate risk score from inputs
  const riskScore = calculateRiskScore(params);
  const failureProbability = calculateFailureProbability({
    complaintVolume: params.complaintVolume || 0,
    enforcementRate: (params.enforcementActions || 0) / Math.max(1, params.complaintVolume || 1),
    responseTime: params.processingDelayIndex || 0,
    historicalFailures: 0,
    budgetPressure: (params.policyShockScore || 0) / 100,
  });

  const riskClassification = riskScore >= 75 ? "critical" : riskScore >= 50 ? "elevated" : riskScore >= 25 ? "moderate" : "stable";

  const existing = await db.select().from(institutionRiskProfiles)
    .where(eq(institutionRiskProfiles.institutionId, params.institutionId))
    .limit(1);

  if (existing[0]) {
    await db.update(institutionRiskProfiles)
      .set({
        complaintVolume: params.complaintVolume ?? existing[0].complaintVolume,
        litigationVolume: params.litigationVolume ?? existing[0].litigationVolume,
        regulatoryActions: params.regulatoryActions ?? existing[0].regulatoryActions,
        enforcementActions: params.enforcementActions ?? existing[0].enforcementActions,
        appealReversalRate: params.appealReversalRate ?? existing[0].appealReversalRate,
        processingDelayIndex: params.processingDelayIndex ?? existing[0].processingDelayIndex,
        policyShockScore: params.policyShockScore ?? existing[0].policyShockScore,
        riskScore,
        riskClassification,
        failureProbability,
        lastUpdated: now,
      })
      .where(eq(institutionRiskProfiles.id, existing[0].id));

    const [updated] = await db.select().from(institutionRiskProfiles)
      .where(eq(institutionRiskProfiles.id, existing[0].id));
    return updated;
  }

  await db.insert(institutionRiskProfiles).values({
    institutionId: params.institutionId,
    complaintVolume: params.complaintVolume || 0,
    litigationVolume: params.litigationVolume || 0,
    regulatoryActions: params.regulatoryActions || 0,
    enforcementActions: params.enforcementActions || 0,
    appealReversalRate: params.appealReversalRate || 0,
    processingDelayIndex: params.processingDelayIndex || 0,
    policyShockScore: params.policyShockScore || 0,
    riskScore,
    riskClassification,
    failureProbability,
    lastUpdated: now,
  });

  const [inserted] = await db.select().from(institutionRiskProfiles)
    .where(eq(institutionRiskProfiles.institutionId, params.institutionId))
    .orderBy(desc(institutionRiskProfiles.id))
    .limit(1);

  return inserted;
}

// ─── Calculate Risk Score ────────────────────────────────────────────

function calculateRiskScore(inputs: {
  complaintVolume?: number;
  litigationVolume?: number;
  regulatoryActions?: number;
  enforcementActions?: number;
  appealReversalRate?: number;
  processingDelayIndex?: number;
  policyShockScore?: number;
}): number {
  const complaintFactor = Math.min(25, (inputs.complaintVolume || 0) * 0.3);
  const litigationFactor = Math.min(20, (inputs.litigationVolume || 0) * 2);
  const enforcementFactor = Math.min(15, (inputs.enforcementActions || 0) * 3);
  const reversalFactor = Math.min(15, (inputs.appealReversalRate || 0) * 15);
  const delayFactor = Math.min(15, (inputs.processingDelayIndex || 0) * 3);
  const shockFactor = Math.min(10, (inputs.policyShockScore || 0) * 0.1);

  return Math.min(100, Math.round(complaintFactor + litigationFactor + enforcementFactor + reversalFactor + delayFactor + shockFactor));
}

// ─── Calculate Failure Probability ───────────────────────────────────

export function calculateFailureProbability(inputs: {
  complaintVolume: number;
  enforcementRate: number;
  responseTime: number;
  historicalFailures: number;
  budgetPressure: number;
}): number {
  const complaintFactor = Math.min(40, inputs.complaintVolume * 0.5);
  const enforcementFactor = Math.max(0, 25 - inputs.enforcementRate * 25);
  const responseFactor = Math.min(20, inputs.responseTime * 2);
  const historyFactor = Math.min(10, inputs.historicalFailures * 3);
  const budgetFactor = Math.min(5, inputs.budgetPressure * 5);

  return Math.min(100, Math.round(complaintFactor + enforcementFactor + responseFactor + historyFactor + budgetFactor));
}

// ─── Record Timeline Event ───────────────────────────────────────────

export async function recordTimelineEvent(params: {
  institutionId: number;
  eventType: string;
  impactScore?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(institutionTimeline).values({
    institutionId: params.institutionId,
    eventType: params.eventType,
    timestamp: Date.now(),
    impactScore: params.impactScore || 0,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
  });
}

// ─── Get Failure Profiles ────────────────────────────────────────────

export async function getFailureProfiles(minProbability?: number): Promise<InstitutionRiskProfileRow[]> {
  const query = minProbability
    ? db.select().from(institutionRiskProfiles).where(gte(institutionRiskProfiles.failureProbability, minProbability))
    : db.select().from(institutionRiskProfiles);

  return query.orderBy(desc(institutionRiskProfiles.failureProbability)).limit(50);
}

// ─── Get Profile Timeline ────────────────────────────────────────────

export async function getProfileTimeline(institutionId: number) {
  return db.select().from(institutionTimeline)
    .where(eq(institutionTimeline.institutionId, institutionId))
    .orderBy(desc(institutionTimeline.timestamp));
}

// ─── Failure Prediction Stats ────────────────────────────────────────

export async function getFailurePredictionStats() {
  const [total] = await db.select({ count: sql<number>`COUNT(*)` }).from(institutionRiskProfiles);
  const [highRisk] = await db.select({ count: sql<number>`COUNT(*)` }).from(institutionRiskProfiles)
    .where(gte(institutionRiskProfiles.failureProbability, 60));
  const [avgProb] = await db.select({ avg: sql<number>`AVG(${institutionRiskProfiles.failureProbability})` })
    .from(institutionRiskProfiles);
  const [totalEvents] = await db.select({ count: sql<number>`COUNT(*)` }).from(institutionTimeline);

  return {
    totalProfiles: total?.count || 0,
    highRiskProfiles: highRisk?.count || 0,
    avgFailureProbability: Math.round(avgProb?.avg || 0),
    totalTimelineEvents: totalEvents?.count || 0,
  };
}
