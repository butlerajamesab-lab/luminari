import { db } from "../db";
import { sql } from "drizzle-orm";
import { signalFlags, entities, relationships } from "../../drizzle/schema";

async function testWriteability() {
  try {
    const now = Date.now();
    
    console.log("[TEST] Starting writeability test...\n");
    
    // Step 1: Insert into signalFlags
    console.log("[1] Inserting into signalFlags...");
    try {
      await db.insert(signalFlags).values({
        caseId: 7,
        documentId: 1,
        flagType: "TEST_FLAG",
        description: "Writeability test",
      });
      console.log("[1] ✅ signalFlags insert success");
    } catch (error: any) {
      console.error("[1] ❌ signalFlags insert failed:", error.message);
      throw error;
    }
    
    // Step 2: Insert into entities
    console.log("[2] Inserting into entities...");
    let entityId: number;
    try {
      const result = await db.insert(entities).values({
        caseId: 7,
        name: "STRESS_TEST_ENTITY",
        type: "SYSTEM",
        createdAt: now,
        updatedAt: now,
      });
      
      // Get the inserted entity ID
      const inserted = await db
        .select()
        .from(entities)
        .where(sql`name = 'STRESS_TEST_ENTITY'`);
      
      if (inserted.length === 0) {
        throw new Error("Entity not found after insert");
      }
      
      entityId = inserted[0].id;
      console.log("[2] ✅ entities insert success, ID:", entityId);
    } catch (error: any) {
      console.error("[2] ❌ entities insert failed:", error.message);
      throw error;
    }
    
    // Step 3: Insert into relationships (self-link)
    console.log("[3] Inserting into relationships...");
    try {
      await db.insert(relationships).values({
        caseId: 7,
        sourceEntityId: entityId,
        targetEntityId: entityId,
        type: "SELF_TEST",
        createdAt: now,
        updatedAt: now,
      });
      console.log("[3] ✅ relationships insert success");
    } catch (error: any) {
      console.error("[3] ❌ relationships insert failed:", error.message);
      throw error;
    }
    
    // Step 4: Verify all inserts
    console.log("\n[VERIFY] Verifying inserts...");
    
    const flagsCount = await db
      .select(sql`COUNT(*) as count`)
      .from(signalFlags)
      .where(sql`flagType = 'TEST_FLAG'`);
    console.log("[VERIFY] signalFlags count:", (flagsCount[0] as any)?.count || 0);
    
    const entitiesCount = await db
      .select(sql`COUNT(*) as count`)
      .from(entities)
      .where(sql`name = 'STRESS_TEST_ENTITY'`);
    console.log("[VERIFY] entities count:", (entitiesCount[0] as any)?.count || 0);
    
    const relsCount = await db
      .select(sql`COUNT(*) as count`)
      .from(relationships)
      .where(sql`type = 'SELF_TEST'`);
    console.log("[VERIFY] relationships count:", (relsCount[0] as any)?.count || 0);
    
    // Step 5: Delete in reverse order
    console.log("\n[DELETE] Cleaning up in reverse order...");
    
    try {
      await db.delete(relationships).where(sql`type = 'SELF_TEST'`);
      console.log("[DELETE] ✅ relationships deleted");
    } catch (error: any) {
      console.error("[DELETE] ❌ relationships delete failed:", error.message);
      throw error;
    }
    
    try {
      await db.delete(entities).where(sql`name = 'STRESS_TEST_ENTITY'`);
      console.log("[DELETE] ✅ entities deleted");
    } catch (error: any) {
      console.error("[DELETE] ❌ entities delete failed:", error.message);
      throw error;
    }
    
    try {
      await db.delete(signalFlags).where(sql`flagType = 'TEST_FLAG'`);
      console.log("[DELETE] ✅ signalFlags deleted");
    } catch (error: any) {
      console.error("[DELETE] ❌ signalFlags delete failed:", error.message);
      throw error;
    }
    
    // Step 6: Final verification
    console.log("\n[FINAL] Final verification after cleanup...");
    
    const finalFlags = await db
      .select(sql`COUNT(*) as count`)
      .from(signalFlags)
      .where(sql`flagType = 'TEST_FLAG'`);
    console.log("[FINAL] signalFlags remaining:", (finalFlags[0] as any)?.count || 0);
    
    const finalEntities = await db
      .select(sql`COUNT(*) as count`)
      .from(entities)
      .where(sql`name = 'STRESS_TEST_ENTITY'`);
    console.log("[FINAL] entities remaining:", (finalEntities[0] as any)?.count || 0);
    
    const finalRels = await db
      .select(sql`COUNT(*) as count`)
      .from(relationships)
      .where(sql`type = 'SELF_TEST'`);
    console.log("[FINAL] relationships remaining:", (finalRels[0] as any)?.count || 0);
    
    console.log("\n✅ TABLES WRITABLE - signalFlags, entities, relationships all writable");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ TABLES BLOCKED - One or more tables not writable:", error);
    process.exit(1);
  }
}

testWriteability();
