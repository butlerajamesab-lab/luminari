import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260812044452_fresh_corpus_atomic_record_substrate.sql", import.meta.url), "utf8");

describe("atomic direct access", () => {
  it("revokes all atomic staging tables from public/anon/authenticated", () => {
    expect((migration.match(/revoke all on public\.luminari_corpus_atomic_/g) ?? []).length).toBe(4);
  });
});
