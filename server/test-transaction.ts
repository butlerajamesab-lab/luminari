import { pool } from "./db";

async function testTransaction() {
  let conn: any;
  try {
    console.log("[Transaction] Getting connection from pool");
    conn = await pool.getConnection();
    console.log("[Transaction] Connection acquired");

    console.log("[Transaction] Beginning transaction");
    await conn.beginTransaction();

    console.log("[Transaction] Executing INSERT");
    const insertResult = await conn.query(
      `INSERT INTO signals (case_id, evidence_id, signal_type, description, created_at) 
       VALUES (?, ?, ?, ?, NOW())`,
      [90007, 1, 'engine_test', 'test write']
    );
    console.log("[Transaction] INSERT RESULT:", insertResult);

    console.log("[Transaction] Executing immediate SELECT");
    const [rows] = await conn.query(
      "SELECT * FROM signals WHERE case_id = 90007"
    );
    console.log("[Transaction] IMMEDIATE READ:", rows);
    console.log(`[Transaction] Found ${(rows as any[]).length} rows`);

    if ((rows as any[]).length > 0) {
      console.log("✅ SUCCESS");
      (rows as any[]).forEach((r: any) => {
        console.log(`   - ID ${r.id}: ${r.signal_type}`);
      });
    } else {
      console.log("B) FAILURE: No rows in immediate read");
      process.exit(1);
    }

    console.log("[Transaction] Committing");
    await conn.commit();
    console.log("[Transaction] Committed");

    process.exit(0);
  } catch (err) {
    console.log(`B) FAILURE: ${(err as any).message}`);
    console.error(err);
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {
        console.error("Rollback error:", e);
      }
    }
    process.exit(1);
  } finally {
    if (conn) {
      conn.release();
      console.log("[Transaction] Connection released");
    }
  }
}

testTransaction();
