/**
 * Dataset Connector Service
 * 
 * Bridges public dataset tables (consumer_complaints, campaign_finance_records,
 * enforcement_records, policy_change_registry) to system engines:
 * - Signal Engine: generates signals from complaints and enforcement actions
 * - Pattern Registry: identifies repeat offenders, regulatory gaps
 * - Trend & Pressure Engine: tracks complaint growth, enforcement frequency
 * - Strategy Engine: intervention targeting from enforcement data
 * - Reform Package Engine: legislative change proposals from policy registry
 * 
 * Also provides scheduled ingestion job management and dataset statistics.
 */

import { db } from "./db";
import { dataStreamRegistry } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";

function boundedLimit(value: number, fallback: number, maximum: number = 200): number {
  return Number.isFinite(value)
    ? Math.min(maximum, Math.max(1, Math.trunc(value)))
    : fallback;
}

// ============================================================
// Types
// ============================================================
export interface DatasetStats {
  dataset_id: string;
  dataset_name: string;
  source: string;
  jurisdiction: string;
  domain: string;
  record_count: number;
  last_ingested: number | null;
  enabled: boolean;
  update_frequency: string;
}

export interface IngestionJobConfig {
  dataset_id: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  cron_expression: string;
  enabled: boolean;
}

export interface SignalFromDataset {
  signalType: string;
  source: string;
  entity: string;
  jurisdiction: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  dataPoints: number;
  claimType: string;
}

export interface PatternFromDataset {
  patternType: string;
  entity: string;
  jurisdiction: string;
  occurrences: number;
  domain: string;
  description: string;
}

export interface TrendFromDataset {
  metric: string;
  jurisdiction: string;
  domain: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  direction: 'increasing' | 'decreasing' | 'stable';
  period: string;
}

// ============================================================
// Dataset Registry Operations
// ============================================================

export async function listDatasets(): Promise<DatasetStats[]> {
  const [rows]: any = await db.execute(sql.raw(
    `SELECT stream_id_dsr as dataset_id, stream_name_dsr as dataset_name, source_dsr as source, jurisdiction_dsr as jurisdiction, domain_dsr as domain, 
            records_ingested_dsr as record_count, last_ingested_at_dsr as last_ingested,
            enabled_dsr as enabled, update_freq_dsr as update_frequency
     FROM data_stream_registry ORDER BY stream_name_dsr`
  ));
  return (rows as any[]).map(r => ({
    dataset_id: r.dataset_id,
    dataset_name: r.dataset_name,
    source: r.source,
    jurisdiction: r.jurisdiction,
    domain: r.domain,
    record_count: Number(r.record_count) || 0,
    last_ingested: r.last_ingested ? Number(r.last_ingested) : null,
    enabled: Boolean(r.enabled),
    update_frequency: r.update_frequency,
  }));
}

export async function getDatasetById(dataset_id: string): Promise<DatasetStats | null> {
  const [rows]: any = await db.execute(sql`
    SELECT stream_id_dsr as dataset_id, stream_name_dsr as dataset_name, source_dsr as source, jurisdiction_dsr as jurisdiction, domain_dsr as domain,
            records_ingested_dsr as record_count, last_ingested_at_dsr as last_ingested,
            enabled_dsr as enabled, update_freq_dsr as update_frequency
     FROM data_stream_registry WHERE stream_id_dsr = ${dataset_id}
  `);
  if (!(rows as any[]).length) return null;
  const r = (rows as any[])[0];
  return {
    dataset_id: r.dataset_id,
    dataset_name: r.dataset_name,
    source: r.source,
    jurisdiction: r.jurisdiction,
    domain: r.domain,
    record_count: Number(r.record_count) || 0,
    last_ingested: r.last_ingested ? Number(r.last_ingested) : null,
    enabled: Boolean(r.enabled),
    update_frequency: r.update_frequency,
  };
}

