import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("legal universe is open-ended", () => {
  it("treats seeded doctrine rows as anchors rather than ontology ceilings", () => {
    const contract = read("docs/UNBOUNDED_DISCOVERY_CONTRACT.md");
    expect(contract).toContain("curated anchors, not ceilings");
    expect(contract).toContain("New source-supported doctrines");
    expect(contract).toContain("unresolved/held");
  });

  it("keeps legal authority discovery paged but complete", () => {
    const router = read("server/routers/canonical-core-router.ts");
    expect(router).toContain("complete filtered universe");
    expect(router).toContain("legalAuthorities");
    expect(router).toContain("filtered_total");
    expect(router).toContain("window_only: true");
  });
});
