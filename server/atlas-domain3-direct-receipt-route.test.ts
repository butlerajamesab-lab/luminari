import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(
  join(process.cwd(), "server", "routes", "atlas-domain3-receipt-router.ts"),
  "utf8",
);
const server = readFileSync(
  join(process.cwd(), "server", "_core", "index.ts"),
  "utf8",
);

describe("Atlas Domain 3 direct PostgreSQL receipt route", () => {
  it("mounts one bounded transport endpoint before static handling", () => {
    expect(server).toContain("atlas_domain3_receipt_router");
    expect(server).toContain('app.use("/api/atlas-domain3", atlas_domain3_receipt_router)');
    expect(route).toContain('atlas_domain3_receipt_router.post("/receipt"');
  });

  it("requires the dedicated bridge token without logging it", () => {
    expect(route).toContain('const TOKEN_HEADER = "x-atlas-domain3-token"');
    expect(route).toContain("bridge_token.length < 32");
    expect(route).toContain("signal_bridge_authentication_failed");
    expect(route).not.toMatch(/console\.(?:log|warn|error)\([^)]*bridge_token/s);
  });

  it("validates the token and registers the signal in one direct PostgreSQL statement", () => {
    expect(route).toContain("private.require_signal_bridge_token_v1");
    expect(route).toContain("live_data_signal_write");
    expect(route).toContain("register_live_data_signal_transport_receipt_v1");
    expect(route).toContain("cross join lateral");
    expect(route).toContain("query_with_diagnostics");
  });

  it("does not create a second canonical or legacy write path", () => {
    expect(route).not.toMatch(/insert\s+into/i);
    expect(route).not.toContain("detected_signals");
    expect(route).not.toContain("live_signals");
    expect(route).not.toContain("cases");
    expect(route).not.toContain("findings");
    expect(route).not.toContain("signal_convergences");
  });

  it("returns only a bounded receipt and sanitized failures", () => {
    expect(route).toContain("live_data_signal_id");
    expect(route).toContain("signal_hash");
    expect(route).toContain("governance_status");
    expect(route).toContain("registered_at");
    expect(route).toContain("live_data_signal_registration_failed");
    expect(route).not.toContain("error_message:");
  });
});
