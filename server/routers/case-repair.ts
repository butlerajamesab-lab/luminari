/**
 * Case Repair Router — admin-only, audit-logged, dry-run supported
 *
 * Three deterministic operations:
 *   A) findOrphans — detect entities in cases with 0 documents, mismatches
 *   B) moveEntities — reassign entities + dependent rows between cases (transactional)
 *   C) purgeEntities — bulk delete entities in cases with 0 documents (transactional)
 *
 * Invariants:
 *   - Dry-run uses identical selection logic as execute (no duplicated queries)
 *   - Move/purge wrapped in DB transaction — any FK failure → full rollback
 *   - Purge only allowed when doc_count(caseId) == 0 AND entity_count > 0
 *   - Every operation audit-logged with full counts
 *   - Idempotent: second run on same data → 0 moved/purged
 */

import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { db, logAudit } from "../db";
import {
  cases, documents, entities, entityRoles, quotes, claims,
  relationships, relationshipEvidence, events, signalFlags,
  findings, documentCorrelations,
} from "../../drizzle/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

// ─── Shared Selection Helpers ───
// These are used by BOTH dry-run and execute paths to guarantee identical logic.

async function selectEntities(
  txOrDb: typeof db,
  caseId: number,
  entityIdFilter?: number[],
) {
  if (entityIdFilter && entityIdFilter.length > 0) {
    return txOrDb.select({ id: entities.id, name: entities.name, type: entities.type })
      .from(entities)
      .where(and(eq(entities.caseId, caseId), inArray(entities.id, entityIdFilter)));
  }
  return txOrDb.select({ id: entities.id, name: entities.name, type: entities.type })
    .from(entities).where(eq(entities.caseId, caseId));
}

async function countDependents(txOrDb: typeof db, caseId: number, entityIds: number[]) {
  let erCount = 0, reCount = 0;
  const relIds: number[] = [];

  if (entityIds.length > 0) {
    const [er] = await txOrDb.select({ c: sql<number>`COUNT(*)` })
      .from(entityRoles).where(inArray(entityRoles.entityId, entityIds));
    erCount = er.c;

    // Relationships where source OR target entity is in the set
    const relsSource = await txOrDb.select({ id: relationships.id })
      .from(relationships)
      .where(and(eq(relationships.caseId, caseId), inArray(relationships.sourceEntityId, entityIds)));
    const relsTarget = await txOrDb.select({ id: relationships.id })
      .from(relationships)
      .where(and(eq(relationships.caseId, caseId), inArray(relationships.targetEntityId, entityIds)));
    const relIdSet = new Set<number>();
    for (const r of relsSource) relIdSet.add(r.id);
    for (const r of relsTarget) relIdSet.add(r.id);
    relIds.push(...Array.from(relIdSet));

    if (relIds.length > 0) {
      const [re] = await txOrDb.select({ c: sql<number>`COUNT(*)` })
        .from(relationshipEvidence).where(inArray(relationshipEvidence.relationshipId, relIds));
      reCount = re.c;
    }
  }

  const [qCount] = await txOrDb.select({ c: sql<number>`COUNT(*)` })
    .from(quotes).where(eq(quotes.caseId, caseId));
  const [clCount] = await txOrDb.select({ c: sql<number>`COUNT(*)` })
    .from(claims).where(eq(claims.caseId, caseId));
  const [evCount] = await txOrDb.select({ c: sql<number>`COUNT(*)` })
    .from(events).where(eq(events.caseId, caseId));
  const [flCount] = await txOrDb.select({ c: sql<number>`COUNT(*)` })
    .from(signalFlags).where(eq(signalFlags.caseId, caseId));
  const [fiCount] = await txOrDb.select({ c: sql<number>`COUNT(*)` })
    .from(findings).where(eq(findings.caseId, caseId));
  const [corrCount] = await txOrDb.select({ c: sql<number>`COUNT(*)` })
    .from(documentCorrelations).where(eq(documentCorrelations.caseId, caseId));

  return {
    entityRoles: erCount,
    relationships: relIds.length,
    relationshipEvidence: reCount,
    quotes: qCount.c,
    claims: clCount.c,
    events: evCount.c,
    signalFlags: flCount.c,
    findings: fiCount.c,
    correlations: corrCount.c,
    _relIds: relIds, // internal: used by execute path
  };
}

