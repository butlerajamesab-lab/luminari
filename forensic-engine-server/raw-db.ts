/**
 * RAW DATABASE BYPASS MODULE
 * 
 * This module creates a DIRECT MySQL2 connection that completely bypasses Drizzle ORM.
 * Used exclusively for forensic data extraction where schema validation would interfere
 * with deterministic metadata capture.
 * 
 * CRITICAL: This is NOT for general use. Only use for extraction pipeline operations.
 */

import mysql from "mysql2/promise";

let rawConnection: mysql.Connection | null = null;

function parseDbUrl(): { host: string; port: number; user: string; password: string; database: string } {
  const dbUrl = process.env.DATABASE_URL || '';
  
  try {
    const urlObj = new URL(dbUrl);
    return {
      host: urlObj.hostname || 'localhost',
      port: parseInt(urlObj.port || '4000', 10),
      user: urlObj.username || 'root',
      password: urlObj.password || '',
      database: 'luminari_registry',
    };
  } catch (e) {
    console.error('[RawDB] Failed to parse DATABASE_URL, using fallback');
    return {
      host: 'gateway04.us-east-1.prod.aws.tidbcloud.com',
      port: 4000,
      user: '2jhK1AfHyk6mXSq.root',
      password: '2k5Lq94U8voiKlatA3uZ',
      database: 'luminari_registry',
    };
  }
}

/**
 * Get or create a raw MySQL2 connection
 * This connection is NOT wrapped by Drizzle and hits the driver directly
 */
export async function getRawConnection(): Promise<mysql.Connection> {
  if (rawConnection) {
    return rawConnection;
  }

  const config = parseDbUrl();
  console.log(`[RawDB] Creating direct MySQL2 connection to ${config.host}:${config.port}/${config.database}`);

  rawConnection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: { rejectUnauthorized: true },
  });

  console.log('[RawDB] Direct connection established');
  console.log('[RawDB] Driver type:', rawConnection.constructor.name);

  return rawConnection;
}

/**
 * Execute a raw SQL query with parameterized values
 * Bypasses Drizzle entirely
 */
export async function executeRaw(
  query: string,
  params: any[] = []
): Promise<any> {
  const conn = await getRawConnection();
  
  try {
    console.log(`[RawDB] Executing: ${query}`);
    console.log(`[RawDB] Params:`, params);
    
    const [result] = await conn.execute(query, params);
    
    console.log(`[RawDB] ✅ Success`);
    return result;
  } catch (error: any) {
    console.error(`[RawDB] ❌ Error: ${error.message}`);
    console.error(`[RawDB] Code: ${error.code}`);
    throw error;
  }
}

/**
 * Execute a raw SELECT query and return rows
 */
export async function selectRaw(
  query: string,
  params: any[] = []
): Promise<any[]> {
  const conn = await getRawConnection();
  
  try {
    console.log(`[RawDB] SELECT: ${query}`);
    
    const [rows] = await conn.execute(query, params);
    
    console.log(`[RawDB] ✅ Returned ${(rows as any[]).length} rows`);
    return rows as any[];
  } catch (error: any) {
    console.error(`[RawDB] ❌ Error: ${error.message}`);
    throw error;
  }
}

/**
 * Insert a single row
 */
export async function insertRaw(
  table: string,
  columns: string[],
  values: any[]
): Promise<any> {
  const placeholders = columns.map(() => '?').join(', ');
  const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  
  return executeRaw(query, values);
}

/**
 * Insert multiple rows
 */
export async function insertBatchRaw(
  table: string,
  columns: string[],
  rows: any[][]
): Promise<number> {
  let insertedCount = 0;
  
  for (const row of rows) {
    try {
      await insertRaw(table, columns, row);
      insertedCount++;
    } catch (error) {
      console.error(`[RawDB] Batch insert failed for row:`, row);
    }
  }
  
  return insertedCount;
}

/**
 * Update rows
 */
export async function updateRaw(
  table: string,
  updates: Record<string, any>,
  whereClause: string,
  whereParams: any[]
): Promise<any> {
  const setClauses = Object.keys(updates).map(col => `${col} = ?`).join(', ');
  const values = Object.values(updates).concat(whereParams);
  const query = `UPDATE ${table} SET ${setClauses} WHERE ${whereClause}`;
  
  return executeRaw(query, values);
}

/**
 * Close the connection
 */
export async function closeRaw(): Promise<void> {
  if (rawConnection) {
    await rawConnection.end();
    rawConnection = null;
    console.log('[RawDB] Connection closed');
  }
}
