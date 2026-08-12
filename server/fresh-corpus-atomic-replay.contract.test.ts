import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic replay", () => {
  it("uses content-addressed atomic keys and conflict-safe inserts", () => {
    expect(service).toContain("atomic_record_key");
    expect(service).toContain("on conflict(atomic_record_key) do nothing");
    expect(service).toContain("on conflict(atomic_record_key,origin_hash) do nothing");
  });
});