export async function getDatasetSummary(): Promise<{
  totalDatasets: number;
  enabledDatasets: number;
  totalRecords: number;
  byDomain: Record<string, number>;
  byJurisdiction: Record<string, number>;
}> {
  const [rows]: any = await db.execute(sql.raw(
    `SELECT domain_dsr as domain, jurisdiction_dsr as jurisdiction, COUNT(*) as cnt, SUM(records_ingested_dsr) as total,
            COUNT(*) FILTER (WHERE enabled_dsr) as enabled
     FROM data_stream_registry GROUP BY domain_dsr, jurisdiction_dsr`
  ));
  const byDomain: Record<string, number> = {};
  const byJurisdiction: Record<string, number> = {};
  let totalDatasets = 0;
  let enabledDatasets = 0;
  let totalRecords = 0;
  for (const r of rows as any[]) {
    const d = r.domain || 'unknown';
    const j = r.jurisdiction || 'unknown';
    byDomain[d] = (byDomain[d] || 0) + Number(r.cnt);
    byJurisdiction[j] = (byJurisdiction[j] || 0) + Number(r.cnt);
    totalDatasets += Number(r.cnt);
    enabledDatasets += Number(r.enabled);
    totalRecords += Number(r.total) || 0;
  }
  return { totalDatasets, enabledDatasets, totalRecords, byDomain, byJurisdiction };
}

// ============================================================
// Signal Engine Connection — Consumer Complaints
// ============================================================

export async function extractSignalsFromComplaints(
  jurisdiction?: string,
  limit: number = 50
): Promise<SignalFromDataset[]> {
  const whereClause = jurisdiction ? sql`WHERE jurisdiction = ${jurisdiction}` : sql.empty();
  const safeLimit = boundedLimit(limit, 50);
  
  // Detect high-frequency complaint patterns by company
  const [companySignals]: any = await db.execute(sql`
    SELECT company_name, claim_type, jurisdiction, COUNT(*) as cnt,
            SUM(CASE WHEN consumer_disputed = 1 THEN 1 ELSE 0 END) as disputed
     FROM consumer_complaints ${whereClause}
     GROUP BY company_name, claim_type, jurisdiction
     HAVING COUNT(*) >= 3
     ORDER BY COUNT(*) DESC
     LIMIT ${safeLimit}
  `);

  return (companySignals as any[]).map(r => {
    const cnt = Number(r.cnt);
    const disputed = Number(r.disputed);
    const severity = cnt >= 20 ? 'critical' : cnt >= 10 ? 'high' : cnt >= 5 ? 'medium' : 'low';
    return {
      signalType: 'complaint_cluster',
      source: 'consumer_complaints',
      entity: r.company_name,
      jurisdiction: r.jurisdiction,
      severity,
      description: `${cnt} complaints against ${r.company_name} (${disputed} disputed) for ${r.claim_type}`,
      dataPoints: cnt,
      claimType: r.claim_type || 'consumer_protection',
    };
  });
}

// ============================================================
// Signal Engine Connection — Enforcement Records
// ============================================================

export async function extractSignalsFromEnforcement(
  jurisdiction?: string,
  limit: number = 50
): Promise<SignalFromDataset[]> {
  const whereClause = jurisdiction ? sql`WHERE jurisdiction = ${jurisdiction}` : sql.empty();
  const safeLimit = boundedLimit(limit, 50);

  const [enfSignals]: any = await db.execute(sql`
    SELECT agency_name as respondent_name, complaint_type as violation_type,
           agency_name, jurisdiction, COUNT(*) as cnt, 0::numeric as total_penalty
      FROM legal_enforcement_records ${whereClause}
     GROUP BY agency_name, complaint_type, jurisdiction
    HAVING COUNT(*) >= 2
     ORDER BY COUNT(*) DESC
     LIMIT ${safeLimit}
  `);

  return (enfSignals as any[]).map(r => {
    const cnt = Number(r.cnt);
    const penalty = Number(r.total_penalty) || 0;
    const severity = cnt >= 5 ? 'critical' : cnt >= 3 ? 'high' : 'medium';
    return {
      signalType: 'enforcement_cluster',
      source: 'enforcement_records',
      entity: r.respondent_name,
      jurisdiction: r.jurisdiction,
      severity,
      description: `${cnt} verified enforcement-response records associated with ${r.agency_name} for ${r.violation_type}`,
      dataPoints: cnt,
      claimType: r.violation_type?.toLowerCase().replace(/ /g, '_') || 'enforcement',
    };
  });
}

