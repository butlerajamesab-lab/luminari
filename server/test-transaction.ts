import { getPool } from "./db";

async function testTransaction() {
  const client = await getPool().connect();
  try {
    console.log("[Transaction] Connection acquired");

    console.log("[Transaction] Beginning transaction");
    await client.query('BEGIN');

    console.log("[Transaction] Executing INSERT");
    const insertResult = await client.query(
      `INSERT INTO signals (case_id, evidence_id, signal_type, description, created_at) 
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
      [90007, 1, 'engine_test', 'test write']
    );
    console.log("[Transaction] INSERT RESULT:", insertResult.rows);

    console.log("[Transaction] Executing immediate SELECT");
    const { rows } = await client.query(
      "SELECT * FROM signals WHERE case_id = 90007"
    );
    console.log("[Transaction] IMMEDIATE READ:", rows);
    console.log(`[Transaction] Found ${rows.length} rows`);

    if (rows.length > 0) {
      console.log("✅ SUCCESS");
      rows.forEach((r: any) => {
        console.log(`   - ID ${r.id}: ${r.signal_type}`);
      });
    } else {
      console.log("B) FAILURE: No rows in immediate read");
      process.exit(1);
    }

    console.log("[Transaction] Committing");
    await client.query('COMMIT');
    console.log("[Transaction] Committed");

    process.exit(0);
  } catch (err) {
    console.log(`B) FAILURE: ${(err as any).message}`);
    console.error(err);
    try {
      await client.query('ROLLBACK');
    } catch (e) {
      console.error("Rollback error:", e);
    }
    process.exit(1);
  } finally {
    client.release();
    console.log("[Transaction] Connection released");
  }
}

testTransaction();
