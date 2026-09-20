import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../client/src/pages/ControlRoom.tsx", import.meta.url), "utf8");

describe("Control Room completed-zero truth", () => {
  it("does not tell users to rerun an already sealed Intake Spine when governed outputs are empty", () => {
    expect(source).not.toContain("Run the Universal Intake Spine");
    expect(source).toContain("Intake Spine completed with no governed action paths.");
    expect(source).toContain("The current routing rules produced a completed-zero result.");
    expect(source).toContain("Intake Spine completed with no governed next actions.");
    expect(source).toContain("Layers 10 and 11 completed with no structural signals.");
    expect(source).toContain("not an instruction to rerun the same evidence");
  });
});
