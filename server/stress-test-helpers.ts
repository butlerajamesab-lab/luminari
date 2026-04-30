/**
 * Stress Test Helpers — Synthetic Snapshot Builder
 *
 * Deterministic data generation for high-volume Phase-2 validation.
 * All data is seeded — no randomness. Identical inputs produce identical outputs.
 */

import * as dbHelpers from "./db";
import { db } from "./db";
import { createHash } from "crypto";
import { ENGINE_VERSION } from "../shared/const";
import { eq } from "drizzle-orm";
import {
  cases, documents, quotes, entities, entityRoles, claims, findings,
  events, signalFlags, relationships, relationshipEvidence, documentCorrelations,
  corpusSnapshots, phase2Runs, phase2EvidenceRequirements, phase2StructuredNotes,
} from "../drizzle/schema";

// ─── Seeded Deterministic Generator ───

function createSeededRng(seed: number) {
  let state = seed;
  return {
    next(): number {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min: number, max: number): number {
      return min + Math.floor(this.next() * (max - min + 1));
    },
  };
}

// ─── Date Generation ───

function generateDate(index: number, total: number, distribution: AnchorDistribution): string {
  const baseYear = 2024;
  const safeTotal = Math.max(total, 1);

  if (distribution === "sparse_with_gaps") {
    const clusterCount = 4;
    const clusterSize = Math.ceil(safeTotal / clusterCount);
    const clusterIndex = Math.floor(index / clusterSize);
    const withinCluster = index % clusterSize;
    const clusterStartDay = clusterIndex * 150;
    const dayOffset = Math.floor((withinCluster / Math.max(clusterSize, 1)) * 30);
    const date = new Date(baseYear, 0, 1 + clusterStartDay + dayOffset);
    return date.toISOString().split("T")[0];
  }

  if (distribution === "dense") {
    const dayOffset = Math.floor((index / safeTotal) * 60);
    const date = new Date(baseYear, 0, 1 + dayOffset);
    return date.toISOString().split("T")[0];
  }

  const dayOffset = Math.floor((index / safeTotal) * 365);
  const date = new Date(baseYear, 0, 1 + dayOffset);
  return date.toISOString().split("T")[0];
}

// ─── Types ───

export type AnchorDistribution = "sparse_with_gaps" | "dense" | "uniform";

export interface SyntheticSnapshotConfig {
  documentCount: number;
  quoteCount: number;
  claimCount: number;
  eventCount: number;
  entityCount?: number;
  findingCount?: number;
  signalFlagCount?: number;
  relationshipCount?: number;
  correlationCount?: number;
  anchorDistribution: AnchorDistribution;
  seed?: number;
}

export interface SyntheticSnapshotResult {
  caseId: number;
  snapshotId: number;
  snapshotVersion: number;
  documentIds: number[];
  quoteIds: number[];
  entityIds: number[];
  claimIds: number[];
  findingIds: number[];
  eventIds: number[];
  signalFlagIds: number[];
  relationshipIds: number[];
  correlationIds: number[];
  entityRoleIds: number[];
  laneId: string;
  engineVersion: string;
  timing: {
    totalMs: number;
    documentsMs: number;
    quotesMs: number;
    entitiesMs: number;
    claimsMs: number;
    findingsMs: number;
    eventsMs: number;
    signalFlagsMs: number;
    relationshipsMs: number;
    correlationsMs: number;
    sealMs: number;
  };
}

// ─── Constants ───

const DOC_TYPES = [
  "denial_letter", "policy_document", "medical_record", "appeal_letter",
  "correspondence", "billing_statement", "authorization_form", "lab_report",
  "discharge_summary", "progress_note",
];

const CLAIM_TYPES = [
  "coverage_denial", "medical_necessity", "prior_authorization",
  "out_of_network", "experimental_treatment", "timely_filing",
  "coordination_of_benefits", "pre_existing_condition",
];

const EVENT_TYPES = [
  "claim_submission", "denial_issued", "appeal_filed", "review_completed",
  "authorization_requested", "payment_processed", "hearing_scheduled",
  "policy_renewal", "benefit_change", "provider_notification",
];

const FLAG_TYPES = [
  "contradictory_statement", "missing_documentation", "timeline_inconsistency",
  "policy_ambiguity", "regulatory_violation", "unusual_delay",
];

const ENTITY_TYPES = [
  "person", "organization", "insurance_company", "medical_provider",
  "government_agency", "legal_entity",
];

// ─── Builder ───

