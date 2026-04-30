/**
 * CDA v1.0-PATCH3 — Run Orchestrator
 *
 * Minimal interface. Deterministic pipeline calls.
 * No smart retries. No UI. No helper intelligence.
 *
 * Inputs:
 *   - run_id (generated)
 *   - doc_policy, doc_denial, doc_claim_summary (file refs + metadata)
 *   - spec_version = 1.0-PATCH3
 *
 * Outputs:
 *   - persisted S1–S8 rows (even partial)
 *   - stored run_status with run_complete, unmet_end_conditions[], failure_flags[]
 *   - T7 transcripts for audit trail
 */

import { SPEC_VERSION } from "./cda-patterns";
import * as cdaDb from "./cda-db";
import { validateEndCondition, type EndConditionResult } from "./cda-end-condition";
import {
  executeT1,
  executeT2,
  executeT3,
  executeT4,
  executeT5,
  executeT6,
  executeT7,
  executeT8,
  executeT9,
  type T7Result,
} from "./cda-pipeline";

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export interface CdaInputDocument {
  /** Reference to the existing document ID in the main documents table */
  sourceDocumentId: number;
  /** Full text content of the document */
  textContent: string;
  /** Original file name */
  fileName: string;
  /** Number of pages (if known) */
  pageCount?: number;
  /** Pre-computed hash (SHA-256 of textContent) */
  hash: string;
}

export interface CdaRunInput {
  caseId: number;
  userId: number;
  policy: CdaInputDocument;
  denial: CdaInputDocument;
  claimSummary: CdaInputDocument;
}

export interface CdaPipelineResult {
  runId: number;
  status: string;
  endCondition: EndConditionResult;
  activeFailureFlags: string[];
  /** T7 audit data */
  t7Result?: T7Result;
  /** Artifacts O1–O4 as structured data */
  artifacts?: {
    o1_document_index: any;
    o2_comparison_matrix: any;
    o3_gap_register: any;
    o4_contradiction_register: any;
  };
}

type PipelineStage = "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7" | "T8" | "T9";

const STAGE_ORDER: PipelineStage[] = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"];

// ═══════════════════════════════════════════════════════════════════════
// Orchestrator
// ═══════════════════════════════════════════════════════════════════════

