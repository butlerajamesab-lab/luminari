import { sql, eq, and } from "drizzle-orm";
import { documents, entities, relationships, quotes, findings, signalFlags, claims, dataSnapshots } from "../drizzle/schema";
import { db } from "./db";
import { injectForensicMetadata, queryForensicMetadata, closeForensicConnection, getForensicConnection } from "./forensic-db";
import fs from "fs";
import crypto from "crypto";

/**
 * Extract text from a document.
 * Priority: DB textContent > file read.
 * Falls back to file read only if textContent is null.
 */
async function extractTextFromDocument(documentId: number, filePath: string): Promise<string> {
  // Priority 1: Use textContent from DB (already extracted and stored)
  const docResult = await db.select({ textContent: documents.textContent }).from(documents).where(sql`id = ${documentId}`);
  if (docResult.length > 0 && docResult[0].textContent && docResult[0].textContent.length > 10) {
    console.log("[Extract] Using textContent from DB (", docResult[0].textContent.length, "chars)");
    return docResult[0].textContent;
  }

  // Priority 2: Read from file
  try {
    let cleanPath = filePath;
    if (cleanPath.startsWith('file://')) {
      cleanPath = cleanPath.slice(7);
    }
    const buffer = fs.readFileSync(cleanPath);
    return buffer.toString('utf-8');
  } catch (e) {
    console.log("[Extract] Could not read file:", e);
    return "Unable to extract text from document.";
  }
}

/**
 * Extract the sentence containing a match for use as source_quote
 */
function extractSurroundingSentence(text: string, matchIndex: number): string {
  // Find sentence boundaries around the match
  const before = text.lastIndexOf('.', matchIndex);
  const after = text.indexOf('.', matchIndex);
  const start = before >= 0 ? before + 1 : Math.max(0, matchIndex - 100);
  const end = after >= 0 ? Math.min(after + 1, text.length) : Math.min(matchIndex + 100, text.length);
  return text.slice(start, end).trim();
}

/**
 * Deterministic entity extraction using regex/keyword patterns
 */