// ─── A) Find Orphans ───
const findOrphans = adminProcedure.query(async ({ ctx }) => {
  const userCases = await db.select({ id: cases.id, name: cases.name })
    .from(cases)
    .where(eq(cases.userId, ctx.user.id));

  const orphanDetails: {
    caseId: number;
    caseName: string;
    entityCount: number;
    documentCount: number;
    entities: { id: number; name: string; type: string }[];
    dependentCounts: Omit<Awaited<ReturnType<typeof countDependents>>, "_relIds">;
  }[] = [];

  for (const c of userCases) {
    const [docCount] = await db.select({ c: sql<number>`COUNT(*)` })
      .from(documents).where(eq(documents.caseId, c.id));
    const [entCount] = await db.select({ c: sql<number>`COUNT(*)` })
      .from(entities).where(eq(entities.caseId, c.id));

    if (entCount.c > 0 && docCount.c === 0) {
      const ents = await selectEntities(db, c.id);
      const entityIds = ents.map(e => e.id);
      const deps = await countDependents(db, c.id, entityIds);
      const { _relIds, ...dependentCounts } = deps;

      orphanDetails.push({
        caseId: c.id,
        caseName: c.name,
        entityCount: entCount.c,
        documentCount: docCount.c,
        entities: ents,
        dependentCounts,
      });
    }
  }

  return {
    mismatchedCases: orphanDetails.length,
    orphanDetails,
  };
});

// ─── B) Move Entities ───
const moveEntities = adminProcedure
  .input(z.object({
    sourceCaseId: z.number(),
    targetCaseId: z.number(),
    entityIds: z.array(z.number()).optional(),
    dryRun: z.boolean().default(true),
  }))
  .mutation(async ({ ctx, input }) => {
    const { sourceCaseId, targetCaseId, dryRun } = input;

    // Validate both cases exist and are owned by this user
    const [sourceCase] = await db.select({ id: cases.id, name: cases.name })
      .from(cases).where(and(eq(cases.id, sourceCaseId), eq(cases.userId, ctx.user.id)));
    if (!sourceCase) throw new Error("Source case not found or not owned by you");

    const [targetCase] = await db.select({ id: cases.id, name: cases.name })
      .from(cases).where(and(eq(cases.id, targetCaseId), eq(cases.userId, ctx.user.id)));
    if (!targetCase) throw new Error("Target case not found or not owned by you");

    if (sourceCaseId === targetCaseId) throw new Error("Source and target case must be different");

    // Shared selection — identical for dry-run and execute
    const entitiesToMove = await selectEntities(db, sourceCaseId, input.entityIds);

    if (entitiesToMove.length === 0) {
      return { dryRun, moved: 0, entities: [], dependentMoves: {}, sourceCaseName: sourceCase.name, targetCaseName: targetCase.name };
    }

    const entityIds = entitiesToMove.map(e => e.id);
    const deps = await countDependents(db, sourceCaseId, entityIds);
    const { _relIds: relIds, ...dependentMoves } = deps;

    if (dryRun) {
      return {
        dryRun: true,
        moved: entitiesToMove.length,
        entities: entitiesToMove,
        sourceCaseName: sourceCase.name,
        targetCaseName: targetCase.name,
        dependentMoves,
      };
    }

    // ── Execute move inside transaction ──
    await db.transaction(async (tx) => {
      // 1. Move entities
      await tx.update(entities).set({ caseId: targetCaseId })
        .where(inArray(entities.id, entityIds));

      // 2. Move relationships (where either source or target entity is being moved)
      if (relIds.length > 0) {
        await tx.update(relationships).set({ caseId: targetCaseId })
          .where(inArray(relationships.id, relIds));
      }

      // 3. Move case-level data
      if (dependentMoves.quotes > 0) {
        await tx.update(quotes).set({ caseId: targetCaseId })
          .where(eq(quotes.caseId, sourceCaseId));
      }
      if (dependentMoves.claims > 0) {
        await tx.update(claims).set({ caseId: targetCaseId })
          .where(eq(claims.caseId, sourceCaseId));
      }
      if (dependentMoves.events > 0) {
        await tx.update(events).set({ caseId: targetCaseId })
          .where(eq(events.caseId, sourceCaseId));
      }
      if (dependentMoves.signalFlags > 0) {
        await tx.update(signalFlags).set({ caseId: targetCaseId })
          .where(eq(signalFlags.caseId, sourceCaseId));
      }
      if (dependentMoves.findings > 0) {
        await tx.update(findings).set({ caseId: targetCaseId })
          .where(eq(findings.caseId, sourceCaseId));
      }
      if (dependentMoves.correlations > 0) {
        await tx.update(documentCorrelations).set({ caseId: targetCaseId })
          .where(eq(documentCorrelations.caseId, sourceCaseId));
      }
    });

    // Audit log (outside transaction — the move succeeded if we reach here)
    await logAudit({
      caseId: sourceCaseId,
      userId: ctx.user.id,
      action: "case_repair_move",
      targetType: "entity",
      details: {
        sourceCaseId,
        targetCaseId,
        sourceCaseName: sourceCase.name,
        targetCaseName: targetCase.name,
        entityCount: entitiesToMove.length,
        entityIds,
        dependentMoves,
        dryRun: false,
      },
    });

    return {
      dryRun: false,
      moved: entitiesToMove.length,
      entities: entitiesToMove,
      sourceCaseName: sourceCase.name,
      targetCaseName: targetCase.name,
      dependentMoves,
    };
  });

