import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from "../db";
import { eq, and, sql, like, count } from "drizzle-orm";
import {
  cases, documents, quotes, claims, findings,
  factClaims, caseFactPatterns,
  claimDetectionRules, claimDetectionResults,
  evidenceRecords, elementStrength,
  contradictionScores, contradictionTemplates,
  claimViability,
  weakJointTriggers, weakJointHits,
  legalWeakJoints,
  proofFrameworks, claimElementMatrix,
} from "../../drizzle/schema";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";
import { assess_resolution_deadlines } from "../resolution-deadline-contract";
import { read_resolution_deadlines } from "../resolution-reference-runtime";

type detected_deadline_claim = {
  claim_type: (typeof claimDetectionResults.$inferSelect)["claimType"];
  confidence_score: (typeof claimDetectionResults.$inferSelect)["confidenceScore"];
};

const case_deadline_input = z.preprocess((value) => {
  const input = value as Record<string, unknown> | null;
  if (!input || typeof input !== "object") return value;
  return {
    case_id: input.case_id ?? input.caseId,
    jurisdiction: input.jurisdiction,
    forum: input.forum,
    trigger_event: input.trigger_event ?? input.triggerEvent,
    event_date: input.event_date ?? input.eventDate,
  };
}, z.object({
  case_id: z.number().int().positive(),
  jurisdiction: z.string().trim().max(128).default(""),
  forum: z.string().trim().max(256).optional(),
  trigger_event: z.string().trim().max(512).optional(),
  event_date: z.string().date().optional(),
}));

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
        .where(eq(claims.caseId, String(input.caseId)));

      if (caseClaims.length === 0) {
        return { extracted: 0, message: "No claims found in case. Upload and analyze documents first." };
      }

      // Get case metadata for context
      const [caseRow] = await db.select().from(cases)
        .where(eq(cases.id, input.caseId));

      // Deterministic fact extraction — map each claim directly to a structured fact
      const CLAIM_TYPE_TO_FACT_TYPE: Record<string, string> = {
        legal_filing: "procedural",
        testimony: "statement",
        event: "event",
        deadline: "temporal",
      };
      const DATE_PATTERN = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})\b/i;

      const parsed = {
        facts: caseClaims.slice(0, 50).map((c: any) => {
          // Extract first capitalized word sequence as actor
          const actorMatch = (c.claimText ?? "").match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
          const actor = actorMatch ? actorMatch[1] : null;

          // Map claimType to factType
          const factType = CLAIM_TYPE_TO_FACT_TYPE[c.claimType] ?? "statement";

          // Extract date from claimText if present
          const dateMatch = (c.claimText ?? "").match(DATE_PATTERN);
          let eventDate: number | null = null;
          if (dateMatch) {
            const parsed = Date.parse(dateMatch[0]);
            if (!isNaN(parsed)) eventDate = parsed;
          }

          return {
            sourceType: "claim",
            actor,
            factType,
            factValue: c.claimText ?? "",
            relatedEvent: null,
            eventDate,
            confidenceScore: 0.6,
          };
        }),
      };

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

  // T3: Review source references. A generic incident date is not a bound trigger.
  evaluate_deadlines: protectedProcedure
    .input(case_deadline_input)
    .query(async ({ input }) => {
      const detected: detected_deadline_claim[] = (await db.select().from(claimDetectionResults)
        .where(eq(claimDetectionResults.caseId, input.case_id)))
        .map((row: typeof claimDetectionResults.$inferSelect) => ({ claim_type: row.claimType, confidence_score: row.confidenceScore }));
      if (detected.length === 0) {
        return { results: [], message: "No detected claims. Run claim detection first (T2)." };
      }
      const references = await read_resolution_deadlines();
      const results = detected.map(claim => {
        const deadline_assessment = assess_resolution_deadlines(references, { ...input, claim_type: claim.claim_type });
        return {
          ...claim,
          sol_status: "unknown" as const,
          sol_days_remaining: null,
          deadline_type: null,
          tolling_possible: null,
          notes: deadline_assessment.message,
          deadline_assessment,
        };
      });
      return { results, message: "Deadline applicability remains unresolved pending a reviewed authority, forum and triggering event." };
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

      // Deterministic contradiction detection via keyword heuristics
      const NEGATION_WORDS = ["not", "never", "denied", "refused", "rejected", "did not", "does not", "was not", "has not"];
      const AFFIRMATIVE_WORDS = ["confirmed", "approved", "granted", "agreed", "accepted", "did", "was", "has"];

      const detectedContradictions: Array<{
        factIdA: number;
        factIdB: number;
        contradictionType: string;
        severityScore: number;
        confidence: number;
      }> = [];

      const workingFacts = facts.slice(0, 30);
      for (let i = 0; i < workingFacts.length; i++) {
        for (let j = i + 1; j < workingFacts.length; j++) {
          const fa = workingFacts[i];
          const fb = workingFacts[j];
          const fav = (fa.factValue ?? "").toLowerCase();
          const fbv = (fb.factValue ?? "").toLowerCase();

          // Only compare facts with the same actor
          if (!fa.actor || !fb.actor || fa.actor !== fb.actor) continue;

          const faIsNegative = NEGATION_WORDS.some(w => fav.includes(w));
          const fbIsNegative = NEGATION_WORDS.some(w => fbv.includes(w));
          const faIsPositive = AFFIRMATIVE_WORDS.some(w => fav.includes(w));
          const fbIsPositive = AFFIRMATIVE_WORDS.some(w => fbv.includes(w));

          // Direct negation: one positive, one negative about same actor
          if ((faIsPositive && fbIsNegative) || (faIsNegative && fbIsPositive)) {
            detectedContradictions.push({
              factIdA: fa.id,
              factIdB: fb.id,
              contradictionType: "factual_inconsistency",
              severityScore: 0.7,
              confidence: 0.6,
            });
            continue;
          }

          // Timeline conflict: both have dates but different values
          if (fa.eventDate && fb.eventDate && fa.eventDate !== fb.eventDate) {
            // Check if they appear to describe the same event (shared keywords)
            const faWords = new Set(fav.split(/\s+/).filter((w: string) => w.length > 4));
            const fbWords = fbv.split(/\s+/).filter((w: string) => w.length > 4);
            const sharedWords = fbWords.filter((w: string) => faWords.has(w));
            if (sharedWords.length >= 2) {
              detectedContradictions.push({
                factIdA: fa.id,
                factIdB: fb.id,
                contradictionType: "timeline_conflict",
                severityScore: 0.5,
                confidence: 0.6,
              });
            }
          }
        }
      }

      const parsed = { contradictions: detectedContradictions };

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
        heuristic_contradictions: parsed.contradictions.length,
        templateMatches,
        message: `Detected ${inserted} contradictions (${parsed.contradictions.length} from heuristic analysis, ${templateMatches} from templates).`,
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
  // Input: case_id, jurisdiction and optional forum/event context
  // Process: Aggregate all pipeline outputs into a final viability score
  //          per detected claim type.
  // Output: Rows inserted into claim_viability table
  compute_viability: protectedProcedure
    .input(case_deadline_input)
    .mutation(async ({ input }) => {
      const now = Date.now();

      // Gather all pipeline data
      const detected: detected_deadline_claim[] = (await db.select().from(claimDetectionResults)
        .where(eq(claimDetectionResults.caseId, input.case_id)))
        .map((row: typeof claimDetectionResults.$inferSelect) => ({ claim_type: row.claimType, confidence_score: row.confidenceScore }));
      const elements = (await db.select().from(elementStrength)
        .where(eq(elementStrength.caseId, input.case_id)))
        .map((row: typeof elementStrength.$inferSelect) => ({ claim_type: row.claimType, strength_score: row.strengthScore, element: row.element }));
      const contradictions = await db.select().from(contradictionScores)
        .where(eq(contradictionScores.caseId, input.case_id));
      const weak_joint_hits = await db.select().from(weakJointHits)
        .where(eq(weakJointHits.caseId, input.case_id));
      const evidence = (await db.select().from(evidenceRecords)
        .where(eq(evidenceRecords.caseId, input.case_id)))
        .map((row: typeof evidenceRecords.$inferSelect) => ({ related_claim: row.relatedClaim, reliability_class: row.reliabilityClass }));

      // Get deadline data
      const deadline_references = await read_resolution_deadlines();

      if (detected.length === 0) {
        return { viability: [], message: "No detected claims. Run the full pipeline first." };
      }

      // Clear previous viability records
      await db.delete(claimViability).where(eq(claimViability.caseId, input.case_id));

      const results = [];
      for (const detection of detected) {
        // Element analysis
        const claim_elements = elements.filter((e: any) => e.claim_type === detection.claim_type);
        const satisfied = claim_elements.filter((e: any) => parseFloat(String(e.strength_score)) >= 0.4);
        const missing = claim_elements.filter((e: any) => parseFloat(String(e.strength_score)) < 0.4);

        // Catalog intervals cannot establish SOL status or penalize viability.
        const deadline_assessment = assess_resolution_deadlines(deadline_references, {
          ...input, claim_type: detection.claim_type,
        });
        const sol_status = "unknown" as const;
        const sol_days_remaining = null;

        // Evidence sufficiency
        const claim_evidence = evidence.filter((e: any) =>
          e.related_claim?.toLowerCase().includes(detection.claim_type.toLowerCase())
        );
        let evidence_sufficiency: "strong" | "moderate" | "weak" | "insufficient";
        const primary_count = claim_evidence.filter((e: any) => e.reliability_class === "primary").length;
        const total_evidence = claim_evidence.length;
        if (primary_count >= 2 && total_evidence >= 4) evidence_sufficiency = "strong";
        else if (primary_count >= 1 && total_evidence >= 2) evidence_sufficiency = "moderate";
        else if (total_evidence >= 1) evidence_sufficiency = "weak";
        else evidence_sufficiency = "insufficient";

        // Contradiction impact
        const contradiction_count = contradictions.length;
        const weak_joint_count = weak_joint_hits.length;

        // Compute confidence score (weighted formula)
        const detection_confidence = parseFloat(String(detection.confidence_score));
        const element_score = claim_elements.length > 0
          ? satisfied.length / claim_elements.length
          : 0.5;
        const contradiction_penalty = Math.min(0.2, contradiction_count * 0.05);
        const evidence_bonus = evidence_sufficiency === "strong" ? 0.15
          : evidence_sufficiency === "moderate" ? 0.08
          : evidence_sufficiency === "weak" ? 0.03
          : 0;

        const confidence_score = Math.max(0, Math.min(1,
          (detection_confidence * 0.25) +
          (element_score * 0.35) +
          evidence_bonus -
          contradiction_penalty
        ));

        // Recommended evidence
        const recommended_evidence = missing.map((m: any) => `Evidence needed for: ${m.element}`);
        if (evidence_sufficiency === "insufficient" || evidence_sufficiency === "weak") {
          recommended_evidence.push("Gather primary source documents (sworn testimony, court filings)");
        }

        // Evidence strength does not establish whether filing is timely.
        const recommended_action = `Review deadline applicability before acting on the evidence assessment. ${deadline_assessment.message}`;

        // Agency routing
        const frameworks = (await db.select().from(proofFrameworks))
          .map((row: typeof proofFrameworks.$inferSelect) => ({ claim_type: row.claimType, domain: row.domain }));
        const framework = frameworks.find((f: any) =>
          f.claim_type.toLowerCase().includes(detection.claim_type.toLowerCase())
        );

        await db.insert(claimViability).values({
          caseId: input.case_id,
          claimType: detection.claim_type,
          elementsSatisfied: satisfied.map((s: any) => s.element),
          elementsMissing: missing.map((m: any) => m.element),
          confidenceScore: confidence_score.toFixed(2),
          solStatus: sol_status,
          solDaysRemaining: sol_days_remaining,
          evidenceSufficiency: evidence_sufficiency,
          recommendedEvidence: recommended_evidence,
          recommendedAction: recommended_action,
          agencyRouting: framework?.domain || null,
          contradictionCount: contradiction_count,
          weakJointCount: weak_joint_count,
          evaluatedAt: now,
        });

        results.push({
          claim_type: detection.claim_type,
          confidence_score: parseFloat(confidence_score.toFixed(2)),
          sol_status,
          sol_days_remaining,
          deadline_assessment,
          evidence_sufficiency: evidence_sufficiency,
          elements_satisfied: satisfied.length,
          elements_missing: missing.length,
          contradiction_count: contradiction_count,
          weak_joint_count: weak_joint_count,
          recommended_action,
        });
      }

      return {
        viability: results.sort((a, b) => b.confidence_score - a.confidence_score),
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
            "compute_viability",
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
