import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLMInteractive } from "../_core/llm";
import { db } from "../db";
import { eq, and, sql, like, count } from "drizzle-orm";
import {
  cases, documents, quotes, claims, findings,
  factClaims, caseFactPatterns,
  claimDetectionRules, claimDetectionResults,
  evidenceRecords, elementStrength,
  contradictionScores, contradictionTemplates,
  claimViability, deadlineRules,
  weakJointTriggers, weakJointHits,
  legalWeakJoints,
  proofFrameworks, claimElementMatrix,
} from "../../drizzle/schema";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";

// ═══════════════════════════════════════════════════════════════════════════
// CLAIM VIABILITY ENGINE — Computation Pipeline
//
// Pipeline stages (deterministic, numbered):
//   T1. Extract fact claims from case documents (LLM-assisted)
//   T2. Match fact patterns to claim detection rules → detection results
//   T3. Evaluate SOL/deadline status for each detected claim
//   T4. Evaluate element strength for each detected claim
//   T5. Detect contradictions across fact claims
//   T6. Check weak joint triggers against fact patterns
//   T7. Compute final viability score per claim type
//
// Each stage writes results to its corresponding table.
// The full pipeline can be run end-to-end or stage-by-stage.
// ═══════════════════════════════════════════════════════════════════════════

