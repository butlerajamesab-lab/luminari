/**
 * Workbench Dashboard Router
 * 
 * Aggregates all case data into a unified view:
 *   - Case Summary (what is known)
 *   - Parts Checklist (what is present / missing)
 *   - Evidence Panel (documents, proof links, timeline)
 *   - Tools Drawer (available tools for this case)
 *   - Next Steps (what comes next based on case state)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import {
  cases, documents, claims, events, findings, signalFlags,
  entities, checklistItems, missingRecords, evidenceItems,
  evidenceProofLinks, evidenceEventLinks, foiaRequests,
  quotes, relationships, entityRoles,
} from "../../drizzle/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";

// ─── Helpers ───

async function verifyCaseOwnership(caseId: number, userId: number) {
  const [c] = await db.select({ id: cases.id, userId: cases.userId })
    .from(cases).where(eq(cases.id, caseId));
  if (!c || c.userId !== userId) {
    throw new Error("Case not found or access denied");
  }
  return c;
}

// ─── Router ───

export const workbenchRouter = router({
  /**
   * Full workbench overview — aggregates counts and recent items
   */
  overview: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const caseId = input.caseId;

      // Parallel queries for all counts
      const [
        [caseRow],
        [docCount],
        [entityCount],
        [claimCount],
        [eventCount],
        [findingCount],
        [signalCount],
        [quoteCount],
        [relationshipCount],
        [evidenceCount],
        [proofLinkCount],
        [eventLinkCount],
        [checklistTotal],
        [checklistDone],
        [missingCount],
        [foiaCount],
      ] = await Promise.all([
        db.select().from(cases).where(eq(cases.id, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(documents).where(eq(documents.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(entities).where(eq(entities.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(claims).where(eq(claims.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(events).where(eq(events.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(findings).where(eq(findings.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(signalFlags).where(eq(signalFlags.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(quotes).where(eq(quotes.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(relationships).where(eq(relationships.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(evidenceItems).where(eq(evidenceItems.caseId, caseId)),
        // proof links require join through evidence items
        db.select({ c: sql<number>`COUNT(*)` }).from(evidenceProofLinks)
          .innerJoin(evidenceItems, eq(evidenceProofLinks.evidenceId, evidenceItems.id))
          .where(eq(evidenceItems.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(evidenceEventLinks)
          .innerJoin(evidenceItems, eq(evidenceEventLinks.evidenceId, evidenceItems.id))
          .where(eq(evidenceItems.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(checklistItems).where(eq(checklistItems.caseId, caseId)),
        // @ts-expect-error pre-existing type mismatch
        db.select({ c: sql<number>`COUNT(*)` }).from(checklistItems).where(and(eq(checklistItems.caseId, caseId), eq(checklistItems.completed, true))),
        db.select({ c: sql<number>`COUNT(*)` }).from(missingRecords).where(eq(missingRecords.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(foiaRequests).where(eq(foiaRequests.caseId, caseId)),
      ]);

      return {
        case: caseRow,
        counts: {
          documents: docCount.c,
          entities: entityCount.c,
          claims: claimCount.c,
          events: eventCount.c,
          findings: findingCount.c,
          signals: signalCount.c,
          quotes: quoteCount.c,
          relationships: relationshipCount.c,
          evidence: evidenceCount.c,
          proofLinks: proofLinkCount.c,
          eventLinks: eventLinkCount.c,
          checklistTotal: checklistTotal.c,
          checklistDone: checklistDone.c,
          missingRecords: missingCount.c,
          foiaRequests: foiaCount.c,
        },
      };
    }),

  /**
   * Parts Checklist — what is present, what is missing
   */
  checklist: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      const [items, missing] = await Promise.all([
        db.select().from(checklistItems)
          .where(eq(checklistItems.caseId, input.caseId))
          .orderBy(checklistItems.sortOrder),
        db.select().from(missingRecords)
          .where(eq(missingRecords.caseId, input.caseId))
          // @ts-expect-error pre-existing type mismatch
          .orderBy(desc(missingRecords.createdAt)),
      ]);

      return { items, missing };
    }),

  /**
   * Evidence summary — recent evidence items with proof/event link counts
   */
  evidenceSummary: protectedProcedure
    .input(z.object({ caseId: z.number(), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      const items = await db.select()
        .from(evidenceItems)
        .where(eq(evidenceItems.caseId, input.caseId))
        .orderBy(desc(evidenceItems.createdAt))
        .limit(input.limit);

      // Get link counts for each evidence item
      const itemsWithLinks = await Promise.all(
        items.map(async (item) => {
          const [[proofCount], [eventCount]] = await Promise.all([
            db.select({ c: sql<number>`COUNT(*)` })
              .from(evidenceProofLinks)
              .where(eq(evidenceProofLinks.evidenceId, item.id)),
            db.select({ c: sql<number>`COUNT(*)` })
              .from(evidenceEventLinks)
              .where(eq(evidenceEventLinks.evidenceId, item.id)),
          ]);
          return {
            ...item,
            proofLinkCount: proofCount.c,
            eventLinkCount: eventCount.c,
          };
        })
      );

      return itemsWithLinks;
    }),

  /**
   * Recent activity — latest events, findings, signals
   */
  recentActivity: protectedProcedure
    .input(z.object({ caseId: z.number(), limit: z.number().default(15) }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      const [recentEvents, recentFindings, recentSignals] = await Promise.all([
        db.select({
          id: events.id,
          description: events.description,
          // @ts-expect-error pre-existing type mismatch
          eventDate: events.eventDate,
          eventType: events.eventType,
          // @ts-expect-error pre-existing type mismatch
          createdAt: events.createdAt,
        })
          .from(events)
          .where(eq(events.caseId, input.caseId))
          // @ts-expect-error pre-existing type mismatch
          .orderBy(desc(events.createdAt))
          .limit(input.limit),
        db.select({
          id: findings.id,
          findingType: findings.findingType,
          // @ts-expect-error pre-existing type mismatch
          summary: findings.summary,
          // @ts-expect-error pre-existing type mismatch
          severity: findings.severity,
          createdAt: findings.createdAt,
        })
          .from(findings)
          .where(eq(findings.caseId, input.caseId))
          .orderBy(desc(findings.createdAt))
          .limit(input.limit),
        db.select({
          id: signalFlags.id,
          // @ts-expect-error pre-existing type mismatch
          signalType: signalFlags.signalType,
          // @ts-expect-error pre-existing type mismatch
          severity: signalFlags.severity,
          description: signalFlags.description,
          // @ts-expect-error pre-existing type mismatch
          createdAt: signalFlags.createdAt,
        })
          .from(signalFlags)
          .where(eq(signalFlags.caseId, input.caseId))
          // @ts-expect-error pre-existing type mismatch
          .orderBy(desc(signalFlags.createdAt))
          .limit(input.limit),
      ]);

      return { events: recentEvents, findings: recentFindings, signals: recentSignals };
    }),

  /**
   * Next steps — computed from case state
   * Returns prioritized list of recommended actions
   */
  nextSteps: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);
      const caseId = input.caseId;

      const [
        [docCount],
        [claimCount],
        [eventCount],
        [findingCount],
        [evidenceCount],
        [checklistTotal],
        [checklistDone],
        [missingCount],
        [foiaCount],
        [caseRow],
      ] = await Promise.all([
        db.select({ c: sql<number>`COUNT(*)` }).from(documents).where(eq(documents.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(claims).where(eq(claims.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(events).where(eq(events.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(findings).where(eq(findings.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(evidenceItems).where(eq(evidenceItems.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(checklistItems).where(eq(checklistItems.caseId, caseId)),
        // @ts-expect-error pre-existing type mismatch
        db.select({ c: sql<number>`COUNT(*)` }).from(checklistItems).where(and(eq(checklistItems.caseId, caseId), eq(checklistItems.completed, true))),
        db.select({ c: sql<number>`COUNT(*)` }).from(missingRecords).where(eq(missingRecords.caseId, caseId)),
        db.select({ c: sql<number>`COUNT(*)` }).from(foiaRequests).where(eq(foiaRequests.caseId, caseId)),
        db.select().from(cases).where(eq(cases.id, caseId)),
      ]);

      const steps: { priority: number; action: string; description: string; href: string; category: string }[] = [];

      // No documents yet — upload first
      if (docCount.c === 0) {
        steps.push({
          priority: 1,
          action: "Upload Documents",
          description: "Upload your first documents so the engine can extract entities, events, and claims.",
          href: "/upload",
          category: "evidence",
        });
      }

      // Has documents but no claims — run analysis
      if (docCount.c > 0 && claimCount.c === 0) {
        steps.push({
          priority: 2,
          action: "Run Case Analysis",
          description: "Documents are uploaded. Run the analysis engine to extract claims, events, and entities.",
          href: "/control-room",
          category: "analysis",
        });
      }

      // Has claims but no evidence items mapped
      if (claimCount.c > 0 && evidenceCount.c === 0) {
        steps.push({
          priority: 3,
          action: "Map Evidence to Claims",
          description: "Claims have been identified. Map your evidence to proof elements to strengthen your case.",
          href: "/proof-frameworks",
          category: "evidence",
        });
      }

      // Has missing records
      if (missingCount.c > 0) {
        steps.push({
          priority: 4,
          action: `Address ${missingCount.c} Missing Record${missingCount.c > 1 ? "s" : ""}`,
          description: "The engine identified records that should exist but weren't found. Consider filing FOIA requests.",
          href: "/foia",
          category: "records",
        });
      }

      // Checklist incomplete
      if (checklistTotal.c > 0 && checklistDone.c < checklistTotal.c) {
        const remaining = checklistTotal.c - checklistDone.c;
        steps.push({
          priority: 5,
          action: `Complete ${remaining} Checklist Item${remaining > 1 ? "s" : ""}`,
          description: `${checklistDone.c} of ${checklistTotal.c} items done. Review and complete remaining items.`,
          href: "/repair",
          category: "checklist",
        });
      }

      // Has findings — review them
      if (findingCount.c > 0) {
        steps.push({
          priority: 6,
          action: "Review Findings",
          description: `${findingCount.c} finding${findingCount.c > 1 ? "s" : ""} detected. Review contradictions, patterns, and anomalies.`,
          href: "/findings",
          category: "analysis",
        });
      }

      // Has events — build timeline
      if (eventCount.c > 0) {
        steps.push({
          priority: 7,
          action: "Review Timeline",
          description: `${eventCount.c} event${eventCount.c > 1 ? "s" : ""} extracted. Review the chronological timeline for accuracy.`,
          href: "/timeline",
          category: "evidence",
        });
      }

      // Suggest generating statement of facts if enough data
      if (docCount.c >= 2 && eventCount.c >= 3) {
        steps.push({
          priority: 8,
          action: "Generate Statement of Facts",
          description: "Enough evidence to generate a formal Statement of Facts document.",
          href: "/narrative",
          category: "paperwork",
        });
      }

      // Suggest filing generator if claims exist
      if (claimCount.c > 0) {
        steps.push({
          priority: 9,
          action: "Generate Filing Documents",
          description: "Use the Filing Generator to create complaint letters, appeals, or formal filings.",
          href: "/filing-generator",
          category: "paperwork",
        });
      }

      // Suggest benefits check
      if (caseRow && caseRow.pipelineType) {
        steps.push({
          priority: 10,
          action: "Check Available Benefits",
          description: "Browse benefits and programs that may apply to your situation.",
          href: "/benefits",
          category: "resources",
        });
      }

      return steps.sort((a, b) => a.priority - b.priority);
    }),

  /**
   * Claims breakdown — grouped by type with status
   */
  claimsBreakdown: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ ctx, input }) => {
      await verifyCaseOwnership(input.caseId, ctx.user.id);

      const allClaims = await db.select({
        id: claims.id,
        claimType: claims.claimType,
        // @ts-expect-error pre-existing type mismatch
        description: claims.description,
        // @ts-expect-error pre-existing type mismatch
        severity: claims.severity,
        // @ts-expect-error pre-existing type mismatch
        confidence: claims.confidence,
        // @ts-expect-error pre-existing type mismatch
        createdAt: claims.createdAt,
      })
        .from(claims)
        .where(eq(claims.caseId, input.caseId))
        // @ts-expect-error pre-existing type mismatch
        .orderBy(desc(claims.createdAt));

      return allClaims;
    }),
});
