import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  fileURLToPath(new URL("../client/src/pages/LegalLibrary.tsx", import.meta.url)),
  "utf8",
);

describe("Legal Library bounded page density", () => {
  it("uses a bounded page size instead of rendering 100 research records at once", () => {
    expect(page).toContain("const PAGE_SIZE = 25;");
    expect(page).not.toContain("const PAGE_SIZE = 100;");
  });

  it("preserves explicit pagination", () => {
    expect(page).toContain("Previous {pageSize}");
    expect(page).toContain("Next {pageSize}");
    expect(page).toContain("Showing {first.toLocaleString()}–{last.toLocaleString()}");
  });
});
