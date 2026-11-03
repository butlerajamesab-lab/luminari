import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const ddl = readFileSync(
  "supabase/proposals/20261102_docket_legiscan_bulk_receipts.proposal.sql", "utf8",
).toLowerCase();
describe("LegiScan source receipts remain non-public, write-bounded and proposal-only", () => {
  it("enables RLS on exposed public schema", () => {
    expect(ddl).toContain("enable row level security");
  });
  it("revokes public clients and grants only service-role append/read", () => {
    expect(ddl).toContain("from public, anon, authenticated");
    expect(ddl).toContain("grant select, insert on public.docket_legiscan_bulk_member_receipt to service_role");
    expect(ddl).not.toContain("grant update");
    expect(ddl).not.toContain("grant delete");
  });
  it("keeps source member uniqueness and original SHA constraints", () => {
    expect(ddl).toContain("primary key (archive_sha256,member_path)");
    expect(ddl).toContain("member_sha256 text not null");
    expect(ddl).toContain("bill_id=provider_record_id");
  });
});
