/**
 * Knowledge Health Router
 * 
 * Exposes freshness monitoring and gap analysis through tRPC endpoints.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllFreshnessRecords,
  getFreshnessSummary,
  runFreshnessCheck,
  initializeFreshness,
} from "../knowledge-freshness-service";
import {
  calculateCoverage,
  getCoverageMetrics,
  getCellDetail,
} from "../knowledge-coverage-service";

export const knowledgeHealthRouter = router({
  // ── Freshness Monitoring ──
  freshnessRecords: protectedProcedure.query(async () => {
    return getAllFreshnessRecords();
  }),

  freshnessSummary: protectedProcedure.query(async () => {
    return getFreshnessSummary();
  }),

  runFreshnessCheck: protectedProcedure.mutation(async () => {
    return runFreshnessCheck();
  }),

  initializeFreshness: protectedProcedure.mutation(async () => {
    await initializeFreshness();
    return { success: true };
  }),

  // ── Coverage / Gap Analysis ──
  coverageMetrics: protectedProcedure.query(async () => {
    return getCoverageMetrics();
  }),

  calculateCoverage: protectedProcedure.mutation(async () => {
    return calculateCoverage();
  }),

  cellDetail: protectedProcedure
    .input(z.object({
      jurisdiction: z.string(),
      claimType: z.string(),
    }))
    .query(async ({ input }) => {
      return getCellDetail(input.jurisdiction, input.claimType);
    }),

  // ── Quarterly Backbone Refresh Prompt Generator ──
  generateQuarterlyRefreshPrompt: protectedProcedure.mutation(async () => {
    const freshness = await runFreshnessCheck();
    const today = new Date().toISOString().split('T')[0];
    const overallScore = (freshness as any).summary?.overallScore ?? 0;
    const records: any[] = (freshness as any).records ?? [];

    const empty = records.filter((r) => r.recordCount === 0);
    const stale = records.filter((r) => r.recordCount > 0 && r.freshnessScore < 50);
    const underpopulated = records.filter((r) => r.recordCount > 0 && r.recordCount < 10 && r.freshnessScore >= 50);

    const fmtList = (arr: any[], extra = '') =>
      arr.map((t) => `- **${t.displayName}** (\`${t.tableName}\`)${extra ? ` — ${t[extra]}` : ''}`).join('\n');

    const prompt = `# Quarterly Knowledge Backbone Refresh — ${today}

## System Status
- Overall Freshness Score: ${overallScore}/100
- Empty Tables (${empty.length}): ${empty.map((t) => t.displayName).join(', ') || 'None'}
- Stale Tables (score < 50) (${stale.length}): ${stale.map((t) => `${t.displayName} (${t.freshnessScore})`).join(', ') || 'None'}
- Underpopulated Tables (${underpopulated.length}): ${underpopulated.map((t) => `${t.displayName} (${t.recordCount} records)`).join(', ') || 'None'}

## Your Task
You are populating the knowledge backbone of a legal case analysis platform used by advocates and self-represented litigants. Produce a single JSON object with one key per table listed below. Each table key maps to an array of records.

## Priority Tables
${empty.length > 0 ? `
### CRITICAL — Empty Tables (fill these first, minimum 10 records each)
${fmtList(empty)}` : ''}
${stale.length > 0 ? `
### HIGH — Stale Tables (update or supplement, minimum 5 new records each)
${fmtList(stale, 'freshnessScore')}` : ''}
${underpopulated.length > 0 ? `
### MEDIUM — Underpopulated Tables (expand coverage, minimum 5 records each)
${fmtList(underpopulated, 'recordCount')}` : ''}

## Data Quality Standards
- **Attribution-first language**: Every description field must begin with the authoritative source ("42 U.S.C. \u00a7 3613 provides...", "Courts have held...", "The EEOC requires...")
- **No inference language**: Do not write "likely", "probably", "may", "might" — only cite what the statute or case law actually says
- **No null values**: Every required field must have a value
- **last_verified**: Include the date you are confident the information was accurate (ISO format: YYYY-MM-DD)
- **verification_source**: Cite the specific statute, regulation, agency data publication, or case citation that supports each record
- **Margin fields** (for recovery projections): Include \`base_estimate\`, \`margin_percent\`, and \`volatility_source\` per jurisdiction per claim type

## Jurisdiction Priority Order
Federal → Washington State → California → New York → Texas → Illinois → Florida

## Output Format
Return a single JSON object. No markdown wrapping. No explanatory text outside the JSON.
\`\`\`json
{
  "table_name": [
    { "field1": "value", "last_verified": "${today}", "verification_source": "29 C.F.R. \u00a7 1977.18" }
  ]
}
\`\`\`
`;

    return {
      prompt,
      generatedAt: Date.now(),
      stats: {
        overallScore,
        emptyCount: empty.length,
        staleCount: stale.length,
        underpopulatedCount: underpopulated.length,
        tablesNeedingAttention: empty.length + stale.length + underpopulated.length,
      },
    };
  }),
});
