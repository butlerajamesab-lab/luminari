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

  it("normalizes PostgreSQL execute results before reading escalation rows", () => {
    const router = read("server/routers/signal-governance.ts");
    const service = read("server/signal-governance.ts");

    for (const source of [router, service]) {
      expect(source).toContain(
        "const nativeRows = (result as { rows?: unknown })?.rows",
      );
      expect(source).toContain("if (Array.isArray(nativeRows)) return nativeRows");
      expect(source).toContain("rowsFromExecuteResult(result)");
    }

    const escalationSummary = service.slice(
      service.indexOf("export async function getEscalationSummary"),
      service.indexOf("function parseDetectedSignal"),
    );
    expect(escalationSummary).toContain(
      "const [countRow] = rowsFromExecuteResult(result)",
    );
    expect(escalationSummary).toContain(
      "signalCount: Number(countRow?.cnt ?? 0)",
    );
    expect(escalationSummary).not.toContain("(rows as any)[0]");
  });
});
