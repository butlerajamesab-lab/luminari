import { eq, and, desc, asc, sql, inArray, lte, lt, gt, not } from "drizzle-orm";
import { compareDateOccurred, normalizeDateForSort, isPreModernDate } from "./date-normalizer";
import { runPhoenixDetection, emitPhoenixSignal } from "./engines/phoenix-detector";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createDatabasePool } from "./pg-config";
import {
  users, cases, documents, quotes, entities, entityRoles,
  relationships, relationshipEvidence, claims, findings,
  events, signalFlags, documentCorrelations,
  presentations, presentationSlides, auditTrail, chatMessages,
  entityMergeSuggestions, uploadSessions, provenanceAuditLogs, batchRerunRuns,
  caseCollaborators, corpusSnapshots,
  checklistItems, userFeedback, pipelineEvents, shareLinks, notifications,
  adminInvites, inviteRedemptions,
  foiaRequests, foiaStatutes, foiaAgencies, missingRecords,
  caseNarratives,
  patternTypes, patterns, patternOccurrences,
  benefitApplications,
  lighthouseEvents, geocodeCache, mapIntakeSessions,
  evidenceItems, evidenceProofLinks, evidenceEventLinks, evidenceGraphEdges,
  enforcementActionPaths,
} from "../drizzle/schema";

import type {
  User, Case, Document, Quote, Entity, EntityRole,
  Relationship, RelationshipEvidence, Claim, Finding,
  Event, SignalFlag, DocumentCorrelation,
  Presentation, PresentationSlide, AuditTrailEntry, ChatMessage,
  EntityMergeSuggestion, UploadSession, ProvenanceAuditLog, BatchRerunRun,
  CaseCollaborator, CollaboratorAccessLevel, CorpusSnapshot,
  ChecklistItem, UserFeedback, PipelineEvent, ShareLink, Notification,
  AdminInvite, InviteRedemption,
  FoiaRequest, FoiaStatute, FoiaAgency,
  CaseNarrative, NarrativeSourceMap,
  Pattern, PatternOccurrence, PatternType, PatternTypeValue,
  BenefitApplication, InsertBenefitApplication,
  LighthouseEvent, InsertLighthouseEvent,
  MapIntakeSession, InsertMapIntakeSession,
  EnforcementActionPath, InsertEnforcementActionPath,
} from "../drizzle/schema";
import { createHash } from "crypto";
import { TRPCError } from "@trpc/server";
import { signSnapshot, type SnapshotSigningPayload } from "./crypto-signing";
import { resolveTemporalOrder } from "./phase2-temporal-ordering";

// ─── Database Connection (Supabase PostgreSQL) ───
// Lazy-initialized pool: does not connect at module load time.
// Connection is only attempted when a query is actually made.
let pgPool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;
function initializePool(): Pool {
  if (pgPool) return pgPool;
  pgPool = createDatabasePool({ label: "DB", connectionTimeoutMillis: 10000, max: 10 });
  return pgPool;
}

export function getDb() {
  if (!dbInstance) {
    const pool = initializePool();
    dbInstance = drizzle(pool);
  }
  return dbInstance;
}

// Lazy getter for backward compatibility
export const db = new Proxy({} as any, {
  get: (target, prop) => {
    return getDb()[prop as any];
  },
});

// Export pool for direct access if needed
export function getPool(): Pool {
  return initializePool();
}

export const pool = new Proxy({} as any, {
  get: (target, prop) => {
    return initializePool()[prop as any];
  },
});

// 3. Runtime guard validates actual connection success instead of hardcoded name
export async function verifyConnection() {
  try {
    const connection = await initializePool().connect();
    console.log(`[DB] Successfully connected to Supabase PostgreSQL database.`);
    connection.release();
  } catch (error) {
    console.error(`[DB] Failed to connect to the database:`, error);
    process.exit(1);
  }
}

// Do NOT call verifyConnection() at module load time.
// Instead, let routes call it on-demand or during health checks.
// This allows the server to boot even if the database is temporarily unavailable.

// ─── User Management (required by auth framework) ───
function mapUserRow(row: any): User | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    openId: row.open_id ?? row.openId,
    name: row.name ?? null,
    email: row.email ?? null,
    loginMethod: row.login_method ?? row.loginMethod ?? null,
    role: row.role ?? "user",
    plan: row.plan ?? "free",
    createdAt: Number(row.created_at ?? row.createdAt ?? 0),
    updatedAt: Number(row.updated_at ?? row.updatedAt ?? 0),
    lastSignedIn: Number(row.last_signed_in ?? row.lastSignedIn ?? 0),
  } as User;
}

const USER_SELECT_SQL = `
  select
    id,
    open_id,
    name,
    email,
    login_method,
    role,
    plan,
    created_at,
    updated_at,
    last_signed_in
  from public.users
`;

export async function getUserByOpenId(openId: string): Promise<User | null> {
  const result = await getPool().query(`${USER_SELECT_SQL} where open_id = $1 limit 1`, [openId]);
  return mapUserRow(result.rows[0]);
}

export async function getUserById(id: number): Promise<User | null> {
  const result = await getPool().query(`${USER_SELECT_SQL} where id = $1 limit 1`, [id]);
  return mapUserRow(result.rows[0]);
}

