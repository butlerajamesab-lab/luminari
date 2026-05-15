import { Pool } from 'pg';

// Override DATABASE_URL to use IP address instead of hostname
// This bypasses DNS resolution failures and points directly to luminari_registry
const databaseUrl = process.env.DATABASE_URL || '';
const ipBasedUrl = databaseUrl.replace(
  'gateway04.us-east-1.prod.aws.tidbcloud.com',
  '166.117.13.165'
).replace(
  '/AXzmPhCfhqjYYjh6uJijzm',
  '/luminari_registry'
);

console.log('[DB-POOL] Original URL:', databaseUrl.substring(0, 50) + '...');
console.log('[DB-POOL] IP-Based URL:', ipBasedUrl.substring(0, 50) + '...');

export const pool = new Pool({
  connectionString: ipBasedUrl,
});

pool.on('error', (err) => {
  console.error('[DB-POOL] Unexpected error on idle client', err);
});

pool.on('connect', () => {
  console.log('[DB-POOL] New client connected to luminari_registry');
});

pool.on('remove', () => {
  console.log('[DB-POOL] Client removed from pool');
});
