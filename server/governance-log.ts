/**
 * Governance Logging Service (Constitutional Enforcement Layer)
 * 
 * Core Rules (Non-Negotiable):
 * 1. No governed write without a log entry in the same transaction
 * 2. If log write fails → entire operation fails
 * 3. All events require meaningful rationale (no empty strings, no vague reasoning)
 * 4. Hash chain is deterministic and verifiable
 * 5. No UPDATE or DELETE on governance_log — append-only
 * 
 * Architecture:
 * - writeGovernanceLog() is the ONLY entry point for governance logging
 * - It MUST be called inside the same database transaction as the governed write
 * - The hash chain links each entry to the previous via SHA-256
 * - Genesis entry uses "0".repeat(64) as previous_hash
 * - Actor identity is hashed for privacy but traceable for audit
 * 
 * Usage:
 *   await db.transaction(async (tx) => {
 *     // 1. Perform the governed write
 *     await tx.update(sunamThresholds).set({ ... }).where(...);
 *     // 2. Log the governance event (MUST be in same transaction)
 *     await writeGovernanceLog(tx, {
 *       eventType: "threshold_update",
 *       component: "sunam_thresholds",
 *       scope: "signal_type:wage_theft",
 *       previousState: oldThreshold,
 *       newState: newThreshold,
 *       rationale: "Adjusted wage theft detection threshold based on Q1 data review",
 *       actorId: ctx.user.openId,
 *       actorRole: "admin",
 *     });
 *   });
 */

import { createHash } from "crypto";
import { eq, desc, sql } from "drizzle-orm";
import { governanceLog, governanceSnapshots } from "../drizzle/schema";
import type { GovernanceEventType, GovernanceLogEntry } from "../drizzle/schema";
import { signSnapshot, getPublicKeyFingerprint } from "./crypto-signing";
import { canonicalStringify } from "./export-manifest";

// ─── Types ───

export interface GovernanceLogInput {
  eventType: GovernanceEventType;
  component: string;
  scope?: string;
  previousState?: unknown;    // Will be canonically serialized
  newState: unknown;           // Will be canonically serialized
  rationale: string;
  actorId: string;             // Will be hashed
  actorRole: "admin" | "system" | "engine";
}

// ─── Constants ───

const GENESIS_HASH = "0".repeat(64);

const MINIMUM_RATIONALE_LENGTH = 10;
const MINIMUM_RATIONALE_WORDS = 3;
const BANNED_RATIONALE_PATTERNS = [
  /^update$/i,
  /^change$/i,
  /^fix$/i,
  /^test$/i,
  /^n\/a$/i,
  /^none$/i,
  /^\.+$/,
  /^-+$/,
  /^\s*$/,
];
const BANNED_FILLER_SUBSTRINGS = [
  "test", "aaaa", "asdf", "qwerty", "xxxx", "zzzz",
  "placeholder", "todo", "fixme", "lorem ipsum",
];

// ─── Validation ───

/**
 * Validate rationale is meaningful — no empty strings, no vague reasoning.
 * T1. Input rationale is checked against minimum length.
 * T2. Input rationale is checked against banned patterns.
 * T3. If validation fails, throw with specific reason.
 */
function validateRationale(rationale: string): void {
  if (!rationale || rationale.trim().length < MINIMUM_RATIONALE_LENGTH) {
    throw new Error(
      `Governance rationale must be at least ${MINIMUM_RATIONALE_LENGTH} characters. ` +
      `Received: "${rationale}". Provide a meaningful explanation for this change.`
    );
  }
  // Word count check — rationale must express intent, not filler
  const words = rationale.trim().split(/\s+/);
  if (words.length < MINIMUM_RATIONALE_WORDS) {
    throw new Error(
      `Governance rationale must contain at least ${MINIMUM_RATIONALE_WORDS} words. ` +
      `Received ${words.length} word(s). Provide a meaningful explanation.`
    );
  }
  for (const pattern of BANNED_RATIONALE_PATTERNS) {
    if (pattern.test(rationale.trim())) {
      throw new Error(
        `Governance rationale "${rationale}" is too vague. ` +
        `Provide a specific explanation for why this change was made.`
      );
    }
  }
  // Filler substring check — reject obvious garbage
  const lower = rationale.toLowerCase();
  for (const filler of BANNED_FILLER_SUBSTRINGS) {
    if (lower.includes(filler)) {
      throw new Error(
        `Governance rationale contains banned filler pattern "${filler}". ` +
        `Provide a meaningful, specific rationale.`
      );
    }
  }
}

