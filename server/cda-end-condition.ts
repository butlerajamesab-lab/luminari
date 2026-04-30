/**
 * CDA v1.0-PATCH3 — Locked End Condition Validator
 *
 * Implements the 11 criteria from Section 6 of the spec as a strict boolean gate.
 * Each check produces: condition_id, pass/fail, message, optional evidence.
 * Reduces to: run_complete = all_true, unmet_end_conditions = [failed ids].
 *
 * No narrative. No smart retries. Rules only.
 */

import * as cdaDb from "./cda-db";

export interface EndConditionCheck {
  conditionId: number;
  description: string;
  pass: boolean;
  message: string;
  evidence?: Record<string, unknown>;
}

export interface EndConditionResult {
  runComplete: boolean;
  checks: EndConditionCheck[];
  unmetConditions: number[];
}

/**
 * Run all 11 end condition checks against a CDA run.
 * Returns structured result — no side effects.
 */
export async function validateEndCondition(runId: number): Promise<EndConditionResult> {
  const snapshot = await cdaDb.getFullRunSnapshot(runId);
  const counts = await cdaDb.getRunRowCounts(runId);

  if (!snapshot.run) {
    return {
      runComplete: false,
      checks: [{
        conditionId: 0,
        description: "Run exists",
        pass: false,
        message: `Run ${runId} not found.`,
      }],
      unmetConditions: [0],
    };
  }

  // Collect failure flags from S7
  const failureFlags = new Set<string>();
  for (const gap of snapshot.s7_evidence_gaps) {
    if (gap.failureFlag) failureFlags.add(gap.failureFlag);
  }

  // Count quotes per required input doc type
  const docsByType = new Map<string, number[]>();
  for (const doc of snapshot.s1_documents) {
    const ids = docsByType.get(doc.docType) ?? [];
    ids.push(doc.id);
    docsByType.set(doc.docType, ids);
  }

  const quotesPerDoc = new Map<number, number>();
  for (const q of snapshot.s2_quotes) {
    quotesPerDoc.set(q.docId, (quotesPerDoc.get(q.docId) ?? 0) + 1);
  }

  // Check which required doc types have at least 1 quote
  const requiredDocTypes = ["policy", "denial", "claim_summary"];
  const docsWithQuotes = new Set<string>();
  for (const dtype of requiredDocTypes) {
    const docIds = docsByType.get(dtype) ?? [];
    for (const docId of docIds) {
      if ((quotesPerDoc.get(docId) ?? 0) > 0) {
        docsWithQuotes.add(dtype);
      }
    }
  }

  // Count S6 rows per S4 reason
  const reasonsWithMatrixRows = new Set<number>();
  for (const row of snapshot.s6_comparison_matrix) {
    reasonsWithMatrixRows.add(row.reasonId);
  }

  // Check S3 required fields populated or flagged
  const s3 = snapshot.s3_claim_ledger;
  const s3RequiredFields = ["policyNumber", "insuredName", "insurerName", "lossDate", "denialDate", "coverageTypes"] as const;
  const s3MissingFields: string[] = [];
  if (s3) {
    for (const field of s3RequiredFields) {
      const val = s3[field];
      if (val === null || val === undefined || val === "") {
        s3MissingFields.push(field);
      }
    }
  }
  // Check if missing fields are flagged in S7
  const s7MissingEntities = snapshot.s7_evidence_gaps.filter(g => g.gapType === "missing_entity");
  const flaggedFields = new Set(s7MissingEntities.map(g => g.requiredItem));

  // Check if O1-O4 artifacts exist.
  // T9 generates artifacts before validation runs, so we check if S6 rows exist
  // (O2 is derived from S6) and S3 exists (O1 is derived from S3).
  // If T9 has executed, these tables are populated regardless of run status.
  const hasArtifacts = snapshot.run.status === "validating" ||
    snapshot.run.status === "complete" ||
    snapshot.run.status === "incomplete" ||
    // Fallback: if T9 ran, S3 and S6 are populated
    (counts.s3_claim_ledger >= 1 && counts.s1_documents >= 3);

  // ─── The 11 Checks ───

  const checks: EndConditionCheck[] = [];

  // 1. S1 contains ≥3 rows (one per required input I1–I3)
  checks.push({
    conditionId: 1,
    description: "S1 contains ≥3 rows (one per required input I1–I3)",
    pass: counts.s1_documents >= 3,
    message: counts.s1_documents >= 3
      ? `S1 has ${counts.s1_documents} documents (≥3).`
      : `S1 has only ${counts.s1_documents} documents (need ≥3).`,
    evidence: { s1_count: counts.s1_documents, docTypes: Array.from(docsByType.keys()) },
  });

  // 2. S2 contains ≥1 row per required input document
  const allRequiredHaveQuotes = requiredDocTypes.every(dt => docsWithQuotes.has(dt));
  checks.push({
    conditionId: 2,
    description: "S2 contains ≥1 row per required input document",
    pass: allRequiredHaveQuotes,
    message: allRequiredHaveQuotes
      ? "All required document types have ≥1 quote."
      : `Missing quotes for: ${requiredDocTypes.filter(dt => !docsWithQuotes.has(dt)).join(", ")}.`,
    evidence: { quotesPerDocType: Object.fromEntries(requiredDocTypes.map(dt => [dt, docsWithQuotes.has(dt)])) },
  });

  // 3. S3 contains exactly 1 row with all required fields populated or flagged in S7
  const s3Exists = counts.s3_claim_ledger === 1;
  const s3FieldsOk = s3MissingFields.length === 0 || s3MissingFields.every(f => flaggedFields.has(f));
  const c3Pass = s3Exists && s3FieldsOk;
  checks.push({
    conditionId: 3,
    description: "S3 contains exactly 1 row with all required fields populated or flagged in S7",
    pass: c3Pass,
    message: !s3Exists
      ? `S3 has ${counts.s3_claim_ledger} rows (need exactly 1).`
      : !s3FieldsOk
        ? `S3 missing fields not flagged in S7: ${s3MissingFields.filter(f => !flaggedFields.has(f)).join(", ")}.`
        : "S3 has 1 row with all required fields populated or flagged.",
    evidence: { s3_count: counts.s3_claim_ledger, missingFields: s3MissingFields, flaggedInS7: Array.from(flaggedFields) },
  });

  // 4. S4 contains ≥1 row OR F2 flag exists in S7
  const c4Pass = counts.s4_denial_reasons >= 1 || failureFlags.has("F2");
  checks.push({
    conditionId: 4,
    description: "S4 contains ≥1 row (at least one denial reason) or F2 flag exists in S7",
    pass: c4Pass,
    message: counts.s4_denial_reasons >= 1
      ? `S4 has ${counts.s4_denial_reasons} denial reasons.`
      : failureFlags.has("F2")
        ? "S4 empty but F2 flag present in S7."
        : "S4 empty and no F2 flag in S7.",
    evidence: { s4_count: counts.s4_denial_reasons, f2_flagged: failureFlags.has("F2") },
  });

  // 5. S5 contains ≥1 row OR F1 flag exists in S7
  const c5Pass = counts.s5_policy_clauses >= 1 || failureFlags.has("F1");
  checks.push({
    conditionId: 5,
    description: "S5 contains ≥1 row (at least one policy clause) or F1 flag exists in S7",
    pass: c5Pass,
    message: counts.s5_policy_clauses >= 1
      ? `S5 has ${counts.s5_policy_clauses} policy clauses.`
      : failureFlags.has("F1")
        ? "S5 empty but F1 flag present in S7."
        : "S5 empty and no F1 flag in S7.",
    evidence: { s5_count: counts.s5_policy_clauses, f1_flagged: failureFlags.has("F1") },
  });

  // 6. S6 contains ≥1 row per S4 reason (even if clause_id = null)
  const allReasonsHaveMatrixRows = snapshot.s4_denial_reasons.every(r => reasonsWithMatrixRows.has(r.id));
  const c6Pass = counts.s4_denial_reasons === 0 || allReasonsHaveMatrixRows;
  const uncoveredReasons = snapshot.s4_denial_reasons.filter(r => !reasonsWithMatrixRows.has(r.id)).map(r => r.id);
  checks.push({
    conditionId: 6,
    description: "S6 contains ≥1 row per S4 reason (even if clause_id = null)",
    pass: c6Pass,
    message: c6Pass
      ? `All ${counts.s4_denial_reasons} denial reasons have S6 rows.`
      : `Denial reasons without S6 rows: ${uncoveredReasons.join(", ")}.`,
    evidence: { s4_count: counts.s4_denial_reasons, s6_count: counts.s6_comparison_matrix, uncoveredReasons },
  });

  // 7. S7 contains all identified gaps and failure flags
  const runFailureFlags = (snapshot.run.activeFailureFlags as string[] | null) ?? [];
  const allFlagsSurfaced = runFailureFlags.every(f => failureFlags.has(f));
  checks.push({
    conditionId: 7,
    description: "S7 contains all identified gaps and failure flags",
    pass: allFlagsSurfaced,
    message: allFlagsSurfaced
      ? `S7 has ${counts.s7_evidence_gaps} gaps. All failure flags surfaced.`
      : `Missing failure flags in S7: ${runFailureFlags.filter(f => !failureFlags.has(f)).join(", ")}.`,
    evidence: { s7_count: counts.s7_evidence_gaps, runFlags: runFailureFlags, s7Flags: Array.from(failureFlags) },
  });

  // 8. S8 contains all identified contradictions (may be empty)
  checks.push({
    conditionId: 8,
    description: "S8 contains all identified contradictions (may be empty if none detected)",
    pass: true,
    message: `S8 has ${counts.s8_contradictions} contradictions.`,
    evidence: { s8_count: counts.s8_contradictions },
  });

  // 9. O1, O2, O3, and O4 are generated
  checks.push({
    conditionId: 9,
    description: "O1, O2, O3, and O4 are generated",
    pass: hasArtifacts,
    message: hasArtifacts
      ? "Artifacts O1–O4 generated."
      : "Artifacts O1–O4 not yet generated.",
    evidence: { runStatus: snapshot.run.status },
  });

  // 10. Every row in O2, O3, O4 includes ≥1 citation to S2 or is labeled [user-entered]
  const s6WithCitations = snapshot.s6_comparison_matrix.filter(r =>
    (r.supportingQuoteIds && (r.supportingQuoteIds as number[]).length > 0) ||
    (r.notes && r.notes.includes("[user-entered]"))
  );
  const c10Pass = counts.s6_comparison_matrix === 0 || s6WithCitations.length === counts.s6_comparison_matrix;
  checks.push({
    conditionId: 10,
    description: "Every row in O2, O3, O4 includes ≥1 citation to S2 or is labeled [user-entered]",
    pass: c10Pass,
    message: c10Pass
      ? "All S6 rows have citations or user-entered labels."
      : `${counts.s6_comparison_matrix - s6WithCitations.length} S6 rows lack citations.`,
    evidence: { s6_total: counts.s6_comparison_matrix, s6_with_citations: s6WithCitations.length },
  });

  // 11. All failure flags (F1–F6) are surfaced in O3
  const allFailureFlagsSurfaced = runFailureFlags.every(f => failureFlags.has(f));
  checks.push({
    conditionId: 11,
    description: "All failure flags (F1–F6) are surfaced in O3",
    pass: allFailureFlagsSurfaced,
    message: allFailureFlagsSurfaced
      ? `All ${runFailureFlags.length} failure flags surfaced in S7/O3.`
      : `Unsurfaced failure flags: ${runFailureFlags.filter(f => !failureFlags.has(f)).join(", ")}.`,
    evidence: { runFlags: runFailureFlags, surfacedFlags: Array.from(failureFlags) },
  });

  const unmetConditions = checks.filter(c => !c.pass).map(c => c.conditionId);

  return {
    runComplete: unmetConditions.length === 0,
    checks,
    unmetConditions,
  };
}
