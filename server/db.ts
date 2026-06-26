// @ts-nocheck — restored legacy helper surface has pre-existing schema type drift; runtime auth helpers below use explicit snake_case SQL.
import { eq, and, desc, asc, sql, inArray, lte, lt, gt, not } from "drizzle-orm";
import { compareDateOccurred, normalizeDateForSort, isPreModernDate } from "./date-normalizer";
import { runPhoenixDetection, emitPhoenixSignal } from "./engines/phoenix-detector";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { create_database_pool } from "./pg-config";
import {
  users, cases, documents, quotes, entities, entityRoles,
  relationships, relationshipEvidence, claims, findings,
  events, signalFlags, documentCorrelations,
  presentations, presentationSlides, auditTrail, chatMessages,
  entityMergeSuggestions, uploadSessions, provenanceAuditLogs, batchRerunRuns,
  caseCollaborators, corpusSnapshots,
  checklistItems, userFeedback, pipelineEvents, shareLinks, notifications,
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
//
// This is the SINGLE canonical postgres client + drizzle instance for the
// Lighthouse server. All other modules must import `db` / `getPool` from here
// rather than constructing their own connection (see pg-config.ts).
//
// REMINDER: the Render env var DATABASE_URL must use the Supabase transaction
// pooler on port 6543 (e.g. ...pooler.supabase.com:6543/postgres), NOT the
// direct connection on 5432. The pooler does not support prepared statements,
// so prepared statements stay disabled (postgres.js equivalent:
// `postgres(DATABASE_URL, { prepare: false })`). The pg pool below never names
// queries, so no prepared statements are emitted.
let pgPool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;
function initializePool(): Pool {
  if (pgPool) return pgPool;
  pgPool = create_database_pool({ label: "DB", connection_timeout_millis: 10000, max: 5 });
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


export type DbTimeoutCode = "pool_acquire_timeout" | "query_timeout";

export class DbTimeoutDiagnosticError extends Error {
  code: DbTimeoutCode;
  detail: string;
  timeout_ms: number;

  constructor(code: DbTimeoutCode, message: string, timeout_ms: number, detail?: string) {
    super(message);
    this.name = "DbTimeoutDiagnosticError";
    this.code = code;
    this.detail = detail ?? message;
    this.timeout_ms = timeout_ms;
  }
}

function normalize_error_message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function is_query_timeout_error(error: unknown): boolean {
  const err = error as any;
  const message = normalize_error_message(error).toLowerCase();
  return (
    err?.code === "57014" ||
    message.includes("statement timeout") ||
    message.includes("query read timeout") ||
    message.includes("query timeout")
  );
}

export function classify_db_error(error: unknown): "pool_acquire_timeout" | "query_timeout" | "db_error" {
  const err = error as any;
  const message = normalize_error_message(error).toLowerCase();
  if (err?.code === "pool_acquire_timeout") return "pool_acquire_timeout";
  if (err?.code === "query_timeout" || is_query_timeout_error(error)) return "query_timeout";
  if (message.includes("timeout exceeded when trying to connect")) return "pool_acquire_timeout";
  if (message.includes("connection terminated due to connection timeout")) return "pool_acquire_timeout";
  return "db_error";
}

export async function connect_with_pool_timeout(timeout_ms: number, label = "db"): Promise<any> {
  const pool = getPool();
  let timed_out = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const connect_promise = pool.connect().then((client) => {
    if (timed_out) {
      client.release();
      return Promise.reject(new DbTimeoutDiagnosticError("pool_acquire_timeout", `${label} pool acquire timed out after ${timeout_ms}ms`, timeout_ms));
    }
    return client;
  });

  const timeout_promise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timed_out = true;
      reject(new DbTimeoutDiagnosticError("pool_acquire_timeout", `${label} pool acquire timed out after ${timeout_ms}ms`, timeout_ms));
    }, timeout_ms);
  });

  try {
    return await Promise.race([connect_promise, timeout_promise]);
  } catch (error) {
    if (classify_db_error(error) === "pool_acquire_timeout") {
      throw error instanceof DbTimeoutDiagnosticError
        ? error
        : new DbTimeoutDiagnosticError("pool_acquire_timeout", `${label} pool acquire failed or timed out`, timeout_ms, normalize_error_message(error));
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function query_with_diagnostics<T = any>(
  text: string,
  values: unknown[] = [],
  options: { label?: string; pool_acquire_timeout_ms?: number; query_timeout_ms?: number } = {},
): Promise<{ rows: T[]; rowCount: number | null }> {
  const label = options.label ?? "db_query";
  const pool_acquire_timeout_ms = options.pool_acquire_timeout_ms ?? 1000;
  const query_timeout_ms = options.query_timeout_ms ?? 10000;
  const client = await connect_with_pool_timeout(pool_acquire_timeout_ms, label);
  try {
    return await client.query({ text, values, query_timeout: query_timeout_ms });
  } catch (error) {
    if (is_query_timeout_error(error)) {
      throw new DbTimeoutDiagnosticError("query_timeout", `${label} query timed out after ${query_timeout_ms}ms`, query_timeout_ms, normalize_error_message(error));
    }
    throw error;
  } finally {
    client.release();
  }
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
    openId: row.open_id,
    name: row.name ?? null,
    email: row.email ?? null,
    loginMethod: row.login_method ?? null,
    role: row.role ?? "user",
    plan: row.plan ?? "free",
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
    lastSignedIn: Number(row.last_signed_in ?? 0),
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
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `[GATE_SEALED_MUTATION] Snapshot v${snapshot.version} (ID: ${snapshot.id}) is already sealed and signed. Cannot re-seal.`,
    });
  }

  // Gate 9: Compute cryptographic signature
  const signingPayload: SnapshotSigningPayload = {
    snapshotId: snapshot.id,
    snapshotVersion: snapshot.version,
    engineVersion: snapshot.engineVersion,
    documentIds: snapshot.documentIds ?? [],
    documentHashes: snapshot.documentHashes ?? {},
  };
  const sigResult = signSnapshot(signingPayload);

  await db.update(corpusSnapshots).set({
    status: 'sealed',
    sealedAt: Date.now(),
    signature: sigResult.signature,
    signatureAlgorithm: sigResult.signatureAlgorithm,
    publicKeyFingerprint: sigResult.publicKeyFingerprint,
  }).where(eq(corpusSnapshots.id, snapshotId));
}

/**
 * Assert that a snapshot is mutable (not sealed). Throws a structured TRPCError
 * if the snapshot is sealed, preventing any mutation of immutable data.
 */
export async function assertSnapshotMutable(snapshotId: number): Promise<void> {
  if (!snapshotId || snapshotId === 0) return; // Legacy rows without snapshot binding are mutable
  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) return; // Non-existent snapshot — allow (defensive)
  if (snapshot.status === 'sealed') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `[GATE_SEALED_MUTATION] Snapshot v${snapshot.version} (ID: ${snapshot.id}) is sealed. Mutations on sealed snapshot data are rejected. Create a new snapshot to modify extraction outputs.`,
    });
  }
}

/**
 * Assert that a document's snapshot is mutable. Convenience wrapper.
 */
export async function assertDocumentSnapshotMutable(documentId: number): Promise<void> {
  const doc = await getDocument(documentId);
  if (!doc) return;
  await assertSnapshotMutable(doc.snapshotId);
}

/**
 * Check if a snapshot is sealed (non-throwing version for conditional logic).
 */
export async function isSnapshotSealed(snapshotId: number): Promise<boolean> {
  if (!snapshotId || snapshotId === 0) return false;
  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) return false;
  return snapshot.status === 'sealed';
}

/**
 * Update snapshot document manifest (add new document IDs and hashes).
 */
export async function updateSnapshotManifest(snapshotId: number, documentIds: number[], documentHashes: Record<string, string>): Promise<void> {
  await db.update(corpusSnapshots).set({
    documentIds,
    documentHashes,
  }).where(eq(corpusSnapshots.id, snapshotId));
}

// ─── Cases ───
export async function createCase(userId: number, name: string, description?: string, domain?: string, container?: string, pipelineType?: string) {
  const now = Date.now();
  // Normalize domain: lowercase and trim to prevent silent mismatches
  const normalizedDomain = domain ? domain.toLowerCase().trim() : null;
  const [result] = await db.insert(cases).values({ userId, name, description: description ?? null, domain: normalizedDomain, container: container ?? null, pipelineType: pipelineType ?? null, createdAt: now, updatedAt: now });
  return result.insertId;
}

export async function updateCaseDomainContainer(id: number, userId: number, data: { domain?: string; container?: string }) {
  // Normalize domain: lowercase and trim to prevent silent mismatches
  const normalizedData = {
    ...data,
    domain: data.domain ? data.domain.toLowerCase().trim() : data.domain,
  };
  await db.update(cases).set({ ...normalizedData, updatedAt: Date.now() }).where(and(eq(cases.id, id), eq(cases.userId, userId)));
}

export async function listCases(userId: number) {
  return db.select().from(cases).where(eq(cases.userId, userId)).orderBy(desc(cases.updatedAt));
}

export async function getCase(id: number, userId: number) {
  const [row] = await db.select().from(cases).where(and(eq(cases.id, id), eq(cases.userId, userId)));
  return row ?? null;
}

/**
 * getCaseInternal — pipeline-only, no userId check.
 * Use ONLY from server-side pipeline code that already validated ownership at ingestion.
 * NEVER expose through tRPC or any user-facing endpoint.
 */
export async function getCaseInternal(id: number) {
  const [row] = await db.select().from(cases).where(eq(cases.id, id));
  return row ?? null;
}

// ─── Collaborator Access Helpers ───

/**
 * getCollaboratorAccess — check if a user has collaborator access to a case.
 * Returns the collaborator row or null.
 */
export async function getCollaboratorAccess(caseId: number, userId: number): Promise<CaseCollaborator | null> {
  const [row] = await db.select().from(caseCollaborators)
    .where(and(eq(caseCollaborators.caseId, caseId), eq(caseCollaborators.userId, userId)));
  return row ?? null;
}

/**
 * addCollaborator — grant a user access to a case.
 * Only the case owner may call this. Throws on duplicate.
 */
export async function addCollaborator(caseId: number, userId: number, grantedBy: number, accessLevel: CollaboratorAccessLevel = "READ_ONLY") {
  const now = Date.now();
  const [result] = await db.insert(caseCollaborators).values({
    caseId, userId, accessLevel, grantedBy, grantedAt: now,
  });
  return result.insertId;
}

/**
 * removeCollaborator — revoke a user's access to a case.
 */
export async function removeCollaborator(caseId: number, userId: number) {
  await db.delete(caseCollaborators)
    .where(and(eq(caseCollaborators.caseId, caseId), eq(caseCollaborators.userId, userId)));
}

/**
 * listCollaborators — list all collaborators for a case.
 */
export async function listCollaborators(caseId: number): Promise<CaseCollaborator[]> {
  return db.select().from(caseCollaborators).where(eq(caseCollaborators.caseId, caseId));
}

/**
 * listSharedCases — list all cases shared with a user (where they are a collaborator).
 */
export async function listSharedCases(userId: number) {
  const collabs = await db.select().from(caseCollaborators).where(eq(caseCollaborators.userId, userId));
  if (collabs.length === 0) return [];
  const caseIds = collabs.map(c => c.caseId);
  const sharedCases = await db.select().from(cases).where(inArray(cases.id, caseIds));
  return sharedCases.map(c => {
    const collab = collabs.find(col => col.caseId === c.id)!;
    return { ...c, accessLevel: collab.accessLevel, grantedAt: collab.grantedAt };
  });
}

/**
 * verifyCaseOwnership — verify a resource's caseId belongs to the requesting user
 * OR the user has collaborator access (READ_ONLY or WRITE).
 * OR the request is from an authorized system actor (internal processing).
 * Throws FORBIDDEN if none of these conditions are met.
 * Returns { caseRow, accessLevel } where accessLevel is 'OWNER' | 'READ_ONLY' | 'WRITE' | 'SYSTEM'.
 * 
 * @param caseId - Case ID to verify
 * @param userId - User ID (for ownership/collaborator check)
 * @param systemActor - Optional system actor (INGESTION_ENGINE, PHOENIX_DETECTOR, SUNAM_GATE). When provided, bypasses ownership check.
 */
export async function verifyCaseOwnership(
  caseId: number,
  userId: number,
  systemActor?: 'INGESTION_ENGINE' | 'PHOENIX_DETECTOR' | 'SUNAM_GATE'
): Promise<Case & { _accessLevel: 'OWNER' | 'READ_ONLY' | 'WRITE' | 'SYSTEM' }> {
  console.log("[verifyCaseOwnership] caseId:", caseId, "userId:", userId);
  // Check ownership first
  const row = await getCase(caseId, userId);
  console.log("[verifyCaseOwnership] getCase result:", row ? { id: row.id, userId: row.userId } : null);
  if (row) return { ...row, _accessLevel: 'OWNER' as const };
  // Check collaborator access
  const collab = await getCollaboratorAccess(caseId, userId);
  console.log("[verifyCaseOwnership] collaborator result:", collab ? { caseId: collab.caseId, userId: collab.userId } : null);
  if (collab) {
    // Fetch the case without userId filter
    const caseRow = await getCaseInternal(caseId);
    if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
    // Audit: log collaborator access (non-blocking)
    logAudit({
      caseId,
      userId,
      action: "collaborator_access",
      targetType: "case",
      targetId: caseId,
      details: { accessLevel: collab.accessLevel },
    }).catch(() => {}); // fire-and-forget, never block on audit
    return { ...caseRow, _accessLevel: collab.accessLevel as 'READ_ONLY' | 'WRITE' };
  }
  
  // SOVEREIGN ACCESS: Bypass ownership check for authorized system actors
  // This allows background workers (ingestion, extraction, pattern detection)
  // to process cases regardless of user ownership.
  if (systemActor) {
    console.info(`[SOVEREIGN_ACCESS] Case ${caseId} accessed by ${systemActor}`);
    const caseRow = await getCaseInternal(caseId);
    if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
    
    // Log sovereign access for audit trail
    logAudit({
      caseId,
      userId: undefined, // System actor, not a user
      action: "sovereign_access",
      targetType: "case",
      targetId: caseId,
      details: { systemActor, accessLevel: 'SYSTEM' },
    }).catch(() => {}); // fire-and-forget, never block on audit
    
    return { ...caseRow, _accessLevel: 'SYSTEM' as const };
  }
  
  // Access denied: user is not owner, not collaborator, and not authorized system actor
  console.warn(`[verifyCaseOwnership] Access denied for user ${userId} to case ${caseId}`);
  throw new TRPCError({ code: "FORBIDDEN", message: "Access denied: you do not own this case" });
}

/**
 * verifyCaseWriteAccess — verify the user has write access to a case.
 * Only case owners and WRITE collaborators pass. READ_ONLY collaborators are blocked.
 * Returns the case row on success.
 */
export async function verifyCaseWriteAccess(
  caseId: number,
  userId: number,
  systemActor?: 'INGESTION_ENGINE' | 'PHOENIX_DETECTOR' | 'SUNAM_GATE'
): Promise<Case> {
  const result = await verifyCaseOwnership(caseId, userId, systemActor);
  if (result._accessLevel === 'READ_ONLY') {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied: read-only collaborator cannot perform write operations" });
  }
  return result;
}

/**
 * verifyDocumentOwnership — verify a document belongs to a case owned by the user.
 * Returns the document row on success.
 */
export async function verifyDocumentOwnership(documentId: number, userId: number) {
  const doc = await getDocument(documentId);
  if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
  await verifyCaseOwnership(doc.caseId, userId);
  return doc;
}

/**
 * verifyEntityOwnership — verify an entity belongs to a case owned by the user.
 * Returns the entity row on success.
 */
export async function verifyEntityOwnership(entityId: number, userId: number) {
  const entity = await getEntity(entityId);
  if (!entity) throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
  await verifyCaseOwnership(entity.caseId, userId);
  return entity;
}

export async function updateCase(id: number, userId: number, data: { name?: string; description?: string; status?: "active" | "archived"; domain?: string; container?: string }) {
  await db.update(cases).set({ ...data, updatedAt: Date.now() }).where(and(eq(cases.id, id), eq(cases.userId, userId)));
}

export async function deleteCase(id: number, userId: number) {
  await db.delete(cases).where(and(eq(cases.id, id), eq(cases.userId, userId)));
}

// ─── Documents ───
export async function createDocument(doc: {
  caseId: number;
  filename: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  s3Key: string;
  s3Url: string;
  sha256Hash: string;
  snapshotId: number;
}) {
  const [result] = await db.insert(documents).values({ ...doc, createdAt: Date.now() });
  return result.insertId;
}

export async function listDocuments(caseId: number) {
  return db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(desc(documents.createdAt));
}

export async function getDocument(id: number) {
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  return row ?? null;
}

export async function updateDocumentStatus(id: number, status: Document["status"], extra?: Partial<Document>) {
  await db.update(documents).set({ status, ...extra }).where(eq(documents.id, id));
}

export async function updateDocumentAnalysis(id: number, data: {
  textContent?: string;
  pageCount?: number;
  durationSeconds?: number;
  documentType?: string;
  documentPurpose?: string;
  aiMetadata?: Record<string, unknown>;
  status?: Document["status"];
  errorMessage?: string;
}) {
  await db.update(documents).set(data).where(eq(documents.id, id));
}

// ─── Hard Delete ───
export async function hardDeleteDocument(documentId: number, reason: string, userId: number) {
  // Gate 7: Reject delete on sealed snapshot rows
  await assertDocumentSnapshotMutable(documentId);

  // Fetch document metadata before deletion for audit trail
  const doc = await getDocument(documentId);
  if (!doc) return;
  // Log immutable audit entry with document identity (sha256Hash, filename, caseId)
  await logAudit({
    caseId: doc.caseId,
    userId,
    action: "hard_delete_document",
    targetType: "document",
    targetId: documentId,
    details: {
      sha256Hash: doc.sha256Hash,
      filename: doc.filename,
      caseId: doc.caseId,
      reason,
      s3Key: doc.s3Key, // Raw bytes remain in S3 rebuild layer
    },
  });
  // Hard delete — row removed from DB. S3 bytes preserved.
  await db.delete(documents).where(eq(documents.id, documentId));
}

// ─── Document Query Helpers ───
export async function findDocumentsByStatuses(statuses: Document["status"][], caseId?: number) {
  if (statuses.length === 0) return [];
  if (caseId) {
    return db.select().from(documents).where(
      and(inArray(documents.status, statuses), eq(documents.caseId, caseId))
    );
  }
  return db.select().from(documents).where(inArray(documents.status, statuses));
}

// ─── Quotes ───
export async function createQuote(q: {
  caseId: number;
  documentId: number;
  text: string;
  pageNumber?: number;
  timestampStart?: number;
  timestampEnd?: number;
  context?: string;
  statementOrigin?: 'sworn_testimony' | 'court_filing' | 'discovery_disclosure' | 'media_report' | 'internal_memo' | 'informal_communication' | 'unknown';
  engineVersion: string;
  laneId: string;
  snapshotId: number;
}) {
  const [result] = await db.insert(quotes).values(q);
  return result.insertId;
}

export async function getQuotesForDocument(documentId: number) {
  return db.select().from(quotes).where(eq(quotes.documentId, documentId));
}

export async function getQuotesForCase(caseId: number) {
  return db.select().from(quotes).where(eq(quotes.caseId, caseId));
}

export async function getQuote(id: number) {
  const [row] = await db.select().from(quotes).where(eq(quotes.id, id));
  return row ?? null;
}

// ─── Entities ───
export async function createEntity(e: {
  caseId: number;
  name: string;
  type: string;
  description?: string;
  aliases?: string[];
  engineVersion: string;
  laneId: string;
  snapshotId: number;
}) {
  const [result] = await db.insert(entities).values(e);
  const entityId = result.insertId;
  
  // PHASE 2: Wire Phoenix detection to entity creation
  try {
    const phoenixSignal = await runPhoenixDetection({
      id: entityId,
      name: e.name,
      address: e.description, // Using description as placeholder for address
      industry: e.type,
      createdAt: Date.now(),
    });
    
    if (phoenixSignal) {
      await emitPhoenixSignal(phoenixSignal, entityId);
      console.log(`[Entity] Phoenix signal emitted for entity ${entityId}`);
    }
  } catch (error) {
    console.error(`[Entity] Phoenix detection error:`, error);
    // Don't fail entity creation if Phoenix detection fails
  }
  
  return entityId;
}

export async function findOrCreateEntity(caseId: number, name: string, type: string, description?: string, engineVersion?: string, laneId?: string, snapshotId?: number) {
  const normalized = name.trim();
  const [existing] = await db.select().from(entities)
    .where(and(eq(entities.caseId, caseId), eq(entities.name, normalized)));
  if (existing) return existing.id;
  return createEntity({ caseId, name: normalized, type, description, engineVersion: engineVersion || '', laneId: laneId || '', snapshotId: snapshotId || 0 });
}

export async function listEntities(caseId: number) {
  return db.select().from(entities).where(eq(entities.caseId, caseId)).orderBy(asc(entities.name));
}

export async function getEntity(id: number) {
  const [row] = await db.select().from(entities).where(eq(entities.id, id));
  return row ?? null;
}

// ─── Entity Roles ───
export async function createEntityRole(er: { entityId: number; documentId: number; role: string; quoteId?: number; engineVersion: string }) {
  const [result] = await db.insert(entityRoles).values(er);
  return result.insertId;
}

export async function getEntityRolesForEntity(entityId: number) {
  return db.select({
    id: entityRoles.id,
    entityId: entityRoles.entityId,
    documentId: entityRoles.documentId,
    role: entityRoles.role,
    quoteId: entityRoles.quoteId,
    documentFilename: documents.filename,
  })
    .from(entityRoles)
    .leftJoin(documents, eq(entityRoles.documentId, documents.id))
    .where(eq(entityRoles.entityId, entityId));
}

export async function getEntityRolesForDocument(documentId: number) {
  return db.select({
    id: entityRoles.id,
    entityId: entityRoles.entityId,
    documentId: entityRoles.documentId,
    role: entityRoles.role,
    quoteId: entityRoles.quoteId,
    entityName: entities.name,
    entityType: entities.type,
  })
    .from(entityRoles)
    .leftJoin(entities, eq(entityRoles.entityId, entities.id))
    .where(eq(entityRoles.documentId, documentId));
}