// ============================================================
// Pattern Registry Connection — Repeat Offenders
// ============================================================

export async function detectRepeatOffenders(
  minOccurrences: number = 3,
  limit: number = 30
): Promise<PatternFromDataset[]> {
  const safeMinimum = Math.max(1, Math.trunc(minOccurrences));
  const safeLimit = boundedLimit(limit, 30);
  // Cross-reference complaints and enforcement for repeat offenders
  const [patterns]: any = await db.execute(sql`
    SELECT entity, jurisdiction, domain, SUM(cnt) as total,
           STRING_AGG(DISTINCT source, ', ' ORDER BY source) as sources
     FROM (
       SELECT company_name as entity, jurisdiction, claim_type as domain, COUNT(*) as cnt, 'complaints' as source
       FROM consumer_complaints GROUP BY company_name, jurisdiction, claim_type
       UNION ALL
       SELECT agency_name as entity, jurisdiction, complaint_type as domain, COUNT(*) as cnt, 'enforcement' as source
       FROM legal_enforcement_records GROUP BY agency_name, jurisdiction, complaint_type
     ) combined
     GROUP BY entity, jurisdiction, domain
     HAVING SUM(cnt) >= ${safeMinimum}
     ORDER BY SUM(cnt) DESC
     LIMIT ${safeLimit}
  `);

  return (patterns as any[]).map(r => ({
    patternType: 'repeat_offender',
    entity: r.entity,
    jurisdiction: r.jurisdiction,
    occurrences: Number(r.total),
    domain: r.domain || 'unknown',
    description: `${r.entity} has ${r.total} combined complaints/enforcement actions across ${r.sources}`,
  }));
}

// ============================================================
// Pattern Registry — Regulatory Gaps
// ============================================================

export async function detectRegulatoryGaps(limit: number = 20): Promise<PatternFromDataset[]> {
  const safeLimit = boundedLimit(limit, 20);
  // Find jurisdictions with high complaints but low enforcement
  const [gaps]: any = await db.execute(sql`
    SELECT c.jurisdiction, c.claim_type as domain, c.complaint_count, COALESCE(e.enforcement_count, 0) as enforcement_count,
            c.complaint_count - COALESCE(e.enforcement_count, 0) as gap
     FROM (
       SELECT jurisdiction, claim_type, COUNT(*) as complaint_count
       FROM consumer_complaints GROUP BY jurisdiction, claim_type
     ) c
     LEFT JOIN (
       SELECT jurisdiction, claim_type, COUNT(*) as enforcement_count
       FROM (
         SELECT jurisdiction, complaint_type as claim_type
         FROM legal_enforcement_records
       ) canonical_enforcement
       GROUP BY jurisdiction, claim_type
     ) e ON c.jurisdiction = e.jurisdiction AND c.claim_type = e.claim_type
     WHERE c.complaint_count > 5
     ORDER BY gap DESC
     LIMIT ${safeLimit}
  `);

  return (gaps as any[]).map(r => ({
    patternType: 'regulatory_gap',
    entity: `${r.jurisdiction} - ${r.domain}`,
    jurisdiction: r.jurisdiction,
    occurrences: Number(r.gap),
    domain: r.domain || 'unknown',
    description: `${r.complaint_count} complaints vs ${r.enforcement_count} enforcement actions in ${r.jurisdiction} for ${r.domain} — potential enforcement gap`,
  }));
}

