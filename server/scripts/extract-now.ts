import { db } from "../db";
import { sql } from "drizzle-orm";
import { processDocument } from "../analysis-pipeline";

async function extractNow() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("EXTRACTION - DIRECT ENGINE EXECUTION");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    console.log("START EXTRACTION", { documentId: 1, caseId: 7 });
    
    await processDocument(1);
    
    console.log("EXTRACTION COMPLETE\n");

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify with raw SQL only
    console.log("[VERIFY] Checking results with raw SQL...\n");

    const entitiesResult = await db.execute(sql.raw(`
      SELECT COUNT(*) as count FROM entities WHERE caseId = 7
    `));
    const entityCount = (entitiesResult as any[])[0]?.count || 0;
    console.log(`Entities in case 7: ${entityCount}`);

    const relsResult = await db.execute(sql.raw(`
      SELECT COUNT(*) as count FROM relationships WHERE caseId = 7
    `));
    const relCount = (relsResult as any[])[0]?.count || 0;
    console.log(`Relationships in case 7: ${relCount}`);

    const docResult = await db.execute(sql.raw(`
      SELECT status FROM documents WHERE id = 1
    `));
    const status = (docResult as any[])[0]?.status || "unknown";
    console.log(`Document 1 status: ${status}\n`);

    console.log("═══════════════════════════════════════════════════════════");
    console.log("EXTRACTION RESULTS");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`Entities: ${entityCount}`);
    console.log(`Relationships: ${relCount}`);
    console.log(`Document status: ${status}`);
    console.log("═══════════════════════════════════════════════════════════\n");

    process.exit(0);
  } catch (error) {
    console.error("EXTRACTION ERROR:", error);
    process.exit(1);
  }
}

extractNow();