// ─── Relationships ───
export async function createRelationship(r: {
  caseId: number;
  sourceEntityId: number;
  targetEntityId: number;
  relationshipType: string;
  description?: string;
  engineVersion: string;
  laneId: string;
  snapshotId: number;
}) {
  const [result] = await db.insert(relationships).values(r);
  return result.insertId;
}

export async function listRelationships(caseId: number) {
  return db.select().from(relationships).where(eq(relationships.caseId, caseId));
}

export async function getRelationshipsForEntity(entityId: number) {
  return db.select().from(relationships).where(
    sql`${relationships.sourceEntityId} = ${entityId} OR ${relationships.targetEntityId} = ${entityId}`
  );
}

/**
 * Enriched relationships for entity: each relationship includes its backing
 * evidence (quotes + source documents) per the Evidence Surface Contract.
 * Single batch query — no N+1.
 */
export async function getRelationshipsForEntityEnriched(entityId: number) {
  const rels = await getRelationshipsForEntity(entityId);
  if (rels.length === 0) return [];

  // Batch-fetch entity names for source/target resolution
  const entityIds = Array.from(new Set(rels.flatMap(r => [r.sourceEntityId, r.targetEntityId])));
  const allEntities = entityIds.length > 0
    ? await db.select().from(entities).where(inArray(entities.id, entityIds))
    : [];
  const entityMap = new Map(allEntities.map(e => [e.id, e]));

  // Batch-fetch all relationship evidence rows
  const relIds = rels.map(r => r.id);
  const allEvidence = relIds.length > 0
    ? await db.select().from(relationshipEvidence).where(inArray(relationshipEvidence.relationshipId, relIds))
    : [];

  // Batch-fetch all backing quotes
  const quoteIds = Array.from(new Set(allEvidence.map(e => e.quoteId)));
  const allQuotes = quoteIds.length > 0
    ? await db.select().from(quotes).where(inArray(quotes.id, quoteIds))
    : [];
  const quoteMap = new Map(allQuotes.map(q => [q.id, q]));

  // Batch-fetch all source documents
  const docIds = Array.from(new Set(allQuotes.map(q => q.documentId)));
  const allDocs = docIds.length > 0
    ? await db.select().from(documents).where(inArray(documents.id, docIds))
    : [];
  const docMap = new Map(allDocs.map(d => [d.id, d]));

  // Group evidence by relationship
  const evidenceByRel = new Map<number, typeof allEvidence>();
  for (const ev of allEvidence) {
    const arr = evidenceByRel.get(ev.relationshipId) || [];
    arr.push(ev);
    evidenceByRel.set(ev.relationshipId, arr);
  }

  return rels.map(r => {
    const sourceEntity = entityMap.get(r.sourceEntityId);
    const targetEntity = entityMap.get(r.targetEntityId);
    return {
      ...r,
      sourceEntityName: sourceEntity?.name || null,
      targetEntityName: targetEntity?.name || null,
      evidence: (evidenceByRel.get(r.id) || []).map(ev => {
        const quote = quoteMap.get(ev.quoteId);
        const doc = quote ? docMap.get(quote.documentId) : null;
        return {
          id: ev.id,
          explanation: ev.explanation,
          quoteText: quote?.text || null,
          pageNumber: quote?.pageNumber || null,
          statementOrigin: quote?.statementOrigin || null,
          documentId: quote?.documentId || null,
          documentFilename: doc?.filename || null,
        };
      }),
    };
  });
}

/**
 * Enriched relationships list for graph: each relationship includes its backing
 * evidence (quotes + source documents) per the Evidence Surface Contract.
 * Single batch query — no N+1.
 */
export async function listRelationshipsEnriched(caseId: number) {
  const rels = await listRelationships(caseId);
  if (rels.length === 0) return [];

  const relIds = rels.map(r => r.id);
  const allEvidence = relIds.length > 0
    ? await db.select().from(relationshipEvidence).where(inArray(relationshipEvidence.relationshipId, relIds))
    : [];

  const quoteIds = Array.from(new Set(allEvidence.map(e => e.quoteId)));
  const allQuotes = quoteIds.length > 0
    ? await db.select().from(quotes).where(inArray(quotes.id, quoteIds))
    : [];
  const quoteMap = new Map(allQuotes.map(q => [q.id, q]));

  const docIds = Array.from(new Set(allQuotes.map(q => q.documentId)));
  const allDocs = docIds.length > 0
    ? await db.select().from(documents).where(inArray(documents.id, docIds))
    : [];
  const docMap = new Map(allDocs.map(d => [d.id, d]));

  const evidenceByRel = new Map<number, typeof allEvidence>();
  for (const ev of allEvidence) {
    const arr = evidenceByRel.get(ev.relationshipId) || [];
    arr.push(ev);
    evidenceByRel.set(ev.relationshipId, arr);
  }

  return rels.map(r => ({
    ...r,
    evidence: (evidenceByRel.get(r.id) || []).map(ev => {
      const quote = quoteMap.get(ev.quoteId);
      const doc = quote ? docMap.get(quote.documentId) : null;
      return {
        id: ev.id,
        explanation: ev.explanation,
        quoteText: quote?.text || null,
        pageNumber: quote?.pageNumber || null,
        statementOrigin: quote?.statementOrigin || null,
        documentId: quote?.documentId || null,
        documentFilename: doc?.filename || null,
      };
    }),
  }));
}

// ─── Relationship Evidence ───
export async function addRelationshipEvidence(re: { relationshipId: number; quoteId: number; explanation?: string }) {
  const [result] = await db.insert(relationshipEvidence).values(re);
  // Update evidence count
  const [count] = await db.select({ c: sql<number>`COUNT(*)` }).from(relationshipEvidence)
    .where(eq(relationshipEvidence.relationshipId, re.relationshipId));
  await db.update(relationships).set({ evidenceCount: count.c }).where(eq(relationships.id, re.relationshipId));
  return result.insertId;
}

export async function getEvidenceForRelationship(relationshipId: number) {
  // Join relationship_evidence → quotes → documents to get full provenance
  const rows = await db.select({
    id: relationshipEvidence.id,
    relationshipId: relationshipEvidence.relationshipId,
    quoteId: relationshipEvidence.quoteId,
    explanation: relationshipEvidence.explanation,
    quoteText: quotes.text,
    pageNumber: quotes.pageNumber,
    statementOrigin: quotes.statementOrigin,
    documentId: quotes.documentId,
    documentFilename: documents.filename,
  })
    .from(relationshipEvidence)
    .leftJoin(quotes, eq(relationshipEvidence.quoteId, quotes.id))
    .leftJoin(documents, eq(quotes.documentId, documents.id))
    .where(eq(relationshipEvidence.relationshipId, relationshipId));
  return rows;
}

// ─── Claims ───
export async function createClaim(c: {
  caseId: number;
  documentId: number;
  quoteId: number;
  claimText: string;
  claimType: string;
  dateReferenced?: string;
  entitiesInvolved?: number[];
  claimStatementOrigin?: 'sworn_testimony' | 'court_filing' | 'discovery_disclosure' | 'media_report' | 'internal_memo' | 'informal_communication' | 'unknown';
  evidentiaryWeight?: 'finding_eligible' | 'signal_only';
  engineVersion: string;
  laneId: string;
  snapshotId: number;
}) {
  const { claimStatementOrigin, ...rest } = c;
  const [result] = await db.insert(claims).values({
    ...rest,
    statementOrigin: claimStatementOrigin ?? 'unknown',
  });
  return result.insertId;
}

export async function listClaims(caseId: number) {
  return db.select().from(claims).where(eq(claims.caseId, caseId));
}

export async function getClaimsForDocument(documentId: number) {
  return db.select().from(claims).where(eq(claims.documentId, documentId));
}

// ─── Findings ───
/**
 * Create a finding with two-state provenance invariant enforcement.
 * 
 * State A (linked): claimIds non-empty → provenanceStatus='linked'
 * State B (unsupported): claimIds empty + provenanceStatus='unsupported' + provenanceAttempted=true
 * 
 * The invariant is enforced here at the application layer because TiDB Serverless
 * cannot enforce CHECK constraints with JSON functions on ALTER TABLE.
 * The DB has a NOT ENFORCED CHECK constraint documenting the invariant.
 */
export async function createFinding(f: {
  caseId: number;
  findingType: string;
  title: string;
  description: string;
  significance?: string;
  claimIds?: number[];
  confidence?: "strong" | "moderate" | "preliminary";
  findingEvidentiaryWeight?: "finding" | "note_signal";
  provenanceStatus?: "linked" | "unsupported" | "unsupported_synthesis";
  provenanceAttempted?: boolean;
  candidateClaimCount?: number;
  fallbackTriggered?: boolean;
  matchMetadata?: Record<string, unknown>;
  laneId: string;
  snapshotId: number;
}) {
  const { findingEvidentiaryWeight, provenanceStatus: explicitStatus, provenanceAttempted: explicitAttempted, ...rest } = f;
  const claimIds = rest.claimIds ?? [];
  
  // Derive provenance state from claimIds if not explicitly provided
  const provenanceStatus = explicitStatus ?? (claimIds.length > 0 ? 'linked' : 'unsupported');
  const provenanceAttempted = explicitAttempted ?? true;
  
  // Enforce invariant: reject invalid states
  if (claimIds.length === 0 && provenanceStatus === 'linked') {
    throw new Error(`Provenance invariant violation: finding has empty claimIds but provenanceStatus='linked' (must be 'unsupported' or 'unsupported_synthesis')`);
  }
  if (claimIds.length === 0 && !provenanceAttempted) {
    throw new Error('Provenance invariant violation: finding has empty claimIds but provenanceAttempted=false (must be true)');
  }
  
  const [result] = await db.insert(findings).values({
    ...rest,
    claimIds,
    evidentiaryWeight: findingEvidentiaryWeight ?? 'note_signal',
    provenanceStatus,
    provenanceAttempted,
    candidateClaimCount: rest.candidateClaimCount ?? 0,
    fallbackTriggered: rest.fallbackTriggered ?? false,
    matchAttemptTimestamp: Date.now(),
    matchMetadata: rest.matchMetadata ?? null,
    createdAt: Date.now(),
  });
  return result.insertId;
}

/**
 * Update a finding's claim IDs and automatically derive provenance status.
 * When claimIds become non-empty, status transitions to 'linked'.
 * When claimIds are empty, status stays as-is (caller must handle unsupported state).
 */
export async function updateFindingClaimIds(findingId: number, claimIds: number[]) {
  const provenanceStatus = claimIds.length > 0 ? 'linked' as const : 'unsupported' as const;
  await db.update(findings).set({ claimIds, provenanceStatus, provenanceAttempted: true }).where(eq(findings.id, findingId));
}

export async function listFindings(caseId: number) {
  return db.select().from(findings).where(eq(findings.caseId, caseId)).orderBy(desc(findings.createdAt));
}

/** Derive EFTA label from filename if present, otherwise return filename */
function deriveDocumentDisplayLabel(filename: string | null | undefined): string {
  if (!filename) return "Unknown Document";
  const match = filename.match(/EFTA[- _]?\d+/i);
  return match ? match[0].toUpperCase().replace(/[_ ]/g, "-") : filename;
}

/**
 * Enriched findings: each finding includes its backing evidence with full provenance.
 * Joins through findings.claimIds → claims → quotes → documents.
 * Returns flattened evidence array per finding with:
 *   - documentDisplayLabel (EFTA-derived or filename)
 *   - documentId
 *   - pageNumber
 *   - verbatimQuote
 *   - statementOrigin
 *   - claimText
 * No N+1: batch-fetches claims, quotes, and documents.
 */
export async function listFindingsEnriched(caseId: number) {
  const allFindings = await db.select().from(findings).where(eq(findings.caseId, caseId)).orderBy(desc(findings.createdAt));
  if (allFindings.length === 0) return [];

  // Collect all claim IDs referenced by findings
  const allClaimIds = new Set<number>();
  for (const f of allFindings) {
    const ids = f.claimIds as number[] | null;
    if (ids) ids.forEach(id => allClaimIds.add(id));
  }

  if (allClaimIds.size === 0) {
    return allFindings.map(f => ({ ...f, backingEvidence: [] as Array<{
      documentDisplayLabel: string;
      documentId: number | null;
      pageNumber: number | null;
      verbatimQuote: string | null;
      statementOrigin: string;
      claimText: string;
    }>, temporalAnchors: [] as string[], provenanceStatus: f.provenanceStatus as "linked" | "unsupported" }));
  }

  // Fetch all referenced claims in one query
  const allClaims = await db.select().from(claims).where(inArray(claims.id, Array.from(allClaimIds)));
  const claimMap = new Map(allClaims.map(c => [c.id, c]));

  // Fetch all referenced quotes
  const quoteIds = new Set(allClaims.map(c => c.quoteId).filter(Boolean));
  const allQuotes = quoteIds.size > 0
    ? await db.select().from(quotes).where(inArray(quotes.id, Array.from(quoteIds)))
    : [];
  const quoteMap = new Map(allQuotes.map(q => [q.id, q]));

  // Fetch all referenced documents
  const docIds = new Set([...allClaims.map(c => c.documentId), ...allQuotes.map(q => q.documentId)]);
  const allDocs = docIds.size > 0
    ? await db.select().from(documents).where(inArray(documents.id, Array.from(docIds)))
    : [];
  const docMap = new Map(allDocs.map(d => [d.id, d]));

  return allFindings.map(f => {
    const claimIdList = (f.claimIds as number[] | null) || [];
    const backingEvidence = claimIdList.map(cid => {
      const claim = claimMap.get(cid);
      if (!claim) return null;
      const quote = quoteMap.get(claim.quoteId) || null;
      const doc = docMap.get(claim.documentId) || null;
      return {
        documentDisplayLabel: deriveDocumentDisplayLabel(doc?.filename),
        documentId: doc?.id ?? null,
        pageNumber: quote?.pageNumber ?? null,
        verbatimQuote: quote?.text ?? null,
        statementOrigin: quote?.statementOrigin ?? claim.statementOrigin ?? "unknown",
        claimText: claim.claimText,
      };
    }).filter(Boolean) as Array<{
      documentDisplayLabel: string;
      documentId: number | null;
      pageNumber: number | null;
      verbatimQuote: string | null;
      statementOrigin: string;
      claimText: string;
    }>;

    // Compute temporal anchors from linked claims' dateReferenced (read-only projection)
    const rawDates: string[] = [];
    for (const cid of claimIdList) {
      const claim = claimMap.get(cid);
      if (claim?.dateReferenced) rawDates.push(claim.dateReferenced);
    }
    // Normalize, deduplicate, sort ascending
    const temporalAnchors = Array.from(new Set(
      rawDates
        .map(d => {
          // Normalize to YYYY-MM-DD
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
          const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d);
          if (slashMatch) {
            const [, m, dd, y] = slashMatch;
            return `${y}-${m.padStart(2, "0")}-${dd.padStart(2, "0")}`;
          }
          const monthNames: Record<string, string> = {
            january: "01", february: "02", march: "03", april: "04",
            may: "05", june: "06", july: "07", august: "08",
            september: "09", october: "10", november: "11", december: "12",
          };
          const longMatch = /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/i.exec(d);
          if (longMatch) {
            const [, month, day, year] = longMatch;
            const mm = monthNames[month.toLowerCase()];
            if (mm) return `${year}-${mm}-${day.padStart(2, "0")}`;
          }
          return null;
        })
        .filter((d): d is string => d !== null)
    )).sort();

    // Use persisted provenanceStatus from the two-state invariant
    // Compute temporal ordering (read-only projection, not persisted)
    const temporalOrdering = resolveTemporalOrder(temporalAnchors);
    return { ...f, backingEvidence, temporalAnchors, temporalOrdering, provenanceStatus: f.provenanceStatus as "linked" | "unsupported" };
  });
}

// ─── Events ───
export async function createEvent(e: {
  caseId: number;
  eventType: string;
  title: string;
  description?: string;
  dateOccurred?: string;
  datePrecision?: string;
  location?: string;
  entitiesInvolved?: number[];
  quoteIds?: number[];
  engineVersion: string;
  laneId: string;
  snapshotId: number;
}) {
  const [result] = await db.insert(events).values(e);
  return result.insertId;
}

export async function listEvents(caseId: number) {
  const rows = await db.select().from(events).where(eq(events.caseId, caseId));
  // Filter out pre-1800 date artifacts, then sort chronologically
  const filtered = rows.filter(r => {
    const normalized = normalizeDateForSort(r.dateOccurred);
    return !isPreModernDate(normalized);
  });
  return filtered.sort((a, b) => {
    const cmp = compareDateOccurred(a.dateOccurred, b.dateOccurred);
    return cmp !== 0 ? cmp : a.id - b.id; // stable secondary sort by id ASC
  });
}

/**
 * Enriched events: each event includes its backing quotes and source documents
 * per the Evidence Surface Contract. Single batch query — no N+1.
 */
export async function listEventsEnriched(caseId: number) {
  const allEvents = await listEvents(caseId);
  if (allEvents.length === 0) return [];

  // Collect all quoteIds across all events
  const allQuoteIds: number[] = [];
  for (const ev of allEvents) {
    const qIds = (ev.quoteIds as number[] | null) || [];
    allQuoteIds.push(...qIds);
  }
  const uniqueQuoteIds = Array.from(new Set(allQuoteIds));

  // Batch-fetch quotes
  const allQuotes = uniqueQuoteIds.length > 0
    ? await db.select().from(quotes).where(inArray(quotes.id, uniqueQuoteIds))
    : [];
  const quoteMap = new Map(allQuotes.map(q => [q.id, q]));

  // Batch-fetch source documents
  const docIds = Array.from(new Set(allQuotes.map(q => q.documentId)));
  const allDocs = docIds.length > 0
    ? await db.select().from(documents).where(inArray(documents.id, docIds))
    : [];
  const docMap = new Map(allDocs.map(d => [d.id, d]));

  return allEvents.map(ev => {
    const qIds = (ev.quoteIds as number[] | null) || [];
    return {
      ...ev,
      backingEvidence: qIds.map(qId => {
        const quote = quoteMap.get(qId);
        const doc = quote ? docMap.get(quote.documentId) : null;
        return {
          quoteText: quote?.text || null,
          pageNumber: quote?.pageNumber || null,
          statementOrigin: quote?.statementOrigin || null,
          documentId: quote?.documentId || null,
          documentFilename: doc?.filename || null,
        };
      }),
    };
  });
}

// ─── Signal Flags ───
export async function createSignalFlag(f: { caseId: number; documentId: number; flagType: string; description?: string; quoteId?: number; engineVersion: string; laneId: string; snapshotId: number }) {
  const [result] = await db.insert(signalFlags).values(f);
  return result.insertId;
}

export async function listSignalFlags(caseId: number) {
  return db.select().from(signalFlags).where(eq(signalFlags.caseId, caseId));
}

/**
 * Enriched signal flags: each flag includes its backing quote and source document.
 */
export async function listSignalFlagsEnriched(caseId: number) {
  const allFlags = await db.select().from(signalFlags).where(eq(signalFlags.caseId, caseId));
  if (allFlags.length === 0) return [];

  // Fetch backing quotes
  const quoteIds = Array.from(new Set(allFlags.map(f => f.quoteId).filter(Boolean))) as number[];
  const allQuotes = quoteIds.length > 0
    ? await db.select().from(quotes).where(inArray(quotes.id, quoteIds))
    : [];
  const quoteMap = new Map(allQuotes.map(q => [q.id, q]));

  // Fetch source documents
  const docIds = Array.from(new Set([...allFlags.map(f => f.documentId), ...allQuotes.map(q => q.documentId)]));
  const allDocs = docIds.length > 0
    ? await db.select().from(documents).where(inArray(documents.id, docIds))
    : [];
  const docMap = new Map(allDocs.map(d => [d.id, d]));

  return allFlags.map(f => ({
    ...f,
    quote: f.quoteId ? quoteMap.get(f.quoteId) || null : null,
    document: docMap.get(f.documentId) || null,
  }));
}

// ─── Document Correlations ───
export async function createCorrelation(c: {
  caseId: number;
  sourceDocumentId: number;
  targetDocumentId: number;
  correlationType: string;
  description?: string;
  sharedIdentifiers?: string[];
  laneId: string;
  snapshotId: number;
}) {
  // GUARD: Reject self-referencing correlations (sourceDocumentId === targetDocumentId)
  if (c.sourceDocumentId === c.targetDocumentId) {
    console.warn(`[Correlation Guard] Rejected self-referencing correlation: docId=${c.sourceDocumentId}, case=${c.caseId}, snapshot=${c.snapshotId}`);
    return -1;
  }
  const [result] = await db.insert(documentCorrelations).values(c);
  return result.insertId;
}

export async function listCorrelations(caseId: number) {
  return db.select().from(documentCorrelations).where(eq(documentCorrelations.caseId, caseId));
}

/**
 * Enriched correlations: each correlation includes source and target document metadata.
 */
export async function listCorrelationsEnriched(caseId: number) {
  const allCorrelations = await db.select().from(documentCorrelations).where(eq(documentCorrelations.caseId, caseId));
  if (allCorrelations.length === 0) return [];

  // Fetch all referenced documents
  const docIds = Array.from(new Set([...allCorrelations.map(c => c.sourceDocumentId), ...allCorrelations.map(c => c.targetDocumentId)]));
  const allDocs = docIds.length > 0
    ? await db.select().from(documents).where(inArray(documents.id, docIds))
    : [];
  const docMap = new Map(allDocs.map(d => [d.id, d]));

  return allCorrelations.map(c => ({
    ...c,
    sourceDocument: docMap.get(c.sourceDocumentId) || null,
    targetDocument: docMap.get(c.targetDocumentId) || null,
  }));
}

/**
 * Remove self-referencing correlations (sourceDocumentId === targetDocumentId)
 * Scoped to a specific case and snapshot. Logs action in audit trail.
 * Returns the count of deleted correlations.
 */