export async function buildSyntheticSnapshot(config: SyntheticSnapshotConfig): Promise<SyntheticSnapshotResult> {
  const {
    documentCount,
    quoteCount,
    claimCount,
    eventCount,
    entityCount = Math.max(20, Math.floor(documentCount / 3)),
    findingCount = Math.max(10, Math.floor(claimCount / 3)),
    signalFlagCount = Math.max(10, Math.floor(documentCount / 2)),
    relationshipCount = Math.max(5, Math.floor(entityCount / 4)),
    correlationCount = Math.max(3, Math.floor(documentCount / 10)),
    anchorDistribution,
    seed = 42,
  } = config;

  const _rng = createSeededRng(seed);
  const laneId = `stress-test-lane-${seed}`;
  const engineVersion = ENGINE_VERSION;
  const timing: SyntheticSnapshotResult["timing"] = {
    totalMs: 0, documentsMs: 0, quotesMs: 0, entitiesMs: 0,
    claimsMs: 0, findingsMs: 0, eventsMs: 0, signalFlagsMs: 0,
    relationshipsMs: 0, correlationsMs: 0, sealMs: 0,
  };
  const totalStart = Date.now();

  // ── Create case ──
  const caseId = await dbHelpers.createCase(
    0, `Stress Test Case (seed=${seed})`,
    "Synthetic high-volume test case", "stress-test-domain", "stress-test-container",
  );

  // ── Create snapshot (open) ──
  const snap = await dbHelpers.createCorpusSnapshot({
    caseId,
    engineVersion,
    documentIds: [],
    documentHashes: {},
  });
  const snapshotId = snap.id;
  const snapshotVersion = snap.version;

  // ── Insert documents ──
  let t0 = Date.now();
  const documentIds: number[] = [];
  const realDocHashes: Record<string, string> = {};
  for (let i = 0; i < documentCount; i++) {
    const hash = createHash("sha256").update(`stress-doc-${seed}-${i}`).digest("hex");
    const docType = DOC_TYPES[i % DOC_TYPES.length];
    const dateStr = generateDate(i, documentCount, anchorDistribution);
    const docId = await dbHelpers.createDocument({
      caseId,
      filename: `stress-${docType}-${i}.pdf`,
      fileType: "pdf",
      mimeType: "application/pdf",
      fileSize: 1024 * (10 + i),
      s3Key: `stress/${seed}/${i}.pdf`,
      s3Url: `https://s3.example.com/stress/${seed}/${i}.pdf`,
      sha256Hash: hash,
      snapshotId,
    });
    documentIds.push(docId);
    realDocHashes[String(docId)] = hash;

    await dbHelpers.updateDocumentAnalysis(docId, {
      textContent: generateDocumentText(i, docType, dateStr, seed),
      pageCount: 1 + (i % 10),
      documentType: docType,
      documentPurpose: `${docType} for stress test`,
      aiMetadata: { date_filed: dateStr, doc_index: i },
      status: "ready",
    });
  }
  timing.documentsMs = Date.now() - t0;

  // ── Insert entities ──
  t0 = Date.now();
  const entityIds: number[] = [];
  const entityRoleIds: number[] = [];
  for (let i = 0; i < entityCount; i++) {
    const entityType = ENTITY_TYPES[i % ENTITY_TYPES.length];
    const entityId = await dbHelpers.createEntity({
      caseId,
      name: `Entity-${seed}-${i} (${entityType})`,
      type: entityType,
      description: `Synthetic entity #${i} for stress testing`,
      engineVersion,
      laneId,
      snapshotId,
    });
    entityIds.push(entityId);

    const docIndex = i % documentCount;
    const erId = await dbHelpers.createEntityRole({
      entityId,
      documentId: documentIds[docIndex],
      role: i % 2 === 0 ? "claimant" : "insurer",
      engineVersion,
    });
    entityRoleIds.push(erId);
  }
  timing.entitiesMs = Date.now() - t0;

  // ── Insert quotes ──
  t0 = Date.now();
  const quoteIds: number[] = [];
  for (let i = 0; i < quoteCount; i++) {
    const docIndex = i % documentCount;
    const quoteId = await dbHelpers.createQuote({
      caseId,
      documentId: documentIds[docIndex],
      text: generateQuoteText(i, seed),
      pageNumber: 1 + (i % 5),
      context: `Context for quote ${i} in stress test`,
      statementOrigin: i % 3 === 0 ? "court_filing" : i % 3 === 1 ? "sworn_testimony" : "discovery_disclosure",
      engineVersion,
      laneId,
      snapshotId,
    });
    quoteIds.push(quoteId);
  }
  timing.quotesMs = Date.now() - t0;

  // ── Insert claims ──
  t0 = Date.now();
  const claimIds: number[] = [];
  for (let i = 0; i < claimCount; i++) {
    const docIndex = i % documentCount;
    const quoteIndex = i % quoteCount;
    const dateStr = generateDate(i, claimCount, anchorDistribution);
    const claimId = await dbHelpers.createClaim({
      caseId,
      documentId: documentIds[docIndex],
      quoteId: quoteIds[quoteIndex],
      claimText: `Claim ${i}: ${CLAIM_TYPES[i % CLAIM_TYPES.length]} denial asserted on ${dateStr}`,
      claimType: CLAIM_TYPES[i % CLAIM_TYPES.length],
      dateReferenced: dateStr,
      entitiesInvolved: entityIds.length > 0 ? [entityIds[i % entityIds.length]] : [],
      evidentiaryWeight: i % 4 === 0 ? "finding_eligible" : "signal_only",
      engineVersion,
      laneId,
      snapshotId,
    });
    claimIds.push(claimId);
  }
  timing.claimsMs = Date.now() - t0;

  // ── Insert findings ──
  t0 = Date.now();
  const findingIds: number[] = [];
  for (let i = 0; i < findingCount; i++) {
    const linkedClaimIds: number[] = [];
    const linkCount = 1 + (i % 3);
    for (let j = 0; j < linkCount && (i * 3 + j) < claimIds.length; j++) {
      linkedClaimIds.push(claimIds[(i * 3 + j) % claimIds.length]);
    }
    const findingId = await dbHelpers.createFinding({
      caseId,
      findingType: i % 2 === 0 ? "coverage_gap" : "procedural_violation",
      title: `Finding ${i}: Stress test finding (seed=${seed})`,
      description: `Deterministic finding #${i} generated for high-volume validation`,
      significance: i % 3 === 0 ? "high" : i % 3 === 1 ? "medium" : "low",
      claimIds: linkedClaimIds,
      confidence: i % 3 === 0 ? "strong" : i % 3 === 1 ? "moderate" : "preliminary",
      findingEvidentiaryWeight: "finding",
      laneId,
      snapshotId,
    });
    findingIds.push(findingId);
  }
  timing.findingsMs = Date.now() - t0;

  // ── Insert events ──
  t0 = Date.now();
  const eventIds: number[] = [];
  for (let i = 0; i < eventCount; i++) {
    const dateStr = generateDate(i, eventCount, anchorDistribution);
    const eventId = await dbHelpers.createEvent({
      caseId,
      eventType: EVENT_TYPES[i % EVENT_TYPES.length],
      title: `Event ${i}: ${EVENT_TYPES[i % EVENT_TYPES.length]} on ${dateStr}`,
      description: `Synthetic event #${i} for stress testing`,
      dateOccurred: dateStr,
      datePrecision: "day",
      entitiesInvolved: entityIds.length > 0 ? [entityIds[i % entityIds.length]] : [],
      quoteIds: quoteIds.length > 0 ? [quoteIds[i % quoteIds.length]] : [],
      engineVersion,
      laneId,
      snapshotId,
    });
    eventIds.push(eventId);
  }
  timing.eventsMs = Date.now() - t0;

  // ── Insert signal flags ──
  t0 = Date.now();
  const signalFlagIds: number[] = [];
  for (let i = 0; i < signalFlagCount; i++) {
    const docIndex = i % documentCount;
    const flagId = await dbHelpers.createSignalFlag({
      caseId,
      documentId: documentIds[docIndex],
      flagType: FLAG_TYPES[i % FLAG_TYPES.length],
      description: `Signal flag ${i}: ${FLAG_TYPES[i % FLAG_TYPES.length]} detected in stress test`,
      quoteId: quoteIds[i % quoteIds.length],
      engineVersion,
      laneId,
      snapshotId,
    });
    signalFlagIds.push(flagId);
  }
  timing.signalFlagsMs = Date.now() - t0;

  // ── Insert relationships ──
  t0 = Date.now();
  const relationshipIds: number[] = [];
  for (let i = 0; i < relationshipCount && entityIds.length >= 2; i++) {
    const sourceIdx = i % entityIds.length;
    const targetIdx = (i + 1) % entityIds.length;
    const relId = await dbHelpers.createRelationship({
      caseId,
      sourceEntityId: entityIds[sourceIdx],
      targetEntityId: entityIds[targetIdx],
      relationshipType: i % 2 === 0 ? "insurer_of" : "provider_for",
      description: `Relationship ${i} for stress testing`,
      engineVersion,
      laneId,
      snapshotId,
    });
    relationshipIds.push(relId);

    if (quoteIds.length > 0) {
      await dbHelpers.addRelationshipEvidence({
        relationshipId: relId,
        quoteId: quoteIds[i % quoteIds.length],
        explanation: `Evidence for relationship ${i}`,
      });
    }
  }
  timing.relationshipsMs = Date.now() - t0;

  // ── Insert correlations ──
  t0 = Date.now();
  const correlationIds: number[] = [];
  for (let i = 0; i < correlationCount && documentIds.length >= 2; i++) {
    const srcIdx = i % documentIds.length;
    const tgtIdx = (i + 1) % documentIds.length;
    const corrId = await dbHelpers.createCorrelation({
      caseId,
      sourceDocumentId: documentIds[srcIdx],
      targetDocumentId: documentIds[tgtIdx],
      correlationType: "shared_reference",
      description: `Correlation ${i} for stress testing`,
      sharedIdentifiers: [`CLM-${seed}-${i}`, `POL-${seed}-${i}`],
      laneId,
      snapshotId,
    });
    correlationIds.push(corrId);
  }
  timing.correlationsMs = Date.now() - t0;

  // ── Update snapshot manifest with real document IDs and hashes ──
  await dbHelpers.updateSnapshotManifest(snapshotId, documentIds, realDocHashes);

  // ── Seal snapshot ──
  t0 = Date.now();
  await dbHelpers.sealSnapshot(snapshotId);
  timing.sealMs = Date.now() - t0;

  timing.totalMs = Date.now() - totalStart;

  return {
    caseId, snapshotId, snapshotVersion,
    documentIds, quoteIds, entityIds, claimIds, findingIds,
    eventIds, signalFlagIds, relationshipIds, correlationIds, entityRoleIds,
    laneId, engineVersion, timing,
  };
}

