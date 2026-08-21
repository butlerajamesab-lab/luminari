import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  fileURLToPath(new URL("../client/src/pages/ActionPath.tsx", import.meta.url)),
  "utf8",
);

describe("case next-steps source-bound UI", () => {
  it("keeps reviewed enforcement routes and support recommendations as the visible action surface", () => {
    expect(page).toContain("CaseEnforcementNextSteps");
    expect(page).toContain("CaseSupportRecommendations");
    expect(page).toContain("reviewed routes that match this case");
  });

  it("does not layer the legacy generic action generator underneath governed routes", () => {
    expect(page).not.toContain("trpc.intake.generateActionPath");
    expect(page).not.toContain("Generate My Action Path");
    expect(page).not.toContain("Regenerate");
    expect(page).not.toContain("ActionPathResult");
  });
});