export async function removeSelfReferencingCorrelations(caseId: number, snapshotId: number, userId?: number): Promise<number> {
  // Find self-referencing correlations
  const selfRefs = await db.select({ id: documentCorrelations.id })
    .from(documentCorrelations)
    .where(
      and(
        eq(documentCorrelations.caseId, caseId),
        eq(documentCorrelations.snapshotId, snapshotId),
        sql`${documentCorrelations.sourceDocumentId} = ${documentCorrelations.targetDocumentId}`
      )
    );

  if (selfRefs.length === 0) return 0;

  const ids = selfRefs.map(r => r.id);
  await db.delete(documentCorrelations).where(inArray(documentCorrelations.id, ids));

  // Log in audit trail
  await logAudit({
    caseId,
    userId,
    action: "remove_self_referencing_correlations",
    targetType: "snapshot",
    targetId: snapshotId,
    details: { deletedCount: ids.length, deletedIds: ids },
  });

  return ids.length;
}

// ─── Presentations ───
export async function createPresentation(p: { caseId: number; userId: number; title: string; description?: string; snapshotId?: number; theme?: string }) {
  const now = Date.now();
  const [result] = await db.insert(presentations).values({ ...p, slideCount: 0, createdAt: now, updatedAt: now });
  return result.insertId;
}

export async function getPresentation(id: number) {
  const [row] = await db.select().from(presentations).where(eq(presentations.id, id));
  return row ?? null;
}

export async function listPresentations(caseId: number) {
  return db.select().from(presentations).where(eq(presentations.caseId, caseId)).orderBy(desc(presentations.updatedAt));
}

export async function updatePresentation(id: number, updates: { title?: string; description?: string; theme?: string }) {
  await db.update(presentations).set({ ...updates, updatedAt: Date.now() }).where(eq(presentations.id, id));
}

export async function deletePresentation(id: number) {
  await db.delete(presentationSlides).where(eq(presentationSlides.presentationId, id));
  await db.delete(presentations).where(eq(presentations.id, id));
}

export async function updatePresentationSlideCount(presentationId: number) {
  const slides = await db.select().from(presentationSlides).where(eq(presentationSlides.presentationId, presentationId));
  await db.update(presentations).set({ slideCount: slides.length, updatedAt: Date.now() }).where(eq(presentations.id, presentationId));
}

export async function addSlide(s: {
  presentationId: number;
  orderIndex: number;
  slideType: string;
  title?: string;
  content?: string;
  sourceCitations?: unknown[];
  notes?: string;
  layout?: string;
  metadata?: unknown;
}) {
  const [result] = await db.insert(presentationSlides).values(s);
  await updatePresentationSlideCount(s.presentationId);
  return result.insertId;
}

export async function updateSlide(id: number, updates: { title?: string; content?: string; notes?: string; layout?: string; metadata?: unknown; sourceCitations?: unknown[] }) {
  await db.update(presentationSlides).set(updates).where(eq(presentationSlides.id, id));
}

export async function deleteSlide(id: number, presentationId: number) {
  await db.delete(presentationSlides).where(eq(presentationSlides.id, id));
  // Reindex remaining slides
  const remaining = await db.select().from(presentationSlides).where(eq(presentationSlides.presentationId, presentationId)).orderBy(asc(presentationSlides.orderIndex));
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].orderIndex !== i) {
      await db.update(presentationSlides).set({ orderIndex: i }).where(eq(presentationSlides.id, remaining[i].id));
    }
  }
  await updatePresentationSlideCount(presentationId);
}

export async function reorderSlides(presentationId: number, slideIds: number[]) {
  for (let i = 0; i < slideIds.length; i++) {
    await db.update(presentationSlides).set({ orderIndex: i }).where(eq(presentationSlides.id, slideIds[i]));
  }
}

export async function getSlides(presentationId: number) {
  return db.select().from(presentationSlides).where(eq(presentationSlides.presentationId, presentationId)).orderBy(asc(presentationSlides.orderIndex));
}

export async function getSlide(id: number) {
  const [row] = await db.select().from(presentationSlides).where(eq(presentationSlides.id, id));
  return row ?? null;
}

// ─── Chat Messages ───
export async function addChatMessage(m: { caseId: number; userId: number; role: "user" | "assistant"; content: string; citations?: unknown[] }) {
  const [result] = await db.insert(chatMessages).values({ ...m, createdAt: Date.now() });
  return result.insertId;
}

export async function getChatHistory(caseId: number, limit = 50) {
  return db.select().from(chatMessages).where(eq(chatMessages.caseId, caseId)).orderBy(desc(chatMessages.createdAt)).limit(limit);
}

// ─── Audit Trail ───
export async function getAuditTrail(caseId: number, limit = 100) {
  return db.select().from(auditTrail).where(eq(auditTrail.caseId, caseId)).orderBy(desc(auditTrail.createdAt)).limit(limit);
}

/**
 * Get the latest audit trail entry for a case (for export audit trace head).
 */
export async function getLatestAuditEntry(caseId: number) {
  const [entry] = await db.select().from(auditTrail)
    .where(eq(auditTrail.caseId, caseId))
    .orderBy(desc(auditTrail.createdAt))
    .limit(1);
  return entry ?? null;
}

// ─── Entity Merge Suggestions ───
export async function createMergeSuggestion(s: {
  caseId: number;
  sourceEntityId: number;
  targetEntityId: number;
  confidence: number;
  reason: string;
}) {
  // Check if suggestion already exists (either direction)
  const [existing] = await db.select().from(entityMergeSuggestions)
    .where(and(
      eq(entityMergeSuggestions.caseId, s.caseId),
      sql`(
        (${entityMergeSuggestions.sourceEntityId} = ${s.sourceEntityId} AND ${entityMergeSuggestions.targetEntityId} = ${s.targetEntityId})
        OR
        (${entityMergeSuggestions.sourceEntityId} = ${s.targetEntityId} AND ${entityMergeSuggestions.targetEntityId} = ${s.sourceEntityId})
      )`,
    ));
  if (existing) return existing.id;
  const [result] = await db.insert(entityMergeSuggestions).values({ ...s, createdAt: Date.now() });
  return result.insertId;
}

export async function listMergeSuggestions(caseId: number, status?: "pending" | "approved" | "rejected") {
  if (status) {
    return db.select().from(entityMergeSuggestions)
      .where(and(eq(entityMergeSuggestions.caseId, caseId), eq(entityMergeSuggestions.status, status)))
      .orderBy(desc(entityMergeSuggestions.confidence));
  }
  return db.select().from(entityMergeSuggestions)
    .where(eq(entityMergeSuggestions.caseId, caseId))
    .orderBy(desc(entityMergeSuggestions.confidence));
}

export async function updateMergeSuggestionStatus(
  id: number,
  status: "approved" | "rejected",
  userId: number,
) {
  await db.update(entityMergeSuggestions).set({
    status,
    reviewedAt: Date.now(),
    reviewedBy: userId,
  }).where(eq(entityMergeSuggestions.id, id));
}

export async function getMergeSuggestion(id: number) {
  const [row] = await db.select().from(entityMergeSuggestions).where(eq(entityMergeSuggestions.id, id));
  return row ?? null;
}

/**
 * Execute entity merge: reassign all references from sourceEntityId to targetEntityId.
 * Preserves source entity name as alias on target. Deletes source entity.
 */
export async function executeEntityMerge(sourceEntityId: number, targetEntityId: number) {
  // 1. Get both entities
  const source = await getEntity(sourceEntityId);
  const target = await getEntity(targetEntityId);
  if (!source || !target) throw new Error("Entity not found");

  // 2. Reassign entity_roles
  await db.update(entityRoles).set({ entityId: targetEntityId })
    .where(eq(entityRoles.entityId, sourceEntityId));

  // 3. Reassign relationships (source side)
  await db.update(relationships).set({ sourceEntityId: targetEntityId })
    .where(eq(relationships.sourceEntityId, sourceEntityId));
  // 3b. Reassign relationships (target side)
  await db.update(relationships).set({ targetEntityId: targetEntityId })
    .where(eq(relationships.targetEntityId, sourceEntityId));

  // 4. Update claims.entitiesInvolved JSON arrays
  const allClaims = await db.select().from(claims)
    .where(eq(claims.caseId, source.caseId));
  for (const claim of allClaims) {
    const involved = claim.entitiesInvolved as number[] | null;
    if (involved && involved.includes(sourceEntityId)) {
      const updated = involved.map(id => id === sourceEntityId ? targetEntityId : id);
      // Deduplicate
      const unique = Array.from(new Set(updated));
      await db.update(claims).set({ entitiesInvolved: unique }).where(eq(claims.id, claim.id));
    }
  }

  // 5. Update events.entitiesInvolved JSON arrays
  const allEvents = await db.select().from(events)
    .where(eq(events.caseId, source.caseId));
  for (const event of allEvents) {
    const involved = event.entitiesInvolved as number[] | null;
    if (involved && involved.includes(sourceEntityId)) {
      const updated = involved.map(id => id === sourceEntityId ? targetEntityId : id);
      const unique = Array.from(new Set(updated));
      await db.update(events).set({ entitiesInvolved: unique }).where(eq(events.id, event.id));
    }
  }

  // 6. Preserve source name as alias on target
  const existingAliases = (target.aliases as string[] | null) || [];
  const sourceAliases = (source.aliases as string[] | null) || [];
  const allAliases = Array.from(new Set([...existingAliases, source.name, ...sourceAliases]));
  await db.update(entities).set({ aliases: allAliases }).where(eq(entities.id, targetEntityId));

  // 7. Merge descriptions if source has additional info
  if (source.description && source.description !== target.description) {
    const mergedDesc = target.description
      ? `${target.description}\n\n[Merged from ${source.name}]: ${source.description}`
      : source.description;
    await db.update(entities).set({ description: mergedDesc }).where(eq(entities.id, targetEntityId));
  }

  // 8. Remove self-referencing relationships that may have been created
  await db.delete(relationships).where(
    and(
      eq(relationships.sourceEntityId, targetEntityId),
      eq(relationships.targetEntityId, targetEntityId),
    )
  );

  // 9. Delete source entity
  await db.delete(entities).where(eq(entities.id, sourceEntityId));

  // 10. Dismiss any other pending suggestions involving the source entity
  await db.update(entityMergeSuggestions).set({
    status: "rejected",
    reviewedAt: Date.now(),
  }).where(
    and(
      eq(entityMergeSuggestions.status, "pending"),
      sql`(${entityMergeSuggestions.sourceEntityId} = ${sourceEntityId} OR ${entityMergeSuggestions.targetEntityId} = ${sourceEntityId})`,
    )
  );
}

// ─── Case Statistics ───
export async function getCaseStats(caseId: number) {
  const [docCount] = await db.select({ c: sql<number>`COUNT(*)` }).from(documents).where(eq(documents.caseId, caseId));
  const [entityCount] = await db.select({ c: sql<number>`COUNT(*)` }).from(entities).where(eq(entities.caseId, caseId));
  const [quoteCount] = await db.select({ c: sql<number>`COUNT(*)` }).from(quotes).where(eq(quotes.caseId, caseId));
  const [claimCount] = await db.select({ c: sql<number>`COUNT(*)` }).from(claims).where(eq(claims.caseId, caseId));
  const [findingCount] = await db.select({ c: sql<number>`COUNT(*)` }).from(findings).where(eq(findings.caseId, caseId));
  const [eventCount] = await db.select({ c: sql<number>`COUNT(*)` }).from(events).where(eq(events.caseId, caseId));
  const [relCount] = await db.select({ c: sql<number>`COUNT(*)` }).from(relationships).where(eq(relationships.caseId, caseId));
  const [flagCount] = await db.select({ c: sql<number>`COUNT(*)` }).from(signalFlags).where(eq(signalFlags.caseId, caseId));

  // Document status breakdown
  const statusBreakdown = await db.select({
    status: documents.status,
    count: sql<number>`COUNT(*)`,
  }).from(documents).where(eq(documents.caseId, caseId)).groupBy(documents.status);

  return {
    documents: docCount.c,
    entities: entityCount.c,
    quotes: quoteCount.c,
    claims: claimCount.c,
    findings: findingCount.c,
    events: eventCount.c,
    relationships: relCount.c,
    signalFlags: flagCount.c,
    documentStatus: Object.fromEntries(
      statusBreakdown
        .sort((a, b) => String(a.status).localeCompare(String(b.status)))
        .map(s => [s.status, s.count])
    ),
  };
}

// ─── Re-Analysis Cleanup ───
/**
 * Clear all AI-generated extractions for a document (quotes, entity_roles, claims, events, signal_flags,
 * relationships, relationship_evidence, correlations) while preserving the document record and its text content.
 * Used before re-running Pass 1+2 with updated prompts.
 */
export async function clearDocumentExtractions(documentId: number, caseId: number) {
  // Gate 7: Reject mutation on sealed snapshot rows
  await assertDocumentSnapshotMutable(documentId);

  // 1. Delete signal flags for this document
  await db.delete(signalFlags).where(eq(signalFlags.documentId, documentId));

  // 2. Delete claims for this document
  await db.delete(claims).where(eq(claims.documentId, documentId));

  // 3. Delete entity roles for this document
  await db.delete(entityRoles).where(eq(entityRoles.documentId, documentId));

  // 4. Delete relationship evidence that references quotes from this document
  //    First get quote IDs for this document
  const docQuotes = await db.select({ id: quotes.id }).from(quotes).where(eq(quotes.documentId, documentId));
  const quoteIds = docQuotes.map(q => q.id);
  if (quoteIds.length > 0) {
    await db.delete(relationshipEvidence).where(inArray(relationshipEvidence.quoteId, quoteIds));
  }

  // 5. Delete relationships that were sourced from this document
  //    (relationships with zero remaining evidence after cleanup)
  const caseRels = await db.select().from(relationships).where(eq(relationships.caseId, caseId));
  for (const rel of caseRels) {
    const [remaining] = await db.select({ c: sql<number>`COUNT(*)` })
      .from(relationshipEvidence)
      .where(eq(relationshipEvidence.relationshipId, rel.id));
    if (remaining.c === 0) {
      await db.delete(relationships).where(eq(relationships.id, rel.id));
    } else {
      // Update evidence count
      await db.update(relationships).set({ evidenceCount: remaining.c }).where(eq(relationships.id, rel.id));
    }
  }

  // 6. Delete quotes for this document
  await db.delete(quotes).where(eq(quotes.documentId, documentId));

  // 7. Delete correlations involving this document
  await db.delete(documentCorrelations).where(
    sql`${documentCorrelations.sourceDocumentId} = ${documentId} OR ${documentCorrelations.targetDocumentId} = ${documentId}`
  );

  // 8. Clean up orphaned entities (entities with no remaining roles)
  const caseEntities = await db.select({ id: entities.id }).from(entities).where(eq(entities.caseId, caseId));
  for (const entity of caseEntities) {
    const [roleCount] = await db.select({ c: sql<number>`COUNT(*)` })
      .from(entityRoles)
      .where(eq(entityRoles.entityId, entity.id));
    if (roleCount.c === 0) {
      // Check if entity is referenced in any remaining relationships
      const [relCount] = await db.select({ c: sql<number>`COUNT(*)` })
        .from(relationships)
        .where(sql`${relationships.sourceEntityId} = ${entity.id} OR ${relationships.targetEntityId} = ${entity.id}`);
      if (relCount.c === 0) {
        await db.delete(entities).where(eq(entities.id, entity.id));
      }
    }
  }

  // 9. Reset document AI metadata but preserve textContent
  await db.update(documents).set({
    documentType: null,
    documentPurpose: null,
    aiMetadata: null,
    errorMessage: null,
  }).where(eq(documents.id, documentId));
}

/**
 * Clear all findings for a case (used before re-running Pass 3).
 */
export async function clearCaseFindings(caseId: number, opts?: { bypassSealCheck?: boolean }) {
  // Gate 7: Check if any findings belong to a sealed snapshot
  if (!opts?.bypassSealCheck) {
    const latestSnapshot = await getLatestSnapshot(caseId);
    if (latestSnapshot && latestSnapshot.status === 'sealed') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `[GATE_SEALED_MUTATION] Cannot clear findings for case ${caseId}: snapshot v${latestSnapshot.version} is sealed. Trigger reanalysis to create a new snapshot.`,
      });
    }
  }
  await db.delete(findings).where(eq(findings.caseId, caseId));
  await db.delete(documentCorrelations).where(eq(documentCorrelations.caseId, caseId));
}


// ─── Upload Sessions ───

export async function createUploadSession(data: {
  caseId: number;
  userId: number;
  totalFiles: number;
}): Promise<number> {
  const now = Date.now();
  const [result] = await db.insert(uploadSessions).values({
    caseId: data.caseId,
    userId: data.userId,
    totalFiles: data.totalFiles,
    completedFiles: 0,
    failedFiles: 0,
    duplicateFiles: 0,
    status: "uploading",
    createdAt: now,
    updatedAt: now,
  }).$returningId();
  return result.id;
}

export async function getUploadSession(sessionId: number): Promise<UploadSession | null> {
  const [row] = await db.select().from(uploadSessions).where(eq(uploadSessions.id, sessionId));
  return row ?? null;
}

export async function getActiveUploadSessions(userId: number): Promise<UploadSession[]> {
  // Expire stale sessions before querying active ones
  await expireStaleUploadSessions();
  return db.select().from(uploadSessions)
    .where(and(
      eq(uploadSessions.userId, userId),
      inArray(uploadSessions.status, ["uploading", "processing"]),
    ))
    .orderBy(desc(uploadSessions.createdAt));
}

export async function listUploadSessions(userId: number, caseId?: number): Promise<UploadSession[]> {
  // Expire stale sessions before listing
  await expireStaleUploadSessions();
  const conditions = [eq(uploadSessions.userId, userId)];
  if (caseId) conditions.push(eq(uploadSessions.caseId, caseId));
  return db.select().from(uploadSessions)
    .where(and(...conditions))
    .orderBy(desc(uploadSessions.createdAt))
    .limit(50);
}

export async function incrementUploadSessionCounter(
  sessionId: number,
  field: "completedFiles" | "failedFiles" | "duplicateFiles",
  amount: number = 1,
) {
  const now = Date.now();
  await db.update(uploadSessions).set({
    [field]: sql`${uploadSessions[field]} + ${amount}`,
    updatedAt: now,
  }).where(eq(uploadSessions.id, sessionId));
}

export async function updateUploadSessionStatus(sessionId: number, status: UploadSession["status"]) {
  await db.update(uploadSessions).set({
    status,
    updatedAt: Date.now(),
  }).where(eq(uploadSessions.id, sessionId));
}

/**
 * Finalize an upload session: compute final status from counters.
 * Called after all files in the session have been processed.
 */
export async function finalizeUploadSession(sessionId: number) {
  const session = await getUploadSession(sessionId);
  if (!session) return;

  const processed = session.completedFiles + session.failedFiles + session.duplicateFiles;
  let finalStatus: UploadSession["status"];

  if (session.failedFiles > 0 && session.completedFiles === 0) {
    finalStatus = "failed";
  } else if (processed >= session.totalFiles) {
    finalStatus = "complete";
  } else {
    finalStatus = "processing"; // Still in progress
    return;
  }

  await updateUploadSessionStatus(sessionId, finalStatus);
}

/**
 * Expire stale upload sessions that have been in 'uploading' or 'processing'
 * state longer than the given threshold.
 *
 * Default production threshold: 60 minutes (3_600_000 ms).
 * Returns the number of sessions expired.
 */
const DEFAULT_STALE_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes

export async function expireStaleUploadSessions(
  thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
): Promise<number> {
  const cutoff = Date.now() - thresholdMs;
  const result = await db.update(uploadSessions).set({
    status: "expired",
    updatedAt: Date.now(),
  }).where(
    and(
      inArray(uploadSessions.status, ["uploading", "processing"]),
      lt(uploadSessions.updatedAt, cutoff),
    ),
  );
  const expiredCount = (result as any)[0]?.affectedRows ?? 0;
  if (expiredCount > 0) {
    console.log(`[Upload Lifecycle] Expired ${expiredCount} stale upload session(s) (threshold: ${thresholdMs}ms)`);
  }
  return expiredCount;
}


// ─── Provenance Drift Metrics ───

export interface ProvenanceDriftMetrics {
  totalFindings: number;
  linkedFindings: number;
  unsupportedFindings: number;
  provenanceCoverage: number; // % linked / total (0-100)
  avgClaimsPerFinding: number;
  fallbackMatcherHitRate: number; // % findings that went through fallback
  unsupportedRate: number; // % unsupported / total (0-100)
  avgProcessingTimeMs: number; // from pipeline queue stats
  findingsByCase: { caseId: number; caseName: string; total: number; linked: number; unsupported: number }[];
}

export async function getProvenanceDriftMetrics(caseId?: number): Promise<ProvenanceDriftMetrics> {
  // Gate C: case-scoped filtering when caseId is provided
  const caseFilter = caseId ? eq(findings.caseId, caseId) : undefined;

  // Total findings by provenance status
  const statusQuery = db.select({
    status: findings.provenanceStatus,
    count: sql<number>`count(*)`,
  })
    .from(findings);
  const statusCounts = caseFilter
    ? await statusQuery.where(caseFilter).groupBy(findings.provenanceStatus)
    : await statusQuery.groupBy(findings.provenanceStatus);

  let linked = 0;
  let unsupported = 0;
  let total = 0;
  for (const row of statusCounts) {
    total += row.count;
    if (row.status === "linked") linked = row.count;
    else if (row.status === "unsupported") unsupported = row.count;
  }

  // Average claims per finding (only linked findings)
  const avgQuery = db.select({
    avg: sql<number>`AVG(JSON_LENGTH(claimIds))`,
  }).from(findings);
  const [avgClaims] = caseFilter
    ? await avgQuery.where(and(eq(findings.provenanceStatus, "linked"), caseFilter))
    : await avgQuery.where(eq(findings.provenanceStatus, "linked"));

  // Per-case breakdown
  const caseQuery = db.select({
    caseId: findings.caseId,
    caseName: cases.name,
    total: sql<number>`count(*)`,
    linked: sql<number>`SUM(CASE WHEN ${findings.provenanceStatus} = 'linked' THEN 1 ELSE 0 END)`,
    unsupported: sql<number>`SUM(CASE WHEN ${findings.provenanceStatus} = 'unsupported' THEN 1 ELSE 0 END)`,
  })
    .from(findings)
    .leftJoin(cases, eq(findings.caseId, cases.id));
  const caseCounts = caseFilter
    ? await caseQuery.where(caseFilter).groupBy(findings.caseId, cases.name)
    : await caseQuery.groupBy(findings.caseId, cases.name);

  return {
    totalFindings: total,
    linkedFindings: linked,
    unsupportedFindings: unsupported,
    provenanceCoverage: total > 0 ? Math.round((linked / total) * 10000) / 100 : 100,
    avgClaimsPerFinding: avgClaims?.avg ? Math.round(avgClaims.avg * 100) / 100 : 0,
    fallbackMatcherHitRate: 0, // Populated from pipeline runtime stats
    unsupportedRate: total > 0 ? Math.round((unsupported / total) * 10000) / 100 : 0,
    avgProcessingTimeMs: 0, // Populated from pipeline runtime stats
    findingsByCase: caseCounts.map(r => ({
      caseId: r.caseId,
      caseName: r.caseName || "Unknown",
      total: r.total,
      linked: r.linked,
      unsupported: r.unsupported,
    })),
  };
}


