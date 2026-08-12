import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic row count reporting", () => {
  it("records generated rows per artifact and deduped records per run", () => {
    expect(service).toContain("atomic_record_count=$4");
    expect(service).toContain("count(distinct o.atomic_record_key)::int as atomic_records");
  });
});
