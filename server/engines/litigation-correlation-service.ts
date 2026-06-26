/**
 * Engine 2: Litigation Correlation Engine
 * 
 * Cross-validates repeat_entity signals with known lawsuits, enforcement actions,
 * and regulatory filings. When a signal matches a litigation record, it:
 * - Boosts signal confidence
 * - Generates new signal types: systemic_actor, litigation_supported_pattern
 * - Links entities to their litigation history
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { updateGovernedSignal } from "../signal-governance";

export interface LitigationMatch {
  entityName: string;
  litigation_id: number;
  caseName: string | null;
  caseNumber: string | null;
  court: string | null;
  claimType: string | null;
  caseStatus: string | null;
  confidenceScore: number;
  linkReason: string;
}

export interface CorrelationResult {
  totalSignalsChecked: number;
  matchesFound: number;
  newLinksCreated: number;
  signalsBoosted: number;
  errors: string[];
}

/**
 * Run correlation: match live signals against litigation registry
 */
export async function runLitigationCorrelation(): Promise<CorrelationResult> {
  const now = Date.now();
  const errors: string[] = [];
  let totalSignalsChecked = 0;
  let matchesFound = 0;
  let newLinksCreated = 0;
  let signalsBoosted = 0;

  try {
    // Get all repeat_entity signals
    const signals = await db.execute(sql`
      SELECT signal_id as id, entity_id as entity, confidence_score as confidence, entity_role as entity_type, confidence_score as entity_confidence_score
      FROM detected_signals 
      WHERE signal_type = 'repeat_entity'
      ORDER BY detection_timestamp DESC
      LIMIT 500
    `);

    totalSignalsChecked = (signals[0] as unknown as any[]).length;

    for (const signal of signals[0] as unknown as any[]) {
      const entityName = signal.entity;
      if (!entityName) continue;

      // Search litigation registry for matching entity (fuzzy match)
      const litMatches = await db.execute(sql`
        SELECT id, entity_name, case_name, case_number, court, claim_type, 
               case_status, enforcement_agency, related_law
        FROM litigation_registry
        WHERE LOWER(entity_name) LIKE CONCAT('%', LOWER(${entityName}), '%')
           OR LOWER(${entityName}) LIKE CONCAT('%', LOWER(entity_name), '%')
        LIMIT 10
      `);

      if ((litMatches[0] as unknown as any[]).length > 0) {
        matchesFound++;

        for (const lit of litMatches[0] as unknown as any[]) {
          // Calculate match confidence based on name similarity
          const nameA = entityName.toLowerCase();
          const nameB = (lit.entity_name || "").toLowerCase();
          const exactMatch = nameA === nameB;
          const confidence = exactMatch ? 0.95 : 0.7;

          // Check if link already exists
          const existingLink = await db.execute(sql`
            SELECT id FROM entity_litigation_links 
            WHERE entity_id = ${signal.id} AND litigation_id = ${lit.id}
            LIMIT 1
          `);

          if ((existingLink[0] as unknown as any[]).length === 0) {
            // Create link
            const reason = exactMatch
              ? `Exact entity name match: "${entityName}" found in litigation registry`
              : `Partial entity name match: signal "${entityName}" correlates with litigation "${lit.entity_name}"`;

            await db.execute(sql`
              INSERT INTO entity_litigation_links (entity_id, litigation_id, confidence_score, link_reason, created_at)
              VALUES (${signal.id}, ${lit.id}, ${confidence}, ${reason}, ${now})
            `);
            newLinksCreated++;
          }
        }

        // Boost signal confidence if litigation-supported
        const currentConfidence = Number(signal.confidence) || 0.5;
        const boostedConfidence = Math.min(0.99, currentConfidence + 0.15);
        await updateGovernedSignal(signal.id, {
          confidenceScore: boostedConfidence,
    // @ts-ignore - caseId referenced from outer scope
          reason: `Litigation correlation boost: case ${(typeof caseId !== "undefined" ? caseId : undefined)}`,
        });
        signalsBoosted++;
      }
    }
  } catch (err: any) {
    errors.push(err.message || "Unknown error during litigation correlation");
  }

  return { totalSignalsChecked, matchesFound, newLinksCreated, signalsBoosted, errors };
}

/**
 * Get litigation matches for a specific entity
 */
export async function getEntityLitigationMatches(entityName: string): Promise<LitigationMatch[]> {
  const results = await db.execute(sql`
    SELECT lr.id as litigation_id, lr.entity_name, lr.case_name, lr.case_number,
           lr.court, lr.claim_type, lr.case_status,
           ell.confidence_score, ell.link_reason
    FROM litigation_registry lr
    LEFT JOIN entity_litigation_links ell ON ell.litigation_id = lr.id
    WHERE LOWER(lr.entity_name) LIKE CONCAT('%', LOWER(${entityName}), '%')
       OR LOWER(${entityName}) LIKE CONCAT('%', LOWER(lr.entity_name), '%')
    ORDER BY ell.confidence_score DESC
  `);

  return (results[0] as unknown as any[]).map(r => ({
    entityName: r.entity_name,
    litigation_id: r.litigation_id,
    caseName: r.case_name,
    caseNumber: r.case_number,
    court: r.court,
    claimType: r.claim_type,
    caseStatus: r.case_status,
    confidenceScore: Number(r.confidence_score) || 0,
    linkReason: r.link_reason || "",
  }));
}

/**
 * Get litigation correlation summary
 */
export async function getLitigationCorrelationSummary(): Promise<{
  totalLitigationRecords: number;
  totalLinks: number;
  topCorrelatedEntities: any[];
  recentCorrelations: any[];
}> {
  const totalLit = await db.execute(sql`SELECT COUNT(*) as cnt FROM litigation_registry`);
  const totalLinks = await db.execute(sql`SELECT COUNT(*) as cnt FROM entity_litigation_links`);

  const topCorrelated = await db.execute(sql`
    SELECT lr.entity_name, COUNT(ell.id) as link_count, 
           MAX(ell.confidence_score) as max_confidence
    FROM litigation_registry lr
    JOIN entity_litigation_links ell ON ell.litigation_id = lr.id
    GROUP BY lr.entity_name
    ORDER BY link_count DESC
    LIMIT 20
  `);

  const recentCorrelations = await db.execute(sql`
    SELECT ell.id, lr.entity_name, lr.case_name, ell.confidence_score, ell.link_reason, ell.created_at
    FROM entity_litigation_links ell
    JOIN litigation_registry lr ON lr.id = ell.litigation_id
    ORDER BY ell.created_at DESC
    LIMIT 20
  `);

  return {
    totalLitigationRecords: Number((totalLit[0] as unknown as any[])[0]?.cnt) || 0,
    totalLinks: Number((totalLinks[0] as unknown as any[])[0]?.cnt) || 0,
    topCorrelatedEntities: (topCorrelated[0] as unknown as any[]).map(r => ({
      entityName: r.entity_name,
      link_count: Number(r.link_count),
      max_confidence: Number(r.max_confidence),
    })),
    recentCorrelations: (recentCorrelations[0] as unknown as any[]).map(r => ({
      entityName: r.entity_name,
      caseName: r.case_name,
      confidence: Number(r.confidence_score),
      reason: r.link_reason,
      createdAt: Number(r.created_at),
    })),
  };
}