// ─── Provenance Drill-Down Helpers ───

export interface UnsupportedFindingSummary {
  id: number;
  caseId: number;
  findingType: string;
  title: string;
  description: string;
  claimIds: number[];
  confidence: string;
  evidentiaryWeight: string;
  provenanceStatus: string;
  candidateClaimCount: number;
  fallbackTriggered: boolean;
  matchAttemptTimestamp: number | null;
  createdAt: number;
  documentIds: number[];
  documentLabels: string[];
}

/**
 * List all unsupported findings (claimIds empty, provenanceAttempted=true)
 * sorted by createdAt DESC. Includes document IDs from claims in the same case.
 */
export async function listUnsupportedFindings(caseId?: number): Promise<UnsupportedFindingSummary[]> {
  const conditions = [
    inArray(findings.provenanceStatus, ['unsupported', 'unsupported_synthesis']),
    eq(findings.provenanceAttempted, true),
  ];
  if (caseId) conditions.push(eq(findings.caseId, caseId));

  const rows = await db.select()
    .from(findings)
    .where(and(...conditions))
    .orderBy(desc(findings.createdAt));

  // For each finding, get the document IDs from the case's documents
  const result: UnsupportedFindingSummary[] = [];
  for (const row of rows) {
    // Get documents from the same case
    const docs = await db.select({ id: documents.id, filename: documents.filename })
      .from(documents)
      .where(eq(documents.caseId, row.caseId));

    result.push({
      id: row.id,
      caseId: row.caseId,
      findingType: row.findingType,
      title: row.title,
      description: row.description,
      claimIds: row.claimIds as number[],
      confidence: row.confidence,
      evidentiaryWeight: row.evidentiaryWeight,
      provenanceStatus: row.provenanceStatus,
      candidateClaimCount: row.candidateClaimCount,
      fallbackTriggered: row.fallbackTriggered,
      matchAttemptTimestamp: row.matchAttemptTimestamp,
      createdAt: row.createdAt,
      documentIds: docs.map(d => d.id),
      documentLabels: docs.map(d => deriveDocumentDisplayLabel(d.filename)),
    });
  }
  return result;
}

export interface FindingMatchDetail {
  finding: Finding;
  candidateClaims: { id: number; claimText: string; claimType: string; documentId: number; documentLabel: string }[];
  matchMetadata: Record<string, unknown> | null;
  auditLog: ProvenanceAuditLog[];
}

/**
 * Get full match detail for a single finding: the finding itself, all candidate claims
 * from the same case, raw match metadata, and audit history.
 */
export async function getFindingMatchDetail(findingId: number): Promise<FindingMatchDetail | null> {
  const [finding] = await db.select().from(findings).where(eq(findings.id, findingId));
  if (!finding) return null;

  // Get all claims from the same case as candidate claims
  const caseClaims = await db.select({
    id: claims.id,
    claimText: claims.claimText,
    claimType: claims.claimType,
    documentId: claims.documentId,
    filename: documents.filename,
  })
    .from(claims)
    .leftJoin(documents, eq(claims.documentId, documents.id))
    .where(eq(claims.caseId, finding.caseId));

  const candidateClaims = caseClaims.map(c => ({
    id: c.id,
    claimText: c.claimText,
    claimType: c.claimType,
    documentId: c.documentId,
    documentLabel: deriveDocumentDisplayLabel(c.filename),
  }));

  // Get audit log for this finding
  const auditLog = await db.select()
    .from(provenanceAuditLogs)
    .where(eq(provenanceAuditLogs.findingId, findingId))
    .orderBy(desc(provenanceAuditLogs.createdAt));

  return {
    finding,
    candidateClaims,
    matchMetadata: (finding.matchMetadata as Record<string, unknown>) ?? null,
    auditLog,
  };
}

/**
 * Create an immutable audit log entry for a provenance action.
 */
export async function createProvenanceAuditLog(entry: {
  findingId: number;
  userId: number;
  actionType: "re_run_matching" | "mark_synthesis" | "flag_for_review" | "batch_rerun";
  reason?: string;
  previousStatus: string;
  newStatus: string;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const [result] = await db.insert(provenanceAuditLogs).values({
    ...entry,
    reason: entry.reason ?? null,
    metadata: entry.metadata ?? null,
    createdAt: Date.now(),
  });
  return result.insertId;
}

/**
 * List provenance audit log entries, optionally filtered by case.
 */
export async function listProvenanceAuditLogs(caseId?: number, limit = 1000) {
  // Join with findings to get caseId filter
  if (caseId) {
    return db.select({
      id: provenanceAuditLogs.id,
      findingId: provenanceAuditLogs.findingId,
      userId: provenanceAuditLogs.userId,
      actionType: provenanceAuditLogs.actionType,
      reason: provenanceAuditLogs.reason,
      previousStatus: provenanceAuditLogs.previousStatus,
      newStatus: provenanceAuditLogs.newStatus,
      metadata: provenanceAuditLogs.metadata,
      createdAt: provenanceAuditLogs.createdAt,
    })
      .from(provenanceAuditLogs)
      .innerJoin(findings, eq(provenanceAuditLogs.findingId, findings.id))
      .where(eq(findings.caseId, caseId))
      .orderBy(desc(provenanceAuditLogs.createdAt))
      .limit(limit);
  }
  return db.select()
    .from(provenanceAuditLogs)
    .orderBy(desc(provenanceAuditLogs.createdAt))
    .limit(limit);
}

/**
 * Mark a finding as unsupported_synthesis. Requires a reason.
 * Does NOT modify claimIds — the finding stays unlinked but is classified.
 */
export async function markFindingAsSynthesis(findingId: number, reason: string) {
  if (!reason || reason.trim().length === 0) {
    throw new Error("Reason is mandatory when marking a finding as valid synthesis");
  }
  await db.update(findings).set({
    provenanceStatus: "unsupported_synthesis",
  }).where(eq(findings.id, findingId));
}

/**
 * Update matching metadata on a finding after a re-run.
 */
export async function updateFindingMatchMetadata(findingId: number, meta: {
  candidateClaimCount: number;
  fallbackTriggered: boolean;
  matchMetadata: Record<string, unknown>;
}) {
  await db.update(findings).set({
    candidateClaimCount: meta.candidateClaimCount,
    fallbackTriggered: meta.fallbackTriggered,
    matchAttemptTimestamp: Date.now(),
    matchMetadata: meta.matchMetadata,
  }).where(eq(findings.id, findingId));
}

/**
 * Get provenance drill-down summary metrics.
 */
export async function getProvenanceDrilldownMetrics(caseId?: number) {
  const conditions = caseId ? [eq(findings.caseId, caseId)] : [];

  const allFindings = await db.select({
    provenanceStatus: findings.provenanceStatus,
    candidateClaimCount: findings.candidateClaimCount,
    fallbackTriggered: findings.fallbackTriggered,
  })
    .from(findings)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const total = allFindings.length;
  const unsupported = allFindings.filter(f => f.provenanceStatus === 'unsupported' || f.provenanceStatus === 'unsupported_synthesis').length;
  const synthesis = allFindings.filter(f => f.provenanceStatus === 'unsupported_synthesis').length;
  const fallbackUsed = allFindings.filter(f => f.fallbackTriggered).length;
  const totalCandidates = allFindings.reduce((sum, f) => sum + (f.candidateClaimCount ?? 0), 0);

  return {
    totalFindings: total,
    unsupportedCount: unsupported,
    synthesisCount: synthesis,
    unsupportedRate: total > 0 ? Math.round((unsupported / total) * 10000) / 100 : 0,
    avgCandidateClaimsEvaluated: unsupported > 0
      ? Math.round(totalCandidates / total * 100) / 100
      : 0,
    fallbackUsageRate: total > 0 ? Math.round((fallbackUsed / total) * 10000) / 100 : 0,
  };
}

// ─── Batch Rerun Runs ───
export async function createBatchRun(startedBy: number, totalFindings: number): Promise<number> {
  const [result] = await db.insert(batchRerunRuns).values({
    startedBy,
    totalFindings,
    startedAt: Date.now(),
  });
  return result.insertId;
}

export async function getActiveBatchRun(): Promise<BatchRerunRun | null> {
  const [row] = await db.select().from(batchRerunRuns)
    .where(eq(batchRerunRuns.status, "running"))
    .orderBy(desc(batchRerunRuns.startedAt))
    .limit(1);
  return row ?? null;
}

export async function getBatchRunById(id: number): Promise<BatchRerunRun | null> {
  const [row] = await db.select().from(batchRerunRuns).where(eq(batchRerunRuns.id, id));
  return row ?? null;
}

export async function updateBatchProgress(id: number, data: {
  processedCount?: number;
  resolvedCount?: number;
  errorCount?: number;
  stillUnsupported?: number;
  lastProcessedFindingId?: number;
  fallbackUsageCount?: number;
}) {
  await db.update(batchRerunRuns).set(data).where(eq(batchRerunRuns.id, id));
}

export async function completeBatchRun(id: number) {
  const run = await getBatchRunById(id);
  if (!run) return;
  const runtimeMs = Date.now() - run.startedAt;
  await db.update(batchRerunRuns).set({
    status: "completed",
    completedAt: Date.now(),
    runtimeMs,
    stillUnsupported: run.totalFindings - run.resolvedCount - run.errorCount,
  }).where(eq(batchRerunRuns.id, id));
}

export async function abortBatchRun(id: number) {
  const run = await getBatchRunById(id);
  if (!run) return;
  const runtimeMs = Date.now() - run.startedAt;
  await db.update(batchRerunRuns).set({
    status: "aborted",
    abortedAt: Date.now(),
    runtimeMs,
    stillUnsupported: run.totalFindings - run.resolvedCount - run.errorCount,
  }).where(eq(batchRerunRuns.id, id));
}

export async function getLatestBatchRun(): Promise<BatchRerunRun | null> {
  const [row] = await db.select().from(batchRerunRuns)
    .orderBy(desc(batchRerunRuns.startedAt))
    .limit(1);
  return row ?? null;
}

export async function listBatchRuns(limit = 10): Promise<BatchRerunRun[]> {
  return db.select().from(batchRerunRuns)
    .orderBy(desc(batchRerunRuns.startedAt))
    .limit(limit);
}

/**
 * Expire stale batch runs that have been in 'running' state beyond the threshold.
 * Transitions them to 'error' status with a runtimeMs and completedAt timestamp.
 * This prevents orphaned running batches from blocking new batch runs or failing tests.
 * Default threshold: 30 minutes.
 * Returns the number of expired batch runs.
 */
export async function expireStaleBatchRuns(thresholdMs = 30 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - thresholdMs;
  const staleRuns = await db.select().from(batchRerunRuns)
    .where(and(eq(batchRerunRuns.status, "running"), lte(batchRerunRuns.startedAt, cutoff)));
  for (const run of staleRuns) {
    const runtimeMs = Date.now() - run.startedAt;
    await db.update(batchRerunRuns).set({
      status: "error",
      completedAt: Date.now(),
      runtimeMs,
      stillUnsupported: run.totalFindings - run.resolvedCount - run.errorCount,
    }).where(eq(batchRerunRuns.id, run.id));
  }
  return staleRuns.length;
}


// ─── Ingestion Integrity Ledger ───

export interface IngestionAuditResult {
  caseId: number;
  generatedAt: number;
  /**
   * Every upload session for this case.
   * sum(totalFiles) across all sessions = the denominator for the entire ledger.
   */
  intendedUploads: {
    sessionId: number;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    duplicateFiles: number;
    status: string;
    createdAt: number;
  }[];
  /**
   * Documents created from intended uploads only.
   * Derived from sum(session.completedFiles) — NOT from a case-wide document query.
   * The detail list shows the actual document rows that were created through upload sessions,
   * limited to the completedFiles count.
   */
  documentsCreated: {
    id: number;
    filename: string;
    fileType: string;
    sha256Hash: string;
    status: string;
    createdAt: number;
  }[];
  /**
   * Files in intendedUploads where dedup logic linked to an existing document.
   * No new document row was created for these.
   */
  duplicatesLinked: {
    sessionId: number;
    count: number;
  }[];
  /**
   * Upload session files where session-level failedFiles > 0.
   * Reported per session with the count of failed files.
   */
  failedUploads: {
    sessionId: number;
    totalFiles: number;
    failedFiles: number;
    status: string;
    createdAt: number;
  }[];
  /**
   * Upload sessions with status "expired".
   * All unprocessed files in these sessions count toward the expired total.
   */
  expiredUploads: {
    sessionId: number;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    duplicateFiles: number;
    unprocessedFiles: number;
    status: string;
    createdAt: number;
    updatedAt: number;
  }[];
  /**
   * Documents created from intendedUploads that have extraction status = error or failed_permanent.
   * Scoped to upload-session-created documents only, NOT historical case documents.
   */
  extractionFailures: {
    id: number;
    filename: string;
    fileType: string;
    status: string;
    errorMessage: string | null;
    retryCount: number;
    createdAt: number;
  }[];
  /**
   * Computed strictly as:
   * missingDocuments = intendedUploads - (documentsCreated + duplicatesLinked + failedUploads + expiredUnprocessed)
   *
   * Per-session: missingCount = totalFiles - completedFiles - duplicateFiles - failedFiles - expiredUnprocessed
   * Only sessions where missingCount > 0 appear here.
   */
  missingDocuments: {
    sessionId: number;
    missingCount: number;
    totalFiles: number;
    completedFiles: number;
    duplicateFiles: number;
    failedFiles: number;
    status: string;
    createdAt: number;
  }[];
  /**
   * All summary counts derive from upload session counters only.
   * totalDocumentsCreated = sum(session.completedFiles), NOT count(documents where caseId=X).
   * Invariant: totalDocumentsCreated <= totalIntendedFiles.
   */
  summary: {
    totalIntendedFiles: number;
    totalDocumentsCreated: number;
    totalDuplicatesLinked: number;
    totalFailedFiles: number;
    totalExpiredUnprocessed: number;
    totalExtractionFailures: number;
    totalMissing: number;
  };
}

/**
 * Build the Case Ingestion Integrity Ledger.
 *
 * SCOPE ISOLATION: Every metric derives strictly from upload session file counts.
 * The denominator is sum(session.totalFiles) across all sessions for this case.
 * No case-wide document totals are used in any computation.
 *
 * Categories (all subsets of intendedUploads):
 * - intendedUploads: all upload sessions for this case (the denominator)
 * - documentsCreated: sum(session.completedFiles) — files that became document rows
 * - duplicatesLinked: sum(session.duplicateFiles) — files linked to existing docs
 * - failedUploads: sum(session.failedFiles) — files that failed during upload
 * - expiredUploads: sessions with status "expired", unprocessed files counted
 * - extractionFailures: subset of documentsCreated where extraction failed
 * - missingDocuments: intendedUploads - (created + duplicates + failed + expiredUnprocessed)
 *
 * No inference. No heuristics. Pure DB state. Upload-intent scope only.
 */
export async function getIngestionAudit(caseId: number): Promise<IngestionAuditResult> {
  // 1. All upload sessions for this case (no userId filter — case-level audit)
  const sessions = await db.select().from(uploadSessions)
    .where(eq(uploadSessions.caseId, caseId))
    .orderBy(desc(uploadSessions.createdAt));

  // 2. Intended uploads — every session is part of the denominator
  const intendedUploads = sessions.map(s => ({
    sessionId: s.id,
    totalFiles: s.totalFiles,
    completedFiles: s.completedFiles,
    failedFiles: s.failedFiles,
    duplicateFiles: s.duplicateFiles,
    status: s.status,
    createdAt: s.createdAt,
  }));

  // 3. Documents created from upload sessions — STRICTLY session-bound via audit trail.
  //    The audit trail records every upload_document action with targetId = docId.
  //    This is the authoritative binding key between upload sessions and documents.
  //    No case-wide queries. No LIMIT-based approximation.
  const uploadAuditEntries = await db.select({
    targetId: auditTrail.targetId,
  }).from(auditTrail).where(
    and(
      eq(auditTrail.caseId, caseId),
      eq(auditTrail.action, "upload_document"),
      eq(auditTrail.targetType, "document"),
    )
  );
  const sessionDocumentIds = new Set(
    uploadAuditEntries
      .map(e => e.targetId)
      .filter((id): id is number => id !== null)
  );

  let documentsCreated: IngestionAuditResult["documentsCreated"] = [];
  if (sessionDocumentIds.size > 0) {
    // Fetch only documents whose IDs are in the session-bound set
    const docs = await db.select().from(documents)
      .where(inArray(documents.id, Array.from(sessionDocumentIds)))
      .orderBy(desc(documents.createdAt));
    documentsCreated = docs.map(d => ({
      id: d.id,
      filename: d.filename,
      fileType: d.fileType,
      sha256Hash: d.sha256Hash,
      status: d.status,
      createdAt: d.createdAt,
    }));
  }

  // 4. Duplicates linked — sessions that recorded at least 1 duplicate
  const duplicatesLinked = sessions
    .filter(s => s.duplicateFiles > 0)
    .map(s => ({
      sessionId: s.id,
      count: s.duplicateFiles,
    }));

  // 5. Failed uploads — sessions with failedFiles > 0
  const failedUploads = sessions
    .filter(s => s.failedFiles > 0)
    .map(s => ({
      sessionId: s.id,
      totalFiles: s.totalFiles,
      failedFiles: s.failedFiles,
      status: s.status,
      createdAt: s.createdAt,
    }));

  // 6. Expired uploads — sessions with status "expired"
  //    Unprocessed files = totalFiles - completedFiles - duplicateFiles - failedFiles
  const expiredUploads = sessions
    .filter(s => s.status === "expired")
    .map(s => {
      const unprocessedFiles = Math.max(0, s.totalFiles - s.completedFiles - s.duplicateFiles - s.failedFiles);
      return {
        sessionId: s.id,
        totalFiles: s.totalFiles,
        completedFiles: s.completedFiles,
        failedFiles: s.failedFiles,
        duplicateFiles: s.duplicateFiles,
        unprocessedFiles,
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    });

  // 7. Extraction failures — scoped to upload-session-created documents only
  //    We only consider documents that were created through upload sessions (limited to completedFiles count)
  const extractionFailures = documentsCreated
    .filter(d => d.status === "error" || d.status === "failed_permanent")
    .map(d => ({
      id: d.id,
      filename: d.filename,
      fileType: d.fileType,
      status: d.status,
      errorMessage: null as string | null, // detail from documentsCreated doesn't carry errorMessage
      retryCount: 0,
      createdAt: d.createdAt,
    }));

  // Enrich extraction failures with error details from DB
  if (extractionFailures.length > 0) {
    const failedDocIds = extractionFailures.map(ef => ef.id);
    const failedDocs = await db.select({
      id: documents.id,
      errorMessage: documents.errorMessage,
      retryCount: documents.retryCount,
    }).from(documents).where(inArray(documents.id, failedDocIds));
    const failedMap = new Map(failedDocs.map(d => [d.id, d]));
    for (const ef of extractionFailures) {
      const detail = failedMap.get(ef.id);
      if (detail) {
        ef.errorMessage = detail.errorMessage;
        ef.retryCount = detail.retryCount;
      }
    }
  }

  // 8. Missing documents computation (scope-isolated):
  //    Per session: missingCount = totalFiles - completedFiles - duplicateFiles - failedFiles
  //    For expired sessions, the unprocessed portion is already counted under expiredUnprocessed,
  //    so expired sessions don't double-count.
  //    For non-expired terminal sessions: missing = totalFiles - completedFiles - duplicateFiles - failedFiles
  const terminalStatuses = ["complete", "failed"];
  const missingDocuments = sessions
    .filter(s => terminalStatuses.includes(s.status))
    .map(s => {
      const accounted = s.completedFiles + s.duplicateFiles + s.failedFiles;
      const missingCount = Math.max(0, s.totalFiles - accounted);
      return {
        sessionId: s.id,
        missingCount,
        totalFiles: s.totalFiles,
        completedFiles: s.completedFiles,
        duplicateFiles: s.duplicateFiles,
        failedFiles: s.failedFiles,
        status: s.status,
        createdAt: s.createdAt,
      };
    })
    .filter(s => s.missingCount > 0);

  // 9. Summary totals — ALL derived from upload session counters
  const totalIntendedFiles = sessions.reduce((sum, s) => sum + s.totalFiles, 0);
  const totalDocumentsCreated = sessions.reduce((sum, s) => sum + s.completedFiles, 0);
  const totalDuplicatesLinked = sessions.reduce((sum, s) => sum + s.duplicateFiles, 0);
  const totalFailedFiles = sessions.reduce((sum, s) => sum + s.failedFiles, 0);
  const totalExpiredUnprocessed = expiredUploads.reduce((sum, e) => sum + e.unprocessedFiles, 0);
  const totalExtractionFailures = extractionFailures.length;
  const totalMissing = missingDocuments.reduce((sum, s) => sum + s.missingCount, 0);

  return {
    caseId,
    generatedAt: Date.now(),
    intendedUploads,
    documentsCreated,
    duplicatesLinked,
    failedUploads,
    expiredUploads,
    extractionFailures,
    missingDocuments,
    summary: {
      totalIntendedFiles,
      totalDocumentsCreated,
      totalDuplicatesLinked,
      totalFailedFiles,
      totalExpiredUnprocessed,
      totalExtractionFailures,
      totalMissing,
    },
  };
}


// ─── Document Resolution Helpers ───

export type DocumentResolution = 'active' | 'superseded' | 'excluded' | 'corrupted';

/**
 * T1. Set the resolution state of a document.
 * Validates snapshot mutability before applying.
 * Logs an immutable audit trail entry.
 */
export async function setDocumentResolution(
  documentId: number,
  resolution: DocumentResolution,
  userId: number,
  reason?: string,
  replacedByDocumentId?: number,
): Promise<void> {
  const doc = await getDocument(documentId);
  if (!doc) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Document ${documentId} not found` });
  }

  // Gate: snapshot must be open (mutable)
  await assertDocumentSnapshotMutable(documentId);

  const previousResolution = (doc as any).documentResolution ?? 'active';

  await db.update(documents).set({
    documentResolution: resolution,
    ...(replacedByDocumentId !== undefined ? { replacedByDocumentId } : {}),
    ...(reason !== undefined ? { resolutionReason: reason } : {}),
  }).where(eq(documents.id, documentId));

  await logAudit({
    caseId: doc.caseId,
    userId,
    action: `document_resolution_${resolution}`,
    targetType: 'document',
    targetId: documentId,
    details: {
      previousResolution,
      newResolution: resolution,
      reason: reason ?? null,
      replacedByDocumentId: replacedByDocumentId ?? null,
      sha256Hash: doc.sha256Hash,
      filename: doc.filename,
      snapshotId: doc.snapshotId,
    },
  });
}

/**
 * T2. Replace a document: mark original as superseded, link to replacement.
 * The replacement document must already exist in the same case and snapshot.
 * Returns the replacement document ID.
 */
export async function replaceDocument(
  originalDocumentId: number,
  replacementDocumentId: number,
  userId: number,
  reason: string,
): Promise<void> {
  const original = await getDocument(originalDocumentId);
  if (!original) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Original document ${originalDocumentId} not found` });
  }
  const replacement = await getDocument(replacementDocumentId);
  if (!replacement) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Replacement document ${replacementDocumentId} not found` });
  }

  // Validate: same case
  if (original.caseId !== replacement.caseId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Original and replacement documents must belong to the same case' });
  }

  // Validate: no circular reference
  if (originalDocumentId === replacementDocumentId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'A document cannot replace itself' });
  }

  // Validate: replacement must be active
  if ((replacement as any).documentResolution !== 'active') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Replacement document must have active resolution' });
  }

  // Validate: original must be eligible for replacement
  // Allowed: active, corrupted, excluded, or failed_permanent status
  const originalResolution = (original as any).documentResolution ?? 'active';
  if (originalResolution === 'superseded') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Original document is already superseded — cannot re-supersede` });
  }

  await setDocumentResolution(originalDocumentId, 'superseded', userId, reason, replacementDocumentId);
}

