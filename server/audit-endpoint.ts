import { db } from "./db";
import { sql } from "drizzle-orm";

export async function runDatabaseAudit() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║           DATABASE AUDIT - INGESTION VERIFICATION           ║');
    console.log('║                    luminari_registry                         ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Get all tables (Postgres)
    const tablesResult = await db.execute(sql`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const tables = ((tablesResult[0] as unknown as any[]) || []).map(
      (r: any) => Object.values(r)[0] as string
    );

    console.log(`Total Tables: ${tables.length}\n`);
    console.log('TABLE RECORD COUNTS:\n');
    console.log('┌─────────────────────────────────────────┬──────────────┐');
    console.log('│ Table Name                              │ Record Count │');
    console.log('├─────────────────────────────────────────┼──────────────┤');

    let totalRecords = 0;

    for (const tableName of tables) {
      try {
        const result = await db.execute(
          sql.raw(`SELECT COUNT(*) as count FROM "${tableName.replace(/"/g, '""')}"`)
        );
        const count = Number((result[0] as unknown as any[])[0]?.count) || 0;
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