/**
 * Validate event type is a known governance event.
 */
function validateEventType(eventType: string): void {
  const VALID_TYPES: readonly string[] = [
    "gap_standard_version", "constitution_version", "signal_taxonomy_update",
    "threshold_update", "confidence_logic_change", "category_reclassification",
    "signal_suppression", "signal_restoration", "action_reassignment", "gap_reclassification",
    "engine_activation", "engine_deactivation", "engine_config_change",
    "data_stream_activation", "data_stream_deactivation",
    "data_stream_created", "data_stream_deleted", "data_stream_config_changed",
    "population_rule_change", "strategy_path_updated",
    "pattern_candidate_status_changed", "pattern_strategy_boost",
  ];
  if (!VALID_TYPES.includes(eventType)) {
    throw new Error(`Unknown governance event type: "${eventType}". Valid types: ${VALID_TYPES.join(", ")}`);
  }
}

// ─── Hashing ───

/**
 * Hash actor identity for privacy.
 * T1. Actor ID is SHA-256 hashed.
 * T2. Same actor ID always produces the same hash (deterministic).
 */
function hashActorId(actorId: string): string {
  return createHash("sha256").update(actorId).digest("hex");
}

/**
 * Compute the entry hash for a governance log entry.
 * T1. Canonical JSON of entry fields (excluding id, seq_no, entry_hash) is computed.
 * T2. Previous hash is appended.
 * T3. SHA-256 of the combined string is the entry hash.
 * 
 * This is deterministic: same inputs always produce the same hash.
 */