// ─── Text Generators ───

function generateDocumentText(index: number, docType: string, dateStr: string, seed: number): string {
  const templates: Record<string, string> = {
    denial_letter: `CLAIM DENIAL NOTICE\nDate: ${dateStr}\nClaim Number: CLM-${seed}-${index}\nPolicy: POL-${seed}-${index}\n\nThe claim for medical services rendered on ${dateStr} has been denied.\nReason: The procedure was deemed not medically necessary per utilization review criteria.\nPrior authorization was not obtained before the date of service.\nThe treatment is considered experimental under policy exclusion section 4.2.\n\nYou have the right to appeal this decision within 180 days.`,
    policy_document: `INSURANCE POLICY DOCUMENT\nPolicy Number: POL-${seed}-${index}\nEffective Date: ${dateStr}\n\nSection 4.2 - Experimental Treatment Exclusion:\nTreatments classified as experimental or investigational are not covered.\n\nSection 7.1 - Prior Authorization Requirements:\nAll inpatient procedures require prior authorization.\nFailure to obtain prior authorization may result in claim denial.\n\nSection 9.3 - Appeal Process:\nMembers may appeal any adverse benefit determination within 180 days.`,
    medical_record: `MEDICAL RECORD\nDate of Service: ${dateStr}\nPatient ID: PAT-${seed}-${index}\n\nChief Complaint: Patient presents with symptoms requiring evaluation.\nAssessment: Clinical findings support medical necessity of proposed treatment.\nPlan: Recommend procedure as outlined in treatment protocol.\nThe treating physician has determined this procedure is medically necessary.`,
    appeal_letter: `APPEAL LETTER\nDate: ${dateStr}\nRe: Claim CLM-${seed}-${index}\n\nDear Appeals Committee,\n\nWe are writing to appeal the denial of the above-referenced claim.\nThe denial stated the procedure was not medically necessary.\nEnclosed medical records demonstrate clinical necessity.\nThe treating physician's statement confirms the procedure meets accepted standards of care.`,
    correspondence: `CORRESPONDENCE\nDate: ${dateStr}\nRe: Policy POL-${seed}-${index}\n\nThis letter confirms receipt of your inquiry regarding claim CLM-${seed}-${index}.\nOur records indicate the claim was processed on ${dateStr}.\nPlease contact our office for additional information.`,
    billing_statement: `BILLING STATEMENT\nDate: ${dateStr}\nAccount: ACCT-${seed}-${index}\n\nService Date: ${dateStr}\nProcedure Code: CPT-${99200 + (index % 100)}\nAmount Billed: $${1000 + index * 50}.00\nAmount Allowed: $${500 + index * 25}.00\nPatient Responsibility: $${500 + index * 25}.00`,
    authorization_form: `PRIOR AUTHORIZATION REQUEST\nDate: ${dateStr}\nPatient: PAT-${seed}-${index}\n\nRequested Procedure: Treatment protocol ${index}\nClinical Justification: Medical necessity established per clinical guidelines.\nExpected Duration: ${1 + (index % 10)} days\nAuthorization Status: Pending review`,
    lab_report: `LABORATORY REPORT\nDate: ${dateStr}\nSpecimen ID: LAB-${seed}-${index}\n\nTest Results:\nComplete Blood Count: Within normal limits\nMetabolic Panel: Values consistent with clinical presentation\nImaging Results: Findings support clinical assessment`,
    discharge_summary: `DISCHARGE SUMMARY\nDate: ${dateStr}\nPatient: PAT-${seed}-${index}\n\nAdmission Date: ${dateStr}\nDischarge Date: ${dateStr}\nDiagnosis: Clinical condition requiring treatment\nProcedures Performed: Treatment protocol as authorized\nDischarge Instructions: Follow-up in 2 weeks`,
    progress_note: `PROGRESS NOTE\nDate: ${dateStr}\nPatient: PAT-${seed}-${index}\n\nSubjective: Patient reports improvement following treatment.\nObjective: Clinical examination shows positive response.\nAssessment: Treatment plan is effective.\nPlan: Continue current protocol, reassess in 30 days.`,
  };
  return templates[docType] || templates.denial_letter;
}

