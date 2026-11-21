import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Gate B Kernel 1 — substrate & wiring contract.
 *
 * Pins three facts that were broken before this build:
 * 1. The alerting substrate tables declared in drizzle/schema.ts are
 *    actually created by a migration, column for column.
 * 2. Mission Control's header counters (system.stats) read the true
 *    governed store, public.live_data_signals — never the legacy
 *    detected_signals table whose missing status columns made the old
 *    query throw and silently zero every counter.
 * 3. The governed alerting router is registered and the kernel reads
 *    awaiting review by the canonical definition (current +
 *    observation_candidate) from the same true store.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const schema = read("../drizzle/schema.ts");
const migration = read(
  "../supabase/migrations/20261120203000_gateb_k1_alerting_substrate.sql",
);
const systemRouter = read("./_core/systemRouter.ts");
const routers = read("./routers.ts");
const kernel = read("./alerting/governed-candidate-alerts.ts");

function schemaColumns(tableVar: string): string[] {
  const start = schema.indexOf(`export const ${tableVar} = pgTable(`);
  expect(start, `drizzle schema declares ${tableVar}`).toBeGreaterThan(-1);
  const end = schema.indexOf("]);", start);
  const block = schema.slice(start, end);
  return [...block.matchAll(/:\s*\w+\("([a-z0-9_]+)"/g)].map((m) => m[1]);
}

describe("alerting substrate: migration creates what the schema declares", () => {
  const tables: Array<[string, string]> = [
    ["alertSubscriptions", "alert_subscriptions"],
    ["alertEvents", "alert_events"],
    ["alertDeliveryLog", "alert_delivery_log"],
  ];

  for (const [tableVar, tableName] of tables) {
    it(`creates public.${tableName} with every declared column`, () => {
      expect(migration).toContain(`create table if not exists public.${tableName}`);
      for (const column of schemaColumns(tableVar)) {
        expect(migration, `${tableName}.${column}`).toContain(column);
      }
    });
  }

  it("carries the kernel dedupe guarantee as a partial unique index", () => {
    expect(migration).toContain("idx_ae_governed_candidate_unique");
    expect(migration).toContain("metadata_ae ->> 'signalId'");
    expect(migration).toContain("alert_type_ae = 'governed_candidate'");
  });
});

describe("counter reconciliation: system.stats reads the true store", () => {
  it("counts governed signals from live_data_signals by governance_status", () => {
    expect(systemRouter).toContain("FROM live_data_signals");
    expect(systemRouter).toContain("governance_status");
    expect(systemRouter).toContain('"observation_candidate"');
    expect(systemRouter).toContain('"promoted"');
  });

  it("never queries the legacy detected_signals table", () => {
    expect(systemRouter.toLowerCase()).not.toContain("from detected_signals");
  });
});

describe("governed alerting kernel wiring", () => {
  it("is registered in the app router", () => {
    expect(routers).toContain("governedAlerting: governedAlertingRouter");
    expect(routers).toContain('from "./routers/governed-alerting"');
  });

  it("defines awaiting review canonically over the true store", () => {
    expect(kernel).toContain('AWAITING_REVIEW_GOVERNANCE_STATUS = "observation_candidate"');
    expect(kernel).toContain("public.live_data_signals");
    expect(kernel).toContain("is_current = true");
  });

  it("contains no scoring: the kernel points, it does not grade", () => {
    expect(kernel.toLowerCase()).not.toContain("riskscore");
    expect(kernel.toLowerCase()).not.toContain("risk_score");
    expect(kernel).not.toContain("detectedSignals");
    expect(kernel).not.toContain("detected_signals");
  });
});
