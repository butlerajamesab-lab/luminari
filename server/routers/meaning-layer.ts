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

// ─── Static Signal Interpretation Lookup ───

const SIGNAL_INTERPRETATIONS: Record<string, string> = {
  "02_resource_contacts": "This signal identifies a resource contact point — an agency, organization, or individual that can provide assistance. It indicates that a potential support pathway has been mapped for your situation.",
  "location": "This signal identifies a geographic location relevant to your case. Locations help establish jurisdiction, identify responsible agencies, and connect you with local resources.",
  "resource": "This signal identifies a resource that may be available to help with your situation. Resources include programs, services, legal aid, and other forms of assistance.",
  "01_resources": "This signal identifies a documented resource entry in the system. It represents a verified program, service, or support pathway that has been cataloged for reference.",
  "contact": "This signal identifies a contact person or office relevant to your case. Having the right contact information is critical for navigating bureaucratic systems effectively.",
  "nyc-housing-complaint": "This signal relates to a housing complaint filed in New York City. NYC housing complaints often indicate patterns of landlord neglect, code violations, or tenant rights issues that may have legal remedies.",
  "weak_joint": "This signal identifies a weak connection between two pieces of evidence or claims in your case. Weak joints indicate areas where additional documentation or corroboration may strengthen your position.",
  "contradiction": "This signal identifies a contradiction in the record — two statements, documents, or data points that conflict with each other. Contradictions can indicate errors, inconsistencies in official accounts, or potential evidence of misconduct.",
  "inconsistency": "This signal identifies an inconsistency in the documentation or narrative. While not a direct contradiction, inconsistencies suggest that further investigation may reveal important discrepancies.",
  "missing_evidence": "This signal identifies evidence that should exist based on standard procedures but is absent from the record. Missing evidence can indicate incomplete investigations, destroyed records, or deliberate omissions.",
  "INGESTION_SIGNAL": "This signal was generated during document ingestion. It indicates that the system has processed new information and identified something noteworthy during initial analysis.",
  "FORM_SIGNAL": "This signal was generated from a form submission. It captures structured information provided directly by a user or intake process.",
  "REAL_DOCUMENT_SIGNAL": "This signal was generated from analysis of an actual document. It represents a finding extracted from official records, correspondence, or other documentary evidence.",
  "gap": "This signal identifies a gap in the record — information that is expected but missing. Gaps may indicate areas where additional records requests or investigation are needed.",
};

/**
 * Strip numeric suffixes from signal types to match the base type.
 * e.g., "contradiction_262205" → "contradiction"
 */
function getBaseSignalType(signalType: string): string {
  return signalType.replace(/_\d+$/, "");
}

function getStaticInterpretation(signalType: string, severity?: string): string {
  const baseType = getBaseSignalType(signalType);
  const lookup = SIGNAL_INTERPRETATIONS[baseType];
  if (lookup) return lookup;
  return `This signal of type ${signalType} with severity ${severity || "unknown"} has been detected and requires review.`;
}

// ─── Signal Interpretation ───

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
            signal_type: input.signalType,
            interpretation: input.plainLanguageExplanation,
            source: "provided",
          };
        }

        // Use static lookup for interpretation
        const interpretation = getStaticInterpretation(input.signalType, input.severity);

        return {
          signal_type: input.signalType,
          interpretation,
          source: "static",
        };
      } catch (error) {
        console.error("Error interpreting signal:", error);
        return {
          signal_type: input.signalType,
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
          signal_type: input.signalType,
          statutes: statutes.map((s: any) => ({
            id: s.id,
            citation: s.citation,
            title: s.title,
            summary: s.summary,
            jurisdiction: s.jurisdiction,
            domains: s.domains,
            source_url: (s as any).sourceUrl,
          })),
          count: statutes.length,
        };
      } catch (error) {
        console.error("Error finding statutes for signal:", error);
        return {
          signal_type: input.signalType,
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
          pattern_description: input.patternDescription,
          statutes: statutes.map((s: any) => ({
            id: s.id,
            citation: s.citation,
            title: s.title,
            summary: s.summary,
            jurisdiction: s.jurisdiction,
            domains: s.domains,
            source_url: (s as any).sourceUrl,
          })),
          count: statutes.length,
        };
      } catch (error) {
        console.error("Error finding statutes for pattern:", error);
        return {
          pattern_description: input.patternDescription,
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
          pattern_description: input.patternDescription,
          precedents: cases.map((c: any) => ({
            id: c.id,
            citation: c.citation,
            case_name: c.caseName,
            court: c.court,
            year_decided: c.yearDecided,
            holding: c.holding,
            key_quotes: c.keyQuotes,
            jurisdiction: c.jurisdiction,
            domains: c.domains,
            source_url: (c as any).sourceUrl,
          })),
          count: cases.length,
        };
      } catch (error) {
        console.error("Error finding precedents for pattern:", error);
        return {
          pattern_description: input.patternDescription,
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
          records: records.map((r: any) => ({
            id: r.id,
            agency_name: r.agencyName,
            violation_type: (r as any).violationType,
            jurisdiction: r.jurisdiction,
            outcome: r.outcome,
            penalty_amount: (r as any).penaltyAmount,
        // @ts-ignore - dateEnforced is valid at runtime
            date_enforced: r.dateEnforced,
            domains: r.domains,
            source_url: (r as any).sourceUrl,
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