// ============================================================
// Trend & Pressure Engine — Complaint Growth
// ============================================================

export async function analyzeComplaintTrends(
  jurisdiction?: string
): Promise<TrendFromDataset[]> {
  const whereClause = jurisdiction ? sql`WHERE jurisdiction = ${jurisdiction}` : sql.empty();

  const [trends]: any = await db.execute(sql`
    SELECT jurisdiction, claim_type as domain,
            SUM(CASE WHEN date_received >= CURRENT_DATE - INTERVAL '6 months' THEN 1 ELSE 0 END) as recent,
            SUM(CASE WHEN date_received < CURRENT_DATE - INTERVAL '6 months' THEN 1 ELSE 0 END) as older,
            COUNT(*) as total
     FROM consumer_complaints ${whereClause}
     GROUP BY jurisdiction, claim_type
     HAVING COUNT(*) >= 5
     ORDER BY COUNT(*) DESC
  `);

  return (trends as any[]).map(r => {
    const recent = Number(r.recent);
    const older = Number(r.older) || 1;
    const changePercent = ((recent - older) / older) * 100;
    return {
      metric: 'complaint_volume',
      jurisdiction: r.jurisdiction,
      domain: r.domain || 'unknown',
      currentValue: recent,
      previousValue: older,
      changePercent: Math.round(changePercent * 10) / 10,
      direction: changePercent > 10 ? 'increasing' : changePercent < -10 ? 'decreasing' : 'stable',
      period: 'last_6_months_vs_prior',
    };
  });
}

// ============================================================
// Trend & Pressure — Enforcement Frequency
// ============================================================

export async function analyzeEnforcementTrends(
  jurisdiction?: string
): Promise<TrendFromDataset[]> {
  const whereClause = jurisdiction
    ? sql`WHERE jurisdiction = ${jurisdiction} AND period_end ~ '^\\d{4}-\\d{2}-\\d{2}$'`
    : sql`WHERE period_end ~ '^\\d{4}-\\d{2}-\\d{2}$'`;

  const [trends]: any = await db.execute(sql`
    SELECT jurisdiction, complaint_type as domain, agency_name,
            SUM(CASE WHEN period_end::date >= CURRENT_DATE - INTERVAL '6 months' THEN 1 ELSE 0 END) as recent,
            SUM(CASE WHEN period_end::date < CURRENT_DATE - INTERVAL '6 months' THEN 1 ELSE 0 END) as older,
            COUNT(*) as total,
            0::numeric as total_penalty
     FROM legal_enforcement_records ${whereClause}
     GROUP BY jurisdiction, complaint_type, agency_name
     HAVING COUNT(*) >= 3
     ORDER BY COUNT(*) DESC
  `);

  return (trends as any[]).map(r => {
    const recent = Number(r.recent);
    const older = Number(r.older) || 1;
    const changePercent = ((recent - older) / older) * 100;
    return {
      metric: 'enforcement_frequency',
      jurisdiction: r.jurisdiction,
      domain: r.domain || 'unknown',
      currentValue: recent,
      previousValue: older,
      changePercent: Math.round(changePercent * 10) / 10,
      direction: changePercent > 10 ? 'increasing' : changePercent < -10 ? 'decreasing' : 'stable',
      period: 'last_6_months_vs_prior',
    };
  });
}

// ============================================================
// Strategy Engine — Intervention Targeting
// ============================================================

