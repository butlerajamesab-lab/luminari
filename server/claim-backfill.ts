/**
 * Claim Backfill — Repair Unlinked Findings
 * 
 * One-time surgical pass to link existing claims to existing findings.
 * 
 * Strategy: Document-scoped pre-filtering.
 * 1. Parse document IDs from finding description ("Document XXXXX states...")
 * 2. Load only claims from those specific documents (~19 claims/doc avg)
 * 3. Send one LLM call per finding with the pre-filtered candidate set
 * 
 * This reduces from ~117,000 LLM calls to ~322 calls.
 * No new claims are created. No documents are re-extracted.
 */

import { invokeLLMDeterministic } from "./_core/llm";
import { createHash } from "crypto";
import * as dbHelpers from "./db";
import { db } from "./db";
import { findings, claims } from "../drizzle/schema";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";

// ─── Types ───

interface BackfillResult {
  findingId: string;
  status: "linked" | "partial" | "no_match" | "error";
  matchedClaimIds: string[];
  confidence: "high" | "medium" | "low";
  error?: string;
}

interface BackfillSummary {
  totalFindings: number;
  linked: number;
  partial: number;
  noMatch: number;
  errors: number;
  testStubsCleaned: number;
}

// ─── Document Reference Extraction ───

/**
 * Extract document IDs referenced in a finding's description.
 * Patterns: "Document 90060 states", "Document 90060 also states"
 */
export function extractDocumentRefs(description: string): number[] {
  const matches = description.match(/Document\s+(\d+)/g) || [];
  const ids = Array.from(new Set(matches.map(m => parseInt(m.replace(/Document\s+/, "")))));
  return ids.filter(id => !isNaN(id) && id > 0);
}

// ─── Claim Matching via LLM ───

/**
 * Given a finding and a pre-filtered set of candidate claims (from referenced documents),
 * use LLM to identify which claims directly support the finding.
 * 
 * With document-scoped pre-filtering, candidate sets are typically 10-50 claims,
 * so this is always a single LLM call.
 */
async function matchClaimsToFinding(
  finding: { id: number | string; title: string | null; description: string | null; findingType: string | null },
  candidateClaims: Array<{ id: string; claimText: string; claimType: string | null; documentId: string | null }>
): Promise<{ matchedIds: string[]; confidence: "high" | "medium" | "low" }> {
  if (candidateClaims.length === 0) {
    return { matchedIds: [], confidence: "low" };
  }

  // With document-scoped filtering, batches are small enough for a single call
  // But still batch at 100 as a safety valve
  const BATCH_SIZE = 100;
  const allMatchedIds: string[] = [];

  for (let i = 0; i < candidateClaims.length; i += BATCH_SIZE) {
    const batch = candidateClaims.slice(i, i + BATCH_SIZE);
    const batchIds = await matchClaimBatch(finding, batch);
    allMatchedIds.push(...batchIds);
  }

  const confidence = allMatchedIds.length >= 3 ? "high" 
    : allMatchedIds.length >= 1 ? "medium" 
    : "low";

  return { matchedIds: allMatchedIds, confidence };
}

async function matchClaimBatch(
  finding: { id: number | string; title: string | null; description: string | null; findingType: string | null },
  batch: Array<{ id: string; claimText: string; claimType: string | null; documentId: string | null }>
): Promise<string[]> {
  const claimList = batch.map(c => 
    `[${c.id}] (doc ${c.documentId}, type: ${c.claimType}): ${c.claimText}`
  ).join("\n");

  // Derive deterministic hash from finding content + batch claim IDs
  const backfillHash = createHash("sha256")
    .update(`finding:${finding.id}:${finding.description}:claims:${batch.map(c => c.id).sort().join(",")}`)
    .digest("hex");

  const response = await invokeLLMDeterministic({
    documentHash: backfillHash,
    pass: "backfill",
    messages: [
      {
        role: "system",
        content: `You are a forensic claim matcher. Given a finding and a list of candidate claims, identify which claims directly support or are referenced by the finding.

RULES:
- Only match claims that are DIRECTLY relevant to the finding's content
- A claim supports a finding if the finding's description references the same facts, events, entities, or quotes as the claim
- Do NOT match tangentially related claims
- Return ONLY the claim IDs that are direct matches
- If no claims match, return an empty array
- Return valid JSON only`
      },
      {
        role: "user",
        content: `FINDING [${finding.id}]:
Title: ${finding.title ?? ""}
Type: ${finding.findingType ?? ""}
Description: ${finding.description ?? ""}

CANDIDATE CLAIMS:
${claimList}

Return JSON: { "matched_claim_ids": [<ids>] }`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "claim_match",
        strict: true,
        schema: {
          type: "object",
          properties: {
            matched_claim_ids: {
              type: "array",
              items: { type: "integer" }
            }
          },
          required: ["matched_claim_ids"],
          additionalProperties: false,
        }
      }
    }
  });

  const raw = response?.choices?.[0]?.message?.content;
  const content = typeof raw === "string" ? raw : "";
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    const ids = parsed.matched_claim_ids || [];
    // Validate: only return IDs that exist in the batch
    const validIds = new Set(batch.map(c => c.id));
    return ids.filter((id: string) => validIds.has(id));
  } catch {
    return [];
  }
}

// ─── Finding Linkage Updater ───

async function linkFindingToClaims(findingId: number, claimIds: string[]): Promise<void> {
  await db.update(findings)
    .set({ claimIds: claimIds as unknown as number[] })
    .where(eq(findings.id, findingId));
}

