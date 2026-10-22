import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolve_civic_genome_family,
  resolve_civic_genome_family_with_client,
} from "./civic-genome-family-resolution";
import { getPool } from "./db";
import { GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON } from "./civic-genome-rosetta-publication-quarantine";
import type { PoolClient } from "pg";

vi.mock("./db", () => ({ getPool: vi.fn() }));
// Actual publication gate: legacy "confirmed" traits cannot authorize membership changes.
describe("family resolution quarantines retired structural authority", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("rejects the pooled entry point before connection, transaction or identity lookup", async () => {
    await expect(resolve_civic_genome_family("existing-bill"))
      .rejects.toThrow(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON);
    expect(getPool).not.toHaveBeenCalled();
  });
  it("rejects the transaction entry point before inspecting a caller-owned client", async () => {
    const touched = vi.fn();
    const client = new Proxy({}, {
      get() { touched(); throw new Error("client inspected before quarantine"); },
    }) as PoolClient;
    await expect(resolve_civic_genome_family_with_client(client, "existing-bill"))
      .rejects.toThrow(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON);
    expect(touched).not.toHaveBeenCalled();
    expect(getPool).not.toHaveBeenCalled();
  });
  it("performs no query, assignment, event rewrite, candidate receipt or history write", async () => {
    const query = vi.fn();
    const release = vi.fn();
    await expect(resolve_civic_genome_family_with_client({ query, release } as unknown as PoolClient, "existing-bill"))
      .rejects.toThrow(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON);
    expect(query).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });
});
