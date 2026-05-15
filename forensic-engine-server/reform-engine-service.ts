/**
 * Reform Engine Service
 *
 * T1. Pattern data + outcome data → reform candidate identification
 * T2. Reform candidate → reform_registry record with evidence assembly
 * T3. Priority scoring: signal volume, persistence, severity, geographic spread, failure rates
 * T4. Export: policy brief, legislative proposal, agency recommendation memo
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────

export type ReformType = 'legislative_change' | 'regulatory_update' | 'agency_procedure_change' | 'enforcement_priority' | 'public_awareness' | 'data_transparency_requirement';
export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';
export type ReformStatus = 'draft' | 'under_review' | 'approved' | 'published' | 'archived';

export interface ReformRecord {
  reformId: string;
  patternId: string;
  patternType: string;
  harmDomain: string;
  jurisdiction: string;
  reformType: ReformType;
  reformTitle: string;
  reformDescription: string;
  supportingPatterns: string[];
  supportingSignalCount: number;
  supportingOutcomes: string[];
  confidenceScore: number;
  priorityLevel: PriorityLevel;
  status: ReformStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ReformCandidate {
  patternType: string;
  harmDomain: string;
  jurisdiction: string;
  signalCount: number;
  outcomeCount: number;
  avgPressure: number;
  failureRate: number;
  suggestedReformTypes: ReformType[];
  priorityScore: number;
}

// ── T1: Identify Reform Candidates ─────────────────────────────────────

export async function identifyReformCandidates(): Promise<ReformCandidate[]> {
  // T1.1: Query patterns with high signal counts and poor outcomes
  const [patterns] = await db.execute(
    sql`SELECT pr.pattern_type, pr.harm_domains, pr.jurisdiction_scope,
            COUNT(DISTINCT ds.signal_id) as signal_count,
            AVG(CAST(pr.confidence_score AS DECIMAL(10,2))) as avg_pressure
     FROM pattern_registry pr
     LEFT JOIN detected_signals ds ON ds.signal_type = pr.pattern_type
     GROUP BY pr.pattern_type, pr.harm_domains, pr.jurisdiction_scope
     HAVING signal_count >= 2
     ORDER BY avg_pressure DESC
     LIMIT 20`
  );

  // T1.2: Get outcome failure rates per pattern
  const [outcomes] = await db.execute(
    sql`SELECT oo.pattern_id as pattern_type,
            COUNT(*) as total,
            SUM(CASE WHEN oo.outcome_status IN ('failed', 'no_change', 'worsened') THEN 1 ELSE 0 END) as failures
     FROM outcome_registry oo
     GROUP BY oo.pattern_id`
  );
  const outcomeMap = new Map<string, { total: number; failures: number }>();
  for (const o of outcomes as unknown as any[]) {
    outcomeMap.set(o.pattern_type, { total: o.total, failures: o.failures });
  }

  return (patterns as unknown as any[]).map(p => {
    const om = outcomeMap.get(p.pattern_type) || { total: 0, failures: 0 };
    const failureRate = om.total > 0 ? (om.failures / om.total) * 100 : 0;
    const priorityScore = calculatePriorityScore(p.signal_count, Number(p.avg_pressure), failureRate);
    const suggestedReformTypes = suggestReformTypes(p.pattern_type, failureRate, Number(p.avg_pressure));

    return {
      patternType: p.pattern_type,
      harmDomain: p.harm_domains || '',
      jurisdiction: p.jurisdiction_scope || '',
      signalCount: p.signal_count,
      outcomeCount: om.total,
      avgPressure: Number(p.avg_pressure),
      failureRate,
      suggestedReformTypes,
      priorityScore
    };
  });
}

function calculatePriorityScore(signalCount: number, avgPressure: number, failureRate: number): number {
  const signalWeight = Math.min(30, signalCount * 3);
  const pressureWeight = Math.min(30, avgPressure * 0.3);
  const failureWeight = Math.min(40, failureRate * 0.4);
  return Math.min(100, signalWeight + pressureWeight + failureWeight);
}

function suggestReformTypes(patternType: string, failureRate: number, avgPressure: number): ReformType[] {
  const types: ReformType[] = [];
  if (failureRate > 50) types.push('enforcement_priority');
  if (avgPressure > 70) types.push('legislative_change');
  if (patternType.includes('wage') || patternType.includes('labor')) types.push('regulatory_update');
  if (patternType.includes('housing') || patternType.includes('discrimination')) types.push('agency_procedure_change');
  if (types.length === 0) types.push('public_awareness');
  return types;
}

// ── T2: Create Reform Record ───────────────────────────────────────────

export async function createReform(params: {
  patternId?: string;
  patternType: string;
  harmDomain: string;
  jurisdiction: string;
  reformType: ReformType;
  reformTitle: string;
  reformDescription: string;
  supportingPatterns?: string[];
  supportingOutcomes?: string[];
}): Promise<ReformRecord> {
  const reformId = `REF-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const now = Date.now();

  // T2.1: Count supporting signals
  const [sigR] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM detected_signals WHERE signal_type = ${params.patternType}`
  );
  const supportingSignalCount = (sigR as any)[0].cnt;

  // T2.2: Calculate confidence from evidence density
  const confidenceScore = Math.min(100, 40 + supportingSignalCount * 5 + (params.supportingOutcomes?.length || 0) * 10);

  // T2.3: Determine priority
  const priorityLevel: PriorityLevel = confidenceScore >= 80 ? 'critical' : confidenceScore >= 60 ? 'high' : confidenceScore >= 40 ? 'medium' : 'low';

  const patId = params.patternId || null;
  const supPat = JSON.stringify(params.supportingPatterns || []);
  const supOut = JSON.stringify(params.supportingOutcomes || []);

  await db.execute(
    sql`INSERT INTO reform_registry (reform_id, pattern_id, pattern_type, harm_domain, jurisdiction, reform_type, reform_title, reform_description, supporting_patterns, supporting_signal_count, supporting_outcomes, confidence_score, priority_level, status, created_at, updated_at)
     VALUES (${reformId}, ${patId}, ${params.patternType}, ${params.harmDomain}, ${params.jurisdiction},
     ${params.reformType}, ${params.reformTitle}, ${params.reformDescription},
     ${supPat}, ${supportingSignalCount},
     ${supOut}, ${confidenceScore}, ${priorityLevel}, ${'draft'}, ${now}, ${now})`
  );

  return {
    reformId, patternId: params.patternId || '', patternType: params.patternType,
    harmDomain: params.harmDomain, jurisdiction: params.jurisdiction,
    reformType: params.reformType, reformTitle: params.reformTitle,
    reformDescription: params.reformDescription,
    supportingPatterns: params.supportingPatterns || [],
    supportingSignalCount, supportingOutcomes: params.supportingOutcomes || [],
    confidenceScore, priorityLevel, status: 'draft', createdAt: now, updatedAt: now
  };
}

// ── Update Reform Status ───────────────────────────────────────────────

export async function updateReformStatus(reformId: string, status: ReformStatus): Promise<void> {
  const now = Date.now();
  await db.execute(
    sql`UPDATE reform_registry SET status = ${status}, updated_at = ${now} WHERE reform_id = ${reformId}`
  );
}

// ── List Reforms ───────────────────────────────────────────────────────

export async function listReforms(params: {
  status?: ReformStatus;
  patternType?: string;
  jurisdiction?: string;
  limit?: number;
}): Promise<ReformRecord[]> {
  const lim = params.limit || 50;
  let query = sql`SELECT * FROM reform_registry WHERE 1=1`;
  if (params.status) { query = sql`${query} AND status = ${params.status}`; }
  if (params.patternType) { query = sql`${query} AND pattern_type = ${params.patternType}`; }
  if (params.jurisdiction) { query = sql`${query} AND jurisdiction = ${params.jurisdiction}`; }
  query = sql`${query} ORDER BY created_at DESC LIMIT ${lim}`;

  const [rows] = await db.execute(query);
  return (rows as unknown as any[]).map(mapReformRow);
}

function mapReformRow(r: any): ReformRecord {
  return {
    reformId: r.reform_id,
    patternId: r.pattern_id || '',
    patternType: r.pattern_type,
    harmDomain: r.harm_domain || '',
    jurisdiction: r.jurisdiction || '',
    reformType: r.reform_type,
    reformTitle: r.reform_title,
    reformDescription: r.reform_description || '',
    supportingPatterns: safeParseJSON(r.supporting_patterns, []),
    supportingSignalCount: r.supporting_signal_count,
    supportingOutcomes: safeParseJSON(r.supporting_outcomes, []),
    confidenceScore: Number(r.confidence_score),
    priorityLevel: r.priority_level,
    status: r.status,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  };
}

// ── T3: Reform Dashboard ───────────────────────────────────────────────

export async function getReformDashboard(): Promise<{
  totalReforms: number;
  byStatus: { status: string; count: number }[];
  byType: { reformType: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  recentReforms: ReformRecord[];
  candidates: ReformCandidate[];
}> {
  const [totalR] = await db.execute(sql`SELECT COUNT(*) as cnt FROM reform_registry`);
  const [byStatusR] = await db.execute(sql`SELECT status, COUNT(*) as cnt FROM reform_registry GROUP BY status`);
  const [byTypeR] = await db.execute(sql`SELECT reform_type, COUNT(*) as cnt FROM reform_registry GROUP BY reform_type`);
  const [byPriorityR] = await db.execute(sql`SELECT priority_level, COUNT(*) as cnt FROM reform_registry GROUP BY priority_level`);
  const [recentR] = await db.execute(sql`SELECT * FROM reform_registry ORDER BY created_at DESC LIMIT 10`);

  const candidates = await identifyReformCandidates();

  return {
    totalReforms: (totalR as any)[0].cnt,
    byStatus: (byStatusR as unknown as any[]).map(r => ({ status: r.status, count: r.cnt })),
    byType: (byTypeR as unknown as any[]).map(r => ({ reformType: r.reform_type, count: r.cnt })),
    byPriority: (byPriorityR as unknown as any[]).map(r => ({ priority: r.priority_level, count: r.cnt })),
    recentReforms: (recentR as unknown as any[]).map(mapReformRow),
    candidates
  };
}

// ── T4: Export Reform Documents ────────────────────────────────────────

export async function generatePolicyBrief(reformId: string): Promise<string> {
  const [rows] = await db.execute(sql`SELECT * FROM reform_registry WHERE reform_id = ${reformId}`);
  if (!(rows as unknown as any[]).length) throw new Error('Reform not found');
  const r = mapReformRow((rows as any)[0]);

  return `POLICY BRIEF
============

Title: ${r.reformTitle}
Reform Type: ${r.reformType.replace(/_/g, ' ').toUpperCase()}
Jurisdiction: ${r.jurisdiction}
Priority: ${r.priorityLevel.toUpperCase()}
Confidence Score: ${r.confidenceScore}%

PROBLEM STATEMENT
-----------------
${r.reformDescription}

EVIDENCE BASE
-------------
Pattern Type: ${r.patternType}
Harm Domain: ${r.harmDomain}
Supporting Signals: ${r.supportingSignalCount}
Supporting Patterns: ${r.supportingPatterns.length}
Supporting Outcomes: ${r.supportingOutcomes.length}

RECOMMENDATION
--------------
Based on ${r.supportingSignalCount} detected signals and ${r.supportingOutcomes.length} documented outcomes, this reform addresses systemic issues in ${r.harmDomain || r.patternType} within ${r.jurisdiction}.

The recommended action is: ${r.reformType.replace(/_/g, ' ')}.

STATUS
------
Current Status: ${r.status}
Created: ${new Date(r.createdAt).toISOString().split('T')[0]}
`;
}

export async function generateLegislativeProposal(reformId: string): Promise<string> {
  const [rows] = await db.execute(sql`SELECT * FROM reform_registry WHERE reform_id = ${reformId}`);
  if (!(rows as unknown as any[]).length) throw new Error('Reform not found');
  const r = mapReformRow((rows as any)[0]);

  return `LEGISLATIVE PROPOSAL
====================

Proposed: ${r.reformTitle}
Jurisdiction: ${r.jurisdiction}
Type: ${r.reformType.replace(/_/g, ' ')}

SECTION 1: PURPOSE
------------------
This proposal addresses documented systemic harm in the domain of ${r.harmDomain || r.patternType}.

SECTION 2: FINDINGS
-------------------
${r.supportingSignalCount} signals have been detected indicating ongoing harm.
${r.supportingOutcomes.length} intervention outcomes have been documented.
Pattern confidence: ${r.confidenceScore}%.

SECTION 3: PROPOSED ACTION
--------------------------
${r.reformDescription}

SECTION 4: EVIDENCE SUMMARY
----------------------------
Supporting patterns: ${r.supportingPatterns.join(', ') || 'See attached evidence packet'}
Priority classification: ${r.priorityLevel}
`;
}

export async function generateAgencyMemo(reformId: string): Promise<string> {
  const [rows] = await db.execute(sql`SELECT * FROM reform_registry WHERE reform_id = ${reformId}`);
  if (!(rows as unknown as any[]).length) throw new Error('Reform not found');
  const r = mapReformRow((rows as any)[0]);

  return `AGENCY RECOMMENDATION MEMORANDUM
================================

TO: Relevant Regulatory Authority
FROM: Forensic Analysis Engine
DATE: ${new Date().toISOString().split('T')[0]}
RE: ${r.reformTitle}

RECOMMENDATION
--------------
Reform Type: ${r.reformType.replace(/_/g, ' ')}
Priority: ${r.priorityLevel.toUpperCase()}
Jurisdiction: ${r.jurisdiction}

BACKGROUND
----------
${r.reformDescription}

SUPPORTING DATA
---------------
Signal Count: ${r.supportingSignalCount}
Outcome Evidence: ${r.supportingOutcomes.length} documented interventions
Confidence: ${r.confidenceScore}%

REQUESTED ACTION
----------------
${r.reformType === 'enforcement_priority' ? 'Increase enforcement resources and priority for this harm domain.' :
  r.reformType === 'regulatory_update' ? 'Update existing regulations to address identified gaps.' :
  r.reformType === 'agency_procedure_change' ? 'Modify internal procedures to improve response effectiveness.' :
  'Review and act on the identified systemic issues.'}
`;
}

function safeParseJSON(val: any, fallback: any): any {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}
