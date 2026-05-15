/**
 * Resolve pinned snapshot hash for a case
 * No downstream interpretation without explicit or derived snapshot context
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function getSnapshotHash(caseId: number): Promise<string | null> {
  try {
    const result = await db.execute(
      sql`SELECT snapshot_hash FROM cases WHERE id = ${caseId} LIMIT 1`
    ) as unknown as any[];
    
    if (!result || result.length === 0) {
      return null;
    }
    
    return (result[0] as any)?.snapshot_hash || null;
  } catch (error) {
    console.error(`[Snapshot] Error resolving snapshot hash for case ${caseId}:`, error);
    return null;
  }
}

/**
 * Derive snapshot hash from case documents
 * Used when case doesn't have explicit snapshot binding
 */
export async function deriveSnapshotHash(caseId: number): Promise<string | null> {
  try {
    const result = await db.execute(
      sql`SELECT MD5(GROUP_CONCAT(document_id ORDER BY document_id)) as hash
      FROM case_documents
      WHERE case_id = ${caseId}`
    ) as unknown as any[];
    
    if (!result || result.length === 0) {
      return null;
    }
    
    return (result[0] as any)?.hash || null;
  } catch (error) {
    console.error(`[Snapshot] Error deriving snapshot hash for case ${caseId}:`, error);
    return null;
  }
}

/**
 * Verify snapshot consistency
 * Same snapshot hash should always produce same interpretation
 */
export async function verifySnapshotConsistency(
  caseId: number,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await getSnapshotHash(caseId);
  return actualHash === expectedHash;
}
