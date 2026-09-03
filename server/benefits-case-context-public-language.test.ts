import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  fileURLToPath(new URL("../client/src/pages/BenefitsNavigator.tsx", import.meta.url)),
  "utf8",
);

describe("Benefits Navigator case-context language", () => {
  it("does not expose internal bridge codes to the person using Lighthouse", () => {
    expect(page).not.toContain("CASE_CONTEXT_BRIDGE_MISSING");
  });

  it("explains the missing case context as a user action", () => {
    expect(page).toMatch(/choose|start/i);
    expect(page).toMatch(/case/i);
    expect(page).toMatch(/save/i);
  });
});
