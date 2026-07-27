import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readSibling(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("live-intake PostgreSQL persistence contract", () => {
  const socrataSource = readSibling("../socrata-adapter.ts");
  const cfpbSource = readSibling("../cfpb-adapter.ts");

  it("uses PostgreSQL RETURNING for ingest-run identities", () => {
    expect(socrataSource).toContain(".returning({ id: ingestRuns.id })");
    expect(cfpbSource).toContain(".returning({ id: ingestRuns.id })");
    expect(socrataSource).not.toContain("$returningId");
    expect(cfpbSource).not.toContain("$returningId");
  });

  it("writes through the verified live ingested_records contract", () => {
    expect(socrataSource).toContain("UPDATE public.ingested_records");
    expect(socrataSource).toContain("INSERT INTO public.ingested_records");
    expect(socrataSource).toContain("dataset_id_ir");
    expect(socrataSource).toContain("source_record_id");
    expect(socrataSource).toContain("raw_json");
    expect(socrataSource).toContain("processed_for_signals");
  });

  it("serializes logical identities without destructive deduplication", () => {
    expect(socrataSource).toContain("pg_advisory_lock");
    expect(socrataSource).toContain("pg_advisory_unlock");
    expect(socrataSource).not.toContain("DELETE FROM public.ingested_records");
    expect(socrataSource).not.toContain("TRUNCATE");
  });

  it("contains no MySQL-only persistence calls", () => {
    expect(socrataSource).not.toContain(".onDuplicateKeyUpdate");
    expect(socrataSource).not.toContain("VALUES(rawJson)");
  });
});
