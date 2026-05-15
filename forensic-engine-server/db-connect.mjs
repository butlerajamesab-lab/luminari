/**
 * Shared Database Connection Helper
 * 
 * USE THIS in all standalone scripts (.mjs) instead of process.env.DATABASE_URL directly.
 * Forces connection to luminari_registry regardless of what DATABASE_URL says.
 * 
 * Usage:
 *   import { getConnection, getPool } from './db-connect.mjs';
 *   const conn = await getConnection();
 *   const pool = await getPool();
 */

import mysql from 'mysql2/promise';

const CANONICAL_DATABASE = 'luminari_registry';

function parseCredentials() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  const url = new URL(dbUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port || '4000', 10),
    user: url.username,
    password: decodeURIComponent(url.password),
    database: CANONICAL_DATABASE, // ALWAYS luminari_registry
    ssl: { rejectUnauthorized: true },
  };
}

export async function getConnection() {
  const config = parseCredentials();
  const conn = await mysql.createConnection(config);
  
  // Runtime guard
  const [rows] = await conn.execute('SELECT DATABASE() as db');
  const currentDb = rows[0]?.db;
  if (currentDb !== CANONICAL_DATABASE) {
    await conn.end();
    throw new Error(`FATAL: Connected to "${currentDb}" instead of "${CANONICAL_DATABASE}"`);
  }
  
  return conn;
}

export async function getPool(connectionLimit = 5) {
  const config = parseCredentials();
  return mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0,
  });
}

export { CANONICAL_DATABASE };
