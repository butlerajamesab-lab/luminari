/**
 * Session Management Service
 * 
 * Manages the continuous execution loop between Tsunam and Luminari.
 * Every session is anchored to a verified governance state.
 * All actions flow through governance hooks.
 */

import { db } from "./db.ts";
import { sessionLog, governanceLog } from "../drizzle/schema.ts";
import { eq, and, gte, desc, isNull } from "drizzle-orm";
import { verifyGovernanceChain } from "./governance-log.ts";
import { randomUUID } from "crypto";

export type SessionAction = {
  action: string;
  input: Record<string, unknown>;
  timestamp: number;
};

export type SessionHandoff = {
  sessionId: string;
  actionsTaken: SessionAction[];
  results: Record<string, unknown>;
  governanceEntries: [number, number] | null;
  state: Record<string, unknown>;
  nextActions: Array<{
    action: string;
    description: string;
    inputs?: Record<string, unknown>;
  }>;
};

/**
 * Start a new session anchored to the current verified governance state
 */
export async function startSession(actorType: "tsunam" | "luminari") {
  // Verify the current chain state
  const chainStatus = await verifyGovernanceChain(db);
  if (!chainStatus.valid) {
    throw new Error(
      `Cannot start session: governance chain is broken at seq_no ${chainStatus.breakPoint?.seqNo}`
    );
  }

  const sessionId = randomUUID();
  const now = Date.now();

  await db.insert(sessionLog).values({
    sessionId,
    startedAt: now,
    completedAt: null,
    actorType,
    governanceAnchor: chainStatus.lastValidSeqNo,
    actionsTaken: [] as Array<{ action: string; input: Record<string, unknown>; timestamp: number }>,
    results: {} as Record<string, unknown>,
    governanceEntriesStart: null,
    governanceEntriesEnd: null,
    nextActions: [] as Array<{ action: string; description: string; inputs?: Record<string, unknown> }>,
    stateSnapshot: {} as Record<string, unknown>,
    createdAt: now,
  });

  return {
    sessionId,
    governanceAnchor: chainStatus.lastValidSeqNo,
    startedAt: now,
  };
}

/**
 * Get the current session for an actor type
 */
export async function getCurrentSession(actorType: "tsunam" | "luminari") {
  const [session] = await db
    .select()
    .from(sessionLog)
    .where(
      and(
        eq(sessionLog.actorType, actorType),
        isNull(sessionLog.completedAt)
      )
    )
    .orderBy(desc(sessionLog.startedAt))
    .limit(1);

  return session || null;
}

/**
 * Record an action in the current session
 */
export async function recordSessionAction(
  sessionId: string,
  action: SessionAction
) {
  const [session] = await db
    .select()
    .from(sessionLog)
    .where(eq(sessionLog.sessionId, sessionId));

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (session.completedAt) {
    throw new Error(`Session already completed: ${sessionId}`);
  }

  const existing = session.actionsTaken as unknown as SessionAction[];
  const actions = Array.isArray(existing) ? existing : [];
  actions.push(action);

  await db
    .update(sessionLog)
    .set({
      actionsTaken: actions as Array<{ action: string; input: Record<string, unknown>; timestamp: number }>,
    })
    .where(eq(sessionLog.sessionId, sessionId));
}

/**
 * End the session and produce a handoff
 */
