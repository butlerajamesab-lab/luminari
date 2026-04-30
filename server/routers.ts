import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { Pool } from "pg";
import type { TrpcContext } from "./_core/context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });
const router = t.router;
const publicProcedure = t.procedure;

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 60_000,
        connectionTimeoutMillis: 10_000,
      }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || "postgres",
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 60_000,
        connectionTimeoutMillis: 10_000,
      }
);

type QueryParams = Array<string | number | boolean | null | undefined>;

async function queryRows<T = Record<string, unknown>>(sql: string, params: QueryParams = []): Promise<T[]> {
  try {
    const result = await pool.query(sql, params);
    return result.rows as T[];
  } catch (error) {
    console.error("[tRPC Supabase query failed]", sql.replace(/\s+/g, " ").trim(), error);
    return [];
  }
}

async function queryOne<T = Record<string, unknown>>(sql: string, params: QueryParams = []): Promise<T | null> {
  const rows = await queryRows<T>(sql, params);
  return rows[0] ?? null;
}

const listInput = z
  .object({
    status: z.string().optional(),
    category: z.string().optional(),
    stateCode: z.string().optional(),
    jobType: z.string().optional(),
    activeOnly: z.boolean().optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  })
  .optional();

function limitOffset(input: z.infer<typeof listInput>) {
  return { limit: input?.limit ?? 50, offset: input?.offset ?? 0 };
}

