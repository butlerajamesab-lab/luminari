/**
 * Case → Pattern Bridge
 * 
 * Automatically links individual case activity to systemic pattern detection.
 * 
 * Pipeline:
 *   Case Data → Case Signal Extractor → Pattern Candidate Evaluator → Pattern Registry
 * 
 * The extractor scans case data for:
 *   - claim_type patterns
 *   - entities involved (company, agency, person)
 *   - jurisdiction clustering
 *   - evidence tags / signal flags
 *   - damages amounts
 *   - deadlines
 * 
 * Signals are then evaluated against existing pattern candidates.
 * If N signals match (entity + claim_type + jurisdiction) within a time window,
 * a Pattern Candidate is created. Additional signals promote it to active.
 */
import { db } from "./db";
import {
  cases, entities, claims, findings, signalFlags, events,
  entityRoles, caseSignals, patternCandidates, casePatternLinks,
  patternRegistry, patternSignalLinks,
} from "../drizzle/schema";
import { eq, and, sql, desc, gte, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Types ───

export interface ExtractedSignal {
  signalType: string;
  entityName?: string;
  entityType?: string;
  claimType?: string;
  jurisdiction?: string;
  domain?: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  explanation: string;
  confidenceScore: number;
  evidenceStrength: number;
  damagesTotal: number;
  sourceClaimIds: number[];
  sourceEntityIds: number[];
  sourceFindingIds: number[];
  sourceSignalFlagIds: number[];
}

interface CaseData {
  caseId: number;
  userId: number;
  caseName: string;
  domain: string | null;
  container: string | null;
  pipelineType: string | null;
  entities: Array<{ id: number; name: string; type: string; description: string | null }>;
  claims: Array<{ id: number; claimType: string; claimText: string; entitiesInvolved: number[] | null; statementOrigin: string; evidentiaryWeight: string }>;
  findings: Array<{ id: number; findingType: string; title: string; description: string; confidence: string; evidentiaryWeight: string; claimIds: number[] }>;
  signalFlags: Array<{ id: number; flagType: string; description: string | null }>;
  events: Array<{ id: number; eventType: string; description: string; dateOccurred: string | null }>;
  entityRoles: Array<{ entityId: number; role: string }>;
}

// ─── Step 1: Extract Case Data ───

export async function loadCaseData(caseId: number, userId: number): Promise<CaseData> {
  const [caseRow] = await db.select({
    id: cases.id,
    userId: cases.userId,
    name: cases.name,
    domain: cases.domain,
    container: cases.container,
    pipelineType: cases.pipelineType,
  }).from(cases).where(and(eq(cases.id, String(caseId)), eq(cases.userId, String(userId))));

  if (!caseRow) throw new Error("Case not found or access denied");

  const [caseEntities, caseClaims, caseFindings, caseFlags, caseEvents, caseRoles] = await Promise.all([
    db.select({ id: entities.id, name: entities.name, type: entities.type, description: entities.description })
      .from(entities).where(eq(entities.caseId, String(caseId))),
    db.select({
      id: claims.id, claimType: claims.claimType, claimText: claims.claimText,
      entitiesInvolved: claims.entitiesInvolved, statementOrigin: claims.statementOrigin,
      evidentiaryWeight: claims.evidentiaryWeight,
    }).from(claims).where(eq(claims.caseId, String(caseId))),
    db.select({
      id: findings.id, findingType: findings.findingType, title: findings.title,
      description: findings.description, confidence: findings.confidence,
      evidentiaryWeight: findings.evidentiaryWeight, claimIds: findings.claimIds,
    }).from(findings).where(eq(findings.caseId, String(caseId))),
    db.select({ id: signalFlags.id, flagType: signalFlags.flagType, description: signalFlags.description })
      .from(signalFlags).where(eq(signalFlags.caseId, caseId)),
    db.select({
      id: events.id, eventType: events.eventType, description: events.description,
      dateOccurred: events.dateOccurred,
    }).from(events).where(eq(events.caseId, String(caseId))),
    db.select({ entityId: entityRoles.entityId, role: entityRoles.role })
      .from(entityRoles)
      .innerJoin(entities, eq(entityRoles.entityId, entities.id))
      .where(eq(entities.caseId, String(caseId))),
  ]);

  return {
    caseId,
    userId: caseRow.userId,
    caseName: caseRow.name,
    domain: caseRow.domain,
    container: caseRow.container,
    pipelineType: caseRow.pipelineType,
    entities: caseEntities,
    claims: caseClaims as CaseData["claims"],
    findings: caseFindings as CaseData["findings"],
    signalFlags: caseFlags,
    events: caseEvents as CaseData["events"],
    entityRoles: caseRoles,
  };
}

// ─── Step 2: Extract Signals from Case Data ───

export function extractSignalsFromCase(data: CaseData): ExtractedSignal[] {
  const signals: ExtractedSignal[] = [];

  // 2a. Entity-based signals: organizations/companies appearing in the case
  const orgEntities = data.entities.filter(e =>
    ["organization", "legal_concept", "financial"].includes(e.type) ||
    /\b(LLC|Inc|Corp|Company|Ltd|Association|Authority|Department|Agency|Bureau|Commission)\b/i.test(e.name)
  );

  for (const entity of orgEntities) {
    // Count how many claims reference this entity
    const relatedClaims = data.claims.filter(c =>
      c.entitiesInvolved && (c.entitiesInvolved as number[]).includes(entity.id)
    );
    const relatedRoles = data.entityRoles.filter(r => r.entityId === entity.id);
    
    // Determine entity type from roles
    const isRespondent = relatedRoles.some(r =>
      /respondent|defendant|accused|violator/i.test(r.role)
    );

    if (relatedClaims.length >= 1 || isRespondent) {
      const evidenceStrength = calculateEvidenceStrength(relatedClaims);
      const severity = relatedClaims.length >= 5 ? "high" : relatedClaims.length >= 3 ? "medium" : "low";

      signals.push({
        signalType: "entity_involvement",
        entityName: entity.name,
        entityType: entity.type,
        claimType: getMostCommonClaimType(relatedClaims),
        jurisdiction: data.domain || undefined,
        domain: data.pipelineType || data.domain || undefined,
        severity,
        title: `${entity.name} identified in case with ${relatedClaims.length} related claims`,
        explanation: `Entity "${entity.name}" (${entity.type}) appears in ${relatedClaims.length} claims within case "${data.caseName}". ${isRespondent ? "Entity is identified as a respondent/defendant." : ""}`,
        confidenceScore: Math.min(0.95, 0.4 + (relatedClaims.length * 0.1) + (isRespondent ? 0.2 : 0)),
        evidenceStrength,
        damagesTotal: 0,
        sourceClaimIds: relatedClaims.map(c => c.id),
        sourceEntityIds: [entity.id],
        sourceFindingIds: [],
        sourceSignalFlagIds: [],
      });
    }
  }

  // 2b. Claim type pattern signals: cluster of similar claim types
  const claimTypeCounts = new Map<string, { count: number; ids: number[] }>();
  for (const claim of data.claims) {
    const existing = claimTypeCounts.get(claim.claimType) || { count: 0, ids: [] };
    existing.count++;
    existing.ids.push(claim.id);
    claimTypeCounts.set(claim.claimType, existing);
  }

  for (const [claimType, { count, ids }] of claimTypeCounts) {
    if (count >= 2) {
      signals.push({
        signalType: "claim_pattern",
        claimType,
        jurisdiction: data.domain || undefined,
        domain: data.pipelineType || data.domain || undefined,
        severity: count >= 5 ? "high" : "medium",
        title: `${count} "${claimType}" claims detected in case`,
        explanation: `Case "${data.caseName}" contains ${count} claims of type "${claimType}", indicating a pattern of ${claimType} activity.`,
        confidenceScore: Math.min(0.9, 0.5 + (count * 0.08)),
        evidenceStrength: calculateEvidenceStrength(data.claims.filter(c => c.claimType === claimType)),
        damagesTotal: 0,
        sourceClaimIds: ids,
        sourceEntityIds: [],
        sourceFindingIds: [],
        sourceSignalFlagIds: [],
      });
    }
  }

  // 2c. Signal flag aggregation: group similar flags
  const flagTypeCounts = new Map<string, { count: number; ids: number[] }>();
  for (const flag of data.signalFlags) {
    const existing = flagTypeCounts.get(flag.flagType) || { count: 0, ids: [] };
    existing.count++;
    existing.ids.push(flag.id);
    flagTypeCounts.set(flag.flagType, existing);
  }

  for (const [flagType, { count, ids }] of flagTypeCounts) {
    if (count >= 1) {
      signals.push({
        signalType: "evidence_flag",
        claimType: flagType,
        jurisdiction: data.domain || undefined,
        domain: data.pipelineType || data.domain || undefined,
        severity: count >= 3 ? "high" : count >= 2 ? "medium" : "low",
        title: `Signal flag "${flagType}" detected ${count} time(s)`,
        explanation: `Case "${data.caseName}" triggered ${count} "${flagType}" signal flag(s).`,
        confidenceScore: Math.min(0.85, 0.4 + (count * 0.15)),
        evidenceStrength: count >= 2 ? 0.6 : 0.3,
        damagesTotal: 0,
        sourceClaimIds: [],
        sourceEntityIds: [],
        sourceFindingIds: [],
        sourceSignalFlagIds: ids,
      });
    }
  }

  // 2d. Finding-based signals: strong findings indicate systemic issues
  const strongFindings = data.findings.filter(f =>
    f.evidentiaryWeight === "finding" && f.confidence === "strong"
  );

  for (const finding of strongFindings) {
    // Find entities connected to this finding's claims
    const findingClaimIds = finding.claimIds || [];
    const relatedEntityIds = new Set<number>();
    for (const claim of data.claims) {
      if (findingClaimIds.includes(claim.id) && claim.entitiesInvolved) {
        for (const eid of claim.entitiesInvolved as number[]) {
          relatedEntityIds.add(eid);
        }
      }
    }
    const relatedEntities = data.entities.filter(e => relatedEntityIds.has(e.id));
    const primaryEntity = relatedEntities.find(e => e.type === "organization") || relatedEntities[0];

    signals.push({
      signalType: "strong_finding",
      entityName: primaryEntity?.name,
      entityType: primaryEntity?.type,
      claimType: finding.findingType,
      jurisdiction: data.domain || undefined,
      domain: data.pipelineType || data.domain || undefined,
      severity: "high",
      title: `Strong finding: ${finding.title}`,
      explanation: `Case "${data.caseName}" produced a strong, evidence-backed finding: "${finding.title}". ${primaryEntity ? `Primary entity: ${primaryEntity.name}.` : ""}`,
      confidenceScore: 0.85,
      evidenceStrength: 0.8,
      damagesTotal: 0,
      sourceClaimIds: findingClaimIds,
      sourceEntityIds: Array.from(relatedEntityIds),
      sourceFindingIds: [finding.id],
      sourceSignalFlagIds: [],
    });
  }

  // 2e. Deadline signals from events
  const deadlineEvents = data.events.filter(e =>
    /deadline|statute.*limitation|filing.*date|expir/i.test(e.eventType) ||
    /deadline|statute.*limitation|filing.*date|expir/i.test(e.description)
  );

  if (deadlineEvents.length > 0) {
    signals.push({
      signalType: "deadline_alert",
      jurisdiction: data.domain || undefined,
      domain: data.pipelineType || data.domain || undefined,
      severity: "high",
      title: `${deadlineEvents.length} deadline-related event(s) detected`,
      explanation: `Case "${data.caseName}" contains ${deadlineEvents.length} deadline-related events that may indicate time-sensitive patterns.`,
      confidenceScore: 0.7,
      evidenceStrength: 0.5,
      damagesTotal: 0,
      sourceClaimIds: [],
      sourceEntityIds: [],
      sourceFindingIds: [],
      sourceSignalFlagIds: [],
    });
  }

  return signals;
}

// ─── Step 3: Store Case Signals ───

export async function storeCaseSignals(
  caseId: number,
  userId: number,
  signals: ExtractedSignal[]
): Promise<number[]> {
  if (signals.length === 0) return [];

  const now = Date.now();
  const insertedIds: number[] = [];

  for (const sig of signals) {
    const [result] = await db.insert(caseSignals).values({
      caseId,
      userId,
      signalType: sig.signalType,
      entityName: sig.entityName || null,
      entityType: sig.entityType || null,
      claimType: sig.claimType || null,
      jurisdiction: sig.jurisdiction || null,
      domain: sig.domain || null,
      severity: sig.severity,
      title: sig.title,
      explanation: sig.explanation,
      confidenceScore: String(sig.confidenceScore),
      evidenceStrength: String(sig.evidenceStrength),
      entityRepetition: 0,
      geographicSpread: 0,
      timeClustering: "0.0000",
      damagesTotal: String(sig.damagesTotal),
      sourceClaimIds: sig.sourceClaimIds.length > 0 ? sig.sourceClaimIds : null,
      sourceEntityIds: sig.sourceEntityIds.length > 0 ? sig.sourceEntityIds : null,
      sourceFindingIds: sig.sourceFindingIds.length > 0 ? sig.sourceFindingIds : null,
      sourceSignalFlagIds: sig.sourceSignalFlagIds.length > 0 ? sig.sourceSignalFlagIds : null,
      active: 1,
      createdAt: now,
      updatedAt: now,
    });
    insertedIds.push(result.insertId);
  }

  return insertedIds;
}

// ─── Step 4: Evaluate Pattern Candidates ───

export async function evaluatePatternCandidates(
  newSignals: Array<{ id: number } & ExtractedSignal>,
  caseId: number
): Promise<{
  candidatesCreated: number;
  candidatesStrengthened: number;
  candidatesPromoted: number;
}> {
  let candidatesCreated = 0;
  let candidatesStrengthened = 0;
  let candidatesPromoted = 0;
  const now = Date.now();

  for (const signal of newSignals) {
    // Build match criteria: entity + claim_type + jurisdiction
    const matchKey = buildMatchKey(signal);
    if (!matchKey) continue;

    // Check if there's an existing pattern candidate matching this signal
    const existingCandidate = await findMatchingCandidate(signal);

    if (existingCandidate) {
      // Strengthen existing candidate
      const newSignalCount = existingCandidate.signalCount + 1;
      const newCaseCount = await countUniqueCases(existingCandidate.id);
      const newConfidence = recalculateConfidence(existingCandidate, newSignalCount, newCaseCount);

      await db.update(patternCandidates).set({
        signalCount: newSignalCount,
        caseCount: newCaseCount,
        confidenceScore: String(newConfidence),
        lastSignalAt: now,
        updatedAt: now,
      }).where(eq(patternCandidates.id, existingCandidate.id));

      // Link case to candidate
      await db.insert(casePatternLinks).values({
        caseId,
        patternCandidateId: existingCandidate.id,
        caseSignalId: signal.id,
        contributionType: "supporting",
        linkedAt: now,
      }).onDuplicateKeyUpdate({ set: { linkedAt: now } });

      // Update the case_signal with the pattern candidate link
      await db.update(caseSignals).set({
        patternCandidateId: existingCandidate.id,
        updatedAt: now,
      }).where(eq(caseSignals.id, signal.id));

      candidatesStrengthened++;

      // Check if candidate should be promoted to active
      if (existingCandidate.patternStatus === "candidate" && newSignalCount >= existingCandidate.confirmationThreshold) {
        const promoted = await promoteCandidate(existingCandidate.id, existingCandidate.candidateId);
        if (promoted) candidatesPromoted++;
      }
    } else {
      // Count existing matching signals across all cases (within time window)
      const matchingSignalCount = await countMatchingSignals(signal, 90);

      if (matchingSignalCount >= 2) {
        // Enough signals to create a pattern candidate
        const candidateId = randomUUID();
        const [result] = await db.insert(patternCandidates).values({
          candidateId,
          patternName: buildPatternName(signal),
          patternDescription: buildPatternDescription(signal, matchingSignalCount),
          patternType: mapSignalTypeToPatternType(signal.signalType),
          entityName: signal.entityName || null,
          entityType: signal.entityType || null,
          claimType: signal.claimType || null,
          jurisdiction: signal.jurisdiction || null,
          domain: signal.domain || null,
          patternStatus: "candidate",
          confidenceScore: String(Math.min(0.7, 0.3 + (matchingSignalCount * 0.1))),
          signalCount: matchingSignalCount + 1,
          caseCount: 1,
          uniqueUsers: 1,
          evidenceStrength: String(signal.evidenceStrength),
          geographicSpread: 1,
          timeSpanDays: 0,
          firstSignalAt: now,
          lastSignalAt: now,
          promotionThreshold: 3,
          confirmationThreshold: 5,
          timeWindowDays: 90,
          createdAt: now,
          updatedAt: now,
        });

        // Link case to new candidate
        await db.insert(casePatternLinks).values({
          caseId,
          patternCandidateId: result.insertId,
          caseSignalId: signal.id,
          contributionType: "originating",
          linkedAt: now,
        }).onDuplicateKeyUpdate({ set: { linkedAt: now } });

        // Update case_signal with candidate link
        await db.update(caseSignals).set({
          patternCandidateId: result.insertId,
          updatedAt: now,
        }).where(eq(caseSignals.id, signal.id));

        candidatesCreated++;
      }
    }
  }

  return { candidatesCreated, candidatesStrengthened, candidatesPromoted };
}

// ─── Step 5: Promote Candidate to Pattern Registry ───

async function promoteCandidate(candidateDbId: number, candidateUuid: string): Promise<boolean> {
  const now = Date.now();
  const patternId = randomUUID();

  try {
    // Get the candidate data
    const [candidate] = await db.select().from(patternCandidates)
      .where(eq(patternCandidates.id, candidateDbId));
    if (!candidate) return false;

    // Create entry in pattern_registry
    await db.insert(patternRegistry).values({
      patternId,
      patternName: candidate.patternName,
      patternDescription: candidate.patternDescription,
      patternType: candidate.patternType,
      signalType: "case_bridge",
      triggerThreshold: candidate.confirmationThreshold,
      confidenceThreshold: 50,
      confidenceScore: Math.round(Number(candidate.confidenceScore) * 100),
      jurisdictionScope: candidate.jurisdiction,
      firstDetected: candidate.firstSignalAt,
      lastConfirmed: now,
      lastUpdated: now,
      signalCount: candidate.signalCount,
      uniqueEntitiesCount: candidate.entityName ? 1 : 0,
      geographicSpread: candidate.geographicSpread || 1,
      timeSpanDays: candidate.timeSpanDays || 0,
      decayStatus: "active",
      harmDomains: candidate.domain ? [candidate.domain] : [],
      metadata: {
        promotedFromCandidate: candidateUuid,
        caseCount: candidate.caseCount,
        evidenceStrength: Number(candidate.evidenceStrength),
      },
      createdAt: now,
      updatedAt: now,
    });

    // Update candidate status
    await db.update(patternCandidates).set({
      patternStatus: "active",
      promotedPatternId: patternId,
      updatedAt: now,
    }).where(eq(patternCandidates.id, candidateDbId));

    // Update case_pattern_links to also reference the pattern registry
    await db.update(casePatternLinks).set({
      patternRegistryId: patternId,
    }).where(eq(casePatternLinks.patternCandidateId, candidateDbId));

    return true;
  } catch (err) {
    console.error("[CasePatternBridge] Failed to promote candidate:", err);
    return false;
  }
}

// ─── Full Pipeline: Extract → Store → Evaluate ───

export async function runCasePatternBridge(caseId: number, userId: number): Promise<{
  signalsExtracted: number;
  signalsStored: number;
  candidatesCreated: number;
  candidatesStrengthened: number;
  candidatesPromoted: number;
}> {
  // Load case data
  const caseData = await loadCaseData(caseId, userId);

  // Extract signals
  const extracted = extractSignalsFromCase(caseData);

  // Store signals
  const storedIds = await storeCaseSignals(caseId, userId, extracted);

  // Build signal objects with IDs for pattern evaluation
  const signalsWithIds = extracted.map((sig, i) => ({
    id: storedIds[i],
    ...sig,
  }));

  // Evaluate pattern candidates
  const patternResult = await evaluatePatternCandidates(signalsWithIds, caseId);

  return {
    signalsExtracted: extracted.length,
    signalsStored: storedIds.length,
    ...patternResult,
  };
}

// ─── Query Helpers ───

export async function getCaseSignals(caseId: number): Promise<any[]> {
  return db.select().from(caseSignals)
    .where(and(eq(caseSignals.caseId, caseId), eq(caseSignals.active, 1)))
    .orderBy(desc(caseSignals.createdAt));
}

export async function getCasePatterns(caseId: number): Promise<any[]> {
  const links = await db.select({
    linkId: casePatternLinks.id,
    contributionType: casePatternLinks.contributionType,
    linkedAt: casePatternLinks.linkedAt,
    candidateId: patternCandidates.candidateId,
    patternName: patternCandidates.patternName,
    patternType: patternCandidates.patternType,
    patternStatus: patternCandidates.patternStatus,
    confidenceScore: patternCandidates.confidenceScore,
    signalCount: patternCandidates.signalCount,
    caseCount: patternCandidates.caseCount,
    entityName: patternCandidates.entityName,
    claimType: patternCandidates.claimType,
    jurisdiction: patternCandidates.jurisdiction,
    promotedPatternId: patternCandidates.promotedPatternId,
  })
    .from(casePatternLinks)
    .innerJoin(patternCandidates, eq(casePatternLinks.patternCandidateId, patternCandidates.id))
    .where(eq(casePatternLinks.caseId, caseId))
    .orderBy(desc(casePatternLinks.linkedAt));

  return links;
}

export async function getPatternCandidateDashboard(): Promise<{
  total: number;
  candidates: number;
  active: number;
  dormant: number;
  rejected: number;
  items: any[];
}> {
  const items = await db.select().from(patternCandidates)
    .orderBy(desc(patternCandidates.updatedAt))
    .limit(100);

  const total = items.length;
  const candidates = items.filter((i: any) => i.patternStatus === "candidate").length;
  const active = items.filter((i: any) => i.patternStatus === "active").length;
  const dormant = items.filter((i: any) => i.patternStatus === "dormant").length;
  const rejected = items.filter((i: any) => i.patternStatus === "rejected").length;

  return { total, candidates, active, dormant, rejected, items };
}

export async function getPatternSupportingCases(candidateId: number): Promise<any[]> {
  return db.select({
    caseId: casePatternLinks.caseId,
    contributionType: casePatternLinks.contributionType,
    linkedAt: casePatternLinks.linkedAt,
    caseName: cases.name,
    caseDomain: cases.domain,
    caseStatus: cases.status,
  })
    .from(casePatternLinks)
    .innerJoin(cases, eq(casePatternLinks.caseId, cases.id))
    .where(eq(casePatternLinks.patternCandidateId, candidateId))
    .orderBy(desc(casePatternLinks.linkedAt));
}

// ─── Internal Helpers ───

function calculateEvidenceStrength(claimsArr: Array<{ statementOrigin: string; evidentiaryWeight: string }>): number {
  if (claimsArr.length === 0) return 0;
  let score = 0;
  for (const c of claimsArr) {
    // Sworn testimony and court filings are strongest
    if (c.statementOrigin === "sworn_testimony") score += 0.3;
    else if (c.statementOrigin === "court_filing") score += 0.25;
    else if (c.statementOrigin === "discovery_disclosure") score += 0.2;
    else score += 0.1;

    if (c.evidentiaryWeight === "finding_eligible") score += 0.1;
  }
  return Math.min(1, score / claimsArr.length);
}

function getMostCommonClaimType(claimsArr: Array<{ claimType: string }>): string | undefined {
  if (claimsArr.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const c of claimsArr) {
    counts.set(c.claimType, (counts.get(c.claimType) || 0) + 1);
  }
  let maxType = "";
  let maxCount = 0;
  for (const [type, count] of counts) {
    if (count > maxCount) { maxType = type; maxCount = count; }
  }
  return maxType || undefined;
}

function buildMatchKey(signal: ExtractedSignal): string | null {
  const parts: string[] = [];
  if (signal.entityName) parts.push(`e:${signal.entityName.toLowerCase().trim()}`);
  if (signal.claimType) parts.push(`c:${signal.claimType.toLowerCase().trim()}`);
  if (signal.jurisdiction) parts.push(`j:${signal.jurisdiction.toLowerCase().trim()}`);
  return parts.length >= 2 ? parts.join("|") : null;
}

async function findMatchingCandidate(signal: ExtractedSignal): Promise<any | null> {
  // Find a candidate matching entity + claim_type + jurisdiction (any combination of 2+)
  const conditions: any[] = [
    eq(patternCandidates.patternStatus, "candidate"),
  ];

  if (signal.entityName) {
    conditions.push(eq(patternCandidates.entityName, signal.entityName));
  }
  if (signal.claimType) {
    conditions.push(eq(patternCandidates.claimType, signal.claimType));
  }

  if (conditions.length < 2) return null;

  const [match] = await db.select().from(patternCandidates)
    .where(and(...conditions))
    .limit(1);

  return match || null;
}

async function countMatchingSignals(signal: ExtractedSignal, windowDays: number): Promise<number> {
  const windowStart = Date.now() - (windowDays * 24 * 60 * 60 * 1000);
  const conditions: any[] = [
    eq(caseSignals.active, 1),
    gte(caseSignals.createdAt, windowStart),
  ];

  if (signal.entityName) {
    conditions.push(eq(caseSignals.entityName, signal.entityName));
  }
  if (signal.claimType) {
    conditions.push(eq(caseSignals.claimType, signal.claimType));
  }

  if (conditions.length < 3) return 0; // Need at least entity or claim_type match

  const [result] = await db.select({ cnt: sql<number>`COUNT(*)` })
    .from(caseSignals)
    .where(and(...conditions));

  return result?.cnt || 0;
}

async function countUniqueCases(candidateId: number): Promise<number> {
  const [result] = await db.select({ cnt: sql<number>`COUNT(DISTINCT ${casePatternLinks.caseId})` })
    .from(casePatternLinks)
    .where(eq(casePatternLinks.patternCandidateId, candidateId));
  return result?.cnt || 0;
}

function recalculateConfidence(
  candidate: any,
  newSignalCount: number,
  newCaseCount: number
): number {
  // Weighted confidence: signal count (40%), case count (30%), evidence strength (30%)
  const signalFactor = Math.min(1, newSignalCount / 10) * 0.4;
  const caseFactor = Math.min(1, newCaseCount / 5) * 0.3;
  const evidenceFactor = Number(candidate.evidenceStrength || 0) * 0.3;
  return Math.min(0.99, signalFactor + caseFactor + evidenceFactor);
}

function buildPatternName(signal: ExtractedSignal): string {
  const parts: string[] = [];
  if (signal.entityName) parts.push(signal.entityName);
  if (signal.claimType) parts.push(signal.claimType);
  if (signal.jurisdiction) parts.push(`in ${signal.jurisdiction}`);
  return parts.length > 0 ? parts.join(" — ") : "Unnamed Pattern";
}

function buildPatternDescription(signal: ExtractedSignal, matchCount: number): string {
  const entity = signal.entityName ? `involving "${signal.entityName}"` : "";
  const claim = signal.claimType ? `of type "${signal.claimType}"` : "";
  const jurisdiction = signal.jurisdiction ? `in ${signal.jurisdiction}` : "";
  return `Pattern candidate based on ${matchCount + 1} matching signals ${entity} ${claim} ${jurisdiction}. Awaiting additional confirmation.`.trim();
}

function mapSignalTypeToPatternType(signalType: string): string {
  switch (signalType) {
    case "entity_involvement": return "entity_cluster";
    case "claim_pattern": return "claim_pattern";
    case "evidence_flag": return "evidence_pattern";
    case "strong_finding": return "finding_cluster";
    case "deadline_alert": return "deadline_convergence";
    default: return "general";
  }
}
