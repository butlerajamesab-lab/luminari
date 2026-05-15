/**
 * Docket Room — Database Helpers
 * 
 * CRUD operations for the Docket Room legislative analysis module.
 * Principle: Reveal structure. Interpret nothing. Judge nothing.
 */
import { eq, and, desc, asc, sql, inArray, like, or } from "drizzle-orm";
import { db } from "./db";
import {
  docketEntries, docketActors, docketImpacts, docketSources, docketSubmissions,
  type DocketEntry, type InsertDocketEntry,
  type DocketActor, type InsertDocketActor,
  type DocketImpact, type InsertDocketImpact,
  type DocketSource, type InsertDocketSource,
  type DocketSubmission, type InsertDocketSubmission,
} from "../drizzle/schema";

// ─── Docket Entries ───

export async function listDocketEntries(opts?: {
  jurisdiction?: string;
  jurisdictionLevel?: DocketEntry["jurisdictionLevel"];
  lawType?: DocketEntry["lawType"];
  status?: DocketEntry["status"];
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts?.jurisdiction) conditions.push(eq(docketEntries.jurisdiction, opts.jurisdiction));
  if (opts?.jurisdictionLevel) conditions.push(eq(docketEntries.jurisdictionLevel, opts.jurisdictionLevel));
  if (opts?.lawType) conditions.push(eq(docketEntries.lawType, opts.lawType));
  if (opts?.status) conditions.push(eq(docketEntries.status, opts.status));

  // Full-text search across title, summary, and jurisdiction
  if (opts?.search) {
    const term = `%${opts.search}%`;
    conditions.push(
      or(
        like(docketEntries.title, term),
        like(docketEntries.summary, term),
        like(docketEntries.jurisdiction, term),
      )!
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(docketEntries)
    .where(where)
    .orderBy(desc(docketEntries.updatedAt))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);
  return rows;
}

export async function getDocketEntry(id: number) {
  const [row] = await db.select().from(docketEntries).where(eq(docketEntries.id, id));
  return row ?? null;
}

export async function getDocketEntryBySlug(slug: string) {
  const [row] = await db.select().from(docketEntries).where(eq(docketEntries.slug, slug));
  return row ?? null;
}

export async function createDocketEntry(data: InsertDocketEntry) {
  const [result] = await db.insert(docketEntries).values(data);
  return result.insertId;
}

export async function updateDocketEntry(id: number, data: Partial<InsertDocketEntry>) {
  await db.update(docketEntries).set({ ...data, updatedAt: Date.now() }).where(eq(docketEntries.id, id));
}

// ─── Docket Actors ───

export async function listActorsForDocket(docketId: number) {
  return db.select().from(docketActors)
    .where(eq(docketActors.docketId, docketId))
    .orderBy(asc(docketActors.actorType), asc(docketActors.actorName));
}

export async function createDocketActor(data: InsertDocketActor) {
  const [result] = await db.insert(docketActors).values(data);
  return result.insertId;
}

export async function bulkCreateActors(actors: InsertDocketActor[]) {
  if (actors.length === 0) return;
  await db.insert(docketActors).values(actors);
}

export async function deleteActorsForDocket(docketId: number) {
  await db.delete(docketActors).where(eq(docketActors.docketId, docketId));
}

// ─── Docket Impacts ───

export async function listImpactsForDocket(docketId: number) {
  return db.select().from(docketImpacts)
    .where(eq(docketImpacts.docketId, docketId))
    .orderBy(asc(docketImpacts.impactCategory), asc(docketImpacts.affectedEntity));
}

export async function createDocketImpact(data: InsertDocketImpact) {
  const [result] = await db.insert(docketImpacts).values(data);
  return result.insertId;
}

export async function bulkCreateImpacts(impacts: InsertDocketImpact[]) {
  if (impacts.length === 0) return;
  await db.insert(docketImpacts).values(impacts);
}

export async function deleteImpactsForDocket(docketId: number) {
  await db.delete(docketImpacts).where(eq(docketImpacts.docketId, docketId));
}

// ─── Docket Sources ───

export async function listSourcesForDocket(docketId: number) {
  return db.select().from(docketSources)
    .where(eq(docketSources.docketId, docketId))
    .orderBy(asc(docketSources.sourceType), asc(docketSources.title));
}

export async function createDocketSource(data: InsertDocketSource) {
  const [result] = await db.insert(docketSources).values(data);
  return result.insertId;
}

export async function bulkCreateSources(sources: InsertDocketSource[]) {
  if (sources.length === 0) return;
  await db.insert(docketSources).values(sources);
}

export async function deleteSourcesForDocket(docketId: number) {
  await db.delete(docketSources).where(eq(docketSources.docketId, docketId));
}

// ─── Full Docket Analysis (all sections) ───

export async function getFullDocketAnalysis(docketId: number) {
  const entry = await getDocketEntry(docketId);
  if (!entry) return null;

  const [actors, impacts, sources] = await Promise.all([
    listActorsForDocket(docketId),
    listImpactsForDocket(docketId),
    listSourcesForDocket(docketId),
  ]);

  return { entry, actors, impacts, sources };
}

// ─── Docket Submissions ───

export async function createDocketSubmission(data: InsertDocketSubmission) {
  const [result] = await db.insert(docketSubmissions).values(data);
  return result.insertId;
}

export async function listDocketSubmissions(opts?: {
  userId?: number;
  status?: DocketSubmission["status"];
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts?.userId) conditions.push(eq(docketSubmissions.userId, opts.userId));
  if (opts?.status) conditions.push(eq(docketSubmissions.status, opts.status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select().from(docketSubmissions)
    .where(where)
    .orderBy(desc(docketSubmissions.createdAt))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);
}

export async function getDocketSubmission(id: number) {
  const [row] = await db.select().from(docketSubmissions).where(eq(docketSubmissions.id, id));
  return row ?? null;
}

export async function updateDocketSubmission(id: number, data: Partial<InsertDocketSubmission>) {
  await db.update(docketSubmissions).set({ ...data, updatedAt: Date.now() }).where(eq(docketSubmissions.id, id));
}

// ─── Search Actors by Name ───

export async function searchActorsByName(term: string) {
  return db.select().from(docketActors)
    .where(like(docketActors.actorName, `%${term}%`))
    .orderBy(asc(docketActors.actorName))
    .limit(20);
}

export async function getDocketStats() {
  const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(docketEntries);
  const entries = await db.select({
    jurisdiction: docketEntries.jurisdiction,
    jurisdictionLevel: docketEntries.jurisdictionLevel,
    lawType: docketEntries.lawType,
    status: docketEntries.status,
  }).from(docketEntries);

  const byLevel: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byJurisdiction: Record<string, number> = {};
  for (const e of entries) {
    byLevel[e.jurisdictionLevel] = (byLevel[e.jurisdictionLevel] || 0) + 1;
    byType[e.lawType] = (byType[e.lawType] || 0) + 1;
    byJurisdiction[e.jurisdiction] = (byJurisdiction[e.jurisdiction] || 0) + 1;
  }

  return {
    total: countResult.count,
    byLevel,
    byType,
    byJurisdiction,
  };
}
