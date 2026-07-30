import express, { Request, Response } from "express";
import {
  classify_db_error,
  get_pool_runtime_configuration,
  query_with_diagnostics,
} from "../db";

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
  max: number,
): number {
  const parsed = parseNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const error_code = classify_db_error(error);
  return res.status(error_code === "db_error" ? 500 : 503).json({
    ok: false,
    error: error_code,
    detail: message,
    pool: get_pool_runtime_configuration(),
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

civicMapRouter.get("/health", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query_with_diagnostics(
      `
      select
        (select count(*)::int from public.v_unified_civic_infrastructure) as unified_rows,
        (select count(*)::int from public.normalized_civic_resource) as normalized_rows,
        (select count(*)::int from public.v_ui_civic_map_v2) as strict_geocoded_rows,
        (select count(*)::int from public.coordinate_enrichment_queue_v1) as geocode_queue_rows,
        (
          select count(*)::int
          from public.v_lighthouse_verified_legal_signals_v1
          where verification_status = 'verified'
            and signal_status = 'active'
            and generation_method = 'deterministic_rule'
            and signal_type <> 'stream_health_alert'
        ) as verified_legal_signal_rows,
        (
          select count(*)::int
          from public.v_lighthouse_verified_legal_signals_v1 signal
          left join lateral (
            select code
            from public.jurisdictions
            where lower(btrim(name)) = lower(btrim(signal.jurisdiction_raw_value))
               or upper(btrim(code)) = upper(btrim(signal.jurisdiction_raw_value))
            order by (type = 'state') desc, id
            limit 1
          ) jurisdiction on true
          join public.state_fallback_centroids centroid
            on centroid.state_code = coalesce(
              jurisdiction.code,
              case
                when upper(btrim(signal.jurisdiction_raw_value)) ~ '^[A-Z]{2}$'
                  then upper(btrim(signal.jurisdiction_raw_value))
                else null
              end
            )
          where signal.verification_status = 'verified'
            and signal.signal_status = 'active'
            and signal.generation_method = 'deterministic_rule'
            and signal.signal_type <> 'stream_health_alert'
        ) as mapped_verified_legal_signal_rows
    `,
      [],
      {
        label: "civic_map_health",
        pool_acquire_timeout_ms: 2_000,
        query_timeout_ms: 6_000,
      },
    );

    return res.json({
      ok: true,
      ...rows[0],
      signal_layer_source: "v_lighthouse_verified_legal_signals_v1",
      signal_coordinate_policy: "state_fallback_centroid",
      pool: get_pool_runtime_configuration(),
    });
  } catch (error) {
    return sendError(res, error);
  }
});

civicMapRouter.get("/preview", async (req: Request, res: Response) => {
  try {
    const limit = parsePositiveInteger(
      req.query.limit as QueryParam,
      500,
      1500,
    );

    const { rows } = await query_with_diagnostics(
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
      [limit],
      {
        label: "civic_map_preview",
        pool_acquire_timeout_ms: 2_000,
        query_timeout_ms: 5_000,
      },
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
    const limit = parsePositiveInteger(
      req.query.limit as QueryParam,
      1200,
      2000,
    );

    const { rows } = await query_with_diagnostics<{
      nodes: unknown[];
      signals: unknown[];
    }>(
      `
        with resource_nodes as (
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
        ),
        verified_signals as (
          select
            signal.*,
            coalesce(
              jurisdiction.code,
              case
                when upper(btrim(signal.jurisdiction_raw_value)) ~ '^[A-Z]{2}$'
                  then upper(btrim(signal.jurisdiction_raw_value))
                else null
              end
            ) as state_code
          from public.v_lighthouse_verified_legal_signals_v1 signal
          left join lateral (
            select code
            from public.jurisdictions
            where lower(btrim(name)) = lower(btrim(signal.jurisdiction_raw_value))
               or upper(btrim(code)) = upper(btrim(signal.jurisdiction_raw_value))
            order by (type = 'state') desc, id
            limit 1
          ) jurisdiction on true
          where signal.verification_status = 'verified'
            and signal.signal_status = 'active'
            and signal.generation_method = 'deterministic_rule'
            and signal.signal_type <> 'stream_health_alert'
        ),
        signal_nodes as (
          select
            signal.bridge_record_id::text as node_id,
            'verified_legal_signal'::text as node_type,
            coalesce(
              nullif(signal.atlas_metadata_json ->> 'title', ''),
              nullif(signal.evidence_payload ->> 'title', ''),
              replace(signal.signal_type, '_', ' ')
            ) as name,
            coalesce(
              nullif(signal.atlas_metadata_json ->> 'description', ''),
              nullif(signal.evidence_payload ->> 'description', '')
            ) as description,
            signal.signal_family,
            signal.signal_type,
            signal.jurisdiction_raw_value as jurisdiction,
            signal.state_code,
            centroid.center_lat::float8 as latitude,
            centroid.center_lon::float8 as longitude,
            'state_fallback_centroid'::text as coordinate_precision,
            'state_fallback_centroids'::text as coordinate_source,
            true as is_approximate_coordinate,
            signal.severity,
            signal.confidence_score::float8 as confidence_score,
            signal.source_system,
            signal.source_url,
            signal.detected_at,
            signal.bridged_at,
            signal.rule_id,
            signal.rule_version,
            signal.generation_method,
            signal.record_origin,
            signal.verification_status,
            signal.bridge_version,
            signal.source_view,
            signal.atlas_metadata_json ->> 'court' as court,
            signal.atlas_metadata_json ->> 'docket_number' as docket_number,
            signal.atlas_metadata_json ->> 'decision_date' as decision_date,
            signal.atlas_metadata_json ->> 'bill_number' as bill_number
          from verified_signals signal
          join public.state_fallback_centroids centroid
            on centroid.state_code = signal.state_code
          where centroid.center_lat between $1 and $2
            and (
              ($3 <= $4 and centroid.center_lon between $3 and $4)
              or
              ($3 > $4 and (centroid.center_lon >= $3 or centroid.center_lon <= $4))
            )
          order by signal.detected_at desc, signal.bridge_record_id
          limit 500
        )
        select
          coalesce(
            (select jsonb_agg(to_jsonb(resource) order by resource.name, resource.node_id) from resource_nodes resource),
            '[]'::jsonb
          ) as nodes,
          coalesce(
            (select jsonb_agg(to_jsonb(signal) order by signal.detected_at desc, signal.node_id) from signal_nodes signal),
            '[]'::jsonb
          ) as signals
      `,
      [south, north, west, east, limit],
      {
        label: "civic_map_bounds",
        pool_acquire_timeout_ms: 2_000,
        query_timeout_ms: 6_000,
      },
    );

    const nodes = Array.isArray(rows[0]?.nodes) ? rows[0].nodes : [];
    const signals = Array.isArray(rows[0]?.signals) ? rows[0].signals : [];
    return res.json({
      ok: true,
      count: nodes.length,
      signal_count: signals.length,
      nodes,
      signals,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

civicMapRouter.get("/detail/:node_id", async (req: Request, res: Response) => {
  try {
    const { node_id } = req.params;
    if (!isUuid(node_id)) {
      return res
        .status(400)
        .json({ ok: false, error: "invalid_uuid", node_id });
    }

    const { rows } = await query_with_diagnostics(
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
      [node_id],
      {
        label: "civic_map_detail",
        pool_acquire_timeout_ms: 2_000,
        query_timeout_ms: 5_000,
      },
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "not_found", node_id });
    }

    return res.json({ ok: true, node: rows[0] });
  } catch (error) {
    return sendError(res, error);
  }
});
