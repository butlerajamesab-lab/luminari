import { db } from "./db";
import { eq, and, like, desc, sql, inArray } from "drizzle-orm";
import {
  legalStatutes, legalCaseLaw, legalEnforcementRecords,
  legalWeakJoints, legalContradictions, legalStatuteClauses,
  type InsertLegalStatute, type InsertLegalCaseLaw,
  type InsertLegalEnforcementRecord, type InsertLegalWeakJoint,
  type InsertLegalContradiction, type InsertLegalStatuteClause, type LegalDomain,
} from "../drizzle/schema";

const now = () => Date.now();

// ─── Statutes ───

export async function createStatute(data: Omit<InsertLegalStatute, "id" | "createdAt" | "updatedAt">) {
  const [result] = await db.insert(legalStatutes).values({ ...data, createdAt: now(), updatedAt: now() });
  return result.insertId;
}

export async function getStatuteById(id: number) {
  const [row] = await db.select().from(legalStatutes).where(eq(legalStatutes.id, id));
  return row ?? null;
}

export async function searchStatutes(opts: {
  jurisdiction?: string;
  domain?: LegalDomain;
  query?: string;
  sourceType?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts.jurisdiction) conditions.push(eq(legalStatutes.jurisdiction, opts.jurisdiction));
  if (opts.sourceType) conditions.push(eq(legalStatutes.sourceType, opts.sourceType as any));
  if (opts.query) {
    conditions.push(
      sql`(${legalStatutes.citation} LIKE ${`%${opts.query}%`} OR ${legalStatutes.title} LIKE ${`%${opts.query}%`} OR ${legalStatutes.summary} LIKE ${`%${opts.query}%`})`
    );
  }
  if (opts.domain) {
    conditions.push(sql`JSON_CONTAINS(${legalStatutes.domains}, ${JSON.stringify(opts.domain)})`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(legalStatutes)
    .where(where)
    .orderBy(desc(legalStatutes.updatedAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
  return rows;
}

export async function countStatutes(jurisdiction?: string) {
  const conditions = jurisdiction ? eq(legalStatutes.jurisdiction, jurisdiction) : undefined;
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(legalStatutes).where(conditions);
  return row?.count ?? 0;
}

export async function updateStatute(id: number, data: Partial<Omit<InsertLegalStatute, "id" | "createdAt">>) {
  await db.update(legalStatutes).set({ ...data, updatedAt: now() }).where(eq(legalStatutes.id, id));
}

export async function deleteStatute(id: number) {
  await db.delete(legalStatutes).where(eq(legalStatutes.id, id));
}

// ─── Case Law ───

export async function createCaseLaw(data: Omit<InsertLegalCaseLaw, "id" | "createdAt" | "updatedAt">) {
  const [result] = await db.insert(legalCaseLaw).values({ ...data, createdAt: now(), updatedAt: now() });
  return result.insertId;
}

export async function getCaseLawById(id: number) {
  const [row] = await db.select().from(legalCaseLaw).where(eq(legalCaseLaw.id, id));
  return row ?? null;
}

export async function searchCaseLaw(opts: {
  jurisdiction?: string;
  domain?: LegalDomain;
  query?: string;
  court?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts.jurisdiction) conditions.push(eq(legalCaseLaw.jurisdiction, opts.jurisdiction));
  if (opts.court) conditions.push(like(legalCaseLaw.court, `%${opts.court}%`));
  if (opts.query) {
    conditions.push(
      sql`(${legalCaseLaw.citation} LIKE ${`%${opts.query}%`} OR ${legalCaseLaw.caseName} LIKE ${`%${opts.query}%`} OR ${legalCaseLaw.holding} LIKE ${`%${opts.query}%`})`
    );
  }
  if (opts.domain) {
    conditions.push(sql`JSON_CONTAINS(${legalCaseLaw.domains}, ${JSON.stringify(opts.domain)})`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(legalCaseLaw)
    .where(where)
    .orderBy(desc(legalCaseLaw.yearDecided))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
  return rows;
}

export async function countCaseLaw(jurisdiction?: string) {
  const conditions = jurisdiction ? eq(legalCaseLaw.jurisdiction, jurisdiction) : undefined;
  const [row] = await db.select({ count: sql<number>`COUNT(*)` }).from(legalCaseLaw).where(conditions);
  return row?.count ?? 0;
}

// ─── Enforcement Records ───

export async function createEnforcementRecord(data: Omit<InsertLegalEnforcementRecord, "id" | "createdAt" | "updatedAt">) {
  const [result] = await db.insert(legalEnforcementRecords).values({ ...data, createdAt: now(), updatedAt: now() });
  return result.insertId;
}

export async function getEnforcementRecordById(id: number) {
  const [row] = await db.select().from(legalEnforcementRecords).where(eq(legalEnforcementRecords.id, id));
  return row ?? null;
}

export async function searchEnforcementRecords(opts: {
  jurisdiction?: string;
  domain?: LegalDomain;
  agency?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts.jurisdiction) conditions.push(eq(legalEnforcementRecords.jurisdiction, opts.jurisdiction));
  if (opts.agency) conditions.push(like(legalEnforcementRecords.agencyName, `%${opts.agency}%`));
  if (opts.domain) {
    conditions.push(sql`JSON_CONTAINS(${legalEnforcementRecords.domains}, ${JSON.stringify(opts.domain)})`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(legalEnforcementRecords)
    .where(where)
    .orderBy(desc(legalEnforcementRecords.updatedAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
  return rows;
}

// ─── Weak Joints ───

export async function createWeakJoint(data: Omit<InsertLegalWeakJoint, "id" | "createdAt" | "updatedAt">) {
  const [result] = await db.insert(legalWeakJoints).values({ ...data, createdAt: now(), updatedAt: now() });
  return result.insertId;
}

export async function getWeakJointById(id: number) {
  const [row] = await db.select().from(legalWeakJoints).where(eq(legalWeakJoints.id, id));
  return row ?? null;
}

export async function searchWeakJoints(opts: {
  jurisdiction?: string;
  domain?: LegalDomain;
  severity?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts.jurisdiction) conditions.push(eq(legalWeakJoints.jurisdiction, opts.jurisdiction));
  if (opts.severity) conditions.push(eq(legalWeakJoints.severity, opts.severity as any));
  if (opts.domain) {
    conditions.push(sql`JSON_CONTAINS(${legalWeakJoints.domains}, ${JSON.stringify(opts.domain)})`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(legalWeakJoints)
    .where(where)
    .orderBy(desc(legalWeakJoints.severity))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
  return rows;
}

// ─── Contradictions ───

export async function createContradiction(data: Omit<InsertLegalContradiction, "id" | "createdAt" | "updatedAt">) {
  const [result] = await db.insert(legalContradictions).values({ ...data, createdAt: now(), updatedAt: now() });
  return result.insertId;
}

export async function getContradictionById(id: number) {
  const [row] = await db.select().from(legalContradictions).where(eq(legalContradictions.id, id));
  return row ?? null;
}

export async function listContradictions(opts: {
  jurisdiction?: string;
  domain?: LegalDomain;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts.jurisdiction) conditions.push(eq(legalContradictions.jurisdiction, opts.jurisdiction));
  if (opts.domain) {
    conditions.push(sql`JSON_CONTAINS(${legalContradictions.domains}, ${JSON.stringify(opts.domain)})`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(legalContradictions)
    .where(where)
    .orderBy(desc(legalContradictions.updatedAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
  return rows;
}

// ─── Stats ───

export async function getLegalLibraryStats(jurisdiction?: string) {
  const jFilter = jurisdiction ? eq(legalStatutes.jurisdiction, jurisdiction) : undefined;
  const [statutes] = await db.select({ count: sql<number>`COUNT(*)` }).from(legalStatutes).where(jFilter);
  const jFilter2 = jurisdiction ? eq(legalCaseLaw.jurisdiction, jurisdiction) : undefined;
  const [cases] = await db.select({ count: sql<number>`COUNT(*)` }).from(legalCaseLaw).where(jFilter2);
  const jFilter3 = jurisdiction ? eq(legalEnforcementRecords.jurisdiction, jurisdiction) : undefined;
  const [enforcement] = await db.select({ count: sql<number>`COUNT(*)` }).from(legalEnforcementRecords).where(jFilter3);
  const jFilter4 = jurisdiction ? eq(legalWeakJoints.jurisdiction, jurisdiction) : undefined;
  const [weakJoints] = await db.select({ count: sql<number>`COUNT(*)` }).from(legalWeakJoints).where(jFilter4);
  const jFilter5 = jurisdiction ? eq(legalContradictions.jurisdiction, jurisdiction) : undefined;
  const [contradictions] = await db.select({ count: sql<number>`COUNT(*)` }).from(legalContradictions).where(jFilter5);
  return {
    statutes: statutes?.count ?? 0,
    caseLaw: cases?.count ?? 0,
    enforcementRecords: enforcement?.count ?? 0,
    weakJoints: weakJoints?.count ?? 0,
    contradictions: contradictions?.count ?? 0,
  };
}


// ─── Statute Clauses (X-Ray) ───
export async function getClausesByStatuteId(statuteId: number) {
  return db.select().from(legalStatuteClauses)
    .where(eq(legalStatuteClauses.statuteId, statuteId))
    .orderBy(legalStatuteClauses.sortOrder);
}

export async function getStatuteWithClauses(statuteId: number) {
  const statute = await db.select().from(legalStatutes).where(eq(legalStatutes.id, statuteId)).limit(1);
  if (!statute.length) return null;
  const clauses = await getClausesByStatuteId(statuteId);
  return { ...statute[0], clauses };
}

export async function searchEnrichedStatutes(opts: {
  domain?: LegalDomain;
  jurisdiction?: string;
  limit?: number;
}) {
  const conditions: any[] = [];
  if (opts.domain) {
    conditions.push(sql`JSON_CONTAINS(${legalStatutes.domains}, ${JSON.stringify(opts.domain)})`);
  }
  if (opts.jurisdiction) {
    conditions.push(eq(legalStatutes.jurisdiction, opts.jurisdiction));
  }
  // Only return statutes that have enriched metadata
  conditions.push(sql`${legalStatutes.keyProvisions} IS NOT NULL`);

  return db.select().from(legalStatutes)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(desc(legalStatutes.updatedAt))
    .limit(opts.limit ?? 50);
}
