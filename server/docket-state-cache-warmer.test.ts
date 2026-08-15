import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const warmer = readFileSync(
  join(process.cwd(), "server", "docket-state-cache-warmer.ts"),
  "utf8",
);
const startup = readFileSync(
  join(process.cwd(), "server", "_core", "index.ts"),
  "utf8",
);

describe("Docket state cache warmer", () => {
  it("warms only a bounded batch and never overlaps cycles", () => {
    expect(warmer).toContain("const DEFAULT_BATCH_SIZE = 5");
    expect(warmer).toContain("const MAX_BATCH_SIZE = 10");
    expect(warmer).toContain("if (cycle_running || stopped) return");
    expect(warmer).toContain("/api/docket/warm-next-batch");
    expect(warmer).toContain("JSON.stringify({ limit })");
  });

  it("uses a slow recovery cadence rather than a retry storm", () => {
    expect(warmer).toContain("const DEFAULT_INTERVAL_MS = 15 * 60 * 1000");
    expect(warmer).toContain("const MIN_INTERVAL_MS = 5 * 60 * 1000");
    expect(warmer).toContain("const INITIAL_DELAY_MS = 30_000");
  });

  it("starts only after the local Lighthouse HTTP listener is live", () => {
    expect(startup).toContain('import { start_docket_state_cache_warmer } from "../docket-state-cache-warmer"');
    const listen_index = startup.indexOf("server.listen(port, () => {");
    const warmer_index = startup.indexOf("start_docket_state_cache_warmer(port)");
    expect(listen_index).toBeGreaterThanOrEqual(0);
    expect(warmer_index).toBeGreaterThan(listen_index);
  });
});
