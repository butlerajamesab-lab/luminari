import { router, publicProcedure } from "../_core/trpc";
import { sql } from "drizzle-orm";
import { getDb, getPool } from "../db";

export const debugDbRouter = router({
  connectionStatus: publicProcedure.query(async () => {
    const dbUrl = process.env.DATABASE_URL;
    const hasUrl = !!dbUrl;
    const urlHost = dbUrl ? new URL(dbUrl).hostname : "NOT_SET";
    const urlPort = dbUrl ? new URL(dbUrl).port : "NOT_SET";
    
    let canConnect = false;
    let queryResult: any = null;
    let errorMsg: string | null = null;
    
    try {
      const pool = getPool();
      const client = await Promise.race([
        pool.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout after 5s")), 5000))
      ]) as any;
      canConnect = true;
      const res = await client.query("SELECT COUNT(*) as cnt FROM legal_statutes");
      queryResult = res.rows[0];
      client.release();
    } catch (e: any) {
      errorMsg = e.message;
    }
    
    return {
      hasUrl,
      urlHost,
      urlPort,
      canConnect,
      queryResult,
      errorMsg,
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    };
  }),
});
