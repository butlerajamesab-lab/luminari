import { injectForensicMetadata, queryForensicMetadata, closeForensicConnection, getForensicConnection } from "../forensic-db";

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("FORENSIC BYPASS TEST - DRIVER VERIFICATION");
  console.log("═══════════════════════════════════════════════════════════");

  try {
    // Step 1: Verify driver type
    const conn = await getForensicConnection();
    console.log("\n[TEST] Driver Constructor:", conn.constructor.name);
    console.log("[TEST] Expected: 'Connection'");
    
    // Step 2: Test direct injection
    console.log("\n[TEST] Attempting forensic metadata injection...");
    
    const testEntity = {
      caseId: 7,
      name: "TEST_ENTITY_" + Date.now(),
      type: "TEST_TYPE",
      engineVersion: "v1",
      laneId: "test-lane",
      snapshotId: 1,
    };
    
    await injectForensicMetadata('entities', testEntity);
    console.log("[TEST] ✅ Injection successful!");
    
    // Step 3: Verify the data was written
    console.log("\n[TEST] Verifying data in database...");
    
    const rows = await queryForensicMetadata(
      'SELECT COUNT(*) as count FROM entities WHERE caseId = ?',
      [7]
    );
    
    console.log("[TEST] Entities in case 7:", (rows as any)[0].count);
    
    if ((rows as any)[0].count > 0) {
      console.log("[TEST] ✅ DATA SUCCESSFULLY WRITTEN TO DATABASE!");
    } else {
      console.log("[TEST] ❌ No data found in database");
    }
    
    // Step 4: Show sample entities
    console.log("\n[TEST] Sample entities from database:");
    const samples = await queryForensicMetadata(
      'SELECT id, caseId, name, type FROM entities WHERE caseId = ? LIMIT 5',
      [7]
    );
    
    console.log(JSON.stringify(samples, null, 2));
    
  } catch (error) {
    console.error("[TEST] ❌ ERROR:", error);
  } finally {
    await closeForensicConnection();
    console.log("\n[TEST] Forensic connection closed");
    process.exit(0);
  }
}

main();