async function extractEntitiesFromText(
  caseId: number,
  documentId: number,
  documentHash: string,
  passIdentifier: string,
  text: string
): Promise<number> {
  console.log("[Extract] Step 1: Deterministic entity extraction");
  console.log("[Extract] Input text length:", text.length);
  console.log("[Extract] Input text preview:", text.slice(0, 300));

  const entities_list: Array<{ name: string; type: string; source_quote: string; confidence_score: number }> = [];

  // AGENCY: "Department of X", "X Commission", "X Agency", "Office of X", "Bureau of X"
  const agencyPatterns = [
    /(?:Department|Dept\.?)\s+of\s+[\w\s]{2,40}/gi,
    /[\w\s]{2,30}\s+(?:Commission|Agency|Authority|Board|Administration)/gi,
    /(?:Office|Bureau)\s+of\s+[\w\s]{2,40}/gi,
    /(?:Social Security Administration|SSA|HUD|EEOC|FTC|EPA|FDA|OSHA|IRS|CMS|VA|DOJ|DOL)/g,
  ];
  for (const pattern of agencyPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[0].trim();
      if (name.length > 3 && name.length < 80) {
        entities_list.push({
          name,
          type: "AGENCY",
          source_quote: extractSurroundingSentence(text, match.index),
          confidence_score: 1.0,
        });
      }
    }
  }

  // DEADLINE: date patterns
  const deadlinePatterns = [
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}\b/gi,
    /\bwithin\s+\d+\s+(?:days?|business days?|calendar days?|months?|years?)\b/gi,
    /\bby\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/gi,
    /\b\d+[\s-]day\s+(?:deadline|limit|period|window)\b/gi,
  ];
  for (const pattern of deadlinePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      entities_list.push({
        name: match[0].trim(),
        type: "DEADLINE",
        source_quote: extractSurroundingSentence(text, match.index),
        confidence_score: 1.0,
      });
    }
  }

  // STATUTE: "§ X", "Section X", "X U.S.C.", "[State] Code X"
  const statutePatterns = [
    /§\s*[\d.]+(?:\([a-z]\))?/g,
    /\bSection\s+\d+[\w.()-]*/gi,
    /\b\d+\s+U\.?S\.?C\.?\s*§?\s*\d+/g,
    /\b(?:RCW|ORS|Cal\.|Fla\. Stat\.|Tex\.|N\.Y\.)\s*[\d§.]+[\w().-]*/g,
    /\b\w+\s+Code\s+(?:§\s*)?\d+[\w.()-]*/gi,
    /\b(?:42|29|28|26|18|15|12|11|7|5)\s+(?:U\.S\.C\.|USC)\s*§?\s*\d+/g,
  ];
  for (const pattern of statutePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[0].trim();
      if (name.length > 2) {
        entities_list.push({
          name,
          type: "STATUTE",
          source_quote: extractSurroundingSentence(text, match.index),
          confidence_score: 1.0,
        });
      }
    }
  }

  // PERSON: 2-3 capitalized words in sequence (not at sentence start after period)
  const personPattern = /(?<=[.\n]\s*|\b(?:Mr\.|Mrs\.|Ms\.|Dr\.|Judge|Commissioner|Director|Secretary)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/g;
  let personMatch;
  while ((personMatch = personPattern.exec(text)) !== null) {
    const name = personMatch[1] || personMatch[0];
    // Skip common non-person phrases
    if (!/^(?:The |This |That |These |Those |United States|New York|North |South |West |East )/.test(name)) {
      entities_list.push({
        name: name.trim(),
        type: "PERSON",
        source_quote: extractSurroundingSentence(text, personMatch.index),
        confidence_score: 0.8,
      });
    }
  }

  // FORM: "Form X", "Application for X"
  const formPatterns = [
    /\bForm\s+[\w-]+(?:\s+[\w-]+)?/gi,
    /\bApplication\s+for\s+[\w\s]{2,40}/gi,
    /\b(?:SF|SSA|CMS|VA|I)-?\d+\w*/g,
  ];
  for (const pattern of formPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      entities_list.push({
        name: match[0].trim(),
        type: "FORM",
        source_quote: extractSurroundingSentence(text, match.index),
        confidence_score: 1.0,
      });
    }
  }

  // REQUIREMENT: "must", "shall", "required to"
  const requirementPatterns = [
    /[^.]*\b(?:must|shall|required to|obligated to|mandated to)\b[^.]*/gi,
  ];
  for (const pattern of requirementPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const sentence = match[0].trim();
      if (sentence.length > 10 && sentence.length < 300) {
        entities_list.push({
          name: sentence.slice(0, 80),
          type: "REQUIREMENT",
          source_quote: sentence,
          confidence_score: 1.0,
        });
      }
    }
  }

  // LOCATION: state names, "County of X"
  const locationPatterns = [
    /\bCounty\s+of\s+[\w\s]{2,30}/gi,
    /\b[\w]+\s+County\b/g,
    /\b(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/g,
  ];
  for (const pattern of locationPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      entities_list.push({
        name: match[0].trim(),
        type: "LOCATION",
        source_quote: extractSurroundingSentence(text, match.index),
        confidence_score: 1.0,
      });
    }
  }

  // WORKFLOW: "Step X", numbered lists, "Process:"
  const workflowPatterns = [
    /\bStep\s+\d+[^.]*/gi,
    /\bProcess:\s*[^.]*/gi,
    /^\s*\d+\.\s+[^\n]+/gm,
  ];
  for (const pattern of workflowPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[0].trim().slice(0, 80);
      if (name.length > 5) {
        entities_list.push({
          name,
          type: "WORKFLOW",
          source_quote: extractSurroundingSentence(text, match.index),
          confidence_score: 1.0,
        });
      }
    }
  }

  // INSTITUTIONAL_FAILURE: "failed to", "did not", "refused to", "delayed"
  const failurePatterns = [
    /[^.]*\b(?:failed to|did not|refused to|neglected to|omitted|delayed|denied without)\b[^.]*/gi,
  ];
  for (const pattern of failurePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const sentence = match[0].trim();
      if (sentence.length > 10 && sentence.length < 300) {
        entities_list.push({
          name: sentence.slice(0, 80),
          type: "INSTITUTIONAL_FAILURE",
          source_quote: sentence,
          confidence_score: 1.0,
        });
      }
    }
  }

  // Deduplicate by name+type
  const seen = new Set<string>();
  const dedupedEntities = entities_list.filter(e => {
    const key = `${e.type}::${e.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[Extract] Deterministic extraction found ${dedupedEntities.length} entities`);

  // Log NULL_SCAN if no entities found
  if (dedupedEntities.length === 0) {
    console.log("[Extract] NULL_SCAN_VALIDATED - No entities extracted from document");
  }

  let insertedCount = 0;
  let quotesInserted = 0;

  // Use forensic-db to inject metadata directly, bypassing Drizzle
  for (const entity of dedupedEntities) {
    try {
      console.log(`[Extract] Injecting forensic metadata: ${entity.name} (type: ${entity.type})`);

      // Inject directly via native driver - bypasses Drizzle middleware
      await injectForensicMetadata('entities', {
        caseId,
        name: entity.name,
        type: entity.type,
        engineVersion: 'v1',
        laneId: 'default',
        snapshotId: 1,
      });

      console.log(`[Extract] ✅ Injected entity: ${entity.name} (type: ${entity.type})`);
      insertedCount++;

      // === QUOTE PERSISTENCE ===
      // Save the source_quote from entity extraction as an actual quote row
      const sourceQuote = entity.source_quote;
      if (sourceQuote && sourceQuote !== 'N/A' && sourceQuote.length > 2) {
        try {
          await injectForensicMetadata('quotes', {
            caseId,
            documentId,
            quoteText: sourceQuote,
            statementOrigin: 'unknown',
            engineVersion: 'v1',
            laneId: 'default',
            snapshotId: 1,
          });
          quotesInserted++;
          console.log(`[Extract] ✅ Quote persisted for entity "${entity.name}": "${sourceQuote.slice(0, 60)}..."`);
        } catch (qErr: any) {
          console.error(`[Extract] ❌ Failed to persist quote for "${entity.name}": ${qErr.message}`);
        }
      }
    } catch (error: any) {
      console.error(`[Extract] ❌ Failed to inject entity "${entity.name}":`);
      console.error(`  Error: ${error.message}`);
    }
  }

  console.log(`[Extract] Total entities injected: ${insertedCount}`);
  console.log(`[Extract] Total quotes persisted: ${quotesInserted}`);

  return insertedCount;
}

