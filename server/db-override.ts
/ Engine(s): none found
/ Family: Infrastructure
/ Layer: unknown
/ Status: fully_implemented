/**
 * Database Override Connection
 * 
 * TEMPORARY: Direct connection to luminari_registry
 * Bypasses broken DATABASE_URL environment variable
 * 
 * This is recovery-only. After DATABASE_URL is fixed in platform,
 * remove this file and revert to standard db.ts connection.
 */

import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";

// Direct connection to correct database
const pool = mysql.createPool({
  host: "gateway04.us-east-1.prod.aws.tidbcloud.com",
  port: 4000,
  user: "2jhK1AfHyk6mXSq.root",
  password: "2k5Lq94U8voiLkatA3uZ",
  database: "luminari_registry",
  ssl: {
    rejectUnauthorized: true,
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export const dbOverride = drizzle(pool);

// Test connection immediately
export async function testConnection() {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query("SELECT COUNT(*) as count FROM agencies_registry");
    connection.release();
    console.log("[DB Override] Connection successful. Agencies count:", rows[0]?.count);
    return true;
  } catch (error) {
    console.error("[DB Override] Connection failed:", error);
    return false;
  }
}
