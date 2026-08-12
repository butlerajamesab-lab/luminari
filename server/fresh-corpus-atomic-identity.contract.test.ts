import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic identity separation", () => {
  it("does not write fresh dedupe identity tables during source extraction", () => {
    expect(service).not.toContain("luminari_corpus_identity_v1");
    expect(service).not.toContain("luminari_corpus_resource_identity_v1");
  });
});
