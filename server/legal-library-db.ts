import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { db } from "./db";
import {
  legalStatutes,
  legalCaseLaw,
  legalEnforcementRecords,
  legalWeakJoints,
  legalContradictions,
  legalStatuteClauses,
  type InsertLegalStatute,
  type InsertLegalCaseLaw,
  type InsertLegalEnforcementRecord,
  type InsertLegalWeakJoint,
  type InsertLegalContradiction,
  type LegalDomain,
} from "../drizzle/schema";

export type LegalRecordId = string;

const textSearch = (query: string, ...columns: any[]) => {
  const pattern = `%${query}%`;
  return sql`(${sql.join(columns.map((column) => sql`COALESCE(${column}::text, '') ILIKE ${pattern}`), sql` OR `)})`;
};

const metadataContainsDomain = (metadataColumn: any, domain: LegalDomain) => {
  const pattern = `%${domain}%`;
  return sql`COALESCE(${metadataColumn}::text, '') ILIKE ${pattern}`;
};

const countValue = (value: unknown): number => Number(value ?? 0);

// ─── Statutes ───

export async function createStatute(data: Omit<InsertLegalStatute, "id" | "createdAt"> & Record<string, unknown>) {
  const [row] = await db.insert(legalStatutes).values({
    citation: String(data.citation ?? "Untitled statute"),
    jurisdiction: (data.jurisdiction as string | undefined) ?? null,
    title: (data.title as string | undefined) ?? null,
    statuteText: (data.statuteText as string | undefined) ?? (data.fullText as string | undefined) ?? null,
    metadata: { ...data, created_via: "legal_library_router" },
  }).returning({ id: legalStatutes.id });
  return row.id;
}

export async function getStatuteById(id: LegalRecordId) {
  const [row] = await db.select().from(legalStatutes).where(eq(legalStatutes.id, id)).limit(1);
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
  if (opts.sourceType) conditions.push(sql`${legalStatutes.metadata}->>'source_type' = ${opts.sourceType} OR ${legalStatutes.metadata}->>'connector' = ${opts.sourceType}`);
  if (opts.query) conditions.push(textSearch(opts.query, legalStatutes.citation, legalStatutes.title, legalStatutes.statuteText, legalStatutes.metadata));
  if (opts.domain) conditions.push(metadataContainsDomain(legalStatutes.metadata, opts.domain));

  const query = db.select().from(legalStatutes)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(legalStatutes.createdAt));
  return query;
}

export async function countStatutes(jurisdiction?: string) {
  const [row] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(legalStatutes)
    .where(jurisdiction ? eq(legalStatutes.jurisdiction, jurisdiction) : undefined);
  return countValue(row?.count);
}

export async function updateStatute(id: LegalRecordId, data: Partial<InsertLegalStatute> & Record<string, unknown>) {
  await db.update(legalStatutes).set({
    ...(data.citation !== undefined ? { citation: String(data.citation) } : {}),
    ...(data.jurisdiction !== undefined ? { jurisdiction: data.jurisdiction as string | null } : {}),
    ...(data.title !== undefined ? { title: data.title as string | null } : {}),
    ...(data.statuteText !== undefined || data.fullText !== undefined ? { statuteText: (data.statuteText as string | undefined) ?? (data.fullText as string | undefined) ?? null } : {}),
    metadata: sql`COALESCE(${legalStatutes.metadata}, '{}'::jsonb) || ${JSON.stringify(data)}::jsonb`,
  }).where(eq(legalStatutes.id, id));
}

export async function deleteStatute(id: LegalRecordId) {
  await db.delete(legalStatutes).where(eq(legalStatutes.id, id));
}

// ─── Case Law ───

export async function createCaseLaw(data: Omit<InsertLegalCaseLaw, "id" | "createdAt"> & Record<string, unknown>) {
  const [row] = await db.insert(legalCaseLaw).values({
    citation: String(data.citation ?? data.caseName ?? "Untitled case"),
    jurisdiction: (data.jurisdiction as string | undefined) ?? (data.court as string | undefined) ?? null,
    title: (data.title as string | undefined) ?? (data.caseName as string | undefined) ?? null,
    opinionText: (data.opinionText as string | undefined) ?? (data.holding as string | undefined) ?? null,
    metadata: { ...data, court: data.court, created_via: "legal_library_router" },
  }).returning({ id: legalCaseLaw.id });
  return row.id;
}

