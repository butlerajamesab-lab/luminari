import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uploadPage = readFileSync("client/src/pages/Upload.tsx", "utf8");

describe("evidence upload preservation boundary", () => {
  it("does not automatically invoke the legacy document-analysis pipeline after preservation", () => {
    expect(uploadPage).not.toContain("trpc.documents.analyzeAll.useMutation");
    expect(uploadPage).not.toContain("await analyzeAll.mutateAsync");
    expect(uploadPage).toContain("Upload preserved. Run Analysis when you're ready");
  });
});
