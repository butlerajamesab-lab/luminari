/**
 * R6c Migration — Supervised Relationship Type Decomposition
 *
 * One-time migration that reclassifies all "supervised" and "supervises"
 * relationship rows into 5 granular types using deterministic rules
 * from the R6c validator.
 *
 * Already executed on production (183 rows, 2026-02-18).
 * Kept in repo for future environment bootstrapping.
 *
 * Usage:
 *   npx tsx server/r6c-migration.ts              # live run
 *   npx tsx server/r6c-migration.ts --dry-run     # preview only
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, or, sql } from "drizzle-orm";
import { relationships } from "../drizzle/schema";
import { reclassifySupervised } from "./relationship-type-validator";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const connection = await mysql.createConnection({
      host: "gateway04.us-east-1.prod.aws.tidbcloud.com",
      port: 4000,
      user: "2jhK1AfHyk6mXSq.root",
      password: "2k5Lq94U8voiLkatA3uZ",
      database: "luminari_registry",
      ssl: {
        rejectUnauthorized: true,
      },
    });
  const db = drizzle(connection);

  console.log(`[R6c Migration] Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  // Find all supervised/supervises rows
  const rows = await db
    .select({
      id: relationships.id,
      relationshipType: relationships.relationshipType,
    })
    .from(relationships)
    .where(
      or(
        eq(relationships.relationshipType, "supervised"),
        eq(relationships.relationshipType, "supervises")
      )
    );

  console.log(`[R6c Migration] Found ${rows.length} supervised/supervises rows`);

  if (rows.length === 0) {
    console.log("[R6c Migration] Nothing to migrate. Already clean.");
    await connection.end();
    return;
  }

  // For each row, fetch its backing quote via relationship_evidence → quotes
  const distribution: Record<string, number> = {};
  let updated = 0;

  for (const row of rows) {
    // Get the first backing quote for this relationship
    const [quoteRows] = await connection.execute(
      `SELECT q.text FROM relationship_evidence re
       JOIN quotes q ON q.id = re.quoteId
       WHERE re.relationshipId = ?
       LIMIT 1`,
      [row.id]
    ) as any;

    const quoteText = quoteRows?.[0]?.text || "";
    const newType = reclassifySupervised(quoteText);

    distribution[newType] = (distribution[newType] || 0) + 1;

    if (!DRY_RUN) {
      await db
        .update(relationships)
        .set({ relationshipType: newType })
        .where(eq(relationships.id, row.id));
      updated++;
    }
  }

  console.log(`[R6c Migration] Distribution:`);
  for (const [type, count] of Object.entries(distribution).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  if (DRY_RUN) {
    console.log(`[R6c Migration] DRY RUN complete. ${rows.length} rows would be updated.`);
  } else {
    console.log(`[R6c Migration] LIVE migration complete. ${updated} rows updated.`);
  }

  await connection.end();
}

main().catch((err) => {
  console.error("[R6c Migration] Fatal error:", err);
  process.exit(1);
});
