/**
 * Registry Database Helpers
 * 
 * Query helpers for the canonical registry tables.
 * Returns raw Drizzle rows — no transformation.
 */
import { db } from "./db";
import {
  registryJurisdictions,
  registryPrograms,
  registryPolicyAlerts,
  registryWorkflows,
  registryOversightBodies,
  registrySourceTraceability,
  registrySignals,
} from "../drizzle/schema";
import { eq, sql, desc, count } from "drizzle-orm";

// ─── Jurisdictions ───
export async function listJurisdictions() {
  return db.select().from(registryJurisdictions).orderBy(registryJurisdictions.name);
}

export async function getJurisdiction(id: string) {
  const [row] = await db.select().from(registryJurisdictions).where(eq(registryJurisdictions.id, id));
  return row || null;
}

// ─── Programs ───
export async function listPrograms(jurisdictionId?: string, category?: string) {
  let query = db.select().from(registryPrograms);
  if (jurisdictionId) {
    query = query.where(eq(registryPrograms.jurisdictionId, jurisdictionId)) as any;
  }
  // Category filter applied in-memory since drizzle chaining is complex
  const rows = await query;
  if (category) {
    return rows.filter((r: any) => r.category === category);
  }
  return rows;
}

// ─── Policy Alerts ───
export async function listPolicyAlerts(jurisdictionId?: string) {
  if (jurisdictionId) {
    return db.select().from(registryPolicyAlerts).where(eq(registryPolicyAlerts.jurisdictionId, jurisdictionId));
  }
  return db.select().from(registryPolicyAlerts);
}

// ─── Workflows ───
export async function listWorkflows(jurisdictionId?: string) {
  if (jurisdictionId) {
    return db.select().from(registryWorkflows).where(eq(registryWorkflows.jurisdictionId, jurisdictionId));
  }
  return db.select().from(registryWorkflows);
}

// ─── Oversight Bodies ───
export async function listOversightBodies(jurisdictionId?: string) {
  if (jurisdictionId) {
    return db.select().from(registryOversightBodies).where(eq(registryOversightBodies.jurisdictionId, jurisdictionId));
  }
  return db.select().from(registryOversightBodies);
}

// ─── Signals ───
export async function getSignals(jurisdictionId?: string, signalType?: string) {
  let query = db.select().from(registrySignals);
  if (jurisdictionId) {
    query = query.where(eq(registrySignals.jurisdictionId, jurisdictionId)) as any;
  }
  const rows = await query;
  if (signalType) {
    return rows.filter((r: any) => r.signalType === signalType);
  }
  return rows;
}

// ─── Counts ───
export async function getCounts() {
  const [jCount] = await db.select({ count: count() }).from(registryJurisdictions);
  const [pCount] = await db.select({ count: count() }).from(registryPrograms);
  const [aCount] = await db.select({ count: count() }).from(registryPolicyAlerts);
  const [wCount] = await db.select({ count: count() }).from(registryWorkflows);
  const [oCount] = await db.select({ count: count() }).from(registryOversightBodies);
  const [sCount] = await db.select({ count: count() }).from(registrySignals);
  const [tCount] = await db.select({ count: count() }).from(registrySourceTraceability);

  return {
    jurisdictions: jCount.count,
    programs: pCount.count,
    policyAlerts: aCount.count,
    workflows: wCount.count,
    oversightBodies: oCount.count,
    signals: sCount.count,
    sourceTraceability: tCount.count,
    total: jCount.count + pCount.count + aCount.count + wCount.count + oCount.count + sCount.count + tCount.count,
  };
}

// ─── Source Traceability ───
export async function getSourceTraceability(jurisdictionId: string) {
  const [row] = await db.select().from(registrySourceTraceability).where(eq(registrySourceTraceability.jurisdictionId, jurisdictionId));
  return row || null;
}

// ─── Program categories for a jurisdiction ───
export async function getProgramCategories(jurisdictionId: string) {
  const programs = await db.select().from(registryPrograms).where(eq(registryPrograms.jurisdictionId, jurisdictionId));
  const categories = new Map<string, number>();
  for (const p of programs) {
    const cat = p.category || "uncategorized";
    categories.set(cat, (categories.get(cat) || 0) + 1);
  }
  return Array.from(categories.entries()).map(([category, count]) => ({ category, count }));
}