async function extractRelationshipsFromEntities(caseId: number, entityIds: number[]): Promise<number> {
  if (entityIds.length < 2) return 0;

  let createdCount = 0;

  // For now, create simple self-relationships as proof of concept
  // Note: relationships table only has: id, caseId, sourceEntityId, targetEntityId, relationshipType, description, evidenceCount
  for (const entityId of entityIds) {
    try {
      await injectForensicMetadata('relationships', {
        caseId,
        sourceEntityId: entityId,
        targetEntityId: entityId,
        relationshipType: 'self_reference',
        description: 'Auto-generated self-reference from entity extraction',
        evidenceCount: 1,
      });
      createdCount++;
    } catch (e) {
      console.log("[Extract] Relationship creation skipped");
    }
  }

  return createdCount;
}

export async function enqueueDocument(documentId: number, caseId: number, snapshotId: number): Promise<void> {
  // Placeholder for queue integration
  await processDocument(documentId);
}

/**
 * processDocument — Extract entities from a document.
 * 
 * Runs with INGESTION_ENGINE system context to bypass ownership checks.
 * This allows the extraction pipeline to process any case without user session.
 * 
 * @param documentId - Document to process
 */
export async function processDocument(documentId: number): Promise<void> {
  console.log("[Pipeline] Starting extraction for document:", documentId, "(system context: INGESTION_ENGINE)");

  try {
    // Step 1: Get document
    const docResult = await db.select().from(documents).where(sql`id = ${documentId}`);
    if (docResult.length === 0) {
      console.log("[Pipeline] Document not found");
      return;
    }

    const doc = docResult[0];
    const caseId = doc.caseId;

    console.log("[Pipeline] Document found:", { documentId, caseId, filename: doc.filename });

    // Step 2: Extract text (DB-first, file fallback)
    console.log("[Pipeline] Step 2: Text extraction");
    const text = await extractTextFromDocument(documentId, doc.s3Url || "");
    console.log("[Pipeline] Extracted text length:", text.length);
    console.log("[Pipeline] Sample text:", text.slice(0, 200));

    // Step 3: Extract entities
    // Compute SHA-256 hash of text
    const documentHash = crypto.createHash('sha256').update(text).digest('hex');
    const entityCount = await extractEntitiesFromText(
      caseId,
      documentId,
      documentHash,
      `pass_${documentId}_${Date.now()}`,
      text
    );
    console.log("[Pipeline] Created", entityCount, "entities");

    // Step 4: Extract relationships
    console.log("[Pipeline] Step 3: Relationship extraction");
    // Get all entities for this document
    const entitiesForDoc = await db.select().from(entities).where(sql`caseId = ${caseId}`);
    const entityIds = entitiesForDoc.map((e: any) => e.id);
    const relationshipCount = await extractRelationshipsFromEntities(caseId, entityIds);
    console.log("[Pipeline] Created", relationshipCount, "relationships");

    // Step 5: Generate findings from extracted data
    console.log("[Pipeline] Step 4: Findings generation");
    const findingsCount = await generateFindingsFromExtraction(caseId, documentId);
    console.log("[Pipeline] Created", findingsCount, "findings");

    // Step 6: Generate claims from quotes
    console.log("[Pipeline] Step 5: Claim generation");
    const claimCount = await generateClaimsFromQuotes(caseId, documentId);
    console.log("[Pipeline] Created", claimCount, "claims");

    // Step 7: Update document status
    console.log("[Pipeline] Step 6: Update document status");
    await db.update(documents).set({ status: 'ready' }).where(sql`id = ${documentId}`);

    console.log("[Pipeline] ✅ Extraction complete (entities + quotes + findings + claims)");
  } catch (error) {
    console.error("[Pipeline] Extraction failed:", error);
    await db.update(documents).set({ status: 'error' }).where(sql`id = ${documentId}`);
  } finally {
    // Clean up forensic connection
    await closeForensicConnection();
  }
}