// ─── C) Purge Entities ───
const purgeEntities = adminProcedure
  .input(z.object({
    caseId: z.number(),
    entityIds: z.array(z.number()).optional(),
    dryRun: z.boolean().default(true),
  }))
  .mutation(async ({ ctx, input }) => {
    const { caseId, dryRun } = input;

    // Validate case exists and is owned by user
    const [caseRow] = await db.select({ id: cases.id, name: cases.name })
      .from(cases).where(and(eq(cases.id, caseId), eq(cases.userId, ctx.user.id)));
    if (!caseRow) throw new Error("Case not found or not owned by you");

    // Purge guardrail: doc_count must be 0
    const [docCount] = await db.select({ c: sql<number>`COUNT(*)` })
      .from(documents).where(eq(documents.caseId, caseId));
    if (docCount.c > 0) {
      throw new Error(`Cannot purge: case has ${docCount.c} documents. Purge is only allowed on cases with 0 documents.`);
    }

    // Shared selection — identical for dry-run and execute
    const entitiesToPurge = await selectEntities(db, caseId, input.entityIds);

    if (entitiesToPurge.length === 0) {
      return { dryRun, purged: 0, entities: [], dependentDeletes: {}, caseName: caseRow.name };
    }

    const entityIds = entitiesToPurge.map(e => e.id);
    const deps = await countDependents(db, caseId, entityIds);
    const { _relIds: relIds, ...dependentDeletes } = deps;

    if (dryRun) {
      return {
        dryRun: true,
        purged: entitiesToPurge.length,
        entities: entitiesToPurge,
        caseName: caseRow.name,
        dependentDeletes,
      };
    }

    // ── Execute purge inside transaction (leaf → root) ──
    await db.transaction(async (tx) => {
      // 1. Relationship evidence (leaf)
      if (relIds.length > 0) {
        await tx.delete(relationshipEvidence).where(inArray(relationshipEvidence.relationshipId, relIds));
      }
      // 2. Relationships
      await tx.delete(relationships).where(eq(relationships.caseId, caseId));
      // 3. Entity roles
      if (entityIds.length > 0) {
        await tx.delete(entityRoles).where(inArray(entityRoles.entityId, entityIds));
      }
      // 4. Signal flags
      await tx.delete(signalFlags).where(eq(signalFlags.caseId, caseId));
      // 5. Claims
      await tx.delete(claims).where(eq(claims.caseId, caseId));
      // 6. Findings
      await tx.delete(findings).where(eq(findings.caseId, caseId));
      // 7. Events
      await tx.delete(events).where(eq(events.caseId, caseId));
      // 8. Correlations
      await tx.delete(documentCorrelations).where(eq(documentCorrelations.caseId, caseId));
      // 9. Quotes
      await tx.delete(quotes).where(eq(quotes.caseId, caseId));
      // 10. Entities (root)
      await tx.delete(entities).where(inArray(entities.id, entityIds));
    });

    // Audit log (outside transaction — purge succeeded if we reach here)
    await logAudit({
      caseId,
      userId: ctx.user.id,
      action: "case_repair_purge",
      targetType: "entity",
      details: {
        caseId,
        caseName: caseRow.name,
        entityCount: entitiesToPurge.length,
        entityIds,
        dependentDeletes,
        dryRun: false,
      },
    });

    return {
      dryRun: false,
      purged: entitiesToPurge.length,
      entities: entitiesToPurge,
      caseName: caseRow.name,
      dependentDeletes,
    };
  });

// ─── Export Router ───
export const caseRepairRouter = router({
  findOrphans,
  moveEntities,
  purgeEntities,
});



// ============================================================
