import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("LegiScan archive credit and publication boundaries", () => {
  const route = readFileSync("server/routes/docket.ts", "utf8");
  const service = readFileSync("server/docket-bill-detail-acceptance.ts", "utf8");
  const runner = readFileSync("scripts/legiscan-bulk-docket-intake.ts", "utf8");
  it("does not re-fetch archive bill snapshots through paid getBill after 24h", () => {
    const guard = route.indexOf('cached && cached.source === "legiscan_bulk_json"');
    const getbill = route.indexOf("const bill = await get_bill(bill_id);", guard);
    expect(guard).toBeGreaterThan(0);
    expect(getbill).toBeGreaterThan(guard);
    expect(route.slice(guard, getbill)).toContain('refresh_state: "archive_snapshot"');
  });
  it("never overwrites canonical live cache with bulk snapshots", () => {
    expect(service).toContain("on conflict (bill_id) do nothing returning bill_id");
    expect(service).toContain("docket_bulk_existing_bill_identity_conflict");
  });
  it("requires explicit source-manifest approval before apply", () => {
    expect(runner).toContain("DOCKET_BULK_ARCHIVE_APPLY_APPROVED_SHA256");
    expect(runner).toContain("--acknowledge-docket-triggers");
    expect(runner).toContain("checkCRC32: true");
  });
  it("never invokes a LegiScan endpoint or Rosetta from the bulk reader", () => {
    expect(runner).not.toContain("get_bill(");
    expect(runner).not.toContain("get_bill_text(");
    expect(runner).not.toContain("get_amendment(");
    expect(runner).not.toContain("rosetta");
  });
});
