import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("shared case live-schema compatibility", () => {
  it("uses exact live columns instead of drifted legacy finding and event aliases", () => {
    const source = read("server/shared-case-runtime-compat.ts");

    expect(source).toContain("finding_evidentiary_weight");
    expect(source).toContain("event_date");
    expect(source).toContain("case_id::text = $1::text");
    expect(source).toContain("quote_text");
    expect(source).not.toContain("findings.evidentiaryWeight");
    expect(source).not.toContain("events.dateOccurred");
  });

  it("overrides the legacy helper at the database facade", () => {
    const facade = read("server/db.ts");
    expect(facade).toContain('export { getSharedCaseData } from "./shared-case-runtime-compat"');
  });
});