export async function generateInterventionTargets(
  jurisdiction?: string,
  limit: number = 20
): Promise<Array<{
  entity: string;
  jurisdiction: string;
  complaint_count: number;
  enforcement_count: number;
  totalPenalties: number;
  recommendedAction: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}>> {
  const complaintFilter = jurisdiction ? sql`WHERE jurisdiction = ${jurisdiction}` : sql.empty();
  const enforcementFilter = jurisdiction ? sql`WHERE jurisdiction = ${jurisdiction}` : sql.empty();
  const safeLimit = boundedLimit(limit, 20);

  const [targets]: any = await db.execute(sql`
    SELECT entity, jurisdiction, SUM(complaints) as complaints,
           SUM(enforcements) as enforcements, SUM(penalties) as penalties,
           SUM(complaints) + SUM(enforcements) as total
     FROM (
       SELECT company_name as entity, jurisdiction, COUNT(*) as complaints, 0 as enforcements, 0 as penalties
       FROM consumer_complaints ${complaintFilter}
       GROUP BY company_name, jurisdiction
       UNION ALL
       SELECT agency_name as entity, jurisdiction, 0 as complaints, COUNT(*) as enforcements, 0 as penalties
       FROM legal_enforcement_records ${enforcementFilter}
       GROUP BY agency_name, jurisdiction
     ) combined
     GROUP BY entity, jurisdiction
     ORDER BY SUM(complaints) + SUM(enforcements) DESC
     LIMIT ${safeLimit}
  `);

  return (targets as any[]).map(r => {
    const complaints = Number(r.complaints);
    const enforcements = Number(r.enforcements);
    const penalties = Number(r.penalties) || 0;
    const total = complaints + enforcements;
    const priority = total >= 10 ? 'critical' : total >= 5 ? 'high' : total >= 3 ? 'medium' : 'low';
    const recommendedAction = enforcements > 0
      ? 'Monitor ongoing enforcement; consider advocacy escalation'
      : complaints >= 5
        ? 'File formal complaint with regulatory agency'
        : 'Document pattern; prepare for potential escalation';
    return {
      entity: r.entity,
      jurisdiction: r.jurisdiction,
      complaint_count: complaints,
      enforcement_count: enforcements,
      totalPenalties: penalties,
      recommendedAction,
      priority,
    };
  });
}

// ============================================================
// Reform Package Engine — Policy Change Proposals
// ============================================================

export async function getPolicyChangeProposals(
  jurisdiction?: string,
  status?: string
): Promise<Array<{
  changeId: string;
  title: string;
  reformType: string;
  jurisdiction: string;
  domain: string;
  status: string;
  priorityScore: number;
  urgencyLevel: string;
  evidenceStrength: string;
  summary: string;
}>> {
  const filters = [sql`true`];
  if (jurisdiction) filters.push(sql`jurisdiction = ${jurisdiction}`);
  if (status) filters.push(sql`status = ${status}`);

  const [rows]: any = await db.execute(sql`
    SELECT change_id,
           title as proposal_title,
           change_type as reform_type,
           jurisdiction,
           policy_domain as harm_domain,
           status,
           coalesce(impact_score, 0) as priority_score,
           case
             when coalesce(impact_score, 0) >= 80 then 'critical'
             when coalesce(impact_score, 0) >= 60 then 'high'
             when coalesce(impact_score, 0) >= 30 then 'medium'
             else 'low'
           end as urgency_level,
           'not_recorded'::text as evidence_strength,
           description as proposal_summary
      FROM policy_change_registry
     WHERE ${sql.join(filters, sql` AND `)}
     ORDER BY coalesce(impact_score, 0) DESC
  `);

  return (rows as any[]).map(r => ({
    changeId: r.change_id,
    title: r.proposal_title,
    reformType: r.reform_type,
    jurisdiction: r.jurisdiction,
    domain: r.harm_domain,
    status: r.status,
    priorityScore: Number(r.priority_score),
    urgencyLevel: r.urgency_level,
    evidenceStrength: r.evidence_strength,
    summary: r.proposal_summary,
  }));
}

// ============================================================
// Campaign Finance — Political Alignment Analysis
// ============================================================

