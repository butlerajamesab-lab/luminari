import { Router } from "express";
import { getPool } from "../db";

export const corpus_footprint_router = Router();

const FOOTPRINT_CONTRACT = "luminari_corpus_footprint_v1";

corpus_footprint_router.get("/", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const pool = getPool();
    const [atomic, typed, publicSnapshot, legacy] = await Promise.all([
      pool.query(`
        select run_id::text,engine_version,status,artifact_count,atomic_record_count,origin_count,
               started_at,completed_at,receipt_hash,result_json
          from public.luminari_corpus_atomic_run_v1
         where status in ('completed','completed_with_failures')
         order by completed_at desc nulls last,started_at desc
         limit 1
      `),
      pool.query(`
        select count(*)::bigint as typed_candidates,
               count(*) filter(where candidate_type='resource')::bigint as resource_candidates,
               count(distinct candidate_type)::int as candidate_types
          from public.luminari_corpus_candidate_v1
      `),
      pool.query(`
        select snapshot_id::text,snapshot_version,status,resource_count,conflict_count,receipt_hash,activated_at,metadata
          from public.luminari_resource_snapshot_v1
         where is_current=true and status='active'
         order by activated_at desc nulls last
         limit 1
      `),
      pool.query(`
        select
          (select count(*)::bigint from public.unified_resources) as broad_resource_rows,
          (select count(*)::bigint from public.v_luminari_resource_source_candidates) as source_bound_resource_candidates,
          (select count(*)::bigint from public.luminari_resource_entities) as canonical_resource_entities
      `),
    ]);

    const a = atomic.rows[0] ?? {};
    const t = typed.rows[0] ?? {};
    const p = publicSnapshot.rows[0] ?? {};
    const l = legacy.rows[0] ?? {};
    const statusCounts = a.result_json?.artifact_status_counts ?? {};

    return res.json({
      ok: true,
      contract: FOOTPRINT_CONTRACT,
      non_additive: true,
      doctrine: "storage_artifact != atomic_source_record != typed_candidate != deduped_identity != public_projection",
      warning: "Stage counts overlap by design. Do not add them together and do not treat a smaller downstream projection as corpus size.",
      stages: {
        atomic_source_records: {
          count: Number(a.atomic_record_count ?? 0),
          source_occurrences: Number(a.origin_count ?? 0),
          artifacts_accounted: Number(a.artifact_count ?? 0),
          artifacts_completed: Number(statusCounts.completed ?? 0),
          artifacts_failed: Number(statusCounts.failed ?? 0),
          engine_version: a.engine_version ?? null,
          status: a.status ?? "not_started",
          run_id: a.run_id ?? null,
          receipt_hash: a.receipt_hash ?? null,
          completed_at: a.completed_at ?? null,
        },
        fresh_typed_candidates: {
          count: Number(t.typed_candidates ?? 0),
          resource_candidates: Number(t.resource_candidates ?? 0),
          candidate_types: Number(t.candidate_types ?? 0),
        },
        historical_coverage_oracle: {
          source_bound_resource_candidates: Number(l.source_bound_resource_candidates ?? 0),
          broad_resource_rows: Number(l.broad_resource_rows ?? 0),
          canonical_resource_entities: Number(l.canonical_resource_entities ?? 0),
          canonical: false,
          purpose: "under_extraction_detection_only",
        },
        active_public_resource_snapshot: {
          count: Number(p.resource_count ?? 0),
          held_identity_conflicts: Number(p.conflict_count ?? 0),
          snapshot_id: p.snapshot_id ?? null,
          snapshot_version: p.snapshot_version ?? null,
          receipt_hash: p.receipt_hash ?? null,
          activated_at: p.activated_at ?? null,
          canonical: true,
          scope: "deduped_publishable_resources_only",
        },
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      contract: FOOTPRINT_CONTRACT,
      error: "corpus_footprint_read_failed",
      message: error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400),
      generated_at: new Date().toISOString(),
    });
  }
});
