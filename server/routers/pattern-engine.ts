import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
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
// P1. Cluster Entities across cases (Levenshtein name similarity)
// P2. Cluster Conduct types across cases (exact match grouping)
// P3. Detect Case Links (shared entities/conduct)
// P4. Generate Systemic Inferences (template-based)
// P5. Apply Feedback Loop to Strategy Paths
// ═══════════════════════════════════════════════════════════════════════════

// ─── String Helpers (from entity-dedup.ts pattern) ───

const TITLE_SUFFIXES = /\b(esq\.?|jr\.?|sr\.?|dr\.?|mr\.?|mrs\.?|ms\.?|ii|iii|iv)\b/gi;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(TITLE_SUFFIXES, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

function nameSimilar(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return false;
  return levenshtein(na, nb) / maxLen < 0.2;
}

export const patternEngineRouter = router({

  // ─── P1: Cluster Entities (Levenshtein similarity) ─────────────────
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

      // Group entities by name similarity using Levenshtein
      // Only create clusters for entities appearing in 2+ different cases
      const clusters: Array<{
        entityName: string;
        entityType: string;
        aliases: string[];
        caseIds: number[];
        jurisdictions: string[];
        claimTypes: string[];
        riskScore: number;
        notes: string;
      }> = [];

      const processed = new Set<number>();

      for (let i = 0; i < allEntities.length; i++) {
        if (processed.has(allEntities[i].id)) continue;

        const group = [allEntities[i]];
        processed.add(allEntities[i].id);

        for (let j = i + 1; j < allEntities.length; j++) {
          if (processed.has(allEntities[j].id)) continue;
          if (nameSimilar(allEntities[i].name, allEntities[j].name)) {
            group.push(allEntities[j]);
            processed.add(allEntities[j].id);
          }
        }

        // Only create cluster if entity appears in 2+ cases
        const uniqueCaseIds = Array.from(new Set(group.map((e: any) => Number(e.caseId))));
        if (uniqueCaseIds.length < 2) continue;

        // Pick canonical name (longest variant)
        const canonicalName = group.reduce((longest, e) =>
          e.name.length > longest.length ? e.name : longest, group[0].name);
        const aliases = Array.from(new Set(group.map(e => e.name).filter(n => n !== canonicalName)));
        const entityType = group[0].type || "unknown";

        // Risk score: more cases = higher risk
        const riskScore = Math.min(uniqueCaseIds.length * 0.15, 1.0);

        clusters.push({
          entityName: canonicalName,
          entityType,
          aliases,
          caseIds: uniqueCaseIds,
          jurisdictions: [],
          claimTypes: [],
          riskScore,
          notes: `Entity appears in ${uniqueCaseIds.length} cases with ${group.length} total mentions.`,
        });
      }

      let created = 0;
      for (const c of clusters) {
        await db.insert(patternEntityClusters).values({
          entityName: c.entityName,
          entityType: c.entityType,
          aliases: c.aliases,
          caseIds: c.caseIds,
          caseCount: c.caseIds.length,
          firstSeen: now,
          lastSeen: now,
          jurisdictions: c.jurisdictions,
          claimTypes: c.claimTypes,
          riskScore: String(c.riskScore),
          notes: c.notes,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }

      return { clusters_created: created };
    }),

  // ─── P2: Cluster Conduct (exact type match) ───────────────────────
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

      // Group by exact claimType match
      const conductGroups = new Map<string, { caseIds: Set<number>; claims: typeof allClaims }>();

      for (const claim of allClaims) {
        const conductType = (claim as any).claimType || "unknown";
        if (!conductGroups.has(conductType)) {
          conductGroups.set(conductType, { caseIds: new Set(), claims: [] });
        }
        const group = conductGroups.get(conductType)!;
        group.caseIds.add(Number((claim as any).caseId));
        group.claims.push(claim);
      }

      // Get entity clusters for reference
      const entityClusters = await db.select().from(patternEntityClusters);

      let created = 0;
      for (const [conductType, group] of Array.from(conductGroups.entries())) {
        // Only create cluster if conduct appears in 2+ cases
        if (group.caseIds.size < 2) continue;

        const caseIdsArr = Array.from(group.caseIds);

        // Find entity clusters that overlap with these cases
        const relatedEntityClusterIds = entityClusters
          .filter((ec: any) => {
            const ecCaseIds = (ec.caseIds as number[]) ?? [];
            return ecCaseIds.some(id => group.caseIds.has(id));
          })
          .map((ec: any) => ec.id);

        // Determine category from conductType
        const categoryMap: Record<string, string> = {
          housing_discrimination: "discrimination",
          employment_discrimination: "discrimination",
          wage_theft: "wage_theft",
          consumer_fraud: "fraud",
          debt_collection_abuse: "harassment",
          police_misconduct: "policy_violation",
          retaliation: "retaliation",
          harassment: "harassment",
        };
        const conductCategory = categoryMap[conductType] || "other";

        const frequencyScore = Math.min(group.claims.length * 0.05, 1.0);
        const severityScore = Math.min(caseIdsArr.length * 0.2, 1.0);

        await db.insert(patternConductClusters).values({
          conductType,
          conductCategory,
          description: `${conductType.replace(/_/g, " ")} pattern detected across ${caseIdsArr.length} cases with ${group.claims.length} total claims.`,
          caseIds: caseIdsArr,
          caseCount: caseIdsArr.length,
          entityClusterIds: relatedEntityClusterIds,
          commonElements: [],
          frequencyScore: String(frequencyScore),
          severityScore: String(severityScore),
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

  // ─── P4: Generate Systemic Inferences (template-based) ─────────────
  generateSystemicInferences: protectedProcedure
    .mutation(async () => {
      const now = Date.now();
      const entityClusters = await db.select().from(patternEntityClusters);
      const conductClusters = await db.select().from(patternConductClusters);
      const caseLinks = await db.select().from(patternCaseLinks);

      if (entityClusters.length === 0 && conductClusters.length === 0) {
        return { inferences_generated: 0, message: "No clusters found. Run P1 and P2 first." };
      }

      const inferences: Array<{
        inferenceType: string;
        description: string;
        entityClusterIds: number[];
        conductClusterIds: number[];
        evidenceStrength: string;
        confidenceScore: number;
        legalImplications: string;
        recommendedActions: string[];
      }> = [];

      // Generate inferences from entity clusters (repeat offenders)
      for (const ec of entityClusters) {
        const caseCount = ec.caseCount ?? 0;
        if (caseCount < 2) continue;

        const riskScore = parseFloat(String(ec.riskScore ?? 0));
        const confidenceScore = Math.min(riskScore + 0.2, 1.0);

        // Find conduct clusters that share cases with this entity
        const entityCaseIds = new Set((ec.caseIds as number[]) ?? []);
        const relatedConduct = conductClusters.filter((cc: any) => {
          const ccCaseIds = (cc.caseIds as number[]) ?? [];
          return ccCaseIds.some(id => entityCaseIds.has(id));
        });
        const conductTypes = relatedConduct.map((cc: any) => cc.conductType).join(", ");

        inferences.push({
          inferenceType: "repeat_offender",
          description: `Entity "${ec.entityName}" appears in ${caseCount} cases${conductTypes ? ` involving ${conductTypes}` : ""}. This pattern suggests systemic behavior.`,
          entityClusterIds: [ec.id],
          conductClusterIds: relatedConduct.map((cc: any) => cc.id),
          evidenceStrength: caseCount >= 4 ? "strong" : caseCount >= 3 ? "moderate" : "preliminary",
          confidenceScore,
          legalImplications: `Multiple cases against the same entity may support pattern-or-practice claims and strengthen individual cases through corroborating evidence.`,
          recommendedActions: [
            `Cross-reference evidence across all ${caseCount} cases involving ${ec.entityName}`,
            "Consider consolidated or class action approach",
            "Request discovery of internal policies and training materials",
          ],
        });
      }

      // Generate inferences from conduct clusters (systemic patterns)
      for (const cc of conductClusters) {
        const caseCount = cc.caseCount ?? 0;
        if (caseCount < 3) continue;

        const severityScore = parseFloat(String(cc.severityScore ?? 0));
        const confidenceScore = Math.min(severityScore + 0.1, 1.0);

        inferences.push({
          inferenceType: "systemic_policy",
          description: `${(cc.conductType || "Unknown conduct").replace(/_/g, " ")} pattern detected across ${caseCount} cases. This suggests a systemic policy or practice rather than isolated incidents.`,
          entityClusterIds: (cc.entityClusterIds as number[]) ?? [],
          conductClusterIds: [cc.id],
          evidenceStrength: caseCount >= 5 ? "strong" : caseCount >= 3 ? "moderate" : "preliminary",
          confidenceScore,
          legalImplications: `Systemic patterns of ${(cc.conductType || "misconduct").replace(/_/g, " ")} may support regulatory action, class certification, or pattern-or-practice litigation.`,
          recommendedActions: [
            `Document the pattern across all ${caseCount} affected cases`,
            "Identify common policies or practices enabling the conduct",
            "Consider regulatory complaint or legislative advocacy",
          ],
        });
      }

      let created = 0;
      for (const inf of inferences) {
        await db.insert(patternSystemicInferences).values({
          inferenceType: inf.inferenceType,
          description: inf.description,
          entityClusterIds: inf.entityClusterIds,
          conductClusterIds: inf.conductClusterIds,
          supportingCaseIds: [],
          evidenceStrength: inf.evidenceStrength,
          confidenceScore: String(inf.confidenceScore),
          legalImplications: inf.legalImplications,
          recommendedActions: inf.recommendedActions,
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
