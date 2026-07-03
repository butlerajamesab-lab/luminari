/**
 * CDA v1.0-PATCH3 — Run Bundle Export
 *
 * Canonical export contract per CDA_v1.0_Bundle_Spec.md.
 * Produces the exact file layout:
 *   manifest.json
 *   data/S1–S8 JSON (volatile fields stripped, stable identifiers only)
 *   artifacts/O1–O4 raw markdown
 *   t7/t7_transcripts.jsonl (redacted per policy)
 *
 * No improvisation. No silent drift. Version bump required for any schema change.
 */

import { createHash } from "crypto";
import * as cdaDb from "./cda-db";
import { validateEndCondition } from "./cda-end-condition";
import { SPEC_VERSION } from "./cda-patterns";
import type { T7Transcript } from "./cda-pipeline";

// ═══════════════════════════════════════════════════════════════════════
// Stable Identifier Helpers
//
// These replace auto-increment IDs in the export.
// Deterministic: same input → same output, always.
// ═══════════════════════════════════════════════════════════════════════

/** SHA-256 of quote_text_verbatim → stable quote reference */
export function quoteHash(quoteText: string): string {
  return createHash("sha256").update(quoteText).digest("hex");
}

/** section_heading + first 40 chars of clause_text_verbatim → stable clause reference */
export function clauseIdentifier(sectionHeading: string | null, clauseTextVerbatim: string): string {
  const prefix = sectionHeading ?? "no_heading";
  const snippet = clauseTextVerbatim.substring(0, 40);
  const hash = createHash("sha256").update(`${prefix}|${snippet}`).digest("hex").substring(0, 16);
  return `${prefix}::${hash}`;
}

