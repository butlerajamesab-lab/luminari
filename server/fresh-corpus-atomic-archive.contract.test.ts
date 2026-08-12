import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic archive handling", () => {
  it("parses supported ZIP members and retains member provenance", () => {
    expect(service).toContain("SUPPORTED_ARCHIVE_MEMBER_EXTENSIONS");
    expect(service).toContain("container_member_path");
    expect(service).toContain('extension(artifact.object_name) !== ".zip"');
    expect(service).toContain('entry.async("nodebuffer")');
  });
});
