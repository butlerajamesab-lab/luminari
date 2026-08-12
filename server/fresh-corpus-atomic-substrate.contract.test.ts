import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260812044452_fresh_corpus_atomic_record_substrate.sql", import.meta.url), "utf8");
const contract = readFileSync(new URL("../docs/FRESH_ATOMIC_CORPUS_CONTRACT.md", import.meta.url), "utf8");

describe("fresh atomic corpus substrate", () => {
  it("keeps atomic rows separate from typed/canonical/public layers", () => {
    expect(contract).toContain("storage artifact != atomic source record != typed candidate != deduped identity != public projection");
    expect(migration).toContain("not a canonical resource, legal conclusion, signal, or finding");
  });

  it("retains record hashes and append-only provenance origins", () => {
    expect(migration).toContain("source_file_sha256");
    expect(migration).toContain("record_hash");
    expect(migration).toContain("container_member_path");
    expect(migration).toContain("source_locator");
    expect(migration).toContain("origin_hash");
  });

  it("does not expose corpus staging tables directly to public roles", () => {
    for (const table of [
      "luminari_corpus_atomic_run_v1",
      "luminari_corpus_atomic_artifact_v1",
      "luminari_corpus_atomic_record_v1",
      "luminari_corpus_atomic_record_origin_v1",
    ]) expect(migration).toContain(`revoke all on public.${table} from public,anon,authenticated`);
  });
});
