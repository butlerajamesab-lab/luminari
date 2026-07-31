import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  cases, claims, quotes, findings, entities, events,
  strategyMatterProfile, strategyFactMatrix, strategyClaimCatalog,
  strategyClaimCandidates, strategyViabilityAssessment,
  strategyDeadlineEngine, strategyPaths, strategyForumRules,
  strategyElementFactLinks, strategyMissingEvidenceTasks,
  engineRuns,
} from "../../drizzle/schema";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";
import { buildOutputRefs } from "../output-refs";
import { writeStrategyWorkflow, canonicalUpdate } from "../canonical-write-adapter";

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY ENGINE — Computation Pipeline
//
// S1. Build Matter Profile    S2. Build Fact Matrix
// S3. Generate Claim Candidates   S4. Evaluate Viability
// S5. Compute Deadlines   S6. Link Elements to Facts
// S7. Identify Missing Evidence   S8. Generate Strategy Paths
// ═══════════════════════════════════════════════════════════════════════════

export const strategyEngineRouter = router({

  // ─── S1: Build Matter Profile ───────────────────────────────────────
  buildMatterProfile: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const [caseRow] = await db.select().from(cases).where(eq(cases.id, input.caseId));
      if (!caseRow) throw new Error("Case not found");

      const caseEntities = await db.select().from(entities).where(eq(entities.caseId, String(input.caseId)));
      const caseClaims = await db.select().from(claims).where(eq(claims.caseId, String(input.caseId)));
      const caseEvents = await db.select().from(events).where(eq(events.caseId, String(input.caseId)));

      // Deterministic matter profile extraction
      const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})\b/i;

      // jurisdiction: first government_agency entity's name, else "Unknown"
      const agencyEntity = caseEntities.find((e: any) => e.type === "government_agency");
      const jurisdiction = agencyEntity
        ? (agencyEntity.name ?? "Unknown")
        : "Unknown";

      // incidentDate: first event that has a date
      const firstEventWithDate = caseEvents.find((e: any) => e.eventDate || (e.description && DATE_RE.test(e.description)));
      let incidentDate: string | null = null;
      if (firstEventWithDate?.eventDate) {
        incidentDate = typeof firstEventWithDate.eventDate === "number"
          ? new Date(firstEventWithDate.eventDate).toISOString().split("T")[0]
          : String(firstEventWithDate.eventDate);
      } else if (firstEventWithDate?.description) {
        const m = firstEventWithDate.description.match(DATE_RE);
        if (m) incidentDate = m[0];
      }

      // opposingParties: entities that are org or person but not the claimant
      const opposingParties = caseEntities
        .filter((e: any) => e.type === "organization" || e.type === "person" || e.type === "corporation")
        .map((e: any) => e.name)
        .filter(Boolean);

      // keyFacts: top 5 claims by evidentiaryWeight (or first 5)
      const sortedClaims = [...caseClaims].sort((a: any, b: any) =>
        (parseFloat(String(b.evidentiaryWeight ?? 0)) - parseFloat(String(a.evidentiaryWeight ?? 0)))
      );
      const keyFacts = sortedClaims.slice(0, 5).map((c: any) => c.claimText ?? "").filter(Boolean);

      const domain = caseRow.domain ?? "general";
      const claimCount = caseClaims.length;
      const entityCount = caseEntities.length;

      const profile = {
        jurisdiction,
        domain,
        incidentDate,
        filingDeadline: null, // requires legal knowledge — mark as requires_review
        opposingParties,
        keyFacts,
        riskFactors: ["Filing deadline unknown", "Evidence gaps may exist"],
        statusSummary: `Case in ${domain} with ${claimCount} claims and ${entityCount} entities identified.`,
      };

      const [inserted] = await db.insert(strategyMatterProfile).values({
        caseId: input.caseId,
        jurisdiction: profile.jurisdiction ?? "Unknown",
        domain: profile.domain ?? caseRow.domain ?? null,
        incidentDate: profile.incidentDate ?? null,
        filingDeadline: profile.filingDeadline ?? null,
        opposingParties: profile.opposingParties ?? [],
        keyFacts: profile.keyFacts ?? [],
        riskFactors: profile.riskFactors ?? [],
        statusSummary: profile.statusSummary ?? "",
        createdAt: now,
        updatedAt: now,
      });

      return { matter_profile_id: inserted.insertId, profile };
    }),

  // ─── S2: Build Fact Matrix ──────────────────────────────────────────
  buildFactMatrix: protectedProcedure
    .input(z.object({ caseId: z.number(), matterProfileId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const caseQuotes = await db.select().from(quotes).where(eq(quotes.caseId, String(input.caseId)));
      const caseFindings = await db.select().from(findings).where(eq(findings.caseId, String(input.caseId)));
      const caseClaims = await db.select().from(claims).where(eq(claims.caseId, String(input.caseId)));

      const evidenceItems = [
        ...caseQuotes.slice(0, 40).map((q: any) => ({ source: "quote", id: q.id, text: q.text?.slice(0, 200) ?? "" })),
        ...caseFindings.slice(0, 20).map((f: any) => ({ source: "finding", id: f.id, text: f.description?.slice(0, 200) ?? "" })),
        ...caseClaims.slice(0, 20).map((c: any) => ({ source: "claim", id: c.id, text: c.claimText?.slice(0, 200) ?? "" })),
      ];

      if (evidenceItems.length === 0) {
        return { facts_inserted: 0, message: "No evidence found. Upload and analyze documents first." };
      }

      // Deterministic fact matrix — map each evidence item directly
      const FACT_DATE_RE = /\b(\d{4}-\d{2}-\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})\b/i;
      const SOURCE_TYPE_TO_FACT_TYPE: Record<string, string> = {
        quote: "statement",
        finding: "event",
        claim: "action",
      };

      const facts: any[] = evidenceItems.slice(0, 50).map((e) => {
        const dateMatch = e.text.match(FACT_DATE_RE);
        return {
          factText: e.text.slice(0, 500),
          factType: SOURCE_TYPE_TO_FACT_TYPE[e.source] ?? "statement",
          actor: null, // NER not available — leave for human review
          dateOccurred: dateMatch ? dateMatch[0] : null,
          sourceType: e.source,
          sourceId: e.id,
          relevanceScore: 0.5,
        };
      });

      let inserted = 0;
      for (const fact of facts.slice(0, 50)) {
        await db.insert(strategyFactMatrix).values({
          caseId: input.caseId,
          matterProfileId: input.matterProfileId,
          factText: fact.factText ?? "",
          factType: fact.factType ?? null,
          actor: fact.actor ?? null,
          dateOccurred: fact.dateOccurred ?? null,
          sourceQuoteId: fact.sourceType === "quote" ? fact.sourceId : null,
          sourceDocumentId: null,
          relevanceScore: String(fact.relevanceScore ?? 0.5),
          disputeStatus: "unknown",
          createdAt: now,
        });
        inserted++;
      }

      return { facts_inserted: inserted };
    }),

  // ─── S3: Generate Claim Candidates ──────────────────────────────────
  generateClaimCandidates: protectedProcedure
    .input(z.object({ caseId: z.number(), matterProfileId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const [profile] = await db.select().from(strategyMatterProfile)
        .where(eq(strategyMatterProfile.id, input.matterProfileId));
      if (!profile) throw new Error("Matter profile not found");

      const facts = await db.select().from(strategyFactMatrix)
        .where(and(
          eq(strategyFactMatrix.caseId, input.caseId),
          eq(strategyFactMatrix.matterProfileId, input.matterProfileId),
        ));

      const catalog = await db.select().from(strategyClaimCatalog);

      // Deterministic claim candidate generation — map unique fact types to candidates
      const uniqueFactTypes = [...new Set(facts.map((f: any) => f.factType).filter(Boolean))];

      // Map each unique claimType from catalog that has any matching fact types
      const candidateMap = new Map<string, any>();
      for (const catalogEntry of catalog) {
        const claimType = catalogEntry.claimType;
        if (!claimType || candidateMap.has(claimType)) continue;
        // Find fact types that exist for this claim
        const elementsSatisfied = uniqueFactTypes.filter(ft =>
          (catalogEntry.elementsRequired as string[] ?? []).some((el: string) =>
            el.toLowerCase().includes(ft) || ft.includes(el.toLowerCase())
          )
        );
        candidateMap.set(claimType, {
          catalogId: catalogEntry.id,
          claimType,
          viabilityScore: 0.5,
          elementsSatisfied,
          elementsMissing: ["Requires legal review"],
          supportingFactIds: facts.slice(0, 5).map((f: any) => f.id).filter(Boolean),
          solStatus: "unknown",
          recommendation: "investigate_further",
          notes: "Automated candidate — requires human assessment.",
        });
        if (candidateMap.size >= 8) break;
      }

      // If catalog is empty or no matches, create one candidate per unique factType
      if (candidateMap.size === 0) {
        for (const ft of uniqueFactTypes.slice(0, 8)) {
          candidateMap.set(ft, {
            catalogId: null,
            claimType: ft,
            viabilityScore: 0.5,
            elementsSatisfied: [ft],
            elementsMissing: ["Requires legal review"],
            supportingFactIds: facts.filter((f: any) => f.factType === ft).map((f: any) => f.id),
            solStatus: "unknown",
            recommendation: "investigate_further",
            notes: "Automated candidate — requires human assessment.",
          });
        }
      }

      const candidates = [...candidateMap.values()];

      let inserted = 0;
      for (const cand of candidates.slice(0, 8)) {
        await db.insert(strategyClaimCandidates).values({
          caseId: input.caseId,
          matterProfileId: input.matterProfileId,
          catalogId: cand.catalogId ?? null,
          claimType: cand.claimType ?? "Unknown",
          viabilityScore: String(cand.viabilityScore ?? 0),
          elementsSatisfied: cand.elementsSatisfied ?? [],
          elementsMissing: cand.elementsMissing ?? [],
          supportingFactIds: cand.supportingFactIds ?? [],
          solStatus: cand.solStatus ?? "unknown",
          recommendation: cand.recommendation ?? "investigate_further",
          notes: cand.notes ?? null,
          createdAt: now,
        });
        inserted++;
      }

      return { candidates_generated: inserted };
    }),

  // ─── S4: Evaluate Viability ─────────────────────────────────────────
  evaluateViability: protectedProcedure
    .input(z.object({ caseId: z.number(), matterProfileId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const candidates = await db.select().from(strategyClaimCandidates)
        .where(and(
          eq(strategyClaimCandidates.caseId, input.caseId),
          eq(strategyClaimCandidates.matterProfileId, input.matterProfileId),
        ));

      if (candidates.length === 0) return { assessments_created: 0, message: "No candidates found. Run S3 first." };

      const facts = await db.select().from(strategyFactMatrix)
        .where(and(
          eq(strategyFactMatrix.caseId, input.caseId),
          eq(strategyFactMatrix.matterProfileId, input.matterProfileId),
        ));

      let assessmentsCreated = 0;
      for (const cand of candidates) {
        // Deterministic viability scoring
        const satisfied = (cand.elementsSatisfied as string[]) ?? [];
        const missing = (cand.elementsMissing as string[]) ?? [];
        const totalElements = satisfied.length + missing.length;
        const elementScore = totalElements > 0 ? satisfied.length / totalElements : 0.5;

        const supportingFactIds = (cand.supportingFactIds as number[]) ?? [];
        const evidenceScore = Math.min(1.0, supportingFactIds.length / 10);

        const solStatus = cand.solStatus ?? "unknown";
        const solScore = solStatus === "within" ? 1.0 : solStatus === "expired" ? 0 : 0.5;

        const overallScore = (elementScore + evidenceScore + solScore) / 3;

        const assessment = {
          overallScore: parseFloat(overallScore.toFixed(2)),
          elementScore: parseFloat(elementScore.toFixed(2)),
          evidenceScore: parseFloat(evidenceScore.toFixed(2)),
          contradictionPenalty: 0,
          weakJointPenalty: 0,
          solScore: parseFloat(solScore.toFixed(2)),
          patternBonus: 0,
          assessmentDetails: {
            elementAnalysis: [],
            weaknesses: ["Automated scoring — requires human review"],
            recommendations: ["Consult legal counsel"],
          },
        };

        await db.insert(strategyViabilityAssessment).values({
          caseId: input.caseId,
          matterProfileId: input.matterProfileId,
          candidateId: cand.id,
          overallScore: String(assessment.overallScore ?? 0),
          elementScore: String(assessment.elementScore ?? 0),
          evidenceScore: String(assessment.evidenceScore ?? 0),
          contradictionPenalty: String(assessment.contradictionPenalty ?? 0),
          weakJointPenalty: String(assessment.weakJointPenalty ?? 0),
          solScore: String(assessment.solScore ?? 0),
          patternBonus: String(assessment.patternBonus ?? 0),
          assessmentDetails: assessment.assessmentDetails ?? {},
          createdAt: now,
        });
        assessmentsCreated++;
      }

      return { assessmentsCreated };
    }),

  // ─── S5: Compute Deadlines ──────────────────────────────────────────
  computeDeadlines: protectedProcedure
    .input(z.object({ caseId: z.number(), matterProfileId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const [profile] = await db.select().from(strategyMatterProfile)
        .where(eq(strategyMatterProfile.id, input.matterProfileId));
      if (!profile) throw new Error("Matter profile not found");

      const candidates = await db.select().from(strategyClaimCandidates)
        .where(and(
          eq(strategyClaimCandidates.caseId, input.caseId),
          eq(strategyClaimCandidates.matterProfileId, input.matterProfileId),
        ));

      let deadlinesCreated = 0;
      for (const cand of candidates) {
        const [catalogEntry] = cand.catalogId
          ? await db.select().from(strategyClaimCatalog).where(eq(strategyClaimCatalog.id, cand.catalogId))
          : [null];

        const triggerDate = profile.incidentDate ?? null;
        const solYears = catalogEntry?.solYears ?? 2;

        let deadlineDate: string | null = null;
        let daysRemaining: number | null = null;
        if (triggerDate) {
          const trigger = new Date(triggerDate);
          const deadline = new Date(trigger);
          deadline.setFullYear(deadline.getFullYear() + solYears);
          deadlineDate = deadline.toISOString().split("T")[0];
          daysRemaining = Math.ceil((deadline.getTime() - now) / (1000 * 60 * 60 * 24));
        }

        await db.insert(strategyDeadlineEngine).values({
          caseId: input.caseId,
          matterProfileId: input.matterProfileId,
          claimType: cand.claimType,
          deadlineType: "statute_of_limitations",
          triggerEvent: "incident date",
          triggerDate,
          deadlineDate,
          daysRemaining,
          tollingApplied: false,
          deadlineStatus: daysRemaining !== null
            ? (daysRemaining < 0 ? "expired" : "active")
            : "active",
          sourceRuleId: catalogEntry?.id ?? null,
          createdAt: now,
        });
        deadlinesCreated++;
      }

      return { deadlinesCreated };
    }),

  // ─── S6: Link Elements to Facts ─────────────────────────────────────
  linkElementsToFacts: protectedProcedure
    .input(z.object({ caseId: z.number(), matterProfileId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const candidates = await db.select().from(strategyClaimCandidates)
        .where(and(
          eq(strategyClaimCandidates.caseId, input.caseId),
          eq(strategyClaimCandidates.matterProfileId, input.matterProfileId),
        ));

      const facts = await db.select().from(strategyFactMatrix)
        .where(and(
          eq(strategyFactMatrix.caseId, input.caseId),
          eq(strategyFactMatrix.matterProfileId, input.matterProfileId),
        ));

      const assessments = await db.select().from(strategyViabilityAssessment)
        .where(eq(strategyViabilityAssessment.caseId, input.caseId));

      let linksCreated = 0;
      for (const cand of candidates) {
        const assessment = assessments.find((a: any) => a.candidateId === cand.id);
        const details = (assessment?.assessmentDetails as any) ?? {};
        const elementAnalysis = details.elementAnalysis ?? [];

        for (const elem of elementAnalysis) {
          const matchingFact = facts.find((f: any) =>
            f.factText.toLowerCase().includes(elem.element?.toLowerCase()?.split("_").join(" ") ?? "")
          );

          await db.insert(strategyElementFactLinks).values({
            caseId: input.caseId,
            candidateId: cand.id,
            element: elem.element ?? "unknown",
            factMatrixId: matchingFact?.id ?? null,
            quoteId: matchingFact?.sourceQuoteId ?? null,
            linkStrength: elem.strength ?? "absent",
            notes: elem.evidence ?? null,
            createdAt: now,
          });
          linksCreated++;
        }
      }

      return { linksCreated };
    }),

  // ─── S7: Identify Missing Evidence ──────────────────────────────────
  identifyMissingEvidence: protectedProcedure
    .input(z.object({ caseId: z.number(), matterProfileId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const links = await db.select().from(strategyElementFactLinks)
        .where(eq(strategyElementFactLinks.caseId, input.caseId));

      const weakLinks = links.filter((l: any) => l.linkStrength === "weak" || l.linkStrength === "absent");

      if (weakLinks.length === 0) return { tasks_created: 0, message: "No missing evidence identified." };

      const byCand: Record<number, typeof weakLinks> = {};
      for (const link of weakLinks) {
        if (!byCand[link.candidateId]) byCand[link.candidateId] = [];
        byCand[link.candidateId].push(link);
      }

      let tasksCreated = 0;
      for (const [candId, candLinks] of Object.entries(byCand)) {
        // Deterministic missing evidence tasks — one task per weak/absent element
        for (const link of candLinks) {
          await db.insert(strategyMissingEvidenceTasks).values({
            caseId: input.caseId,
            candidateId: Number(candId),
            element: link.element ?? "unknown",
            currentStrength: (link.linkStrength as any) ?? "absent",
            suggestedEvidenceType: "documentation",
            suggestedSource: "Case records or discovery",
            taskPriority: "medium",
            taskStatus: "open",
            createdAt: now,
            updatedAt: now,
          });
          tasksCreated++;
        }
      }

      return { tasksCreated };
    }),

  // ─── S8: Generate Strategy Paths ────────────────────────────────────
  generateStrategyPaths: protectedProcedure
    .input(z.object({ caseId: z.number(), matterProfileId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const [profile] = await db.select().from(strategyMatterProfile)
        .where(eq(strategyMatterProfile.id, input.matterProfileId));
      if (!profile) throw new Error("Matter profile not found");

      const candidates = await db.select().from(strategyClaimCandidates)
        .where(and(
          eq(strategyClaimCandidates.caseId, input.caseId),
          eq(strategyClaimCandidates.matterProfileId, input.matterProfileId),
        ));

      const assessments = await db.select().from(strategyViabilityAssessment)
        .where(eq(strategyViabilityAssessment.caseId, input.caseId));

      const forumRulesList = await db.select().from(strategyForumRules);
      const deadlines = await db.select().from(strategyDeadlineEngine)
        .where(and(
          eq(strategyDeadlineEngine.caseId, input.caseId),
          eq(strategyDeadlineEngine.matterProfileId, input.matterProfileId),
        ));

      // Deterministic strategy path generation — one path per forum for each viable candidate
      const viableCandidates = candidates.filter((c: any) =>
        parseFloat(String(c.viabilityScore ?? 0)) > 0.3
      );

      // Build paths: one per (viable candidate, forum rule) pair, capped at 4
      const pathEntries: Array<{
        pathLabel: string;
        claimCandidateIds: number[];
        recommendedForum: string | null;
        forumRuleId: number | null;
        estimatedStrength: number;
        estimatedTimeline: string | null;
        riskFactors: string[];
        advantages: string[];
        disadvantages: string[];
        priorityRank: number;
      }> = [];

      const forumsToUse = forumRulesList.length > 0 ? forumRulesList : [null];
      outer: for (const cand of viableCandidates) {
        for (const forum of forumsToUse) {
          pathEntries.push({
            pathLabel: forum
              ? `${cand.claimType} via ${forum.forumName}`
              : `${cand.claimType} — direct filing`,
            claimCandidateIds: [cand.id],
            recommendedForum: forum?.forumName ?? null,
            forumRuleId: forum?.id ?? null,
            estimatedStrength: parseFloat(String(cand.viabilityScore ?? 0.5)),
            estimatedTimeline: forum?.typicalTimeline ?? null,
            riskFactors: ["Automated assessment — requires legal review"],
            advantages: [],
            disadvantages: [],
            priorityRank: pathEntries.length + 1,
          });
          if (pathEntries.length >= 4) break outer;
        }
      }

      // Sort by estimatedStrength descending and reassign priorityRank
      pathEntries.sort((a, b) => b.estimatedStrength - a.estimatedStrength);
      pathEntries.forEach((p, i) => { p.priorityRank = i + 1; });

      const paths = pathEntries;

      let pathsCreated = 0;
      for (const path of paths.slice(0, 4)) {
        await db.insert(strategyPaths).values({
          caseId: input.caseId,
          matterProfileId: input.matterProfileId,
          pathLabel: path.pathLabel ?? `Strategy Path ${pathsCreated + 1}`,
          claimCandidateIds: path.claimCandidateIds ?? [],
          recommendedForum: path.recommendedForum ?? null,
          forumRuleId: path.forumRuleId ?? null,
          estimatedStrength: String(path.estimatedStrength ?? 0),
          estimatedTimeline: path.estimatedTimeline ?? null,
          riskFactors: path.riskFactors ?? [],
          advantages: path.advantages ?? [],
          disadvantages: path.disadvantages ?? [],
          priorityRank: path.priorityRank ?? pathsCreated + 1,
          pathStatus: "recommended",
          createdAt: now,
          updatedAt: now,
        });
        pathsCreated++;
      }

      return { pathsCreated };
    }),

  // ─── Full Pipeline Init ─────────────────────────────────────────────
  runFullPipeline: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return withEngineTracking({
        engineId: ENGINE_IDS.STRATEGY,
        caseId: input.caseId,
        userId: ctx.user?.id,
        runType: "strategy_only",
        extractOutputRefs: async (r: any, runId: string) => {
          if (!r?.canonicalEntity) throw new Error('[strategy-engine] No canonical entity produced');
          return buildOutputRefs({
            engineId: ENGINE_IDS.STRATEGY,
            runId,
            primary: r.canonicalEntity,
            artifacts: [],
            traceParts: ['case_' + String(input.caseId), ENGINE_IDS.STRATEGY, String(r.canonicalEntity.id)],
          });
        },
      }, async () => {
        // Write to canonical_workflows — NO legacy table writes
        const [caseRow] = await db.select().from(cases).where(eq(cases.id, input.caseId));
        if (!caseRow) throw new Error('Case not found');
        const canonicalEntity = await writeStrategyWorkflow({
          name: `Strategy: ${caseRow.name}`,
          description: `Auto-generated strategy workflow for case ${input.caseId}`,
          caseId: input.caseId,
          status: 'pending',
          steps: [],
          priority: 'medium',
          domains: [],
        });
        return { canonicalEntity, message: 'Strategy engine initialized in canonical_workflows.' };
      });
    }),

  // ─── Read Endpoints ─────────────────────────────────────────────────
  getMatterProfile: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(strategyMatterProfile)
        .where(eq(strategyMatterProfile.caseId, input.caseId))
        .orderBy(desc(strategyMatterProfile.createdAt));
    }),

  getFactMatrix: protectedProcedure
    .input(z.object({ caseId: z.number(), matterProfileId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(strategyFactMatrix)
        .where(and(
          eq(strategyFactMatrix.caseId, input.caseId),
          eq(strategyFactMatrix.matterProfileId, input.matterProfileId),
        ));
    }),

  getClaimCandidates: protectedProcedure
    .input(z.object({ caseId: z.number(), matterProfileId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(strategyClaimCandidates)
        .where(and(
          eq(strategyClaimCandidates.caseId, input.caseId),
          eq(strategyClaimCandidates.matterProfileId, input.matterProfileId),
        ));
    }),

  getViabilityAssessments: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(strategyViabilityAssessment)
        .where(eq(strategyViabilityAssessment.caseId, input.caseId));
    }),

  getDeadlines: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(strategyDeadlineEngine)
        .where(eq(strategyDeadlineEngine.caseId, input.caseId));
    }),

  getStrategyPaths: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(strategyPaths)
        .where(eq(strategyPaths.caseId, String(input.caseId)))
        .orderBy(strategyPaths.priorityRank);
    }),

  getElementFactLinks: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(strategyElementFactLinks)
        .where(eq(strategyElementFactLinks.caseId, input.caseId));
    }),

  getMissingEvidenceTasks: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(strategyMissingEvidenceTasks)
        .where(eq(strategyMissingEvidenceTasks.caseId, input.caseId));
    }),

  getClaimCatalog: protectedProcedure
    .query(async () => {
      return db.select().from(strategyClaimCatalog);
    }),

  getForumRules: protectedProcedure
    .query(async () => {
      return db.select().from(strategyForumRules);
    }),

  updatePathStatus: protectedProcedure
    .input(z.object({
      pathId: z.number(),
      status: z.enum(["draft", "recommended", "selected", "rejected"]),
      rationale: z.string().min(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { governedStrategyPathUpdate } = await import("../governance-hooks");
      // GOVERNED: Strategy path status change
      await governedStrategyPathUpdate({
        pathId: input.pathId,
        status: input.status,
        rationale: input.rationale ?? `Strategy path status changed to ${input.status} via resolution interface`,
        actorId: ctx.user?.open_id ?? "SYSTEM:strategy-engine",
        actorRole: "admin",
      });
      return { success: true };
    }),

  updateEvidenceTaskStatus: protectedProcedure
    .input(z.object({
      taskId: z.number(),
      status: z.enum(["open", "in_progress", "obtained", "unavailable"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.update(strategyMissingEvidenceTasks)
        .set({
          taskStatus: input.status,
          notes: input.notes ?? null,
          updatedAt: Date.now(),
        })
        .where(eq(strategyMissingEvidenceTasks.id, input.taskId));
      return { success: true };
    }),
});
