import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260812044452_fresh_corpus_atomic_record_substrate.sql", import.meta.url), "utf8");

describe("atomic schema semantics", () => {
  it("stores structured values separately from bounded excerpts", () => {
    expect(migration).toContain("values_json jsonb not null");
    expect(migration).toContain("raw_excerpt text");
  });
});
