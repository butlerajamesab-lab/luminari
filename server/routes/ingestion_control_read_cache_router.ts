import { Router } from "express";
import {
  allowed_target_hints,
  get_registry_entity_candidates_summary,
  list_corpus_import_queue,
  list_registry_entity_candidates,
} from "../engines/ingestion_control";
import { classify_db_error } from "../db";
import { inferRuntimeCounts, withRuntimeEnvelope } from "../../shared/runtime-envelope";

const INGESTION_CONTROL_SOURCE = "ingestion-control.read-cache";
const CACHE_TTL_MS = 15_000;
const ERROR_STALE_TTL_MS = 120_000;

export const ingestion_control_read_cache_router = Router();

type CacheEntry = {
  expires_at: number;
  stale_until: number;
  payload: any;
};

const cache = new Map<string, CacheEntry>();
const in_flight = new Map<string, Promise<any>>();

function runtime_response<T extends Record<string, any>>(
  payload: T,
  options: {
    action?: string;
    data?: unknown;
    availability?: "available" | "partial" | "empty" | "unavailable";
    counts?: Record<string, number>;
    meta?: Record<string, unknown>;
  } = {},
) {
  return withRuntimeEnvelope(payload, {
    source: INGESTION_CONTROL_SOURCE,
    action: options.action,
    data: options.data ?? payload,
    availability: options.availability,
    counts: options.counts,
    meta: options.meta,
  });
}

function runtime_error(
  error: string,
  message: string | undefined,
  options: { diagnostic_code?: string; backend?: unknown; extra?: Record<string, unknown> } = {},
) {
  return withRuntimeEnvelope(
    {
      success: false,
      error,
      ...(message ? { message } : {}),
      ...(options.diagnostic_code ? { diagnostic_code: options.diagnostic_code } : {}),
      ...(options.extra ?? {}),
    },
    {
      source: INGESTION_CONTROL_SOURCE,
      data: options.extra ?? null,
      availability: "unavailable",
      errors: [{ code: error, message }],
      backend: options.backend,
    },
  );
}

function clamp_integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : fallback;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function cached_key(name: string, params: Record<string, unknown>) {
  return `${name}:${JSON.stringify(params)}`;
}

async function read_through_cache<T>(key: string, loader: () => Promise<T>): Promise<{ payload: T; cache_status: "hit" | "miss" | "coalesced" | "stale" }> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires_at > now) return { payload: cached.payload, cache_status: "hit" };

  const existing = in_flight.get(key);
  if (existing) return { payload: await existing, cache_status: "coalesced" };

  const promise = loader();
  in_flight.set(key, promise);
  try {
    const payload = await promise;
    cache.set(key, { payload, expires_at: now + CACHE_TTL_MS, stale_until: now + ERROR_STALE_TTL_MS });
    return { payload, cache_status: "miss" };
  } catch (error) {
    if (cached && cached.stale_until > now) return { payload: cached.payload, cache_status: "stale" };
    throw error;
  } finally {
    in_flight.delete(key);
  }
}

ingestion_control_read_cache_router.get("/registry-entity-candidates", async (req, res) => {
  const limit = clamp_integer(req.query.limit, 25, 1, 100);
  const key = cached_key("registry-entity-candidates", { limit });
  try {
    const { payload: result, cache_status } = await read_through_cache(key, () => list_registry_entity_candidates({ limit }));
    return res.json(runtime_response(result, {
      data: result,
      counts: inferRuntimeCounts(result as any, ["total_candidate_count", "processed_count", "candidate_count", "inserted_count", "skipped_count", "verified_count", "blocked_count", "error_count"]),
      meta: { cache_status, cache_ttl_ms: CACHE_TTL_MS },
    }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("registry_entity_candidates_read_failed", error?.message ?? String(error), { backend: error }));
  }
});

ingestion_control_read_cache_router.get("/registry-entity-candidates/summary", async (_req, res) => {
  const key = cached_key("registry-entity-candidates-summary", {});
  try {
    const { payload: result, cache_status } = await read_through_cache(key, () => get_registry_entity_candidates_summary());
    return res.json(runtime_response(result, {
      data: result,
      counts: inferRuntimeCounts(result as any, ["total_candidate_count", "processed_count", "candidate_count", "inserted_count", "skipped_count", "verified_count", "blocked_count", "error_count"]),
      meta: { cache_status, cache_ttl_ms: CACHE_TTL_MS },
    }));
  } catch (error: any) {
    return res.status(500).json(runtime_error("registry_entity_candidates_summary_failed", error?.message ?? String(error), { backend: error }));
  }
});

ingestion_control_read_cache_router.get("/corpus-import-queue", async (req, res) => {
  const status_filter = typeof req.query.status_filter === "string" ? req.query.status_filter : "all";
  const limit = clamp_integer(req.query.limit, 100, 1, 250);
  const allowed_status_filters = new Set(["all", "blocked", "review_required", "pending_bucket_content_scan", "pending_docx_normalization", "ready_for_review", "docx_extraction_failed", "candidates_created"]);
  const normalized_status_filter = allowed_status_filters.has(status_filter) ? status_filter as any : "all";
  const key = cached_key("corpus-import-queue", { status_filter: normalized_status_filter, limit });

  try {
    const { payload: result, cache_status } = await read_through_cache(key, () => list_corpus_import_queue({ status_filter: normalized_status_filter, limit }));
    const payload = { ...result, allowed_target_hints };
    return res.json(runtime_response(payload, {
      data: payload,
      counts: inferRuntimeCounts(result as any, ["row_count"]),
      meta: { cache_status, cache_ttl_ms: CACHE_TTL_MS },
    }));
  } catch (error: any) {
    const diagnostic_code = classify_db_error(error);
    return res.status(500).json(runtime_error(diagnostic_code === "db_error" ? "ingestion_control_queue_read_failed" : diagnostic_code, error?.message ?? String(error), { diagnostic_code, backend: error }));
  }
});