function generateQuoteText(index: number, _seed: number): string {
  const templates = [
    `The claim for services rendered was denied based on utilization review criteria.`,
    `Prior authorization was not obtained before the date of service as required by policy section 7.1.`,
    `The treating physician has determined this procedure is medically necessary based on clinical findings.`,
    `The treatment is considered experimental under policy exclusion section 4.2 and is therefore not covered.`,
    `Members may appeal any adverse benefit determination within 180 days of receiving the denial notice.`,
    `Clinical records demonstrate that the proposed treatment meets accepted standards of medical care.`,
    `The insurer's utilization review committee determined the procedure did not meet medical necessity criteria.`,
    `Enclosed documentation supports the medical necessity of the requested treatment protocol.`,
    `The denial was issued without adequate consideration of the treating physician's clinical judgment.`,
    `Policy provisions require that all inpatient procedures receive prior authorization before admission.`,
  ];
  return templates[index % templates.length];
}

// ─── Cleanup Helper ───

export async function cleanupSyntheticSnapshot(result: SyntheticSnapshotResult): Promise<void> {
  const cid = result.caseId;
  // Delete Phase-2 data first (depends on snapshot)
  await db.delete(phase2StructuredNotes).where(eq(phase2StructuredNotes.snapshotId, result.snapshotId)).catch(() => {});
  await db.delete(phase2EvidenceRequirements).where(eq(phase2EvidenceRequirements.snapshotId, result.snapshotId)).catch(() => {});
  await db.delete(phase2Runs).where(eq(phase2Runs.caseId, cid)).catch(() => {});

  // Batch delete Phase-1 data by caseId in reverse dependency order
  // relationshipEvidence doesn't have caseId — delete via relationship IDs
  const { sql: sqlFn } = await import("drizzle-orm");
  await db.execute(sqlFn.raw(`DELETE re FROM relationship_evidence re INNER JOIN relationships r ON re.relationshipId = r.id WHERE r.caseId = ${cid}`)).catch(() => {});
  await db.delete(documentCorrelations).where(eq(documentCorrelations.caseId, cid)).catch(() => {});
  await db.delete(signalFlags).where(eq(signalFlags.caseId, cid)).catch(() => {});
  await db.delete(events).where(eq(events.caseId, cid)).catch(() => {});
  await db.delete(relationships).where(eq(relationships.caseId, cid)).catch(() => {});
  await db.delete(findings).where(eq(findings.caseId, cid)).catch(() => {});
  await db.delete(claims).where(eq(claims.caseId, cid)).catch(() => {});
  // entityRoles doesn't have caseId — delete via entity IDs
  await db.execute(sqlFn.raw(`DELETE er FROM entity_roles er INNER JOIN entities e ON er.entityId = e.id WHERE e.caseId = ${cid}`)).catch(() => {});
  await db.delete(entities).where(eq(entities.caseId, cid)).catch(() => {});
  await db.delete(quotes).where(eq(quotes.caseId, cid)).catch(() => {});
  await db.delete(documents).where(eq(documents.caseId, cid)).catch(() => {});
  await db.delete(corpusSnapshots).where(eq(corpusSnapshots.caseId, cid)).catch(() => {});
  await db.delete(cases).where(eq(cases.id, cid)).catch(() => {});
}
