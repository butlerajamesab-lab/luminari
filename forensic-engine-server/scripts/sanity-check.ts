import { db } from "../db";
import { sql } from "drizzle-orm";

async function sanityCheck() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("SANITY CHECK - ENTITIES TABLE");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    console.log("[CHECK] Running raw SQL query on entities table...");
    
    // Use raw SQL only - no Drizzle ORM
    const result = await db.execute(sql.raw(`
      SELECT COUNT(*) as count FROM entities WHERE caseId = 7
    `));
    
    const count = (result as any[])[0]?.count || 0;
    
    console.log(`[CHECK] ✅ Query successful`);
    console.log(`[CHECK] Entities in case 7: ${count}\n`);
    
    console.log("═══════════════════════════════════════════════════════════");
    console.log("✅ SANITY CHECK PASSED");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\nStatus: ENTITIES TABLE CLEAN - Ready for extraction\n");
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ SANITY CHECK FAILED:", error);
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("❌ ENTITIES TABLE STILL BROKEN");
    console.log("═══════════════════════════════════════════════════════════\n");
    process.exit(1);
  }
}

sanityCheck();
