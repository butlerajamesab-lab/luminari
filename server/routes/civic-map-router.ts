import express, { Request, Response } from "express";
import { getPool } from "../db";

export const civicMapRouter = express.Router();

type QueryParam = string | undefined;

function parseNumber(value: QueryParam, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveInteger(value: QueryParam, fallback: number, max: number): number {
  const parsed = parseNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ ok: false, error: message });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

civicMapRouter.get("/health", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(`
      select
        (select count(*)::int from public.v_unified_civic_infrastructure) as unified_rows,
        (select count(*)::int from public.normalized_civic_resource) as normalized_rows,
        (select count(*)::int from public.v_ui_civic_map_v2) as strict_geocoded_rows,
        (select count(*)::int from public.coordinate_enrichment_queue_v1) as geocode_queue_rows
    `);

    return res.json({ ok: true, ...rows[0] });
  } catch (error) {
    return sendError(res, error);
  }
});

civicMapRouter.get("/preview", async (req: Request, res: Response) => {
  try {
    const limit = parsePositiveInteger(req.query.limit as QueryParam, 500, 1500);
    const pool = getPool();

    const { rows } = await pool.query(
      `
        select
          id::text as node_id,
          title as name,
          resource_type as node_type,
          coalesce(nullif(city, ''), nullif(county, ''), nullif(state, ''), 'UNKNOWN') as jurisdiction,
          latitude::float8 as latitude,
          longitude::float8 as longitude,
          'map_layer1_points'::text as source_table,
          normalization_confidence::float8 as normalization_confidence,
          source_key
        from public.map_layer1_points(-90, 90, -180, 180, $1)
      `,
      [limit]
    );

    return res.json({ ok: true, count: rows.length, nodes: rows });
  } catch (error) {
    return sendError(res, error);
  }
});

civicMapRouter.get("/bounds", async (req: Request, res: Response) => {
  try {
    const north = parseNumber(req.query.north as QueryParam, 90);
    const south = parseNumber(req.query.south as QueryParam, -90);
    const east = parseNumber(req.query.east as QueryParam, 180);
    const west = parseNumber(req.query.west as QueryParam, -180);
    const limit = parsePositiveInteger(req.query.limit as QueryParam, 1200, 2000);
    const pool = getPool();

    const { rows } = await pool.query(
      `
        select
          id::text as node_id,
          title as name,
          resource_type as node_type,
          coalesce(nullif(city, ''), nullif(county, ''), nullif(state, ''), 'UNKNOWN') as jurisdiction,
          latitude::float8 as latitude,
          longitude::float8 as longitude,
          'map_layer1_points'::text as source_table,
          normalization_confidence::float8 as normalization_confidence,
          source_key,
          city,
          county,
          state
        from public.map_layer1_points($1, $2, $3, $4, $5)
      `,
      [south, north, west, east, limit]
    );

    return res.json({ ok: true, count: rows.length, nodes: rows });
  } catch (error) {
    return sendError(res, error);
  }
});

civicMapRouter.get("/detail/:node_id", async (req: Request, res: Response) => {
  try {
    const { node_id } = req.params;
    if (!isUuid(node_id)) {
      return res.status(400).json({ ok: false, error: "invalid_uuid", node_id });
    }

    const pool = getPool();
    const { rows } = await pool.query(
      `
        select
          id::text as node_id,
          resource_type as node_type,
          id,
          source_key,
          resource_type,
          name,
          description,
          organization_name,
          agency_name,
          address_line1,
          address_line2,
          city,
          county,
          state,
          postal_code,
          country,
          latitude::float8 as latitude,
          longitude::float8 as longitude,
          geocode_precision,
          phone,
          email,
          website_url,
          service_categories,
          eligibility_summary,
          hours,
          languages,
          accessibility_features,
          normalization_confidence::float8 as normalization_confidence,
          program_owner_final,
          updated_at
        from public.map_layer2_detail($1::uuid)
        limit 1
      `,
      [node_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "not_found", node_id });
    }

    return res.json({ ok: true, node: rows[0] });
  } catch (error) {
    return sendError(res, error);
  }
});
