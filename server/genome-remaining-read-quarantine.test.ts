import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  build_civic_genome_family_snapshot_v1,
  produce_civic_genome_family_snapshot_v1,
  produce_current_civic_genome_family_snapshot_v1,
} from "./civic-genome-external-snapshot-producer";
import { enrich_rosetta_binding_request } from "./services/prism-rosetta-structural-context";
import { GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON } from "./civic-genome-rosetta-publication-quarantine";
import { getPool, query_with_diagnostics } from "./db";
import { computeCanonicalHash } from "./lib/determinism";
import { assert_rosetta_current_publication } from "./services/rosetta-publication-eligibility";

vi.mock("./db", () => ({ getPool: vi.fn(), query_with_diagnostics: vi.fn() }));
vi.mock("./lib/determinism", () => ({ computeCanonicalHash: vi.fn() }));
vi.mock("./services/rosetta-publication-eligibility", () => ({ assert_rosetta_current_publication: vi.fn() }));
vi.mock("./services/prism-verification-contract", () => ({
  canonical_json: vi.fn(), sha256_hex: vi.fn(),
  deep_rosetta_binding_request_schema: { parse: vi.fn() },
}));
// The publication-quarantine module itself is deliberately NOT mocked.
const poison = new Proxy({}, { get() { throw new Error("input inspected before quarantine"); } });

describe("remaining legacy interpretation readers fail before side effects", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("rejects pure snapshot receipt construction before inspecting either input", () => {
    expect(() => build_civic_genome_family_snapshot_v1(poison as never, poison as never))
      .toThrow(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON);
  });
  it("rejects historical and current-cursor producers before pool/options access", async () => {
    await expect(produce_civic_genome_family_snapshot_v1(poison as never, poison as never))
      .rejects.toThrow(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON);
    await expect(produce_current_civic_genome_family_snapshot_v1(poison as never, poison as never))
      .rejects.toThrow(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON);
    expect(getPool).not.toHaveBeenCalled();
    expect(computeCanonicalHash).not.toHaveBeenCalled();
    expect(query_with_diagnostics).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects Prism context before owner lookup, source fetch, cache or peer traits", async () => {
    await expect(enrich_rosetta_binding_request(poison as never))
      .rejects.toThrow(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON);
    expect(assert_rosetta_current_publication).not.toHaveBeenCalled();
    expect(query_with_diagnostics).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves the supplied sealed record instead of rewriting its interpretation/hash", () => {
    const input = Object.freeze({
      family: Object.freeze({ family_id: "historical-family" }),
      bills: Object.freeze([Object.freeze({
        genome_bill_id: "historical-bill", structural_dna_hash: "old-sealed-hash",
        structural_dna_json: Object.freeze({ rosetta_assembly: Object.freeze({ engine_version: "2.5.11" }) }),
      })]),
    });
    const before = JSON.stringify(input);
    expect(() => build_civic_genome_family_snapshot_v1(input as never, poison as never))
      .toThrow(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON);
    expect(JSON.stringify(input)).toBe(before);
    expect(computeCanonicalHash).not.toHaveBeenCalled();
  });
  it("keeps rejection before the mutable eligibility/cache read in source", () => {
    const source = readFileSync(new URL("./services/prism-rosetta-structural-context.ts", import.meta.url), "utf8");
    const body = source.slice(source.indexOf("export async function enrich_rosetta_binding_request"));
    expect(body.indexOf("assert_genome_rosetta_publication_admitted();"))
      .toBeLessThan(body.indexOf("await assert_rosetta_current_publication"));
    const bootstrap = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    expect(bootstrap).toContain("run_civic_genome_external_snapshot_proof_from_environment().catch");
  });
});
