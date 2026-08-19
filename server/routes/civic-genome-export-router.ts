import { Router, type Response } from "express";
import {
  civic_genome_meaningful_unresolved,
  civic_genome_prism_display,
} from "@shared/civic-genome-prism-presentation";
import { getPool } from "../db";
import { get_civic_genome_bill_detail } from "../civic-genome-bill-detail";
import { get_genome_bill_by_source_id } from "../civic-genome-source-id";
import { render_civic_genome_human_report, type civic_genome_report_mode } from "../civic-genome-human-report";
import {
  get_genome_family,
  get_genome_stats,
  list_genome_bills,
  list_genome_events,
  list_momentum_snapshots,
  type GenomeBill,
} from "../civic-genome-db";

export const civic_genome_export_router = Router();

const EXPORT_CONTRACT = "civic-genome-json-export-v1";
const MULTI_EXPORT_LIMIT = 100;

type json_record = Record<string, unknown>;

function positive_integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function source_bill_id_from_bill(bill: GenomeBill): number | null {
  const value = bill.structural_dna_json?.source_bill_id;
  return positive_integer(value);
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

function send_html_attachment(res: Response, filename: string, payload: string) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${safe_filename(filename)}.html\"`);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.send(payload);
}

function as_record(value: unknown): json_record | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as json_record
    : null;
}

function as_records(value: unknown): json_record[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is json_record => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function human_report_validation_summary(traits: unknown[]) {
  return traits.reduce((summary, value) => {
    const trait = as_record(value);
    if (!trait) return summary;
    const display = civic_genome_prism_display(trait);
    if (display.tone === "finding") summary.contradicted += 1;
    else if (display.tone === "open" || display.tone === "neutral") summary.unresolved += 1;
    else if (display.tone === "supported") summary.supported += 1;
    return summary;
  }, { supported: 0, contradicted: 0, unresolved: 0 });
}

function humanize_report_payload(payload: unknown): json_record {
  // JSON round-trip intentionally mirrors the technical export boundary: it
  // converts pg Date values to the same ISO strings a downloaded JSON receipt
  // carries, without altering the canonical records in memory or storage.
  const clone = JSON.parse(JSON.stringify(payload)) as json_record;
  const detail = as_record(clone.bill_detail);
  const structural_dna = as_record(detail?.structural_dna);
  const traits = as_records(structural_dna?.traits);

  for (const trait of traits) {
    const display = civic_genome_prism_display(trait);
    if (trait.prism_verification_status === "contradicted") {
      trait.prism_verification_status = display.token;
    }
    trait.prism_unresolved_conditions = civic_genome_meaningful_unresolved(
      trait.prism_unresolved_conditions,
    );
  }

  if (structural_dna) {
    structural_dna.validation_summary = {
      ...(as_record(structural_dna.validation_summary) ?? {}),
      ...human_report_validation_summary(traits),
    };
  }

  for (const event of as_records(clone.bill_events)) {
    if (event.event_at == null && event.event_timestamp != null) {
      event.event_at = event.event_timestamp;
    }
  }

  return clone;
}

function humanize_report_headings(report: string): string {
  // Only replace renderer-owned markup. Do not perform a global text
  // substitution that could alter the embedded authoritative source copy.
  return report
    .replaceAll(
      '<span class="label">Did not carry into final bill</span>',
      '<span class="label">Prism verification findings</span>',
    )
    .replaceAll(
      "<h4>Did not carry into final bill ·",
      "<h4>Prism verification findings ·",
    );
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

async function send_human_bill_report(
  res: Response,
  source_bill_id: number,
  mode: civic_genome_report_mode,
) {
  const payload = await build_single_bill_export(source_bill_id);
  if (!payload) return res.status(404).json({ ok: false, error: "civic_genome_bill_not_found" });

  const selected = payload.bill_detail.bill;
  const human_payload = humanize_report_payload(payload);
  const report = humanize_report_headings(
    await render_civic_genome_human_report(human_payload, mode),
  );
  return send_html_attachment(
    res,
    `civic-genome-${source_bill_id}-${selected.state_code ?? "state"}-${selected.source_bill_number ?? "bill"}-${mode}`,
    report,
  );
}

civic_genome_export_router.get("/bill/:source_bill_id/summary", async (req, res) => {
  const source_bill_id = positive_integer(req.params.source_bill_id);
  if (!source_bill_id) return res.status(400).json({ ok: false, error: "invalid_source_bill_id" });

  try {
    return await send_human_bill_report(res, source_bill_id, "summary");
  } catch (error) {
    console.error("[CivicGenomeExport] summary report failed", { source_bill_id, error });
    return res.status(500).json({ ok: false, error: "civic_genome_summary_report_failed" });
  }
});

civic_genome_export_router.get("/bill/:source_bill_id/detailed", async (req, res) => {
  const source_bill_id = positive_integer(req.params.source_bill_id);
  if (!source_bill_id) return res.status(400).json({ ok: false, error: "invalid_source_bill_id" });

  try {
    return await send_human_bill_report(res, source_bill_id, "detailed");
  } catch (error) {
    console.error("[CivicGenomeExport] detailed report failed", { source_bill_id, error });
    return res.status(500).json({ ok: false, error: "civic_genome_detailed_report_failed" });
  }
});

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
    const export_bills = bills.map(bill => ({
      source_bill_id: source_bill_id_from_bill(bill),
      ...bill,
    }));

    const payload = {
      export_type: "civic_genome_current_proof_export",
      export_contract: EXPORT_CONTRACT,
      exported_at: new Date().toISOString(),
      interpretation: "Each returned row is a Civic Genome bill record as currently stored. This export is read-only and does not replay historical failures or mutate any upstream owner.",
      total_bill_count: stats.total_bills,
      returned_bill_count: export_bills.length,
      offset,
      limit,
      max_limit: MULTI_EXPORT_LIMIT,
      bills: export_bills,
    };

    return send_json_attachment(res, `civic-genome-current-${offset}-${offset + export_bills.length}`, payload);
  } catch (error) {
    console.error("[CivicGenomeExport] current export failed", { limit, offset, error });
    return res.status(500).json({ ok: false, error: "civic_genome_current_export_failed" });
  }
});
