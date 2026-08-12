import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic semantic boundary", () => {
  it("writes only atomic corpus tables", () => {
    expect(service).toContain("luminari_corpus_atomic_record_v1");
    expect(service).toContain("luminari_corpus_atomic_record_origin_v1");
    expect(service).not.toContain("insert into public.luminari_resource_entities");
    expect(service).not.toContain("insert into public.legal_statutes");
    expect(service).not.toContain("insert into public.live_data_signals");
  });
});
