/**
 * UNIFIED ACCESS LAYER — Single Read Interface
 *
 * All modules must read canonical data through this layer.
 * This replaces direct DB queries, JSON config reads, and module-local truth.
 *
 * Architecture:
 * - Knowledge Core (canonical tables) → Unified Access Layer → UI Modules
 * - World Index = graph/projection layer (nodes + edges)
 * - Unified Access = normalized read interface (typed queries)
 * - UI modules = views only (no direct DB access)
 *
 * This layer provides:
 * 1. Typed query functions for each canonical entity
 * 2. Jurisdiction-scoped filtering
 * 3. Cross-entity joins where needed
 * 4. Fallback to empty arrays (never throw on empty data)
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

// ─── Registry Queries ────────────────────────────────────────────────────────

export async function getJurisdictions(filters?: { stateCode?: string }) {
  const where = filters?.stateCode
    ? sql`WHERE state_code = ${filters.stateCode}`
    : sql``;
  const [rows] = await db.execute(sql`
    SELECT * FROM registry_jurisdictions ${where} ORDER BY state_code
  `);
  return (rows as unknown as any[]) || [];
}

export async function getPrograms(filters?: { jurisdiction?: string; category?: string; limit?: number }) {
  let where = sql`WHERE 1=1`;
  if (filters?.jurisdiction) where = sql`${where} AND jurisdiction_rp = ${filters.jurisdiction}`;
  if (filters?.category) where = sql`${where} AND category_rp = ${filters.category}`;
  const limit = filters?.limit || 500;
  const [rows] = await db.execute(sql`
    SELECT * FROM registry_programs ${where} ORDER BY name_rp LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

export async function getOversightBodies(filters?: { jurisdiction?: string }) {
  const where = filters?.jurisdiction
    ? sql`WHERE jurisdiction_rob = ${filters.jurisdiction}`
    : sql``;
  const [rows] = await db.execute(sql`
    SELECT * FROM registry_oversight_bodies ${where} ORDER BY name_rob
  `);
  return (rows as unknown as any[]) || [];
}

export async function getWorkflows(filters?: { jurisdiction?: string }) {
  const where = filters?.jurisdiction
    ? sql`WHERE jurisdiction_rw = ${filters.jurisdiction}`
    : sql``;
  const [rows] = await db.execute(sql`
    SELECT * FROM registry_workflows ${where} ORDER BY name_rw
  `);
  return (rows as unknown as any[]) || [];
}

// ─── Signal Queries ──────────────────────────────────────────────────────────

export async function getLiveSignals(filters?: { jurisdiction?: string; severity?: string; limit?: number }) {
  let where = sql`WHERE active = 1`;
  if (filters?.jurisdiction) where = sql`${where} AND jurisdiction_ls = ${filters.jurisdiction}`;
  if (filters?.severity) where = sql`${where} AND severity_ls = ${filters.severity}`;
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM live_signals ${where} ORDER BY detectedAt_ls DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

export async function getDetectedSignals(filters?: { jurisdiction?: string; limit?: number }) {
  let where = sql`WHERE 1=1`;
  if (filters?.jurisdiction) where = sql`${where} AND jurisdiction_scope = ${filters.jurisdiction}`;
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM detected_signals ${where} ORDER BY detection_timestamp DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

// ─── Legal Queries ───────────────────────────────────────────────────────────

export async function getLegalStatutes(filters?: { jurisdiction?: string; category?: string; limit?: number }) {
  let where = sql`WHERE 1=1`;
  if (filters?.jurisdiction) where = sql`${where} AND jurisdiction = ${filters.jurisdiction}`;
  if (filters?.category) where = sql`${where} AND category = ${filters.category}`;
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM legal_statutes ${where} ORDER BY title LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

export async function getLegalCaseLaw(filters?: { limit?: number }) {
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM legal_case_law ORDER BY decided_date DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

export async function getDoctrineRegistry(filters?: { limit?: number }) {
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM doctrine_registry ORDER BY id LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

export async function getLitigationBarriers(filters?: { jurisdiction?: string; limit?: number }) {
  let where = sql`WHERE 1=1`;
  if (filters?.jurisdiction) where = sql`${where} AND jurisdiction = ${filters.jurisdiction}`;
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM litigation_barriers ${where} ORDER BY id LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

export async function getProofFrameworks(filters?: { limit?: number }) {
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM proof_frameworks ORDER BY id LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

// ─── FOIA Queries ────────────────────────────────────────────────────────────

export async function getFoiaRequests(filters?: { status?: string; limit?: number }) {
  let where = sql`WHERE 1=1`;
  if (filters?.status) where = sql`${where} AND status = ${filters.status}`;
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM foia_requests ${where} ORDER BY createdAt DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

// ─── Case & Analysis Queries ─────────────────────────────────────────────────

export async function getCases(filters?: { limit?: number }) {
  const limit = filters?.limit || 100;
  const [rows] = await db.execute(sql`
    SELECT * FROM cases ORDER BY createdAt DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

export async function getPatterns(filters?: { limit?: number }) {
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM patterns ORDER BY id LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

export async function getPatternOutputs(filters?: { limit?: number }) {
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM pattern_outputs ORDER BY id DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

export async function getStrategyOutputs(filters?: { limit?: number }) {
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM strategy_outputs ORDER BY id DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

// ─── Lighthouse Queries ──────────────────────────────────────────────────────

export async function getLighthouseJobs(filters?: { limit?: number }) {
  const limit = filters?.limit || 50;
  const [rows] = await db.execute(sql`
    SELECT * FROM lighthouse_jobs ORDER BY createdAt DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

export async function getLighthousePosts(filters?: { limit?: number }) {
  const limit = filters?.limit || 50;
  const [rows] = await db.execute(sql`
    SELECT * FROM lighthouse_posts ORDER BY createdAt DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

export async function getLighthouseEvents(filters?: { limit?: number }) {
  const limit = filters?.limit || 50;
  const [rows] = await db.execute(sql`
    SELECT * FROM lighthouse_events ORDER BY createdAt DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

// ─── Governance Queries ──────────────────────────────────────────────────────

export async function getGovernanceLog(filters?: { limit?: number }) {
  const limit = filters?.limit || 50;
  const [rows] = await db.execute(sql`
    SELECT * FROM governance_log ORDER BY createdAt DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

// ─── Agency Performance ──────────────────────────────────────────────────────

export async function getAgencyPerformanceMetrics(filters?: { limit?: number }) {
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM agency_performance_metrics ORDER BY id LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

// ─── Docket ──────────────────────────────────────────────────────────────────

export async function getDocketEntries(filters?: { limit?: number }) {
  const limit = filters?.limit || 100;
  const [rows] = await db.execute(sql`
    SELECT * FROM docket_entries ORDER BY createdAt DESC LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

// ─── Escalation ──────────────────────────────────────────────────────────────

export async function getEscalationRegistry(filters?: { limit?: number }) {
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM escalation_registry ORDER BY id LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

// ─── Knowledge Backbone ──────────────────────────────────────────────────────

export async function getKnowledgeEntries(filters?: { category?: string; limit?: number }) {
  let where = sql`WHERE 1=1`;
  if (filters?.category) where = sql`${where} AND category = ${filters.category}`;
  const limit = filters?.limit || 200;
  const [rows] = await db.execute(sql`
    SELECT * FROM knowledge_entries ${where} ORDER BY id LIMIT ${limit}
  `);
  return (rows as unknown as any[]) || [];
}

// ─── Cross-Entity Summary ────────────────────────────────────────────────────

/**
 * getSystemSummary — Returns a high-level summary of the entire canonical core
 * Used by Mission Control for the system health overview
 */
