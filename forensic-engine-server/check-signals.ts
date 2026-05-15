/**
 * Check live_signals row count in luminari_registry
 */

import mysql from 'mysql2/promise';

async function checkSignals(): Promise<void> {
  const connection = await mysql.createConnection({
    host: 'gateway04.us-east-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '2jhK1AfHyk6mXSq.root',
    password: '2k5Lq94U8voiLkatA3uZ',
    database: 'luminari_registry',
    ssl: { rejectUnauthorized: true } as any,
  });

  try {
    const [result] = await connection.execute(
      'SELECT COUNT(*) as count FROM live_signals'
    );
    
    const count = (result as any[])[0]?.count ?? 0;
    console.log(`\n[CHECK] live_signals row count: ${count}\n`);
    
  } catch (error: any) {
    console.error('[CHECK] Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkSignals();
