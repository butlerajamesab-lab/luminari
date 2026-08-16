import express, { Request, Response } from "express";
import {
  getResourceDirectoryDetail,
  getResourceDirectoryMapPoints,
} from "../services/resource-directory";
import { getPublishableResourceDirectorySummary } from "../services/resource-directory-publishable";
import { getPool } from "../db";

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

async function getReviewedMapSiteCounts() {
  const result = await getPool().query(`
    select
      count(distinct resource_entity_id) filter (
        where manual_map_eligible is true
      )::int as verified_physical_sites,
      count(distinct resource_entity_id) filter (
        where manual_map_eligible is true
          and latitude is not null
          and longitude is not null
      )::int as exact_mappable_resources
    from public.v_luminari_resource_locations_current_v3_13
  `);
  return result.rows[0] ?? {
    verified_physical_sites: 0,
    exact_mappable_resources: 0,
  };
}

async function getBreadthPreservingCoverage() {
  // The jurisdiction coverage layer is canonical whole-corpus breadth. Do not
  // block it on the legacy resource-entity summary, which performs much
  // heavier joins and can cause the public map's primary coverage request to
  // be aborted before any circles render. Exact physical-site counts are a
  // separate, intentionally stricter projection.
  const [breadth, mapSites] = await Promise.all([
    getPublishableResourceDirectorySummary() as Promise<Record<string, unknown>>,
    getReviewedMapSiteCounts(),
  ]);

  return {
    ...breadth,
    verified_physical_sites: Number(mapSites.verified_physical_sites ?? 0),
    exact_mappable_resources: Number(mapSites.exact_mappable_resources ?? 0),
    geography_source: "reviewed_v3_13_locations",
    coverage_source: "breadth_preserving_resource_directory_v3",
  };
}

civicMapRouter.get("/health", async (_req: Request, res: Response) => {
  try {
    const summary = await getBreadthPreservingCoverage();
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      source: "breadth_preserving_resource_directory_v3",
      corpus_resources: summary.total_resources ?? 0,
      jurisdictions: summary.jurisdiction_count ?? 0,
      resources_with_location_context:
        summary.resources_with_locations ?? 0,
      verified_physical_sites:
        summary.verified_physical_sites ?? 0,
      exact_mappable_resources: summary.exact_mappable_resources ?? 0,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

civicMapRouter.get("/coverage", async (_req: Request, res: Response) => {
  try {
    const summary = await getBreadthPreservingCoverage();
    res.setHeader(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=300"
    );
    return res.json({
      ok: true,
      source: "breadth_preserving_resource_directory_v3",
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
    const points = await getResourceDirectoryMapPoints({
      ...bounds,
      limit,
    });

    res.setHeader(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=300"
    );
    return res.json({
      ok: true,
      source: "reviewed_v3_13_exact_public_sites",
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
      if (!isUuid(resource_entity_id)) {
        return res.status(400).json({
          ok: false,
          error: "invalid_uuid",
          resource_entity_id,
        });
      }

      const resource = await getResourceDirectoryDetail(resource_entity_id);
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