function computeEntryHash(entry: {
  eventType: string;
  component: string;
  scope: string | null;
  previousState: string | null;
  newState: string;
  rationale: string;
  actorHash: string;
  actorRole: string;
  createdAt: number;
  previousHash: string;
}): string {
  const canonical = canonicalStringify({
    actorHash: entry.actorHash,
    actorRole: entry.actorRole,
    component: entry.component,
    createdAt: entry.createdAt,
    eventType: entry.eventType,
    newState: entry.newState,
    previousHash: entry.previousHash,
    previousState: entry.previousState,
    rationale: entry.rationale,
    scope: entry.scope,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ─── Core Writer ───

/**
 * Write a governance log entry inside a database transaction.
 * 
 * MUST be called inside the same transaction as the governed write.
 * If this function throws, the entire transaction rolls back.
 * 
 * T1. Validate rationale (meaningful, not vague).
 * T2. Validate event type (known governance event).
 * T3. Get the latest entry's hash and seq_no (or genesis values).
 * T4. Compute actor hash.
 * T5. Serialize previous/new state to canonical JSON.
 * T6. Compute entry hash (deterministic).
 * T7. Insert the entry (append-only).
 * T8. Return the inserted entry for verification.
 */
export async function writeGovernanceLog(
  tx: any, // Drizzle transaction object — MUST be a transaction, not db
  input: GovernanceLogInput
): Promise<{ seqNo: number; entryHash: string }> {
  // T0. MANDATORY: Verify transaction context — no fallback to db allowed
  if (!tx || typeof tx.insert !== "function") {
    throw new Error(
      "Governance log requires transaction context (trx). " +
      "writeGovernanceLog MUST be called inside db.transaction(). " +
      "Direct db access is a constitutional violation."
    );
  }
  
  // T1. Validate rationale
  validateRationale(input.rationale);
  
  // T2. Validate event type
  validateEventType(input.eventType);
  
  // T3. Get the latest entry with FOR UPDATE lock (prevents hash chain fork under concurrency)
  const [latestEntry] = await tx
    .select({
      seqNo: governanceLog.seqNo,
      entryHash: governanceLog.entryHash,
    })
    .from(governanceLog)
    .orderBy(desc(governanceLog.seqNo))
    .limit(1)
    .for("update");
  
  const previousHash = latestEntry?.entryHash ?? GENESIS_HASH;
  const nextSeqNo = (latestEntry?.seqNo ?? 0) + 1;
  
  // T4. Hash actor identity
  const actorHash = hashActorId(input.actorId);
  
  // T5. Serialize states
  const previousStateJson = input.previousState != null
    ? canonicalStringify(input.previousState)
    : null;
  const newStateJson = canonicalStringify(input.newState);
  
  // T6. Compute entry hash
  const now = Date.now();
  const entryHash = computeEntryHash({
    eventType: input.eventType,
    component: input.component,
    scope: input.scope ?? null,
    previousState: previousStateJson,
    newState: newStateJson,
    rationale: input.rationale,
    actorHash,
    actorRole: input.actorRole,
    createdAt: now,
    previousHash,
  });
  
  // T7. Insert (append-only)
  await tx.insert(governanceLog).values({
    seqNo: nextSeqNo,
    eventType: input.eventType,
    component: input.component,
    scope: input.scope ?? null,
    previousState: previousStateJson,
    newState: newStateJson,
    rationale: input.rationale,
    actorHash,
    actorRole: input.actorRole,
    previousHash,
    entryHash,
    createdAt: now,
  });
  
  // T8. Return for verification
  return { seqNo: nextSeqNo, entryHash };
}

// ─── Chain Verification ───

/**
 * Verify the integrity of the governance log hash chain.
 * 
 * T1. Read all entries in sequence order.
 * T2. For each entry, recompute the expected hash.
 * T3. Compare recomputed hash with stored hash.
 * T4. Verify previous_hash links to the prior entry's entry_hash.
 * T5. Return verification result with break point if chain is broken.
 */
export async function verifyGovernanceChain(
  dbInstance: any
): Promise<{
  valid: boolean;
  totalEntries: number;
  lastValidSeqNo: number;
  breakPoint?: { seqNo: number; expectedHash: string; actualHash: string; reason: string };
}> {
  const entries = await dbInstance
    .select()
    .from(governanceLog)
    .orderBy(governanceLog.seqNo);
  
  if (entries.length === 0) {
    return { valid: true, totalEntries: 0, lastValidSeqNo: 0 };
  }
  
  let lastValidSeqNo = 0;
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPreviousHash = i === 0 ? GENESIS_HASH : entries[i - 1].entryHash;
    
    // T4. Verify previous_hash links
    if (entry.previousHash !== expectedPreviousHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        lastValidSeqNo,
        breakPoint: {
          seqNo: entry.seqNo,
          expectedHash: expectedPreviousHash,
          actualHash: entry.previousHash,
          reason: "previous_hash does not match prior entry's entry_hash",
        },
      };
    }
    
    // T2-T3. Recompute and compare entry hash
    const recomputed = computeEntryHash({
      eventType: entry.eventType,
      component: entry.component,
      scope: entry.scope,
      previousState: entry.previousState,
      newState: entry.newState,
      rationale: entry.rationale,
      actorHash: entry.actorHash,
      actorRole: entry.actorRole,
      createdAt: entry.createdAt,
      previousHash: entry.previousHash,
    });
    
    if (recomputed !== entry.entryHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        lastValidSeqNo,
        breakPoint: {
          seqNo: entry.seqNo,
          expectedHash: recomputed,
          actualHash: entry.entryHash,
          reason: "entry_hash does not match recomputed hash (data may have been tampered)",
        },
      };
    }
    
    lastValidSeqNo = entry.seqNo;
  }
  
  return { valid: true, totalEntries: entries.length, lastValidSeqNo };
}

// ─── Snapshot Creation ───

/**
 * Create a cryptographic snapshot of the governance log chain.
 * 
 * T1. Read all entries up to the specified seq_no (or latest).
 * T2. Compute the hash chain root (hash of the last entry's entry_hash + entry count).
 * T3. Sign the hash chain root with the system private key.
 * T4. Store the snapshot.
 */
