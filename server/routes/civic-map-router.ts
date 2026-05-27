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
    const limit = parsePositiveInteger(req.query.limit as QueryParam, 5000, 10000);
    const offset = parsePositiveInteger(req.query.offset as QueryParam, 1, 1000000) - 1;
    const pool = getPool();

    const { rows } = await pool.query(
      `
        select
          id::text as node_id,
          coalesce(nullif(name, ''), nullif(organization_name, ''), nullif(agency_name, ''), 'Unnamed civic resource') as name,
          resource_type as node_type,
          coalesce(nullif(state, ''), nullif(county, ''), nullif(city, ''), 'UNKNOWN') as jurisdiction,
          latitude::float8 as latitude,
          longitude::float8 as longitude,
          'normalized_civic_resource'::text as source_table,
          geocode_precision as geocode_precision
        from public.normalized_civic_resource
        where latitude is not null
          and longitude is not null
        order by updated_at desc nulls last, created_at desc nulls last
        limit $1 offset $2
      `,
      [limit, offset]
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
    const limit = parsePositiveInteger(req.query.limit as QueryParam, 2500, 10000);
    const pool = getPool();

    const { rows } = await pool.query(
      `
        select
          id::text as node_id,
          coalesce(nullif(name, ''), nullif(organization_name, ''), nullif(agency_name, ''), 'Unnamed civic resource') as name,
          resource_type as node_type,
          coalesce(nullif(state, ''), nullif(county, ''), nullif(city, ''), 'UNKNOWN') as jurisdiction,
          latitude::float8 as latitude,
          longitude::float8 as longitude,
          'normalized_civic_resource'::text as source_table,
          geocode_precision as geocode_precision
        from public.normalized_civic_resource
        where latitude is not null
          and longitude is not null
          and latitude between $1 and $2
          and longitude between $3 and $4
        order by updated_at desc nulls last, created_at desc nulls last
        limit $5
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
    const pool = getPool();

    const { rows } = await pool.query(
      `
        select
          id::text as node_id,
          resource_type as node_type,
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
          languages,
          accessibility_features,
          normalization_confidence,
          normalization_notes,
          source_key,
          'normalized_civic_resource'::text as source_table,
          created_at,
          updated_at
        from public.normalized_civic_resource
        where id::text = $1
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