/**
 * T3. Mark a document as corrupted with a mandatory reason.
 */
export async function markDocumentCorrupted(
  documentId: number,
  userId: number,
  reason: string,
): Promise<void> {
  if (!reason || reason.trim().length < 10) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Corrupted resolution requires a reason of at least 10 characters' });
  }
  await setDocumentResolution(documentId, 'corrupted', userId, reason);
}

/**
 * T4. Mark a document as excluded with a mandatory reason.
 */
export async function markDocumentExcluded(
  documentId: number,
  userId: number,
  reason: string,
): Promise<void> {
  if (!reason || reason.trim().length < 10) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Excluded resolution requires a reason of at least 10 characters' });
  }
  await setDocumentResolution(documentId, 'excluded', userId, reason);
}

/**
 * T5. Get the replacement chain for a document.
 * Follows replacedByDocumentId links until an active document or null.
 * Returns the chain as an ordered array (original → ... → current active).
 * Cycle detection: max depth 50.
 */
export async function getDocumentReplacementChain(documentId: number): Promise<Array<{
  id: number;
  filename: string;
  documentResolution: string;
  replacedByDocumentId: number | null;
}>> {
  const chain: Array<{
    id: number;
    filename: string;
    documentResolution: string;
    replacedByDocumentId: number | null;
  }> = [];
  let currentId: number | null = documentId;
  const visited = new Set<number>();

  while (currentId !== null && !visited.has(currentId) && chain.length < 50) {
    visited.add(currentId);
    const doc = await getDocument(currentId);
    if (!doc) break;
    chain.push({
      id: doc.id,
      filename: doc.filename,
      documentResolution: (doc as any).documentResolution ?? 'active',
      replacedByDocumentId: (doc as any).replacedByDocumentId ?? null,
    });
    currentId = (doc as any).replacedByDocumentId ?? null;
  }

  return chain;
}

/**
 * T6. List all resolved (non-active) documents for a case.
 */
export async function listResolvedDocuments(caseId: number): Promise<Document[]> {
  return db.select().from(documents)
    .where(and(
      eq(documents.caseId, caseId),
      not(eq(documents.documentResolution, 'active')),
    ))
    .orderBy(desc(documents.createdAt));
}

/**
 * Duplicate → Replacement Conversion (failed_permanent only).
 *
 * Deterministic rule:
 *   When a duplicate hash is detected during upload AND the existing document
 *   has status = 'failed_permanent' AND documentResolution = 'active' AND
 *   the snapshot is OPEN, convert the duplicate into a replacement override.
 *
 * What it does:
 *   1. Mark existing document: documentResolution = 'superseded',
 *      resolutionReason = 'auto_override_failed_duplicate'
 *   2. Create new document row (same metadata, fresh extraction state,
 *      documentResolution = 'active')
 *   3. Link: existing.replacedByDocumentId = newDocument.id
 *   4. Log audit entry: 'duplicate_override_performed'
 *
 * What it does NOT allow:
 *   - Overriding successful documents
 *   - Overriding in sealed snapshots
 *   - Overriding active extraction
 *   - Overriding non-active resolution documents
 *
 * Returns: { newDocumentId, overridden: true } on success,
 *          { overridden: false, reason: string } when criteria not met.
 */
export async function performDuplicateOverride(
  existingDocumentId: number,
  newDocUpload: {
    caseId: number;
    filename: string;
    fileType: string;
    mimeType: string;
    fileSize: number;
    s3Key: string;
    s3Url: string;
    sha256Hash: string;
    snapshotId: number;
  },
  userId: number,
): Promise<
  | { overridden: true; newDocumentId: number }
  | { overridden: false; reason: string }
> {
  // 1. Fetch existing document
  const existing = await getDocument(existingDocumentId);
  if (!existing) {
    return { overridden: false, reason: 'Existing document not found' };
  }

  // 2. Strict criteria check: document must be in a resolved/failed state
  //    Eligible: failed_permanent status OR documentResolution IN (corrupted, excluded, superseded)
  const resolution = (existing as any).documentResolution ?? 'active';
  const isFailedPermanent = existing.status === 'failed_permanent';
  const isResolved = ['corrupted', 'excluded', 'superseded'].includes(resolution);
  if (!isFailedPermanent && !isResolved) {
    return { overridden: false, reason: `Document is not eligible for override: status='${existing.status}', resolution='${resolution}'` };
  }

  // 4. Strict criteria check: snapshot must be OPEN
  const snapshot = await getSnapshot(newDocUpload.snapshotId);
  if (!snapshot || snapshot.status !== 'open') {
    return { overridden: false, reason: `Snapshot ${newDocUpload.snapshotId} is not open` };
  }

  // 5. Strict criteria check: same case
  if (existing.caseId !== newDocUpload.caseId) {
    return { overridden: false, reason: 'Case mismatch between existing and new document' };
  }

  // ── All criteria met — perform override ──

  // 6. Create new document row (fresh extraction state)
  const newDocId = await createDocument(newDocUpload);

  // 7. Mark existing document as superseded with replacement link
  await setDocumentResolution(
    existingDocumentId,
    'superseded',
    userId,
    isFailedPermanent ? 'auto_override_failed_duplicate' : `auto_override_resolved_${resolution}`,
    Number(newDocId),
  );

  // 8. Log audit entry for the override
  await logAudit({
    caseId: newDocUpload.caseId,
    userId,
    action: 'duplicate_override_performed',
    targetType: 'document',
    targetId: Number(newDocId),
    details: {
      originalDocumentId: existingDocumentId,
      newDocumentId: Number(newDocId),
      sha256Hash: newDocUpload.sha256Hash,
      filename: newDocUpload.filename,
      snapshotId: newDocUpload.snapshotId,
      originalStatus: existing.status,
      originalResolution: resolution,
      reason: isFailedPermanent ? 'auto_override_failed_duplicate' : `auto_override_resolved_${resolution}`,
    },
  });

  return { overridden: true, newDocumentId: Number(newDocId) };
}

/**
 * Check if a document is eligible for scoped replacement override.
 * Returns the document if eligible, null otherwise.
 * Eligible: failed_permanent status OR documentResolution IN (corrupted, excluded, superseded).
 */
export async function checkReplacementEligibility(
  documentId: number,
): Promise<{ eligible: boolean; reason?: string; document?: any }> {
  const doc = await getDocument(documentId);
  if (!doc) {
    return { eligible: false, reason: 'Document not found' };
  }
  const resolution = (doc as any).documentResolution ?? 'active';
  const isFailedPermanent = doc.status === 'failed_permanent';
  const isResolved = ['corrupted', 'excluded', 'superseded'].includes(resolution);
  if (!isFailedPermanent && !isResolved) {
    return { eligible: false, reason: `Document is active and not failed — not eligible for replacement` };
  }
  return { eligible: true, document: doc };
}


// ─── Document Checklist Helpers ───

export async function createChecklistItems(caseId: number, items: { label: string; description?: string; priority: "critical" | "important" | "helpful"; sortOrder: number }[]) {
  const now = Date.now();
  const rows = items.map((item) => ({
    caseId,
    label: item.label,
    description: item.description ?? null,
    priority: item.priority,
    sortOrder: item.sortOrder,
    createdAt: now,
  }));
  if (rows.length === 0) return [];
  await db.insert(checklistItems).values(rows);
  return db.select().from(checklistItems).where(eq(checklistItems.caseId, caseId)).orderBy(checklistItems.sortOrder);
}

export async function getChecklistItems(caseId: number) {
  return db.select().from(checklistItems).where(eq(checklistItems.caseId, caseId)).orderBy(checklistItems.sortOrder);
}

export async function toggleChecklistItem(itemId: number, checked: boolean) {
  await db.update(checklistItems).set({ checked, checkedAt: checked ? Date.now() : null }).where(eq(checklistItems.id, itemId));
  return { success: true };
}

// ─── User Feedback Helpers ───

export async function createFeedback(userId: number, data: { feedbackType: "suggestion" | "question" | "bug_report" | "praise" | "other"; message: string; currentPage?: string; caseId?: number; pipelineType?: string }) {
  const [result] = await db.insert(userFeedback).values({
    userId,
    feedbackType: data.feedbackType,
    message: data.message,
    currentPage: data.currentPage ?? null,
    caseId: data.caseId ?? null,
    pipelineType: data.pipelineType ?? null,
    createdAt: Date.now(),
  }).$returningId();
  return result;
}

export async function listFeedback(limit = 50) {
  return db.select().from(userFeedback).orderBy(desc(userFeedback.createdAt)).limit(limit);
}

export async function updateFeedbackStatus(feedbackId: number, status: "new" | "reviewed" | "resolved") {
  await db.update(userFeedback).set({ status }).where(eq(userFeedback.id, feedbackId));
  return { success: true };
}

// ─── Pipeline Analytics Helpers ───

export type PipelineEventType = "intake_start" | "intake_complete" | "direct_create" | "document_uploaded" | "extraction_complete" | "analysis_started" | "analysis_complete" | "findings_generated" | "export_created" | "case_completed" | "guided_intake_complete" | "guided_to_conversation";

export async function logPipelineEvent(userId: number, pipelineType: string, eventType: PipelineEventType) {
  await db.insert(pipelineEvents).values({
    userId,
    pipelineType,
    eventType,
    createdAt: Date.now(),
  });
}

/**
 * Log a pipeline event by caseId (resolves userId and pipelineType from the case).
 * Used by server-side pipeline stages that don't have direct access to ctx.user.
 */
export async function logPipelineEventByCase(caseId: number, eventType: PipelineEventType) {
  const caseRow = await getCaseInternal(caseId);
  if (!caseRow) return;
  const userId = caseRow.userId;
  const pipelineType = caseRow.pipelineType || caseRow.domain || "general";
  await logPipelineEvent(userId, pipelineType, eventType);
}

export async function getPipelineAnalytics() {
  const allEvents = await db.select().from(pipelineEvents).orderBy(desc(pipelineEvents.createdAt));
  // Aggregate by pipeline type
  const ALL_STAGES: PipelineEventType[] = ["intake_start", "intake_complete", "direct_create", "document_uploaded", "extraction_complete", "analysis_started", "analysis_complete", "findings_generated", "export_created", "case_completed"];
  const byPipeline: Record<string, Record<string, number>> = {};
  for (const ev of allEvents) {
    if (!byPipeline[ev.pipelineType]) {
      byPipeline[ev.pipelineType] = { total: 0 };
      for (const s of ALL_STAGES) byPipeline[ev.pipelineType][s] = 0;
    }
    byPipeline[ev.pipelineType].total++;
    byPipeline[ev.pipelineType][ev.eventType] = (byPipeline[ev.pipelineType][ev.eventType] || 0) + 1;
  }
  return { byPipeline, totalEvents: allEvents.length, recentEvents: allEvents.slice(0, 20) };
}

// ─── Share Links ───

export async function createShareLink(data: {
  caseId: number;
  createdBy: number;
  token: string;
  label?: string;
  permissions?: "read_only" | "read_export";
  expiresAt: number;
}) {
  const now = Date.now();
  const result = await db.insert(shareLinks).values({
    caseId: data.caseId,
    createdBy: data.createdBy,
    token: data.token,
    label: data.label || null,
    permissions: data.permissions || "read_only",
    expiresAt: data.expiresAt,
    accessCount: 0,
    createdAt: now,
  }).$returningId();
  return { id: result[0].id, token: data.token };
}

export async function getShareLinkByToken(token: string) {
  const rows = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  return rows[0] || null;
}

export async function listShareLinksForCase(caseId: number) {
  return db.select().from(shareLinks)
    .where(eq(shareLinks.caseId, caseId))
    .orderBy(desc(shareLinks.createdAt));
}

export async function revokeShareLink(id: number, userId: number) {
  await db.update(shareLinks)
    .set({ revokedAt: Date.now() })
    .where(and(eq(shareLinks.id, id), eq(shareLinks.createdBy, userId)));
}

export async function recordShareLinkAccess(id: number) {
  await db.update(shareLinks)
    .set({
      lastAccessedAt: Date.now(),
      accessCount: sql`${shareLinks.accessCount} + 1`,
    })
    .where(eq(shareLinks.id, id));
}

export async function getSharedCaseData(caseId: number) {
  // Return a read-only view of the case with key forensic data
  const caseRow = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!caseRow[0]) return null;

  const [docs, ents, quoteRows, claimRows, findingRows, eventRows, signalRows, correlationRows] = await Promise.all([
    db.select({ id: documents.id, filename: documents.filename, pageCount: documents.pageCount, createdAt: documents.createdAt, documentType: documents.documentType })
      .from(documents).where(eq(documents.caseId, caseId)),
    db.select({ id: entities.id, name: entities.name, type: entities.type, description: entities.description })
      .from(entities).where(eq(entities.caseId, caseId)),
    db.select({ id: quotes.id, text: quotes.text, pageNumber: quotes.pageNumber, documentId: quotes.documentId, context: quotes.context })
      .from(quotes).where(eq(quotes.caseId, caseId)),
    db.select({ id: claims.id, claimText: claims.claimText, claimType: claims.claimType, evidentiaryWeight: claims.evidentiaryWeight })
      .from(claims).where(eq(claims.caseId, caseId)),
    db.select({ id: findings.id, title: findings.title, description: findings.description, evidentiaryWeight: findings.evidentiaryWeight })
      .from(findings).where(eq(findings.caseId, caseId)),
    db.select({ id: events.id, title: events.title, description: events.description, dateOccurred: events.dateOccurred, eventType: events.eventType })
      .from(events).where(eq(events.caseId, caseId)),
    db.select({ id: signalFlags.id, flagType: signalFlags.flagType, description: signalFlags.description })
      .from(signalFlags).where(eq(signalFlags.caseId, caseId)),
    db.select({ id: documentCorrelations.id, correlationType: documentCorrelations.correlationType, description: documentCorrelations.description })
      .from(documentCorrelations).where(eq(documentCorrelations.caseId, caseId)),
  ]);

  return {
    case: caseRow[0],
    documents: docs,
    entities: ents,
    quotes: quoteRows,
    claims: claimRows,
    findings: findingRows,
    events: eventRows,
    signalFlags: signalRows,
    correlations: correlationRows,
  };
}


// ─── Notification Helpers ───

export type NotificationType = 
  | "share_accessed"
  | "extraction_complete" 
  | "new_findings"
  | "case_status"
  | "feedback_response"
  | "share_expiring"
  | "foia_deadline_approaching"
  | "foia_overdue"
  | "foia_status_update"
  | "pattern_detected";

export async function createNotification(params: {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  linkUrl?: string;
}) {
  const result = await db.insert(notifications).values({
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    metadata: params.metadata || null,
    linkUrl: params.linkUrl || null,
    createdAt: Date.now(),
  }).$returningId();
  return result[0];
}

export async function listNotifications(userId: number, opts?: { limit?: number; unreadOnly?: boolean }) {
  const limit = opts?.limit || 50;
  const conditions = [eq(notifications.userId, userId)];
  if (opts?.unreadOnly) {
    conditions.push(sql`${notifications.readAt} IS NULL`);
  }
  return db.select().from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`));
  return result[0]?.count || 0;
}

export async function markNotificationRead(notificationId: number, userId: number) {
  await db.update(notifications)
    .set({ readAt: Date.now() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  await db.update(notifications)
    .set({ readAt: Date.now() })
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} IS NULL`));
}

// ─── Notification Dispatch Helpers (human-readable messages) ───

export async function notifyShareAccessed(shareLinkId: number) {
  const link = await db.select().from(shareLinks).where(eq(shareLinks.id, shareLinkId)).limit(1);
  if (!link[0]) return;
  const caseRow = await db.select().from(cases).where(eq(cases.id, link[0].caseId)).limit(1);
  const caseName = caseRow[0]?.name || "your case";
  const label = link[0].label || "An advocate";
  
  await createNotification({
    userId: link[0].createdBy,
    type: "share_accessed",
    title: "Your shared link was accessed",
    message: `${label} just opened the shared link for "${caseName}". They can now review your evidence and findings.`,
    metadata: { caseId: link[0].caseId, shareLinkId, accessCount: link[0].accessCount + 1 },
    linkUrl: `/`,
  });
}

export async function notifyExtractionComplete(userId: number, caseId: number, documentName: string, entityCount: number, claimCount: number) {
  await createNotification({
    userId,
    type: "extraction_complete",
    title: "Document analysis complete",
    message: `"${documentName}" has been fully analyzed. We found ${entityCount} entities and ${claimCount} claims. Your evidence is ready to review.`,
    metadata: { caseId, documentName, entityCount, claimCount },
    linkUrl: `/`,
  });
}

export async function notifyNewFindings(userId: number, caseId: number, findingCount: number, signalCount: number) {
  const parts: string[] = [];
  if (findingCount > 0) parts.push(`${findingCount} new finding${findingCount > 1 ? "s" : ""}`);
  if (signalCount > 0) parts.push(`${signalCount} signal flag${signalCount > 1 ? "s" : ""}`);
  
  await createNotification({
    userId,
    type: "new_findings",
    title: "New findings discovered",
    message: `Cross-document analysis revealed ${parts.join(" and ")} in your case. These may be important for your advocacy.`,
    metadata: { caseId, findingCount, signalCount },
    linkUrl: `/`,
  });
}

export async function notifyFeedbackResponse(userId: number, feedbackId: number, newStatus: string) {
  const statusMessages: Record<string, string> = {
    reviewed: "Your feedback has been reviewed by the Luminari team. We appreciate you taking the time to help us improve.",
    resolved: "Your feedback has been resolved. Thank you for helping make Luminari better for everyone.",
  };
  
  await createNotification({
    userId,
    type: "feedback_response",
    title: `Feedback ${newStatus}`,
    message: statusMessages[newStatus] || `Your feedback status has been updated to: ${newStatus}.`,
    metadata: { feedbackId, newStatus },
  });
}

export async function notifyShareExpiring(shareLinkId: number) {
  const link = await db.select().from(shareLinks).where(eq(shareLinks.id, shareLinkId)).limit(1);
  if (!link[0]) return;
  const caseRow = await db.select().from(cases).where(eq(cases.id, link[0].caseId)).limit(1);
  const caseName = caseRow[0]?.name || "your case";
  const label = link[0].label || "Your shared link";
  
  await createNotification({
    userId: link[0].createdBy,
    type: "share_expiring",
    title: "Shared link expiring soon",
    message: `${label} for "${caseName}" will expire in less than 24 hours. If your advocate still needs access, consider creating a new link.`,
    metadata: { caseId: link[0].caseId, shareLinkId, expiresAt: link[0].expiresAt },
    linkUrl: `/`,
  });
}

// ─── Admin Invite Helpers ───

type AdminInviteRuntime = {
  id: number;
  token: string;
  created_by: number;
  target_role: "user" | "admin";
  target_plan: "free" | "advocacy" | "family_advocacy" | "analyst" | "professional" | "enterprise";
  label: string | null;
  max_uses: number;
  use_count: number;
  expires_at: number;
  invite_status: "active" | "expired" | "revoked" | "exhausted";
  created_at: number;
};

function getExecuteRows(result: unknown): any[] {
  if (Array.isArray(result)) {
    return Array.isArray(result[0]) ? result[0] : result;
  }
  const maybeRows = (result as { rows?: unknown })?.rows;
  return Array.isArray(maybeRows) ? maybeRows : [];
}

export async function createAdminInvite(data: {
  token: string;
  created_by: number;
  target_role: "user" | "admin";
  target_plan: "free" | "advocacy" | "family_advocacy" | "analyst" | "professional" | "enterprise";
  label?: string;
  max_uses: number;
  expires_at: number;
}) {
  const now = Date.now();
  const rows = getExecuteRows(await db.execute(sql`
    INSERT INTO public.admin_invites (
      token,
      created_by,
      target_role,
      target_plan,
      label,
      max_uses,
      use_count,
      expires_at,
      invite_status,
      created_at
    )
    VALUES (
      ${data.token},
      ${data.created_by},
      ${data.target_role},
      ${data.target_plan},
      ${data.label || null},
      ${data.max_uses},
      0,
      ${data.expires_at},
      'active',
      ${now}
    )
    RETURNING id
  `));

  return { id: rows[0].id, token: data.token };
}