export async function getCaseLawById(id: LegalRecordId) {
  const [row] = await db.select().from(legalCaseLaw).where(eq(legalCaseLaw.id, id)).limit(1);
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
  if (opts.court) conditions.push(sql`(${legalCaseLaw.jurisdiction} ILIKE ${`%${opts.court}%`} OR ${legalCaseLaw.metadata}->>'court' ILIKE ${`%${opts.court}%`})`);
  if (opts.query) conditions.push(textSearch(opts.query, legalCaseLaw.citation, legalCaseLaw.title, legalCaseLaw.opinionText, legalCaseLaw.metadata));
  if (opts.domain) conditions.push(metadataContainsDomain(legalCaseLaw.metadata, opts.domain));

  return db.select().from(legalCaseLaw)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(legalCaseLaw.createdAt));
}

export async function countCaseLaw(jurisdiction?: string) {
  const [row] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(legalCaseLaw)
    .where(jurisdiction ? eq(legalCaseLaw.jurisdiction, jurisdiction) : undefined);
  return countValue(row?.count);
}

// ─── Enforcement Records ───

export async function createEnforcementRecord(data: Omit<InsertLegalEnforcementRecord, "id" | "createdAt"> & Record<string, unknown>) {
  const [row] = await db.insert(legalEnforcementRecords).values({
    jurisdiction: (data.jurisdiction as string | undefined) ?? null,
    agencyName: (data.agencyName as string | undefined) ?? null,
    complaintType: (data.complaintType as string | undefined) ?? (data.programArea as string | undefined) ?? null,
    domains: (data.domains as string | undefined) ?? null,
    statutoryRequirement: (data.statutoryRequirement as string | undefined) ?? (data.statutoryAuthority as string | undefined) ?? null,
    statuteCitation: (data.statuteCitation as string | undefined) ?? null,
    outcome: (data.outcome as string | undefined) ?? null,
    requiredResponseDays: (data.requiredResponseDays as string | undefined) ?? null,
    observedResponseDays: (data.observedResponseDays as string | undefined) ?? null,
    patternDescription: (data.patternDescription as string | undefined) ?? null,
    dataSource: (data.dataSource as string | undefined) ?? (data.sourceUrl as string | undefined) ?? null,
    periodStart: (data.periodStart as string | undefined) ?? null,
    periodEnd: (data.periodEnd as string | undefined) ?? null,
    addedBy: (data.addedBy as string | undefined) ?? "legal_library_router",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }).returning({ id: legalEnforcementRecords.id });
  return row.id;
}

export async function getEnforcementRecordById(id: LegalRecordId) {
  const [row] = await db.select().from(legalEnforcementRecords).where(eq(legalEnforcementRecords.id, id as any)).limit(1);
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
  if (opts.agency) conditions.push(ilike(legalEnforcementRecords.agencyName, `%${opts.agency}%`));
  if (opts.domain) conditions.push(ilike(legalEnforcementRecords.domains, `%${opts.domain}%`));

  return db.select().from(legalEnforcementRecords)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(legalEnforcementRecords.createdAt));
}

// ─── Weak Joints ───

export async function createWeakJoint(data: Omit<InsertLegalWeakJoint, "id" | "createdAt"> & Record<string, unknown>) {
  const [row] = await db.insert(legalWeakJoints).values({
    weakJointId: (data.weakJointId as string | undefined) ?? null,
    title: (data.title as string | undefined) ?? (data.statuteCitation as string | undefined) ?? null,
    description: (data.description as string | undefined) ?? (data.divergenceDescription as string | undefined) ?? null,
    severityLevel: (data.severityLevel as string | undefined) ?? (data.severity as string | undefined) ?? null,
    severityRationale: (data.severityRationale as string | undefined) ?? null,
    reformStatus: (data.reformStatus as string | undefined) ?? null,
    sourceUrl: (data.sourceUrl as string | undefined) ?? null,
    metadata: { ...data, created_via: "legal_library_router" },
  }).returning({ id: legalWeakJoints.id });
  return row.id;
}

