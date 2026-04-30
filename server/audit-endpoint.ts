import { db } from "./db";
import { sql } from "drizzle-orm";

export async function runDatabaseAudit() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║           DATABASE AUDIT - INGESTION VERIFICATION           ║');
    console.log('║                    luminari_registry                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Get all tables
    const tables = await db.execute(sql`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `);

    console.log(`Total Tables: ${tables.length}\n`);
    console.log('TABLE RECORD COUNTS:\n');
    console.log('┌─────────────────────────────────────────┬──────────────┐');
    console.log('│ Table Name                              │ Record Count │');
    console.log('├─────────────────────────────────────────┼──────────────┤');

    let totalRecords = 0;

    for (const table of tables) {
      const tableName = (table as any).TABLE_NAME;
      try {
        const result = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${tableName}`));
        const count = (result[0] as any).count;
        totalRecords += count;
        
        const paddedName = tableName.padEnd(39);
        const paddedCount = count.toString().padStart(12);
        console.log(`│ ${paddedName} │ ${paddedCount} │`);
      } catch (e) {
        console.log(`│ ${tableName.padEnd(39)} │ ERROR        │`);
      }
    }

    console.log('├─────────────────────────────────────────┼──────────────┤');
    console.log(`│ TOTAL RECORDS                           │ ${totalRecords.toString().padStart(12)} │`);
    console.log('└─────────────────────────────────────────┴──────────────┘\n');

    return { success: true, totalRecords, tableCount: tables.length };
  } catch (error) {
    console.error('Database audit failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
