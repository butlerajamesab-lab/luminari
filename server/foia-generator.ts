/**
 * FOIA Request Generator — Session 4
 *
 * System-gated workflow that drafts public records request letters when gap detection
 * finds critical missing records. NOT user-triggered — the system evaluates case-stage
 * criteria and recommends requests when appropriate.
 *
 * Architecture:
 * T1. Case-stage gating: evaluateCaseReadiness(caseId) → { ready, criteria, warmHandoff }
 * T2. Fingerprint generation: generateFingerprint(domain, recordType, agencyId, stateCode) → hash
 * T3. Agency resolution: resolve AKB data for the missing record
 * T4. Letter generation: template-based FOIA request letter
 * T5. Persistence: insert into foia_requests, update missing_records status
 *
 * Gating criteria (ALL must be met):
 * - Case has at least 1 document with status "ready" (analysis complete)
 * - Gap detection has run (missing_records exist for this case)
 * - The specific missing record has severity "critical" or "important"
 * - The missing record is foiaEligible = true
 * - No existing foia_request with the same fingerprint for this case
 *
 * Warm handoff triggers (ANY triggers handoff):
 * - Case domain involves tribal sovereignty (ICWA)
 * - Missing record involves personnel files or internal investigations
 * - Case has indicators of active litigation or retaliation risk
 */

import { db } from "./db";
import { createHash } from "crypto";
import {
  documents, missingRecords, foiaRequests, cases,
  type MissingRecord, type FoiaRequest,
} from "../drizzle/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getAgenciesForRecord, normalizeDomainKey } from "./akb-lookup";

// ─── Types ───

export interface CaseReadiness {
  ready: boolean;
  criteria: {
    hasAnalyzedDocuments: boolean;
    hasGapDetectionResults: boolean;
    hasFoiaEligibleGaps: boolean;
    documentCount: number;
    analyzedDocumentCount: number;
    criticalGapCount: number;
    importantGapCount: number;
    foiaEligibleGapCount: number;
  };
  warmHandoff: boolean;
  warmHandoffReasons: string[];
  eligibleRecords: MissingRecord[];
}

export interface FoiaGenerationResult {
  success: boolean;
  requestId?: number;
  fingerprint?: string;
  letterContent?: string;
  warmHandoff: boolean;
  warmHandoffReasons: string[];
  error?: string;
}

// ─── T1. Case-Stage Gating ───

/**
 * Evaluate whether a case is ready for FOIA request generation.
 * Returns readiness status, criteria breakdown, warm handoff assessment,
 * and the list of eligible missing records.
 */
export async function evaluateCaseReadiness(caseId: number): Promise<CaseReadiness> {
  // Fetch case metadata
  const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId as any));
  if (!caseRow) {
    return {
      ready: false,
      criteria: {
        hasAnalyzedDocuments: false,
        hasGapDetectionResults: false,
        hasFoiaEligibleGaps: false,
        documentCount: 0,
        analyzedDocumentCount: 0,
        criticalGapCount: 0,
        importantGapCount: 0,
        foiaEligibleGapCount: 0,
      },
      warmHandoff: false,
      warmHandoffReasons: [],
      eligibleRecords: [],
    };
  }

  // Count documents and their analysis status
  const docCounts = await db
    .select({
      total: sql<number>`count(*)`,
      analyzed: sql<number>`sum(case when status = 'ready' then 1 else 0 end)`,
    })
    .from(documents)
    .where(eq(documents.caseId, caseId as any));

  const documentCount = docCounts[0]?.total ?? 0;
  const analyzedDocumentCount = docCounts[0]?.analyzed ?? 0;

  // Fetch all missing records for this case
  const gaps = await db
    .select()
    .from(missingRecords)
    .where(
      and(
        eq(missingRecords.caseId, caseId),
        inArray(missingRecords.status, ["detected", "acknowledged"])
      )
    );

  const criticalGapCount = gaps.filter((g: any) => g.severity === "critical").length;
  const importantGapCount = gaps.filter((g: any) => g.severity === "important").length;
  const foiaEligibleGaps = gaps.filter((g: any) => g.foiaEligible);

  // Check existing FOIA requests to avoid duplicates
  const existingRequests = await db
    .select({ fingerprint: foiaRequests.requestFingerprint })
    .from(foiaRequests)
    .where(eq(foiaRequests.caseId, caseId));

  const existingFingerprints = new Set(existingRequests.map((r: any) => r.fingerprint));

  // Filter eligible records: critical/important, FOIA-eligible, no existing request
  const eligibleRecords = foiaEligibleGaps.filter((g: any) => {
    if (g.severity !== "critical" && g.severity !== "important") return false;
    // Generate fingerprint to check for duplicates
    const fp = generateFingerprint(
      g.domain,
      g.recordType,
      null, // agencyId resolved later
      "WA"  // default state
    );
    return !existingFingerprints.has(fp);
  });

  // Evaluate gating criteria
  const hasAnalyzedDocuments = analyzedDocumentCount > 0;
  const hasGapDetectionResults = gaps.length > 0;
  const hasFoiaEligibleGaps = eligibleRecords.length > 0;

  const ready = hasAnalyzedDocuments && hasGapDetectionResults && hasFoiaEligibleGaps;

  // Warm handoff assessment
  const { warmHandoff, warmHandoffReasons } = assessWarmHandoff(caseRow, gaps);

  return {
    ready,
    criteria: {
      hasAnalyzedDocuments,
      hasGapDetectionResults,
      hasFoiaEligibleGaps,
      documentCount,
      analyzedDocumentCount,
      criticalGapCount,
      importantGapCount,
      foiaEligibleGapCount: foiaEligibleGaps.length,
    },
    warmHandoff,
    warmHandoffReasons,
    eligibleRecords,
  };
}