export async function getWeakJointById(id: LegalRecordId) {
  const [row] = await db.select().from(legalWeakJoints).where(eq(legalWeakJoints.id, id)).limit(1);
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
  if (opts.jurisdiction) conditions.push(sql`${legalWeakJoints.metadata}->>'jurisdiction' = ${opts.jurisdiction}`);
  if (opts.severity) conditions.push(eq(legalWeakJoints.severityLevel, opts.severity));
  if (opts.domain) conditions.push(metadataContainsDomain(legalWeakJoints.metadata, opts.domain));

  return db.select().from(legalWeakJoints)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(legalWeakJoints.createdAt));
}

// ─── Contradictions ───

export async function createContradiction(data: Omit<InsertLegalContradiction, "id" | "createdAt" | "updatedAt"> & Record<string, unknown>) {
  const [row] = await db.insert(legalContradictions).values({
    ...data,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as any).returning({ id: legalContradictions.id });
  return row.id;
}

export async function getContradictionById(id: number) {
  const [row] = await db.select().from(legalContradictions).where(eq(legalContradictions.id, id)).limit(1);
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
  if (opts.domain) conditions.push(sql`${legalContradictions.domains} @> ${JSON.stringify([opts.domain])}::jsonb`);
  return db.select().from(legalContradictions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(legalContradictions.updatedAt));
}

// ─── Stats (resilient — each count independent, failures return 0) ───

export async function getLegalLibraryStats(jurisdiction?: string) {
  const safeCount = async (fn: () => Promise<any[]>): Promise<number> => {
    try {
      const [row] = await fn();
      return countValue(row?.count);
    } catch {
      return 0;
    }
  };

  const [statutes, caseLaw, enforcementRecords, weakJoints, contradictions] = await Promise.all([
    safeCount(() => db.select({ count: sql<number>`COUNT(*)::int` }).from(legalStatutes)
      .where(jurisdiction ? eq(legalStatutes.jurisdiction, jurisdiction) : undefined)),
    safeCount(() => db.select({ count: sql<number>`COUNT(*)::int` }).from(legalCaseLaw)
      .where(jurisdiction ? eq(legalCaseLaw.jurisdiction, jurisdiction) : undefined)),
    safeCount(() => db.select({ count: sql<number>`COUNT(*)::int` }).from(legalEnforcementRecords)
      .where(jurisdiction ? eq(legalEnforcementRecords.jurisdiction, jurisdiction) : undefined)),
    safeCount(() => db.select({ count: sql<number>`COUNT(*)::int` }).from(legalWeakJoints)
      .where(jurisdiction ? sql`${legalWeakJoints.metadata}->>'jurisdiction' = ${jurisdiction}` : undefined)),
    safeCount(() => db.select({ count: sql<number>`COUNT(*)::int` }).from(legalContradictions)
      .where(jurisdiction ? eq(legalContradictions.jurisdiction, jurisdiction) : undefined)),
  ]);

  return { statutes, caseLaw, enforcementRecords, weakJoints, contradictions };
}

// ─── Statute Clauses (X-Ray) ───
export async function getClausesByStatuteId(statuteId: number) {
  return db.select().from(legalStatuteClauses)
    .where(eq(legalStatuteClauses.statuteId, statuteId))
    .orderBy(legalStatuteClauses.sortOrder);
}

export async function getStatuteWithClauses(statuteId: LegalRecordId) {
  const statute = await db.select().from(legalStatutes).where(eq(legalStatutes.id, statuteId)).limit(1);
  if (!statute.length) return null;
  return { ...statute[0], clauses: [] };
}

export async function searchEnrichedStatutes(opts: {
  domain?: LegalDomain;
  jurisdiction?: string;
  limit?: number;
}) {
  const conditions: any[] = [];
  if (opts.domain) conditions.push(metadataContainsDomain(legalStatutes.metadata, opts.domain));
  if (opts.jurisdiction) conditions.push(eq(legalStatutes.jurisdiction, opts.jurisdiction));
  conditions.push(sql`${legalStatutes.metadata} IS NOT NULL`);

  return db.select().from(legalStatutes)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(legalStatutes.createdAt));
}
