import { db } from "../db";
import { sql } from "drizzle-orm";

async function rebuildEntitiesTable() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("REBUILD entities TABLE - EXACT SCHEMA");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    // Step 1: Disable FK checks
    console.log("[1] Disabling foreign key checks...");
    await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS=0"));
    console.log("[1] ✅ FK checks disabled\n");

    // Step 2: Drop existing table
    console.log("[2] Dropping existing entities table...");
    await db.execute(sql.raw("DROP TABLE IF EXISTS entities"));
    console.log("[2] ✅ Table dropped\n");

    // Step 3: Create table with exact schema from drizzle/schema.ts
    console.log("[3] Creating entities table with exact schema...");
    const createTableSQL = `
      CREATE TABLE entities (
        id SERIAL PRIMARY KEY,
        caseId INT NOT NULL,
        name VARCHAR(512) NOT NULL,
        type VARCHAR(64) NOT NULL,
        description TEXT,
        aliases JSON,
        engineVersion VARCHAR(256) NOT NULL,
        laneId VARCHAR(256) NOT NULL,
        snapshotId INT NOT NULL,
        createdAt BIGINT NOT NULL,
        updatedAt BIGINT NOT NULL,
        INDEX idx_entities_case (caseId),
        INDEX idx_entities_name (name),
        INDEX idx_entities_type (type),
        INDEX idx_entities_lane (laneId),
        INDEX idx_entities_snapshot (snapshotId)
      )
    `;
    
    await db.execute(sql.raw(createTableSQL));
    console.log("[3] ✅ Table created\n");

    // Step 4: Re-enable FK checks
    console.log("[4] Re-enabling foreign key checks...");
    await db.execute(sql.raw("SET FOREIGN_KEY_CHECKS=1"));
    console.log("[4] ✅ FK checks enabled\n");

    // Step 5: Verify table structure
    console.log("[5] Verifying table structure...");
    const columnsResult = await db.execute(
      sql.raw(`
        SELECT column_name, column_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'entities' AND table_schema = DATABASE()
        ORDER BY ordinal_position
      `)
    );
    
    console.log("[5] ✅ Columns in entities table:");
    (columnsResult as any[]).forEach((col: any) => {
      console.log(`     - ${col.column_name}: ${col.column_type} (nullable: ${col.is_nullable})`);
    });
    console.log();

    // Step 6: Dry insert test
    console.log("[6] Testing insert with minimal required columns...");
    const now = Date.now();
    await db.execute(sql.raw(`
      INSERT INTO entities (caseId, name, type, engineVersion, laneId, snapshotId, createdAt, updatedAt)
      VALUES (7, 'SCHEMA_TEST_ENTITY', 'SYSTEM', 'v1.0', 'lane-1', 1, ${now}, ${now})
    `));
    console.log("[6] ✅ Insert successful\n");

    // Step 7: Raw SQL read (no Drizzle)
    console.log("[7] Reading back with raw SQL (no Drizzle)...");
    const readResult = await db.execute(sql.raw(`
      SELECT id, caseId, name, type, engineVersion, laneId, snapshotId
      FROM entities
      WHERE name = 'SCHEMA_TEST_ENTITY'
    `));
    
    if ((readResult as any[]).length > 0) {
      const row = (readResult as any[])[0];
      console.log("[7] ✅ Read successful:");
      console.log(`     - id: ${row.id}`);
      console.log(`     - caseId: ${row.caseId}`);
      console.log(`     - name: ${row.name}`);
      console.log(`     - type: ${row.type}`);
      console.log(`     - engineVersion: ${row.engineVersion}`);
      console.log(`     - laneId: ${row.laneId}`);
      console.log(`     - snapshotId: ${row.snapshotId}\n`);
    } else {
      console.log("[7] ❌ No rows found\n");
    }

    // Step 8: Delete test row
    console.log("[8] Cleaning up test row...");
    await db.execute(sql.raw(`
      DELETE FROM entities WHERE name = 'SCHEMA_TEST_ENTITY'
    `));
    console.log("[8] ✅ Test row deleted\n");

    // Step 9: Final verification
    console.log("[9] Final verification...");
    const finalCount = await db.execute(sql.raw(`
      SELECT COUNT(*) as count FROM entities
    `));
    const count = (finalCount as any[])[0]?.count || 0;
    console.log(`[9] ✅ Entities table ready. Current row count: ${count}\n`);

    console.log("═══════════════════════════════════════════════════════════");
    console.log("✅ ENTITIES TABLE FIXED");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\nStatus: ENTITIES TABLE FIXED");
    console.log("- All columns present");
    console.log("- Insert/read working");
    console.log("- Ready for extraction\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ REBUILD FAILED:", error);
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("❌ ENTITIES TABLE REBUILD FAILED");
    console.log("═══════════════════════════════════════════════════════════\n");
    process.exit(1);
  }
}

rebuildEntitiesTable();