export const viabilityEngineRouter = router({

  // ─── T1: Extract Fact Claims ─────────────────────────────────────────
  // Input: caseId
  // Process: Read all claims/quotes from case documents, extract structured
  //          fact assertions (actor, factType, factValue, eventDate)
  // Output: Rows inserted into fact_claims table
  extractFactClaims: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.VIABILITY, caseId: input.caseId, runType: "viability_only" }, async () => {
      const now = Date.now();
      // Get all claims from the case
      const caseClaims = await db.select().from(claims)
        .where(eq(claims.caseId, input.caseId));

      if (caseClaims.length === 0) {
        return { extracted: 0, message: "No claims found in case. Upload and analyze documents first." };
      }

      // Get case metadata for context
      const [caseRow] = await db.select().from(cases)
        .where(eq(cases.id, input.caseId));

      // Build claim text for LLM extraction
      const claimTexts = caseClaims.slice(0, 50).map((c: any, i: any) =>
        `[${i + 1}] (${c.claimType}, origin: ${c.statementOrigin}) ${c.claimText}`
      ).join("\n");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a forensic fact extraction engine. Given a list of claims from legal documents, extract structured fact assertions. Each fact must have:
- sourceType: "claim" | "quote" | "finding"
- actor: the person or entity performing the action (or null)
- factType: one of: "action", "statement", "event", "condition", "relationship", "financial", "temporal", "procedural"
- factValue: the factual assertion in neutral, extractive language
- relatedEvent: brief event description if applicable (or null)
- eventDate: Unix timestamp in milliseconds if a date is mentioned (or null)

Return a JSON array of fact objects. Extract ONLY what is explicitly stated. Do not infer or synthesize.`
          },
          {
            role: "user",
            content: `Case: ${caseRow?.name ?? "Unknown"}\nDomain: ${caseRow?.domain ?? "general"}\n\nClaims:\n${claimTexts}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fact_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                facts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      sourceType: { type: "string" },
                      actor: { type: ["string", "null"] },
                      factType: { type: "string" },
                      factValue: { type: "string" },
                      relatedEvent: { type: ["string", "null"] },
                      eventDate: { type: ["number", "null"] },
                      confidenceScore: { type: "number" },
                    },
                    required: ["sourceType", "actor", "factType", "factValue", "relatedEvent", "eventDate", "confidenceScore"],
                    additionalProperties: false,
                  }
                }
              },
              required: ["facts"],
              additionalProperties: false,
            }
          }
        }
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content
        : "";
      let parsed: { facts: any[] };
      try {
        parsed = JSON.parse(content);
      } catch {
        return { extracted: 0, message: "LLM returned invalid JSON for fact extraction." };
      }

      // Clear previous fact claims for this case
      await db.delete(factClaims).where(eq(factClaims.caseId, input.caseId));

      // Insert extracted facts
      let inserted = 0;
      for (const fact of parsed.facts) {
        await db.insert(factClaims).values({
          caseId: input.caseId,
          sourceType: fact.sourceType || "claim",
          sourceReference: null,
          actor: fact.actor || null,
          factType: fact.factType || "action",
          factValue: fact.factValue,
          relatedEvent: fact.relatedEvent || null,
          eventDate: fact.eventDate || null,
          confidenceScore: String(Math.min(1, Math.max(0, fact.confidenceScore ?? 0.5))),
          createdAt: now,
        });
        inserted++;
      }

      // Also create case fact patterns for claim detection matching
      await db.delete(caseFactPatterns).where(eq(caseFactPatterns.caseId, input.caseId));
      const pipelineCategory = caseRow?.pipelineType || "general";
      for (const fact of parsed.facts) {
        await db.insert(caseFactPatterns).values({
          caseId: input.caseId,
          pipelineCategory,
          factText: fact.factValue,
          createdAt: now,
        });
      }

      return { extracted: inserted, message: `Extracted ${inserted} fact claims from ${caseClaims.length} document claims.` };
      }); // end withEngineTracking
    }),

  // ─── T2: Detect Claims ──────────────────────────────────────────────
  // Input: caseId
  // Process: Match case fact patterns against claim_detection_rules using
  //          keyword/phrase matching. Each rule has a triggerPhrase and weight.
  // Output: Rows inserted into claim_detection_results
  detectClaims: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      // Get fact patterns for this case
      const patterns = await db.select().from(caseFactPatterns)
        .where(eq(caseFactPatterns.caseId, input.caseId));

      if (patterns.length === 0) {
        return { detected: 0, message: "No fact patterns found. Run fact extraction first (T1)." };
      }

      // Get all detection rules
      const rules = await db.select().from(claimDetectionRules);

      // Match patterns against rules
      const claimScores: Record<string, { score: number; matchedRuleIds: number[]; matchCount: number }> = {};

      for (const pattern of patterns) {
        const factText = pattern.factText.toLowerCase();
        for (const rule of rules) {
          // Check if any trigger phrase appears in the fact text
          const triggers = rule.triggerPhrase.toLowerCase().split("|").map((t: any) => t.trim());
          const matched = triggers.some((trigger: any) => factText.includes(trigger));
          if (matched) {
            if (!claimScores[rule.claimType]) {
              claimScores[rule.claimType] = { score: 0, matchedRuleIds: [], matchCount: 0 };
            }
            claimScores[rule.claimType].score += parseFloat(String(rule.weight));
            claimScores[rule.claimType].matchedRuleIds.push(rule.id);
            claimScores[rule.claimType].matchCount++;
          }
        }
      }

      // Clear previous detection results
      await db.delete(claimDetectionResults).where(eq(claimDetectionResults.caseId, input.caseId));

      // Insert detection results (normalize scores to 0-1)
      const maxScore = Math.max(...Object.values(claimScores).map(s => s.score), 1);
      let detected = 0;
      for (const [claimType, data] of Object.entries(claimScores)) {
        const normalizedScore = Math.min(1, data.score / maxScore);
        if (normalizedScore >= 0.1) { // threshold: at least 10% confidence
          await db.insert(claimDetectionResults).values({
            caseId: input.caseId,
            claimType,
            confidenceScore: normalizedScore.toFixed(2),
            matchedRules: data.matchedRuleIds,
            createdAt: now,
          });
          detected++;
        }
      }

      return {
        detected,
        claim_types: Object.keys(claimScores).filter(ct => {
          const s = claimScores[ct];
          return Math.min(1, s.score / maxScore) >= 0.1;
        }),
        message: `Detected ${detected} potential claim types from ${patterns.length} fact patterns.`,
      };
    }),

  // ─── T3: Evaluate SOL/Deadline Status ────────────────────────────────
  // Input: caseId, incidentDate (Unix ms)
  // Process: For each detected claim, look up deadline_rules and compute
  //          days remaining, status (valid/warning/expired/unknown)
  // Output: SOL status per claim type (used in T7 viability)
  evaluateDeadlines: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      incidentDate: z.number(), // Unix timestamp ms
      jurisdiction: z.string().default("federal"),
    }))
    .query(async ({ input }) => {
      // Get detected claims for this case
      const detected = await db.select().from(claimDetectionResults)
        .where(eq(claimDetectionResults.caseId, input.caseId));

      if (detected.length === 0) {
        return { results: [], message: "No detected claims. Run claim detection first (T2)." };
      }

      // Get all deadline rules
      const allRules = await db.select().from(deadlineRules);

      const now = Date.now();
      const daysSinceIncident = Math.floor((now - input.incidentDate) / (1000 * 60 * 60 * 24));

      const results = detected.map((d: any) => {
        // Find matching deadline rules for this claim type and jurisdiction
        const matchingRules = allRules.filter((r: any) =>
          r.claimType.toLowerCase() === d.claimType.toLowerCase() &&
          (r.jurisdiction === input.jurisdiction || r.jurisdiction === "federal" || r.jurisdiction === "all")
        );

        // Find the SOL rule specifically
        const solRule = matchingRules.find((r: any) => r.deadlineType === "statute_of_limitations");
        const filingRule = matchingRules.find((r: any) => r.deadlineType === "filing");
        const exhaustionRule = matchingRules.find((r: any) => r.deadlineType === "administrative_exhaustion");

        // Use the most restrictive deadline
        const primaryRule = solRule || filingRule || exhaustionRule;

        if (!primaryRule || !primaryRule.timeLimitDays) {
          return {
            claim_type: d.claimType,
            confidence_score: d.confidenceScore,
            sol_status: "unknown" as const,
            sol_days_remaining: null,
            deadline_type: null,
            tolling_possible: false,
            notes: "No deadline rule found for this claim type/jurisdiction.",
          };
        }

        const daysRemaining = primaryRule.timeLimitDays - daysSinceIncident;
        const warningThreshold = primaryRule.warningThresholdDays ?? 30;
        const criticalThreshold = primaryRule.criticalThresholdDays ?? 7;

        let solStatus: "valid" | "warning" | "expired" | "unknown";
        if (daysRemaining <= 0) solStatus = "expired";
        else if (daysRemaining <= criticalThreshold) solStatus = "warning";
        else if (daysRemaining <= warningThreshold) solStatus = "warning";
        else solStatus = "valid";

        // Check if extended deadline applies
        let extendedNote = "";
        if (daysRemaining <= 0 && primaryRule.extendedLimitDays) {
          const extendedRemaining = primaryRule.extendedLimitDays - daysSinceIncident;
          if (extendedRemaining > 0) {
            solStatus = "warning";
            extendedNote = ` Extended deadline available (${primaryRule.extendedCondition}): ${extendedRemaining} days remaining.`;
          }
        }

        return {
          claim_type: d.claimType,
          confidence_score: d.confidenceScore,
          solStatus,
          sol_days_remaining: Math.max(0, daysRemaining),
          deadline_type: primaryRule.deadlineType,
          time_limit_days: primaryRule.timeLimitDays,
          tolling_possible: primaryRule.tollingPossible,
          tolling_conditions: primaryRule.tollingConditions,
          authority: primaryRule.authority,
          notes: `${daysRemaining} days since incident. Deadline: ${primaryRule.timeLimitDays} days.${extendedNote}`,
          all_matching_deadlines: matchingRules.map((r: any) => ({
            type: r.deadlineType,
            days: r.timeLimitDays,
            authority: r.authority,
          })),
        };
      });

      return { results, daysSinceIncident };
    }),

  // ─── T4: Evaluate Element Strength ───────────────────────────────────
  // Input: caseId
  // Process: For each detected claim, look up proof_frameworks and
  //          claim_element_matrix. Evaluate which elements are supported
  //          by the case's evidence records and fact claims.
  // Output: Rows inserted into element_strength table
  evaluateElements: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      // Get detected claims
      const detected = await db.select().from(claimDetectionResults)
        .where(eq(claimDetectionResults.caseId, input.caseId));

      if (detected.length === 0) {
        return { evaluated: 0, message: "No detected claims. Run claim detection first (T2)." };
      }

      // Get fact claims for evidence matching
      const facts = await db.select().from(factClaims)
        .where(eq(factClaims.caseId, input.caseId));

      // Get evidence records
      const evidence = await db.select().from(evidenceRecords)
        .where(eq(evidenceRecords.caseId, input.caseId));

      // Get all proof frameworks and element matrices
      const frameworks = await db.select().from(proofFrameworks);
      const elements = await db.select().from(claimElementMatrix);

      // Clear previous element strength records
      await db.delete(elementStrength).where(eq(elementStrength.caseId, input.caseId));

      let evaluated = 0;
      for (const detection of detected) {
        // Find matching proof framework
        const framework = frameworks.find((f: any) =>
          f.claimType.toLowerCase().includes(detection.claimType.toLowerCase()) ||
          detection.claimType.toLowerCase().includes(f.claimType.toLowerCase())
        );

        // Find matching elements from the matrix
        const claimElements = elements.filter((e: any) =>
          e.claimType.toLowerCase().includes(detection.claimType.toLowerCase()) ||
          detection.claimType.toLowerCase().includes(e.claimType.toLowerCase())
        );

        // If we have elements from the matrix, evaluate each
        const elementsToEvaluate = claimElements.length > 0
          ? claimElements.map((e: any) => e.elementName)
          : (framework?.elementsOfProof || ["Protected class membership", "Adverse action", "Causal connection", "Damages"]);

        for (const elementName of elementsToEvaluate) {
          // Score based on fact claim coverage
          const elementLower = elementName.toLowerCase();
          const matchingFacts = facts.filter((f: any) =>
            f.factValue.toLowerCase().includes(elementLower) ||
            elementLower.split(" ").some((word: any) =>
              word.length > 3 && f.factValue.toLowerCase().includes(word)
            )
          );

          const matchingEvidence = evidence.filter((e: any) =>
            e.relatedElement?.toLowerCase().includes(elementLower) ||
            e.relatedClaim?.toLowerCase().includes(detection.claimType.toLowerCase())
          );

          // Compute strength score
          let score = 0;
          if (matchingFacts.length > 0) score += 0.3;
          if (matchingFacts.length > 2) score += 0.1;
          if (matchingEvidence.length > 0) score += 0.3;
          if (matchingEvidence.some((e: any) => e.reliabilityClass === "primary")) score += 0.2;
          if (matchingEvidence.some((e: any) => e.reliabilityClass === "secondary")) score += 0.1;
          score = Math.min(1, score);

          let confidenceLevel: "high" | "medium" | "low" | "insufficient";
          if (score >= 0.7) confidenceLevel = "high";
          else if (score >= 0.4) confidenceLevel = "medium";
          else if (score >= 0.2) confidenceLevel = "low";
          else confidenceLevel = "insufficient";

          await db.insert(elementStrength).values({
            caseId: input.caseId,
            claimType: detection.claimType,
            element: elementName,
            supportingEvidence: matchingEvidence.map((e: any) => e.id),
            strengthScore: score.toFixed(2),
            confidenceLevel,
            createdAt: now,
          });
          evaluated++;
        }
      }

      return { evaluated, message: `Evaluated ${evaluated} elements across ${detected.length} claim types.` };
    }),

  // ─── T5: Detect Contradictions ───────────────────────────────────────
  // Input: caseId
  // Process: Compare fact claims pairwise to find contradictions.
  //          Also check against contradiction templates.
  // Output: Rows inserted into contradiction_scores table
  detectContradictions: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const facts = await db.select().from(factClaims)
        .where(eq(factClaims.caseId, input.caseId));

      if (facts.length < 2) {
        return { detected: 0, message: "Need at least 2 fact claims to detect contradictions." };
      }

      // Get contradiction templates for pattern matching
      const templates = await db.select().from(contradictionTemplates);

      // Build fact pairs for LLM analysis (limit to manageable size)
      const factTexts = facts.slice(0, 30).map((f: any, i: any) =>
        `[F${f.id}] (${f.factType}, actor: ${f.actor || "unknown"}) ${f.factValue}`
      ).join("\n");

      const response = await invokeLLMInteractive({
        messages: [
          {
            role: "system",
            content: `You are a forensic contradiction detection engine. Given a list of fact claims, identify pairs that contradict each other. A contradiction exists when:
1. Two facts assert incompatible states about the same subject/event
2. Two facts provide conflicting timelines
3. Two facts attribute contradictory actions to the same actor
4. A fact contradicts a known legal requirement or standard

For each contradiction found, provide:
- factIdA: the ID number of the first fact (from the [F#] prefix)
- factIdB: the ID number of the second fact
- contradictionType: "factual_inconsistency" | "timeline_conflict" | "actor_contradiction" | "legal_requirement_violation" | "procedural_contradiction"
- severityScore: 0.0 to 1.0 (how severe the contradiction is)
- confidence: 0.0 to 1.0 (how confident you are this is a real contradiction)

Return ONLY genuine contradictions. Do not flag differences that are merely complementary or additive information.`
          },
          {
            role: "user",
            content: `Fact claims:\n${factTexts}`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "contradiction_detection",
            strict: true,
            schema: {
              type: "object",
              properties: {
                contradictions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      factIdA: { type: "number" },
                      factIdB: { type: "number" },
                      contradictionType: { type: "string" },
                      severityScore: { type: "number" },
                      confidence: { type: "number" },
                    },
                    required: ["factIdA", "factIdB", "contradictionType", "severityScore", "confidence"],
                    additionalProperties: false,
                  }
                }
              },
              required: ["contradictions"],
              additionalProperties: false,
            }
          }
        }
      });

      const content = typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content
        : "";
      let parsed: { contradictions: any[] };
      try {
        parsed = JSON.parse(content);
      } catch {
        return { detected: 0, message: "LLM returned invalid JSON for contradiction detection." };
      }

      // Clear previous contradiction scores
      await db.delete(contradictionScores).where(eq(contradictionScores.caseId, input.caseId));

      let inserted = 0;
      for (const c of parsed.contradictions) {
        await db.insert(contradictionScores).values({
          caseId: input.caseId,
          contradictionType: c.contradictionType || "factual_inconsistency",
          severityScore: Math.min(1, Math.max(0, c.severityScore ?? 0.5)).toFixed(2),
          confidence: Math.min(1, Math.max(0, c.confidence ?? 0.5)).toFixed(2),
          factClaimA: c.factIdA || null,
          factClaimB: c.factIdB || null,
          evidenceReferences: [],
          createdAt: now,
        });
        inserted++;
      }

      // Also check against contradiction templates
      let templateMatches = 0;
      for (const template of templates) {
        const logic = template.contradictionLogic.toLowerCase();
        const indicators = (template.evidenceIndicators as string[]) || [];
        // Check if any fact patterns match the template's evidence indicators
        const matchCount = facts.filter((f: any) => {
          const fv = f.factValue.toLowerCase();
          return indicators.some(ind => fv.includes(ind.toLowerCase()));
        }).length;

        if (matchCount >= 2) {
          await db.insert(contradictionScores).values({
            caseId: input.caseId,
            contradictionType: `template:${template.templateId}`,
            severityScore: template.severity === "critical" ? "0.90" : template.severity === "high" ? "0.70" : template.severity === "medium" ? "0.50" : "0.30",
            confidence: Math.min(1, matchCount / indicators.length).toFixed(2),
            factClaimA: null,
            factClaimB: null,
            evidenceReferences: [],
            createdAt: now,
          });
          templateMatches++;
          inserted++;
        }
      }

      return {
        detected: inserted,
        llm_contradictions: parsed.contradictions.length,
        templateMatches,
        message: `Detected ${inserted} contradictions (${parsed.contradictions.length} from analysis, ${templateMatches} from templates).`,
      };
    }),

  // ─── T6: Check Weak Joint Triggers ───────────────────────────────────
  // Input: caseId
  // Process: Check case fact patterns against weak joint trigger conditions.
  //          Each trigger has a condition string that is matched against facts.
  // Output: Rows inserted into weak_joint_hits table
  checkWeakJoints: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      const facts = await db.select().from(factClaims)
        .where(eq(factClaims.caseId, input.caseId));
      const patterns = await db.select().from(caseFactPatterns)
        .where(eq(caseFactPatterns.caseId, input.caseId));

      if (facts.length === 0 && patterns.length === 0) {
        return { hits: 0, message: "No fact claims or patterns. Run fact extraction first (T1)." };
      }

      // Get all triggers with their weak joint info
      const triggers = await db.select().from(weakJointTriggers);
      const weakJoints = await db.select().from(legalWeakJoints);

      // Clear previous hits
      await db.delete(weakJointHits).where(eq(weakJointHits.caseId, input.caseId));

      let hits = 0;
      const allText = [...facts.map((f: any) => f.factValue), ...patterns.map((p: any) => p.factText)]
        .join(" ").toLowerCase();

      for (const trigger of triggers) {
        // Check if trigger condition matches any fact text
        const conditionWords = trigger.triggerCondition.toLowerCase()
          .split(/[,;|]/)
          .map((w: any) => w.trim())
          .filter((w: any) => w.length > 3);

        const matchCount = conditionWords.filter((word: any) => allText.includes(word)).length;
        const matchRatio = conditionWords.length > 0 ? matchCount / conditionWords.length : 0;

        if (matchRatio >= 0.3) { // At least 30% of condition words match
          const hitStrength = Math.min(1, matchRatio * parseFloat(String(trigger.severityWeight)));

          // Find matching fact pattern IDs
          const matchingPatternIds = patterns
            .filter((p: any) => conditionWords.some((w: any) => p.factText.toLowerCase().includes(w)))
            .map((p: any) => p.id)
            .slice(0, 10);

          await db.insert(weakJointHits).values({
            caseId: input.caseId,
            weakJointId: trigger.weakJointId,
            triggerId: trigger.id,
            hitStrength: hitStrength.toFixed(2),
            supportingFactPatterns: matchingPatternIds,
            createdAt: now,
          });
          hits++;
        }
      }

      // Enrich with weak joint details
      const hitDetails = hits > 0 ? await db.select().from(weakJointHits)
        .where(eq(weakJointHits.caseId, input.caseId)) : [];

      const enriched = hitDetails.map((h: any) => {
        const wj = weakJoints.find((w: any) => w.id === h.weakJointId);
        return {
          ...h,
          weak_joint_name: wj?.statuteCitation ?? "Unknown",
          severity: wj?.severity ?? "unknown",
          divergence: wj?.divergenceDescription ?? "",
        };
      });

      return {
        hits,
        details: enriched,
        message: `Found ${hits} weak joint trigger matches from ${triggers.length} triggers.`,
      };
    }),

  // ─── T7: Compute Final Viability ────────────────────────────────────
  // Input: caseId, incidentDate, jurisdiction
  // Process: Aggregate all pipeline outputs into a final viability score
  //          per detected claim type.
  // Output: Rows inserted into claim_viability table
  computeViability: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      incidentDate: z.number(),
      jurisdiction: z.string().default("federal"),
    }))
    .mutation(async ({ input }) => {
      const now = Date.now();

      // Gather all pipeline data
      const detected = await db.select().from(claimDetectionResults)
        .where(eq(claimDetectionResults.caseId, input.caseId));
      const elements = await db.select().from(elementStrength)
        .where(eq(elementStrength.caseId, input.caseId));
      const contradictions = await db.select().from(contradictionScores)
        .where(eq(contradictionScores.caseId, input.caseId));
      const wjHits = await db.select().from(weakJointHits)
        .where(eq(weakJointHits.caseId, input.caseId));
      const evidence = await db.select().from(evidenceRecords)
        .where(eq(evidenceRecords.caseId, input.caseId));

      // Get deadline data
      const allDeadlineRules = await db.select().from(deadlineRules);
      const daysSinceIncident = Math.floor((now - input.incidentDate) / (1000 * 60 * 60 * 24));

      if (detected.length === 0) {
        return { viability: [], message: "No detected claims. Run the full pipeline first." };
      }

      // Clear previous viability records
      await db.delete(claimViability).where(eq(claimViability.caseId, input.caseId));

      const results = [];
      for (const detection of detected) {
        // Element analysis
        const claimElements = elements.filter((e: any) => e.claimType === detection.claimType);
        const satisfied = claimElements.filter((e: any) => parseFloat(String(e.strengthScore)) >= 0.4);
        const missing = claimElements.filter((e: any) => parseFloat(String(e.strengthScore)) < 0.4);

        // SOL analysis
        const solRule = allDeadlineRules.find((r: any) =>
          r.claimType.toLowerCase() === detection.claimType.toLowerCase() &&
          (r.jurisdiction === input.jurisdiction || r.jurisdiction === "federal") &&
          r.deadlineType === "statute_of_limitations"
        );
        let solStatus: "valid" | "warning" | "expired" | "unknown" = "unknown";
        let solDaysRemaining: number | null = null;
        if (solRule?.timeLimitDays) {
          solDaysRemaining = solRule.timeLimitDays - daysSinceIncident;
          if (solDaysRemaining <= 0) solStatus = "expired";
          else if (solDaysRemaining <= (solRule.warningThresholdDays ?? 30)) solStatus = "warning";
          else solStatus = "valid";
        }

        // Evidence sufficiency
        const claimEvidence = evidence.filter((e: any) =>
          e.relatedClaim?.toLowerCase().includes(detection.claimType.toLowerCase())
        );
        let evidenceSufficiency: "strong" | "moderate" | "weak" | "insufficient";
        const primaryCount = claimEvidence.filter((e: any) => e.reliabilityClass === "primary").length;
        const totalEvidence = claimEvidence.length;
        if (primaryCount >= 2 && totalEvidence >= 4) evidenceSufficiency = "strong";
        else if (primaryCount >= 1 && totalEvidence >= 2) evidenceSufficiency = "moderate";
        else if (totalEvidence >= 1) evidenceSufficiency = "weak";
        else evidenceSufficiency = "insufficient";

        // Contradiction impact
        const contradictionCount = contradictions.length;
        const weakJointCount = wjHits.length;

        // Compute confidence score (weighted formula)
        const detectionConfidence = parseFloat(String(detection.confidenceScore));
        const elementScore = claimElements.length > 0
          ? satisfied.length / claimElements.length
          : 0.5;
        const solPenalty = solStatus === "expired" ? 0.3 : solStatus === "warning" ? 0.1 : 0;
        const contradictionPenalty = Math.min(0.2, contradictionCount * 0.05);
        const evidenceBonus = evidenceSufficiency === "strong" ? 0.15
          : evidenceSufficiency === "moderate" ? 0.08
          : evidenceSufficiency === "weak" ? 0.03
          : 0;

        const confidenceScore = Math.max(0, Math.min(1,
          (detectionConfidence * 0.25) +
          (elementScore * 0.35) +
          evidenceBonus -
          solPenalty -
          contradictionPenalty
        ));

        // Recommended evidence
        const recommendedEvidence = missing.map((m: any) => `Evidence needed for: ${m.element}`);
        if (evidenceSufficiency === "insufficient" || evidenceSufficiency === "weak") {
          recommendedEvidence.push("Gather primary source documents (sworn testimony, court filings)");
        }

        // Recommended action
        let recommendedAction = "";
        if (solStatus === "expired") {
          recommendedAction = `SOL has expired for ${detection.claimType}. Evaluate tolling arguments or alternative claims.`;
        } else if (solStatus === "warning") {
          recommendedAction = `SOL deadline approaching (${solDaysRemaining} days). Prioritize filing preparation.`;
        } else if (confidenceScore >= 0.6) {
          recommendedAction = `Strong viability. Proceed with formal complaint preparation.`;
        } else if (confidenceScore >= 0.3) {
          recommendedAction = `Moderate viability. Gather additional evidence before filing.`;
        } else {
          recommendedAction = `Low viability. Consider alternative legal theories or additional investigation.`;
        }

        // Agency routing
        const frameworks = await db.select().from(proofFrameworks);
        const framework = frameworks.find((f: any) =>
          f.claimType.toLowerCase().includes(detection.claimType.toLowerCase())
        );

        await db.insert(claimViability).values({
          caseId: input.caseId,
          claimType: detection.claimType,
          elementsSatisfied: satisfied.map((s: any) => s.element),
          elementsMissing: missing.map((m: any) => m.element),
          confidenceScore: confidenceScore.toFixed(2),
          solStatus,
          solDaysRemaining: solDaysRemaining !== null ? Math.max(0, solDaysRemaining) : null,
          evidenceSufficiency,
          recommendedEvidence,
          recommendedAction,
          agencyRouting: framework?.domain || null,
          contradictionCount,
          weakJointCount,
          evaluatedAt: now,
        });

        results.push({
          claimType: detection.claimType,
          confidenceScore: parseFloat(confidenceScore.toFixed(2)),
          solStatus,
          solDaysRemaining,
          evidenceSufficiency,
          elementsSatisfied: satisfied.length,
          elementsMissing: missing.length,
          contradictionCount,
          weakJointCount,
          recommendedAction,
        });
      }

      return {
        viability: results.sort((a, b) => b.confidenceScore - a.confidenceScore),
        message: `Computed viability for ${results.length} claim types.`,
      };
    }),

  // ─── Full Pipeline: Run All Stages ──────────────────────────────────
  // Convenience endpoint that runs T1-T7 in sequence.
  // NOTE: This is a stub that returns pipeline instructions.
  // The actual orchestration is done by calling each stage endpoint
  // individually from the frontend in sequence.
  runFullPipeline: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      incidentDate: z.number(),
      jurisdiction: z.string().default("federal"),
    }))
    .mutation(async ({ input }): Promise<{
      success: boolean;
      stages: string[];
      message: string;
    }> => {
      return withEngineTracking({ engineId: ENGINE_IDS.VIABILITY, caseId: input.caseId, runType: "full_pipeline" }, async () => {
        return {
          success: true,
          stages: [
            "extractFactClaims",
            "detectClaims",
            "evaluateElements",
            "detectContradictions",
            "checkWeakJoints",
            "computeViability",
          ],
          message: `Pipeline ready for case ${input.caseId}. Call each stage mutation in order.`,
        };
      });
    }),

  // ─── Pipeline Status ─────────────────────────────────────────────────
  // Check what pipeline stages have been run for a case
  getPipelineStatus: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const [factCount] = await db.select({ c: count() }).from(factClaims)
        .where(eq(factClaims.caseId, input.caseId));
      const [patternCount] = await db.select({ c: count() }).from(caseFactPatterns)
        .where(eq(caseFactPatterns.caseId, input.caseId));
      const [detectionCount] = await db.select({ c: count() }).from(claimDetectionResults)
        .where(eq(claimDetectionResults.caseId, input.caseId));
      const [elementCount] = await db.select({ c: count() }).from(elementStrength)
        .where(eq(elementStrength.caseId, input.caseId));
      const [contradictionCount] = await db.select({ c: count() }).from(contradictionScores)
        .where(eq(contradictionScores.caseId, input.caseId));
      const [wjHitCount] = await db.select({ c: count() }).from(weakJointHits)
        .where(eq(weakJointHits.caseId, input.caseId));
      const [viabilityCount] = await db.select({ c: count() }).from(claimViability)
        .where(eq(claimViability.caseId, input.caseId));
      const [evidenceCount] = await db.select({ c: count() }).from(evidenceRecords)
        .where(eq(evidenceRecords.caseId, input.caseId));

      return {
        stages: {
          t1_factExtraction: { complete: factCount.c > 0, count: factCount.c },
          t1_factPatterns: { complete: patternCount.c > 0, count: patternCount.c },
          t2_claimDetection: { complete: detectionCount.c > 0, count: detectionCount.c },
          t4_elementEvaluation: { complete: elementCount.c > 0, count: elementCount.c },
          t5_contradictionDetection: { complete: contradictionCount.c > 0, count: contradictionCount.c },
          t6_weakJointCheck: { complete: wjHitCount.c > 0, count: wjHitCount.c },
          t7_viabilityComputation: { complete: viabilityCount.c > 0, count: viabilityCount.c },
        },
        evidence_records: evidenceCount.c,
        pipeline_complete: viabilityCount.c > 0,
      };
    }),
});
