import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260812044452_fresh_corpus_atomic_record_substrate.sql", import.meta.url), "utf8");

describe("atomic source hashes", () => {
  it("requires SHA-256 source and record hashes", () => {
    expect(migration).toContain("source_file_sha256 text not null check (source_file_sha256 ~ '^[0-9a-f]{64}$')");
    expect(migration).toContain("record_hash text not null check (record_hash ~ '^[0-9a-f]{64}$')");
  });
});
