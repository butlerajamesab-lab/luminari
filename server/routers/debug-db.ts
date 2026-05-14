import { router, publicProcedure } from "../_core/trpc";
import { createDatabasePool } from "../pg-config";

export const debugDbRouter = router({
  connectionStatus: publicProcedure.query(async () => {
    const dbUrl = process.env.DATABASE_URL;
    const hasUrl = !!dbUrl;
    let urlHost = "NOT_SET";
    let urlPort = "NOT_SET";
    
    if (dbUrl) {
      try {
        const parsed = new URL(dbUrl);
        urlHost = parsed.hostname;
        urlPort = parsed.port || "5432";
      } catch (e: any) {
        urlHost = `PARSE_ERROR: ${e.message}`;
      }
    }
    
    let canConnect = false;
    let queryResult: any = null;
    let errorMsg: string | null = null;
    
    if (dbUrl && dbUrl !== "postgresql://dummy") {
      try {
        const testPool = createDatabasePool({
          label: "DebugDb",
          max: 1,
          connectionTimeoutMillis: 5000,
        });
        const client = await testPool.connect();
        canConnect = true;
        const res = await client.query("SELECT COUNT(*) as cnt FROM legal_statutes");
        queryResult = res.rows[0];
        client.release();
        await testPool.end();
      } catch (e: any) {
        errorMsg = e.message;
      }
    } else {
      errorMsg = dbUrl ? "DATABASE_URL is dummy placeholder" : "DATABASE_URL is not set";
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
