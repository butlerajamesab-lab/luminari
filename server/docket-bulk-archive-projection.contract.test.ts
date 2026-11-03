import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("LegiScan ZIP transport enters the canonical Docket activation engine", () => {
  const runner = readFileSync("scripts/legiscan-bulk-docket-intake.ts", "utf8");
  const acceptance = readFileSync("server/docket-bill-detail-acceptance.ts", "utf8");
  const worker = readFileSync("server/docket-jurisdiction-activation-queue-worker.ts", "utf8");
  const projector = readFileSync("server/civic-genome-projection.ts", "utf8");

  it("atomically seeds existing Docket activation from a receipt-bearing archive bill", () => {
    expect(acceptance).toContain("register_docket_jurisdiction_activation(");
    expect(acceptance).toContain("'legiscan_bulk_json'::text");
    expect(acceptance).toContain("from inserted");
    expect(acceptance).toContain("on conflict (bill_id) do nothing returning bill_id, fetched_at");
    expect(acceptance).toContain("as activation_id");
  });

  it("does not bypass the activated worker by directly running the Genome or version spine", () => {
    expect(runner).not.toContain("project_docket_bulk_bill_to_civic_genome");
    expect(runner).not.toContain("register_docket_legislative_version_spine");
    expect(runner).toContain("docket_bulk_canonical_activation_missing_bill_id_");
    expect(worker).toContain("read_docket_archive_detail");
    expect(worker).toContain("register_legislative_versions(job.source_bill_id)");
  });

  it("uses the same existing deterministic projector for both transports", () => {
    expect(projector).toContain("export async function project_docket_bulk_bill_to_civic_genome");
    expect(projector).toContain("return project_bill(row, master, 0)");
    expect(worker).toContain("project_docket_state_cache_to_civic_genome_serialized");
    expect(worker).toContain("await project_docket_bulk_bill_to_civic_genome");
    expect(projector).toContain("docket_bulk_projection_missing_source_event_date");
  });

  it("keeps current live master-list scope separate from historical ZIP activation", () => {
    expect(worker).toContain("left join public.docket_bill_state_cache cache");
    expect(worker).toContain("activation.source = 'legiscan_bulk_json'");
    expect(worker).toContain("detail.fetched_at = activation.cache_fetched_at");
    expect(worker).toContain("detail.source = 'legiscan_bulk_json'");
    expect(worker).toContain("receipt.disposition = 'inserted'");
    expect(worker).toContain("const bill = await get_bill(job.source_bill_id)");
    expect(worker).toContain('job.activation_source === "legiscan_bulk_json"');
    expect(runner).not.toContain("get_bill(");
    expect(runner).not.toContain("rosetta");
  });

  it("preserves explicit source-only registration boundary until independent publication admission", () => {
    expect(worker).toContain("register_docket_legislative_version_spine($1::integer, false)");
    expect(worker).not.toContain("register_docket_legislative_version_spine($1::integer, true)");
  });
});
