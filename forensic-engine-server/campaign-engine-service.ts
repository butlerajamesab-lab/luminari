/**
 * Campaign Engine Service
 *
 * T1. Critical pattern detection (pressure_index > 85 OR trend = 'critical') → auto-create campaign
 * T2. Campaign follows 6-stage pipeline:
 *     Stage 1: Detection — Pattern identified, evidence assembled
 *     Stage 2: Strategy — Reform package generated, coalition readiness assessed
 *     Stage 3: Reform Package — Formal reform package created and reviewed
 *     Stage 4: Coalition Building — Members recruited, targets identified
 *     Stage 5: Advocacy — Actions executed, pressure applied
 *     Stage 6: Policy Change — Outcome recorded, impact measured
 * T3. Each stage transition logs an action and updates stage_history
 * T4. Campaign actions track who did what at each stage
 * T5. Outcomes record final results and policy changes
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ── Types ──────────────────────────────────────────────────────────────

export const CAMPAIGN_STAGES = [
  { number: 1, name: "Detection", description: "Pattern identified, evidence assembled, initial analysis complete" },
  { number: 2, name: "Strategy", description: "Reform package generated, coalition readiness assessed, approach determined" },
  { number: 3, name: "Reform Package", description: "Formal reform package created, reviewed, and prepared for submission" },
  { number: 4, name: "Coalition Building", description: "Coalition members recruited, campaign targets identified, roles assigned" },
  { number: 5, name: "Advocacy", description: "Actions executed — meetings, filings, media outreach, pressure applied" },
  { number: 6, name: "Policy Change", description: "Outcome recorded, impact measured, lessons documented" },
] as const;

export interface Campaign {
  id: string;
  name: string;
  patternId: string | null;
  jurisdiction: string;
  description: string | null;
  impactIndex: number;
  status: string;
  currentStage: number;
  stageHistory: StageHistoryEntry[];
  reformPackageId: string | null;
  startedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StageHistoryEntry {
  stage: number;
  stageName: string;
  enteredAt: string;
  completedAt?: string;
  notes?: string;
}

export interface CampaignAction {
  id: string;
  campaignId: string;
  stageNumber: number;
  date: string;
  action: string;
  responsibleParty: string;
  responsiblePartyType: string;
  impactScore: number;
  result: string | null;
  source: string | null;
  sourceId: string | null;
  createdAt: string;
}

export interface CampaignOutcome {
  id: string;
  campaignId: string;
  date: string;
  result: string;
  impactScore: number;
  notes: string | null;
  policyChangeId: string | null;
  createdAt: string;
}

export interface CampaignDashboard {
  totalCampaigns: number;
  byStatus: Record<string, number>;
  byStage: Record<number, number>;
  recentCampaigns: Campaign[];
  recentActions: CampaignAction[];
  totalActions: number;
  totalOutcomes: number;
  averageImpactIndex: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

function safeJsonParse(val: any, fallback: any = []): any {
  if (!val) return fallback;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function mapCampaign(r: any): Campaign {
  return {
    id: r.id, name: r.name, patternId: r.pattern_id, jurisdiction: r.jurisdiction,
    description: r.description, impactIndex: r.impact_index || 0, status: r.status,
    currentStage: r.current_stage || 1, stageHistory: safeJsonParse(r.stage_history),
    reformPackageId: r.reform_package_id, startedAt: r.started_at, createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapAction(r: any): CampaignAction {
  return {
    id: r.id, campaignId: r.campaign_id, stageNumber: r.stage_number, date: r.date,
    action: r.action, responsibleParty: r.responsible_party,
    responsiblePartyType: r.responsible_party_type, impactScore: r.impact_score || 0,
    result: r.result, source: r.source, sourceId: r.source_id, createdAt: r.created_at,
  };
}

function mapOutcome(r: any): CampaignOutcome {
  return {
    id: r.id, campaignId: r.campaign_id, date: r.date, result: r.result,
    impactScore: r.impact_score || 0, notes: r.notes,
    policyChangeId: r.policy_change_id, createdAt: r.created_at,
  };
}

// ── Auto-Create from Critical Patterns ─────────────────────────────────

export async function checkAndCreateCampaigns(): Promise<Campaign[]> {
  // Find patterns with pressure_index > 85 or trend = 'critical' that don't already have campaigns
  const [criticalPatterns] = await db.execute(sql`
    SELECT pr.id, pr.pattern_type, pr.jurisdiction, pr.description, pr.pressure_index, pr.trend
    FROM pattern_registry pr
    WHERE (pr.pressure_index > 85 OR pr.trend = 'critical')
    AND pr.id NOT IN (SELECT COALESCE(pattern_id, '') FROM campaigns)
    ORDER BY pr.pressure_index DESC
    LIMIT 10
  `);

  const created: Campaign[] = [];
  for (const p of criticalPatterns as unknown as any[]) {
    const campaign = await createCampaign({
      name: `Campaign: ${p.pattern_type} in ${p.jurisdiction}`,
      patternId: p.id,
      jurisdiction: p.jurisdiction,
      description: p.description || `Auto-created campaign for critical pattern: ${p.pattern_type}`,
      impactIndex: p.pressure_index || 90,
    });
    created.push(campaign);
  }
  return created;
}

// ── CRUD ───────────────────────────────────────────────────────────────

export async function createCampaign(params: {
  name: string;
  patternId?: string;
  jurisdiction: string;
  description?: string;
  impactIndex?: number;
}): Promise<Campaign> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const stageHistory: StageHistoryEntry[] = [{
    stage: 1, stageName: "Detection", enteredAt: now,
  }];
  const stageHistoryJson = JSON.stringify(stageHistory);
  const patternId = params.patternId || null;
  const description = params.description || null;
  const impactIndex = params.impactIndex || 0;

  await db.execute(sql`
    INSERT INTO campaigns (id, name, pattern_id, jurisdiction, description, impact_index, status, current_stage, stage_history, started_at)
    VALUES (${id}, ${params.name}, ${patternId}, ${params.jurisdiction}, ${description}, ${impactIndex}, ${"analysis"}, ${1}, ${stageHistoryJson}, NOW())
  `);

  // Log the creation action
  await logAction({
    campaignId: id, stageNumber: 1, action: "Campaign created",
    responsibleParty: "System", responsiblePartyType: "system",
    impactScore: 0, source: "auto_detection",
  });

  return getCampaign(id) as Promise<Campaign>;
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const [rows] = await db.execute(sql`SELECT * FROM campaigns WHERE id = ${id}`);
  const r = (rows as unknown as any[])[0];
  return r ? mapCampaign(r) : null;
}

export async function listCampaigns(params?: {
  status?: string;
  jurisdiction?: string;
  stage?: number;
  limit?: number;
}): Promise<Campaign[]> {
  // Build dynamic query using conditional sql chunks
  const status = params?.status;
  const jurisdiction = params?.jurisdiction;
  const stage = params?.stage;
  const limit = params?.limit || 50;

  if (status && jurisdiction && stage) {
    const [rows] = await db.execute(sql`SELECT * FROM campaigns WHERE status = ${status} AND jurisdiction = ${jurisdiction} AND current_stage = ${stage} ORDER BY updated_at DESC LIMIT ${limit}`);
    return (rows as unknown as any[]).map(mapCampaign);
  } else if (status && jurisdiction) {
    const [rows] = await db.execute(sql`SELECT * FROM campaigns WHERE status = ${status} AND jurisdiction = ${jurisdiction} ORDER BY updated_at DESC LIMIT ${limit}`);
    return (rows as unknown as any[]).map(mapCampaign);
  } else if (status && stage) {
    const [rows] = await db.execute(sql`SELECT * FROM campaigns WHERE status = ${status} AND current_stage = ${stage} ORDER BY updated_at DESC LIMIT ${limit}`);
    return (rows as unknown as any[]).map(mapCampaign);
  } else if (jurisdiction && stage) {
    const [rows] = await db.execute(sql`SELECT * FROM campaigns WHERE jurisdiction = ${jurisdiction} AND current_stage = ${stage} ORDER BY updated_at DESC LIMIT ${limit}`);
    return (rows as unknown as any[]).map(mapCampaign);
  } else if (status) {
    const [rows] = await db.execute(sql`SELECT * FROM campaigns WHERE status = ${status} ORDER BY updated_at DESC LIMIT ${limit}`);
    return (rows as unknown as any[]).map(mapCampaign);
  } else if (jurisdiction) {
    const [rows] = await db.execute(sql`SELECT * FROM campaigns WHERE jurisdiction = ${jurisdiction} ORDER BY updated_at DESC LIMIT ${limit}`);
    return (rows as unknown as any[]).map(mapCampaign);
  } else if (stage) {
    const [rows] = await db.execute(sql`SELECT * FROM campaigns WHERE current_stage = ${stage} ORDER BY updated_at DESC LIMIT ${limit}`);
    return (rows as unknown as any[]).map(mapCampaign);
  } else {
    const [rows] = await db.execute(sql`SELECT * FROM campaigns ORDER BY updated_at DESC LIMIT ${limit}`);
    return (rows as unknown as any[]).map(mapCampaign);
  }
}

// ── Stage Advancement ──────────────────────────────────────────────────

export async function advanceCampaignStage(campaignId: string, notes?: string): Promise<Campaign> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.currentStage >= 6) throw new Error("Campaign already at final stage");

  const now = new Date().toISOString();
  const newStage = campaign.currentStage + 1;
  const stageDef = CAMPAIGN_STAGES.find(s => s.number === newStage)!;

  // Complete current stage
  const history = [...campaign.stageHistory];
  const currentEntry = history.find(h => h.stage === campaign.currentStage && !h.completedAt);
  if (currentEntry) currentEntry.completedAt = now;

  // Add new stage entry
  history.push({ stage: newStage, stageName: stageDef.name, enteredAt: now, notes });

  // Determine status based on stage
  let status = "analysis";
  if (newStage === 2) status = "strategy";
  else if (newStage === 3) status = "reform_package";
  else if (newStage === 4) status = "coalition_building";
  else if (newStage === 5) status = "advocacy";
  else if (newStage === 6) status = "policy_change";

  const historyJson = JSON.stringify(history);
  await db.execute(sql`
    UPDATE campaigns SET current_stage = ${newStage}, status = ${status}, stage_history = ${historyJson}, updated_at = NOW()
    WHERE id = ${campaignId}
  `);

  // Log the advancement
  await logAction({
    campaignId, stageNumber: newStage,
    action: `Advanced to Stage ${newStage}: ${stageDef.name}`,
    responsibleParty: "System", responsiblePartyType: "system",
    impactScore: 10, source: "stage_advancement",
  });

  return getCampaign(campaignId) as Promise<Campaign>;
}

// ── Link Reform Package ────────────────────────────────────────────────

export async function linkReformPackage(campaignId: string, reformPackageId: string): Promise<void> {
  await db.execute(sql`
    UPDATE campaigns SET reform_package_id = ${reformPackageId}, updated_at = NOW() WHERE id = ${campaignId}
  `);

  await logAction({
    campaignId, stageNumber: 3,
    action: `Reform package ${reformPackageId} linked to campaign`,
    responsibleParty: "System", responsiblePartyType: "system",
    impactScore: 15, source: "reform_package",
  });
}

// ── Coalition Membership ───────────────────────────────────────────────

export async function addCoalitionMember(params: {
  campaignId: string;
  memberType: string;
  memberId: string;
  memberName: string;
  roleInCoalition?: string;
  commitmentLevel?: string;
}): Promise<string> {
  const id = randomUUID();
  const role = params.roleInCoalition || "member";
  const commitment = params.commitmentLevel || "medium";
  await db.execute(sql`
    INSERT INTO coalition_memberships (id, campaign_id, member_type, member_id, member_name, role_in_coalition, commitment_level)
    VALUES (${id}, ${params.campaignId}, ${params.memberType}, ${params.memberId}, ${params.memberName}, ${role}, ${commitment})
  `);

  await logAction({
    campaignId: params.campaignId, stageNumber: 4,
    action: `Coalition member added: ${params.memberName} (${params.memberType})`,
    responsibleParty: "System", responsiblePartyType: "system",
    impactScore: 5, source: "coalition_building",
  });

  return id;
}

export async function getCoalitionMembers(campaignId: string): Promise<any[]> {
  const [rows] = await db.execute(sql`
    SELECT * FROM coalition_memberships WHERE campaign_id = ${campaignId} ORDER BY joined_at DESC
  `);
  return (rows as unknown as any[]).map(r => ({
    id: r.id, campaignId: r.campaign_id, memberType: r.member_type, memberId: r.member_id,
    memberName: r.member_name, roleInCoalition: r.role_in_coalition, joinedAt: r.joined_at,
    status: r.status, commitmentLevel: r.commitment_level,
    contributions: safeJsonParse(r.contributions), notes: r.notes,
  }));
}

// ── Campaign Targets ───────────────────────────────────────────────────

export async function addCampaignTarget(params: {
  campaignId: string;
  targetType: string;
  targetId: string;
  targetName: string;
  priority?: string;
  strategyNotes?: string;
}): Promise<string> {
  const id = randomUUID();
  const priority = params.priority || "medium";
  const strategyNotes = params.strategyNotes || null;
  await db.execute(sql`
    INSERT INTO coalition_campaign_targets (id, campaign_id, target_type, target_id, target_name, priority, strategy_notes)
    VALUES (${id}, ${params.campaignId}, ${params.targetType}, ${params.targetId}, ${params.targetName}, ${priority}, ${strategyNotes})
  `);

  await logAction({
    campaignId: params.campaignId, stageNumber: 4,
    action: `Campaign target added: ${params.targetName} (${params.targetType})`,
    responsibleParty: "System", responsiblePartyType: "system",
    impactScore: 5, source: "target_identification",
  });

  return id;
}

export async function getCampaignTargets(campaignId: string): Promise<any[]> {
  const [rows] = await db.execute(sql`
    SELECT * FROM coalition_campaign_targets WHERE campaign_id = ${campaignId} ORDER BY priority ASC, created_at DESC
  `);
  return (rows as unknown as any[]).map(r => ({
    id: r.id, campaignId: r.campaign_id, targetType: r.target_type, targetId: r.target_id,
    targetName: r.target_name, priority: r.priority, outreachStatus: r.outreach_status,
    lastContacted: r.last_contacted, response: r.response, assignedTo: r.assigned_to,
    strategyNotes: r.strategy_notes,
  }));
}

export async function updateTargetStatus(targetId: string, status: string, response?: string): Promise<void> {
  const resp = response || null;
  await db.execute(sql`
    UPDATE coalition_campaign_targets SET outreach_status = ${status}, response = ${resp}, last_contacted = NOW(), updated_at = NOW()
    WHERE id = ${targetId}
  `);
}

// ── Actions ────────────────────────────────────────────────────────────

export async function logAction(params: {
  campaignId: string;
  stageNumber: number;
  action: string;
  responsibleParty: string;
  responsiblePartyType: string;
  impactScore?: number;
  result?: string;
  source?: string;
  sourceId?: string;
}): Promise<string> {
  const id = randomUUID();
  const impactScore = params.impactScore || 0;
  const result = params.result || null;
  const source = params.source || null;
  const sourceId = params.sourceId || null;
  await db.execute(sql`
    INSERT INTO campaign_actions (id, campaign_id, stage_number, date, action, responsible_party, responsible_party_type, impact_score, result, source, source_id)
    VALUES (${id}, ${params.campaignId}, ${params.stageNumber}, NOW(), ${params.action}, ${params.responsibleParty}, ${params.responsiblePartyType}, ${impactScore}, ${result}, ${source}, ${sourceId})
  `);
  return id;
}

export async function getCampaignActions(campaignId: string, stageNumber?: number): Promise<CampaignAction[]> {
  if (stageNumber) {
    const [rows] = await db.execute(sql`
      SELECT * FROM campaign_actions WHERE campaign_id = ${campaignId} AND stage_number = ${stageNumber} ORDER BY date DESC
    `);
    return (rows as unknown as any[]).map(mapAction);
  } else {
    const [rows] = await db.execute(sql`
      SELECT * FROM campaign_actions WHERE campaign_id = ${campaignId} ORDER BY date DESC
    `);
    return (rows as unknown as any[]).map(mapAction);
  }
}

// ── Outcomes ───────────────────────────────────────────────────────────

export async function recordOutcome(params: {
  campaignId: string;
  result: string;
  impactScore?: number;
  notes?: string;
  policyChangeId?: string;
}): Promise<string> {
  const id = randomUUID();
  const impactScore = params.impactScore || 0;
  const notes = params.notes || null;
  const policyChangeId = params.policyChangeId || null;
  await db.execute(sql`
    INSERT INTO campaign_outcomes (id, campaign_id, date, result, impact_score, notes, policy_change_id)
    VALUES (${id}, ${params.campaignId}, NOW(), ${params.result}, ${impactScore}, ${notes}, ${policyChangeId})
  `);

  await logAction({
    campaignId: params.campaignId, stageNumber: 6,
    action: `Outcome recorded: ${params.result}`,
    responsibleParty: "System", responsiblePartyType: "system",
    impactScore: params.impactScore || 0, source: "outcome_recording",
  });

  return id;
}

export async function getCampaignOutcomes(campaignId: string): Promise<CampaignOutcome[]> {
  const [rows] = await db.execute(sql`
    SELECT * FROM campaign_outcomes WHERE campaign_id = ${campaignId} ORDER BY date DESC
  `);
  return (rows as unknown as any[]).map(mapOutcome);
}

// ── Dashboard ──────────────────────────────────────────────────────────

export async function getCampaignDashboard(): Promise<CampaignDashboard> {
  const [countRows] = await db.execute(sql`SELECT COUNT(*) as c FROM campaigns`);
  const totalCampaigns = Number((countRows as unknown as any[])[0]?.c || 0);

  const [statusRows] = await db.execute(sql`SELECT status, COUNT(*) as c FROM campaigns GROUP BY status`);
  const byStatus: Record<string, number> = {};
  for (const r of statusRows as unknown as any[]) byStatus[r.status] = Number(r.c);

  const [stageRows] = await db.execute(sql`SELECT current_stage, COUNT(*) as c FROM campaigns GROUP BY current_stage`);
  const byStage: Record<number, number> = {};
  for (const r of stageRows as unknown as any[]) byStage[Number(r.current_stage)] = Number(r.c);

  const [recentRows] = await db.execute(sql`SELECT * FROM campaigns ORDER BY updated_at DESC LIMIT 10`);
  const recentCampaigns = (recentRows as unknown as any[]).map(mapCampaign);

  const [actionCountRows] = await db.execute(sql`SELECT COUNT(*) as c FROM campaign_actions`);
  const totalActions = Number((actionCountRows as unknown as any[])[0]?.c || 0);

  const [recentActionRows] = await db.execute(sql`SELECT * FROM campaign_actions ORDER BY date DESC LIMIT 10`);
  const recentActions = (recentActionRows as unknown as any[]).map(mapAction);

  const [outcomeCountRows] = await db.execute(sql`SELECT COUNT(*) as c FROM campaign_outcomes`);
  const totalOutcomes = Number((outcomeCountRows as unknown as any[])[0]?.c || 0);

  const [avgRows] = await db.execute(sql`SELECT AVG(impact_index) as avg_impact FROM campaigns`);
  const averageImpactIndex = Math.round(Number((avgRows as unknown as any[])[0]?.avg_impact || 0));

  return {
    totalCampaigns, byStatus, byStage, recentCampaigns, recentActions,
    totalActions, totalOutcomes, averageImpactIndex,
  };
}

// ── Full Campaign Detail ───────────────────────────────────────────────

export async function getCampaignDetail(campaignId: string): Promise<{
  campaign: Campaign;
  actions: CampaignAction[];
  outcomes: CampaignOutcome[];
  members: any[];
  targets: any[];
} | null> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) return null;

  const [actions, outcomes, members, targets] = await Promise.all([
    getCampaignActions(campaignId),
    getCampaignOutcomes(campaignId),
    getCoalitionMembers(campaignId),
    getCampaignTargets(campaignId),
  ]);

  return { campaign, actions, outcomes, members, targets };
}
