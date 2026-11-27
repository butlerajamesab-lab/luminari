import { afterEach, describe, expect, it, vi } from "vitest";

const { query_mock } = vi.hoisted(() => ({ query_mock: vi.fn() }));

vi.mock("./db", () => ({ getPool: () => ({ query: query_mock }) }));

import {
  PAID_FALLBACK_BUDGET_RESERVE,
  PAID_FALLBACK_GATE_UNAVAILABLE_ERROR,
  assert_paid_provider_fallback_allowed,
  decide_paid_fallback,
} from "./legiscan-paid-fallback-gate";
import { is_deterministic_ingestion_failure } from "./civic-genome-rosetta-ingestion-driver";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("decide_paid_fallback", () => {
  it("allows a current bill below budget minus reserve", () => {
    expect(decide_paid_fallback({
      deliberation_class: "current", month_used: 9_499, monthly_budget: 10_000,
    })).toEqual({ allowed: true });
  });

  it("refuses a current bill at budget minus reserve (10,000 - 500)", () => {
    expect(PAID_FALLBACK_BUDGET_RESERVE).toBe(500);
    expect(decide_paid_fallback({
      deliberation_class: "current", month_used: 9_500, monthly_budget: 10_000,
    })).toEqual({
      allowed: false,
      error_code: "legislative_version_provider_fallback_budget_reserve:9500/10000",
    });
    expect(decide_paid_fallback({
      deliberation_class: "current", month_used: 10_000, monthly_budget: 10_000,
    }).allowed).toBe(false);
  });

  it("never allows a concluded or unverified bill, whatever the usage", () => {
    for (const cls of ["deliberated", "unverified", "", null, undefined, "CURRENT", "weird"]) {
      const decision = decide_paid_fallback({
        deliberation_class: cls as never, month_used: 0, monthly_budget: 10_000,
      });
      expect(decision.allowed).toBe(false);
    }
    expect(decide_paid_fallback({
      deliberation_class: "deliberated", month_used: 0, monthly_budget: 10_000,
    })).toEqual({
      allowed: false,
      error_code: "legislative_version_provider_fallback_not_eligible:deliberated",
    });
  });

  it("fails closed on unreadable usage or budget", () => {
    for (const month_used of [null, undefined, Number.NaN, -1, 1.5]) {
      expect(decide_paid_fallback({
        deliberation_class: "current", month_used: month_used as never, monthly_budget: 10_000,
      })).toEqual({ allowed: false, error_code: PAID_FALLBACK_GATE_UNAVAILABLE_ERROR });
    }
    expect(decide_paid_fallback({
      deliberation_class: "current", month_used: 0, monthly_budget: 0,
    }).allowed).toBe(false);
  });

  it("uses the configured budget, so a 9,000 budget closes at 8,500", () => {
    expect(decide_paid_fallback({
      deliberation_class: "current", month_used: 8_499, monthly_budget: 9_000,
    }).allowed).toBe(true);
    expect(decide_paid_fallback({
      deliberation_class: "current", month_used: 8_500, monthly_budget: 9_000,
    }).allowed).toBe(false);
  });
});

describe("assert_paid_provider_fallback_allowed", () => {
  it("passes for a current bill under the line and reads the UTC-month ledger", async () => {
    vi.stubEnv("LEGISCAN_MONTHLY_REQUEST_BUDGET", "10000");
    query_mock.mockResolvedValueOnce({ rows: [{ deliberation_class: "current", month_used: 120 }] });
    await expect(assert_paid_provider_fallback_allowed(42)).resolves.toBeUndefined();
    const [sql, params] = query_mock.mock.calls[0]!;
    expect(params).toEqual([42]);
    expect(sql).toContain("docket_bill_deliberation_class_v1");
    expect(sql).toContain("legiscan_api_request_ledger");
    expect(sql).toContain("current_timestamp at time zone 'UTC'");
  });

  it("refuses a concluded bill", async () => {
    vi.stubEnv("LEGISCAN_MONTHLY_REQUEST_BUDGET", "10000");
    query_mock.mockResolvedValueOnce({ rows: [{ deliberation_class: "deliberated", month_used: 5 }] });
    await expect(assert_paid_provider_fallback_allowed(42)).rejects.toThrow(
      "legislative_version_provider_fallback_not_eligible:deliberated",
    );
  });

  it("refuses a current bill once usage reaches the reserve line (string count from pg)", async () => {
    vi.stubEnv("LEGISCAN_MONTHLY_REQUEST_BUDGET", "10000");
    query_mock.mockResolvedValueOnce({ rows: [{ deliberation_class: "current", month_used: "9500" }] });
    await expect(assert_paid_provider_fallback_allowed(42)).rejects.toThrow(
      "legislative_version_provider_fallback_budget_reserve:9500/10000",
    );
  });

  it("fails closed when the database read fails or returns nothing", async () => {
    vi.stubEnv("LEGISCAN_MONTHLY_REQUEST_BUDGET", "10000");
    query_mock.mockRejectedValueOnce(new Error("permission denied for table legiscan_api_request_ledger"));
    await expect(assert_paid_provider_fallback_allowed(42)).rejects.toThrow(
      PAID_FALLBACK_GATE_UNAVAILABLE_ERROR,
    );
    query_mock.mockResolvedValueOnce({ rows: [] });
    await expect(assert_paid_provider_fallback_allowed(42)).rejects.toThrow(
      "legislative_version_provider_fallback_not_eligible:unverified",
    );
  });

  it("fails closed on an invalid configured budget", async () => {
    vi.stubEnv("LEGISCAN_MONTHLY_REQUEST_BUDGET", "not-a-number");
    await expect(assert_paid_provider_fallback_allowed(42)).rejects.toThrow(
      PAID_FALLBACK_GATE_UNAVAILABLE_ERROR,
    );
    expect(query_mock).not.toHaveBeenCalled();
  });
});

describe("driver parking of gate refusals", () => {
  it("parks (never retries) not-eligible and reserve refusals, but retries an unavailable gate", () => {
    expect(is_deterministic_ingestion_failure(
      new Error("legislative_version_provider_fallback_not_eligible:deliberated"),
    )).toBe(true);
    expect(is_deterministic_ingestion_failure(
      new Error("legislative_version_provider_fallback_budget_reserve:9500/10000"),
    )).toBe(true);
    expect(is_deterministic_ingestion_failure(
      new Error(PAID_FALLBACK_GATE_UNAVAILABLE_ERROR),
    )).toBe(false);
  });
});
