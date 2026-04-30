import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLMInteractive } from "../_core/llm";
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

      const caseEntities = await db.select().from(entities).where(eq(entities.caseId, input.caseId));
      const caseClaims = await db.select().from(claims).where(eq(claims.caseId, input.caseId));
      const caseEvents = await db.select().from(events).where(eq(events.caseId, input.caseId));

      const entitySummary = caseEntities.slice(0, 30).map(e => `${e.name} (${e.type})`).join(", ");
      const claimSummary = caseClaims.slice(0, 20).map(c => `${c.claimType}: ${c.claimText?.slice(0, 120)}`).join("\n");
      const eventSummary = caseEvents.slice(0, 20).map(e => `${e.eventType}: ${e.description?.slice(0, 120)}`).join("\n");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a legal strategy analyst. Given case data, produce a structured matter profile. Return JSON:
{
  "jurisdiction": "state name or Federal",
  "domain": "employment_discrimination|wage_theft|retaliation|harassment|wrongful_termination|other",
  "incidentDate": "YYYY-MM-DD or null",
  "filingDeadline": "YYYY-MM-DD or null",
  "opposingParties": ["array of opposing party names"],
  "keyFacts": ["array of key factual assertions"],
  "riskFactors": ["array of risk factors"],
  "statusSummary": "2-3 sentence matter summary"
}`
          },
          {
            role: "user",
            content: `Case: ${caseRow.name}\nDomain: ${caseRow.domain ?? "general"}\n\nEntities: ${entitySummary}\n\nClaims:\n${claimSummary}\n\nEvents:\n${eventSummary}`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content : "";
      let profile: any;
      try { profile = JSON.parse(content); } catch { profile = {}; }

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

      return { matterProfileId: inserted.insertId, profile };
    }),

  // ─── S2: Build Fact Matrix ──────────────────────────────────────────
  buildFactMatrix: protectedProcedure
    .input(z.object({ caseId: z.number(), matterProfileId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const caseQuotes = await db.select().from(quotes).where(eq(quotes.caseId, input.caseId));
      const caseFindings = await db.select().from(findings).where(eq(findings.caseId, input.caseId));
      const caseClaims = await db.select().from(claims).where(eq(claims.caseId, input.caseId));

      const evidenceItems = [
        ...caseQuotes.slice(0, 40).map(q => ({ source: "quote", id: q.id, text: q.text?.slice(0, 200) ?? "" })),
        ...caseFindings.slice(0, 20).map(f => ({ source: "finding", id: f.id, text: f.description?.slice(0, 200) ?? "" })),
        ...caseClaims.slice(0, 20).map(c => ({ source: "claim", id: c.id, text: c.claimText?.slice(0, 200) ?? "" })),
      ];

      if (evidenceItems.length === 0) {
        return { factsInserted: 0, message: "No evidence found. Upload and analyze documents first." };
      }

      const evidenceText = evidenceItems.map((e, i) =>
        `[${i + 1}] (${e.source} #${e.id}) ${e.text}`
      ).join("\n");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a legal fact extraction engine. Extract structured facts for a strategy fact matrix. Return JSON:
{"facts":[{
  "factText": "concise fact statement",
  "factType": "action|statement|event|condition|relationship|financial|temporal|procedural",
  "actor": "name or null",
  "dateOccurred": "YYYY-MM-DD or null",
  "sourceType": "quote|finding|claim",
  "sourceId": number,
  "relevanceScore": number (0.00-1.00)
}]}
Extract only explicitly stated facts. Maximum 50 facts.`
          },
          { role: "user", content: evidenceText }
        ],
        response_format: { type: "json_object" },
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content : "";
      let facts: any[];
      try {
        const parsed = JSON.parse(content);
        facts = Array.isArray(parsed) ? parsed : (parsed.facts ?? []);
      } catch { facts = []; }

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

      return { factsInserted: inserted };
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

      const factSummary = facts.slice(0, 40).map(f =>
        `[${f.factType}] ${f.factText} (relevance: ${f.relevanceScore})`
      ).join("\n");

      const catalogSummary = catalog.map(c =>
        `${c.id}. ${c.claimType} (${c.jurisdiction}) — Elements: ${JSON.stringify(c.elementsRequired)}`
      ).join("\n");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a legal claim matching engine. Given a matter profile, fact matrix, and claim catalog, identify viable claim candidates. Return JSON:
{"candidates":[{
  "catalogId": number,
  "claimType": "string",
  "viabilityScore": number (0.00-1.00),
  "elementsSatisfied": ["elements with supporting facts"],
  "elementsMissing": ["elements lacking evidence"],
  "supportingFactIds": [fact matrix IDs],
  "solStatus": "within|expiring_soon|expired|unknown",
  "recommendation": "pursue|investigate_further|weak|barred",
  "notes": "brief rationale"
}]}
Be conservative. Maximum 8 candidates.`
          },
          {
            role: "user",
            content: `Matter: ${profile.domain}, ${profile.jurisdiction}\nKey Facts: ${JSON.stringify(profile.keyFacts)}\n\nFact Matrix:\n${factSummary}\n\nClaim Catalog:\n${catalogSummary}`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content : "";
      let candidates: any[];
      try {
        const parsed = JSON.parse(content);
        candidates = Array.isArray(parsed) ? parsed : (parsed.candidates ?? []);
      } catch { candidates = []; }

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

      return { candidatesGenerated: inserted };
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

      if (candidates.length === 0) return { assessmentsCreated: 0, message: "No candidates found. Run S3 first." };

      const facts = await db.select().from(strategyFactMatrix)
        .where(and(
          eq(strategyFactMatrix.caseId, input.caseId),
          eq(strategyFactMatrix.matterProfileId, input.matterProfileId),
        ));

      let assessmentsCreated = 0;
      for (const cand of candidates) {
        const factText = facts.slice(0, 20).map(f => `[${f.factType}] ${f.factText}`).join("\n");

        const response = await invokeLLMInteractive({
          messages: [
            {
              role: "system",
              content: `You are a legal viability assessor. Evaluate claim viability. Return JSON:
{
  "overallScore": number (0.00-1.00),
  "elementScore": number (0.00-1.00),
  "evidenceScore": number (0.00-1.00),
  "contradictionPenalty": number (0.00-1.00, 0=no contradictions),
  "weakJointPenalty": number (0.00-1.00, 0=no weak joints),
  "solScore": number (0.00-1.00, 1=safely within SOL),
  "patternBonus": number (0.00-0.20, bonus for pattern evidence),
  "assessmentDetails": {"elementAnalysis":[{"element":"name","strength":"strong|moderate|weak|absent","evidence":"note"}],"weaknesses":[],"recommendations":[]}
}`
            },
            {
              role: "user",
              content: `Claim: ${cand.claimType}\nElements Satisfied: ${JSON.stringify(cand.elementsSatisfied)}\nElements Missing: ${JSON.stringify(cand.elementsMissing)}\nSOL: ${cand.solStatus}\n\nFacts:\n${factText}`
            }
          ],
          response_format: { type: "json_object" },
        });

        const content = typeof response.choices[0]?.message?.content === "string"
          ? response.choices[0].message.content : "";
        let assessment: any;
        try { assessment = JSON.parse(content); } catch { assessment = {}; }

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
        const assessment = assessments.find(a => a.candidateId === cand.id);
        const details = (assessment?.assessmentDetails as any) ?? {};
        const elementAnalysis = details.elementAnalysis ?? [];

        for (const elem of elementAnalysis) {
          const matchingFact = facts.find(f =>
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

      const weakLinks = links.filter(l => l.linkStrength === "weak" || l.linkStrength === "absent");

      if (weakLinks.length === 0) return { tasksCreated: 0, message: "No missing evidence identified." };

      const byCand: Record<number, typeof weakLinks> = {};
      for (const link of weakLinks) {
        if (!byCand[link.candidateId]) byCand[link.candidateId] = [];
        byCand[link.candidateId].push(link);
      }

      let tasksCreated = 0;
      for (const [candId, candLinks] of Object.entries(byCand)) {
        const elemList = candLinks.map(l => `${l.element} (${l.linkStrength})`).join(", ");

        const response = await invokeLLMInteractive({
          messages: [
            {
              role: "system",
              content: `You are a legal evidence strategist. For each weak/absent element, suggest evidence to obtain. Return JSON:
{"tasks":[{
  "element": "element name",
  "suggestedEvidenceType": "type of evidence",
  "suggestedSource": "where to obtain it",
  "taskPriority": "critical|high|medium|low"
}]}`
            },
            { role: "user", content: `Weak/absent elements for candidate #${candId}:\n${elemList}` }
          ],
          response_format: { type: "json_object" },
        });

        const content = typeof response.choices[0]?.message?.content === "string"
          ? response.choices[0].message.content : "";
        let tasks: any[];
        try {
          const parsed = JSON.parse(content);
          tasks = Array.isArray(parsed) ? parsed : (parsed.tasks ?? []);
        } catch { tasks = []; }

        for (const task of tasks) {
          await db.insert(strategyMissingEvidenceTasks).values({
            caseId: input.caseId,
            candidateId: Number(candId),
            element: task.element ?? "unknown",
            currentStrength: (candLinks.find(l => l.element === task.element)?.linkStrength as any) ?? "absent",
            suggestedEvidenceType: task.suggestedEvidenceType ?? null,
            suggestedSource: task.suggestedSource ?? null,
            taskPriority: task.taskPriority ?? "medium",
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

      const candSummary = candidates.map(c => {
        const assess = assessments.find(a => a.candidateId === c.id);
        const dl = deadlines.find(d => d.claimType === c.claimType);
        return `- ${c.claimType} (viability: ${c.viabilityScore}, overall: ${assess?.overallScore ?? "?"}, SOL days: ${dl?.daysRemaining ?? "?"})`;
      }).join("\n");

      const forumSummary = forumRulesList.map(f =>
        `${f.id}. ${f.forumName} (${f.forumType}) — Timeline: ${f.typicalTimeline}, Cost: ${f.costEstimate}`
      ).join("\n");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a legal strategy architect. Generate 2-4 strategy paths combining claims + forum + approach. Return JSON:
{"paths":[{
  "pathLabel": "descriptive name",
  "claimCandidateIds": [candidate IDs],
  "recommendedForum": "forum name",
  "forumRuleId": number,
  "estimatedStrength": number (0.00-1.00),
  "estimatedTimeline": "e.g., 12-18 months",
  "riskFactors": ["risks"],
  "advantages": ["advantages"],
  "disadvantages": ["disadvantages"],
  "priorityRank": number (1=best)
}]}`
          },
          {
            role: "user",
            content: `Matter: ${profile.domain}, ${profile.jurisdiction}\n\nCandidates:\n${candSummary}\n\nForums:\n${forumSummary}`
          }
        ],
        response_format: { type: "json_object" },
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content : "";
      let paths: any[];
      try {
        const parsed = JSON.parse(content);
        paths = Array.isArray(parsed) ? parsed : (parsed.paths ?? parsed.strategies ?? []);
      } catch { paths = []; }

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
        .where(eq(strategyPaths.caseId, input.caseId))
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
        actorId: ctx.user?.openId ?? "SYSTEM:strategy-engine",
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