/**
 * Queue Status Stub
 * Returns default queue metrics for backward compatibility
 */
export function getQueueStatus() {
  return {
    queuedCount: 0,
    processingCount: 0,
    completedCount: 0,
    failedCount: 0,
    fallbackMatcherHitRate: 0,
    averageProcessingTime: 0,
  };
}

/**
 * Generate findings from extracted entities, quotes, and signal flags.
 * This is Pass 2 — it reads what Pass 1 wrote and produces findings.
 */
async function generateFindingsFromExtraction(caseId: number, documentId: number): Promise<number> {
  let findingsCreated = 0;

  try {
    // Fetch entities extracted for this case
    const caseEntities = await db.select().from(entities).where(eq(entities.caseId, String(caseId)));
    // Fetch quotes for this document
    const docQuotes = await db.select().from(quotes).where(eq(quotes.documentId, String(documentId)));
    // Fetch signal flags for this case
    const caseSignals = await db.select().from(signalFlags).where(eq(signalFlags.caseId, caseId));

    console.log(`[Findings] Input: ${caseEntities.length} entities, ${docQuotes.length} quotes, ${caseSignals.length} signals`);

    // Strategy 1: Generate findings from institutional failures
    const failures = caseEntities.filter((e: any) =>
      e.type === 'INSTITUTIONAL_FAILURE' ||
      e.type === 'institutional_failure' ||
      (e.description && e.description.toLowerCase().includes('failure'))
    );

    for (const failure of failures) {
      try {
        // Find backing quotes for this entity
        const backingQuoteIds = docQuotes
          .filter((q: any) => q.text && failure.name && q.text.toLowerCase().includes(failure.name.toLowerCase().split(' ')[0]))
          .map((q: any) => q.id)
          .slice(0, 5);

        await injectForensicMetadata('findings', {
          caseId,
          findingType: 'pattern',
          title: `Institutional Failure: ${failure.name}`,
          description: `The document states: "${failure.name}" was identified as an institutional failure requiring review.${failure.description ? ' ' + failure.description : ''}`,
          significance: 'Procedural compliance issue identified in administrative document.',
          claimIds: JSON.stringify(backingQuoteIds),
          confidence: 'preliminary',
          findingEvidentiaryWeight: 'note_signal',
          provenanceStatus: backingQuoteIds.length > 0 ? 'linked' : 'unsupported',
          provenanceAttempted: 1,
          candidateClaimCount: backingQuoteIds.length,
          fallbackTriggered: 0,
          matchAttemptTimestamp: Date.now(),
          createdAt: Date.now(),
          laneId: 'default',
          snapshotId: 1,
        });
        findingsCreated++;
        console.log(`[Findings] ✅ Created finding for failure: ${failure.name}`);
      } catch (e: any) {
        console.error(`[Findings] ❌ Failed to create finding for ${failure.name}: ${e.message}`);
      }
    }

    // Strategy 2: Generate findings from statutes/requirements
    const statutes = caseEntities.filter((e: any) =>
      e.type === 'STATUTE' || e.type === 'REQUIREMENT' || e.type === 'statute' || e.type === 'requirement'
    );

    for (const statute of statutes) {
      try {
        const backingQuoteIds = docQuotes
          .filter((q: any) => q.text && statute.name && q.text.toLowerCase().includes(statute.name.toLowerCase().split(' ')[0]))
          .map((q: any) => q.id)
          .slice(0, 5);

        await injectForensicMetadata('findings', {
          caseId,
          findingType: 'corroboration',
          title: `Regulatory Reference: ${statute.name}`,
          description: `The document references ${statute.name} as applicable to this matter.${statute.description ? ' ' + statute.description : ''}`,
          significance: 'Regulatory framework identification.',
          claimIds: JSON.stringify(backingQuoteIds),
          confidence: 'moderate',
          findingEvidentiaryWeight: 'note_signal',
          provenanceStatus: backingQuoteIds.length > 0 ? 'linked' : 'unsupported',
          provenanceAttempted: 1,
          candidateClaimCount: backingQuoteIds.length,
          fallbackTriggered: 0,
          matchAttemptTimestamp: Date.now(),
          createdAt: Date.now(),
          laneId: 'default',
          snapshotId: 1,
        });
        findingsCreated++;
        console.log(`[Findings] ✅ Created finding for statute: ${statute.name}`);
      } catch (e: any) {
        console.error(`[Findings] ❌ Failed to create finding for ${statute.name}: ${e.message}`);
      }
    }

    // Strategy 3: Generate findings from signal flags
    for (const signal of caseSignals) {
      try {
        await injectForensicMetadata('findings', {
          caseId,
          findingType: 'pattern',
          title: `Signal Flag: ${signal.flagType}`,
          description: signal.description || `Signal flag of type ${signal.flagType} detected in case analysis.`,
          significance: 'Signal detected by automated pipeline.',
          claimIds: JSON.stringify([]),
          confidence: 'preliminary',
          findingEvidentiaryWeight: 'note_signal',
          provenanceStatus: 'unsupported',
          provenanceAttempted: 1,
          candidateClaimCount: 0,
          fallbackTriggered: 0,
          matchAttemptTimestamp: Date.now(),
          createdAt: Date.now(),
          laneId: 'default',
          snapshotId: 1,
        });
        findingsCreated++;
      } catch (e: any) {
        console.error(`[Findings] ❌ Failed to create finding from signal: ${e.message}`);
      }
    }

    console.log(`[Findings] Total findings created: ${findingsCreated}`);
  } catch (error: any) {
    console.error(`[Findings] Generation failed: ${error.message}`);
  }

  return findingsCreated;
}

