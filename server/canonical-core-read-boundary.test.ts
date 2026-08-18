import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const migration = read("supabase/migrations/20260818210000_canonical_core_read_boundary.sql");
const diagnostics = read("server/queue-db-diagnostics.ts");
const canonical = read("server/services/current-canonical-state.ts");

describe("Mission Control canonical-core read boundary", () => {
  it("filters action bindings before winner ranking without changing the service-role boundary", () => {
    const predicate = migration.indexOf("where b.action_key = p_action_key");
    const winner_filter = migration.indexOf("where binding_rank = 1");
    expect(predicate).toBeGreaterThanOrEqual(0);
    expect(winner_filter).toBeGreaterThan(predicate);
    expect(migration).toContain("security definer");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("materializes only count-consumed civic-object columns for canonical state", () => {
    expect(migration).toContain("select\n    object_class,\n    typed_ready,\n    jurisdiction_ready,\n    state_code,\n    jurisdiction,\n    artifact_key\n  from public.v_lighthouse_civic_object_current_v1");
    expect(migration).not.toContain("select * from public.v_lighthouse_civic_object_current_v1");
    expect(migration).toContain("'contract','lighthouse_canonical_state_v2'");
  });

  it("server-cancels canonical-core SQL before the client timeout without queue circuit state", () => {
    expect(diagnostics).toContain('label.startsWith("canonical_core_")');
    expect(diagnostics).toContain("server_timeout_managed_label");
    expect(diagnostics).toContain("set_config('statement_timeout'");
    expect(diagnostics).toContain('queue_managed_label(label)\n    && (label.endsWith("_claim")');
    expect(diagnostics).not.toContain('label.startsWith("canonical_core_")\n    &&');
  });

  it("routes all canonical read families through the bounded diagnostics wrapper", () => {
    expect(canonical).toContain('import { query_with_diagnostics } from "../db"');
    expect(canonical).not.toContain("getPool().query");
    expect(canonical).toContain('label: "canonical_core_current_state"');
    expect(canonical).toContain('label: "canonical_core_graph_nodes"');
    expect(canonical).toContain('label: "canonical_core_graph_edges"');
    expect(canonical).toContain('label: "canonical_core_unresolved_relationships"');
    expect(canonical).toContain("CANONICAL_CORE_QUERY_TIMEOUT_MS = 7_000");
  });

  it("deduplicates only an active state query and never retains a resolved TTL cache", () => {
    expect(canonical).toContain("current_canonical_state_in_flight");
    expect(canonical).toContain("if (current_canonical_state_in_flight) return current_canonical_state_in_flight");
    expect(canonical).toContain("current_canonical_state_in_flight = null");
    expect(canonical).not.toContain("cache_expires");
    expect(canonical).not.toContain("cached_canonical_state");
    expect(canonical).not.toMatch(/setTimeout\([^)]*current_canonical_state/);
  });
});