export const appRouter = router({
  health: publicProcedure.query(async () => {
    const probe = await queryOne<{ database: string; user: string; project_ref: string; now: string }>(
      "select current_database() as database, current_user as user, 'wepxlinwbjrkqdzkqpar' as project_ref, now()::text as now"
    );
    return { ok: !!probe, supabaseProject: "wepxlinwbjrkqdzkqpar", database: probe };
  }),

  lighthouse: router({
    suggestions: router({
      list: publicProcedure.input(listInput).query(async ({ input }) => {
        const { limit, offset } = limitOffset(input);
        return queryRows(
          `select * from lighthouse_suggestions
           where ($1::text is null or status = $1)
           order by created_at desc nulls last
           limit $2 offset $3`,
          [input?.status ?? null, limit, offset]
        );
      }),
      myVotes: publicProcedure.query(() => []),
      create: publicProcedure.input(z.object({ content: z.string().min(3).max(2000) })).mutation(() => {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication is required to submit suggestions." });
      }),
      vote: publicProcedure.input(z.object({ suggestionId: z.number() })).mutation(() => {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication is required to vote." });
      }),
      unvote: publicProcedure.input(z.object({ suggestionId: z.number() })).mutation(() => ({ success: false })),
    }),

    spotlight: router({
      list: publicProcedure.input(z.object({ activeOnly: z.boolean().default(true) }).optional()).query(async ({ input }) => {
        return queryRows(
          `select * from lighthouse_spotlight
           where ($1::boolean = false or active = true)
           order by sort_order asc nulls last, created_at desc nulls last
           limit 50`,
          [input?.activeOnly ?? true]
        );
      }),
    }),

    jobs: router({
      list: publicProcedure.input(listInput).query(async ({ input }) => {
        const { limit, offset } = limitOffset(input);
        return queryRows(
          `select * from lighthouse_jobs
           where ($1::text is null or status = $1)
             and ($2::text is null or category = $2)
             and ($3::text is null or state_code = $3)
             and ($4::text is null or job_type = $4)
           order by created_at desc nulls last
           limit $5 offset $6`,
          [input?.status ?? "active", input?.category ?? null, input?.stateCode ?? null, input?.jobType ?? null, limit, offset]
        );
      }),
      get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => queryOne("select * from lighthouse_jobs where id = $1", [input.id])),
    }),

    posts: router({
      list: publicProcedure.input(listInput).query(async ({ input }) => {
        const { limit, offset } = limitOffset(input);
        return queryRows(
          `select * from lighthouse_posts
           where ($1::text is null or status = $1)
             and ($2::text is null or category = $2)
             and ($3::text is null or state_code = $3)
           order by created_at desc nulls last
           limit $4 offset $5`,
          [input?.status ?? "active", input?.category ?? null, input?.stateCode ?? null, limit, offset]
        );
      }),
      get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => queryOne("select * from lighthouse_posts where id = $1", [input.id])),
      create: publicProcedure.input(z.record(z.string(), z.unknown())).mutation(() => {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication is required to create posts." });
      }),
    }),

    events: router({
      list: publicProcedure.input(listInput).query(async ({ input }) => {
        const { limit, offset } = limitOffset(input);
        return queryRows(
          `select * from lighthouse_events
           where ($1::text is null or status = $1)
             and ($2::text is null or category = $2)
             and ($3::text is null or state_code = $3)
           order by start_date asc nulls last, created_at desc nulls last
           limit $4 offset $5`,
          [input?.status ?? null, input?.category ?? null, input?.stateCode ?? null, limit, offset]
        );
      }),
      get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => queryOne("select * from lighthouse_events where id = $1", [input.id])),
    }),

    registry: router({
      stateProfile: publicProcedure.input(z.object({ stateCode: z.string().min(2).max(2) })).query(async ({ input }) => {
        const stateCode = input.stateCode.toUpperCase();
        const resources = await queryRows("select * from resources where upper(state_code) = $1 order by name asc limit 250", [stateCode]);
        return { stateCode, resources, meta: { source: "Supabase", projectRef: "wepxlinwbjrkqdzkqpar" } };
      }),
    }),

    map: router({
      layers: publicProcedure
        .input(z.object({ stateCode: z.string().max(2).optional(), signalWindowDays: z.number().min(1).max(365).default(90) }).optional())
        .query(async ({ input }) => {
          const state = input?.stateCode?.toUpperCase() ?? null;
          const [resources, jobs, posts, workshops, tribalEvents, patternSignals] = await Promise.all([
            queryRows("select * from resources where ($1::text is null or upper(state_code) = $1) limit 500", [state]),
            queryRows("select * from lighthouse_jobs where ($1::text is null or upper(state_code) = $1) and status = 'active' limit 250", [state]),
            queryRows("select * from lighthouse_posts where ($1::text is null or upper(state_code) = $1) and status = 'active' limit 250", [state]),
            queryRows("select * from lighthouse_events where ($1::text is null or upper(state_code) = $1) limit 250", [state]),
            Promise.resolve([]),
            queryRows("select * from detected_signals limit 250"),
          ]);
          return { resources, jobs, posts, workshops, tribal_events: tribalEvents, pattern_signals: patternSignals, meta: { source: "Supabase", projectRef: "wepxlinwbjrkqdzkqpar" } };
        }),
      search: publicProcedure.input(z.object({ query: z.string().min(1).max(200), limit: z.number().min(1).max(100).default(25) })).query(async ({ input }) => {
        const q = `%${input.query}%`;
        const resources = await queryRows("select * from resources where name ilike $1 limit $2", [q, input.limit]);
        return { resources, jobs: [], events: [], posts: [], bounds: null, total: resources.length };
      }),
      nearby: publicProcedure.input(z.object({ lat: z.number(), lng: z.number(), radiusKm: z.number().default(50) })).query(() => ({ resources: [], jobs: [], posts: [], events: [], pattern_signals: [], meta: { total: 0 } })),
    }),

    mapIntake: router({
      initFromMap: publicProcedure.input(z.record(z.string(), z.unknown())).mutation(() => ({ sessionId: null, suggestions: [] })),
      getSession: publicProcedure.input(z.record(z.string(), z.unknown())).query(() => null),
      listSessions: publicProcedure.query(() => []),
      completeSession: publicProcedure.input(z.record(z.string(), z.unknown())).mutation(() => ({ success: true })),
      suggestPipelines: publicProcedure.input(z.record(z.string(), z.unknown())).mutation(() => []),
    }),
  }),
});

export type AppRouter = typeof appRouter;
