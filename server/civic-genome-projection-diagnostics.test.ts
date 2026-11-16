import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  connect: vi.fn(),
}));
vi.mock("./db", () => ({
  getPool: () => ({ connect: db.connect }),
}));

import { project_docket_bulk_bill_to_civic_genome } from "./civic-genome-projection";

const family_id = "11111111-1111-4111-8111-111111111111";
const genome_bill_id = "22222222-2222-4222-8222-222222222222";
const archive_input = (history_count: number) => ({
  archive_sha256: "a".repeat(64),
  member_path: "TX_2025-2025/1890233.json",
  bill: {
    bill_id: 1890233,
    session_id: 2160,
    state: "TX",
    bill_number: "SB75",
    title: "Relating to the resilience of the electric grid and certain municipalities.",
    status: 4,
    status_date: "2025-01-02",
    last_action_date: "2025-05-22",
    history: Array.from({ length: history_count }, (_, i) => ({
      action: `Referral step ${i + 1}`,
      date: "2025-02-01",
    })),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.connect.mockResolvedValue({ query: db.query, release: db.release });
  db.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("select genome_bill_id, family_id, structural_dna_hash")) {
      return { rows: [] };
    }
    if (sql.includes("insert into public.civic_genome_family")) {
      return { rows: [{ family_id }] };
    }
    if (sql.includes("insert into public.civic_genome_bill (")) {
      return { rows: [{ genome_bill_id, family_id }] };
    }
    return { rows: [] };
  });
});

afterEach(() => vi.restoreAllMocks());

describe("Civic Genome archive projection transaction attribution", () => {
  it("identifies the real failed upsert phase without losing the original error or legal source provenance", async () => {
    const read_timeout = new Error("Query read timeout");
    const failure = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("select genome_bill_id, family_id, structural_dna_hash")) return { rows: [] };
      if (sql.includes("insert into public.civic_genome_family")) return { rows: [{ family_id }] };
      if (sql.includes("insert into public.civic_genome_bill (")) throw read_timeout;
      return { rows: [] };
    });

    await expect(project_docket_bulk_bill_to_civic_genome(archive_input(66)))
      .rejects.toBe(read_timeout);

    const log = failure.mock.calls.find(c => c[0] === "[CivicGenomeProjection] transaction_failed");
    expect(log?.[1]).toMatchObject({
      source_bill_id: 1890233,
      source_transport: "legiscan_bulk_json_derived_bill",
      phase: "upsert_genome_bill",
      error_class: "Error",
      pg_code: null,
    });
    expect(log?.[1].transaction_elapsed_ms).toBeGreaterThanOrEqual(0);
    expect(db.query.mock.calls.some(c => c[0] === "rollback")).toBe(true);
    expect(db.query.mock.calls.some(c => c[0] === "commit")).toBe(false);
    expect(db.release).toHaveBeenCalledOnce();
    expect(JSON.stringify(log)).not.toContain("resilience of the electric grid");
    expect(JSON.stringify(log)).not.toContain("archive_sha256");
  });

  it("keeps all original writes, long legislative histories and canonical archive provenance on success", async () => {
    const failure = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await project_docket_bulk_bill_to_civic_genome(archive_input(66));
    expect(result).toMatchObject({
      source_bill_id: 1890233,
      genome_bill_id,
      family_id,
      action: "inserted",
    });
    expect(db.query.mock.calls.map(c => String(c[0]))).toEqual(expect.arrayContaining([
      "begin",
      "commit",
    ]));
    const event = db.query.mock.calls.find(c => String(c[0]).includes("insert into public.civic_genome_event"));
    expect(event).toBeDefined();
    expect(JSON.stringify(event?.[1])).toContain("docket_room_bulk_archive");
    expect(JSON.stringify(event?.[1])).toContain("a".repeat(64));
    expect(failure).not.toHaveBeenCalled();
    expect(db.release).toHaveBeenCalledOnce();
  });
});
