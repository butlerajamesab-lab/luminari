import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("atomic migration ledger", () => {
  it("records the exact production migration version", () => {
    const migration = readFileSync(new URL("../supabase/migrations/20260812044452_fresh_corpus_atomic_record_substrate.sql", import.meta.url), "utf8");
    const marker = readFileSync(new URL("../supabase/verification/atomic_corpus_substrate_marker.txt", import.meta.url), "utf8");
    expect(migration).toContain("luminari_corpus_atomic_record_v1");
    expect(marker.trim()).toBe("20260812044452 fresh_corpus_atomic_record_substrate");
  });
});