export async function getSystemSummary(): Promise<{
  jurisdictions: number;
  programs: number;
  oversightBodies: number;
  workflows: number;
  liveSignals: number;
  detectedSignals: number;
  cases: number;
  documents: number;
  entities: number;
  claims: number;
  findings: number;
  patterns: number;
  legalStatutes: number;
  foiaRequests: number;
  lighthouseJobs: number;
  lighthousePosts: number;
  lighthouseEvents: number;
  docketEntries: number;
  governanceEvents: number;
  pipelineEvents: number;
}> {
  const counts: Record<string, number> = {};
  const tables = [
    ["jurisdictions", "registry_jurisdictions"],
    ["programs", "registry_programs"],
    ["oversightBodies", "registry_oversight_bodies"],
    ["workflows", "registry_workflows"],
    ["liveSignals", "live_signals"],
    ["detectedSignals", "detected_signals"],
    ["cases", "cases"],
    ["documents", "documents"],
    ["entities", "entities"],
    ["claims", "claims"],
    ["findings", "findings"],
    ["patterns", "patterns"],
    ["legalStatutes", "legal_statutes"],
    ["foiaRequests", "foia_requests"],
    ["lighthouseJobs", "lighthouse_jobs"],
    ["lighthousePosts", "lighthouse_posts"],
    ["lighthouseEvents", "lighthouse_events"],
    ["docketEntries", "docket_entries"],
    ["governanceEvents", "governance_log"],
    ["pipelineEvents", "pipeline_events"],
  ];

  for (const [key, table] of tables) {
    try {
      const [rows] = await db.execute(sql.raw(`SELECT COUNT(*) as c FROM \`${table}\``));
      counts[key] = Number((rows as any)[0]?.c) || 0;
    } catch {
      counts[key] = 0;
    }
  }

  return counts as any;
}
