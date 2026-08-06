import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260806051000_live_data_signal_transport_receipt_row.sql",
  ),
  "utf8",
);

describe("Domain 3 transport receipt row", () => {
  it("delegates canonical registration rather than writing another signal path", () => {
    expect(migration).toContain("register_live_data_signal_receipt_v1(p_record)");
    expect(migration).not.toMatch(/insert\s+into\s+public\.live_data_signals/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.detected_signals/i);
    expect(migration).not.toMatch(/insert\s+into\s+public\.live_signals\b/i);
  });

  it("returns an explicit PostgREST result row", () => {
    expect(migration).toContain("returns table (");
    expect(migration).toContain("live_data_signal_id uuid");
    expect(migration).toContain("signal_hash text");
    expect(migration).toContain("governance_status text");
    expect(migration).toContain("registered_at timestamptz");
    expect(migration).toContain("return query");
  });

  it("fails closed on an incomplete delegated receipt", () => {
    expect(migration).toContain("live_data_signal_transport_receipt_incomplete");
    expect(migration).toContain("nullif(v_receipt->>'live_data_signal_id', '') is null");
    expect(migration).toContain("nullif(v_receipt->>'signal_hash', '') is null");
  });

  it("is service-role-only and requests a PostgREST schema reload", () => {
    expect(migration).toMatch(
      /revoke all on function public\.register_live_data_signal_transport_receipt_v1\(jsonb\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.register_live_data_signal_transport_receipt_v1\(jsonb\)[\s\S]*to service_role/i,
    );
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