export async function endSession(
  sessionId: string,
  results: Record<string, unknown>,
  nextActions: Array<{
    action: string;
    description: string;
    inputs?: Record<string, unknown>;
  }>,
  stateSnapshot: Record<string, unknown>
): Promise<SessionHandoff> {
  const [session] = await db
    .select()
    .from(sessionLog)
    .where(eq(sessionLog.sessionId, sessionId));

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  if (session.completedAt) {
    throw new Error(`Session already completed: ${sessionId}`);
  }

  // Determine governance entry range
  let governanceEntriesStart: number | null = null;
  let governanceEntriesEnd: number | null = null;

  // Get all entries after the governance anchor
  const entriesAfterAnchor = await db
    .select({ seqNo: governanceLog.seqNo })
    .from(governanceLog)
    .where(gte(governanceLog.seqNo, session.governanceAnchor + 1))
    .orderBy(governanceLog.seqNo);

  if (entriesAfterAnchor.length > 0) {
    governanceEntriesStart = entriesAfterAnchor[0].seqNo;
    governanceEntriesEnd = entriesAfterAnchor[entriesAfterAnchor.length - 1].seqNo;

    // Verify no gaps in the range
    const startSeq = governanceEntriesStart;
    if (startSeq !== null) {
      for (let i = 0; i < entriesAfterAnchor.length; i++) {
        const expected = startSeq + i;
        const actual = entriesAfterAnchor[i].seqNo;
        if (expected !== actual) {
          throw new Error(
            `Gap in governance entries: expected seq_no ${expected}, got ${actual}`
          );
        }
      }
    }
  }

  const now = Date.now();

  // Update session with completion
  await db
    .update(sessionLog)
    .set({
      completedAt: now,
      results: results as Record<string, unknown>,
      governanceEntriesStart,
      governanceEntriesEnd,
      nextActions: nextActions as Array<{ action: string; description: string; inputs?: Record<string, unknown> }>,
      stateSnapshot: stateSnapshot as Record<string, unknown>,
    })
    .where(eq(sessionLog.sessionId, sessionId));

  const rawActions = session.actionsTaken as unknown as SessionAction[];
  const actions = Array.isArray(rawActions) ? rawActions : [];

  return {
    sessionId,
    actionsTaken: actions,
    results,
    governanceEntries:
      governanceEntriesStart !== null && governanceEntriesEnd !== null
        ? [governanceEntriesStart, governanceEntriesEnd]
        : null,
    state: stateSnapshot,
    nextActions,
  };
}

/**
 * Get a completed session's handoff
 */
export async function getSessionHandoff(sessionId: string): Promise<SessionHandoff | null> {
  const [session] = await db
    .select()
    .from(sessionLog)
    .where(eq(sessionLog.sessionId, sessionId));

  if (!session || !session.completedAt) {
    return null;
  }

  const rawActions = session.actionsTaken as unknown as SessionAction[];
  const rawNextActions = session.nextActions as unknown as Array<{ action: string; description: string; inputs?: Record<string, unknown> }>;
  const rawResults = session.results as unknown as Record<string, unknown>;
  const rawSnapshot = session.stateSnapshot as unknown as Record<string, unknown>;

  return {
    sessionId: session.sessionId,
    actionsTaken: Array.isArray(rawActions) ? rawActions : [],
    results: rawResults && typeof rawResults === "object" ? rawResults : {},
    governanceEntries:
      session.governanceEntriesStart !== null &&
      session.governanceEntriesEnd !== null
        ? [session.governanceEntriesStart, session.governanceEntriesEnd]
        : null,
    state: rawSnapshot && typeof rawSnapshot === "object" ? rawSnapshot : {},
    nextActions: Array.isArray(rawNextActions) ? rawNextActions : [],
  };
}

/**
 * Get session history for an actor
 */
export async function getSessionHistory(
  actorType: "tsunam" | "luminari",
  limit: number = 10
) {
  const sessions = await db
    .select()
    .from(sessionLog)
    .where(eq(sessionLog.actorType, actorType))
    .orderBy(desc(sessionLog.startedAt))
    .limit(limit);

  return sessions.map((s: any) => {
    const rawActions = s.actionsTaken as unknown as unknown[];
    return {
      sessionId: s.sessionId,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      governanceAnchor: s.governanceAnchor,
      governanceEntriesRange:
        s.governanceEntriesStart !== null && s.governanceEntriesEnd !== null
          ? [s.governanceEntriesStart, s.governanceEntriesEnd]
          : null,
      actionCount: Array.isArray(rawActions) ? rawActions.length : 0,
    };
  });
}
