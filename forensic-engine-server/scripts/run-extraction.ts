import { db } from "../db";
import { sql } from "drizzle-orm";
import { documents, entities, relationships } from "../../drizzle/schema";
import { processDocument } from "../analysis-pipeline";

async function runExtraction() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("DIRECT ENGINE EXECUTION - EXTRACTION");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    const documentId = 1;
    const caseId = 7;
    const userId = 1;

    console.log(`[START] Extraction triggered`);
    console.log(`  - documentId: ${documentId}`);
    console.log(`  - caseId: ${caseId}`);
    console.log(`  - userId: ${userId}\n`);

    // Call extraction engine directly
    console.log("[EXECUTE] Calling processDocument()...\n");
    await processDocument(documentId);
    console.log("[EXECUTE] ✅ processDocument() completed\n");

    // Wait a moment for async operations
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify results
    console.log("[VERIFY] Checking results...\n");

    // Check entities
    console.log("[VERIFY] Querying entities...");
    try {
      const entitiesResult = await db
        .select(sql`COUNT(*) as count`)
        .from(entities)
        .where(sql`caseId = ${caseId}`);
      const entityCount = (entitiesResult[0] as any)?.count || 0;
      console.log(`  ✅ Entities in case ${caseId}: ${entityCount}`);
    } catch (error: any) {
      console.log(`  ❌ Error querying entities: ${error.message}`);
    }

    // Check relationships
    console.log("[VERIFY] Querying relationships...");
    try {
      const relsResult = await db
        .select(sql`COUNT(*) as count`)
        .from(relationships)
        .where(sql`caseId = ${caseId}`);
      const relCount = (relsResult[0] as any)?.count || 0;
      console.log(`  ✅ Relationships in case ${caseId}: ${relCount}`);
    } catch (error: any) {
      console.log(`  ❌ Error querying relationships: ${error.message}`);
    }

    // Check document status
    console.log("[VERIFY] Querying document status...");
    try {
      const docResult = await db
        .select()
        .from(documents)
        .where(sql`id = ${documentId}`);
      
      if (docResult.length > 0) {
        const status = docResult[0].status;
        console.log(`  ✅ Document ${documentId} status: ${status}`);
      } else {
        console.log(`  ❌ Document ${documentId} not found`);
      }
    } catch (error: any) {
      console.log(`  ❌ Error querying document: ${error.message}`);
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("✅ EXTRACTION EXECUTION COMPLETE");
    console.log("═══════════════════════════════════════════════════════════");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ EXTRACTION FAILED:", error);
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("❌ EXTRACTION EXECUTION FAILED");
    console.log("═══════════════════════════════════════════════════════════");
    process.exit(1);
  }
}

runExtraction();
