import { Router } from "express";
import { getPool } from "../db";

export const pipelinePreviewRouter = Router();

function read_queue_row_id(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function infer_steps(row: any) {
  const steps: string[] = [];
  const source_ext = String(row.source_ext ?? "").toLowerCase();
  const import_status = String(row.import_status ?? "");
  if (source_ext === ".docx" && import_status === "pending_bucket_content_scan") steps.push("extract_docx_queue_row");
  if (source_ext === ".docx" && ["pending_bucket_content_scan", "pending_docx_normalization"].includes(import_status)) steps.push("normalize_docx_queue_row");
  steps.push("route_corpus_queue_dry_run");
  steps.push("approve_route_required");
  return steps;
}

function destination_for(row: any) {
  const target_hint = row.target_hint ?? null;
  if (!target_hint) return "target_hint_required";
  if (target_hint.includes("state_enriched_registry")) return "state_enriched_registry_docx_review";
  if (target_hint.includes("legislator")) return "legislator_registry";
  if (target_hint.includes("committee_membership")) return "committee_membership_registry";
  if (target_hint.includes("committee")) return "committee_registry";
  if (target_hint.includes("benefit")) return "government_benefits_registry";
  if (target_hint.includes("workflow")) return "workflow_registry";
  if (target_hint.includes("escalation")) return "escalation_registry";
  if (target_hint.includes("advocacy")) return "advocacy_organizations";
  return target_hint;
}

pipelinePreviewRouter.get("/corpus-import-queue/:id/pipeline-preview", async (req, res) => {
  try {
    const id = read_queue_row_id(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: "invalid_queue_row_id" });
    const pool = getPool();
    const result = await pool.query(
      `select id, source_name, source_ext, storage_bucket, storage_path, storage_mode, target_hint, import_status,
              coalesce(char_length(raw_text), 0) as raw_text_chars,
              record_count_estimate, payload, operation_result_json, worker_state, last_error_code, attempt_count
         from public.corpus_import_queue
        where id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ success: false, error: "corpus_import_queue_row_not_found" });
    const destination = destination_for(row);
    const raw_text_chars = Number(row.raw_text_chars ?? 0);
    const route_plan = {
      mode: "preview_only",
      no_canonical_promotion: true,
      row_id: Number(row.id),
      current_status: row.import_status,
      source_name: row.source_name,
      storage_mode: row.storage_mode,
      target_hint: row.target_hint,
      destination,
      raw_text_chars,
      proposed_steps: infer_steps(row),
      approval_gate: "approve_route_required",
      apply_route_available: false,
      reason: "staging_only_preview_before_table_write",
      visible_platform_destination: raw_text_chars > 0 ? destination : "not_visible_until_extracted_and_normalized",
      estimated_records: row.record_count_estimate ?? null,
    };
    return res.json({ success: true, action: "run_pipeline_preview", row, route_plan });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "run_pipeline_preview_failed", message: error?.message ?? String(error) });
  }
});
