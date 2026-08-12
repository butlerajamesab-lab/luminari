import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260812044452_fresh_corpus_atomic_record_substrate.sql", import.meta.url), "utf8");

describe("atomic run status", () => {
  it("has bounded terminal and nonterminal states", () => {
    expect(migration).toContain("'queued','running','completed','completed_with_failures','failed'");
  });
});
