import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative_path, import.meta.url)),
    "utf8",
  );
}

const router_source = read("./routes/civic-map-router.ts");
const map_source = read("../client/public/civicmap.html");

describe("CivicMap v2 verified signal circulation contract", () => {
  it("adds verified legal signals to the existing viewport response", () => {
    expect(router_source).toContain(
      "public.v_lighthouse_verified_legal_signals_v1",
    );
    expect(router_source).toContain("signal.verification_status = 'verified'");
    expect(router_source).toContain("signal.signal_status = 'active'");
    expect(router_source).toContain(
      "signal.generation_method = 'deterministic_rule'",
    );
    expect(router_source).toContain(
      "signal.signal_type <> 'stream_health_alert'",
    );
    expect(router_source).toContain("public.state_fallback_centroids");
    expect(router_source).toContain(
      "'state_fallback_centroid'::text as coordinate_precision",
    );
    expect(router_source).toContain("true as is_approximate_coordinate");
    expect(router_source).toContain("signal_count: signals.length");
    expect(router_source).not.toContain(
      "from public.atlas_lighthouse_signal_bridge_v1",
    );
    expect(router_source).not.toContain(
      "from public.atlas_lighthouse_judicial_signal_bridge_v1",
    );
  });

  it("keeps the resource and signal reads in one bounded API call", () => {
    expect(map_source).toContain("/api/civic-map/bounds?");
    expect(map_source).toContain("payload.nodes || []");
    expect(map_source).toContain("payload.signals || []");
    expect(map_source).toContain("groupVerifiedSignals");
    expect(map_source).not.toContain("/api/civic-map/signals");
    expect(router_source).toContain("limit 500");
  });

  it("renders jurisdiction-level signals without claiming source coordinates", () => {
    expect(map_source).toContain("verified legal signals");
    expect(map_source).toContain(
      "It is a display anchor, not an incident or source location.",
    );
    expect(map_source).toContain("point.kind === 'signal_cluster'");
    expect(map_source).toContain("v_lighthouse_verified_legal_signals_v1");
  });

  it("surfaces pool and query timeout diagnostics on CivicMap health", () => {
    expect(router_source).toContain("query_with_diagnostics");
    expect(router_source).toContain('label: "civic_map_health"');
    expect(router_source).toContain("verified_legal_signal_rows");
    expect(router_source).toContain("mapped_verified_legal_signal_rows");
    expect(router_source).toContain("get_pool_runtime_configuration()");
    expect(router_source).toContain("classify_db_error(error)");
  });
});
