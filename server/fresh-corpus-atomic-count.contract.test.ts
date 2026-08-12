import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic count semantics", () => {
  it("reports deduplicated atomic records and source origins separately", () => {
    expect(service).toContain("count(distinct o.atomic_record_key)::int as atomic_records");
    expect(service).toContain("count(*)::int as origins");
    expect(service).toContain("atomic_record_count");
    expect(service).toContain("origin_count");
  });
});
