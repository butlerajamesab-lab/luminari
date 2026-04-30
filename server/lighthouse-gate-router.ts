import { z } from "zod";
import { Pool } from "pg";
import { router, publicProcedure } from "./_core/trpc";

const SUPABASE_PROJECT = "wepxlinwbjrkqdzkqpar";

let pool: Pool | null = null;
let warnedMissingDatabaseUrl = false;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    if (!warnedMissingDatabaseUrl) {
      console.warn("[LighthouseGate] DATABASE_URL not configured; Supabase-backed routes will return safe empty results.");
      warnedMissingDatabaseUrl = true;
    }
    pool = new Pool({ connectionString: "postgresql://invalid" });
    return pool;
  }
  pool = new Pool({ connectionString });
  pool.on("error", (err) => {
    console.error("[LighthouseGate] Unexpected PostgreSQL pool error:", err);
  });
  console.log(`[LighthouseGate] Supabase PostgreSQL pool initialized for project ${SUPABASE_PROJECT}.`);
  return pool;
}

type SafeRowsResult<T> = {
  items: T[];
  source: "supabase_postgres" | "supabase_rest";
  supabaseProject: typeof SUPABASE_PROJECT;
  table: string;
  status: "ok" | "empty" | "missing_table" | "unconfigured" | "error";
  message?: string;
};

function mapPgError(error: any): { status: SafeRowsResult<unknown>["status"]; message: string } {
  if (!process.env.DATABASE_URL) {
    return { status: "unconfigured", message: "DATABASE_URL is not configured for direct PostgreSQL access." };
  }
  if (error?.code === "42P01") {
    return { status: "missing_table", message: "Lighthouse table is not present in this Supabase project." };
  }
  return { status: "error", message: error?.message || "Supabase PostgreSQL query failed." };
}

async function safeRestSelect<T>(table: string, limit: number, offset: number): Promise<SafeRowsResult<T>> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      items: [],
      source: "supabase_rest",
      supabaseProject: SUPABASE_PROJECT,
      table,
      status: "unconfigured",
      message: "Backend Supabase REST access is not configured.",
    };
  }

  try {
    const boundedLimit = Math.max(1, Math.min(limit || 50, 100));
    const boundedOffset = Math.max(0, offset || 0);
    const url = new URL(`/rest/v1/${table}`, supabaseUrl);
    url.searchParams.set("select", "*");
    url.searchParams.set("limit", String(boundedLimit));
    url.searchParams.set("offset", String(boundedOffset));
    url.searchParams.set("order", "id.desc");

    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : [];

    if (!response.ok) {
      const message = Array.isArray(parsed) ? response.statusText : parsed?.message || response.statusText;
      const status = response.status === 404 || String(message).toLowerCase().includes("could not find") ? "missing_table" : "error";
      return {
        items: [],
        source: "supabase_rest",
        supabaseProject: SUPABASE_PROJECT,
        table,
        status,
        message: status === "missing_table" ? "Lighthouse table is not present in this Supabase project." : message,
      };
    }

    const rows = Array.isArray(parsed) ? parsed : [];
    return {
      items: rows as T[],
      source: "supabase_rest",
      supabaseProject: SUPABASE_PROJECT,
      table,
      status: rows.length > 0 ? "ok" : "empty",
    };
  } catch (error: any) {
    return {
      items: [],
      source: "supabase_rest",
      supabaseProject: SUPABASE_PROJECT,
      table,
      status: "error",
      message: error?.message || "Supabase REST query failed.",
    };
  }
}

async function safeSelect<T>(table: string, limit: number, offset: number, whereSql = "", values: unknown[] = []): Promise<SafeRowsResult<T>> {
  try {
    const boundedLimit = Math.max(1, Math.min(limit || 50, 100));
    const boundedOffset = Math.max(0, offset || 0);
    const sql = `select * from ${table} ${whereSql} order by id desc limit $${values.length + 1} offset $${values.length + 2}`;
    const result = await getPool().query(sql, [...values, boundedLimit, boundedOffset]);
    return {
      items: result.rows as T[],
      source: "supabase_postgres",
      supabaseProject: SUPABASE_PROJECT,
      table,
      status: result.rows.length > 0 ? "ok" : "empty",
    };
  } catch (error: any) {
    const mapped = mapPgError(error);
    console.warn(`[LighthouseGate] ${table} PostgreSQL query returned ${mapped.status}: ${mapped.message}`);
    const fallback = await safeRestSelect<T>(table, limit, offset);
    if (fallback.status === "ok" || fallback.status === "empty" || fallback.status === "missing_table") {
      if (mapped.status !== "missing_table") {
        fallback.message = fallback.message || `Direct PostgreSQL query was unavailable; verified through backend-only Supabase REST fallback.`;
      }
      return fallback;
    }
    return {
      items: [],
      source: "supabase_postgres",
      supabaseProject: SUPABASE_PROJECT,
      table,
      status: mapped.status,
      message: mapped.message,
    };
  }
}

