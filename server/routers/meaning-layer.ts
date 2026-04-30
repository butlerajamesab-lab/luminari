/**
 * MEANING LAYER ROUTER
 * 
 * Transforms raw signals and patterns into human-readable insights by:
 * 1. Interpreting why signals matter
 * 2. Mapping signals/patterns to applicable laws
 * 3. Finding similar precedents
 * 4. Providing systemic context
 */

import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { db } from "../db";
import { eq, like, and, sql } from "drizzle-orm";
import { legalStatutes, legalCaseLaw, legalEnforcementRecords, detectedSignals } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";

// ─── Signal Interpretation ───
// Uses LLM to explain what a signal means in plain language

export const meaningLayerRouter = router({
  /**
   * Interpret a signal: explain why it matters and what it indicates
   * Input: signal data (type, severity, description)
   * Output: Plain language interpretation of what the signal means
   */
  interpretSignal: publicProcedure
    .input(z.object({
      signalType: z.string(),
      severity: z.string().optional(),
      description: z.string().optional(),
      plainLanguageExplanation: z.string().optional(),
      context: z.string().optional(),
    }))
    .query(async ({ input }) => {
      try {
        // If we already have a plain language explanation, use it
        if (input.plainLanguageExplanation) {
          return {
            signalType: input.signalType,
            interpretation: input.plainLanguageExplanation,
            source: "provided",
          };
        }

        // Otherwise, use LLM to generate interpretation
        const prompt = `You are a legal expert explaining signals of systemic injustice to people affected by them.

Signal Type: ${input.signalType}
Severity: ${input.severity || "unknown"}
Description: ${input.description || "no description provided"}
Context: ${input.context || "no context provided"}

Generate a brief, clear explanation (2-3 sentences) of what this signal means and why it matters to someone experiencing this problem. Use plain language. Focus on the human impact, not technical details.`;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a legal expert who explains complex legal signals in plain, accessible language.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        const interpretation = response.choices?.[0]?.message?.content || "Unable to interpret signal";

        return {
          signalType: input.signalType,
          interpretation,
          source: "llm",
        };
      } catch (error) {
        console.error("Error interpreting signal:", error);
        return {
          signalType: input.signalType,
          interpretation: `This signal indicates a potential ${input.signalType} issue that may require legal attention.`,
          source: "fallback",
        };
      }
    }),

  /**
   * Find applicable statutes for a signal
   * Input: signal type, domain, jurisdiction
   * Output: List of relevant statutes with citations and summaries
   */
  signalRelatedStatutes: publicProcedure
    .input(z.object({
      signalType: z.string(),
      domain: z.string().optional(),
      jurisdiction: z.string().optional(),
      limit: z.number().min(1).max(20).optional(),
    }))
    .query(async ({ input }) => {
      try {
        // Build search keywords from signal type
        const keywords = input.signalType.toLowerCase().split(/[\s_-]+/).filter(k => k.length > 2);
        
        // Search for statutes matching the signal
        const conditions = [];
        
        if (input.jurisdiction) {
          conditions.push(eq(legalStatutes.jurisdiction, input.jurisdiction));
        }

        // Add domain filter if provided
        if (input.domain) {
          conditions.push(sql`JSON_CONTAINS(${legalStatutes.domains}, ${JSON.stringify(input.domain)})`);
        }

        // Add keyword search - build OR condition for multiple keywords
        if (keywords.length > 0) {
          const searchConditions = keywords.map(kw =>
            sql`(${legalStatutes.title} LIKE ${`%${kw}%`} OR ${legalStatutes.summary} LIKE ${`%${kw}%`} OR ${legalStatutes.citation} LIKE ${`%${kw}%`})`
          );
          // Combine with OR
          let combined = searchConditions[0];
          for (let i = 1; i < searchConditions.length; i++) {
            combined = sql`${combined} OR ${searchConditions[i]}`;
          }
          conditions.push(combined);
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const statutes = await db.select().from(legalStatutes)
          .where(where)
          .limit(input.limit ?? 10);

        return {
          signalType: input.signalType,
          statutes: statutes.map(s => ({
            id: s.id,
            citation: s.citation,
            title: s.title,
            summary: s.summary,
            jurisdiction: s.jurisdiction,
            domains: s.domains,
            sourceUrl: (s as any).sourceUrl,
          })),
          count: statutes.length,
        };
      } catch (error) {
        console.error("Error finding statutes for signal:", error);
        return {
          signalType: input.signalType,
          statutes: [],
          count: 0,
          error: "Unable to find related statutes",
        };
      }
    }),

  /**
   * Find applicable statutes for a pattern
   * Input: pattern description, domain, jurisdiction
   * Output: List of relevant statutes
   */
  patternRelatedStatutes: publicProcedure
    .input(z.object({
      patternDescription: z.string(),
      domain: z.string().optional(),
      jurisdiction: z.string().optional(),
      limit: z.number().min(1).max(20).optional(),
    }))
    .query(async ({ input }) => {
      try {
        // Build search keywords from pattern description
        const keywords = input.patternDescription.toLowerCase().split(/[\s_-]+/).filter(k => k.length > 2);
        
        const conditions = [];
        
        if (input.jurisdiction) {
          conditions.push(eq(legalStatutes.jurisdiction, input.jurisdiction));
        }

        if (input.domain) {
          conditions.push(sql`JSON_CONTAINS(${legalStatutes.domains}, ${JSON.stringify(input.domain)})`);
        }

        // Add keyword search
        if (keywords.length > 0) {
          const searchConditions = keywords.map(kw =>
            sql`(${legalStatutes.title} LIKE ${`%${kw}%`} OR ${legalStatutes.summary} LIKE ${`%${kw}%`})`
          );
          let combined = searchConditions[0];
          for (let i = 1; i < searchConditions.length; i++) {
            combined = sql`${combined} OR ${searchConditions[i]}`;
          }
          conditions.push(combined);
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const statutes = await db.select().from(legalStatutes)
          .where(where)
          .limit(input.limit ?? 10);

        return {
          patternDescription: input.patternDescription,
          statutes: statutes.map(s => ({
            id: s.id,
            citation: s.citation,
            title: s.title,
            summary: s.summary,
            jurisdiction: s.jurisdiction,
            domains: s.domains,
            sourceUrl: (s as any).sourceUrl,
          })),
          count: statutes.length,
        };
      } catch (error) {
        console.error("Error finding statutes for pattern:", error);
        return {
          patternDescription: input.patternDescription,
          statutes: [],
          count: 0,
          error: "Unable to find related statutes",
        };
      }
    }),

  /**
   * Find precedents (case law) related to a pattern
   * Input: pattern description, domain, jurisdiction
   * Output: List of relevant cases with holdings and key quotes
   */
  patternRelatedPrecedents: publicProcedure
    .input(z.object({
      patternDescription: z.string(),
      domain: z.string().optional(),
      jurisdiction: z.string().optional(),
      limit: z.number().min(1).max(20).optional(),
    }))
    .query(async ({ input }) => {
      try {
        // Build search keywords from pattern description
        const keywords = input.patternDescription.toLowerCase().split(/[\s_-]+/).filter(k => k.length > 2);
        
        const conditions = [];
        
        if (input.jurisdiction) {
          conditions.push(eq(legalCaseLaw.jurisdiction, input.jurisdiction));
        }

        if (input.domain) {
          conditions.push(sql`JSON_CONTAINS(${legalCaseLaw.domains}, ${JSON.stringify(input.domain)})`);
        }

        // Add keyword search
        if (keywords.length > 0) {
          const searchConditions = keywords.map(kw =>
            sql`(${legalCaseLaw.caseName} LIKE ${`%${kw}%`} OR ${legalCaseLaw.holding} LIKE ${`%${kw}%`})`
          );
          let combined = searchConditions[0];
          for (let i = 1; i < searchConditions.length; i++) {
            combined = sql`${combined} OR ${searchConditions[i]}`;
          }
          conditions.push(combined);
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const cases = await db.select().from(legalCaseLaw)
          .where(where)
          .limit(input.limit ?? 10);

        return {
          patternDescription: input.patternDescription,
          precedents: cases.map(c => ({
            id: c.id,
            citation: c.citation,
            caseName: c.caseName,
            court: c.court,
            yearDecided: c.yearDecided,
            holding: c.holding,
            keyQuotes: c.keyQuotes,
            jurisdiction: c.jurisdiction,
            domains: c.domains,
            sourceUrl: (c as any).sourceUrl,
          })),
          count: cases.length,
        };
      } catch (error) {
        console.error("Error finding precedents for pattern:", error);
        return {
          patternDescription: input.patternDescription,
          precedents: [],
          count: 0,
          error: "Unable to find related precedents",
        };
      }
    }),

  /**
   * Find enforcement records related to a signal or pattern
   * Shows how agencies have handled similar issues
   */
  relatedEnforcementRecords: publicProcedure
    .input(z.object({
      query: z.string(),
      domain: z.string().optional(),
      jurisdiction: z.string().optional(),
      limit: z.number().min(1).max(20).optional(),
    }))
    .query(async ({ input }) => {
      try {
        const keywords = input.query.toLowerCase().split(/[\s_-]+/).filter(k => k.length > 2);
        
        const conditions = [];
        
        if (input.jurisdiction) {
          conditions.push(eq(legalEnforcementRecords.jurisdiction, input.jurisdiction));
        }

        if (input.domain) {
          conditions.push(sql`JSON_CONTAINS(${legalEnforcementRecords.domains}, ${JSON.stringify(input.domain)})`);
        }

        // Add keyword search
        if (keywords.length > 0) {
          const searchConditions = keywords.map(kw =>
            sql`(${legalEnforcementRecords.agencyName} LIKE ${`%${kw}%`} OR ${(legalEnforcementRecords as any).violationType} LIKE ${`%${kw}%`})`
          );
          let combined = searchConditions[0];
          for (let i = 1; i < searchConditions.length; i++) {
            combined = sql`${combined} OR ${searchConditions[i]}`;
          }
          conditions.push(combined);
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const records = await db.select().from(legalEnforcementRecords)
          .where(where)
          .limit(input.limit ?? 10);

        return {
          query: input.query,
          records: records.map(r => ({
            id: r.id,
            agencyName: r.agencyName,
            violationType: (r as any).violationType,
            jurisdiction: r.jurisdiction,
            outcome: r.outcome,
            penaltyAmount: (r as any).penaltyAmount,
        // @ts-ignore - dateEnforced is valid at runtime
            dateEnforced: r.dateEnforced,
            domains: r.domains,
            sourceUrl: (r as any).sourceUrl,
          })),
          count: records.length,
        };
      } catch (error) {
        console.error("Error finding enforcement records:", error);
        return {
          query: input.query,
          records: [],
          count: 0,
          error: "Unable to find related enforcement records",
        };
      }
    }),
});



// ============================================================
