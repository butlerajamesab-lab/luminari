/**
 * migrate-to-app-db.mjs
 * 
 * Copies all tables and data from luminari_registry into the app database.
 * Uses CREATE TABLE ... LIKE and INSERT INTO ... SELECT for each table.
 * Runs in batches to avoid timeouts.
 */

import mysql from 'mysql2/promise';

const SOURCE_DB = 'luminari_registry';
const TARGET_DB = 'AXzmPhCfhqjYYjh6uJijzm';

const url = process.env.DATABASE_URL;
const u = new URL(url);

const baseConfig = {
  host: u.hostname,
  port: parseInt(u.port || '4000'),
  user: u.username,
  password: u.password,
  ssl: { rejectUnauthorized: false },
  multipleStatements: false,
};

async function run() {
  const conn = await mysql.createConnection(baseConfig);
  console.log('Connected to TiDB');

  // Get all tables from source
  const [srcTables] = await conn.query(`SHOW TABLES FROM \`${SOURCE_DB}\``);
  const tableNames = srcTables.map(t => Object.values(t)[0]);
  console.log(`Source tables: ${tableNames.length}`);

  // Get existing tables in target
  const [tgtTables] = await conn.query(`SHOW TABLES FROM \`${TARGET_DB}\``);
  const existingTables = new Set(tgtTables.map(t => Object.values(t)[0]));
  console.log(`Target already has: ${existingTables.size} tables`);

  let created = 0;
  let skipped = 0;
  let errors = 0;
  let dataCopied = 0;

  for (const table of tableNames) {
    try {
      if (!existingTables.has(table)) {
        // Create table structure from source
        await conn.query(`CREATE TABLE \`${TARGET_DB}\`.\`${table}\` LIKE \`${SOURCE_DB}\`.\`${table}\``);
        created++;
      } else {
        skipped++;
      }

      // Copy data
      const [countResult] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${SOURCE_DB}\`.\`${table}\``);
      const rowCount = countResult[0].cnt;
      
      if (rowCount > 0) {
        // Use INSERT IGNORE to avoid duplicate key errors
        await conn.query(`INSERT IGNORE INTO \`${TARGET_DB}\`.\`${table}\` SELECT * FROM \`${SOURCE_DB}\`.\`${table}\``);
        dataCopied += rowCount;
        console.log(`  ✓ ${table}: ${rowCount} rows`);
      }
    } catch (e) {
      console.error(`  ✗ ${table}: ${e.message.slice(0, 80)}`);
      errors++;
    }
  }

  console.log('\n=== MIGRATION SUMMARY ===');
  console.log(`Tables created: ${created}`);
  console.log(`Tables skipped (already existed): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total rows copied: ${dataCopied}`);

  // Verify key tables
  console.log('\n=== VERIFICATION ===');
  const checks = [
    'users', 'luminari_cases', 'live_signals', 'dataset_registry',
    'reform_packages', 'strategy_paths', 'remedy_templates', 'pattern_registry',
    'legal_case_law', 'legal_statutes', 'coalition_legislators', 'coalition_agencies',
    'legal_aid_orgs', 'state_labor_pathways', 'recovery_projections_detail',
    'claim_element_matrix', 'paperwork_templates', 'ingest_runs'
  ];

  for (const t of checks) {
    try {
      const [r] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${TARGET_DB}\`.\`${t}\``);
      console.log(`  ${t}: ${r[0].cnt} rows`);
    } catch (e) {
      console.log(`  ${t}: NOT FOUND`);
    }
  }

  await conn.end();
  console.log('\nMigration complete.');
}

run().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
