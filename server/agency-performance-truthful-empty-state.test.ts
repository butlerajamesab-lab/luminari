import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  fileURLToPath(new URL("../client/src/pages/AgencyMetrics.tsx", import.meta.url)),
  "utf8",
);

describe("Agency Performance truth boundary", () => {
  it("keeps World Index inventory explicitly separate from performance evidence", () => {
    expect(page).toContain("Performance metrics are not loaded for this surface.");
    expect(page).toContain("Agency / Oversight Directory — reference only");
    expect(page).toContain("It is not performance evidence");
  });

  it("preserves the real performance dashboard when metric rows exist", () => {
    expect(page).toContain("trpc.agencyMetrics.getAll.useQuery");
    expect(page).toContain("Statutory Deadline Compliance");
    expect(page).toContain("Identified Weak Joints");
  });

  it("does not label the reference directory as tracked performance", () => {
    expect(page).not.toContain("Oversight Bodies from World Index");
  });
});