/** SHA-256 of reason_text_verbatim → stable reason reference */
export function reasonIdentifier(reasonTextVerbatim: string): string {
  return createHash("sha256").update(reasonTextVerbatim).digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════
// Bundle Row Types — Exact spec shapes (snake_case, no auto-increment IDs)
// ═══════════════════════════════════════════════════════════════════════

export interface BundleS1Row {
  doc_type: string;
  file_name: string;
  sha256: string;
  page_count: number;
  source: string;
}

export interface BundleS2Row {
  doc_sha256: string;
  page: number | null;
  location_hint: string | null;
  quote_text: string;
  category_tag: string;
  extraction_method: string;
  confidence: string;
  quote_hash: string;
}

export interface BundleS3Row {
  claim_id: string | null;
  policy_number: string | null;
  insured_name: string | null;
  insurer_name: string | null;
  loss_date: string | null;
  denial_date: string | null;
  coverage_types: string[] | null;
  claimed_items: string | null;
  claimed_amount: number | null;
  paid_amount: number | null;
  communication_channels: string[] | null;
  source_quote_hashes: string[];
}

export interface BundleS4Row {
  reason_text_verbatim: string;
  normalized_reason_code: string;
  cited_policy_refs_verbatim: string | null;
  cited_facts_verbatim: string | null;
  source_quote_hashes: string[];
}

export interface BundleS5Row {
  clause_identifier: string;
  clause_text_verbatim: string;
  section_heading: string | null;
  clause_type: string;
  defined_terms: string[] | null;
  effective_scope_note: string | null;
  source_quote_hashes: string[];
}

export interface BundleS6Row {
  reason_identifier: string;
  clause_identifier: string | null;
  linking_basis: string;
  match_type: string | null;
  mismatch_type: string | null;
  required_evidence: string | null;
  missing_evidence: string | null;
  conflict_evidence: string | null;
  supporting_quote_hashes: string[];
  resolution_method: string | null;
}

export interface BundleS7Row {
  gap_type: string;
  required_item: string;
  why_required: string;
  how_to_obtain: string | null;
  priority_level: string;
  linked_reason_identifiers: string[];
  linked_transformation: string | null;
}

export interface BundleS8Row {
  conflict_type: string;
  claim_reference: string | null;
  denial_reference: string | null;
  policy_reference: string | null;
  explanation: string;
  linked_quote_hashes: string[];
}

export interface BundleManifest {
  bundle_version: string;
  module: string;
  spec_version: string;
  run_id: string;
  created_at: string;
  engine_version: string;
  input_documents: Array<{
    doc_type: string;
    file_name: string;
    sha256: string;
    page_count: number;
  }>;
  row_counts: {
    S1: number;
    S2: number;
    S3: number;
    S4: number;
    S5: number;
    S6: number;
    S7: number;
    S8: number;
  };
  failure_flags: string[];
  run_complete: boolean;
  unmet_end_conditions: number[];
  t7_summary: {
    rows_evaluated: number;
    rows_deterministic: number;
    rows_llm_assisted: number;
    rows_ambiguous: number;
  };
  volatile_field_policy: string;
}

export interface T7TranscriptLine {
  reason_identifier: string;
  clause_identifier: string | null;
  input: {
    reason_text_verbatim: string;
    clause_text_verbatim: string | null;
    supporting_quote_hashes: string[];
  };
  llm_output: {
    match_type: string;
    mismatch_type: string | null;
    required_evidence: string | null;
    missing_evidence: string | null;
    conflict_evidence: string | null;
    supporting_quote_hashes: string[];
  } | null;
  validated: boolean;
}

export interface CdaRunBundleFiles {
  manifest: BundleManifest;
  data: {
    S1_document_index: BundleS1Row[];
    S2_quote_ledger: BundleS2Row[];
    S3_claim_ledger: BundleS3Row[];
    S4_denial_reason_ledger: BundleS4Row[];
    S5_policy_clause_ledger: BundleS5Row[];
    S6_comparison_matrix: BundleS6Row[];
    S7_evidence_gap_register: BundleS7Row[];
    S8_contradiction_register: BundleS8Row[];
  };
  artifacts: {
    O1_structured_claim_ledger: string;
    O2_policy_denial_comparison_matrix: string;
    O3_evidence_gaps_contradictions: string;
    O4_advocacy_packet_outline: string;
  };
  t7_transcripts_jsonl: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Build Run Bundle — Reads DB, transforms to spec-compliant export
// ═══════════════════════════════════════════════════════════════════════

export async function buildRunBundle(
  runId: string,
  t7Transcripts?: T7Transcript[],
): Promise<CdaRunBundleFiles> {
  const snapshot = await cdaDb.getFullRunSnapshot(runId);
  const endCondition = await validateEndCondition(runId);
  const run = snapshot.run;
  const counts = await cdaDb.getRunRowCounts(runId);

  // Build doc hash lookup: docId → sha256
  const docHashById = new Map<string, string>();
  for (const doc of snapshot.s1_documents) {
    docHashById.set(doc.id, doc.hash);
  }

  // Build quote text lookup: quoteId → quoteText
  const quoteTextById = new Map<string, string>();
  for (const q of snapshot.s2_quotes) {
    quoteTextById.set(q.id, q.quoteText);
  }

  // Build reason text lookup: reasonId → reasonTextVerbatim
  const reasonTextById = new Map<string, string>();
  for (const r of snapshot.s4_denial_reasons) {
    reasonTextById.set(r.id, r.reasonTextVerbatim);
  }

  // Build clause lookup: clauseId → { sectionHeading, clauseTextVerbatim }
  const clauseById = new Map<string, { sectionHeading: string | null; clauseTextVerbatim: string }>();
  for (const c of snapshot.s5_policy_clauses) {
    clauseById.set(c.id, { sectionHeading: c.sectionHeading, clauseTextVerbatim: c.clauseTextVerbatim });
  }

  // Helper: resolve quoteIds array to quote hashes
  const resolveQuoteHashes = (quoteIds: string[] | null | undefined): string[] => {
    if (!quoteIds || !Array.isArray(quoteIds)) return [];
    return quoteIds.map((qid) => {
      const text = quoteTextById.get(qid);
      return text ? quoteHash(text) : `unknown_quote_${qid}`;
    });
  };

  // ─── S1 ───
  const s1: BundleS1Row[] = snapshot.s1_documents.map((d: any) => ({
    doc_type: d.docType,
    file_name: d.fileName,
    sha256: d.hash,
    page_count: d.pageCount ?? 0,
    source: d.source,
  }));

  // ─── S2 ───
  const s2: BundleS2Row[] = snapshot.s2_quotes.map((q: any) => ({
    doc_sha256: docHashById.get(q.docId) ?? `unknown_doc_${q.docId}`,
    page: q.page ?? null,
    location_hint: q.locationHint ?? null,
    quote_text: q.quoteText,
    category_tag: q.categoryTag,
    extraction_method: q.extractionMethod,
    confidence: q.confidence,
    quote_hash: quoteHash(q.quoteText),
  }));

  // ─── S3 ───
  const s3Raw = snapshot.s3_claim_ledger;
  const s3: BundleS3Row[] = s3Raw
    ? [
        {
          claim_id: s3Raw.claimId ?? null,
          policy_number: s3Raw.policyNumber ?? null,
          insured_name: s3Raw.insuredName ?? null,
          insurer_name: s3Raw.insurerName ?? null,
          loss_date: s3Raw.lossDate ?? null,
          denial_date: s3Raw.denialDate ?? null,
          coverage_types: (s3Raw.coverageTypes as string[]) ?? null,
          claimed_items: s3Raw.claimedItems ?? null,
          claimed_amount: s3Raw.claimedAmount ? Number(s3Raw.claimedAmount) : null,
          paid_amount: s3Raw.paidAmount ? Number(s3Raw.paidAmount) : null,
          communication_channels: (s3Raw.communicationChannels as string[]) ?? null,
          source_quote_hashes: s3Raw.sourceQuotes
            ? (s3Raw.sourceQuotes as Array<{ quoteId: string }>).map((sq) => {
                const text = quoteTextById.get(sq.quoteId);
                return text ? quoteHash(text) : `unknown_quote_${sq.quoteId}`;
              })
            : [],
        },
      ]
    : [];

  // ─── S4 ───
  const s4: BundleS4Row[] = snapshot.s4_denial_reasons.map((r: any) => ({
    reason_text_verbatim: r.reasonTextVerbatim,
    normalized_reason_code: r.normalizedReasonCode,
    cited_policy_refs_verbatim: r.citedPolicyRefsVerbatim ?? null,
    cited_facts_verbatim: r.citedFactsVerbatim ?? null,
    source_quote_hashes: resolveQuoteHashes(r.sourceQuoteIds as string[]),
  }));

  // ─── S5 ───
  const s5: BundleS5Row[] = snapshot.s5_policy_clauses.map((c: any) => ({
    clause_identifier: clauseIdentifier(c.sectionHeading, c.clauseTextVerbatim),
    clause_text_verbatim: c.clauseTextVerbatim,
    section_heading: c.sectionHeading ?? null,
    clause_type: c.clauseType,
    defined_terms: (c.definedTerms as string[]) ?? null,
    effective_scope_note: c.effectiveScopeNote ?? null,
    source_quote_hashes: resolveQuoteHashes(c.sourceQuoteIds as string[]),
  }));

  // Build clause identifier lookup: clauseId → stable clause_identifier
  const clauseIdentById = new Map<string, string>();
  for (const c of snapshot.s5_policy_clauses) {
    clauseIdentById.set(c.id, clauseIdentifier(c.sectionHeading, c.clauseTextVerbatim));
  }

  // ─── S6 ───
  const s6: BundleS6Row[] = snapshot.s6_comparison_matrix.map((row: any) => ({
    reason_identifier: reasonTextById.has(row.reasonId)
      ? reasonIdentifier(reasonTextById.get(row.reasonId)!)
      : `unknown_reason_${row.reasonId}`,
    clause_identifier: row.clauseId ? (clauseIdentById.get(row.clauseId) ?? null) : null,
    linking_basis: row.linkingBasis,
    match_type: row.matchType ?? null,
    mismatch_type: row.mismatchType ?? null,
    required_evidence: row.requiredEvidence ?? null,
    missing_evidence: row.missingEvidence ?? null,
    conflict_evidence: row.conflictEvidence ?? null,
    supporting_quote_hashes: resolveQuoteHashes(row.supportingQuoteIds as string[]),
    resolution_method: row.resolutionMethod ?? null,
  }));

  // ─── S7 ───
  const s7: BundleS7Row[] = snapshot.s7_evidence_gaps.map((g: any) => ({
    gap_type: g.gapType,
    required_item: g.requiredItem,
    why_required: g.whyRequired,
    how_to_obtain: g.howToObtain ?? null,
    priority_level: g.priorityLevel,
    linked_reason_identifiers: g.linkedReasonIds
      ? (g.linkedReasonIds as string[]).map((rid) => {
          const text = reasonTextById.get(rid);
          return text ? reasonIdentifier(text) : `unknown_reason_${rid}`;
        })
      : [],
    linked_transformation: g.linkedTransformation ?? null,
  }));

  // ─── S8 ───
  const s8: BundleS8Row[] = snapshot.s8_contradictions.map((c: any) => ({
    conflict_type: c.conflictType,
    claim_reference: c.claimReference ?? null,
    denial_reference: c.denialReference ?? null,
    policy_reference: c.policyReference ?? null,
    explanation: c.explanation,
    linked_quote_hashes: resolveQuoteHashes(c.linkedQuoteIds as string[]),
  }));

  // ─── T7 Transcripts ───
  const t7Lines: T7TranscriptLine[] = (t7Transcripts ?? []).map((t) => {
    const reasonText = t.reasonId ? reasonTextById.get(t.reasonId) : undefined;
    const clauseData = t.clauseId ? clauseById.get(t.clauseId) : null;

    return {
      reason_identifier: reasonText ? reasonIdentifier(reasonText) : `unknown_reason_${t.reasonId}`,
      clause_identifier: clauseData
        ? clauseIdentifier(clauseData.sectionHeading, clauseData.clauseTextVerbatim)
        : null,
      input: {
        reason_text_verbatim: reasonText ?? "",
        clause_text_verbatim: clauseData?.clauseTextVerbatim ?? null,
        supporting_quote_hashes: [],
      },
      llm_output:
        t.resolutionMethod === "llm_assisted" && t.llmResponse
          ? (() => {
              try {
                const parsed = JSON.parse(t.llmResponse);
                return {
                  match_type: parsed.match_type ?? t.finalMatchType,
                  mismatch_type: parsed.mismatch_type ?? t.finalMismatchType ?? null,
                  required_evidence: parsed.required_evidence ?? null,
                  missing_evidence: parsed.missing_evidence ?? null,
                  conflict_evidence: parsed.conflict_evidence ?? null,
                  supporting_quote_hashes: [],
                };
              } catch {
                return null;
              }
            })()
          : null,
      validated: t.llmValidationResult === "accepted" || t.resolutionMethod === "deterministic",
    };
  });

  const t7Jsonl = t7Lines.map((line) => JSON.stringify(line)).join("\n");

  // ─── T7 Summary ───
  const t7Summary = {
    rows_evaluated: t7Transcripts?.length ?? 0,
    rows_deterministic: t7Transcripts?.filter((t) => t.resolutionMethod === "deterministic").length ?? 0,
    rows_llm_assisted: t7Transcripts?.filter((t) => t.resolutionMethod === "llm_assisted").length ?? 0,
    rows_ambiguous: t7Transcripts?.filter((t) => t.resolutionMethod === "fallback_ambiguous").length ?? 0,
  };

  // ─── Manifest ───
  const manifest: BundleManifest = {
    bundle_version: SPEC_VERSION,
    module: "CDA",
    spec_version: SPEC_VERSION,
    run_id: String(runId),
    created_at: new Date().toISOString(),
    engine_version: SPEC_VERSION,
    input_documents: s1.map((d) => ({
      doc_type: d.doc_type,
      file_name: d.file_name,
      sha256: d.sha256,
      page_count: d.page_count,
    })),
    row_counts: {
      S1: counts.s1_documents,
      S2: counts.s2_quotes,
      S3: counts.s3_claim_ledger,
      S4: counts.s4_denial_reasons,
      S5: counts.s5_policy_clauses,
      S6: counts.s6_comparison_matrix,
      S7: counts.s7_evidence_gaps,
      S8: counts.s8_contradictions,
    },
    failure_flags: (run?.activeFailureFlags as string[]) ?? [],
    run_complete: endCondition.runComplete,
    unmet_end_conditions: endCondition.unmetConditions,
    t7_summary: t7Summary,
    volatile_field_policy: "see spec v1.0-PATCH3",
  };

  // ─── Artifacts ───
  const o1 = generateO1Markdown(s3[0] ?? null, s1);
  const o2 = generateO2Markdown(s6, s4, s5);
  const o3 = generateO3Markdown(s7, s8);
  const o4 = generateO4Markdown(s3[0] ?? null, s6, s7, s8, s1);

  return {
    manifest,
    data: {
      S1_document_index: s1,
      S2_quote_ledger: s2,
      S3_claim_ledger: s3,
      S4_denial_reason_ledger: s4,
      S5_policy_clause_ledger: s5,
      S6_comparison_matrix: s6,
      S7_evidence_gap_register: s7,
      S8_contradiction_register: s8,
    },
    artifacts: {
      O1_structured_claim_ledger: o1,
      O2_policy_denial_comparison_matrix: o2,
      O3_evidence_gaps_contradictions: o3,
      O4_advocacy_packet_outline: o4,
    },
    t7_transcripts_jsonl: t7Jsonl,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// O1–O4 Markdown Generators
// ═══════════════════════════════════════════════════════════════════════

function generateO1Markdown(s3: BundleS3Row | null, s1: BundleS1Row[]): string {
  const lines: string[] = [];
  lines.push("# O1: Structured Claim Ledger");
  lines.push("");

  if (!s3) {
    lines.push("No claim data available.");
    return lines.join("\n");
  }

  lines.push("## Claim Information");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  lines.push(`| Claim ID | ${s3.claim_id ?? "N/A"} |`);
  lines.push(`| Policy Number | ${s3.policy_number ?? "N/A"} |`);
  lines.push(`| Insured Name | ${s3.insured_name ?? "N/A"} |`);
  lines.push(`| Insurer Name | ${s3.insurer_name ?? "N/A"} |`);
  lines.push(`| Loss Date | ${s3.loss_date ?? "N/A"} |`);
  lines.push(`| Denial Date | ${s3.denial_date ?? "N/A"} |`);
  lines.push(`| Claimed Amount | ${s3.claimed_amount ?? "N/A"} |`);
  lines.push(`| Paid Amount | ${s3.paid_amount ?? "N/A"} |`);
  lines.push("");

  if (s3.coverage_types && s3.coverage_types.length > 0) {
    lines.push("## Coverage Types");
    lines.push("");
    for (const ct of s3.coverage_types) {
      lines.push(`- ${ct}`);
    }
    lines.push("");
  }

  if (s3.claimed_items) {
    lines.push("## Claimed Items");
    lines.push("");
    lines.push(s3.claimed_items);
    lines.push("");
  }

  if (s3.communication_channels && s3.communication_channels.length > 0) {
    lines.push("## Communication Channels");
    lines.push("");
    for (const ch of s3.communication_channels) {
      lines.push(`- ${ch}`);
    }
    lines.push("");
  }

  lines.push("## Document Index");
  lines.push("");
  lines.push("| Type | File | Source | Pages | SHA-256 |");
  lines.push("|------|------|--------|-------|---------|");
  for (const d of s1) {
    lines.push(`| ${d.doc_type} | ${d.file_name} | ${d.source} | ${d.page_count} | ${d.sha256.substring(0, 12)}... |`);
  }
  lines.push("");

  return lines.join("\n");
}

function generateO2Markdown(s6: BundleS6Row[], s4: BundleS4Row[], s5: BundleS5Row[]): string {
  const lines: string[] = [];
  lines.push("# O2: Policy-Denial Comparison Matrix");
  lines.push("");

  if (s6.length === 0) {
    lines.push("No comparison rows generated.");
    return lines.join("\n");
  }

  const reasonByIdent = new Map(s4.map((r) => [reasonIdentifier(r.reason_text_verbatim), r]));
  const clauseByIdent = new Map(s5.map((c) => [c.clause_identifier, c]));

  for (let i = 0; i < s6.length; i++) {
    const row = s6[i];
    const reason = reasonByIdent.get(row.reason_identifier);
    const clause = row.clause_identifier ? clauseByIdent.get(row.clause_identifier) : null;

    lines.push(`## Comparison ${i + 1}`);
    lines.push("");
    lines.push(`**Denial Reason** (${reason?.normalized_reason_code ?? "unknown"}):`);
    lines.push(`> ${reason?.reason_text_verbatim ?? "[unknown]"}`);
    lines.push("");

    if (clause) {
      lines.push(`**Linked Policy Clause** (${clause.clause_type}, ${clause.section_heading ?? "no heading"}):`);
      lines.push(`> ${clause.clause_text_verbatim}`);
      lines.push("");
    } else {
      lines.push("**Linked Policy Clause:** None");
      lines.push("");
    }

    lines.push("| Field | Value |");
    lines.push("|-------|-------|");
    lines.push(`| Linking Basis | ${row.linking_basis} |`);
    lines.push(`| Match Type | ${row.match_type ?? "not assessed"} |`);
    lines.push(`| Mismatch Type | ${row.mismatch_type ?? "none"} |`);
    lines.push(`| Resolution Method | ${row.resolution_method ?? "none"} |`);
    lines.push("");

    if (row.required_evidence) {
      lines.push(`**Required Evidence:** ${row.required_evidence}`);
      lines.push("");
    }
    if (row.missing_evidence) {
      lines.push(`**Missing Evidence:** ${row.missing_evidence}`);
      lines.push("");
    }
    if (row.conflict_evidence) {
      lines.push(`**Conflict Evidence:** ${row.conflict_evidence}`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function generateO3Markdown(s7: BundleS7Row[], s8: BundleS8Row[]): string {
  const lines: string[] = [];
  lines.push("# O3: Evidence Gaps and Contradictions");
  lines.push("");

  const priorityOrder: Record<string, number> = { critical: 0, important: 1, supplementary: 2 };
  const sortedGaps = [...s7].sort(
    (a, b) => (priorityOrder[a.priority_level] ?? 3) - (priorityOrder[b.priority_level] ?? 3),
  );

  if (sortedGaps.length > 0) {
    lines.push("## Evidence Gaps");
    lines.push("");
    for (let i = 0; i < sortedGaps.length; i++) {
      const g = sortedGaps[i];
      lines.push(`### Gap ${i + 1}: ${g.gap_type} [${g.priority_level}]`);
      lines.push("");
      lines.push(`**Required Item:** ${g.required_item}`);
      lines.push("");
      lines.push(`**Why Required:** ${g.why_required}`);
      lines.push("");
      if (g.how_to_obtain) {
        lines.push(`**How to Obtain:** ${g.how_to_obtain}`);
        lines.push("");
      }
      if (g.linked_transformation) {
        lines.push(`**Linked Transformation:** ${g.linked_transformation}`);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
  } else {
    lines.push("## Evidence Gaps");
    lines.push("");
    lines.push("No evidence gaps identified.");
    lines.push("");
  }

  if (s8.length > 0) {
    lines.push("## Contradictions");
    lines.push("");
    for (let i = 0; i < s8.length; i++) {
      const c = s8[i];
      lines.push(`### Contradiction ${i + 1}: ${c.conflict_type}`);
      lines.push("");
      lines.push(`**Explanation:** ${c.explanation}`);
      lines.push("");
      if (c.claim_reference) {
        lines.push(`**Claim Reference:** ${c.claim_reference}`);
        lines.push("");
      }
      if (c.denial_reference) {
        lines.push(`**Denial Reference:** ${c.denial_reference}`);
        lines.push("");
      }
      if (c.policy_reference) {
        lines.push(`**Policy Reference:** ${c.policy_reference}`);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
  } else {
    lines.push("## Contradictions");
    lines.push("");
    lines.push("No contradictions detected.");
    lines.push("");
  }

  return lines.join("\n");
}

function generateO4Markdown(
  s3: BundleS3Row | null,
  s6: BundleS6Row[],
  s7: BundleS7Row[],
  s8: BundleS8Row[],
  s1: BundleS1Row[],
): string {
  const lines: string[] = [];
  lines.push("# O4: Advocacy Packet Draft Outline");
  lines.push("");
  lines.push("This outline organizes the CDA analysis results into sections suitable for advocacy correspondence.");
  lines.push("");

  // Section 1: Claim Summary
  lines.push("## Section 1: Claim Summary");
  lines.push("");
  if (s3) {
    lines.push(`- **Claim ID:** ${s3.claim_id ?? "N/A"}`);
    lines.push(`- **Policy Number:** ${s3.policy_number ?? "N/A"}`);
    lines.push(`- **Loss Date:** ${s3.loss_date ?? "N/A"}`);
    lines.push(`- **Claimed Amount:** ${s3.claimed_amount ?? "N/A"}`);
  } else {
    lines.push("No claim data available.");
  }
  lines.push("");

  // Section 2: Denial Comparison Summary
  lines.push("## Section 2: Denial-to-Policy Comparison");
  lines.push("");
  const unsupported = s6.filter((r) => r.match_type === "unsupported" || r.match_type === "partially_supported");
  const noClause = s6.filter((r) => r.linking_basis === "none");
  lines.push(`- **Total comparison rows:** ${s6.length}`);
  lines.push(`- **Unsupported or partially supported:** ${unsupported.length}`);
  lines.push(`- **No clause linked:** ${noClause.length}`);
  lines.push("");

  // Section 3: Gaps and Contradictions
  lines.push("## Section 3: Evidence Gaps and Contradictions");
  lines.push("");
  lines.push(`- **Evidence gaps:** ${s7.length}`);
  lines.push(`- **Contradictions:** ${s8.length}`);
  lines.push("");
  const critical = s7.filter((g) => g.priority_level === "critical");
  if (critical.length > 0) {
    lines.push("### Critical Gaps");
    lines.push("");
    for (const g of critical) {
      lines.push(`- ${g.required_item}`);
    }
    lines.push("");
  }

  // Section 4: Document Index
  lines.push("## Section 4: Document Index");
  lines.push("");
  lines.push("| Type | File | Source | SHA-256 |");
  lines.push("|------|------|--------|---------|");
  for (const d of s1) {
    lines.push(`| ${d.doc_type} | ${d.file_name} | ${d.source} | ${d.sha256.substring(0, 12)}... |`);
  }
  lines.push("");

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════
// Replay Diff — Compare two exported bundles for deterministic parity
//
// Replay policy per spec:
//   - Strip all timestamps (created_at)
//   - Strip run_id
//   - Strip engine_version
//   - Strip ordering (sort arrays by stable keys)
//   - Deep compare JSON
// ═══════════════════════════════════════════════════════════════════════

export interface BundleDiffResult {
  identical: boolean;
  differences: BundleDiffEntry[];
}

export interface BundleDiffEntry {
  path: string;
  type: "added" | "removed" | "changed";
  expected: unknown;
  actual: unknown;
}

export function diffBundles(a: CdaRunBundleFiles, b: CdaRunBundleFiles): BundleDiffResult {
  const differences: BundleDiffEntry[] = [];

  // Compare manifest (strip volatile: created_at, run_id, engine_version)
  const manifestKeysToCompare: (keyof BundleManifest)[] = [
    "bundle_version",
    "module",
    "spec_version",
    "row_counts",
    "failure_flags",
    "run_complete",
    "unmet_end_conditions",
    "t7_summary",
    "volatile_field_policy",
  ];

  for (const key of manifestKeysToCompare) {
    const va = JSON.stringify(a.manifest[key]);
    const vb = JSON.stringify(b.manifest[key]);
    if (va !== vb) {
      differences.push({
        path: `manifest.${key}`,
        type: "changed",
        expected: a.manifest[key],
        actual: b.manifest[key],
      });
    }
  }

  // Compare input_documents (sorted by sha256 for order independence)
  const sortedInputsA = [...a.manifest.input_documents].sort((x, y) => x.sha256.localeCompare(y.sha256));
  const sortedInputsB = [...b.manifest.input_documents].sort((x, y) => x.sha256.localeCompare(y.sha256));
  if (JSON.stringify(sortedInputsA) !== JSON.stringify(sortedInputsB)) {
    differences.push({
      path: "manifest.input_documents",
      type: "changed",
      expected: sortedInputsA,
      actual: sortedInputsB,
    });
  }

  // Compare each data file
  const dataKeys: (keyof CdaRunBundleFiles["data"])[] = [
    "S1_document_index",
    "S2_quote_ledger",
    "S3_claim_ledger",
    "S4_denial_reason_ledger",
    "S5_policy_clause_ledger",
    "S6_comparison_matrix",
    "S7_evidence_gap_register",
    "S8_contradiction_register",
  ];

  const sortKeys: Record<string, (row: any) => string> = {
    S1_document_index: (r) => r.sha256,
    S2_quote_ledger: (r) => r.quote_hash,
    S3_claim_ledger: (r) => r.claim_id ?? "",
    S4_denial_reason_ledger: (r) => r.reason_text_verbatim,
    S5_policy_clause_ledger: (r) => r.clause_identifier,
    S6_comparison_matrix: (r) => `${r.reason_identifier}|${r.clause_identifier ?? ""}`,
    S7_evidence_gap_register: (r) => `${r.gap_type}|${r.required_item}`,
    S8_contradiction_register: (r) => `${r.conflict_type}|${r.explanation}`,
  };

  for (const key of dataKeys) {
    const arrA = [...a.data[key]].sort((x, y) => sortKeys[key](x).localeCompare(sortKeys[key](y)));
    const arrB = [...b.data[key]].sort((x, y) => sortKeys[key](x).localeCompare(sortKeys[key](y)));

    if (arrA.length !== arrB.length) {
      differences.push({
        path: `data.${key}.length`,
        type: "changed",
        expected: arrA.length,
        actual: arrB.length,
      });
      continue;
    }

    for (let i = 0; i < arrA.length; i++) {
      if (JSON.stringify(arrA[i]) !== JSON.stringify(arrB[i])) {
        differences.push({
          path: `data.${key}[${i}]`,
          type: "changed",
          expected: arrA[i],
          actual: arrB[i],
        });
      }
    }
  }

  // Compare T7 transcripts (parse JSONL, sort by reason_identifier + clause_identifier)
  const parseJsonl = (jsonl: string): any[] => {
    if (!jsonl.trim()) return [];
    return jsonl
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  };

  const t7a = parseJsonl(a.t7_transcripts_jsonl).sort((x, y) =>
    `${x.reason_identifier}|${x.clause_identifier ?? ""}`.localeCompare(
      `${y.reason_identifier}|${y.clause_identifier ?? ""}`,
    ),
  );
  const t7b = parseJsonl(b.t7_transcripts_jsonl).sort((x, y) =>
    `${x.reason_identifier}|${x.clause_identifier ?? ""}`.localeCompare(
      `${y.reason_identifier}|${y.clause_identifier ?? ""}`,
    ),
  );

  if (t7a.length !== t7b.length) {
    differences.push({
      path: "t7_transcripts.length",
      type: "changed",
      expected: t7a.length,
      actual: t7b.length,
    });
  } else {
    for (let i = 0; i < t7a.length; i++) {
      const lineA = t7a[i];
      const lineB = t7b[i];

      if (lineA.llm_output === null && lineB.llm_output === null) {
        // Both deterministic — full compare
        if (JSON.stringify(lineA) !== JSON.stringify(lineB)) {
          differences.push({
            path: `t7_transcripts[${i}]`,
            type: "changed",
            expected: lineA,
            actual: lineB,
          });
        }
      } else {
        // LLM rows — compare identifiers and validation status only
        if (
          lineA.reason_identifier !== lineB.reason_identifier ||
          lineA.clause_identifier !== lineB.clause_identifier ||
          lineA.validated !== lineB.validated
        ) {
          differences.push({
            path: `t7_transcripts[${i}].structure`,
            type: "changed",
            expected: { ri: lineA.reason_identifier, ci: lineA.clause_identifier, v: lineA.validated },
            actual: { ri: lineB.reason_identifier, ci: lineB.clause_identifier, v: lineB.validated },
          });
        }
      }
    }
  }

  // Artifacts are derived from data — skip artifact diff (deterministic from data)

  return { identical: differences.length === 0, differences };
}
