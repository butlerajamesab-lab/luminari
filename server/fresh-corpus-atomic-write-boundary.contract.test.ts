import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic database write boundary", () => {
  it("only persists run/artifact/atomic/origin state", () => {
    const allowed = [
      "luminari_corpus_atomic_run_v1",
      "luminari_corpus_atomic_artifact_v1",
      "luminari_corpus_atomic_record_v1",
      "luminari_corpus_atomic_record_origin_v1",
    ];
    for (const name of allowed) expect(service).toContain(name);
    expect(service).not.toContain("state_enriched_directory_v3_13");
    expect(service).not.toContain("registry_programs");
  });
});
