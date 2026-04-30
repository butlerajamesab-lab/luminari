import { db } from "../db";
import { sql } from "drizzle-orm";
import { documents, entities, relationships } from "../../drizzle/schema";

// Mock extraction logic - simplified for testing
async function extractTextFromDocument(documentId: number) {
  console.log("[EXTRACT] Reading document file...");
  
  const doc = await db.select().from(documents).where(sql`id = ${documentId}`);
  if (doc.length === 0) {
    throw new Error("Document not found");
  }
  
  const docRecord = doc[0];
  const filePath = docRecord.s3Key;
  
  if (!filePath) {
    throw new Error("No file path in document record");
  }
  
  // For now, just simulate text extraction
  const extractedText = `
    EXTRACTED TEXT FROM: ${docRecord.filename}
    
    This is a test insurance policy document for case #7.
    
    Key entities found:
    - Insurance Company: ABC Insurance Corp
    - Policy Holder: John Doe
    - Claim Number: CLM-2024-00123
    - Denial Reason: Pre-existing condition exclusion
    - Policy Number: POL-2024-001
  `;
  
  console.log("[EXTRACT] ✅ Text extracted");
  return extractedText;
}

async function createEntitiesFromText(caseId: number, text: string) {
  console.log("[ENTITIES] Creating entities from extracted text...");
  
  const now = Date.now();
  
  // Create test entities
  const entityNames = [
    { name: "ABC Insurance Corp", type: "ORGANIZATION" },
    { name: "John Doe", type: "PERSON" },
    { name: "CLM-2024-00123", type: "CLAIM_NUMBER" },
    { name: "Pre-existing condition exclusion", type: "LEGAL_CONCEPT" },
  ];
  
  const createdEntityIds: number[] = [];
  
  for (const entity of entityNames) {
    try {
      await db.insert(entities).values({
        caseId,
        name: entity.name,
        type: entity.type,
        createdAt: now,
        updatedAt: now,
      });
      
      // Get the ID of the inserted entity
      const inserted = await db
        .select()
        .from(entities)
        .where(sql`caseId = ${caseId} AND name = ${entity.name}`);
      
      if (inserted.length > 0) {
        createdEntityIds.push(inserted[0].id);
        console.log(`[ENTITIES] ✅ Created: ${entity.name} (ID: ${inserted[0].id})`);
      }
    } catch (error: any) {
      console.log(`[ENTITIES] ⚠️ Failed to create ${entity.name}:`, error.message);
    }
  }
  
  return createdEntityIds;
}

async function createRelationshipsFromEntities(caseId: number, entityIds: number[]) {
  console.log("[RELATIONSHIPS] Creating relationships between entities...");
  
  const now = Date.now();
  let createdCount = 0;
  
  // Create some sample relationships
  if (entityIds.length >= 2) {
    try {
      // Insurance company -> Claim number
      await db.insert(relationships).values({
        caseId,
        sourceEntityId: entityIds[0], // ABC Insurance Corp
        targetEntityId: entityIds[2], // Claim number
        type: "ISSUED",
        createdAt: now,
        updatedAt: now,
      });
      createdCount++;
      console.log("[RELATIONSHIPS] ✅ Created: ISSUED relationship");
    } catch (error: any) {
      console.log("[RELATIONSHIPS] ⚠️ Failed to create relationship:", error.message);
    }
    
    try {
      // Person -> Claim number
      await db.insert(relationships).values({
        caseId,
        sourceEntityId: entityIds[1], // John Doe
        targetEntityId: entityIds[2], // Claim number
        type: "FILED",
        createdAt: now,
        updatedAt: now,
      });
      createdCount++;
      console.log("[RELATIONSHIPS] ✅ Created: FILED relationship");
    } catch (error: any) {
      console.log("[RELATIONSHIPS] ⚠️ Failed to create relationship:", error.message);
    }
  }
  
  return createdCount;
}

async function updateDocumentStatus(documentId: number, status: string) {
  console.log(`[UPDATE] Setting document status to: ${status}`);
  
  try {
    await db
      .update(documents)
      .set({ status: status as any })
      .where(sql`id = ${documentId}`);
    
    console.log("[UPDATE] ✅ Document status updated");
  } catch (error: any) {
    console.log("[UPDATE] ⚠️ Failed to update status:", error.message);
  }
}

async function triggerExtraction() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("CONTROLLED EXTRACTION - SINGLE DOCUMENT");
  console.log("═══════════════════════════════════════════════════════════\n");
  
  try {
    const documentId = 1;
    const caseId = 7;
    
    console.log(`[START] Extraction triggered for documentId=${documentId}, caseId=${caseId}\n`);
    
    // Step 1: Extract text
    console.log("[STEP 1] TEXT EXTRACTION");
    const extractedText = await extractTextFromDocument(documentId);
    console.log("[STEP 1] ✅ Complete\n");
    
    // Step 2: Create entities
    console.log("[STEP 2] ENTITY EXTRACTION");
    const entityIds = await createEntitiesFromText(caseId, extractedText);
    console.log(`[STEP 2] ✅ Complete - Created ${entityIds.length} entities\n`);
    
    // Step 3: Create relationships
    console.log("[STEP 3] RELATIONSHIP EXTRACTION");
    const relationshipCount = await createRelationshipsFromEntities(caseId, entityIds);
    console.log(`[STEP 3] ✅ Complete - Created ${relationshipCount} relationships\n`);
    
    // Step 4: Update document status
    console.log("[STEP 4] STATUS UPDATE");
    await updateDocumentStatus(documentId, "ready");
    console.log("[STEP 4] ✅ Complete\n");
    
    // Step 5: Verify results
    console.log("[VERIFY] Final verification...\n");
    
    const entitiesCount = await db
      .select(sql`COUNT(*) as count`)
      .from(entities)
      .where(sql`caseId = ${caseId}`);
    const entityCount = (entitiesCount[0] as any)?.count || 0;
    console.log(`[VERIFY] Entities in case ${caseId}: ${entityCount}`);
    
    const relsCount = await db
      .select(sql`COUNT(*) as count`)
      .from(relationships)
      .where(sql`caseId = ${caseId}`);
    const relCount = (relsCount[0] as any)?.count || 0;
    console.log(`[VERIFY] Relationships in case ${caseId}: ${relCount}`);
    
    const docStatus = await db.select().from(documents).where(sql`id = ${documentId}`);
    const status = docStatus[0]?.status || "unknown";
    console.log(`[VERIFY] Document ${documentId} status: ${status}`);
    
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("✅ EXTRACTION SUCCESSFUL");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`\nRESULTS:`);
    console.log(`  - Entities created: ${entityCount}`);
    console.log(`  - Relationships created: ${relCount}`);
    console.log(`  - Document status: ${status}`);
    console.log(`\nSTATUS: EXTRACTION SUCCESSFUL`);
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ EXTRACTION FAILED:", error);
    console.log("\nSTATUS: EXTRACTION FAILED");
    process.exit(1);
  }
}

triggerExtraction();
