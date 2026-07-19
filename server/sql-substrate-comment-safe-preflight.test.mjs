import { describe, expect, it } from "vitest";
import {
  extract_sql_write_targets,
  strip_sql_noncode,
} from "../scripts/apply-sql-substrate-corpus-queue.mjs";

describe("SQL substrate static-analysis sanitizer", () => {
  it("ignores write-like phrases in comments", () => {
    const sql = `
      -- this update allows pending rows and insert into nonsense
      /* copy of staging data; merge into fake_table */
      insert into public.state_enriched_directory_v3_13 (id) values (1);
      update public.domain_deep_dive_records_v3_13 set id = id;
    `;

    expect(extract_sql_write_targets(sql)).toEqual([
      "domain_deep_dive_records_v3_13",
      "state_enriched_directory_v3_13",
    ]);
  });

  it("ignores write-like phrases inside string and dollar-quoted literals", () => {
    const sql = `
      insert into public.ingest_staging_v3_13 values
        ('this update pending and copy of fake_table'),
        ($$merge into another_fake_table and update of pending$$);
    `;

    expect(strip_sql_noncode(sql)).toContain("insert into public.ingest_staging_v3_13");
    expect(extract_sql_write_targets(sql)).toEqual(["ingest_staging_v3_13"]);
  });
});
