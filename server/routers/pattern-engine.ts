import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLMInteractive } from "../_core/llm";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { governedPatternStrategyBoost } from "../governance-hooks";
import {
  cases, entities, claims, findings,
  strategyMatterProfile, strategyClaimCandidates, strategyPaths,
  strategyFactMatrix,
  patternEntityClusters, patternConductClusters,
  patternOutcomeAnalytics, patternOutcomeDivergence,
  patternSystemicInferences, patternTemporalTrends,
  patternGeographicHotspots, patternIndustryProfiles,
  patternEvidenceCorrelations, patternDefenseStrategies,
  patternCaseLinks, patternAggregationRuns,
  patternFeedbackLoop,
} from "../../drizzle/schema";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";
import { buildOutputRefs } from "../output-refs";
import { writePatternResult, canonicalUpdate } from "../canonical-write-adapter";

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN AGGREGATION ENGINE — Cross-Case Analysis Pipeline
//
// P1. Cluster Entities across cases (repeat offenders)
// P2. Cluster Conduct types across cases
// P3. Detect Case Links (shared entities/conduct)
// P4. Generate Systemic Inferences
// P5. Apply Feedback Loop to Strategy Paths
// ═══════════════════════════════════════════════════════════════════════════

export const patternEngineRouter = router({

  // ─── P1: Cluster Entities ───────────────────────────────────────────
  clusterEntities: protectedProcedure
    .input(z.object({ caseIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      // Get all entities, optionally filtered by case IDs
      let allEntities;
      if (input.caseIds && input.caseIds.length > 0) {
        allEntities = [];
        for (const caseId of input.caseIds) {
          const ents = await db.select().from(entities).where(eq(entities.caseId, String(caseId)));
          allEntities.push(...ents);
        }
      } else {
        allEntities = await db.select().from(entities).limit(500);
      }

      if (allEntities.length === 0) return { clusters_created: 0, message: "No entities found." };

      const entitySummary = allEntities.slice(0, 100).map((e: any) =>
        `${e.id}|case:${e.caseId}|${e.name}|${e.type}|${e.description?.slice(0, 60) ?? ""}`
      ).join("\n");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a pattern detection engine. Group entities that appear to be the same real-world entity across different cases. Return JSON:
{"clusters":[{
  "entityName": "canonical name",
  "entityType": "person|organization|government_agency",
  "aliases": ["variant names"],
  "caseIds": [case IDs where this entity appears],
  "jurisdictions": ["jurisdictions involved"],
  "claimTypes": ["claim types associated"],
  "riskScore": number (0.00-1.00, higher = more cases/risk),
  "notes": "brief description"
}]}
Only create clusters for entities appearing in 2+ cases or with notable risk indicators.`
          },
          { role: "user", content: `Entities:\n${entitySummary}` }
        ],
        response_format: { type: "json_object" },
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content : "";
      let clusters: any[];
      try {
        const parsed = JSON.parse(content);
        clusters = Array.isArray(parsed) ? parsed : (parsed.clusters ?? []);
      } catch { clusters = []; }

      let created = 0;
      for (const c of clusters) {
        await db.insert(patternEntityClusters).values({
          entityName: c.entityName ?? "Unknown",
          entityType: c.entityType ?? null,
          aliases: c.aliases ?? [],
          caseIds: c.caseIds ?? [],
          caseCount: (c.caseIds ?? []).length,
          firstSeen: now,
          lastSeen: now,
          jurisdictions: c.jurisdictions ?? [],
          claimTypes: c.claimTypes ?? [],
          riskScore: String(c.riskScore ?? 0),
          notes: c.notes ?? null,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }

      return { clusters_created: created };
    }),

  // ─── P2: Cluster Conduct ────────────────────────────────────────────
  clusterConduct: protectedProcedure
    .input(z.object({ caseIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      let allClaims;
      if (input.caseIds && input.caseIds.length > 0) {
        allClaims = [];
        for (const caseId of input.caseIds) {
          const cls = await db.select().from(claims).where(eq(claims.caseId, String(caseId)));
          allClaims.push(...cls);
        }
      } else {
        allClaims = await db.select().from(claims).limit(500);
      }

      if (allClaims.length === 0) return { clusters_created: 0, message: "No claims found." };

      const claimSummary = allClaims.slice(0, 80).map((c: any) =>
        `case:${c.caseId}|${c.claimType}|${c.claimText?.slice(0, 100) ?? ""}`
      ).join("\n");

      const entityClusters = await db.select().from(patternEntityClusters);
      const entityRef = entityClusters.map((e: any) => `${e.id}. ${e.entityName} (${e.caseCount} cases)`).join(", ");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a conduct pattern detector. Group similar types of misconduct across cases. Return JSON:
{"clusters":[{
  "conductType": "descriptive name for the conduct pattern",
  "conductCategory": "discrimination|retaliation|harassment|wage_theft|policy_violation|fraud|negligence|other",
  "description": "description of the pattern",
  "caseIds": [case IDs],
  "entityClusterIds": [entity cluster IDs involved],
  "commonElements": ["common legal elements"],
  "frequencyScore": number (0.00-1.00),
  "severityScore": number (0.00-1.00)
}]}
Focus on patterns that repeat across multiple cases.`
          },
          {
            role: "user",
            content: `Claims:\n${claimSummary}\n\nEntity Clusters: ${entityRef}`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content : "";
      let clusters: any[];
      try {
        const parsed = JSON.parse(content);
        clusters = Array.isArray(parsed) ? parsed : (parsed.clusters ?? []);
      } catch { clusters = []; }

      let created = 0;
      for (const c of clusters) {
        await db.insert(patternConductClusters).values({
          conductType: c.conductType ?? "Unknown",
          conductCategory: c.conductCategory ?? null,
          description: c.description ?? null,
          caseIds: c.caseIds ?? [],
          caseCount: (c.caseIds ?? []).length,
          entityClusterIds: c.entityClusterIds ?? [],
          commonElements: c.commonElements ?? [],
          frequencyScore: String(c.frequencyScore ?? 0),
          severityScore: String(c.severityScore ?? 0),
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }

      return { clusters_created: created };
    }),

  // ─── P3: Detect Case Links ─────────────────────────────────────────
  detectCaseLinks: protectedProcedure
    .input(z.object({ caseIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const entityClusters = await db.select().from(patternEntityClusters);
      const conductClusters = await db.select().from(patternConductClusters);

      const links: Array<{ caseIdA: number; caseIdB: number; sharedEntities: number[]; sharedConduct: number[]; score: number }> = [];

      // Find case pairs sharing entity clusters
      for (const ec of entityClusters) {
        const caseIdsArr = (ec.caseIds as number[]) ?? [];
        for (let i = 0; i < caseIdsArr.length; i++) {
          for (let j = i + 1; j < caseIdsArr.length; j++) {
            const key = `${caseIdsArr[i]}-${caseIdsArr[j]}`;
            let existing = links.find(l => l.caseIdA === caseIdsArr[i] && l.caseIdB === caseIdsArr[j]);
            if (!existing) {
              existing = { caseIdA: caseIdsArr[i], caseIdB: caseIdsArr[j], sharedEntities: [], sharedConduct: [], score: 0 };
              links.push(existing);
            }
            existing.sharedEntities.push(ec.id);
            existing.score += 0.3;
          }
        }
      }

      // Add conduct cluster links
      for (const cc of conductClusters) {
        const caseIdsArr = (cc.caseIds as number[]) ?? [];
        for (let i = 0; i < caseIdsArr.length; i++) {
          for (let j = i + 1; j < caseIdsArr.length; j++) {
            let existing = links.find(l => l.caseIdA === caseIdsArr[i] && l.caseIdB === caseIdsArr[j]);
            if (!existing) {
              existing = { caseIdA: caseIdsArr[i], caseIdB: caseIdsArr[j], sharedEntities: [], sharedConduct: [], score: 0 };
              links.push(existing);
            }
            existing.sharedConduct.push(cc.id);
            existing.score += 0.2;
          }
        }
      }

      let created = 0;
      for (const link of links) {
        const linkType = link.sharedEntities.length > 0 && link.sharedConduct.length > 0
          ? "entity_and_conduct" : link.sharedEntities.length > 0 ? "shared_entity" : "shared_conduct";

        await db.insert(patternCaseLinks).values({
          caseIdA: link.caseIdA,
          caseIdB: link.caseIdB,
          linkType,
          sharedEntityClusterIds: link.sharedEntities,
          sharedConductClusterIds: link.sharedConduct,
          similarityScore: String(Math.min(link.score, 1)),
          createdAt: now,
        });
        created++;
      }

      return { links_created: created };
    }),

  // ─── P4: Generate Systemic Inferences ───────────────────────────────
  generateSystemicInferences: protectedProcedure
    .mutation(async () => {
      const now = Date.now();
      const entityClusters = await db.select().from(patternEntityClusters);
      const conductClusters = await db.select().from(patternConductClusters);
      const caseLinks = await db.select().from(patternCaseLinks);

      if (entityClusters.length === 0 && conductClusters.length === 0) {
        return { inferences_generated: 0, message: "No clusters found. Run P1 and P2 first." };
      }

      const ecSummary = entityClusters.map((e: any) =>
        `Entity: ${e.entityName} (${e.caseCount} cases, risk: ${e.riskScore})`
      ).join("\n");

      const ccSummary = conductClusters.map((c: any) =>
        `Conduct: ${c.conductType} (${c.caseCount} cases, severity: ${c.severityScore})`
      ).join("\n");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a systemic pattern analyst. Given entity and conduct clusters from multiple cases, generate systemic inferences about patterns of misconduct. Return JSON:
{"inferences":[{
  "inferenceType": "repeat_offender|systemic_policy|industry_pattern|geographic_cluster|temporal_escalation",
  "description": "detailed description of the systemic inference",
  "entityClusterIds": [relevant entity cluster IDs],
  "conductClusterIds": [relevant conduct cluster IDs],
  "evidenceStrength": "strong|moderate|preliminary",
  "confidenceScore": number (0.00-1.00),
  "legalImplications": "what this means legally",
  "recommendedActions": ["recommended next steps"]
}]}
Focus on actionable inferences that strengthen individual cases.`
          },
          {
            role: "user",
            content: `Entity Clusters:\n${ecSummary}\n\nConduct Clusters:\n${ccSummary}\n\nCase Links: ${caseLinks.length} connections found`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content : "";
      let inferences: any[];
      try {
        const parsed = JSON.parse(content);
        inferences = Array.isArray(parsed) ? parsed : (parsed.inferences ?? []);
      } catch { inferences = []; }

      let created = 0;
      for (const inf of inferences) {
        await db.insert(patternSystemicInferences).values({
          inferenceType: inf.inferenceType ?? "systemic_policy",
          description: inf.description ?? "",
          entityClusterIds: inf.entityClusterIds ?? [],
          conductClusterIds: inf.conductClusterIds ?? [],
          supportingCaseIds: [],
          evidenceStrength: inf.evidenceStrength ?? "preliminary",
          confidenceScore: String(inf.confidenceScore ?? 0),
          legalImplications: inf.legalImplications ?? null,
          recommendedActions: inf.recommendedActions ?? [],
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }

      return { inferences_generated: created };
    }),

  // ─── P5: Apply Feedback Loop ────────────────────────────────────────
  applyFeedbackLoop: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      // Get strategy paths for this case
      const paths = await db.select().from(strategyPaths)
        .where(eq(strategyPaths.caseId, String(input.caseId)));

      if (paths.length === 0) return { feedback_applied: 0, message: "No strategy paths found." };

      // Get relevant pattern data
      const entityClusters = await db.select().from(patternEntityClusters);
      const conductClusters = await db.select().from(patternConductClusters);
      const outcomeData = await db.select().from(patternOutcomeAnalytics);
      const inferences = await db.select().from(patternSystemicInferences);

      let feedbackApplied = 0;
      for (const path of paths) {
        // Find relevant entity clusters (matching case)
        const relevantEntities = entityClusters.filter((ec: any) =>
          ((ec.caseIds as number[]) ?? []).includes(input.caseId)
        );
        const relevantConduct = conductClusters.filter((cc: any) =>
          ((cc.caseIds as number[]) ?? []).includes(input.caseId)
        );

        if (relevantEntities.length === 0 && relevantConduct.length === 0) continue;

        // Calculate pattern confidence boost
        const entityBoost = relevantEntities.reduce((sum: any, e: any) => sum + (e.caseCount ?? 0) * 0.05, 0);
        const conductBoost = relevantConduct.reduce((sum: any, c: any) => sum + parseFloat(String(c.severityScore ?? 0)) * 0.1, 0);
        const totalBoost = Math.min(entityBoost + conductBoost, 0.20);

        // GOVERNED: Strategy path pattern boost is a control-plane decision
        const patternNotes = `Pattern analysis: ${relevantEntities.length} entity clusters, ${relevantConduct.length} conduct clusters. Confidence boost: +${(totalBoost * 100).toFixed(1)}%`;
        await governedPatternStrategyBoost({
          pathId: path.id,
          patternEntityClusterId: relevantEntities[0]?.id ?? null,
          patternConductClusterId: relevantConduct[0]?.id ?? null,
          patternConfidence: String(totalBoost),
          patternNotes,
          rationale: `Pattern feedback loop applied to strategy path ${path.id} for case ${input.caseId} — ${patternNotes}`,
          actorId: "SYSTEM:pattern-engine",
          actorRole: "engine",
        });

        // Record feedback loop entry
        await db.insert(patternFeedbackLoop).values({
          strategyPathId: path.id,
          entityClusterId: relevantEntities[0]?.id ?? null,
          conductClusterId: relevantConduct[0]?.id ?? null,
          outcomeAnalyticsId: outcomeData[0]?.id ?? null,
          systemicInferenceId: inferences[0]?.id ?? null,
          feedbackType: "pattern_boost",
          adjustmentApplied: `+${(totalBoost * 100).toFixed(1)}% confidence from ${relevantEntities.length} entity + ${relevantConduct.length} conduct clusters`,
          confidenceDelta: String(totalBoost),
          appliedAt: now,
          createdAt: now,
        });
        feedbackApplied++;
      }

      return { feedbackApplied };
    }),

  // ─── Full Pattern Run ───────────────────────────────────────────────
  runFullAggregation: protectedProcedure
    .input(z.object({ caseIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      return withEngineTracking({
        engineId: ENGINE_IDS.PATTERN,
        caseId: 0, // cross-case aggregation
        runType: "pattern_only",
        extractOutputRefs: async (r: any, runId: string) => {
          if (!r?.canonicalEntity) throw new Error('[pattern-engine] No canonical entity produced');
          return buildOutputRefs({
            engineId: ENGINE_IDS.PATTERN,
            runId,
            primary: r.canonicalEntity,
            artifacts: [],
            traceParts: ['cross_case', ENGINE_IDS.PATTERN, String(r.canonicalEntity.id)],
          });
        },
      }, async () => {
        // Write to canonical_pattern_registry — NO legacy table writes
        const canonicalEntity = await writePatternResult({
          name: `Pattern Aggregation: ${(input.caseIds ?? []).join(',')}`,
          description: `Cross-case pattern aggregation for cases: ${(input.caseIds ?? []).join(', ')}`,
          patternType: 'full_aggregation',
          domains: [],
          indicators: [],
          confidence: 0,
          sourceEngineId: ENGINE_IDS.PATTERN,
        });
        try {
          await canonicalUpdate('canonical_pattern_registry', canonicalEntity.id, {
            confidence: 1.0,
          });
          return {
            canonicalEntity,
            message: 'Pattern aggregation initialized in canonical_pattern_registry.',
          };
        } catch (err: any) {
          await canonicalUpdate('canonical_pattern_registry', canonicalEntity.id, {
            description: `FAILED: ${err.message}`,
            confidence: 0,
          });
          throw err;
        }
      });
    }),

  // ─── Read Endpoints ─────────────────────────────────────────────────
  getEntityClusters: protectedProcedure
    .query(async () => {
      return db.select().from(patternEntityClusters)
        .orderBy(desc(patternEntityClusters.caseCount));
    }),

  getConductClusters: protectedProcedure
    .query(async () => {
      return db.select().from(patternConductClusters)
        .orderBy(desc(patternConductClusters.caseCount));
    }),

  getOutcomeAnalytics: protectedProcedure
    .input(z.object({ claimType: z.string().optional() }))
    .query(async ({ input }) => {
      if (input.claimType) {
        return db.select().from(patternOutcomeAnalytics)
          .where(eq(patternOutcomeAnalytics.claimType, input.claimType));
      }
      return db.select().from(patternOutcomeAnalytics);
    }),

  getOutcomeDivergence: protectedProcedure
    .input(z.object({ claimType: z.string().optional() }))
    .query(async ({ input }) => {
      if (input.claimType) {
        return db.select().from(patternOutcomeDivergence)
          .where(eq(patternOutcomeDivergence.claimType, input.claimType));
      }
      return db.select().from(patternOutcomeDivergence);
    }),

  getSystemicInferences: protectedProcedure
    .query(async () => {
      return db.select().from(patternSystemicInferences)
        .orderBy(desc(patternSystemicInferences.confidenceScore));
    }),

  getTemporalTrends: protectedProcedure
    .input(z.object({ claimType: z.string().optional() }))
    .query(async ({ input }) => {
      if (input.claimType) {
        return db.select().from(patternTemporalTrends)
          .where(eq(patternTemporalTrends.claimType, input.claimType));
      }
      return db.select().from(patternTemporalTrends);
    }),

  getGeographicHotspots: protectedProcedure
    .query(async () => {
      return db.select().from(patternGeographicHotspots)
        .orderBy(desc(patternGeographicHotspots.densityScore));
    }),

  getIndustryProfiles: protectedProcedure
    .query(async () => {
      return db.select().from(patternIndustryProfiles);
    }),

  getEvidenceCorrelations: protectedProcedure
    .input(z.object({ claimType: z.string().optional() }))
    .query(async ({ input }) => {
      if (input.claimType) {
        return db.select().from(patternEvidenceCorrelations)
          .where(eq(patternEvidenceCorrelations.claimType, input.claimType));
      }
      return db.select().from(patternEvidenceCorrelations);
    }),

  getDefenseStrategies: protectedProcedure
    .input(z.object({ claimType: z.string().optional() }))
    .query(async ({ input }) => {
      if (input.claimType) {
        return db.select().from(patternDefenseStrategies)
          .where(eq(patternDefenseStrategies.claimType, input.claimType));
      }
      return db.select().from(patternDefenseStrategies);
    }),

  getCaseLinks: protectedProcedure
    .input(z.object({ caseId: z.number().optional() }))
    .query(async ({ input }) => {
      if (input.caseId) {
        return db.select().from(patternCaseLinks)
          .where(
            sql`${patternCaseLinks.caseIdA} = ${input.caseId} OR ${patternCaseLinks.caseIdB} = ${input.caseId}`
          );
      }
      return db.select().from(patternCaseLinks);
    }),

  getAggregationRuns: protectedProcedure
    .query(async () => {
      return db.select().from(patternAggregationRuns)
        .orderBy(desc(patternAggregationRuns.createdAt));
    }),

  getFeedbackLoop: protectedProcedure
    .input(z.object({ strategyPathId: z.number().optional() }))
    .query(async ({ input }) => {
      if (input.strategyPathId) {
        return db.select().from(patternFeedbackLoop)
          .where(eq(patternFeedbackLoop.strategyPathId, input.strategyPathId));
      }
      return db.select().from(patternFeedbackLoop)
        .orderBy(desc(patternFeedbackLoop.createdAt));
    }),
});
