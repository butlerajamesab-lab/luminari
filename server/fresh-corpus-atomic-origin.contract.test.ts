import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic origins", () => {
  it("keeps artifact and archive-member locators for every source occurrence", () => {
    expect(service).toContain("artifact_key");
    expect(service).toContain("container_member_path");
    expect(service).toContain("source_locator");
    expect(service).toContain("origin_hash");
  });
});
