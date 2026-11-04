import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Canonical Docket archive-source automatic enqueue admission", () => {
  const sql = readFileSync(
    "supabase/proposals/20261103_docket_archive_source_aware_queue_admission.proposal.sql",
    "utf8",
  );
  const worker = readFileSync("server/docket-jurisdiction-activation-queue-worker.ts", "utf8");

  it("retains the installed trigger function and the API-owned source route", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.enqueue_docket_current_authoritative_version_v1()");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("from public.docket_current_authoritative_source_v1 authority");
    expect(sql).toContain("insert into public.civic_genome_legislative_version_queue (");
    expect(sql).toContain("on conflict (bill_version_id) do update");
    expect(sql).not.toMatch(/disable trigger|drop trigger|drop function/i);
  });

  it("checks archive source before enqueue without changing canonical worker registration", () => {
    expect(sql).toContain("detail.bill_id = new.source_bill_id");
    expect(sql).toContain("detail.source = 'legiscan_bulk_json'");
    expect(sql.indexOf("detail.source = 'legiscan_bulk_json'"))
      .toBeLessThan(sql.indexOf("insert into public.civic_genome_legislative_version_queue ("));
    expect(worker).toContain("register_docket_legislative_version_spine($1::integer, false)");
    expect(worker).toContain("activation.source = 'legiscan_bulk_json'");
  });
});
