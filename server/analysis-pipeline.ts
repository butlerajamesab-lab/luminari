import { sql, eq, and } from "drizzle-orm";
import { documents, entities, relationships, quotes, findings, signalFlags, claims, dataSnapshots } from "../drizzle/schema";
import { invokeLLMDeterministic } from "./_core/llm";
import { invokeLLM } from "./_core/llm";
import { db } from "./db";
import { injectForensicMetadata, queryForensicMetadata, closeForensicConnection, getForensicConnection } from "./forensic-db";
import fs from "fs";
import crypto from "crypto";

function safeLLMContent(response: any, fallback: string = ""): string {
  console.log("[LLM] Response keys:", Object.keys(response || {}));
  
  let content = null;
  
  if (response?.choices?.[0]?.message?.content) {
    content = response.choices[0].message.content;
    console.log("[LLM] Detected: OpenAI Chat");
  } else if (response?.output_text) {
    content = response.output_text;
    console.log("[LLM] Detected: OpenAI Responses API");
  } else if (response?.output?.[0]?.content?.[0]?.text) {
    content = response.output[0].content[0].text;
    console.log("[LLM] Detected: OpenAI Output Array");
  } else if (response?.content?.[0]?.text) {
    content = response.content[0].text;
    console.log("[LLM] Detected: Anthropic");
  } else if (response?.data?.text) {
    content = response.data.text;
    console.log("[LLM] Detected: Custom Data");
  } else if (typeof response === "string") {
    content = response;
    console.log("[LLM] Detected: Raw String");
  }
  
  if (!content) {
    console.error("[LLM] PARSE FAILURE - No content extracted");
    return fallback;
  }
  
  return content;
}

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

