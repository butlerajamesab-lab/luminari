import { describe, expect, it, vi, beforeEach } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ query_with_diagnostics: query }));
import { accept_docket_bill_detail, validate_docket_bill_identity, preserve_docket_archive_auxiliary } from "./docket-bill-detail-acceptance";

const bill = { bill_id: 1895956, session_id: 2159, state: "MT", bill_number: "HB1", change_hash: "a", status_date: "2026-06-01" };
const archive = { archive_sha256: "a".repeat(64), member_path: "MT/2025-2025_Regular_Session/bill/HB1.json", member_sha256: "b".repeat(64) };

beforeEach(() => { query.mockReset(); });
describe("LegiScan API/bulk shared Docket bill acceptance", () => {
  it("rejects wrong provider identity and never writes", async () => {
    await expect(accept_docket_bill_detail({ bill_id: 55, bill, source: "legiscan_bulk_json", archive }))
      .rejects.toThrow("docket_bill_id_mismatch");
    expect(query).not.toHaveBeenCalled();
  });
  it("uses existing API upsert behavior with no archive-specific side path", async () => {
    query.mockResolvedValue({ rows: [] });
    await accept_docket_bill_detail({ bill_id: bill.bill_id, bill, source: "legiscan_get_bill" });
    expect(String(query.mock.calls[0][0])).toContain("on conflict (bill_id) do update");
    expect(query.mock.calls[0][1][2]).toBe("legiscan_get_bill");
  });
  it("preserves existing cache and refuses identity collision", async () => {
    query.mockResolvedValueOnce({ rows: [{ bill: { state: "NV", session_id: 2159 } }] });
    await expect(accept_docket_bill_detail({ bill_id: bill.bill_id, bill, source: "legiscan_bulk_json", archive }))
      .rejects.toThrow("docket_bulk_existing_bill_identity_conflict");
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("archive acceptance uses insert-only cache and atomic receipt, never Rosetta", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ disposition: "inserted", cache_inserted: true, activation_id: "00000000-0000-4000-8000-000000000001" }] });
    const outcome = await accept_docket_bill_detail({ bill_id: bill.bill_id, bill, source: "legiscan_bulk_json", archive });
    const sql = String(query.mock.calls[1][0]);
    expect(sql).toContain("on conflict (bill_id) do nothing");
    expect(sql).toContain("docket_legiscan_bulk_member_receipt");
    expect(sql).toContain("register_docket_jurisdiction_activation(");
    expect(sql).toContain("from inserted");
    expect(sql).not.toContain("docket_bill_state_cache");
    expect(sql).not.toContain("rosetta");
    expect(outcome.disposition).toBe("inserted");
    expect(outcome.activation_id).toBe("00000000-0000-4000-8000-000000000001");
  });
  it("preserves source-chronology-held bill detail without starting Docket activation", async () => {
    const undated = { ...bill, status_date: undefined, history: [] };
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{
      disposition: "held_chronology", cache_inserted: true, activation_id: null,
    }] });
    const result = await accept_docket_bill_detail({
      bill_id: bill.bill_id, bill: undated, source: "legiscan_bulk_json", archive,
    });
    const sql = String(query.mock.calls[1][0]);
    expect(sql).toContain("where not $10::boolean");
    expect(sql).toContain("'held_chronology'");
    expect(query.mock.calls[1][1][9]).toBe(true);
    expect(result.disposition).toBe("held_chronology");
    expect(result.activation_id).toBeNull();
  });

  it("preserves auxiliary legislator and roll call evidence without inventing bill details", async () => {
    query.mockResolvedValue({ rows: [] });
    await preserve_docket_archive_auxiliary({ kind: "roll_call", payload: { roll_call_id: 15 }, provider_record_id: 15, state: "MT", archive });
    expect(String(query.mock.calls[0][0])).toContain("docket_legiscan_bulk_member_receipt");
    expect(String(query.mock.calls[0][0])).not.toContain("docket_bill_detail_cache");
  });
  it("rejects archive missing session without a side effect", () => {
    expect(() => validate_docket_bill_identity(bill.bill_id, { ...bill, session_id: null }, true)).toThrow();
  });
});