export async function upsertUser(data: {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  lastSignedIn?: Date | number;
}) {
  const now = Date.now();
  const lastSignedIn = data.lastSignedIn instanceof Date ? data.lastSignedIn.getTime() : (data.lastSignedIn ?? now);
  const ownerOpenId = process.env.OWNER_OPEN_ID ?? "";
  const isOwner = Boolean(ownerOpenId && data.openId === ownerOpenId);
  const existing = await getUserByOpenId(data.openId);

  if (existing) {
    const role = isOwner && existing.role !== "admin" ? "admin" : existing.role;
    await getPool().query(
      `update public.users
       set
         name = coalesce($2, name),
         email = coalesce($3, email),
         login_method = coalesce($4, login_method),
         role = $5,
         last_signed_in = $6,
         updated_at = $7
       where open_id = $1`,
      [data.openId, data.name ?? null, data.email ?? null, data.loginMethod ?? null, role, lastSignedIn, now]
    );
  } else {
    await getPool().query(
      `insert into public.users (open_id, name, email, login_method, role, plan, created_at, updated_at, last_signed_in)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [data.openId, data.name ?? null, data.email ?? null, data.loginMethod ?? null, isOwner ? "admin" : "user", "free", now, now, lastSignedIn]
    );
  }
}

// ─── Audit Trail Helpers ───
let lastAuditHash = "0000000000000000000000000000000000000000000000000000000000000000";

export async function logAudit(entry: {
  caseId?: number;
  userId?: number;
  action: string;
  targetType?: string;
  targetId?: number;
  details?: Record<string, unknown>;
}) {
  const now = Date.now();
  const payload = JSON.stringify({ ...entry, createdAt: now, previousHash: lastAuditHash });
  const hash = createHash("sha256").update(payload).digest("hex");
  lastAuditHash = hash;
  await db.insert(auditTrail).values({
    caseId: entry.caseId ?? null,
    userId: entry.userId ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    details: entry.details ?? null,
    hash,
    createdAt: now,
  });
  return hash;
}

// ─── Corpus Snapshots (Gate 6) ───

/**
 * Create a new corpus snapshot for a case.
 * Version is auto-incremented from the latest snapshot for that case.
 */
export async function createCorpusSnapshot(data: {
  caseId: number;
  engineVersion: string;
  documentIds: number[];
  documentHashes: Record<string, string>;
}): Promise<{ id: number; version: number }> {
  // Get next version number
  const [latest] = await db.select({ maxVersion: sql<number>`COALESCE(MAX(version), -1)` })
    .from(corpusSnapshots)
    .where(eq(corpusSnapshots.caseId, data.caseId));
  const nextVersion = (latest?.maxVersion ?? -1) + 1;
  const now = Date.now();
  const [result] = await db.insert(corpusSnapshots).values({
    caseId: data.caseId,
    version: nextVersion,
    engineVersion: data.engineVersion,
    documentIds: data.documentIds,
    documentHashes: data.documentHashes,
    createdAt: now,
    status: 'open',
  });
  return { id: result.insertId, version: nextVersion };
}

/**
 * Get the current open snapshot for a case, or null if none exists.
 */
export async function getOpenSnapshot(caseId: number): Promise<CorpusSnapshot | null> {
  const [row] = await db.select().from(corpusSnapshots)
    .where(and(eq(corpusSnapshots.caseId, caseId), eq(corpusSnapshots.status, 'open')))
    .orderBy(desc(corpusSnapshots.version))
    .limit(1);
  return row ?? null;
}

/**
 * Get the latest snapshot for a case (open or sealed).
 */
export async function getLatestSnapshot(caseId: number): Promise<CorpusSnapshot | null> {
  const [row] = await db.select().from(corpusSnapshots)
    .where(eq(corpusSnapshots.caseId, caseId))
    .orderBy(desc(corpusSnapshots.version))
    .limit(1);
  return row ?? null;
}

/**
 * Get a snapshot by ID.
 */
export async function getSnapshot(id: number): Promise<CorpusSnapshot | null> {
  const [row] = await db.select().from(corpusSnapshots).where(eq(corpusSnapshots.id, id));
  return row ?? null;
}

/**
 * List all snapshots for a case.
 */
export async function listSnapshots(caseId: number): Promise<CorpusSnapshot[]> {
  return db.select().from(corpusSnapshots)
    .where(eq(corpusSnapshots.caseId, caseId))
    .orderBy(desc(corpusSnapshots.version));
}

/**
 * Seal a snapshot — marks it as immutable. No further writes allowed.
 * Gate 9: Computes deterministic manifest hash and signs with Ed25519.
 */
export async function sealSnapshot(snapshotId: number): Promise<void> {
  // Fetch snapshot data for signing
  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Snapshot ${snapshotId} not found` });
  }

  // Gate 9: Prevent re-sealing a snapshot that is already signed
  if (snapshot.status === 'sealed' && snapshot.signature) {
    return;
  }

  const payload: SnapshotSigningPayload = {
    snapshotId,
    caseId: snapshot.caseId,
    version: snapshot.version,
    manifestHash: snapshot.manifestHash || '',
    sealedAt: Date.now(),
    engineVersion: snapshot.engineVersion || 'unknown',
  };

  const signature = signSnapshot(payload);

  await db.update(corpusSnapshots)
    .set({
      status: 'sealed',
      signature,
      sealedAt: Date.now(),
    })
    .where(eq(corpusSnapshots.id, snapshotId));
}
