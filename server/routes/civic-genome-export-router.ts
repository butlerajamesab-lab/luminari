import { Router, type Response } from "express";
import { getPool } from "../db";
import { get_civic_genome_bill_detail } from "../civic-genome-bill-detail";
import { get_genome_bill_by_source_id } from "../civic-genome-source-id";
import {
  get_genome_family,
  get_genome_stats,
  list_genome_bills,
  list_genome_events,
  list_momentum_snapshots,
} from "../civic-genome-db";

export const civic_genome_export_router = Router();

const EXPORT_CONTRACT = "civic-genome-json-export-v1";
const MULTI_EXPORT_LIMIT = 100;

function positive_integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safe_filename(value: unknown): string {
  return String(value ?? "record")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "record";
}

function send_json_attachment(res: Response, filename: string, payload: unknown) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${safe_filename(filename)}.json\"`);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.send(JSON.stringify(payload, null, 2));
}

async function build_single_bill_export(source_bill_id: number) {
  const bill = await get_genome_bill_by_source_id(source_bill_id);
  if (!bill) return null;

  const detail = await get_civic_genome_bill_detail(bill.genome_bill_id);
  if (!detail) return null;

  const pool = getPool();
  const [versions_result, lineage_result, all_traits_result, all_runs_result] = await Promise.all([
    pool.query(
      `select *
         from public.civic_genome_bill_version
        where genome_bill_id = $1
        order by stage_rank desc, provider_sequence desc, created_at desc, bill_version_id desc`,
      [bill.genome_bill_id],
    ),
    pool.query(
      `select *
         from public.bill_lineage_edge
        where from_bill_id = $1 or to_bill_id = $1
        order by created_at desc, lineage_edge_id desc`,
      [bill.genome_bill_id],
    ),
    pool.query(
      `select *
         from public.civic_genome_trait
        where genome_bill_id = $1
        order by created_at asc, trait_class, trait_key, trait_id`,
      [bill.genome_bill_id],
    ),
    pool.query(
      `select *
         from public.civic_genome_assembly_run
        where genome_bill_id = $1
        order by created_at asc, assembly_run_id asc`,
      [bill.genome_bill_id],
    ),
  ]);

  const [family, family_bills, events, momentum] = await Promise.all([
    get_genome_family(bill.family_id),
    list_genome_bills({ family_id: bill.family_id, limit: 200 }),
    list_genome_events({ genome_bill_id: bill.genome_bill_id, limit: 500 }),
    list_momentum_snapshots({ family_id: bill.family_id, limit: 365 }),
  ]);

  return {
    export_type: "civic_genome_bill_export",
    export_contract: EXPORT_CONTRACT,
    exported_at: new Date().toISOString(),
    source_bill_id,
    genome_bill_id: bill.genome_bill_id,
    bill_detail: detail,
    bill_versions: versions_result.rows,
    all_structural_traits: all_traits_result.rows,
    all_assembly_runs: all_runs_result.rows,
    bill_events: events,
    lineage_edges: lineage_result.rows,
    family,
    family_bills,
    family_momentum_snapshots: momentum,
    counts: {
      bill_versions: versions_result.rowCount ?? versions_result.rows.length,
      structural_traits: all_traits_result.rowCount ?? all_traits_result.rows.length,
      assembly_runs: all_runs_result.rowCount ?? all_runs_result.rows.length,
      bill_events: events.length,
      lineage_edges: lineage_result.rowCount ?? lineage_result.rows.length,
      family_bills: family_bills.length,
      family_momentum_snapshots: momentum.length,
    },
    interpretation: "This is a source-preserving Civic Genome export. Historical versions and receipts are preserved as history; export does not re-run or mutate Rosetta, Prism, Docket, or Civic Genome state.",
  };
}

civic_genome_export_router.get("/bill/:source_bill_id", async (req, res) => {
  const source_bill_id = positive_integer(req.params.source_bill_id);
  if (!source_bill_id) return res.status(400).json({ ok: false, error: "invalid_source_bill_id" });

  try {
    const payload = await build_single_bill_export(source_bill_id);
    if (!payload) return res.status(404).json({ ok: false, error: "civic_genome_bill_not_found" });
    const selected = payload.bill_detail.bill;
    return send_json_attachment(
      res,
      `civic-genome-${source_bill_id}-${selected.state_code ?? "state"}-${selected.source_bill_number ?? "bill"}`,
      payload,
    );
  } catch (error) {
    console.error("[CivicGenomeExport] bill export failed", { source_bill_id, error });
    return res.status(500).json({ ok: false, error: "civic_genome_bill_export_failed" });
  }
});

civic_genome_export_router.get("/current", async (req, res) => {
  const requested_limit = positive_integer(req.query.limit) ?? MULTI_EXPORT_LIMIT;
  const limit = Math.min(requested_limit, MULTI_EXPORT_LIMIT);
  const offset_value = Number(req.query.offset ?? 0);
  const offset = Number.isSafeInteger(offset_value) && offset_value >= 0 ? offset_value : 0;

  try {
    const [stats, bills] = await Promise.all([
      get_genome_stats(),
      list_genome_bills({ limit, offset }),
    ]);

    const payload = {
      export_type: "civic_genome_current_proof_export",
      export_contract: EXPORT_CONTRACT,
      exported_at: new Date().toISOString(),
      interpretation: "Each returned row is a Civic Genome bill record as currently stored. This export is read-only and does not replay historical failures or mutate any upstream owner.",
      total_bill_count: stats.total_bills,
      returned_bill_count: bills.length,
      offset,
      limit,
      max_limit: MULTI_EXPORT_LIMIT,
      bills,
    };

    return send_json_attachment(res, `civic-genome-current-${offset}-${offset + bills.length}`, payload);
  } catch (error) {
    console.error("[CivicGenomeExport] current export failed", { limit, offset, error });
    return res.status(500).json({ ok: false, error: "civic_genome_current_export_failed" });
  }
});