export async function analyzeCampaignFinance(
  policyDomain?: string,
  limit: number = 20
): Promise<Array<{
  candidateName: string;
  party: string;
  office: string;
  jurisdiction: string;
  totalContributions: number;
  contributorCount: number;
  policyDomain: string;
  alignmentScore: number;
}>> {
  const whereClause = policyDomain ? sql`WHERE policy_domain = ${policyDomain}` : sql.empty();
  const safeLimit = boundedLimit(limit, 20);

  const [rows]: any = await db.execute(sql`
    SELECT candidate_name, party, office, jurisdiction, policy_domain,
            SUM(contribution_amount) as total, COUNT(*) as cnt
     FROM campaign_finance_records ${whereClause}
     GROUP BY candidate_name, party, office, jurisdiction, policy_domain
     ORDER BY SUM(contribution_amount) DESC
     LIMIT ${safeLimit}
  `);

  return (rows as any[]).map(r => {
    const total = Number(r.total) || 0;
    const cnt = Number(r.cnt);
    // Higher alignment = more contributions from issue-aligned sources
    const alignmentScore = Math.min(100, Math.round((total / 10000) * 50 + (cnt / 5) * 50));
    return {
      candidateName: r.candidate_name,
      party: r.party,
      office: r.office,
      jurisdiction: r.jurisdiction,
      totalContributions: total,
      contributorCount: cnt,
      policyDomain: r.policy_domain,
      alignmentScore,
    };
  });
}

// ============================================================
// Ingestion Job Management
// ============================================================

export async function getIngestionJobs(): Promise<IngestionJobConfig[]> {
  const [rows]: any = await db.execute(sql.raw(
    `SELECT stream_id_dsr as dataset_id, update_freq_dsr as update_frequency, cron_expression_dsr as cron_expression, enabled_dsr as enabled
     FROM data_stream_registry ORDER BY stream_name_dsr`
  ));
  return (rows as any[]).map(r => ({
    dataset_id: r.dataset_id,
    frequency: r.update_frequency,
    cron_expression: r.cron_expression,
    enabled: Boolean(r.enabled),
  }));
}

export async function updateIngestionJob(
  dataset_id: string,
  updates: { enabled?: boolean; cron_expression?: string; frequency?: string }
): Promise<boolean> {
  const setValues: Partial<typeof dataStreamRegistry.$inferInsert> = { updatedAt: Date.now() };
  if (updates.enabled !== undefined) setValues.enabled = updates.enabled;
  if (updates.cron_expression !== undefined) setValues.cronExpression = updates.cron_expression;
  if (updates.frequency !== undefined) setValues.updateFrequency = updates.frequency as any;
  if (Object.keys(setValues).length === 1) return false;
  await db.update(dataStreamRegistry)
    .set(setValues)
    .where(eq(dataStreamRegistry.streamId, dataset_id));
  return true;
}

// ============================================================
// Cross-Dataset Intelligence Summary
// ============================================================

export async function getCrossDatasetIntelligence(): Promise<{
  signals: SignalFromDataset[];
  patterns: PatternFromDataset[];
  trends: TrendFromDataset[];
  policyProposals: number;
  interventionTargets: number;
}> {
  const [signals, enfSignals, patterns, gaps, trends, enfTrends, proposals, targets] = await Promise.all([
    extractSignalsFromComplaints(undefined, 10),
    extractSignalsFromEnforcement(undefined, 10),
    detectRepeatOffenders(3, 10),
    detectRegulatoryGaps(5),
    analyzeComplaintTrends(),
    analyzeEnforcementTrends(),
    getPolicyChangeProposals(),
    generateInterventionTargets(undefined, 10),
  ]);

  return {
    signals: [...signals, ...enfSignals].slice(0, 15),
    patterns: [...patterns, ...gaps].slice(0, 10),
    trends: [...trends, ...enfTrends].slice(0, 10),
    policyProposals: proposals.length,
    interventionTargets: targets.length,
  };
}