const suggestionsRouter = router({
  list: publicProcedure
    .input(z.object({
      status: z.enum(["pending", "reviewed", "accepted", "implemented", "declined"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(({ input }) => {
      const values: unknown[] = [];
      let where = "";
      if (input?.status) {
        values.push(input.status);
        where = "where status = $1";
      }
      return safeSelect("lighthouse_suggestions", input?.limit ?? 50, input?.offset ?? 0, where, values);
    }),
});

const spotlightRouter = router({
  list: publicProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(({ input }) => {
      if (input?.activeOnly ?? true) {
        return safeSelect("lighthouse_spotlight", 50, 0, "where active = $1", [true]);
      }
      return safeSelect("lighthouse_spotlight", 50, 0);
    }),
});

const jobsRouter = router({
  list: publicProcedure
    .input(z.object({
      status: z.enum(["active", "filled", "expired", "draft"]).optional(),
      category: z.enum(["trades", "healthcare", "social_services", "legal", "education", "technology", "general"]).optional(),
      stateCode: z.string().max(2).optional(),
      jobType: z.enum(["full_time", "part_time", "apprenticeship", "internship", "training_program", "volunteer"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(({ input }) => {
      const clauses: string[] = [];
      const values: unknown[] = [];
      const addClause = (column: string, value: unknown) => {
        values.push(value);
        clauses.push(`${column} = $${values.length}`);
      };
      addClause("status", input?.status ?? "active");
      if (input?.category) addClause("category", input.category);
      if (input?.stateCode) addClause("state_code", input.stateCode.toUpperCase());
      if (input?.jobType) addClause("job_type", input.jobType);
      const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
      return safeSelect("lighthouse_jobs", input?.limit ?? 50, input?.offset ?? 0, where, values);
    }),
});

const postsRouter = router({
  list: publicProcedure
    .input(z.object({
      category: z.enum(["ask_help", "offer_help", "skill_share", "resource_share", "general"]).optional(),
      stateCode: z.string().max(2).optional(),
      status: z.enum(["active", "resolved", "expired", "flagged", "removed"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(({ input }) => {
      const clauses: string[] = [];
      const values: unknown[] = [];
      const addClause = (column: string, value: unknown) => {
        values.push(value);
        clauses.push(`${column} = $${values.length}`);
      };
      addClause("status", input?.status ?? "active");
      if (input?.category) addClause("category", input.category);
      if (input?.stateCode) addClause("state_code", input.stateCode.toUpperCase());
      const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
      return safeSelect("lighthouse_posts", input?.limit ?? 50, input?.offset ?? 0, where, values);
    }),
});

const eventsRouter = router({
  list: publicProcedure
    .input(z.object({
      status: z.enum(["upcoming", "active", "completed", "cancelled"]).optional(),
      stateCode: z.string().max(2).optional(),
      eventType: z.enum(["workshop", "training", "community_meeting", "legal_clinic", "resource_fair", "tribal_gathering", "other"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(({ input }) => {
      const clauses: string[] = [];
      const values: unknown[] = [];
      const addClause = (column: string, value: unknown) => {
        values.push(value);
        clauses.push(`${column} = $${values.length}`);
      };
      if (input?.status) addClause("status", input.status);
      if (input?.stateCode) addClause("state_code", input.stateCode.toUpperCase());
      if (input?.eventType) addClause("event_type", input.eventType);
      const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
      return safeSelect("lighthouse_events", input?.limit ?? 50, input?.offset ?? 0, where, values);
    }),
});

export const lighthouseGateRouter = router({
  health: publicProcedure.query(() => ({
    ok: true,
    supabaseProject: SUPABASE_PROJECT,
  })),
  lighthouse: router({
    suggestions: suggestionsRouter,
    spotlight: spotlightRouter,
    jobs: jobsRouter,
    posts: postsRouter,
    events: eventsRouter,
  }),
});

export type LighthouseGateRouter = typeof lighthouseGateRouter;
