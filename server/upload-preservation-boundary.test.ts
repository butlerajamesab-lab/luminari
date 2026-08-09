import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uploadPage = readFileSync("client/src/pages/Upload.tsx", "utf8");

describe("evidence upload preservation boundary", () => {
  it("registers exact source bytes without automatically invoking analysis or claiming preservation", () => {
    expect(uploadPage).not.toContain("trpc.documents.analyzeAll.useMutation");
    expect(uploadPage).not.toContain("await analyzeAll.mutateAsync");
    expect(uploadPage).not.toContain("Upload preserved");
    expect(uploadPage).toContain("Upload registers exact source bytes");
    expect(uploadPage).toContain("governed preservation verification and reconstruction run only when explicitly started");
  });
});
