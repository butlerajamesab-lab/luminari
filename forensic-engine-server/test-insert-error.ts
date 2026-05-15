import { getLuminariDb } from "./luminari-db";
import { sql } from "drizzle-orm";

async function test() {
  try {
    const db = await getLuminariDb();
    console.log("Attempting INSERT...");
    
    const result = await db.execute(sql`
      INSERT INTO jurisdictions (name, code, region, created_at, updated_at)
      VALUES ('Washington', 'WA', 'Pacific Northwest', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `);
    
    console.log("Success:", result);
  } catch (err: any) {
    console.log("=== FULL ERROR OBJECT ===");
    console.log("Error Code:", err.code);
    console.log("Error Message:", err.message);
    console.log("Error Detail:", err.detail);
    console.log("Error Constraint:", err.constraint);
    console.log("Error Table:", err.table);
    console.log("Error Column:", err.column);
    console.log("Full Stack:", err.stack);
    console.log("=== RAW ERROR ===");
    console.log(JSON.stringify(err, null, 2));
  }
}

test();