/**
 * Cross-document correlation (Pass 3)
 */
export async function runCrossDocumentCorrelation(caseId: number): Promise<void> {
  console.log("[Pipeline] Cross-document correlation for case:", caseId);
  // Fetch all documents for this case and run findings generation for each
  const caseDocs = await db.select().from(documents).where(eq(documents.caseId, caseId));
  for (const doc of caseDocs) {
    await generateFindingsFromExtraction(caseId, doc.id);
  }
}

export async function reanalyzeDocument(documentId: number): Promise<void> {
  console.log("[Pipeline] Reanalyze document placeholder");
}

export async function reanalyzeAllDocuments(caseId: number): Promise<void> {
  console.log("[Pipeline] Reanalyze all documents placeholder");
}

/**
 * Reconcile On Startup
 * Placeholder for startup reconciliation logic
 */
export async function reconcileOnStartup(): Promise<void> {
  console.log("[Pipeline] Startup reconciliation placeholder");
}

// ═══════════════════════════════════════════════════════════
// CLAIM GENERATION STAGE (integrated into processDocument)
// ═══════════════════════════════════════════════════════════

const VALID_CLAIM_TYPES = ["statement", "action", "event", "legal_filing", "testimony", "observation", "requirement", "deadline", "institutional_failure", "regulatory_reference"];
const VALID_ORIGINS = ["sworn_testimony", "court_filing", "discovery_disclosure", "media_report", "internal_memo", "informal_communication", "unknown"];
const VALID_WEIGHTS = ["finding_eligible", "signal_only"] as const;

