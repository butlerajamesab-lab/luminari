import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic queue", () => {
  it("exposes explicit queue creation separately from startup resume", () => {
    expect(service).toContain("export async function queueFreshAtomicCorpusPass");
    expect(service).toContain("status in ('queued','running')");
  });
});
