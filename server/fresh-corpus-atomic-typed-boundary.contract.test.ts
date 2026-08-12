import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const atomic = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic to typed boundary", () => {
  it("does not write fresh typed candidate rows during atomic extraction", () => {
    expect(atomic).not.toContain("insert into public.luminari_corpus_candidate_v1");
  });
});
