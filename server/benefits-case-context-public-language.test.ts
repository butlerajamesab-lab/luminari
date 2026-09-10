import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  fileURLToPath(new URL("../client/src/pages/BenefitsNavigator.tsx", import.meta.url)),
  "utf8",
);

const stagedActions = page.slice(
  page.indexOf("function StagedCaseActions"),
  page.indexOf("/* ─── Main Benefits Navigator Page"),
);

describe("Benefits Navigator case-context language", () => {
  it("does not expose internal bridge codes to the person using Lighthouse", () => {
    expect(stagedActions).not.toContain("CASE_CONTEXT_BRIDGE_MISSING");
  });

  it("explains the missing case context as a user action", () => {
    expect(stagedActions).toContain(
      "Choose or start a case before using Save to Case or Link to Current Case.",
    );
  });
});
