import fs from "node:fs";

import { describe, expect, it } from "vitest";

import {
  configured_legiscan_monthly_request_budget,
  DEFAULT_LEGISCAN_MONTHLY_REQUEST_BUDGET,
} from "./legiscan-api-budget";

const read = (path: string): string =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("LegiScan public API budget", () => {
  it("keeps a 1000-request safety reserve below the provider 10000/month limit", () => {
    expect(DEFAULT_LEGISCAN_MONTHLY_REQUEST_BUDGET).toBe(9000);
    expect(configured_legiscan_monthly_request_budget({})).toBe(9000);
    expect(configured_legiscan_monthly_request_budget({
      LEGISCAN_MONTHLY_REQUEST_BUDGET: "9500",
    })).toBe(9500);
    expect(() => configured_legiscan_monthly_request_budget({
      LEGISCAN_MONTHLY_REQUEST_BUDGET: "10001",
    })).toThrow("legiscan_invalid_monthly_request_budget");
    expect(() => configured_legiscan_monthly_request_budget({
      LEGISCAN_MONTHLY_REQUEST_BUDGET: "nine-thousand",
    })).toThrow("legiscan_invalid_monthly_request_budget");
  });

  it("reserves every provider request before fetch and paces starts below two requests per second", () => {
    const provider = read("server/services/legiscan.ts");
    const reserveIndex = provider.indexOf("await reserve_legiscan_api_request(op)");
    const fetchIndex = provider.indexOf("const response = await fetch(url");
    expect(reserveIndex).toBeGreaterThan(0);
    expect(fetchIndex).toBeGreaterThan(reserveIndex);
    expect(provider).toContain("DEFAULT_LEGISCAN_MIN_REQUEST_INTERVAL_MS = 550");
    expect(provider).toContain("await wait_for_legiscan_rate_slot()");
  });

  it("uses an append-only monthly ledger with an atomic budget reservation", () => {
    const migration = read(
      "supabase/migrations/20261002060000_legiscan_public_api_budget.sql",
    );
    expect(migration).toContain("create table if not exists public.legiscan_api_request_ledger");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_count >= p_monthly_budget");
    expect(migration).toContain("legiscan_local_monthly_budget_exhausted");
    expect(migration).toContain("insert into public.legiscan_api_request_ledger");
    expect(migration).not.toContain("delete from public.legiscan_api_request_ledger");
    expect(migration).not.toContain("update public.legiscan_api_request_ledger");
  });

  it("pins conservative provider and activation settings in the worker blueprint", () => {
    const blueprint = read("render.prism-worker.yaml");
    expect(blueprint).toMatch(
      /LEGISCAN_MONTHLY_REQUEST_BUDGET\s+value: "9000"/,
    );
    expect(blueprint).toMatch(
      /LEGISCAN_MIN_REQUEST_INTERVAL_MS\s+value: "550"/,
    );
    expect(blueprint).toMatch(
      /DOCKET_BILL_ACTIVATION_CONCURRENCY\s+value: "1"/,
    );
    expect(blueprint).toMatch(
      /DOCKET_BILL_ACTIVATION_QUEUE_POLL_MS\s+value: "5000"/,
    );
  });
});
