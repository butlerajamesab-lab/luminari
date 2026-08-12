import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const atomic = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");
const directory = readFileSync(new URL("./services/resource-directory-fresh-snapshot.ts", import.meta.url), "utf8");

describe("atomic/publication separation", () => {
  it("does not wire the Resource Directory directly to atomic rows", () => {
    expect(directory).not.toContain("luminari_corpus_atomic_record_v1");
    expect(atomic).not.toContain("luminari_resource_snapshot_identity_v1");
  });
});
