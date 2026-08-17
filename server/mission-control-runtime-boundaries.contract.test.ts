import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Mission Control runtime data boundaries", () => {
  it("uses the timestamptz cutoff only for governed verification records", () => {
    const source = read("server/routers/admin-dashboard.ts");
    const caseActivity = source.slice(
      source.indexOf("caseActivity: publicProcedure"),
      source.indexOf("structuralSignals: publicProcedure"),
    );

    expect(caseActivity).toContain("const oneDayAgo = oneDayAgoMillis()");
    expect(caseActivity).toContain("const oneDayAgoTimestamp = oneDayAgoIso()");
    expect(caseActivity).toContain(
      "intake_verification_records WHERE created_at >= $1",
    );
    expect(caseActivity).toContain("[oneDayAgoTimestamp]");
    expect(caseActivity).toContain(
      "cases WHERE created_at >= $1`, [oneDayAgo]",
    );
    expect(caseActivity).toContain(
      "documents WHERE created_at >= $1`, [oneDayAgo]",
    );
    expect(caseActivity).toContain(
      "users WHERE created_at >= $1`, [oneDayAgo]",
    );
  });

  it("reads escalation thresholds through their physical snake_case columns", () => {
    for (const path of [
      "server/routers/signal-governance.ts",
      "server/signal-governance.ts",
    ]) {
      const source = read(path);

      expect(source).toContain(
        "SELECT * FROM escalation_thresholds ORDER BY min_score DESC",
      );
      expect(source).toContain("tierName: r.tier_name");
      expect(source).toContain("minScore: r.min_score");
      expect(source).toContain("maxScore: r.max_score");
      expect(source).toContain("r.notify_roles");
      expect(source).toContain("Boolean(r.auto_escalate)");
      expect(source).not.toContain(
        "SELECT * FROM escalation_thresholds ORDER BY minScore DESC",
      );
    }
  });
});