// ─── Test Stub Cleaner ───

/**
 * Soft-delete "Test Finding" stubs that have no documents in their case.
 * These are scaffold artifacts from case creation, not real findings.
 */
async function cleanTestStubs(): Promise<number> {
  const testStubs = await db.select({ id: findings.id, caseId: findings.caseId })
    .from(findings)
    .where(eq(findings.title, "Test Finding"));

  let cleaned = 0;
  for (const stub of testStubs) {
    await db.delete(findings).where(eq(findings.id, stub.id));
    cleaned++;
  }

  return cleaned;
}

// ─── Bulk Backfill Orchestrator ───

export async function runClaimBackfill(caseId?: number): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    totalFindings: 0,
    linked: 0,
    partial: 0,
    noMatch: 0,
    errors: 0,
    testStubsCleaned: 0,
  };

  // Step 1: Clean test stubs first
  console.log("[Backfill] Cleaning test stubs...");
  summary.testStubsCleaned = await cleanTestStubs();
  console.log(`[Backfill] Cleaned ${summary.testStubsCleaned} test stubs`);

  // Step 2: Find all unlinked findings (after stub cleanup)
  let unlinkedFindings;
  if (caseId) {
    unlinkedFindings = await db.select()
      .from(findings)
      .where(and(
        eq(findings.caseId, String(caseId)),
        isNull(findings.claimIds)
      ));
  } else {
    unlinkedFindings = await db.select()
      .from(findings)
      .where(isNull(findings.claimIds));
  }

  summary.totalFindings = unlinkedFindings.length;
  console.log(`[Backfill] Found ${unlinkedFindings.length} unlinked findings to repair`);

  if (unlinkedFindings.length === 0) {
    return summary;
  }

  // Step 3: Group findings by case for efficient claim loading
  const findingsByCase = new Map<number, typeof unlinkedFindings>();
  for (const f of unlinkedFindings) {
    const existing = findingsByCase.get(f.caseId) || [];
    existing.push(f);
    findingsByCase.set(f.caseId, existing);
  }

  // Step 4: Process each case with document-scoped pre-filtering
  for (const [caseFindingCaseId, caseFindings] of Array.from(findingsByCase.entries())) {
    console.log(`[Backfill] Case ${caseFindingCaseId}: ${caseFindings.length} findings`);

    // Build a document→claims index for this case (loaded once per case)
    const caseClaims = await dbHelpers.listClaims(caseFindingCaseId);
    
    if (caseClaims.length === 0) {
      console.log(`[Backfill] Case ${caseFindingCaseId}: 0 claims available, marking ${caseFindings.length} findings as no_match`);
      for (const f of caseFindings) {
        await linkFindingToClaims(f.id, []);
      }
      summary.noMatch += caseFindings.length;
      continue;
    }

    // Index claims by documentId for O(1) lookup
    const claimsByDoc = new Map<number, typeof caseClaims>();
    for (const c of caseClaims) {
      const existing = claimsByDoc.get(c.documentId) || [];
      existing.push(c);
      claimsByDoc.set(c.documentId, existing);
    }

    console.log(`[Backfill] Case ${caseFindingCaseId}: ${caseClaims.length} claims across ${claimsByDoc.size} documents`);

    // Process each finding — pre-filter claims by referenced documents
    for (let i = 0; i < caseFindings.length; i++) {
      const finding = caseFindings[i];
      try {
        // Extract document IDs from finding description
        const docRefs = extractDocumentRefs(finding.description);
        
        // Collect claims only from referenced documents
        const candidateClaims: typeof caseClaims = [];
        for (const docId of docRefs) {
          const docClaims = claimsByDoc.get(docId) || [];
          candidateClaims.push(...docClaims);
        }

        if (candidateClaims.length === 0) {
          console.log(`[Backfill] Finding ${finding.id} (${i+1}/${caseFindings.length}): no claims in referenced docs [${docRefs.join(",")}]`);
          await linkFindingToClaims(finding.id, []);
          summary.noMatch++;
          continue;
        }

        const result = await matchClaimsToFinding(
          {
            id: finding.id,
            title: finding.title,
            description: finding.description,
            findingType: finding.findingType,
          },
          candidateClaims.map((c: any) => ({
            id: c.id,
            claimText: c.claimText,
            claimType: c.claimType,
            documentId: c.documentId,
          }))
        );

        if (result.matchedIds.length > 0) {
          await linkFindingToClaims(finding.id, result.matchedIds);
          console.log(`[Backfill] Finding ${finding.id} (${i+1}/${caseFindings.length}): linked to ${result.matchedIds.length} claims (confidence: ${result.confidence})`);
          
          if (result.confidence === "high") {
            summary.linked++;
          } else {
            summary.partial++;
          }
        } else {
          console.log(`[Backfill] Finding ${finding.id} (${i+1}/${caseFindings.length}): no matching claims found`);
          await linkFindingToClaims(finding.id, []);
          summary.noMatch++;
        }
      } catch (err) {
        console.error(`[Backfill] Finding ${finding.id} (${i+1}/${caseFindings.length}): error`, err);
        summary.errors++;
      }
    }
  }

  console.log(`[Backfill] Complete:`, summary);
  return summary;
}

// ─── Exported for testing ───
export { matchClaimsToFinding, linkFindingToClaims, cleanTestStubs };
export type { BackfillResult, BackfillSummary };