export async function runCdaPipeline(input: CdaRunInput): Promise<CdaPipelineResult> {
  // Create run record
  const runId = await cdaDb.createRun({
    caseId: input.caseId,
    userId: input.userId,
    policyDocId: input.policy.sourceDocumentId,
    denialDocId: input.denial.sourceDocumentId,
    claimSummaryDocId: input.claimSummary.sourceDocumentId,
  });

  await cdaDb.updateRunStatus(runId, "running");

  const failureFlags: string[] = [];
  let currentStage: PipelineStage = "T1";
  let t7Result: T7Result | undefined;

  try {
    // ─── T1: Document Classification ───
    currentStage = "T1";
    const { docIds } = await executeT1(runId, input);

    // ─── T2: Quote Extraction ───
    currentStage = "T2";
    await executeT2(runId, input, docIds);

    // ─── T3: Entity Normalization ───
    currentStage = "T3";
    await executeT3(runId);

    // ─── T4: Denial Reason Parsing ───
    currentStage = "T4";
    const t4Flags = await executeT4(runId);
    failureFlags.push(...t4Flags);

    // ─── T5: Policy Clause Parsing ───
    currentStage = "T5";
    const t5Flags = await executeT5(runId);
    failureFlags.push(...t5Flags);

    // ─── T6: Linking ───
    currentStage = "T6";
    const t6Flags = await executeT6(runId);
    failureFlags.push(...t6Flags);

    // ─── T7: Semantic Comparison (controlled judgment layer) ───
    currentStage = "T7";
    t7Result = await executeT7(runId);

    // ─── T8: Contradiction Detection ───
    currentStage = "T8";
    await executeT8(runId);

    // ─── T9: Artifact Generation ───
    // Artifacts are generated BEFORE validation.
    // Artifacts are part of inspection, not reward for passing validation.
    currentStage = "T9";
    await executeT9(runId);

    // ─── End Condition Validation ───
    // Runs after T9 so C9 can verify artifacts exist.
    await cdaDb.updateRunStatus(runId, "validating", {
      activeFailureFlags: failureFlags,
    });

    const endCondition = await validateEndCondition(runId);

    const finalStatus = endCondition.runComplete ? "complete" : "incomplete";
    await cdaDb.updateRunStatus(runId, finalStatus, {
      endConditionMet: endCondition.runComplete,
      unmetCriteria: endCondition.unmetConditions.map(String),
      activeFailureFlags: failureFlags,
      completedAt: Date.now(),
    });

    // Build artifacts snapshot
    const snapshot = await cdaDb.getFullRunSnapshot(runId);
    const artifacts = {
      o1_document_index: snapshot.s1_documents,
      o2_comparison_matrix: snapshot.s6_comparison_matrix,
      o3_gap_register: snapshot.s7_evidence_gaps,
      o4_contradiction_register: snapshot.s8_contradictions,
    };

    // ─── Pattern Detection Hook (Session 8): detect denial_language_pattern from CDA results ───
    try {
      const { runPatternDetection } = await import("./pattern-detection");
      const patternResult = await runPatternDetection({
        caseId: input.caseId,
        cdaRunId: runId,
      });
      if (patternResult.totalRegistered > 0) {
        console.log(`[CDA] Pattern detection: ${patternResult.totalRegistered} new denial language patterns registered for run ${runId}`);
        // Notify case owner
        try {
          const { createNotification } = await import("./db");
          await createNotification({
            userId: input.userId,
            type: "pattern_detected" as any,
            title: "Cross-Case Pattern Detected",
            message: `${patternResult.totalRegistered} new systemic denial pattern(s) identified from Claim Denial Analysis.`,
            metadata: { caseId: input.caseId, cdaRunId: runId, ...patternResult.results },
            linkUrl: `/case/${input.caseId}`,
          });
        } catch (notifErr) {
          console.warn("[CDA] Pattern notification failed (non-blocking):", notifErr);
        }
      }
    } catch (patternErr) {
      console.warn("[CDA] Pattern detection hook failed (non-blocking):", patternErr);
    }

    return {
      runId,
      status: finalStatus,
      endCondition,
      activeFailureFlags: failureFlags,
      t7Result,
      artifacts,
    };

  } catch (error: any) {
    await cdaDb.updateRunStatus(runId, `error_at_${currentStage}`, {
      activeFailureFlags: failureFlags,
      errorMessage: error.message ?? String(error),
      completedAt: Date.now(),
    });

    const endCondition = await validateEndCondition(runId);

    return {
      runId,
      status: `error_at_${currentStage}`,
      endCondition,
      activeFailureFlags: failureFlags,
      t7Result,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Run Bundle Export — Full snapshot for external review
// ═══════════════════════════════════════════════════════════════════════

export interface CdaRunBundle {
  meta: {
    runId: number;
    specVersion: string;
    exportedAt: number;
    inputHashes: {
      policy: string;
      denial: string;
      claimSummary: string;
    };
  };
  s1_documents: any[];
  s2_quotes: any[];
  s3_claim_ledger: any;
  s4_denial_reasons: any[];
  s5_policy_clauses: any[];
  s6_comparison_matrix: any[];
  s7_evidence_gaps: any[];
  s8_contradictions: any[];
  t7_transcripts: any[];
  end_condition: EndConditionResult;
  failure_flags: string[];
}

export async function exportRunBundle(runId: number, t7Transcripts?: any[]): Promise<CdaRunBundle> {
  const snapshot = await cdaDb.getFullRunSnapshot(runId);
  const endCondition = await validateEndCondition(runId);

  // Get run metadata
  const run = await cdaDb.getRun(runId);

  // Get input hashes from S1 documents
  const docs = snapshot.s1_documents;
  const policyDoc = docs.find((d: any) => d.docType === "policy");
  const denialDoc = docs.find((d: any) => d.docType === "denial");
  const claimDoc = docs.find((d: any) => d.docType === "claim_summary");

  return {
    meta: {
      runId,
      specVersion: SPEC_VERSION,
      exportedAt: Date.now(),
      inputHashes: {
        policy: policyDoc?.hash ?? "",
        denial: denialDoc?.hash ?? "",
        claimSummary: claimDoc?.hash ?? "",
      },
    },
    s1_documents: snapshot.s1_documents,
    s2_quotes: snapshot.s2_quotes,
    s3_claim_ledger: snapshot.s3_claim_ledger,
    s4_denial_reasons: snapshot.s4_denial_reasons,
    s5_policy_clauses: snapshot.s5_policy_clauses,
    s6_comparison_matrix: snapshot.s6_comparison_matrix,
    s7_evidence_gaps: snapshot.s7_evidence_gaps,
    s8_contradictions: snapshot.s8_contradictions,
    t7_transcripts: t7Transcripts ?? [],
    end_condition: endCondition,
    failure_flags: (run?.activeFailureFlags as string[]) ?? [],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Diff Harness — Compare two run bundles for deterministic replay check
// ═══════════════════════════════════════════════════════════════════════

export interface DiffResult {
  identical: boolean;
  differences: DiffEntry[];
}

export interface DiffEntry {
  path: string;
  type: "added" | "removed" | "changed";
  expected: any;
  actual: any;
}

/**
 * Compare two run bundles for structural parity.
 * Ignores: timestamps (exportedAt, startedAt, completedAt), auto-increment IDs,
 * T7 transcript timestamps, and t7TranscriptId (contains timestamps).
 * Everything else must match exactly.
 */
export function diffRunBundles(bundleA: CdaRunBundle, bundleB: CdaRunBundle): DiffResult {
  const differences: DiffEntry[] = [];

  // Compare meta (skip exportedAt)
  if (bundleA.meta.specVersion !== bundleB.meta.specVersion) {
    differences.push({
      path: "meta.specVersion",
      type: "changed",
      expected: bundleA.meta.specVersion,
      actual: bundleB.meta.specVersion,
    });
  }
  if (JSON.stringify(bundleA.meta.inputHashes) !== JSON.stringify(bundleB.meta.inputHashes)) {
    differences.push({
      path: "meta.inputHashes",
      type: "changed",
      expected: bundleA.meta.inputHashes,
      actual: bundleB.meta.inputHashes,
    });
  }

  // Compare each S-table (strip IDs and timestamps)
  const tables: Array<{ key: keyof CdaRunBundle; name: string }> = [
    { key: "s1_documents", name: "S1" },
    { key: "s2_quotes", name: "S2" },
    { key: "s4_denial_reasons", name: "S4" },
    { key: "s5_policy_clauses", name: "S5" },
    { key: "s6_comparison_matrix", name: "S6" },
    { key: "s7_evidence_gaps", name: "S7" },
    { key: "s8_contradictions", name: "S8" },
  ];

  for (const { key, name } of tables) {
    const rowsA = bundleA[key] as any[];
    const rowsB = bundleB[key] as any[];

    if (!Array.isArray(rowsA) || !Array.isArray(rowsB)) {
      if (JSON.stringify(rowsA) !== JSON.stringify(rowsB)) {
        differences.push({ path: name, type: "changed", expected: rowsA, actual: rowsB });
      }
      continue;
    }

    if (rowsA.length !== rowsB.length) {
      differences.push({
        path: `${name}.length`,
        type: "changed",
        expected: rowsA.length,
        actual: rowsB.length,
      });
      continue;
    }

    for (let i = 0; i < rowsA.length; i++) {
      const a = stripVolatileFields(rowsA[i]);
      const b = stripVolatileFields(rowsB[i]);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        differences.push({
          path: `${name}[${i}]`,
          type: "changed",
          expected: a,
          actual: b,
        });
      }
    }
  }

  // Compare S3 (single object)
  const s3a = stripVolatileFields(bundleA.s3_claim_ledger);
  const s3b = stripVolatileFields(bundleB.s3_claim_ledger);
  if (JSON.stringify(s3a) !== JSON.stringify(s3b)) {
    differences.push({ path: "S3", type: "changed", expected: s3a, actual: s3b });
  }

  // Compare end condition
  if (bundleA.end_condition.runComplete !== bundleB.end_condition.runComplete) {
    differences.push({
      path: "end_condition.runComplete",
      type: "changed",
      expected: bundleA.end_condition.runComplete,
      actual: bundleB.end_condition.runComplete,
    });
  }

  // Compare failure flags (order-independent)
  const flagsA = [...bundleA.failure_flags].sort();
  const flagsB = [...bundleB.failure_flags].sort();
  if (JSON.stringify(flagsA) !== JSON.stringify(flagsB)) {
    differences.push({
      path: "failure_flags",
      type: "changed",
      expected: flagsA,
      actual: flagsB,
    });
  }

  // Compare T7 transcripts (strip timestamps and LLM response content)
  const t7a = bundleA.t7_transcripts.map(stripT7Volatile);
  const t7b = bundleB.t7_transcripts.map(stripT7Volatile);
  if (t7a.length !== t7b.length) {
    differences.push({
      path: "t7_transcripts.length",
      type: "changed",
      expected: t7a.length,
      actual: t7b.length,
    });
  } else {
    for (let i = 0; i < t7a.length; i++) {
      // For deterministic rows, everything should match
      // For LLM rows, only resolutionMethod and finalMatchType are compared
      if (t7a[i].resolutionMethod === "deterministic" && t7b[i].resolutionMethod === "deterministic") {
        if (JSON.stringify(t7a[i]) !== JSON.stringify(t7b[i])) {
          differences.push({
            path: `t7_transcripts[${i}]`,
            type: "changed",
            expected: t7a[i],
            actual: t7b[i],
          });
        }
      } else {
        // LLM rows: compare structure but not content
        if (t7a[i].resolutionMethod !== t7b[i].resolutionMethod) {
          differences.push({
            path: `t7_transcripts[${i}].resolutionMethod`,
            type: "changed",
            expected: t7a[i].resolutionMethod,
            actual: t7b[i].resolutionMethod,
          });
        }
      }
    }
  }

  return { identical: differences.length === 0, differences };
}

/** Strip volatile fields (IDs, timestamps) from a row for comparison */
function stripVolatileFields(row: any): any {
  if (!row || typeof row !== "object") return row;
  // Strip all auto-increment IDs and timestamps — these differ between runs
  // but the structural content (text, tags, types) is what we compare
  const { id, runId, startedAt, completedAt, t7TranscriptId, docId, reasonId, clauseId, linkedReasonIds, linkedQuoteIds, sourceQuoteIds, supportingQuoteIds, ...rest } = row;

  // Deep-strip quoteId from S3.sourceQuotes array (quoteIds are auto-increment)
  if (rest.sourceQuotes && Array.isArray(rest.sourceQuotes)) {
    rest.sourceQuotes = rest.sourceQuotes.map((sq: any) => {
      const { quoteId, ...sqRest } = sq;
      return sqRest;
    });
  }

  return rest;
}

/** Strip volatile fields from T7 transcript for comparison */
function stripT7Volatile(transcript: any): any {
  if (!transcript || typeof transcript !== "object") return transcript;
  const { timestamp, llmResponse, rowId, reasonId, clauseId, ...rest } = transcript;
  return rest;
}

// ═══════════════════════════════════════════════════════════════════════
// Replay Support — Wipe-and-rebuild from a specific stage
// ═══════════════════════════════════════════════════════════════════════

export async function replayFromStage(
  runId: number,
  input: CdaRunInput,
  fromStage: "T2" | "T3" | "T4" | "T5" | "T6" | "T7" | "T8" | "T9",
): Promise<CdaPipelineResult> {
  await cdaDb.wipeFromStage(runId, fromStage);
  await cdaDb.updateRunStatus(runId, `replaying_from_${fromStage}`);

  const failureFlags: string[] = [];
  let t7Result: T7Result | undefined;
  let replayDocIds: Map<string, number> | undefined;
  const stageIdx = STAGE_ORDER.indexOf(fromStage);

  try {
    for (let i = stageIdx; i < STAGE_ORDER.length; i++) {
      const stage = STAGE_ORDER[i];
      switch (stage) {
        case "T1": { const r = await executeT1(runId, input); replayDocIds = r.docIds; } break;
        case "T2": await executeT2(runId, input, replayDocIds!); break;
        case "T3": await executeT3(runId); break;
        case "T4": failureFlags.push(...await executeT4(runId)); break;
        case "T5": failureFlags.push(...await executeT5(runId)); break;
        case "T6": failureFlags.push(...await executeT6(runId)); break;
        case "T7": t7Result = await executeT7(runId); break;
        case "T8": await executeT8(runId); break;
        case "T9": await executeT9(runId); break;
      }
    }

    const endCondition2 = await validateEndCondition(runId);
    const finalStatus2 = endCondition2.runComplete ? "complete" : "incomplete";
    await cdaDb.updateRunStatus(runId, finalStatus2, {
      endConditionMet: endCondition2.runComplete,
      unmetCriteria: endCondition2.unmetConditions.map(String),
      activeFailureFlags: failureFlags,
      completedAt: Date.now(),
    });

    const snapshot2 = await cdaDb.getFullRunSnapshot(runId);
    return {
      runId,
      status: finalStatus2,
      endCondition: endCondition2,
      activeFailureFlags: failureFlags,
      t7Result,
      artifacts: {
        o1_document_index: snapshot2.s1_documents,
        o2_comparison_matrix: snapshot2.s6_comparison_matrix,
        o3_gap_register: snapshot2.s7_evidence_gaps,
        o4_contradiction_register: snapshot2.s8_contradictions,
      },
    };
  } catch (error: any) {
    await cdaDb.updateRunStatus(runId, "error", {
      activeFailureFlags: failureFlags,
      errorMessage: error.message ?? String(error),
      completedAt: Date.now(),
    });
    const endCondition3 = await validateEndCondition(runId);
    return {
      runId,
      status: "error",
      endCondition: endCondition3,
      activeFailureFlags: failureFlags,
      t7Result,
    };
  }
}
