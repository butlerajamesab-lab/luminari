import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "rosetta-owner/migrations/20260826083000_terminal_rejection_repairs_and_oldest_docket_backlog_v1.sql",
  ),
  "utf8",
);

describe("Rosetta terminal rejection and Docket backlog contract", () => {
  it("leaves both active 2.5.11 parser definitions outside the hotfix", () => {
    expect(migration).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.run_rosetta_v3_extraction_v2511/i,
    );
    expect(migration).not.toMatch(/update\s+public\.extraction_run/i);
    expect(migration).not.toMatch(/update\s+public\.extraction_manifest/i);
  });

  it("projects both terminal branches through one idempotent operator repair", () => {
    expect(migration).toContain("rosetta_v2511_post_base_failure");
    expect(migration).toContain("rosetta_v2511_final_validation_failed");
    expect(migration).toContain("'terminal_extraction_rejection'");
    expect(migration).toContain("on conflict (object_type, object_id, defect_type)");
    expect(migration).toContain("'failed_invariants', failed.invariants");
    expect(migration).toContain("'validation_receipts', manifest.validation_results");
    expect(migration).toContain("rosetta_classify_terminal_rejections_v1");
  });

  it("keeps historical repair work bounded and resumable", () => {
    expect(migration).toContain("rosetta_classify_terminal_rejections_v1");
    expect(migration).toContain("with candidate as materialized");
    expect(migration).toContain("limit greatest(1, least(coalesce(p_limit, 100), 250))");
    expect(migration).toContain("get diagnostics v_inserted = row_count");
  });

  it("returns only exact contentless Docket identities in deterministic oldest-first order", () => {
    expect(migration).toContain("rosetta_unbound_docket_source_documents_v1");
    expect(migration).toContain("document.document_identifier like 'docket:%'");
    expect(migration).toContain("cardinality(string_to_array(document.document_identifier, ':')) = 5");
    expect(migration).toContain("split_part(document.document_identifier, ':', 4)");
    expect(migration).toContain("from public.source_document_content content");
    expect(migration).toContain("content.source_document_id = document.id");
    expect(migration).toContain("order by document.created_at asc nulls first");
    expect(migration).toContain("document.id asc");
  });

  it("pins every definer path and exposes only the read selector to service_role", () => {
    expect(migration.match(/security definer/g)?.length).toBe(2);
    expect(migration.match(/set search_path = pg_catalog, public/g)?.length).toBe(2);
    expect(migration).toContain(
      "grant execute on function public.rosetta_unbound_docket_source_documents_v1(integer)",
    );
    expect(migration).toContain(
      "grant execute on function public.rosetta_classify_terminal_rejections_v1(integer)",
    );
  });
});
