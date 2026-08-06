import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260806052000_atlas_domain3_scoped_bridge_token.sql",
  ),
  "utf8",
);

describe("Atlas Domain 3 scoped bridge token", () => {
  it("stores only the token hash in a private registry", () => {
    expect(migration).toContain("private.signal_bridge_token");
    expect(migration).toContain("token_hash text not null");
    expect(migration).toContain("live_data_signal_write");
    expect(migration).toContain("extensions.digest");
    expect(migration).not.toContain("sLaqVvylvMyctybqokeDrP8j1yb42o2Mkkjh08bazaENlMiKtURCK_YHkeLuP5Ju");
  });

  it("validates the exact scoped token before canonical registration", () => {
    expect(migration).toContain("require_signal_bridge_token_v1");
    expect(migration).toContain("signal_bridge_authentication_failed");
    expect(migration).toContain("register_live_data_signal_transport_receipt_v1(p_record)");
    expect(migration).not.toMatch(/insert\s+into\s+public\.live_data_signals/i);
  });

  it("allows only the token-gated wrapper through the anonymous gateway role", () => {
    expect(migration).toMatch(
      /revoke all on function public\.register_live_data_signal_transport_receipt_v2\(jsonb, text\)[\s\S]*from public, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.register_live_data_signal_transport_receipt_v2\(jsonb, text\)[\s\S]*to anon, service_role/i,
    );
    expect(migration).toMatch(
      /revoke all on function private\.require_signal_bridge_token_v1\(text, text\)[\s\S]*from public, anon, authenticated, service_role/i,
    );
  });

  it("remains hash-only, additive, and requests schema reload", () => {
    expect(migration).toContain("Raw bridge tokens are never stored in Lighthouse");
    expect(migration).toContain("notify pgrst, 'reload schema'");
    expect(migration).not.toMatch(/^\s*delete\s+from\b/im);
    expect(migration).not.toMatch(/^\s*truncate\b/im);
    expect(migration).not.toMatch(/^\s*drop\s+(?:table|view|schema|function|trigger|index)\b/im);
  });
});
