import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260812044452_fresh_corpus_atomic_record_substrate.sql", import.meta.url), "utf8");

describe("atomic run scope", () => {
  it("persists declared run scope with the run receipt", () => {
    expect(migration).toContain("scope jsonb not null default '{}'::jsonb");
    expect(migration).toContain("result_json jsonb not null default '{}'::jsonb");
  });
});
