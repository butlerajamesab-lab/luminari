/**
 * Policy Change Engine Service
 *
 * T1. Reform records + policy targets → policy_change_registry entries
 * T2. Target resolver: match reform to policy_targets via policy_target_mapping
 * T3. Coalition layer: link advocacy_organizations to reforms via advocacy_action_registry
 * T4. Reform package generator: bundle reforms + evidence + targets + coalition into exportable packages
 * T5. Policy change dashboard: surface all active policy change efforts
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────

export type PolicyChangeStatus = 'identified' | 'researching' | 'drafting' | 'coalition_building' | 'submitted' | 'under_review' | 'enacted' | 'rejected' | 'archived';

export interface PolicyChangeRecord {
  changeId: string;
  reformId: string;
  targetId: string;
  targetName: string;
  targetType: string;
  jurisdiction: string;
  changeTitle: string;
  changeDescription: string;
  status: PolicyChangeStatus;
  supportingEvidenceCount: number;
  coalitionPartners: string[];
  submissionDate: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface PolicyTarget {
  targetId: string;
  targetName: string;
  targetType: string;
  jurisdiction: string;
  contactInfo: string;
  website: string;
}

export interface CoalitionPartner {
  orgId: string;
  orgName: string;
  orgType: string;
  focusAreas: string;
  jurisdiction: string;
  actionType: string;
  assignedAt: number;
}

export interface ReformPackage {
  reformId: string;
  reformTitle: string;
  policyChange: PolicyChangeRecord;
  target: PolicyTarget;
  coalition: CoalitionPartner[];
  evidenceSummary: { signalCount: number; outcomeCount: number; patternType: string };
  documents: { policyBrief: string; legislativeProposal: string; agencyMemo: string };
}

// ── T1: Create Policy Change from Reform ───────────────────────────────

export async function createPolicyChange(params: {
  reformId: string;
  targetId: string;
  changeTitle: string;
  changeDescription: string;
}): Promise<PolicyChangeRecord> {
  const changeId = `PCH-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const now = Date.now();

  // T1.1: Resolve target info
  const [targetRows] = await db.execute(
    sql`SELECT * FROM policy_targets WHERE target_id = ${params.targetId}`
  );
  const target = (targetRows as unknown as any[])[0];
  if (!target) throw new Error(`Policy target ${params.targetId} not found`);

  // T1.2: Count supporting evidence from the reform
  const [reformRows] = await db.execute(
    sql`SELECT supporting_signal_count FROM reform_registry WHERE reform_id = ${params.reformId}`
  );
  const evidenceCount = (reformRows as unknown as any[])[0]?.supporting_signal_count || 0;

  // T1.3: Insert policy change record
  // policy_change_registry columns: change_id, pattern_type, harm_domain, jurisdiction, reform_type,
  // target_institution, target_role, proposal_title, proposal_summary, supporting_pattern_ids,
  // supporting_signal_count, supporting_outcome_ids, priority_score, urgency_level, evidence_strength,
  // target_readiness, status, created_at, updated_at
  const targetName = target.institution_name;
  const targetType = target.target_type;
  const jurisdiction = target.jurisdiction;

  await db.execute(
    sql`INSERT INTO policy_change_registry (change_id, pattern_type, harm_domain, jurisdiction, reform_type,
      target_institution, target_role, proposal_title, proposal_summary, supporting_pattern_ids,
      supporting_signal_count, supporting_outcome_ids, priority_score, urgency_level, evidence_strength,
      target_readiness, status, created_at, updated_at)
     VALUES (${changeId}, ${'reform_linked'}, ${'general'}, ${jurisdiction}, ${'legislative_fix'},
     ${targetName}, ${targetType}, ${params.changeTitle}, ${params.changeDescription}, ${JSON.stringify([params.reformId])},
     ${evidenceCount}, ${'[]'}, ${50}, ${'medium'}, ${'moderate'},
     ${'not_ready'}, ${'draft'}, ${now}, ${now})`
  );

  return {
    changeId, reformId: params.reformId, targetId: params.targetId,
    targetName, targetType,
    jurisdiction, changeTitle: params.changeTitle,
    changeDescription: params.changeDescription, status: 'draft' as any,
    supportingEvidenceCount: evidenceCount, coalitionPartners: [],
    submissionDate: null, createdAt: now, updatedAt: now
  };
}

// ── T2: Resolve Targets for Reform ─────────────────────────────────────

export async function resolveTargetsForReform(reformId: string): Promise<PolicyTarget[]> {
  // T2.1: Get reform details
  const [reformRows] = await db.execute(
    sql`SELECT jurisdiction, reform_type, pattern_type FROM reform_registry WHERE reform_id = ${reformId}`
  );
  if (!(reformRows as unknown as any[]).length) return [];
  const reform = (reformRows as any)[0];

  // T2.2: Find matching targets by jurisdiction
  const jur = reform.jurisdiction;
  const [rows] = await db.execute(
    sql`SELECT * FROM policy_targets WHERE jurisdiction = ${jur} OR jurisdiction = ${'federal'}`
  );
  return (rows as unknown as any[]).map(r => ({
    targetId: r.target_id,
    targetName: r.institution_name,
    targetType: r.target_type,
    jurisdiction: r.jurisdiction,
    contactInfo: r.contact_method || '',
    website: r.notes || ''
  }));
}

// ── T3: Coalition Layer ────────────────────────────────────────────────

export async function addCoalitionPartner(params: {
  changeId: string;
  orgId: string;
  actionType: string;
}): Promise<CoalitionPartner> {
  const now = Date.now();
  const actionId = `ACT-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // T3.1: Get org info
  const [orgRows] = await db.execute(
    sql`SELECT * FROM advocacy_organizations WHERE id = ${Number(params.orgId)}`
  );
  const org = (orgRows as unknown as any[])[0];
  if (!org) throw new Error(`Organization ${params.orgId} not found`);

  // T3.2: Register action in advocacy_action_registry
  // Columns: action_id, change_id, organization_name, action_type, recipient_target, packet_generated, sent_at, response_status, notes, created_at
  await db.execute(
    sql`INSERT INTO advocacy_action_registry (action_id, change_id, organization_name, action_type, recipient_target, packet_generated, response_status, notes, created_at)
     VALUES (${actionId}, ${params.changeId}, ${org.name}, ${params.actionType}, ${'TBD'}, ${0}, ${'pending'}, ${''}, ${now})`
  );

  return {
    orgId: String(params.orgId),
    orgName: org.name,
    orgType: org.org_type || '',
    focusAreas: '',
    jurisdiction: org.jurisdiction || '',
    actionType: params.actionType,
    assignedAt: now
  };
}

export async function getCoalitionForChange(changeId: string): Promise<CoalitionPartner[]> {
  const [rows] = await db.execute(
    sql`SELECT aar.organization_name, aar.action_type, aar.created_at
     FROM advocacy_action_registry aar
     WHERE aar.change_id = ${changeId}
     ORDER BY aar.created_at DESC`
  );
  return (rows as unknown as any[]).map(r => ({
    orgId: '',
    orgName: r.organization_name || '',
    orgType: '',
    focusAreas: '',
    jurisdiction: '',
    actionType: r.action_type,
    assignedAt: Number(r.created_at)
  }));
}

// ── Update Policy Change Status ────────────────────────────────────────

export async function updatePolicyChangeStatus(changeId: string, status: string): Promise<void> {
  const now = Date.now();
  // Map generic statuses to the enum values in the DB
  const statusMap: Record<string, string> = {
    'identified': 'draft',
    'researching': 'draft',
    'drafting': 'draft',
    'coalition_building': 'ready_for_review',
    'submitted': 'approved',
    'under_review': 'ready_for_review',
    'enacted': 'published',
    'rejected': 'escalated',
    'archived': 'escalated',
    // Direct enum values
    'draft': 'draft',
    'ready_for_review': 'ready_for_review',
    'approved': 'approved',
    'published': 'published',
    'escalated': 'escalated'
  };
  const dbStatus = statusMap[status] || 'draft';
  await db.execute(
    sql`UPDATE policy_change_registry SET status = ${dbStatus}, updated_at = ${now} WHERE change_id = ${changeId}`
  );
}

// ── List Policy Changes ────────────────────────────────────────────────

export async function listPolicyChanges(params: {
  status?: string;
  jurisdiction?: string;
  limit?: number;
}): Promise<PolicyChangeRecord[]> {
  const lim = params.limit || 50;
  let query = sql`SELECT * FROM policy_change_registry WHERE 1=1`;
  if (params.status) { query = sql`${query} AND status = ${params.status}`; }
  if (params.jurisdiction) { query = sql`${query} AND jurisdiction = ${params.jurisdiction}`; }
  query = sql`${query} ORDER BY created_at DESC LIMIT ${lim}`;

  const [rows] = await db.execute(query);
  return (rows as unknown as any[]).map(mapPolicyChangeRow);
}

function mapPolicyChangeRow(r: any): PolicyChangeRecord {
  return {
    changeId: r.change_id,
    reformId: r.supporting_pattern_ids ? (safeParseJSON(r.supporting_pattern_ids, [])[0] || '') : '',
    targetId: '',
    targetName: r.target_institution || '',
    targetType: r.target_role || '',
    jurisdiction: r.jurisdiction || '',
    changeTitle: r.proposal_title,
    changeDescription: r.proposal_summary || '',
    status: r.status,
    supportingEvidenceCount: r.supporting_signal_count || 0,
    coalitionPartners: safeParseJSON(r.supporting_outcome_ids, []),
    submissionDate: null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  };
}

// ── T4: Generate Reform Package ────────────────────────────────────────

export async function generateReformPackage(changeId: string): Promise<ReformPackage> {
  // T4.1: Get the policy change
  const [changeRows] = await db.execute(
    sql`SELECT * FROM policy_change_registry WHERE change_id = ${changeId}`
  );
  if (!(changeRows as unknown as any[]).length) throw new Error('Policy change not found');
  const change = mapPolicyChangeRow((changeRows as any)[0]);

  // T4.2: Get the reform (from supporting_pattern_ids)
  const reformId = change.reformId;
  let reform: any = null;
  if (reformId) {
    const [reformRows] = await db.execute(
      sql`SELECT * FROM reform_registry WHERE reform_id = ${reformId}`
    );
    reform = (reformRows as unknown as any[])[0];
  }

  // T4.3: Get the target
  const targetInst = change.targetName;
  const [targetRows] = await db.execute(
    sql`SELECT * FROM policy_targets WHERE institution_name = ${targetInst} LIMIT 1`
  );
  const target = (targetRows as unknown as any[])[0] || {};

  // T4.4: Get coalition
  const coalition = await getCoalitionForChange(changeId);

  // T4.5: Evidence summary
  const patternType = reform?.pattern_type || '';
  const [sigR] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM detected_signals WHERE signal_type = ${patternType}`
  );
  const [outR] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM outcome_registry WHERE pattern_id = ${patternType}`
  );

  // T4.6: Generate documents
  const policyBrief = reform ? generateBriefText(reform, target, coalition) : '';
  const legislativeProposal = reform ? generateProposalText(reform, target) : '';
  const agencyMemo = reform ? generateMemoText(reform, target) : '';

  return {
    reformId: change.reformId,
    reformTitle: reform?.reform_title || change.changeTitle,
    policyChange: change,
    target: {
      targetId: target.target_id || '',
      targetName: target.institution_name || change.targetName,
      targetType: target.target_type || change.targetType,
      jurisdiction: target.jurisdiction || change.jurisdiction,
      contactInfo: target.contact_method || '',
      website: target.notes || ''
    },
    coalition,
    evidenceSummary: {
      signalCount: (sigR as any)[0].cnt,
      outcomeCount: (outR as any)[0].cnt,
      patternType
    },
    documents: { policyBrief, legislativeProposal, agencyMemo }
  };
}

function generateBriefText(reform: any, target: any, coalition: CoalitionPartner[]): string {
  return `POLICY BRIEF: ${reform.reform_title}\nTarget: ${target.institution_name || 'TBD'}\nJurisdiction: ${reform.jurisdiction}\nCoalition: ${coalition.map(c => c.orgName).join(', ') || 'None yet'}\nPriority: ${reform.priority_level}\nEvidence: ${reform.supporting_signal_count} signals\n${reform.reform_description}`;
}

function generateProposalText(reform: any, target: any): string {
  return `LEGISLATIVE PROPOSAL: ${reform.reform_title}\nTarget Body: ${target.institution_name || 'TBD'}\nJurisdiction: ${reform.jurisdiction}\nType: ${reform.reform_type}\n${reform.reform_description}`;
}

function generateMemoText(reform: any, target: any): string {
  return `AGENCY MEMO: ${reform.reform_title}\nTo: ${target.institution_name || 'TBD'}\nDate: ${new Date().toISOString().split('T')[0]}\nPriority: ${reform.priority_level}\n${reform.reform_description}`;
}

// ── T5: Policy Change Dashboard ────────────────────────────────────────

export async function getPolicyChangeDashboard(): Promise<{
  totalChanges: number;
  byStatus: { status: string; count: number }[];
  byJurisdiction: { jurisdiction: string; count: number }[];
  activeCoalitions: number;
  recentChanges: PolicyChangeRecord[];
  targets: PolicyTarget[];
}> {
  const [totalR] = await db.execute(sql`SELECT COUNT(*) as cnt FROM policy_change_registry`);
  const [byStatusR] = await db.execute(sql`SELECT status, COUNT(*) as cnt FROM policy_change_registry GROUP BY status`);
  const [byJurisR] = await db.execute(sql`SELECT jurisdiction, COUNT(*) as cnt FROM policy_change_registry GROUP BY jurisdiction`);
  const [coalR] = await db.execute(sql`SELECT COUNT(DISTINCT change_id) as cnt FROM advocacy_action_registry`);
  const [recentR] = await db.execute(sql`SELECT * FROM policy_change_registry ORDER BY created_at DESC LIMIT 10`);
  const [targetR] = await db.execute(sql`SELECT * FROM policy_targets ORDER BY institution_name`);

  return {
    totalChanges: (totalR as any)[0].cnt,
    byStatus: (byStatusR as unknown as any[]).map(r => ({ status: r.status, count: r.cnt })),
    byJurisdiction: (byJurisR as unknown as any[]).map(r => ({ jurisdiction: r.jurisdiction, count: r.cnt })),
    activeCoalitions: (coalR as any)[0].cnt,
    recentChanges: (recentR as unknown as any[]).map(mapPolicyChangeRow),
    targets: (targetR as unknown as any[]).map(r => ({
      targetId: r.target_id,
      targetName: r.institution_name,
      targetType: r.target_type,
      jurisdiction: r.jurisdiction,
      contactInfo: r.contact_method || '',
      website: r.notes || ''
    }))
  };
}

// ── List Advocacy Organizations ────────────────────────────────────────

export async function listAdvocacyOrgs(params: {
  jurisdiction?: string;
  type?: string;
  limit?: number;
}): Promise<{ id: number; name: string; type: string; focusAreas: string; jurisdiction: string; website: string }[]> {
  const lim = params.limit || 100;
  let query = sql`SELECT * FROM advocacy_organizations WHERE 1=1`;
  if (params.jurisdiction) { query = sql`${query} AND jurisdiction = ${params.jurisdiction}`; }
  if (params.type) { query = sql`${query} AND org_type = ${params.type}`; }
  query = sql`${query} ORDER BY name LIMIT ${lim}`;

  const [rows] = await db.execute(query);
  return (rows as unknown as any[]).map(r => ({
    id: r.id,
    name: r.name,
    type: r.org_type || '',
    focusAreas: '',
    jurisdiction: r.jurisdiction || '',
    website: r.website || ''
  }));
}

function safeParseJSON(val: any, fallback: any): any {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}