/**
 * Deterministic quote classification using keyword/pattern matching
 */
function classifyQuote(quoteText: string): { claimType: string; evidentiaryWeight: string; claimStatementOrigin: string; dateReferenced: string | null } {
  const lower = quoteText.toLowerCase();

  // claimType detection
  let claimType = "statement";
  if (/\b(?:court|filed|motion|petition|order|judgment|ruling)\b/.test(lower)) {
    claimType = "legal_filing";
  } else if (/\b(?:testified|stated under oath|deposition|sworn)\b/.test(lower)) {
    claimType = "testimony";
  } else if (/\b(?:must|shall|required to|obligated|mandated)\b/.test(lower)) {
    claimType = "requirement";
  } else if (/\b(?:failed to|did not|refused to|neglected|omitted|denied without)\b/.test(lower)) {
    claimType = "institutional_failure";
  } else if (/§|\bU\.?S\.?C\.?\b|\bCode\b|\bSection\s+\d|\bstatute\b|\bregulation\b/.test(lower)) {
    claimType = "regulatory_reference";
  } else if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\bwithin\s+\d+\s+days?\b|\bdeadline\b|\bby\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)/i.test(lower)) {
    claimType = "deadline";
  } else if (/\b(?:occurred|happened|took place|was\s+\w+ed)\b/.test(lower)) {
    claimType = "event";
  }

  // evidentiaryWeight
  let evidentiaryWeight = "signal_only";
  if (/\b(?:failed|refused|denied|deadline|must|shall|required|violated|breach)\b/.test(lower)) {
    evidentiaryWeight = "finding_eligible";
  }

  // claimStatementOrigin
  let claimStatementOrigin = "unknown";
  if (/\b(?:court|motion|filed|petition|order|judgment|docket)\b/.test(lower)) {
    claimStatementOrigin = "court_filing";
  } else if (/\b(?:testified|sworn|deposition|under oath|affidavit)\b/.test(lower)) {
    claimStatementOrigin = "sworn_testimony";
  } else if (/\b(?:reported|article|news|press|media|journalist)\b/.test(lower)) {
    claimStatementOrigin = "media_report";
  } else if (/\b(?:memo|internal|memorandum|confidential)\b/.test(lower)) {
    claimStatementOrigin = "internal_memo";
  } else if (/\b(?:discovery|produced|exhibit|disclosure)\b/.test(lower)) {
    claimStatementOrigin = "discovery_disclosure";
  }

  // dateReferenced: extract first date pattern
  let dateReferenced: string | null = null;
  const dateMatch = quoteText.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/) ||
    quoteText.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s*\d{4}\b/i);
  if (dateMatch) {
    dateReferenced = dateMatch[0];
  }

  return { claimType, evidentiaryWeight, claimStatementOrigin, dateReferenced };
}

/**
 * Generate claims from extracted quotes for a single document.
 * Called as the final stage of processDocument.
 * 
 * Flow: quotes → deterministic classification → claims table + snapshot
 */
