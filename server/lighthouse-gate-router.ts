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

async function queryRows<T = any>(sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(sql, values);
  return result.rows as T[];
}

function precisionBreakdown(rows: any[]) {
  return rows.reduce((acc: Record<string, number>, row: any) => {
    const key = row.geocode_precision || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function countBy<T extends Record<string, any>>(rows: T[], field: string) {
  return rows.reduce((acc: Record<string, number>, row: T) => {
    const key = row[field] == null ? "unknown" : String(row[field]);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function publicProofResponse(extra: Record<string, any>) {
  return {
    ok: true,
    supabaseProject: SUPABASE_PROJECT,
    queryMode: "live_read",
    queriedAt: new Date().toISOString(),
    service_role_exposed: false,
    ...extra,
  };
}

async function getVerifiedFoodBanks() {
  return queryRows(`
    select
      bridge_record_id as id,
      atlas_resource_id,
      name,
      resource_type,
      address,
      city,
      state,
      phone,
      url,
      lat,
      lon,
      source_table,
      source_id,
      extra_json,
      bridge_version,
      bridge_metadata,
      verification_status,
      bridged_at,
      created_at,
      updated_at
    from atlas_lighthouse_resource_bridge_v1
    where resource_type = 'food_bank'
      and verification_status = 'verified'
    order by name asc
  `);
}

async function getDshsBenefitsOffices(onlyMapped = false) {
  return queryRows(`
    select
      n.id,
      n.name,
      n.resource_type,
      n.description,
      n.organization_name,
      n.agency_name,
      n.address_line1,
      n.address_line2,
      n.city,
      n.county,
      n.state,
      n.postal_code,
      n.country,
      n.latitude,
      n.longitude,
      n.geocode_precision,
      n.phone,
      n.email,
      n.website_url,
      n.service_categories,
      n.eligibility_summary,
      n.normalized_payload,
      n.normalization_confidence,
      n.normalization_notes,
      n.created_at,
      n.updated_at,
      s.source_key,
      s.source_name,
      s.source_owner,
      s.domain
    from normalized_civic_resource n
    join api_source_registry s on s.id = n.source_id
    where s.source_key = 'wa_dshs_office_locator'
      and n.resource_type = 'benefits_office'
      ${onlyMapped ? "and n.latitude is not null and n.longitude is not null" : ""}
    order by n.city asc, n.name asc
  `);
}

async function getLegalBridgeRows() {
  const statutesWithBridge = await queryRows(`
    select
      b.bridge_run_id,
      b.source_project,
      b.verification_status,
      b.bridged_at,
      s.id,
      s.citation,
      s.jurisdiction,
      s.title,
      s.statute_text,
      s.metadata,
      s.created_at
    from atlas_lighthouse_legal_bridge_v1 b
    join legal_statutes s on s.id = b.lighthouse_record_id
    where b.target_table = 'legal_statutes'
      and b.verification_status = 'verified'
    order by b.bridged_at desc, s.title asc
  `);

  const caseLawWithBridge = await queryRows(`
    select
      b.bridge_run_id,
      b.source_project,
      b.verification_status,
      b.bridged_at,
      c.id,
      c.citation,
      c.jurisdiction,
      c.title,
      c.opinion_text,
      c.metadata,
      c.created_at
    from atlas_lighthouse_legal_bridge_v1 b
    join legal_case_law c on c.id = b.lighthouse_record_id
    where b.target_table = 'legal_case_law'
      and b.verification_status = 'verified'
    order by b.bridged_at desc, c.title asc
  `);

  const bridgeRows = [...statutesWithBridge, ...caseLawWithBridge];
  const latestBridge = bridgeRows
    .slice()
    .sort((a: any, b: any) => String(b.bridged_at ?? "").localeCompare(String(a.bridged_at ?? "")))[0];
  const stripBridgeFields = ({ bridge_run_id, source_project, verification_status, bridged_at, ...row }: any) => row;

  return {
    statutes: statutesWithBridge.map(stripBridgeFields),
    caseLaw: caseLawWithBridge.map(stripBridgeFields),
    bridgeRunId: latestBridge?.bridge_run_id ?? null,
    bridgedAt: latestBridge?.bridged_at ?? null,
    verificationStatus: latestBridge?.verification_status ?? null,
    sourceAtlasProject: latestBridge?.source_project ?? null,
    bridgeCount: bridgeRows.length,
  };
}

async function getDetectedSignals() {
  return queryRows(`
    select
      id,
      signal_type,
      signal_description,
      severity::text as severity,
      confidence_score,
      created_at
    from detected_signals
    order by created_at desc, signal_type asc
  `);
}

const docketSampleEntries = [
  {
    id: 1,
    slug: "inspection-preview-seattle-tenant-relocation",
    title: "Seattle Tenant Relocation Assistance Ordinance",
    jurisdiction: "Seattle, WA",
    jurisdictionLevel: "city",
    lawType: "ordinance",
    status: "under_review",
    summary: "Inspection-safe preview record for Docket Room route recovery.",
    sections: {
      summary: "Preview-only structural docket entry. Backend gate is active, but no live law ingestion has been activated.",
      actors: [],
      impacts: [],
      implementation: [],
      loopholes: [],
      comparative: [],
      sources: [],
    },
    tags: ["inspection", "preview", "docket"],
    createdAt: "2026-05-06T00:00:00.000Z",
    updatedAt: "2026-05-06T00:00:00.000Z",
  },
];

const docketRouter = router({
  list: publicProcedure
    .input(z.object({
      search: z.string().optional(),
      jurisdictionLevel: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(({ input }) => {
      const search = input?.search?.trim().toLowerCase();
      const jurisdictionLevel = input?.jurisdictionLevel?.trim().toLowerCase();
      let entries = docketSampleEntries;
      if (search) {
        entries = entries.filter(entry =>
          entry.title.toLowerCase().includes(search) ||
          entry.jurisdiction.toLowerCase().includes(search) ||
          entry.summary.toLowerCase().includes(search)
        );
      }
      if (jurisdictionLevel) {
        entries = entries.filter(entry => entry.jurisdictionLevel === jurisdictionLevel);
      }
      return entries;
    }),

  stats: publicProcedure.query(() => ({
    total: docketSampleEntries.length,
    byJurisdictionLevel: countBy(docketSampleEntries, "jurisdictionLevel"),
    byLawType: countBy(docketSampleEntries, "lawType"),
    byStatus: countBy(docketSampleEntries, "status"),
    mode: "inspection_safe_preview",
    liveIngestionActive: false,
    atlasTouched: false,
    supabaseMutated: false,
  })),

  legistarFeed: publicProcedure
    .input(z.object({
      keyword: z.string().optional(),
      top: z.number().min(1).max(25).default(6),
    }).optional())
    .query(({ input }) => ({
      matters: [],
      fetchedAt: new Date().toISOString(),
      keyword: input?.keyword ?? null,
      top: input?.top ?? 6,
      mode: "inspection_safe_preview",
      error: "Live Legistar feed is disabled in the Lighthouse Render preview gate.",
    })),

  submissions: router({
    mine: publicProcedure.query(() => []),
    create: publicProcedure
      .input(z.object({
        lawTitle: z.string(),
        jurisdiction: z.string(),
        jurisdictionLevel: z.string(),
        referenceUrl: z.string().optional(),
        fileUrl: z.string().optional(),
        fileName: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(({ input }) => ({
        ok: true,
        disabled: true,
        mode: "inspection_safe_preview",
        message: "Submission was received by the preview gate but not persisted. Production docket submissions are disabled until activation.",
        received: {
          lawTitle: input.lawTitle,
          jurisdiction: input.jurisdiction,
          jurisdictionLevel: input.jurisdictionLevel,
          hasReferenceUrl: Boolean(input.referenceUrl),
          hasFile: Boolean(input.fileUrl || input.fileName),
          hasNotes: Boolean(input.notes),
        },
      })),
  }),
});

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

  docket: docketRouter,

  benefitsResourceDirectoryProof: publicProcedure.query(async () => {
    const resources = await getVerifiedFoodBanks();
    const mapped = resources.filter((r: any) => r.lat != null && r.lon != null).length;
    const unmapped = resources.length - mapped;
    return publicProofResponse({
      source: "atlas_lighthouse_resource_bridge_v1",
      resource_type: "food_bank",
      total: resources.length,
      verifiedTotal: resources.length,
      mapped,
      unmapped,
      resources,
      bridgeVersion: resources[0]?.bridge_version ?? "atlas_lighthouse_resource_bridge_v1",
      sampleBridgedAt: resources[0]?.bridged_at ?? null,
    });
  }),

  civicMapResourceProof: publicProcedure.query(async () => {
    const resources = await getVerifiedFoodBanks();
    const mapped = resources.filter((r: any) => r.lat != null && r.lon != null).length;
    const unmapped = resources.length - mapped;
    return publicProofResponse({
      source: "atlas_lighthouse_resource_bridge_v1",
      resource_type: "food_bank",
      total: resources.length,
      mapped,
      unmapped,
      resources,
      bridgeVersion: resources[0]?.bridge_version ?? "atlas_lighthouse_resource_bridge_v1",
      sampleBridgedAt: resources[0]?.bridged_at ?? null,
    });
  }),

  benefitsDshsOfficeProof: publicProcedure.query(async () => {
    const offices = await getDshsBenefitsOffices(false);
    const mapped = offices.filter((r: any) => r.latitude != null && r.longitude != null).length;
    const unmapped = offices.length - mapped;
    return publicProofResponse({
      source: "normalized_civic_resource",
      source_key: "wa_dshs_office_locator",
      resource_type: "benefits_office",
      status: "GEOCODED_VALIDATION_LAYER",
      geocodeStatus: "GEOCODED_VALIDATION_LAYER",
      total: offices.length,
      normalizedCount: offices.length,
      mapped,
      unmapped,
      precisionBreakdown: precisionBreakdown(offices),
      offices,
    });
  }),

  civicMapDshsOfficeProof: publicProcedure.query(async () => {
    const offices = await getDshsBenefitsOffices(true);
    return publicProofResponse({
      source: "normalized_civic_resource",
      source_key: "wa_dshs_office_locator",
      resource_type: "benefits_office",
      status: "GEOCODED_VALIDATION_LAYER",
      total: offices.length,
      mapped: offices.length,
      unmapped: 0,
      precisionBreakdown: precisionBreakdown(offices),
      rows: offices,
      offices,
    });
  }),

  legalLibraryProof: publicProcedure.query(async () => {
    try {
      const { statutes, caseLaw, bridgeRunId, bridgedAt, verificationStatus, sourceAtlasProject, bridgeCount } = await getLegalBridgeRows();
      return {
        ok: true,
        hook: "legalLibraryProof",
        queryMode: "live_read",
        queriedAt: new Date().toISOString(),
        sourceAtlasProject,
        bridgeTable: "atlas_lighthouse_legal_bridge_v1",
        bridgeRunId,
        bridgedAt,
        verificationStatus,
        statuteCount: statutes.length,
        caseCount: caseLaw.length,
        bridgeCount,
        statutes,
        caseLaw,
      };
    } catch (error: any) {
      const mapped = mapPgError(error);
      console.warn(`[LighthouseGate] legalLibraryProof query returned ${mapped.status}: ${mapped.message}`);
      const fallback = await safeRestSelect("atlas_lighthouse_legal_bridge_v1", 100, 0);
      return {
        ok: false,
        hook: "legalLibraryProof",
        queryMode: "live_read",
        queriedAt: new Date().toISOString(),
        sourceAtlasProject: null,
        bridgeTable: "atlas_lighthouse_legal_bridge_v1",
        bridgeRunId: null,
        bridgedAt: null,
        verificationStatus: null,
        statuteCount: 0,
        caseCount: 0,
        bridgeCount: fallback.items.length,
        statutes: [],
        caseLaw: [],
        status: fallback.status === "ok" ? mapped.status : fallback.status,
        message: fallback.message || mapped.message,
      };
    }
  }),

  anomalyViewfinderProof: publicProcedure.query(async () => {
    try {
      const signals = await getDetectedSignals();
      return {
        ok: true,
        hook: "anomalyViewfinderProof",
        source: "detected_signals",
        queryMode: "live_read",
        queriedAt: new Date().toISOString(),
        count: signals.length,
        signalTypes: Object.keys(countBy(signals, "signal_type")),
        severityCounts: countBy(signals, "severity"),
        rows: signals,
      };
    } catch (error: any) {
      const mapped = mapPgError(error);
      console.warn(`[LighthouseGate] anomalyViewfinderProof query returned ${mapped.status}: ${mapped.message}`);
      const fallback = await safeRestSelect("detected_signals", 100, 0);
      const rows = fallback.items.map((row: any) => ({
        id: row.id,
        signal_type: row.signal_type,
        signal_description: row.signal_description,
        severity: row.severity,
        confidence_score: row.confidence_score,
        created_at: row.created_at,
      }));
      return {
        ok: fallback.status === "ok",
        hook: "anomalyViewfinderProof",
        source: "detected_signals",
        queryMode: "live_read",
        queriedAt: new Date().toISOString(),
        count: rows.length,
        signalTypes: Object.keys(countBy(rows, "signal_type")),
        severityCounts: countBy(rows, "severity"),
        rows,
        status: fallback.status === "ok" ? mapped.status : fallback.status,
        message: fallback.message || mapped.message,
      };
    }
  }),

  lighthouse: router({
    suggestions: suggestionsRouter,
    spotlight: spotlightRouter,
    jobs: jobsRouter,
    posts: postsRouter,
    events: eventsRouter,
  }),
});

export type LighthouseGateRouter = typeof lighthouseGateRouter;
