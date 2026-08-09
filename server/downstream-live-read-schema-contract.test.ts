import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("downstream live-read schema contracts", () => {
  it("projects World Index rows from the current physical columns", () => {
    const world = source("server/services/world-index.ts");

    expect(world).toContain(
      "coalesce(nullif(jurisdiction_id, ''), jurisdiction_id_rp) as jurisdiction_id",
    );
    expect(world).not.toContain("category_rp");
    expect(world).not.toContain("name_rp");
    expect(world).not.toContain("agency_rp");
    expect(world).toContain("uuid,\n      issue_type,");
    expect(world).not.toContain("select id, escalation_name");
    expect(world).toContain("coalesce(step_order, step_number) as step_order");
    expect(world).not.toContain(
      "decision_logic, metadata, source_url, created_at",
    );
    expect(world).toContain("template_body,");
    expect(world).not.toContain("template_text, metadata, source_url");
  });

  it("keeps Dual Lens on the canonical Postgres pool and exact live fields", () => {
    const router = source("server/routers/dual-lens.ts");

    expect(router).toContain('from "../db-legacy"');
    expect(router).toContain("from public.agency_authority_map");
    expect(router).toContain("from public.doctrine_registry");
    expect(router).toContain(
      "from public.detected_signals where signal_id is not null",
    );
    expect(router).toContain("i.issue_score > 0");
    expect(router).not.toContain("mysql2/promise");
    expect(router).not.toContain("gateway04.us-east-1.prod.aws.tidbcloud.com");
    expect(router).not.toContain("SELECT * FROM graph_edges");
  });

  it("uses bounded live docket reads and an explicit absent-submission state", () => {
    const compat = source("server/docket-live-read-compat.ts");
    const router = source("server/routers/docket.ts");
    const client = source("client/src/pages/DocketRoom.tsx");
    const upload = source("server/docket-upload-route.ts");

    expect(compat).toContain("from public.docket_entries");
    expect(compat).toContain("id: string;");
    expect(compat).toContain("created_at: Date | string | null;");
    expect(compat).toContain("updated_at: Date | string | null;");
    expect(compat).toContain("timestamp_to_iso(row.created_at)");
    expect(compat).toContain("timestamp_to_iso(row.updated_at)");
    expect(compat).toContain("entry_type");
    expect(compat).toContain("introduced_date");
    expect(compat).toContain("limit ${limit} offset ${offset}");
    expect(compat).toContain("get_live_docket_entry(id: string)");
    expect(compat).toContain("where id = $1::uuid");
    expect(router).toContain("list_live_docket_entries");
    expect(router).toContain("get_live_docket_stats");
    expect(router).toContain("create_live_docket_entry");
    expect(router).toContain("update_live_docket_entry");
    expect(router).toContain("delete_live_docket_entry");
    expect(router).not.toContain("docket_db");
    expect(router).toContain("const liveDocketEntryId = z.string().uuid()");
    expect(router).toMatch(/getById:[\s\S]*?id: liveDocketEntryId/);
    expect(router).toMatch(/getFullAnalysis:[\s\S]*?id: liveDocketEntryId/);
    expect(router).toMatch(/actors:[\s\S]*?list:[\s\S]*?\.query\(async \(\) => \[\]\)/);
    expect(router).toMatch(/impacts:[\s\S]*?list:[\s\S]*?\.query\(async \(\) => \[\]\)/);
    expect(router).toMatch(/sources:[\s\S]*?list:[\s\S]*?\.query\(async \(\) => \[\]\)/);
    expect(router).toMatch(/mine:[\s\S]*?\.query\(async \(\) => \[\]\)/);
    expect(client).toContain("onSelect: (id: string) => void");
    expect(client).toContain("entries.map((entry) =>");
    expect(client).not.toContain("entries.map((entry: any) =>");
    expect(client).toContain("id: string; onBack: () => void");
    expect(client).toContain("useState<string | null>(null)");
    expect(router).toContain("docket_submissions_table_not_established");
    expect(router).toContain("availability: publicProcedure.query");
    expect(router).toContain('code: "PRECONDITION_FAILED"');
    expect(client).toContain("submissions.availability");
    expect(client).toContain("availability?.canSubmit !== true");
    expect(client).toContain("disabled={!submissionReady}");
    expect(client).toContain("Submission Intake Unavailable");
    expect(client).toContain(
      "Actor-ledger storage is not established for this registry.",
    );
    expect(client).toContain(
      "Impact-grid storage is not established for this registry.",
    );
    expect(client).toContain(
      "Source-ledger storage is not established for this registry.",
    );
    expect(client).not.toContain(
      'toast.success("Submission received. We\'ll review and analyze it.")',
    );
    expect(upload).toContain("docket_submissions_table_not_established");
    expect(upload).not.toContain("storagePut");
    expect(upload).not.toContain("multer");
  });

  it("reads and writes spotlight items through their live snake-case contract", () => {
    const compat = source("server/lighthouse-community-live-compat.ts");
    const router = source("server/routers/lighthouse.ts");

    expect(compat).toContain('sort_order as "sortOrder"');
    expect(compat).toContain('start_date as "startDate"');
    expect(compat).toContain("active = 1");
    expect(compat).toContain("insert into public.lighthouse_spotlight");
    expect(compat).toContain("update public.lighthouse_spotlight");
    expect(compat).toContain("delete from public.lighthouse_spotlight");
    expect(router).toContain("list_live_spotlight_items");
    expect(router).toContain("create_live_spotlight_item");
    expect(router).toContain("update_live_spotlight_item");
    expect(router).toContain("delete_live_spotlight_item");
  });
});
