import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const router = read("./routers/admin-dashboard.ts");
const canonical_signals = read("./canonical-live-signal-queries.ts");

describe("Mission Control structural signal category contract", () => {
  it("collapses only event-specific diagnostic suffixes without mutating source rows", () => {
    expect(canonical_signals).toContain(
      "^(contradiction|inconsistency|missing_evidence)_[0-9]+$",
    );
    expect(canonical_signals).toContain('signal_type.replace(/_[0-9]+$/, "")');
    expect(canonical_signals).toContain("return signal_type");
    expect(canonical_signals).not.toContain("UPDATE live_data_signals");
    expect(canonical_signals).not.toContain("DELETE FROM live_data_signals");
  });

  it("uses the same normalized category for summary, critical rows, and drill-through", () => {
    expect(canonical_signals).toContain(
      "category: normalize_canonical_live_signal_category(signal_type)",
    );
    expect(canonical_signals).toContain("by_category[signal.category]");
    expect(router).toContain("Object.entries(summary.by_category)");
    expect(router.match(/category: signal\.category/g)).toHaveLength(2);
    expect(router).toContain("criticalFindings");
    expect(router).toContain("findingsBySeverity");
  });
});
