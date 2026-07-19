import { Router } from "express";
import { getPool } from "../db";
import { withRuntimeEnvelope } from "../../shared/runtime-envelope";

export const substrate_readiness_router = Router();

substrate_readiness_router.get("/substrate-promotion-readiness", async (_req, res) => {
  const started_at = Date.now();
  try {
    const pool = getPool();
    const readiness_result = await pool.query(`select * from public.v_substrate_promotion_readiness limit 1`);
    const disposition_result = await pool.query(`
      select source_file, candidate_kind, disposition, count(*)::int as candidate_count
      from public.substrate_candidate_disposition
      where source_file in (
        'luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx',
        'luminari-DISABILITY-SERVICES-RESOURCE-DIRECTORY-2026 (2).docx'
      )
      group by source_file, candidate_kind, disposition
      order by source_file, candidate_kind, disposition
    `);
    const readiness = readiness_result.rows[0] ?? null;
    const payload = {
      success: true,
      action: "read_substrate_promotion_readiness",
      runtime_ms: Date.now() - started_at,
      readiness,
      disposition_breakdown: disposition_result.rows,
      publication_state: readiness?.ready_for_canonical_promotion ? "promotion_ready" : "staging_only",
      public_site_visible: false,
    };
    return res.json(withRuntimeEnvelope(payload, {
      source: "ingestion-control.substrate-readiness",
      action: payload.action,
      data: payload,
      availability: readiness ? "available" : "empty",
      counts: {
        staged_rows: Number(readiness?.staged_rows ?? 0),
        unresolved_candidates: Number(readiness?.unresolved_candidates ?? 0),
        insert_candidates: Number(readiness?.insert_candidates ?? 0),
      },
      flags: {
        ready_for_canonical_promotion: Boolean(readiness?.ready_for_canonical_promotion),
        public_site_visible: false,
      },
    }));
  } catch (error: any) {
    return res.status(500).json(withRuntimeEnvelope({
      success: false,
      error: "substrate_promotion_readiness_failed",
      message: error?.message ?? String(error),
      runtime_ms: Date.now() - started_at,
    }, {
      source: "ingestion-control.substrate-readiness",
      action: "read_substrate_promotion_readiness",
      data: null,
      availability: "unavailable",
      errors: [{ code: "substrate_promotion_readiness_failed", message: error?.message ?? String(error) }],
      backend: error,
    }));
  }
});