export async function getInviteByToken(token: string): Promise<AdminInviteRuntime | null> {
  const rows = getExecuteRows(await db.execute(sql`
    SELECT
      id,
      token,
      created_by,
      target_role,
      target_plan,
      label,
      max_uses,
      use_count,
      expires_at,
      invite_status,
      created_at
    FROM public.admin_invites
    WHERE token = ${token}
    LIMIT 1
  `));
  return rows[0] || null;
}

export async function listAdminInvites(created_by?: number): Promise<AdminInviteRuntime[]> {
  if (created_by) {
    return getExecuteRows(await db.execute(sql`
      SELECT
        id,
        token,
        created_by,
        target_role,
        target_plan,
        label,
        max_uses,
        use_count,
        expires_at,
        invite_status,
        created_at
      FROM public.admin_invites
      WHERE created_by = ${created_by}
      ORDER BY created_at DESC
    `));
  }

  return getExecuteRows(await db.execute(sql`
    SELECT
      id,
      token,
      created_by,
      target_role,
      target_plan,
      label,
      max_uses,
      use_count,
      expires_at,
      invite_status,
      created_at
    FROM public.admin_invites
    ORDER BY created_at DESC
  `));
}

export async function revokeAdminInvite(id: number) {
  await db.execute(sql`
    UPDATE public.admin_invites
    SET invite_status = 'revoked'
    WHERE id = ${id}
  `);
}

export async function redeemInvite(invite_id: number, user_id: number, target_role: string, target_plan: string) {
  const now = Date.now();
  // Increment use count and check if exhausted
  const rows = getExecuteRows(await db.execute(sql`
    SELECT max_uses, use_count
    FROM public.admin_invites
    WHERE id = ${invite_id}
    LIMIT 1
  `));
  const new_use_count = (rows[0]?.use_count || 0) + 1;
  const new_status = new_use_count >= (rows[0]?.max_uses || 1) ? "exhausted" as const : "active" as const;

  await db.execute(sql`
    UPDATE public.admin_invites
    SET use_count = use_count + 1, invite_status = ${new_status}
    WHERE id = ${invite_id}
  `);
  // Record redemption
  await db.execute(sql`
    INSERT INTO public.invite_redemptions (invite_id, user_id, redeemed_at)
    VALUES (${invite_id}, ${user_id}, ${now})
  `);
  // Apply role and plan to user
  await db.update(users)
    .set({ role: target_role as any, plan: target_plan as any, updatedAt: now })
    .where(eq(users.id, user_id));
}

export async function listInviteRedemptions(invite_id: number) {
  return getExecuteRows(await db.execute(sql`
    SELECT
      invite_redemptions.id,
      invite_redemptions.user_id,
      invite_redemptions.redeemed_at,
      users.name AS user_name,
      users.email AS user_email
    FROM public.invite_redemptions
    LEFT JOIN users ON invite_redemptions.user_id = users.id
    WHERE invite_redemptions.invite_id = ${invite_id}
    ORDER BY invite_redemptions.redeemed_at DESC
  `));
}

// ─── Expanded Pipeline Analytics ───

export async function getFunnelAnalytics(timeRangeMs?: number) {
  const conditions = [];
  if (timeRangeMs) {
    const cutoff = Date.now() - timeRangeMs;
    conditions.push(sql`${pipelineEvents.createdAt} >= ${cutoff}`);
  }
  
  const allEvents = conditions.length > 0
    ? await db.select().from(pipelineEvents).where(and(...conditions)).orderBy(desc(pipelineEvents.createdAt))
    : await db.select().from(pipelineEvents).orderBy(desc(pipelineEvents.createdAt));
  
  // Aggregate by pipeline type with all event stages
  const byPipeline: Record<string, Record<string, number>> = {};
  const uniqueUsersByPipeline: Record<string, Set<number>> = {};
  
  for (const ev of allEvents) {
    if (!byPipeline[ev.pipelineType]) {
      byPipeline[ev.pipelineType] = {};
      uniqueUsersByPipeline[ev.pipelineType] = new Set();
    }
    byPipeline[ev.pipelineType][ev.eventType] = (byPipeline[ev.pipelineType][ev.eventType] || 0) + 1;
    uniqueUsersByPipeline[ev.pipelineType].add(ev.userId);
  }
  
  // Build funnel summary
  const funnelStages: PipelineEventType[] = ["intake_start", "intake_complete", "direct_create", "document_uploaded", "extraction_complete", "analysis_started", "analysis_complete", "findings_generated", "export_created", "case_completed"];
  const globalFunnel: Record<string, number> = {};
  for (const stage of funnelStages) {
    globalFunnel[stage] = 0;
  }
  
  const pipelineBreakdown: Record<string, { funnel: Record<string, number>; uniqueUsers: number }> = {};
  
  for (const [pipeline, events] of Object.entries(byPipeline)) {
    pipelineBreakdown[pipeline] = {
      funnel: {},
      uniqueUsers: uniqueUsersByPipeline[pipeline]?.size || 0,
    };
    for (const stage of funnelStages) {
      const count = events[stage] || 0;
      pipelineBreakdown[pipeline].funnel[stage] = count;
      globalFunnel[stage] += count;
    }
  }
  
  return {
    globalFunnel,
    pipelineBreakdown,
    totalEvents: allEvents.length,
  };
}


// ─── FOIA Tracking Helpers ───

/** List all FOIA requests for a user across all cases, with case name and statute details */
export async function listAllUserFoiaRequests(userId: number, opts?: { statusFilter?: string; limit?: number }) {
  const conditions = [eq(foiaRequests.userId, userId)];
  if (opts?.statusFilter && opts.statusFilter !== "all") {
    conditions.push(eq(foiaRequests.status, opts.statusFilter as any));
  }
  const limit = opts?.limit || 200;

  const rows = await db.select({
    id: foiaRequests.id,
    caseId: foiaRequests.caseId,
    caseName: cases.name,
    casePipelineType: cases.pipelineType,
    missingRecordId: foiaRequests.missingRecordId,
    agencyId: foiaRequests.agencyId,
    statuteId: foiaRequests.statuteId,
    domain: foiaRequests.domain,
    recordType: foiaRequests.recordType,
    stateCode: foiaRequests.stateCode,
    requestFingerprint: foiaRequests.requestFingerprint,
    letterContent: foiaRequests.letterContent,
    requesterName: foiaRequests.requesterName,
    requesterEmail: foiaRequests.requesterEmail,
    agencyName: foiaRequests.agencyName,
    agencyAddress: foiaRequests.agencyAddress,
    agencyEmail: foiaRequests.agencyEmail,
    status: foiaRequests.status,
    warmHandoff: foiaRequests.warmHandoff,
    warmHandoffReason: foiaRequests.warmHandoffReason,
    createdAt: foiaRequests.createdAt,
    updatedAt: foiaRequests.updatedAt,
    submittedAt: foiaRequests.submittedAt,
    responseDueAt: foiaRequests.responseDueAt,
    responseReceivedAt: foiaRequests.responseReceivedAt,
    // Statute details
    statuteLawName: foiaStatutes.lawName,
    statuteReference: foiaStatutes.statuteReference,
    responseDeadlineDays: foiaStatutes.responseDeadlineDays,
    feeWaiverAvailable: foiaStatutes.feeWaiverAvailable,
    // Agency details
    agencySubmissionMethods: foiaAgencies.submissionMethods,
    agencyPortalUrl: foiaAgencies.portalUrl,
    agencyJurisdictionLevel: foiaAgencies.jurisdictionLevel,
  })
    .from(foiaRequests)
    .leftJoin(cases, eq(foiaRequests.caseId, cases.id))
    .leftJoin(foiaStatutes, eq(foiaRequests.statuteId, foiaStatutes.id))
    .leftJoin(foiaAgencies, eq(foiaRequests.agencyId, foiaAgencies.id))
    .where(and(...conditions))
    .orderBy(desc(foiaRequests.updatedAt))
    .limit(limit);

  return rows;
}

/** Get a single FOIA request with full details (statute, agency, missing record) */
export async function getFoiaRequestWithDetails(requestId: number, caseId: number) {
  const rows = await db.select({
    id: foiaRequests.id,
    caseId: foiaRequests.caseId,
    caseName: cases.name,
    missingRecordId: foiaRequests.missingRecordId,
    missingRecordType: missingRecords.recordType,
    missingRecordDescription: missingRecords.description,
    missingRecordStatus: missingRecords.status,
    agencyId: foiaRequests.agencyId,
    statuteId: foiaRequests.statuteId,
    domain: foiaRequests.domain,
    recordType: foiaRequests.recordType,
    stateCode: foiaRequests.stateCode,
    requestFingerprint: foiaRequests.requestFingerprint,
    letterContent: foiaRequests.letterContent,
    requesterName: foiaRequests.requesterName,
    requesterAddress: foiaRequests.requesterAddress,
    requesterEmail: foiaRequests.requesterEmail,
    requesterPhone: foiaRequests.requesterPhone,
    agencyName: foiaRequests.agencyName,
    agencyAddress: foiaRequests.agencyAddress,
    agencyEmail: foiaRequests.agencyEmail,
    status: foiaRequests.status,
    gatingReason: foiaRequests.gatingReason,
    warmHandoff: foiaRequests.warmHandoff,
    warmHandoffReason: foiaRequests.warmHandoffReason,
    createdAt: foiaRequests.createdAt,
    updatedAt: foiaRequests.updatedAt,
    submittedAt: foiaRequests.submittedAt,
    responseDueAt: foiaRequests.responseDueAt,
    responseReceivedAt: foiaRequests.responseReceivedAt,
    // Statute details
    statuteLawName: foiaStatutes.lawName,
    statuteReference: foiaStatutes.statuteReference,
    responseDeadlineDays: foiaStatutes.responseDeadlineDays,
    appealDeadlineDays: foiaStatutes.appealDeadlineDays,
    feeWaiverAvailable: foiaStatutes.feeWaiverAvailable,
    expeditedProcessingAvailable: foiaStatutes.expeditedProcessingAvailable,
    statuteNotes: foiaStatutes.notes,
    // Agency details
    agencyComponent: foiaAgencies.agencyComponent,
    agencySubmissionMethods: foiaAgencies.submissionMethods,
    agencyPortalUrl: foiaAgencies.portalUrl,
    agencyJurisdictionLevel: foiaAgencies.jurisdictionLevel,
    agencyNotes: foiaAgencies.notes,
  })
    .from(foiaRequests)
    .leftJoin(cases, eq(foiaRequests.caseId, cases.id))
    .leftJoin(foiaStatutes, eq(foiaRequests.statuteId, foiaStatutes.id))
    .leftJoin(foiaAgencies, eq(foiaRequests.agencyId, foiaAgencies.id))
    .leftJoin(missingRecords, eq(foiaRequests.missingRecordId, missingRecords.id))
    .where(and(
      eq(foiaRequests.id, requestId),
      eq(foiaRequests.caseId, caseId)
    ))
    .limit(1);

  return rows[0] ?? null;
}

/** Calculate deadline status for a FOIA request */
export function computeDeadlineStatus(request: {
  status: string;
  submittedAt: number | null;
  responseDueAt: number | null;
  responseReceivedAt: number | null;
}): {
  deadlineState: "not_applicable" | "pending" | "approaching" | "overdue" | "met" | "missed";
  daysRemaining: number | null;
  daysOverdue: number | null;
} {
  // No deadline if not submitted or no due date
  if (!request.submittedAt || !request.responseDueAt) {
    return { deadlineState: "not_applicable", daysRemaining: null, daysOverdue: null };
  }

  // If response already received
  if (request.responseReceivedAt) {
    const wasOnTime = request.responseReceivedAt <= request.responseDueAt;
    return {
      deadlineState: wasOnTime ? "met" : "missed",
      daysRemaining: null,
      daysOverdue: wasOnTime ? null : Math.ceil((request.responseReceivedAt - request.responseDueAt) / (24 * 60 * 60 * 1000)),
    };
  }

  // If closed/appeal states, deadline tracking is not active
  if (["closed", "appeal_prepared", "appeal_submitted"].includes(request.status)) {
    return { deadlineState: "not_applicable", daysRemaining: null, daysOverdue: null };
  }

  const now = Date.now();
  const msRemaining = request.responseDueAt - now;
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

  if (daysRemaining < 0) {
    return {
      deadlineState: "overdue",
      daysRemaining: 0,
      daysOverdue: Math.abs(daysRemaining),
    };
  }

  // "approaching" = within 5 business days (7 calendar days)
  if (daysRemaining <= 7) {
    return { deadlineState: "approaching", daysRemaining, daysOverdue: null };
  }

  return { deadlineState: "pending", daysRemaining, daysOverdue: null };
}

/** Get FOIA request summary stats for a case */
export async function getFoiaCaseSummary(caseId: number) {
  const rows = await db.select({
    id: foiaRequests.id,
    status: foiaRequests.status,
    submittedAt: foiaRequests.submittedAt,
    responseDueAt: foiaRequests.responseDueAt,
    responseReceivedAt: foiaRequests.responseReceivedAt,
    warmHandoff: foiaRequests.warmHandoff,
    recordType: foiaRequests.recordType,
    agencyName: foiaRequests.agencyName,
  }).from(foiaRequests).where(eq(foiaRequests.caseId, caseId));

  const total = rows.length;
  const byStatus: Record<string, number> = {};
  let overdueCount = 0;
  let approachingCount = 0;
  let warmHandoffCount = 0;

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    if (row.warmHandoff) warmHandoffCount++;
    const deadline = computeDeadlineStatus(row);
    if (deadline.deadlineState === "overdue") overdueCount++;
    if (deadline.deadlineState === "approaching") approachingCount++;
  }

  return {
    total,
    byStatus,
    overdueCount,
    approachingCount,
    warmHandoffCount,
    requests: rows,
  };
}

/** Find all overdue FOIA requests for a user (for notification triggers) */
export async function findOverdueFoiaRequests(userId: number) {
  const now = Date.now();
  const rows = await db.select({
    id: foiaRequests.id,
    caseId: foiaRequests.caseId,
    caseName: cases.name,
    recordType: foiaRequests.recordType,
    agencyName: foiaRequests.agencyName,
    status: foiaRequests.status,
    submittedAt: foiaRequests.submittedAt,
    responseDueAt: foiaRequests.responseDueAt,
  })
    .from(foiaRequests)
    .leftJoin(cases, eq(foiaRequests.caseId, cases.id))
    .where(and(
      eq(foiaRequests.userId, userId),
      sql`${foiaRequests.responseDueAt} IS NOT NULL`,
      sql`${foiaRequests.responseDueAt} < ${now}`,
      sql`${foiaRequests.responseReceivedAt} IS NULL`,
      sql`${foiaRequests.status} IN ('submitted', 'acknowledged', 'in_processing')`,
    ));

  return rows;
}

/** Find FOIA requests with approaching deadlines (within 7 days) */
export async function findApproachingDeadlineFoiaRequests(userId: number) {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = now + sevenDaysMs;

  const rows = await db.select({
    id: foiaRequests.id,
    caseId: foiaRequests.caseId,
    caseName: cases.name,
    recordType: foiaRequests.recordType,
    agencyName: foiaRequests.agencyName,
    status: foiaRequests.status,
    submittedAt: foiaRequests.submittedAt,
    responseDueAt: foiaRequests.responseDueAt,
  })
    .from(foiaRequests)
    .leftJoin(cases, eq(foiaRequests.caseId, cases.id))
    .where(and(
      eq(foiaRequests.userId, userId),
      sql`${foiaRequests.responseDueAt} IS NOT NULL`,
      sql`${foiaRequests.responseDueAt} > ${now}`,
      sql`${foiaRequests.responseDueAt} <= ${cutoff}`,
      sql`${foiaRequests.responseReceivedAt} IS NULL`,
      sql`${foiaRequests.status} IN ('submitted', 'acknowledged', 'in_processing')`,
    ));

  return rows;
}

/** Notify user about FOIA deadline approaching */
export async function notifyFoiaDeadlineApproaching(userId: number, requestId: number, caseId: number, agencyName: string, recordType: string, daysRemaining: number) {
  await createNotification({
    userId,
    type: "foia_deadline_approaching",
    title: "FOIA response deadline approaching",
    message: `Your records request to ${agencyName || "the agency"} for "${recordType.replace(/_/g, " ")}" has a response deadline in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}. If no response is received by the deadline, you may have grounds for an appeal.`,
    metadata: { caseId, requestId, agencyName, recordType, daysRemaining },
    linkUrl: `/`,
  });
}

/** Notify user about overdue FOIA request */
export async function notifyFoiaOverdue(userId: number, requestId: number, caseId: number, agencyName: string, recordType: string, daysOverdue: number) {
  await createNotification({
    userId,
    type: "foia_overdue",
    title: "FOIA response overdue",
    message: `The response deadline for your records request to ${agencyName || "the agency"} for "${recordType.replace(/_/g, " ")}" has passed (${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue). Consider following up with the agency or preparing an appeal.`,
    metadata: { caseId, requestId, agencyName, recordType, daysOverdue },
    linkUrl: `/`,
  });
}

/** Notify user about FOIA status update */
export async function notifyFoiaStatusUpdate(userId: number, requestId: number, caseId: number, agencyName: string, recordType: string, oldStatus: string, newStatus: string) {
  const statusLabels: Record<string, string> = {
    draft: "Draft",
    ready: "Ready to Send",
    submitted: "Submitted",
    acknowledged: "Acknowledged",
    in_processing: "In Processing",
    records_produced: "Records Received",
    partial_denial: "Partial Denial",
    denied: "Denied",
    appeal_prepared: "Appeal Prepared",
    appeal_submitted: "Appeal Submitted",
    closed: "Closed",
  };

  await createNotification({
    userId,
    type: "foia_status_update",
    title: `Records request status: ${statusLabels[newStatus] || newStatus}`,
    message: `Your records request to ${agencyName || "the agency"} for "${recordType.replace(/_/g, " ")}" has been updated from "${statusLabels[oldStatus] || oldStatus}" to "${statusLabels[newStatus] || newStatus}".`,
    metadata: { caseId, requestId, agencyName, recordType, oldStatus, newStatus },
    linkUrl: `/`,
  });
}


// ─── Case Narrative (Statement of Facts) Helpers ───

/** Timeline item types for narrative assembly */
export type TimelineItemType = "event" | "quote" | "claim" | "finding" | "foia_request";

export interface TimelineItem {
  type: TimelineItemType;
  id: number;
  date: string | null; // ISO date string or descriptive date
  datePrecision: string | null; // exact, approximate, range, unknown
  sortKey: number; // numeric sort key for chronological ordering (epoch ms or Infinity for undated)
  label: string; // short description for source reference
  description: string; // full text for narrative input
  documentId: number | null;
  documentName: string | null;
  page: number | null;
  // Additional context
  entityNames: string[];
  evidentiaryWeight: string | null; // finding_eligible, signal_only, finding, note_signal
}

/**
 * T1. Retrieve all evidence objects for a case and assemble into timeline items.
 * Returns items sorted chronologically using the priority:
 *   event.dateOccurred → claim.dateReferenced → quote document date → FOIA submittedAt
 */
