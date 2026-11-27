import { afterEach, describe, expect, it, vi } from "vitest";

const { query_mock } = vi.hoisted(() => ({ query_mock: vi.fn() }));

vi.mock("./db", () => ({ query_with_diagnostics: query_mock }));

import {
  LEGISCAN_PAID_FALLBACK_RESERVE_REACHED_ERROR,
  reserve_legiscan_api_request,
} from "./legiscan-api-budget";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function receipt(ordinal: number) {
  return { rows: [{ month_start: "2026-11-01", request_ordinal: ordinal, remaining: 10_000 - ordinal }] };
}

describe("reserve_legiscan_api_request protected reserve", () => {
  it("uses v1 with no protected reserve, exactly as before", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEGISCAN_MONTHLY_REQUEST_BUDGET", "10000");
    query_mock.mockResolvedValueOnce(receipt(5));
    await expect(reserve_legiscan_api_request("get_bill")).resolves.toEqual({
      month_start: "2026-11-01", request_ordinal: 5, remaining: 9_995,
    });
    const [sql, params] = query_mock.mock.calls[0]!;
    expect(sql).toContain("reserve_legiscan_api_request_v1(");
    expect(sql).not.toContain("_v2(");
    expect(params).toHaveLength(3);
  });

  it("uses the atomic v2 function when a protected reserve is requested", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEGISCAN_MONTHLY_REQUEST_BUDGET", "10000");
    query_mock.mockResolvedValueOnce(receipt(9_500));
    await reserve_legiscan_api_request("get_bill_text", { protected_reserve: 500 });
    const [sql, params] = query_mock.mock.calls[0]!;
    expect(sql).toContain("reserve_legiscan_api_request_v2(");
    expect(params[0]).toBe("get_bill_text");
    expect(params[1]).toBe(10_000);
    expect(params[3]).toBe(500);
  });

  it("maps the database's reserve refusal to a stable code", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEGISCAN_MONTHLY_REQUEST_BUDGET", "10000");
    query_mock.mockRejectedValueOnce(new Error("legiscan_paid_fallback_reserve_reached"));
    await expect(
      reserve_legiscan_api_request("get_bill_text", { protected_reserve: 500 }),
    ).rejects.toThrow(LEGISCAN_PAID_FALLBACK_RESERVE_REACHED_ERROR);
  });

  it("keeps the exhausted-budget and unavailable mappings", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LEGISCAN_MONTHLY_REQUEST_BUDGET", "10000");
    query_mock.mockRejectedValueOnce(new Error("legiscan_local_monthly_budget_exhausted"));
    await expect(
      reserve_legiscan_api_request("get_bill_text", { protected_reserve: 500 }),
    ).rejects.toThrow("legiscan_local_monthly_budget_exhausted");
    query_mock.mockRejectedValueOnce(new Error("connection refused"));
    await expect(reserve_legiscan_api_request("get_bill")).rejects.toThrow(
      "legiscan_budget_guard_unavailable",
    );
  });

  it("rejects an invalid reserve before touching the database", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(
      reserve_legiscan_api_request("get_bill_text", { protected_reserve: -1 }),
    ).rejects.toThrow("legiscan_invalid_protected_reserve");
    await expect(
      reserve_legiscan_api_request("get_bill_text", { protected_reserve: 1.5 }),
    ).rejects.toThrow("legiscan_invalid_protected_reserve");
    expect(query_mock).not.toHaveBeenCalled();
  });
});