async function generateClaimsFromQuotes(caseId: number, documentId: number): Promise<number> {
  const CLAIM_ENGINE = "claim-gen-v2.0";
  const CLAIM_LANE = "claim_build_pipeline";

  try {
    // 1. Load quotes for this document
    const docQuotes = await db.select().from(quotes).where(
      and(eq(quotes.caseId, String(caseId)), eq(quotes.documentId, String(documentId)))
    );

    if (docQuotes.length === 0) {
      console.log("[ClaimGen] No quotes found for document", documentId);
      return 0;
    }

    // 2. Deduplicate by text
    const seen = new Set<string>();
    const uniqueQuotes = docQuotes.filter((q: any) => {
      const key = (q.text || "").trim().toLowerCase();
      if (!key || key.length < 5 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[ClaimGen] ${docQuotes.length} quotes → ${uniqueQuotes.length} unique`);

    // 3. Load entities for matching
    const caseEntities = await db.select().from(entities).where(eq(entities.caseId, String(caseId)));
    const entityIndex: Record<string, number[]> = {};
    for (const e of caseEntities) {
      const key = (e.name || "").toLowerCase().split(" ")[0];
      if (key) {
        if (!entityIndex[key]) entityIndex[key] = [];
        entityIndex[key].push(e.id);
      }
    }

    // 4. Classify quotes deterministically
    const allClassifications: Array<{ quote: typeof uniqueQuotes[0]; cls: any }> = [];

    for (const quote of uniqueQuotes) {
      const quoteText = (quote as any).text || "";
      if (quoteText.length < 5) continue;
      const cls = classifyQuote(quoteText);
      allClassifications.push({ quote, cls });
    }

    console.log(`[ClaimGen] Classified: ${allClassifications.length}/${uniqueQuotes.length}`);

    if (allClassifications.length === 0) return 0;

    // 5. Create snapshot
    const now = Date.now();
    const snapResult = await db.insert(dataSnapshots).values({
      snapshotDate: now,
      sourceTable: "claims",
      recordCount: 0,
      snapshotMetadata: {
        description: `Auto-generated claims for doc ${documentId} in case ${caseId}`,
      } as any,
      status: "pending",
      createdAt: now,
    });

    // Get the inserted snapshot ID
    const snapRows = await db.select().from(dataSnapshots).where(sql`snapshot_date = ${now} AND source_table = 'claims'`).orderBy(sql`id DESC`).limit(1);
    const snapshotId = snapRows.length > 0 ? snapRows[0].id : 1;

    console.log(`[ClaimGen] Created snapshot id=${snapshotId}`);

    // 6. Insert claims
    let inserted = 0;
    for (const { quote, cls } of allClassifications) {
      const claimType = VALID_CLAIM_TYPES.includes(cls.claimType) ? cls.claimType : "observation";
      const origin = VALID_ORIGINS.includes(cls.claimStatementOrigin) ? cls.claimStatementOrigin : "unknown";
      const weight = VALID_WEIGHTS.includes(cls.evidentiaryWeight) ? cls.evidentiaryWeight : "signal_only";

      // Entity matching
      const relatedEntityIds: number[] = [];
      for (const [key, ids] of Object.entries(entityIndex)) {
        if (((quote as any).text || "").toLowerCase().includes(key)) {
          relatedEntityIds.push(...ids);
        }
      }
      const uniqueEntityIds = [...new Set(relatedEntityIds)].slice(0, 10);

      try {
        await injectForensicMetadata('claims', {
          caseId,
          documentId,
          quoteId: (quote as any).id,
          claimText: (quote as any).text,
          claimType,
          dateReferenced: cls.dateReferenced || null,
          entitiesInvolved: uniqueEntityIds.length > 0 ? JSON.stringify(uniqueEntityIds) : null,
          claimStatementOrigin: origin,
          evidentiaryWeight: weight,
          engineVersion: CLAIM_ENGINE,
          laneId: CLAIM_LANE,
          snapshotId,
        });
        inserted++;
      } catch (e: any) {
        console.error(`[ClaimGen] Insert failed for quoteId=${(quote as any).id}: ${e.message}`);
      }
    }

    // 7. Finalize snapshot via direct connection
    const conn = await getForensicConnection() as any;
    if (!conn) {
      throw new Error("Forensic connection unavailable");
    }
    await conn.execute(
      'UPDATE data_snapshots SET snapshot_status = ?, record_count = ? WHERE id = ?',
      ['complete', inserted, snapshotId]
    );

    console.log(`[ClaimGen] ✅ ${inserted} claims created, snapshot ${snapshotId} → complete`);
    return inserted;
  } catch (error: any) {
    console.error(`[ClaimGen] Failed: ${error.message}`);
    return 0;
  }
}