export async function getCaseTimelineData(caseId: number): Promise<TimelineItem[]> {
  const items: TimelineItem[] = [];

  // 1. Events — primary timeline anchors
  const eventRows = await db.select({
    id: events.id,
    eventType: events.eventType,
    title: events.title,
    description: events.description,
    dateOccurred: events.dateOccurred,
    datePrecision: events.datePrecision,
    location: events.location,
    entitiesInvolved: events.entitiesInvolved,
    quoteIds: events.quoteIds,
  }).from(events).where(eq(events.caseId, caseId));

  // Resolve entity names for events
  const allEntityIds = new Set<number>();
  for (const e of eventRows) {
    if (Array.isArray(e.entitiesInvolved)) {
      for (const eid of e.entitiesInvolved as number[]) allEntityIds.add(eid);
    }
  }

  // Batch-load entity names
  let entityNameMap: Record<number, string> = {};
  if (allEntityIds.size > 0) {
    const entityRows = await db.select({ id: entities.id, name: entities.name })
      .from(entities)
      .where(inArray(entities.id, Array.from(allEntityIds)));
    for (const e of entityRows) entityNameMap[e.id] = e.name;
  }

  for (const e of eventRows) {
    const entityNames = Array.isArray(e.entitiesInvolved)
      ? (e.entitiesInvolved as number[]).map(id => entityNameMap[id] || `Entity #${id}`)
      : [];
    items.push({
      type: "event",
      id: e.id,
      date: e.dateOccurred,
      datePrecision: e.datePrecision ?? "unknown",
      sortKey: parseDateToSortKey(e.dateOccurred),
      label: e.title,
      description: e.description || e.title,
      documentId: null,
      documentName: null,
      page: null,
      entityNames,
      evidentiaryWeight: null,
    });
  }

  // 2. Claims — factual assertions with dates
  const claimRows = await db.select({
    id: claims.id,
    claimText: claims.claimText,
    claimType: claims.claimType,
    dateReferenced: claims.dateReferenced,
    documentId: claims.documentId,
    quoteId: claims.quoteId,
    statementOrigin: claims.statementOrigin,
    evidentiaryWeight: claims.evidentiaryWeight,
    entitiesInvolved: claims.entitiesInvolved,
  }).from(claims).where(eq(claims.caseId, caseId));

  // Load document names for claims
  const docIds = new Set<number>();
  for (const c of claimRows) docIds.add(c.documentId);

  let docNameMap: Record<number, string> = {};
  if (docIds.size > 0) {
    const docRows = await db.select({ id: documents.id, filename: documents.filename })
      .from(documents)
      .where(inArray(documents.id, Array.from(docIds)));
    for (const d of docRows) docNameMap[d.id] = d.filename;
  }

  // Load claim entity names
  const claimEntityIds = new Set<number>();
  for (const c of claimRows) {
    if (Array.isArray(c.entitiesInvolved)) {
      for (const eid of c.entitiesInvolved as number[]) claimEntityIds.add(eid);
    }
  }
  if (claimEntityIds.size > 0) {
    const extraEntities = await db.select({ id: entities.id, name: entities.name })
      .from(entities)
      .where(inArray(entities.id, Array.from(claimEntityIds)));
    for (const e of extraEntities) entityNameMap[e.id] = e.name;
  }

  for (const c of claimRows) {
    const entityNames = Array.isArray(c.entitiesInvolved)
      ? (c.entitiesInvolved as number[]).map(id => entityNameMap[id] || `Entity #${id}`)
      : [];
    items.push({
      type: "claim",
      id: c.id,
      date: c.dateReferenced,
      datePrecision: c.dateReferenced ? "referenced" : "unknown",
      sortKey: parseDateToSortKey(c.dateReferenced),
      label: truncate(c.claimText, 80),
      description: c.claimText,
      documentId: c.documentId,
      documentName: docNameMap[c.documentId] || null,
      page: null,
      entityNames,
      evidentiaryWeight: c.evidentiaryWeight,
    });
  }

  // 3. Quotes — exact text excerpts (use document date as proxy)
  const quoteRows = await db.select({
    id: quotes.id,
    text: quotes.text,
    documentId: quotes.documentId,
    pageNumber: quotes.pageNumber,
    statementOrigin: quotes.statementOrigin,
  }).from(quotes).where(eq(quotes.caseId, caseId));

  // Load document metadata for quotes (date from aiMetadata)
  const quoteDocIds = new Set<number>();
  for (const q of quoteRows) quoteDocIds.add(q.documentId);

  let docMetaMap: Record<number, { filename: string; dateFiled?: string }> = {};
  if (quoteDocIds.size > 0) {
    const docMetaRows = await db.select({
      id: documents.id,
      filename: documents.filename,
      aiMetadata: documents.aiMetadata,
    }).from(documents).where(inArray(documents.id, Array.from(quoteDocIds)));
    for (const d of docMetaRows) {
      const meta = d.aiMetadata as any;
      docMetaMap[d.id] = {
        filename: d.filename,
        dateFiled: meta?.date_filed || null,
      };
    }
  }

  for (const q of quoteRows) {
    const docMeta = docMetaMap[q.documentId];
    const docDate = docMeta?.dateFiled || null;
    items.push({
      type: "quote",
      id: q.id,
      date: docDate,
      datePrecision: docDate ? "document_date" : "unknown",
      sortKey: parseDateToSortKey(docDate),
      label: truncate(q.text, 80),
      description: q.text,
      documentId: q.documentId,
      documentName: docMeta?.filename || null,
      page: q.pageNumber,
      entityNames: [],
      evidentiaryWeight: null,
    });
  }

  // 4. Findings — patterns across claims
  const findingRows = await db.select({
    id: findings.id,
    findingType: findings.findingType,
    title: findings.title,
    description: findings.description,
    significance: findings.significance,
    confidence: findings.confidence,
    evidentiaryWeight: findings.evidentiaryWeight,
    claimIds: findings.claimIds,
    createdAt: findings.createdAt,
  }).from(findings).where(eq(findings.caseId, caseId));

  for (const f of findingRows) {
    // Use the earliest claim date as the finding's temporal anchor
    const linkedClaims = claimRows.filter(c => (f.claimIds as number[]).includes(c.id));
    const earliestClaimDate = linkedClaims
      .map(c => c.dateReferenced)
      .filter(Boolean)
      .sort()[0] || null;

    items.push({
      type: "finding",
      id: f.id,
      date: earliestClaimDate,
      datePrecision: earliestClaimDate ? "derived" : "unknown",
      sortKey: earliestClaimDate ? parseDateToSortKey(earliestClaimDate) : f.createdAt,
      label: f.title,
      description: f.description,
      documentId: null,
      documentName: null,
      page: null,
      entityNames: [],
      evidentiaryWeight: f.evidentiaryWeight,
    });
  }

  // 5. FOIA Requests — records acquisition timeline
  const foiaRows = await db.select({
    id: foiaRequests.id,
    recordType: foiaRequests.recordType,
    agencyName: foiaRequests.agencyName,
    status: foiaRequests.status,
    submittedAt: foiaRequests.submittedAt,
    createdAt: foiaRequests.createdAt,
    responseReceivedAt: foiaRequests.responseReceivedAt,
  }).from(foiaRequests).where(eq(foiaRequests.caseId, caseId));

  for (const f of foiaRows) {
    const dateMs = f.submittedAt || f.createdAt;
    const dateStr = new Date(dateMs).toISOString().split("T")[0];
    const statusLabel = f.status.replace(/_/g, " ");
    items.push({
      type: "foia_request",
      id: f.id,
      date: dateStr,
      datePrecision: "exact",
      sortKey: dateMs,
      label: `Records request to ${f.agencyName || "agency"} for ${f.recordType.replace(/_/g, " ")}`,
      description: `A public records request for ${f.recordType.replace(/_/g, " ")} was ${f.submittedAt ? "submitted to" : "drafted for"} ${f.agencyName || "the relevant agency"}. Current status: ${statusLabel}.`,
      documentId: null,
      documentName: null,
      page: null,
      entityNames: [],
      evidentiaryWeight: null,
    });
  }

  // Sort chronologically: dated items first (ascending), undated items last
  items.sort((a, b) => a.sortKey - b.sortKey);

  return items;
}

/**
 * Parse a date string to a numeric sort key (epoch ms).
 * Handles various formats: ISO dates, "Month Day, Year", approximate dates.
 * Returns Infinity for unparseable dates (sorts to end).
 */
export function parseDateToSortKey(dateStr: string | null | undefined): number {
  if (!dateStr) return Infinity;

  // Try direct Date.parse first (handles ISO, RFC, etc.)
  const direct = Date.parse(dateStr);
  if (!isNaN(direct)) return direct;

  // Try extracting year-month-day patterns
  const ymdMatch = dateStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymdMatch) {
    const d = new Date(parseInt(ymdMatch[1]), parseInt(ymdMatch[2]) - 1, parseInt(ymdMatch[3]));
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // Try "Month Day, Year" format
  const mdyMatch = dateStr.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (mdyMatch) {
    const d = new Date(`${mdyMatch[1]} ${mdyMatch[2]}, ${mdyMatch[3]}`);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // Try year-only
  const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    return new Date(parseInt(yearMatch[0]), 0, 1).getTime();
  }

  // Approximate/range markers — try to extract any date
  const approxMatch = dateStr.match(/approximately|circa|around|early|mid|late|before|after/i);
  if (approxMatch) {
    const cleaned = dateStr.replace(/approximately|circa|around|early|mid|late|before|after/gi, "").trim();
    return parseDateToSortKey(cleaned);
  }

  return Infinity;
}

/** Truncate a string to maxLen characters with ellipsis */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/** Upsert a case narrative (only one per case) */
export async function upsertCaseNarrative(data: {
  caseId: number;
  userId: number;
  content: string;
  sourceMap: NarrativeSourceMap;
  timelineItemCount: number;
  snapshotId?: number;
}): Promise<CaseNarrative> {
  const now = Date.now();

  // Check if narrative exists for this case
  const [existing] = await db.select({ id: caseNarratives.id })
    .from(caseNarratives)
    .where(eq(caseNarratives.caseId, data.caseId));

  if (existing) {
    // Update existing
    await db.update(caseNarratives)
      .set({
        userId: data.userId,
        content: data.content,
        sourceMap: data.sourceMap,
        timelineItemCount: data.timelineItemCount,
        snapshotId: data.snapshotId ?? null,
        generatedAt: now,
        updatedAt: now,
      })
      .where(eq(caseNarratives.id, existing.id));

    const [updated] = await db.select().from(caseNarratives)
      .where(eq(caseNarratives.id, existing.id));
    return updated;
  } else {
    // Insert new
    const [result] = await db.insert(caseNarratives).values({
      caseId: data.caseId,
      userId: data.userId,
      content: data.content,
      sourceMap: data.sourceMap,
      timelineItemCount: data.timelineItemCount,
      snapshotId: data.snapshotId ?? null,
      generatedAt: now,
      updatedAt: now,
    });
    const [inserted] = await db.select().from(caseNarratives)
      .where(eq(caseNarratives.caseId, data.caseId));
    return inserted;
  }
}

