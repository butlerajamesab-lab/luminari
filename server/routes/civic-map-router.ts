import express, { Request, Response } from "express";
import {
  get_unified_catalog_detail,
  get_unified_catalog_map_points,
  get_unified_catalog_summary,
} from "../services/resource-directory-unified";

export const civicMapRouter = express.Router();

type QueryParam = string | undefined;

function parseNumber(value: QueryParam, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveInteger(
  value: QueryParam,
  fallback: number,
  max: number
): number {
  const parsed = parseNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function sendError(res: Response, error: unknown) {
  console.error("[CivicMap] directory geography request failed", error);
  return res
    .status(500)
    .json({ ok: false, error: "civic_map_directory_unavailable" });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

// Government-office office_ids are hash-derived text keys ("gof_" +
// sha256 hex), never UUIDs. Since the U2 projection they are catalog
// canonical_ids, so the detail endpoint accepts both identity shapes
// and resolves them against the same unified catalog.
function isGovOfficeId(value: string): boolean {
  return /^gof_[a-f0-9]{16,32}$/i.test(value);
}

function parseBounds(req: Request) {
  const north = parseNumber(req.query.north as QueryParam, 90);
  const south = parseNumber(req.query.south as QueryParam, -90);
  const east = parseNumber(req.query.east as QueryParam, 180);
  const west = parseNumber(req.query.west as QueryParam, -180);
  const valid =
    north >= -90 &&
    north <= 90 &&
    south >= -90 &&
    south <= 90 &&
    east >= -180 &&
    east <= 180 &&
    west >= -180 &&
    west <= 180 &&
    north >= south;
  return { north, south, east, west, valid };
}

function parseCategory(req: Request): string | undefined {
  const raw = req.query.category as QueryParam;
  if (!raw) return undefined;
  const cleaned = raw.trim().toLowerCase();
  return /^[a-z0-9_]+$/.test(cleaned) ? cleaned : undefined;
}

let coverage_in_flight: ReturnType<typeof get_unified_catalog_summary> | null =
  null;

/**
 * One in-flight coverage refresh across CivicMap health and map coverage
 * requests. The unified catalog summary is the single source for every
 * number the map shows — coverage circles, category counts, and site
 * totals are projections of the same corpus the directory searches — so
 * a failed summary read fails closed here rather than falling back to a
 * second, divergent count.
 */
export async function getUnifiedCoverage() {
  if (coverage_in_flight) return coverage_in_flight;
  const request = get_unified_catalog_summary();
  coverage_in_flight = request;
  try {
    return await request;
  } finally {
    if (coverage_in_flight === request) coverage_in_flight = null;
  }
}

civicMapRouter.get("/health", async (_req: Request, res: Response) => {
  try {
    const summary = await getUnifiedCoverage();
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      source: "unified_catalog_v1",
      directory_records:
        summary.total_directory_records ?? summary.total_resources ?? 0,
      direct_resources: summary.direct_resource_count ?? 0,
      programs: summary.program_count ?? 0,
      // Compatibility alias for older health consumers.
      corpus_resources: summary.total_resources ?? 0,
      jurisdictions: summary.jurisdiction_count ?? 0,
      resources_with_location_context:
        summary.resources_with_locations ?? 0,
      verified_physical_sites:
        summary.verified_physical_sites ?? 0,
      exact_mappable_resources: summary.exact_mappable_resources ?? 0,
      catalog_exact_sites: summary.exact_mappable_resources ?? 0,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

civicMapRouter.get("/coverage", async (_req: Request, res: Response) => {
  try {
    const summary = await getUnifiedCoverage();
    res.setHeader(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=300"
    );
    return res.json({
      ok: true,
      source: "unified_catalog_v1",
      coverage: summary,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

async function sendPoints(req: Request, res: Response) {
  try {
    const bounds = parseBounds(req);
    if (!bounds.valid) {
      return res.status(400).json({
        ok: false,
        error: "invalid_bounds",
      });
    }

    const limit = parsePositiveInteger(
      req.query.limit as QueryParam,
      1200,
      2000
    );
    const points = await get_unified_catalog_map_points({
      ...bounds,
      limit,
      category: parseCategory(req),
    });

    res.setHeader(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=300"
    );
    return res.json({
      ok: true,
      source: "unified_catalog_exact_sites",
      count: points.length,
      points,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

civicMapRouter.get("/preview", sendPoints);
civicMapRouter.get("/bounds", sendPoints);

civicMapRouter.get(
  "/detail/:resource_entity_id",
  async (req: Request, res: Response) => {
    try {
      const { resource_entity_id } = req.params;

      if (!isGovOfficeId(resource_entity_id) && !isUuid(resource_entity_id)) {
        return res.status(400).json({
          ok: false,
          error: "invalid_identifier",
          resource_entity_id,
        });
      }

      const resource = await get_unified_catalog_detail(resource_entity_id);
      if (!resource) {
        return res.status(404).json({
          ok: false,
          error: "not_found",
          resource_entity_id,
        });
      }

      res.setHeader(
        "Cache-Control",
        "public, max-age=60, stale-while-revalidate=300"
      );
      return res.json({ ok: true, resource });
    } catch (error) {
      return sendError(res, error);
    }
  }
);
