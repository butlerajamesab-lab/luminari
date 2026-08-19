import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("case Control Room truth boundary", () => {
  it("keeps case Deadlines limited to governed Layer 14 candidates", () => {
    const source = read("client/src/pages/ControlRoom.tsx");

    expect(source).toContain("trpc.analyze.getIntakeActionPathProjection.useQuery");
    expect(source).toContain("deadline_candidates");
    expect(source).toContain("Layer 14 candidates");
    expect(source).not.toContain("LegistarEventsWidget");
    expect(source).not.toContain("trpc.docket.legistarEvents");
    expect(source).not.toContain("Seattle Council — Recent Meetings");
  });
});