// ─── T2. Fingerprint Generation ───

/**
 * Generate a deterministic fingerprint for a FOIA request.
 * Normalized: lowercase, trimmed, pipe-delimited, SHA-256 hashed.
 */
export function generateFingerprint(
  domain: string,
  recordType: string,
  agencyId: number | null,
  stateCode: string
): string {
  const normalized = [
    domain.toLowerCase().trim(),
    recordType.toLowerCase().trim(),
    agencyId?.toString() ?? "no_agency",
    stateCode.toLowerCase().trim(),
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

// ─── T3. Warm Handoff Assessment ───

interface WarmHandoffResult {
  warmHandoff: boolean;
  warmHandoffReasons: string[];
}

/**
 * Assess whether this case should receive a warm handoff recommendation
 * instead of (or in addition to) a generated FOIA letter.
 *
 * Triggers:
 * - ICWA cases (tribal sovereignty, federal jurisdiction complexity)
 * - Personnel file requests (retaliation risk)
 * - Cases with indicators of active litigation
 * - Cases involving government agencies as adverse parties
 */
function assessWarmHandoff(
  caseRow: { pipelineType: string | null; description: string | null; name: string },
  gaps: MissingRecord[]
): WarmHandoffResult {
  const reasons: string[] = [];
  const pipelineType = caseRow.pipelineType ?? "";
  const description = (caseRow.description ?? "").toLowerCase();
  const caseName = caseRow.name.toLowerCase();

  // ICWA cases — tribal sovereignty adds federal jurisdiction complexity
  if (pipelineType === "icwa") {
    reasons.push(
      "ICWA cases involve tribal sovereignty and federal jurisdiction. " +
      "Consider consulting with a tribal advocate or ICWA-specialized attorney " +
      "before filing records requests."
    );
  }

  // Personnel file / IA requests — retaliation risk
  const hasPersonnelGaps = gaps.some(g =>
    g.recordType.includes("internal_affairs") ||
    g.recordType.includes("personnel") ||
    g.recordType.includes("disciplinary")
  );
  if (hasPersonnelGaps) {
    reasons.push(
      "This case involves requests for personnel or internal affairs records. " +
      "These requests may alert the subject of investigation. Consider whether " +
      "timing is strategically appropriate."
    );
  }

  // Active litigation indicators
  const litigationKeywords = [
    "lawsuit", "litigation", "attorney", "counsel", "court order",
    "deposition", "discovery", "subpoena", "trial", "hearing",
  ];
  const hasLitigationIndicators = litigationKeywords.some(
    kw => description.includes(kw) || caseName.includes(kw)
  );
  if (hasLitigationIndicators) {
    reasons.push(
      "This case may involve active litigation. FOIA requests during litigation " +
      "can have strategic implications. Consult with your attorney before filing."
    );
  }

  // Government agency as adverse party
  const govKeywords = [
    "police department", "sheriff", "district attorney", "prosecutor",
    "child protective", "dcyf", "dss", "aps", "agency",
  ];
  const hasGovAdversary = govKeywords.some(
    kw => description.includes(kw) || caseName.includes(kw)
  );
  if (hasGovAdversary && pipelineType === "police_misconduct") {
    reasons.push(
      "You are requesting records from the same agency that is the subject of " +
      "your investigation. Consider whether a third-party intermediary or legal " +
      "representative should file the request."
    );
  }

  return {
    warmHandoff: reasons.length > 0,
    warmHandoffReasons: reasons,
  };
}

// ─── T4. Letter Generation (Template-Based) ───

/**
 * Generate a FOIA request letter using template-based string interpolation.
 * Produces a formal, professional public records request letter.
 */
async function generateFoiaLetter(params: {
  domain: string;
  recordType: string;
  recordDescription: string;
  agencyName: string;
  agencyAddress: string | null;
  agencyEmail: string | null;
  statuteName: string;
  statuteReference: string;
  responseDeadlineDays: number | null;
  feeWaiverAvailable: boolean;
  requesterName: string | null;
  requesterEmail: string | null;
  caseDescription: string | null;
}): Promise<string> {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const requesterName = params.requesterName || "[REQUESTER_NAME]";
  const requesterEmail = params.requesterEmail || "[REQUESTER_EMAIL]";
  const agencyAddress = params.agencyAddress || "[AGENCY_ADDRESS]";

  const deadlineParagraph = params.responseDeadlineDays
    ? `\nPursuant to ${params.statuteName}, I expect a response within ${params.responseDeadlineDays} business days. If you anticipate a delay, please notify me in writing of the reason for the delay and the expected date of response.\n`
    : `\nPlease respond to this request at your earliest convenience. If you anticipate a delay, please notify me in writing of the reason for the delay and the expected date of response.\n`;

  const feeWaiverParagraph = params.feeWaiverAvailable
    ? `\nI request a waiver of all fees associated with this request. Disclosure of the requested information is in the public interest because it is likely to contribute significantly to public understanding of the operations or activities of the government and is not primarily in my commercial interest.\n\nIf a fee waiver is not granted, please notify me of the estimated cost before processing this request. I am willing to pay reasonable fees up to $25.00. If estimated fees exceed this amount, please contact me for authorization.\n`
    : `\nIf there are any fees associated with processing this request, please notify me of the estimated cost before proceeding. I am willing to pay reasonable fees up to $25.00. If estimated fees exceed this amount, please contact me for authorization.\n`;

  const letter = `${today}

FOIA Officer / Public Records Officer
${params.agencyName}
${agencyAddress}
${params.agencyEmail ? `Email: ${params.agencyEmail}` : ""}

RE: Public Records Request Pursuant to ${params.statuteName}

Dear FOIA Officer:

Pursuant to ${params.statuteName} (${params.statuteReference}), I hereby request copies of the following records:

${params.recordDescription}

Record Type: ${params.recordType}
${params.caseDescription ? `\nContext for record identification: ${params.caseDescription}\n` : ""}
I request that responsive records be provided in electronic format where available. If any portion of this request is denied, please cite the specific exemption(s) that justify the withholding and release any reasonably segregable non-exempt portions.
${feeWaiverParagraph}${deadlineParagraph}
If you have any questions regarding this request, or if I can provide clarification to assist in the identification of responsive records, please contact me at the information below.

Thank you for your prompt attention to this matter.

Sincerely,

${requesterName}
[REQUESTER_ADDRESS]
${requesterEmail}
[REQUESTER_PHONE]`;

  return letter;
}

// ─── T5. Full Generation Pipeline ───

/**
 * Generate a FOIA request for a specific missing record.
 *
 * Flow:
 * 1. Validate the missing record exists and is eligible
 * 2. Resolve AKB agency data
 * 3. Generate fingerprint
 * 4. Check for duplicate (unique constraint)
 * 5. Assess warm handoff
 * 6. Generate letter via template
 * 7. Persist to foia_requests
 * 8. Update missing_records status to "requested"
 */
export async function generateFoiaRequest(
  caseId: number,
  missingRecordId: number,
  userId: number,
  requesterInfo?: {
    name?: string;
    email?: string;
    address?: string;
    phone?: string;
  }
): Promise<FoiaGenerationResult> {
  // 1. Fetch the missing record
  const [missingRecord] = await db
    .select()
    .from(missingRecords)
    .where(
      and(
        eq(missingRecords.id, missingRecordId),
        eq(missingRecords.caseId, caseId)
      )
    );

  if (!missingRecord) {
    return { success: false, warmHandoff: false, warmHandoffReasons: [], error: "Missing record not found" };
  }

  if (!missingRecord.foiaEligible) {
    return { success: false, warmHandoff: false, warmHandoffReasons: [], error: "Record is not FOIA-eligible" };
  }

  // 2. Fetch case metadata
  const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId as any));
  if (!caseRow) {
    return { success: false, warmHandoff: false, warmHandoffReasons: [], error: "Case not found" };
  }

  // 3. Resolve AKB agency data
  const agencyMatches = await getAgenciesForRecord(
    missingRecord.domain,
    missingRecord.recordType,
    "WA" // TODO: derive from case metadata when multi-state support is added
  ) as any[];

  // Use the highest-confidence agency match, or fall back to generic info
  const primaryAgency = agencyMatches.sort((a, b) => {
    const conf = { high: 3, medium: 2, low: 1 };
    return (conf[b.confidence as keyof typeof conf] ?? 0) - (conf[a.confidence as keyof typeof conf] ?? 0);
  })[0];

  // 4. Generate fingerprint
  const fingerprint = generateFingerprint(
    missingRecord.domain,
    missingRecord.recordType,
    primaryAgency?.agency.id ?? null,
    "WA"
  );

  // 5. Check for duplicate
  const existing = await db
    .select({ id: foiaRequests.id })
    .from(foiaRequests)
    .where(
      and(
        eq(foiaRequests.caseId, caseId),
        eq(foiaRequests.requestFingerprint, fingerprint)
      )
    );

  if (existing.length > 0) {
    return {
      success: false,
      warmHandoff: false,
      warmHandoffReasons: [],
      error: "A FOIA request for this record type already exists for this case",
    };
  }

  // 6. Assess warm handoff
  const allGaps = await db
    .select()
    .from(missingRecords)
    .where(eq(missingRecords.caseId, caseId));

  const { warmHandoff, warmHandoffReasons } = assessWarmHandoff(caseRow, allGaps);

  // 7. Generate letter
  let letterContent: string;
  try {
    letterContent = await generateFoiaLetter({
      domain: missingRecord.domain,
      recordType: missingRecord.recordType,
      recordDescription: missingRecord.description,
      agencyName: primaryAgency?.agency.agencyName ?? missingRecord.agencyType ?? "Records Custodian",
      agencyAddress: primaryAgency?.agency.mailingAddress ?? null,
      agencyEmail: primaryAgency?.agency.email ?? null,
      statuteName: primaryAgency?.statute.lawName ?? "Public Records Act",
      statuteReference: primaryAgency?.statute.statuteReference ?? missingRecord.legalBasis ?? "",
      responseDeadlineDays: primaryAgency?.statute.responseDeadlineDays ?? null,
      feeWaiverAvailable: primaryAgency?.statute.feeWaiverAvailable ?? false,
      requesterName: requesterInfo?.name ?? null,
      requesterEmail: requesterInfo?.email ?? null,
      caseDescription: caseRow.description,
    });
  } catch (err) {
    return {
      success: false,
      warmHandoff,
      warmHandoffReasons,
      error: `Letter generation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }

  // 8. Persist
  const now = Date.now();
  const responseDueAt = primaryAgency?.statute.responseDeadlineDays
    ? now + primaryAgency.statute.responseDeadlineDays * 24 * 60 * 60 * 1000
    : null;

  const gatingReason = JSON.stringify({
    severity: missingRecord.severity,
    foiaEligible: missingRecord.foiaEligible,
    analyzedDocumentsExist: true,
    warmHandoff,
  });

  const [result] = await db.insert(foiaRequests).values({
    caseId,
    userId,
    missingRecordId,
    agencyId: primaryAgency?.agency.id ?? null,
    statuteId: primaryAgency?.statute.id ?? null,
    domain: missingRecord.domain,
    recordType: missingRecord.recordType,
    stateCode: "WA",
    requestFingerprint: fingerprint,
    letterContent,
    requesterName: requesterInfo?.name ?? null,
    requesterAddress: requesterInfo?.address ?? null,
    requesterEmail: requesterInfo?.email ?? null,
    requesterPhone: requesterInfo?.phone ?? null,
    agencyName: primaryAgency?.agency.agencyName ?? missingRecord.agencyType ?? null,
    agencyAddress: primaryAgency?.agency.mailingAddress ?? null,
    agencyEmail: primaryAgency?.agency.email ?? null,
    status: "draft",
    gatingReason,
    warmHandoff,
    warmHandoffReason: warmHandoffReasons.length > 0 ? warmHandoffReasons.join("\n\n") : null,
    createdAt: now,
    updatedAt: now,
    responseDueAt,
  });

  const requestId = result.insertId;

  // 9. Update missing_records status to "requested"
  await db
    .update(missingRecords)
    .set({ status: "requested", updatedAt: now })
    .where(eq(missingRecords.id, missingRecordId));

  // ─── Pattern Detection Hook (Session 8): detect foia_denial_pattern + agency_behavior ───
  try {
    const { runPatternDetection } = await import("./pattern-detection");
    const patternResult = await runPatternDetection({
      caseId,
      foiaRequestIds: [Number(requestId)],
    });
    if (patternResult.totalRegistered > 0) {
      console.log(`[FOIA] Pattern detection: ${patternResult.totalRegistered} new patterns registered for request ${requestId}`);
      // Notify case owner
      try {
        const { createNotification } = await import("./db");
        await createNotification({
          userId,
          type: "pattern_detected",
          title: "Cross-Case Pattern Detected",
          message: `${patternResult.totalRegistered} new systemic pattern(s) identified from FOIA request generation.`,
          metadata: { caseId, foiaRequestId: requestId, ...patternResult.results },
          linkUrl: `/guide/${caseId}`,
        });
      } catch (notifErr) {
        console.warn("[FOIA] Pattern notification failed (non-blocking):", notifErr);
      }
    }
  } catch (patternErr) {
    console.warn("[FOIA] Pattern detection hook failed (non-blocking):", patternErr);
  }

  return {
    success: true,
    requestId,
    fingerprint,
    letterContent,
    warmHandoff,
    warmHandoffReasons,
  };
}

// ─── Batch Generation: Generate requests for all eligible gaps in a case ───

export interface BatchGenerationResult {
  generated: FoiaGenerationResult[];
  skipped: Array<{ recordType: string; reason: string }>;
  warmHandoff: boolean;
  warmHandoffReasons: string[];
}

/**
 * Generate FOIA requests for all eligible missing records in a case.
 * Respects case-stage gating and deduplication.
 */
export async function generateAllEligibleRequests(
  caseId: number,
  userId: number,
  requesterInfo?: {
    name?: string;
    email?: string;
    address?: string;
    phone?: string;
  }
): Promise<BatchGenerationResult> {
  const readiness = await evaluateCaseReadiness(caseId);

  if (!readiness.ready) {
    return {
      generated: [],
      skipped: readiness.eligibleRecords.map(r => ({
        recordType: r.recordType,
        reason: "Case not ready for FOIA generation",
      })),
      warmHandoff: readiness.warmHandoff,
      warmHandoffReasons: readiness.warmHandoffReasons,
    };
  }

  const generated: FoiaGenerationResult[] = [];
  const skipped: Array<{ recordType: string; reason: string }> = [];

  for (const record of readiness.eligibleRecords) {
    const result = await generateFoiaRequest(caseId, record.id, userId, requesterInfo);
    if (result.success) {
      generated.push(result);
    } else {
      skipped.push({ recordType: record.recordType, reason: result.error ?? "Unknown" });
    }
  }

  return {
    generated,
    skipped,
    warmHandoff: readiness.warmHandoff,
    warmHandoffReasons: readiness.warmHandoffReasons,
  };
}
