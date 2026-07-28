import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const router = read("./routers/admin-dashboard.ts");

describe("Mission Control structural signal category contract", () => {
  it("collapses only event-specific diagnostic suffixes without mutating source rows", () => {
    expect(router).toContain(
      "^(contradiction|inconsistency|missing_evidence)_[0-9]+$",
    );
    expect(router).toContain(
      "regexp_replace(COALESCE(signal_type, 'unknown'), '_[0-9]+$', '')",
    );
    expect(router).toContain("ELSE COALESCE(signal_type, 'unknown')");
    expect(router).toContain("GROUP BY ${NORMALIZED_SIGNAL_CATEGORY_SQL}");
    expect(router).toContain("${NORMALIZED_SIGNAL_CATEGORY_SQL} AS category");
    expect(router).not.toContain("UPDATE detected_signals");
    expect(router).not.toContain("DELETE FROM detected_signals");
  });

  it("uses the same normalized category for summary, critical rows, and drill-through", () => {
    const occurrences = router.match(/NORMALIZED_SIGNAL_CATEGORY_SQL/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(5);
    expect(router).toContain("criticalFindings");
    expect(router).toContain("findingsBySeverity");
  });
});