async function extractEntitiesFromText(
  caseId: number,
  documentId: number,
  documentHash: string,
  passIdentifier: string,
  text: string
): Promise<number> {
  console.log("[Extract] Step 1: Entity extraction");
  console.log("[Extract] Input text length:", text.length);
  console.log("[Extract] Input text preview:", text.slice(0, 300));
  
  // Forensic-grade prompt with forced schema and anti-hallucination guards
  const prompt = `You are a Civic Forensic Intelligence Auditor. Analyze the following document and extract ALL entities that match these mandatory categories.

MANDATORY ENTITY CATEGORIES:
1. AGENCY - Government agencies, departments, commissions
2. REQUIREMENT - Mandatory duties, compliance requirements
3. DEADLINE - Specific dates, time limits, deadlines
4. FORM - Administrative forms, documents
5. WORKFLOW - Process steps, procedures
6. STATUTE - Laws, regulations, codes
7. INSTITUTIONAL_FAILURE - Documented failures, delays, omissions
8. PERSON - Named individuals, officials
9. LOCATION - Geographic locations, jurisdictions

DOCUMENT TEXT:
${text}

EXTRACTION RULES - ANTI-HALLUCINATION GUARDS:
- Extract ALL entities that match the categories above
- For each entity, provide a direct quote from the text as proof
- Assign confidence_score: 1.0 if direct quote found, 0.5 if inferred from context, 0.0 if uncertain
- Do NOT return empty array if any keywords appear: 'Agency', 'Requirement', 'Deadline', 'Form', 'Workflow', 'Statute', 'Failure', 'Commissioner', 'County'
- If no entities found, return: [{"name": "NO_ENTITIES_FOUND", "type": "METADATA_NOTE", "source_quote": "N/A", "confidence_score": 0}]
- Return ONLY valid JSON array, no markdown, no code blocks, no explanations

Return format (JSON array only, each object must have name, type, source_quote, confidence_score):
[
  {"name": "entity name", "type": "CATEGORY", "source_quote": "exact quote from text", "confidence_score": 1.0},
  {"name": "another entity", "type": "CATEGORY", "source_quote": "exact quote from text", "confidence_score": 0.9}
]`;

  console.log("[Extract] Prompt length:", prompt.length);
  
  // Call LLM with deterministic settings
  const response = await invokeLLMDeterministic({
    messages: [
      { role: "system", content: "You are a Civic Forensic Intelligence Auditor. Extract entities from administrative documents. Return ONLY valid JSON arrays with source quotes and confidence scores. Never return empty arrays without explanation." },
      { role: "user", content: prompt }
    ],
    documentHash: documentHash,
    pass: passIdentifier
  });

  const content = safeLLMContent(response, "[]");
  
  console.log("[Extract] Raw LLM response:", content.slice(0, 500));
  
  // Clean markdown if present
  let cleanContent = content;
  if (cleanContent.includes("```json")) {
    cleanContent = cleanContent.replace(/```json\n?/g, "").replace(/```\n?/g, "");
  } else if (cleanContent.includes("```")) {
    cleanContent = cleanContent.replace(/```\n?/g, "");
  }
  cleanContent = cleanContent.trim();
  
  console.log("[Extract] Cleaned content:", cleanContent);
  
  let entities_list = [];
  try {
    entities_list = JSON.parse(cleanContent);
    if (!Array.isArray(entities_list)) {
      // If it's an object with an 'entities' array, extract it
      if (entities_list.entities && Array.isArray(entities_list.entities)) {
        entities_list = entities_list.entities;
      } else {
        console.log("[Extract] Response is not array and has no .entities field:", entities_list);
        entities_list = [];
      }
    }
    console.log("[Extract] Parsed entities count:", entities_list.length);
    if (entities_list.length > 0) {
      console.log("[Extract] First entity:", entities_list[0]);
    }
    
    // Validate entities before insert
    const beforeValidation = entities_list.length;
    entities_list = entities_list.filter((entity: any) => {
      if (!entity.name || !entity.type) {
        console.log("[Extract] Skipping invalid entity (missing name or type):", entity);
        return false;
      }
      return true;
    });
    console.log(`[Extract] Valid entities after validation: ${entities_list.length}/${beforeValidation}`);
    
    // Log NULL_SCAN if no entities found
    if (entities_list.length === 0) {
      console.log("[Extract] NULL_SCAN_VALIDATED - No entities extracted from document");
    }
  } catch (e: any) {
    console.error("[Extract] Failed to parse entities JSON:", e.message);
    console.error("[Extract] Content that failed to parse:", cleanContent);
    entities_list = [];
  }
  
  let insertedCount = 0;
  let quotesInserted = 0;
  
  // Use forensic-db to inject metadata directly, bypassing Drizzle
  for (const entity of entities_list) {
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
      const sourceQuote = entity.source_quote || entity.sourceQuote;
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
 * Generate claims from extracted quotes for a single document.
 * Called as the final stage of processDocument.
 * 
 * Flow: quotes → LLM classification → claims table + snapshot
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
    
    // 4. Classify quotes via LLM in batches of 10
    const BATCH_SIZE = 10;
    const allClassifications: Array<{ quote: typeof uniqueQuotes[0]; cls: any }> = [];
    
    for (let i = 0; i < uniqueQuotes.length; i += BATCH_SIZE) {
      const batch = uniqueQuotes.slice(i, i + BATCH_SIZE);
      const quotesForPrompt = batch.map((q: any, idx: any) => `[${idx}] "${q.text}"`).join("\n");
      
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a forensic claim classifier. For each quote, determine:
- claimType: one of [statement, action, event, legal_filing, testimony, observation, requirement, deadline, institutional_failure, regulatory_reference]
- evidentiaryWeight: "finding_eligible" if the quote describes a specific failure, deadline, or actionable requirement; "signal_only" for general observations
- claimStatementOrigin: one of [sworn_testimony, court_filing, discovery_disclosure, media_report, internal_memo, informal_communication, unknown]
- dateReferenced: extract any date mentioned, or null

Return ONLY a JSON array matching the input order.`,
            },
            {
              role: "user",
              content: `Classify these quotes:\n${quotesForPrompt}\n\nReturn JSON array: [{"index": 0, "claimType": "...", "evidentiaryWeight": "...", "claimStatementOrigin": "...", "dateReferenced": "..."}]`,
            },
          ],
        });
        
        const content = safeLLMContent(response, "[]");
        let clean = content.trim();
        if (clean.includes("```json")) clean = clean.replace(/```json\n?/g, "").replace(/```\n?/g, "");
        else if (clean.includes("```")) clean = clean.replace(/```\n?/g, "");
        
        const classifications = JSON.parse(clean.trim());
        if (Array.isArray(classifications)) {
          for (const cls of classifications) {
            const idx = cls.index;
            if (idx >= 0 && idx < batch.length) {
              allClassifications.push({ quote: batch[idx], cls });
            }
          }
        }
      } catch (e: any) {
        console.error(`[ClaimGen] LLM batch failed: ${e.message}`);
      }
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
        if ((quote.text || "").toLowerCase().includes(key)) {
          relatedEntityIds.push(...ids);
        }
      }
      const uniqueEntityIds = [...new Set(relatedEntityIds)].slice(0, 10);
      
      try {
        await injectForensicMetadata('claims', {
          caseId,
          documentId,
          quoteId: quote.id,
          claimText: quote.text,
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
        console.error(`[ClaimGen] Insert failed for quoteId=${quote.id}: ${e.message}`);
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