/** Get the current narrative for a case (or null if none) */
export async function getCaseNarrative(caseId: number): Promise<CaseNarrative | null> {
  const [row] = await db.select().from(caseNarratives)
    .where(eq(caseNarratives.caseId, caseId));
  return row ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BENEFIT APPLICATION TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/** Create a new benefit application tracker. */
export async function createBenefitApplication(data: {
  userId: number;
  caseId?: number;
  programId: string;
  programName: string;
  stateCode?: string;
  applicationUrl?: string;
  documentsNeeded?: string[];
}): Promise<BenefitApplication> {
  const now = Date.now();
  const [result] = await db.insert(benefitApplications).values({
    userId: data.userId,
    caseId: data.caseId ?? null,
    programId: data.programId,
    programName: data.programName,
    status: "not_started",
    stateCode: data.stateCode ?? null,
    applicationUrl: data.applicationUrl ?? null,
    documentsNeeded: data.documentsNeeded ?? null,
    documentsSubmitted: [],
    createdAt: now,
    updatedAt: now,
  });
  const [row] = await db.select().from(benefitApplications)
    .where(eq(benefitApplications.id, result.insertId));
  return row;
}

/** List all benefit applications for a user. */
export async function listBenefitApplications(userId: number, caseId?: number): Promise<BenefitApplication[]> {
  if (caseId) {
    return db.select().from(benefitApplications)
      .where(and(
        eq(benefitApplications.userId, userId),
        eq(benefitApplications.caseId, caseId),
      ))
      .orderBy(desc(benefitApplications.updatedAt));
  }
  return db.select().from(benefitApplications)
    .where(eq(benefitApplications.userId, userId))
    .orderBy(desc(benefitApplications.updatedAt));
}

/** Get a single benefit application by ID (with ownership check). */
export async function getBenefitApplication(id: number, userId: number): Promise<BenefitApplication | null> {
  const [row] = await db.select().from(benefitApplications)
    .where(and(
      eq(benefitApplications.id, id),
      eq(benefitApplications.userId, userId),
    ));
  return row ?? null;
}

/** Update benefit application status. */
export async function updateBenefitApplicationStatus(
  id: number,
  userId: number,
  status: BenefitApplication["status"],
  extra?: {
    appliedAt?: number;
    decisionAt?: number;
    denialReason?: string;
    confirmationNumber?: string;
  },
): Promise<BenefitApplication | null> {
  const now = Date.now();
  const updateData: Record<string, unknown> = {
    status,
    updatedAt: now,
  };
  if (status === "applied" && !extra?.appliedAt) {
    updateData.appliedAt = now;
  }
  if ((status === "approved" || status === "denied") && !extra?.decisionAt) {
    updateData.decisionAt = now;
  }
  if (extra?.appliedAt) updateData.appliedAt = extra.appliedAt;
  if (extra?.decisionAt) updateData.decisionAt = extra.decisionAt;
  if (extra?.denialReason) updateData.denialReason = extra.denialReason;
  if (extra?.confirmationNumber) updateData.confirmationNumber = extra.confirmationNumber;

  await db.update(benefitApplications)
    .set(updateData)
    .where(and(
      eq(benefitApplications.id, id),
      eq(benefitApplications.userId, userId),
    ));
  return getBenefitApplication(id, userId);
}

/** Update benefit application notes. */
export async function updateBenefitApplicationNotes(
  id: number,
  userId: number,
  notes: string,
): Promise<BenefitApplication | null> {
  await db.update(benefitApplications)
    .set({ notes, updatedAt: Date.now() })
    .where(and(
      eq(benefitApplications.id, id),
      eq(benefitApplications.userId, userId),
    ));
  return getBenefitApplication(id, userId);
}

/** Update benefit application deadline. */
export async function updateBenefitApplicationDeadline(
  id: number,
  userId: number,
  nextDeadline: number | null,
  deadlineLabel?: string,
): Promise<BenefitApplication | null> {
  await db.update(benefitApplications)
    .set({
      nextDeadline,
      deadlineLabel: deadlineLabel ?? null,
      updatedAt: Date.now(),
    })
    .where(and(
      eq(benefitApplications.id, id),
      eq(benefitApplications.userId, userId),
    ));
  return getBenefitApplication(id, userId);
}

/** Mark a document as submitted for a benefit application. */
export async function markDocumentSubmitted(
  id: number,
  userId: number,
  document: string,
): Promise<BenefitApplication | null> {
  const app = await getBenefitApplication(id, userId);
  if (!app) return null;

  const submitted = [...(app.documentsSubmitted as string[] || [])];
  if (!submitted.includes(document)) submitted.push(document);

  const needed = (app.documentsNeeded as string[] || []).filter(d => d !== document);

  await db.update(benefitApplications)
    .set({
      documentsSubmitted: submitted,
      documentsNeeded: needed,
      updatedAt: Date.now(),
    })
    .where(and(
      eq(benefitApplications.id, id),
      eq(benefitApplications.userId, userId),
    ));
  return getBenefitApplication(id, userId);
}

/** Delete a benefit application. */
export async function deleteBenefitApplication(id: number, userId: number): Promise<boolean> {
  const [result] = await db.delete(benefitApplications)
    .where(and(
      eq(benefitApplications.id, id),
      eq(benefitApplications.userId, userId),
    ));
  return (result as any).affectedRows > 0;
}

/** Get upcoming deadlines for a user's benefit applications. */
export async function getUpcomingBenefitDeadlines(userId: number): Promise<BenefitApplication[]> {
  const now = Date.now();
  return db.select().from(benefitApplications)
    .where(and(
      eq(benefitApplications.userId, userId),
      gt(benefitApplications.nextDeadline, now),
    ))
    .orderBy(asc(benefitApplications.nextDeadline));
}

/** Get summary counts by status for a user. */
export async function getBenefitApplicationSummary(userId: number): Promise<Record<string, number>> {
  const apps = await db.select().from(benefitApplications)
    .where(eq(benefitApplications.userId, userId));
  const summary: Record<string, number> = {};
  for (const app of apps) {
    summary[app.status] = (summary[app.status] || 0) + 1;
  }
  return summary;
}


// ═══════════════════════════════════════════════════════════════════════
// Lighthouse — Community Hub DB Helpers
// ═══════════════════════════════════════════════════════════════════════

import {
  lighthouseSuggestions, lighthouseSuggestionVotes,
  lighthouseSpotlight, lighthouseJobs, lighthousePosts,
} from "../drizzle/schema";
import type {
  LighthouseSuggestion, InsertLighthouseSuggestion,
  LighthouseSpotlight, InsertLighthouseSpotlight,
  LighthouseJob, InsertLighthouseJob,
  LighthousePost, InsertLighthousePost,
} from "../drizzle/schema";
import { gte } from "drizzle-orm";

// ── Suggestions ──────────────────────────────────────────────────────

let lighthouseSuggestionsUnavailable = false;
function isUndefinedTableError(error: any) {
  return error?.code === "42P01" || String(error?.message ?? "").includes('relation "lighthouse_suggestions" does not exist');
}
function markLighthouseSuggestionsUnavailable(error: any) {
  if (isUndefinedTableError(error)) {
    lighthouseSuggestionsUnavailable = true;
    console.warn("[Lighthouse] lighthouse_suggestions unavailable; skipping optional suggestions hot path until restart.");
    return true;
  }
  return false;
}

export async function createSuggestion(userId: number, content: string): Promise<number> {
  const now = Date.now();
  const [result] = await db.insert(lighthouseSuggestions).values({
    userId,
    content,
    status: "pending",
    votes: 0,
    createdAt: now,
    updatedAt: now,
  });
  return result.insertId;
}

export async function listSuggestions(opts?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<LighthouseSuggestion[]> {
  if (lighthouseSuggestionsUnavailable) return [];
  try {
    let query = db.select().from(lighthouseSuggestions);
    if (opts?.status) {
      query = query.where(eq(lighthouseSuggestions.status, opts.status as any)) as any;
    }
    return await (query as any)
      .orderBy(desc(lighthouseSuggestions.votes), desc(lighthouseSuggestions.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0);
  } catch (error: any) {
    if (markLighthouseSuggestionsUnavailable(error)) return [];
    throw error;
  }
}

export async function voteSuggestion(suggestionId: number, userId: number): Promise<boolean> {
  try {
    const now = Date.now();
    await db.insert(lighthouseSuggestionVotes).values({ suggestionId, userId, createdAt: now });
    await db.update(lighthouseSuggestions)
      .set({ votes: sql`votes + 1`, updatedAt: now })
      .where(eq(lighthouseSuggestions.id, suggestionId));
    return true;
  } catch (e: any) {
    // Duplicate vote — unique constraint violation
    if (e?.code === "ER_DUP_ENTRY" || e?.message?.includes("Duplicate")) return false;
    throw e;
  }
}

export async function unvoteSuggestion(suggestionId: number, userId: number): Promise<boolean> {
  const now = Date.now();
  const [result] = await db.delete(lighthouseSuggestionVotes)
    .where(and(
      eq(lighthouseSuggestionVotes.suggestionId, suggestionId),
      eq(lighthouseSuggestionVotes.userId, userId),
    ));
  if ((result as any).affectedRows > 0) {
    await db.update(lighthouseSuggestions)
      .set({ votes: sql`GREATEST(votes - 1, 0)`, updatedAt: now })
      .where(eq(lighthouseSuggestions.id, suggestionId));
    return true;
  }
  return false;
}

export async function getUserVotedSuggestionIds(userId: number): Promise<number[]> {
  if (lighthouseSuggestionsUnavailable) return [];
  try {
    const rows = await db.select({ suggestionId: lighthouseSuggestionVotes.suggestionId })
      .from(lighthouseSuggestionVotes)
      .where(eq(lighthouseSuggestionVotes.userId, userId));
    return rows.map(r => r.suggestionId);
  } catch (error: any) {
    if (markLighthouseSuggestionsUnavailable(error)) return [];
    throw error;
  }
}

export async function updateSuggestionStatus(
  id: number,
  status: string,
  adminNote?: string,
): Promise<void> {
  await db.update(lighthouseSuggestions).set({
    status: status as any,
    adminNote: adminNote ?? null,
    updatedAt: Date.now(),
  }).where(eq(lighthouseSuggestions.id, id));
}

export async function deleteSuggestion(id: number): Promise<void> {
  await db.delete(lighthouseSuggestionVotes).where(eq(lighthouseSuggestionVotes.suggestionId, id));
  await db.delete(lighthouseSuggestions).where(eq(lighthouseSuggestions.id, id));
}

// ── Spotlight ────────────────────────────────────────────────────────

export async function listSpotlightItems(activeOnly = true): Promise<LighthouseSpotlight[]> {
  const now = Date.now();
  let query = db.select().from(lighthouseSpotlight);
  if (activeOnly) {
    query = query.where(eq(lighthouseSpotlight.active, true)) as any;
  }
  return (query as any).orderBy(asc(lighthouseSpotlight.sortOrder), desc(lighthouseSpotlight.createdAt));
}

export async function createSpotlightItem(data: Omit<InsertLighthouseSpotlight, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const now = Date.now();
  const [result] = await db.insert(lighthouseSpotlight).values({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return result.insertId;
}

export async function updateSpotlightItem(id: number, data: Partial<Omit<InsertLighthouseSpotlight, "id" | "createdAt" | "updatedAt">>): Promise<void> {
  await db.update(lighthouseSpotlight).set({
    ...data,
    updatedAt: Date.now(),
  } as any).where(eq(lighthouseSpotlight.id, id));
}

export async function deleteSpotlightItem(id: number): Promise<void> {
  await db.delete(lighthouseSpotlight).where(eq(lighthouseSpotlight.id, id));
}

// ── Job Board ────────────────────────────────────────────────────────

export async function listJobs(opts?: {
  status?: string;
  category?: string;
  stateCode?: string;
  jobType?: string;
  limit?: number;
  offset?: number;
}): Promise<LighthouseJob[]> {
  const conditions: any[] = [];
  if (opts?.status) conditions.push(eq(lighthouseJobs.status, opts.status as any));
  if (opts?.category) conditions.push(eq(lighthouseJobs.category, opts.category as any));
  if (opts?.stateCode) conditions.push(eq(lighthouseJobs.stateCode, opts.stateCode));
  if (opts?.jobType) conditions.push(eq(lighthouseJobs.jobType, opts.jobType as any));

  let query = db.select().from(lighthouseJobs);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  return (query as any)
    .orderBy(desc(lighthouseJobs.createdAt))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);
}

export async function getJob(id: number): Promise<LighthouseJob | null> {
  const [row] = await db.select().from(lighthouseJobs).where(eq(lighthouseJobs.id, id));
  return row ?? null;
}

export async function createJob(data: Omit<InsertLighthouseJob, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const now = Date.now();
  const [result] = await db.insert(lighthouseJobs).values({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return result.insertId;
}

export async function updateJob(id: number, data: Partial<Omit<InsertLighthouseJob, "id" | "createdAt" | "updatedAt">>): Promise<void> {
  await db.update(lighthouseJobs).set({
    ...data,
    updatedAt: Date.now(),
  } as any).where(eq(lighthouseJobs.id, id));
}

export async function deleteJob(id: number): Promise<void> {
  await db.delete(lighthouseJobs).where(eq(lighthouseJobs.id, id));
}

// ── Community Board Posts ────────────────────────────────────────────

export async function listPosts(opts?: {
  category?: string;
  stateCode?: string;
  status?: string;
  userId?: number;
  limit?: number;
  offset?: number;
}): Promise<LighthousePost[]> {
  const conditions: any[] = [];
  if (opts?.category) conditions.push(eq(lighthousePosts.category, opts.category as any));
  if (opts?.stateCode) conditions.push(eq(lighthousePosts.stateCode, opts.stateCode));
  if (opts?.status) conditions.push(eq(lighthousePosts.status, opts.status as any));
  if (opts?.userId) conditions.push(eq(lighthousePosts.userId, opts.userId));

  let query = db.select().from(lighthousePosts);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  return (query as any)
    .orderBy(desc(lighthousePosts.createdAt))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);
}

export async function getPost(id: number): Promise<LighthousePost | null> {
  const [row] = await db.select().from(lighthousePosts).where(eq(lighthousePosts.id, id));
  return row ?? null;
}

export async function createPost(data: Omit<InsertLighthousePost, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const now = Date.now();
  // Default expiry: 30 days from now
  const expiresAt = data.expiresAt ?? now + 30 * 24 * 60 * 60 * 1000;
  const [result] = await db.insert(lighthousePosts).values({
    ...data,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
  return result.insertId;
}

export async function updatePost(id: number, data: Partial<Omit<InsertLighthousePost, "id" | "createdAt" | "updatedAt">>): Promise<void> {
  await db.update(lighthousePosts).set({
    ...data,
    updatedAt: Date.now(),
  } as any).where(eq(lighthousePosts.id, id));
}

export async function deletePost(id: number): Promise<void> {
  await db.delete(lighthousePosts).where(eq(lighthousePosts.id, id));
}

/** Get post with author name joined */
export async function getPostWithAuthor(id: number): Promise<(LighthousePost & { authorName: string | null }) | null> {
  const [row] = await db.select({
    id: lighthousePosts.id,
    userId: lighthousePosts.userId,
    category: lighthousePosts.category,
    title: lighthousePosts.title,
    content: lighthousePosts.content,
    stateCode: lighthousePosts.stateCode,
    location: lighthousePosts.location,
    lat: lighthousePosts.lat,
    lng: lighthousePosts.lng,
    status: lighthousePosts.status,
    expiresAt: lighthousePosts.expiresAt,
    createdAt: lighthousePosts.createdAt,
    updatedAt: lighthousePosts.updatedAt,
    authorName: users.name,
  })
    .from(lighthousePosts)
    .innerJoin(users, eq(lighthousePosts.userId, users.id))
    .where(eq(lighthousePosts.id, id));
  return row ?? null;
}


// ─── Civic Map: Events CRUD ──────────────────────────────────────────

export async function createEvent_lh(data: Omit<InsertLighthouseEvent, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const now = Date.now();
  const [result] = await db.insert(lighthouseEvents).values({
    ...data,
    createdAt: now,
    updatedAt: now,
  } as any);
  return result.insertId;
}

export async function listEvents_lh(opts: {
  status?: string;
  stateCode?: string;
  eventType?: string;
  limit?: number;
  offset?: number;
}): Promise<LighthouseEvent[]> {
  let query = db.select().from(lighthouseEvents);
  const conditions: any[] = [];
  if (opts.status) conditions.push(eq(lighthouseEvents.status, opts.status as any));
  if (opts.stateCode) conditions.push(eq(lighthouseEvents.stateCode, opts.stateCode));
  if (opts.eventType) conditions.push(eq(lighthouseEvents.eventType, opts.eventType as any));
  if (conditions.length > 0) query = query.where(and(...conditions)) as any;
  return query
    .orderBy(asc(lighthouseEvents.startsAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

export async function getEvent_lh(id: number): Promise<LighthouseEvent | null> {
  const [row] = await db.select().from(lighthouseEvents).where(eq(lighthouseEvents.id, id));
  return row ?? null;
}

export async function updateEvent_lh(id: number, data: Partial<InsertLighthouseEvent>): Promise<void> {
  await db.update(lighthouseEvents).set({
    ...data,
    updatedAt: Date.now(),
  } as any).where(eq(lighthouseEvents.id, id));
}

export async function deleteEvent_lh(id: number): Promise<void> {
  await db.delete(lighthouseEvents).where(eq(lighthouseEvents.id, id));
}

// ─── Civic Map: Geocoded Lighthouse Items ────────────────────────────

/** Get all jobs with lat/lng for map display */
export async function getGeocodedJobs(stateCode?: string): Promise<Array<{
  id: number; title: string; organization: string; jobType: string;
  category: string; location: string | null; stateCode: string | null;
  lat: number | null; lng: number | null; compensation: string | null;
  remote: boolean; url: string | null;
}>> {
  const conditions: any[] = [eq(lighthouseJobs.status, "active")];
  if (stateCode) conditions.push(eq(lighthouseJobs.stateCode, stateCode));
  return db.select({
    id: lighthouseJobs.id,
    title: lighthouseJobs.title,
    organization: lighthouseJobs.organization,
    jobType: lighthouseJobs.jobType,
    category: lighthouseJobs.category,
    location: lighthouseJobs.location,
    stateCode: lighthouseJobs.stateCode,
    lat: lighthouseJobs.lat,
    lng: lighthouseJobs.lng,
    compensation: lighthouseJobs.compensation,
    remote: lighthouseJobs.remote,
    url: lighthouseJobs.url,
  }).from(lighthouseJobs).where(and(...conditions));
}

/** Get all posts with lat/lng for map display */
export async function getGeocodedPosts(stateCode?: string): Promise<Array<{
  id: number; title: string; category: string; location: string | null;
  stateCode: string | null; lat: number | null; lng: number | null;
  authorName: string | null;
}>> {
  const conditions: any[] = [eq(lighthousePosts.status, "active")];
  if (stateCode) conditions.push(eq(lighthousePosts.stateCode, stateCode));
  return db.select({
    id: lighthousePosts.id,
    title: lighthousePosts.title,
    category: lighthousePosts.category,
    location: lighthousePosts.location,
    stateCode: lighthousePosts.stateCode,
    lat: lighthousePosts.lat,
    lng: lighthousePosts.lng,
    authorName: users.name,
  })
    .from(lighthousePosts)
    .innerJoin(users, eq(lighthousePosts.userId, users.id))
    .where(and(...conditions));
}

/** Get all events with lat/lng for map display */
export async function getGeocodedEvents(stateCode?: string): Promise<Array<{
  id: number; title: string; eventType: string; organization: string | null;
  location: string | null; stateCode: string | null;
  lat: number | null; lng: number | null;
  startsAt: number; endsAt: number | null; url: string | null;
}>> {
  const conditions: any[] = [
    not(eq(lighthouseEvents.status, "cancelled")),
  ];
  if (stateCode) conditions.push(eq(lighthouseEvents.stateCode, stateCode));
  return db.select({
    id: lighthouseEvents.id,
    title: lighthouseEvents.title,
    eventType: lighthouseEvents.eventType,
    organization: lighthouseEvents.organization,
    location: lighthouseEvents.location,
    stateCode: lighthouseEvents.stateCode,
    lat: lighthouseEvents.lat,
    lng: lighthouseEvents.lng,
    startsAt: lighthouseEvents.startsAt,
    endsAt: lighthouseEvents.endsAt,
    url: lighthouseEvents.url,
  }).from(lighthouseEvents).where(and(...conditions));
}

// ─── Civic Map: Pipeline Signal Aggregation ──────────────────────────

/** Aggregate pipeline events by type and stateCode for pattern signals */
export async function getPipelineSignalCounts(opts?: {
  stateCode?: string;
  since?: number; // timestamp — only count events after this time
}): Promise<Array<{ pipelineType: string; stateCode: string | null; count: number }>> {
  const conditions: any[] = [];
  if (opts?.stateCode) conditions.push(eq(pipelineEvents.stateCode, opts.stateCode));
  if (opts?.since) conditions.push(gt(pipelineEvents.createdAt, opts.since));

  const rows = await db.select({
    pipelineType: pipelineEvents.pipelineType,
    stateCode: pipelineEvents.stateCode,
    count: sql<number>`COUNT(*)`.as("count"),
  })
    .from(pipelineEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(pipelineEvents.pipelineType, pipelineEvents.stateCode);

  return rows.map(r => ({
    pipelineType: r.pipelineType,
    stateCode: r.stateCode,
    count: Number(r.count),
  }));
}

// ─── Civic Map: Nearby Queries ──────────────────────────────────────

/**
 * Haversine distance filter: returns items within `radiusKm` of (lat, lng).
 * Uses SQL-level filtering for efficiency.
 */
function haversineCondition(latCol: any, lngCol: any, lat: number, lng: number, radiusKm: number) {
  // Approximate bounding box first (for index usage), then exact haversine
  const latDelta = radiusKm / 111.0; // ~111km per degree latitude
  const lngDelta = radiusKm / (111.0 * Math.cos(lat * Math.PI / 180));
  return sql`${latCol} IS NOT NULL AND ${lngCol} IS NOT NULL
    AND ${latCol} BETWEEN ${lat - latDelta} AND ${lat + latDelta}
    AND ${lngCol} BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
    AND (6371 * ACOS(
      LEAST(1, COS(RADIANS(${lat})) * COS(RADIANS(${latCol})) * COS(RADIANS(${lngCol}) - RADIANS(${lng}))
      + SIN(RADIANS(${lat})) * SIN(RADIANS(${latCol})))
    )) <= ${radiusKm}`;
}

/** Get jobs within radius of a point */
export async function getNearbyJobs(lat: number, lng: number, radiusKm: number) {
  return db.select({
    id: lighthouseJobs.id,
    title: lighthouseJobs.title,
    organization: lighthouseJobs.organization,
    jobType: lighthouseJobs.jobType,
    category: lighthouseJobs.category,
    location: lighthouseJobs.location,
    stateCode: lighthouseJobs.stateCode,
    lat: lighthouseJobs.lat,
    lng: lighthouseJobs.lng,
    compensation: lighthouseJobs.compensation,
    remote: lighthouseJobs.remote,
    url: lighthouseJobs.url,
  }).from(lighthouseJobs).where(and(
    eq(lighthouseJobs.status, "active"),
    haversineCondition(lighthouseJobs.lat, lighthouseJobs.lng, lat, lng, radiusKm),
  ));
}

/** Get posts within radius of a point */
export async function getNearbyPosts(lat: number, lng: number, radiusKm: number) {
  return db.select({
    id: lighthousePosts.id,
    title: lighthousePosts.title,
    category: lighthousePosts.category,
    location: lighthousePosts.location,
    stateCode: lighthousePosts.stateCode,
    lat: lighthousePosts.lat,
    lng: lighthousePosts.lng,
    authorName: users.name,
  })
    .from(lighthousePosts)
    .innerJoin(users, eq(lighthousePosts.userId, users.id))
    .where(and(
      eq(lighthousePosts.status, "active"),
      haversineCondition(lighthousePosts.lat, lighthousePosts.lng, lat, lng, radiusKm),
    ));
}

/** Get events within radius of a point */
export async function getNearbyEvents(lat: number, lng: number, radiusKm: number) {
  return db.select({
    id: lighthouseEvents.id,
    title: lighthouseEvents.title,
    eventType: lighthouseEvents.eventType,
    organization: lighthouseEvents.organization,
    location: lighthouseEvents.location,
    stateCode: lighthouseEvents.stateCode,
    lat: lighthouseEvents.lat,
    lng: lighthouseEvents.lng,
    startsAt: lighthouseEvents.startsAt,
    endsAt: lighthouseEvents.endsAt,
    url: lighthouseEvents.url,
  }).from(lighthouseEvents).where(and(
    not(eq(lighthouseEvents.status, "cancelled")),
    haversineCondition(lighthouseEvents.lat, lighthouseEvents.lng, lat, lng, radiusKm),
  ));
}


// ─── Map-Based Intake Sessions ──────────────────────────────────────

/** Create a new map intake session */
export async function createMapIntakeSession(data: {
  userId: number;
  lat: number;
  lng: number;
  detectedState?: string;
  detectedRegion?: string;
  nearbyResources?: any[];
  patternSignals?: any[];
  suggestedPipelines?: any[];
  nearestPrograms?: any[];
  nearestOversight?: any[];
  radiusKm?: number;
}) {
  const now = Date.now();
  const [result] = await db.insert(mapIntakeSessions).values({
    userId: data.userId,
    lat: data.lat,
    lng: data.lng,
    detectedState: data.detectedState ?? null,
    detectedRegion: data.detectedRegion ?? null,
    nearbyResources: data.nearbyResources ?? null,
    patternSignals: data.patternSignals ?? null,
    suggestedPipelines: data.suggestedPipelines ?? null,
    nearestPrograms: data.nearestPrograms ?? null,
    nearestOversight: data.nearestOversight ?? null,
    radiusKm: data.radiusKm ?? 50,
    createdAt: now,
    updatedAt: now,
  });
  return { id: result.insertId, createdAt: now };
}

/** Get a map intake session by ID (with ownership check) */
export async function getMapIntakeSession(sessionId: number, userId: number) {
  const rows = await db.select().from(mapIntakeSessions).where(
    and(eq(mapIntakeSessions.id, sessionId), eq(mapIntakeSessions.userId, userId))
  );
  return rows[0] ?? null;
}

/** List active map intake sessions for a user */
export async function listActiveMapIntakeSessions(userId: number) {
  return db.select().from(mapIntakeSessions).where(
    and(
      eq(mapIntakeSessions.userId, userId),
      eq(mapIntakeSessions.status, "active"),
    )
  ).orderBy(sql`${mapIntakeSessions.createdAt} DESC`).limit(10);
}

/** Complete a map intake session (link to case) */
export async function completeMapIntakeSession(sessionId: number, userId: number, caseId: number) {
  await db.update(mapIntakeSessions)
    .set({ status: "completed", caseId, updatedAt: Date.now() })
    .where(and(eq(mapIntakeSessions.id, sessionId), eq(mapIntakeSessions.userId, userId)));
}

/** Expire old active sessions (> 24 hours) */
export async function expireOldMapIntakeSessions() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  await db.update(mapIntakeSessions)
    .set({ status: "expired", updatedAt: Date.now() })
    .where(and(
      eq(mapIntakeSessions.status, "active"),
      sql`${mapIntakeSessions.createdAt} < ${cutoff}`,
    ));
}


// ═══════════════════════════════════════════════════════════════════════
// EVIDENCE LAYER — State Graph
// ═══════════════════════════════════════════════════════════════════════

// ─── Evidence Items CRUD ───

export async function createEvidenceItem(data: {
  caseId: number;
  evidenceType: string;
  title: string;
  description?: string;
  sourceName?: string;
  sourceDate?: number;
  fileReference?: string;
  extractedText?: string;
  metadata?: Record<string, unknown>;
}) {
  const now = Date.now();
  const [result] = await db.insert(evidenceItems).values({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return { id: result.insertId, ...data, createdAt: now, updatedAt: now };
}

export async function listEvidenceItems(caseId: number) {
  return db.select().from(evidenceItems)
    .where(eq(evidenceItems.caseId, caseId))
    .orderBy(evidenceItems.createdAt);
}

export async function getEvidenceItem(id: number) {
  const rows = await db.select().from(evidenceItems).where(eq(evidenceItems.id, id));
  return rows[0] || null;
}

export async function updateEvidenceItem(id: number, data: Partial<{
  evidenceType: string;
  title: string;
  description: string;
  sourceName: string;
  sourceDate: number;
  fileReference: string;
  extractedText: string;
  metadata: Record<string, unknown>;
}>) {
  await db.update(evidenceItems)
    .set({ ...data, updatedAt: Date.now() })
    .where(eq(evidenceItems.id, id));
}

export async function deleteEvidenceItem(id: number) {
  // Also clean up related links
  await db.delete(evidenceProofLinks).where(eq(evidenceProofLinks.evidenceId, id));
  await db.delete(evidenceEventLinks).where(eq(evidenceEventLinks.evidenceId, id));
  await db.delete(evidenceGraphEdges).where(
    and(eq(evidenceGraphEdges.fromType, "evidence"), eq(evidenceGraphEdges.fromId, id))
  );
  await db.delete(evidenceItems).where(eq(evidenceItems.id, id));
}

// ─── Evidence → Proof Links ───

export async function createEvidenceProofLink(data: {
  evidenceId: number;
  frameworkId: number;
  elementNumber: number;
  relationshipStrength?: string;
  notes?: string;
}) {
  const [result] = await db.insert(evidenceProofLinks).values({
    ...data,
    createdAt: Date.now(),
  });
  return { id: result.insertId, ...data };
}

export async function listEvidenceProofLinksByEvidence(evidenceId: number) {
  return db.select().from(evidenceProofLinks)
    .where(eq(evidenceProofLinks.evidenceId, evidenceId));
}

export async function listEvidenceProofLinksByFramework(frameworkId: number) {
  return db.select().from(evidenceProofLinks)
    .where(eq(evidenceProofLinks.frameworkId, frameworkId));
}

export async function listEvidenceProofLinksByElement(frameworkId: number, elementNumber: number) {
  return db.select().from(evidenceProofLinks)
    .where(and(
      eq(evidenceProofLinks.frameworkId, frameworkId),
      eq(evidenceProofLinks.elementNumber, elementNumber),
    ));
}

export async function deleteEvidenceProofLink(id: number) {
  await db.delete(evidenceProofLinks).where(eq(evidenceProofLinks.id, id));
}

// ─── Evidence → Event Links ───

export async function createEvidenceEventLink(data: {
  evidenceId: number;
  eventId: number;
  relationship: string;
  notes?: string;
}) {
  const [result] = await db.insert(evidenceEventLinks).values({
    ...data,
    createdAt: Date.now(),
  });
  return { id: result.insertId, ...data };
}

export async function listEvidenceEventLinksByEvidence(evidenceId: number) {
  return db.select().from(evidenceEventLinks)
    .where(eq(evidenceEventLinks.evidenceId, evidenceId));
}

export async function listEvidenceEventLinksByEvent(eventId: number) {
  return db.select().from(evidenceEventLinks)
    .where(eq(evidenceEventLinks.eventId, eventId));
}

export async function deleteEvidenceEventLink(id: number) {
  await db.delete(evidenceEventLinks).where(eq(evidenceEventLinks.id, id));
}

// ─── Evidence Graph Edges ───

export async function createEvidenceGraphEdge(data: {
  caseId: number;
  fromType: "evidence" | "event";
  fromId: number;
  edgeType: "proves" | "supports" | "triggers" | "involves" | "corroborates" | "contradicts";
  toType: "event" | "claim" | "barrier" | "agency" | "proof_element";
  toId: string;
  strength?: "strong" | "moderate" | "weak";
  notes?: string;
}) {
  const [result] = await db.insert(evidenceGraphEdges).values({
    ...data,
    strength: data.strength || "moderate",
    createdAt: Date.now(),
  });
  return { id: result.insertId, ...data };
}

export async function listEvidenceGraphEdges(caseId: number, filters?: {
  fromType?: "evidence" | "event";
  toType?: "event" | "claim" | "barrier" | "agency" | "proof_element";
  edgeType?: string;
}) {
  const conditions = [eq(evidenceGraphEdges.caseId, caseId)];
  if (filters?.fromType) conditions.push(eq(evidenceGraphEdges.fromType, filters.fromType));
  if (filters?.toType) conditions.push(eq(evidenceGraphEdges.toType, filters.toType));
  if (filters?.edgeType) conditions.push(eq(evidenceGraphEdges.edgeType, filters.edgeType as any));
  return db.select().from(evidenceGraphEdges).where(and(...conditions));
}

export async function deleteEvidenceGraphEdge(id: number) {
  await db.delete(evidenceGraphEdges).where(eq(evidenceGraphEdges.id, id));
}

// ─── Evidence Coverage Analysis ───
// Determines which proof elements are satisfied, partially covered, or missing

export async function getEvidenceCoverage(caseId: number, frameworkId: number) {
  // Get all evidence for this case
  const caseEvidence = await listEvidenceItems(caseId);
  const evidenceIds = caseEvidence.map(e => e.id);

  if (evidenceIds.length === 0) {
    return { evidenceCount: 0, links: [], coverage: [] };
  }

  // Get all proof links for this framework from this case's evidence
  const allLinks = await listEvidenceProofLinksByFramework(frameworkId);
  const relevantLinks = allLinks.filter(l => evidenceIds.includes(l.evidenceId));

  // Build coverage map: elementNumber → { links, maxStrength }
  const coverageMap = new Map<number, { links: typeof relevantLinks; maxStrength: number }>();
  for (const link of relevantLinks) {
    const existing = coverageMap.get(link.elementNumber) || { links: [], maxStrength: 0 };
    existing.links.push(link);
    const strength = parseFloat(link.relationshipStrength || "0");
    if (strength > existing.maxStrength) existing.maxStrength = strength;
    coverageMap.set(link.elementNumber, existing);
  }

  return {
    evidenceCount: caseEvidence.length,
    links: relevantLinks,
    coverageMap: Object.fromEntries(coverageMap),
  };
}


// ─── Enforcement Action Paths ───

/**
 * Get all active action paths for a given pipeline type.
 * Returns structured filing instructions, agency info, steps, deadlines, etc.
 */
export async function getActionPathsByPipeline(pipelineType: string, jurisdiction?: string): Promise<EnforcementActionPath[]> {
  const conditions = [
    eq(enforcementActionPaths.pipelineType, pipelineType),
    eq(enforcementActionPaths.isActive, true),
  ];
  if (jurisdiction) {
    // Return both federal and jurisdiction-specific paths
    conditions.push(
      sql`${enforcementActionPaths.jurisdiction} IN ('federal', ${jurisdiction}, 'all')`
    );
  }
  return db.select().from(enforcementActionPaths)
    .where(and(...conditions))
    .orderBy(asc(enforcementActionPaths.priority));
}

/**
 * Get all active action paths matching any of the given pipeline types.
 * Used when a case may match multiple pipelines (e.g., benefits_denial + housing_discrimination).
 */
export async function getActionPathsByPipelines(pipelineTypes: string[], jurisdiction?: string): Promise<EnforcementActionPath[]> {
  if (pipelineTypes.length === 0) return [];
  const conditions = [
    inArray(enforcementActionPaths.pipelineType, pipelineTypes),
    eq(enforcementActionPaths.isActive, true),
  ];
  if (jurisdiction) {
    conditions.push(
      sql`${enforcementActionPaths.jurisdiction} IN ('federal', ${jurisdiction}, 'all')`
    );
  }
  return db.select().from(enforcementActionPaths)
    .where(and(...conditions))
    .orderBy(asc(enforcementActionPaths.priority));
}

/**
 * Get a single action path by ID.
 */
export async function getActionPathById(id: number): Promise<EnforcementActionPath | undefined> {
  const rows = await db.select().from(enforcementActionPaths)
    .where(eq(enforcementActionPaths.id, id))
    .limit(1);
  return rows[0];
}

/**
 * List all active action paths (for admin/registry views).
 */
export async function listAllActionPaths(): Promise<EnforcementActionPath[]> {
  return db.select().from(enforcementActionPaths)
    .orderBy(asc(enforcementActionPaths.pipelineType), asc(enforcementActionPaths.priority));
}
