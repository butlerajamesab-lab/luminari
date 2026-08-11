import { Router } from "express";
import { query_with_diagnostics } from "../db";

const TOKEN_HEADER = "x-atlas-domain3-token";

type live_data_signal_transport_receipt = {
  live_data_signal_id: string;
  signal_hash: string;
  governance_status: string;
  registered_at: string | Date;
};

type atlas_stream_runtime_snapshot_receipt = {
  status: string;
  streams_registered: number;
  snapshot_hash: string;
  observed_at: string | Date;
  registered_at: string | Date;
};

function is_record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function is_authentication_error(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };
  return candidate?.code === "28000" ||
    String(candidate?.message ?? "").includes("signal_bridge_authentication_failed");
}

async function require_atlas_bridge_token(bridge_token: string) {
  await query_with_diagnostics(
    `select private.require_signal_bridge_token_v1(
       $1::text,
       'live_data_signal_write'::text
     )`,
    [bridge_token],
    {
      label: "atlas_bridge_token_check",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 5_000,
    },
  );
}

export const atlas_domain3_receipt_router = Router();

atlas_domain3_receipt_router.post("/receipt", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const bridge_token = req.get(TOKEN_HEADER)?.trim() ?? "";
  if (bridge_token.length < 32) {
    return res.status(401).json({
      ok: false,
      error: "signal_bridge_authentication_failed",
    });
  }

  if (!is_record(req.body)) {
    return res.status(400).json({
      ok: false,
      error: "live_data_signal_record_required",
    });
  }

  try {
    const result = await query_with_diagnostics<live_data_signal_transport_receipt>(
      `with authorized as (
         select private.require_signal_bridge_token_v1(
           $1::text,
           'live_data_signal_write'::text
         )
       )
       select receipt.live_data_signal_id::text,
              receipt.signal_hash,
              receipt.governance_status,
              receipt.registered_at
         from authorized
         cross join lateral public.register_live_data_signal_transport_receipt_v1(
           $2::jsonb
         ) receipt`,
      [bridge_token, JSON.stringify(req.body)],
      {
        label: "atlas_domain3_receipt",
        pool_acquire_timeout_ms: 2_000,
        query_timeout_ms: 10_000,
      },
    );

    const receipt = result.rows[0];
    if (!receipt || !receipt.live_data_signal_id || !receipt.signal_hash) {
      console.error("[AtlasDomain3Receipt] incomplete_receipt", {
        row_count: result.rowCount,
      });
      return res.status(500).json({
        ok: false,
        error: "live_data_signal_transport_receipt_incomplete",
      });
    }

    return res.status(200).json({
      ok: true,
      live_data_signal_id: receipt.live_data_signal_id,
      signal_hash: receipt.signal_hash,
      governance_status: receipt.governance_status,
      registered_at: new Date(receipt.registered_at).toISOString(),
    });
  } catch (error) {
    if (is_authentication_error(error)) {
      return res.status(401).json({
        ok: false,
        error: "signal_bridge_authentication_failed",
      });
    }

    const candidate = error as { code?: string; name?: string };
    console.error("[AtlasDomain3Receipt] registration_failed", {
      error_code: candidate?.code ?? "unknown",
      error_class: candidate?.name ?? "unknown",
    });
    return res.status(500).json({
      ok: false,
      error: "live_data_signal_registration_failed",
    });
  }
});

/**
 * Receipted downstream projection of Atlas's authoritative stream/runtime state.
 * This endpoint does not make Lighthouse a stream owner. It stores the latest
 * Atlas snapshot so Mission Control can remain a Lighthouse-DB-only observer.
 */
atlas_domain3_receipt_router.post("/streams", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const bridge_token = req.get(TOKEN_HEADER)?.trim() ?? "";
  if (bridge_token.length < 32) {
    return res.status(401).json({ ok: false, error: "signal_bridge_authentication_failed" });
  }
  if (!is_record(req.body) || !Array.isArray(req.body.streams)) {
    return res.status(400).json({ ok: false, error: "atlas_stream_runtime_snapshot_required" });
  }

  try {
    await require_atlas_bridge_token(bridge_token);
    const result = await query_with_diagnostics<atlas_stream_runtime_snapshot_receipt>(
      `with registered as (
         select public.register_atlas_stream_runtime_snapshot_v1($1::jsonb) as receipt
       )
       select receipt->>'status' as status,
              coalesce((receipt->>'streams_registered')::integer, 0) as streams_registered,
              receipt->>'snapshot_hash' as snapshot_hash,
              receipt->>'observed_at' as observed_at,
              receipt->>'registered_at' as registered_at
         from registered`,
      [JSON.stringify(req.body)],
      {
        label: "atlas_stream_runtime_snapshot",
        pool_acquire_timeout_ms: 2_000,
        query_timeout_ms: 10_000,
      },
    );
    const receipt = result.rows[0];
    if (!receipt || receipt.status !== "completed" || !receipt.snapshot_hash) {
      return res.status(500).json({ ok: false, error: "atlas_stream_runtime_snapshot_incomplete" });
    }
    return res.status(200).json({
      ok: true,
      status: receipt.status,
      streams_registered: Number(receipt.streams_registered ?? 0),
      snapshot_hash: receipt.snapshot_hash,
      observed_at: new Date(receipt.observed_at).toISOString(),
      registered_at: new Date(receipt.registered_at).toISOString(),
    });
  } catch (error) {
    if (is_authentication_error(error)) {
      return res.status(401).json({ ok: false, error: "signal_bridge_authentication_failed" });
    }
    const candidate = error as { code?: string; name?: string };
    console.error("[AtlasStreamRuntimeSnapshot] registration_failed", {
      error_code: candidate?.code ?? "unknown",
      error_class: candidate?.name ?? "unknown",
    });
    return res.status(500).json({ ok: false, error: "atlas_stream_runtime_snapshot_registration_failed" });
  }
});
