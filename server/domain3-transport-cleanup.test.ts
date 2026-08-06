import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260806060000_domain3_transport_cleanup.sql",
  ),
  "utf8",
);

describe("Domain 3 transport cleanup", () => {
  it("removes anonymous access from the superseded PostgREST wrapper", () => {
    expect(migration).toMatch(
      /revoke all on function public\.register_live_data_signal_transport_receipt_v2\(jsonb, text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.register_live_data_signal_transport_receipt_v2\(jsonb, text\)[\s\S]*to service_role/i,
    );
  });

  it("drops only the temporary transport probe", () => {
    expect(migration).toContain(
      "drop function if exists public.signal_bridge_transport_probe_v1(text)",
    );
    expect(migration).not.toMatch(/drop\s+function\s+.*register_live_data_signal/i);
    expect(migration).not.toMatch(/drop\s+table/i);
    expect(migration).not.toMatch(/truncate/i);
    expect(migration).not.toMatch(/delete\s+from/i);
  });

  it("keeps canonical registration and the direct route contract intact", () => {
    expect(migration).toContain("Retained service-role-only compatibility wrapper");
    expect(migration).toContain("direct PostgreSQL canonical receipt boundary");
    expect(migration).not.toContain("detected_signals");
    expect(migration).not.toContain("live_signals");
    expect(migration).not.toContain("signal_convergences");
  });

  it("requests PostgREST schema reload after removing the diagnostic", () => {
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
