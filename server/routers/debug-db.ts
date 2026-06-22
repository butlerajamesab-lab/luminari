import { router, publicProcedure } from "../_core/trpc";
import { create_database_pool } from "../pg-config";
import { db, getPool } from "../db";
import { sql } from "drizzle-orm";
import { legalStatutes } from "../../drizzle/schema";

export const debugDbRouter = router({
  connectionStatus: publicProcedure.query(async () => {
    const db_url = process.env.DATABASE_URL;
    const has_url = !!db_url;
    let url_host = "NOT_SET";
    let url_port = "NOT_SET";
    
    if (db_url) {
      try {
        const parsed = new URL(db_url);
        url_host = parsed.hostname;
        url_port = parsed.port || "5432";
      } catch (e: any) {
        url_host = `PARSE_ERROR: ${e.message}`;
      }
    }
    
    let can_connect = false;
    let query_result: any = null;
    let error_msg: string | null = null;
    
    if (db_url && db_url !== "postgresql://dummy") {
      try {
        const test_pool = create_database_pool({
          label: "DebugDb",
          max: 1,
          connection_timeout_millis: 5000,
        });
        const client = await test_pool.connect();
        can_connect = true;
        const res = await client.query("SELECT COUNT(*) as cnt FROM legal_statutes");
        query_result = res.rows[0];
        client.release();
        await test_pool.end();
      } catch (e: any) {
        error_msg = e.message;
      }
    } else {
      error_msg = db_url ? "DATABASE_URL is dummy placeholder" : "DATABASE_URL is not set";
    }
    
    return {
      has_url,
      url_host,
      url_port,
      can_connect,
      query_result,
      error_msg,
      node_env: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      deploy_version: "f622979-v3",
    };
  }),

  // Test Drizzle layer directly
  drizzleTest: publicProcedure.query(async () => {
    let drizzle_result: any = null;
    let drizzle_error: string | null = null;
    let pool_result: any = null;
    let pool_error: string | null = null;

    // Test 1: Drizzle ORM query
    try {
      const [row] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(legalStatutes);
      drizzle_result = row;
    } catch (e: any) {
      drizzle_error = e.message;
      if (e.cause) drizzle_error += ` | cause: ${e.cause.message}`;
    }

    // Test 2: Raw pool query via getPool()
    try {
      const client = await getPool().connect();
      const res = await client.query("SELECT COUNT(*)::int as cnt FROM legal_statutes");
      pool_result = res.rows[0];
      client.release();
    } catch (e: any) {
      pool_error = e.message;
      if (e.cause) pool_error += ` | cause: ${e.cause.message}`;
    }

    return {
      drizzle_result,
      drizzle_error,
      pool_result,
      pool_error,
      deploy_version: "f622979-v3",
      timestamp: new Date().toISOString(),
    };
  }),
});
