/**
 * Check which database has the relationships
 */

import mysql from 'mysql2/promise';

async function checkBothDatabases() {
  // Check Manus project database
  const manus = await mysql.createConnection({
    host: 'gateway04.us-east-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '2jhK1AfHyk6mXSq.root',
    password: '2k5Lq94U8voiLkatA3uZ',
    database: 'AXzmPhCfhqjYYjh6uJijzm',
    ssl: { rejectUnauthorized: true } as any,
  });

  // Check luminari_registry
  const luminari = await mysql.createConnection({
    host: 'gateway04.us-east-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '2jhK1AfHyk6mXSq.root',
    password: '2k5Lq94U8voiLkatA3uZ',
    database: 'luminari_registry',
    ssl: { rejectUnauthorized: true } as any,
  });

  try {
    // Check Manus DB
    const [manus_rels] = await manus.execute('SELECT COUNT(*) as count FROM relationships WHERE caseId = 7');
    const manus_count = (manus_rels as any[])[0]?.count ?? 0;
    console.log(`[MANUS DB] relationships in case 7: ${manus_count}`);

    // Check luminari_registry
    const [luminari_rels] = await luminari.execute('SELECT COUNT(*) as count FROM relationships WHERE caseId = 7');
    const luminari_count = (luminari_rels as any[])[0]?.count ?? 0;
    console.log(`[LUMINARI] relationships in case 7: ${luminari_count}`);

  } finally {
    await manus.end();
    await luminari.end();
  }
}

checkBothDatabases();
