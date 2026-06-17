import { router, publicProcedure } from "../_core/trpc";
import { db, getPool } from "../db";
import { sql } from "drizzle-orm";
import { legalStatutes } from "../../drizzle/schema";

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
        const client = await getPool().connect();
        try {
          canConnect = true;
          const res = await client.query("SELECT COUNT(*)::int as cnt FROM public.legal_statutes");
          queryResult = res.rows[0];
        } finally {
          client.release();
        }
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

  drizzleTest: publicProcedure.query(async () => {
    let drizzleResult: any = null;
    let drizzleError: string | null = null;
    let poolResult: any = null;
    let poolError: string | null = null;

    try {
      const [row] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(legalStatutes);
      drizzleResult = row;
    } catch (e: any) {
      drizzleError = e.message;
      if (e.cause) drizzleError += ` | cause: ${e.cause.message}`;
    }

    try {
      const client = await getPool().connect();
      try {
        const res = await client.query("SELECT COUNT(*)::int as cnt FROM public.legal_statutes");
        poolResult = res.rows[0];
      } finally {
        client.release();
      }
    } catch (e: any) {
      poolError = e.message;
      if (e.cause) poolError += ` | cause: ${e.cause.message}`;
    }

    return {
      drizzleResult,
      drizzleError,
      poolResult,
      poolError,
      timestamp: new Date().toISOString(),
    };
  }),
});
