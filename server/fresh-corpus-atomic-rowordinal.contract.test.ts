import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260812044452_fresh_corpus_atomic_record_substrate.sql", import.meta.url), "utf8");

describe("atomic row ordinals", () => {
  it("stores a nonnegative ordinal for each source unit", () => {
    expect(migration).toContain("row_ordinal integer not null check (row_ordinal >= 0)");
  });
});