export async function createGovernanceSnapshot(
  dbInstance: any,
  upToSeqNo?: number
): Promise<{ snapshotId: number; hashChainRoot: string; entryCount: number }> {
  // T1. Get entries
  const entries = upToSeqNo
    ? await dbInstance.select().from(governanceLog)
        .where(sql`${governanceLog.seqNo} <= ${upToSeqNo}`)
        .orderBy(governanceLog.seqNo)
    : await dbInstance.select().from(governanceLog).orderBy(governanceLog.seqNo);
  
  if (entries.length === 0) {
    throw new Error("Cannot create snapshot: governance log is empty");
  }
  
  const lastEntry = entries[entries.length - 1];
  
  // T2. Compute hash chain root
  const chainRootPayload = canonicalStringify({
    entryCount: entries.length,
    lastEntryHash: lastEntry.entryHash,
    lastSeqNo: lastEntry.seqNo,
  });
  const hashChainRoot = createHash("sha256").update(chainRootPayload).digest("hex");
  
  // T3. Sign
  const signaturePayload: any = {
    snapshotId: `gov-snapshot-${lastEntry.seqNo}`,
    documentHashes: { chainRoot: hashChainRoot },
  };
  const signature = signSnapshot(signaturePayload);
  const fingerprint = getPublicKeyFingerprint();
  
  // T4. Store
  const now = Date.now();
  const [result] = await dbInstance.insert(governanceSnapshots).values({
    snapshotAt: now,
    upToSeqNo: lastEntry.seqNo,
    hashChainRoot,
    entryCount: entries.length,
    signature,
    signedBy: fingerprint,
    signatureAlgorithm: "Ed25519",
    createdAt: now,
  }).returning({ id: governanceSnapshots.id });

  if (!result?.id) {
    throw new Error("Governance snapshot insert did not return an id");
  }
  
  return {
    snapshotId: Number(result.id),
    hashChainRoot,
    entryCount: entries.length,
  };
}

// ─── Query Helpers ───

/**
 * Get the latest governance log entries (for public feed).
 * Redacts sensitive fields (raw previous/new state values).
 */
export async function getGovernanceLogPublicFeed(
  dbInstance: any,
  limit: number = 50,
  offset: number = 0
): Promise<{
  entries: Array<{
    seqNo: number;
    eventType: string;
    component: string;
    scope: string | null;
    rationale: string;
    actorRole: string;
    entryHash: string;
    previousHash: string;
    createdAt: number;
  }>;
  total: number;
}> {
  const [countResult] = await dbInstance
    .select({ count: sql<number>`COUNT(*)` })
    .from(governanceLog);
  
  const entries = await dbInstance
    .select({
      seqNo: governanceLog.seqNo,
      eventType: governanceLog.eventType,
      component: governanceLog.component,
      scope: governanceLog.scope,
      rationale: governanceLog.rationale,
      actorRole: governanceLog.actorRole,
      entryHash: governanceLog.entryHash,
      previousHash: governanceLog.previousHash,
      createdAt: governanceLog.createdAt,
    })
    .from(governanceLog)
    .orderBy(desc(governanceLog.seqNo))
    .limit(limit)
    .offset(offset);
  
  return { entries, total: countResult.count };
}

/**
 * Get the full governance log entry (for deep audit).
 * Includes previous/new state diffs.
 */
export async function getGovernanceLogEntry(
  dbInstance: any,
  seqNo: number
): Promise<GovernanceLogEntry | null> {
  const [entry] = await dbInstance
    .select()
    .from(governanceLog)
    .where(eq(governanceLog.seqNo, seqNo));
  return entry ?? null;
}

/**
 * Get the latest snapshot for verification.
 */
export async function getLatestGovernanceSnapshot(
  dbInstance: any
): Promise<typeof governanceSnapshots.$inferSelect | null> {
  const [snapshot] = await dbInstance
    .select()
    .from(governanceSnapshots)
    .orderBy(desc(governanceSnapshots.createdAt))
    .limit(1);
  return snapshot ?? null;
}

// ─── Export Helpers ───

/**
 * Export the full governance log as JSONL for external verification.
 */
export async function exportGovernanceLog(
  dbInstance: any
): Promise<string> {
  const entries = await dbInstance
    .select()
    .from(governanceLog)
    .orderBy(governanceLog.seqNo);
  
  return entries.map((e: GovernanceLogEntry) => JSON.stringify(e)).join("\n");
}

// Re-export for convenience
export { computeEntryHash, hashActorId, validateRationale, GENESIS_HASH };
