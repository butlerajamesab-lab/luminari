import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260812044452_fresh_corpus_atomic_record_substrate.sql", import.meta.url), "utf8");

describe("atomic indexes", () => {
  it("indexes source/relation and run/artifact provenance paths", () => {
    expect(migration).toContain("luminari_corpus_atomic_record_source_idx");
    expect(migration).toContain("luminari_corpus_atomic_record_relation_idx");
    expect(migration).toContain("luminari_corpus_atomic_origin_run_idx");
  });
});
