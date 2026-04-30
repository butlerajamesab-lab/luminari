/**
 * Raw SQL Database Connection
 * 
 * Direct MySQL connection bypassing Drizzle ORM
 * Used for pathway activation and data verification
 */

import mysql from "mysql2/promise";

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

export async function queryRaw(sql: string, params: any[] = []) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } finally {
    conn.release();
  }
}

export default {
  query: queryRaw,
};
