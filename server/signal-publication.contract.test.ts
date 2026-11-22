import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Gate B Kernel 2 — substrate, wiring, and discipline contract.
 *
 * Pins the facts this build stands on:
 * 1. The signal_publications table the migration creates is the one
 *    drizzle/schema.ts declares, column for column, and carries the
 *    one-active-publication guarantee; the migration is registered
 *    in the ledger parity audit.
 * 2. The publish event types exist in BOTH closed vocabularies —
 *    GOVERNANCE_EVENT_TYPES (schema) and VALID_TYPES (governance-log)
 *    — and the two lists are exactly equal.
 * 3. The router's guard split: gate acts are adminProcedure, public
 *    reads are publicProcedure, and the service pins the canonical
 *    read to status 'promoted' and logs both acts.
 * 4. The exposure closure holds at the source level: the three
 *    candidate-content procedures are protected and assert
 *    gate-content access.
 * 5. The client wiring exists: router registration, /signals route,
 *    the gate's Publication card, the Lighthouse hub link.
 */

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const schema = read("../drizzle/schema.ts");
const migration = read(
  "../supabase/migrations/20261120210000_gateb_k2_signal_publications.sql",
);
const parityScript = read("../scripts/audit-supabase-migration-ledger-parity.py");
const governanceLog = read("./governance-log.ts");
const service = read("./services/signal-publication.ts");
const routerSource = read("./routers/signal-publication.ts");
const unifiedRouter = read("./routers/unified-router.ts");
const signalGovernanceRouter = read("./routers/signal-governance.ts");
const adminDashboardRouter = read("./routers/admin-dashboard.ts");
const routers = read("./routers.ts");
const app = read("../client/src/App.tsx");
const missionControl = read("../client/src/pages/MissionControl.tsx");
const lighthouse = read("../client/src/pages/Lighthouse.tsx");
const publishedPage = read("../client/src/pages/PublishedSignals.tsx");

function schemaColumns(tableVar: string): string[] {
  const start = schema.indexOf(`export const ${tableVar} = pgTable(`);
  expect(start, `drizzle schema declares ${tableVar}`).toBeGreaterThan(-1);
  const end = schema.indexOf("]);", start);
  const block = schema.slice(start, end);
  return [...block.matchAll(/:\s*\w+\("([a-z0-9_]+)"/g)].map((m) => m[1]);
}

describe("publication substrate: migration creates what the schema declares", () => {
  it("creates public.signal_publications with every declared column", () => {
    expect(migration).toContain("create table if not exists public.signal_publications");
    for (const column of schemaColumns("signalPublications")) {
      expect(migration, `signal_publications.${column}`).toContain(column);
    }
  });

  it("carries the one-active-publication guarantee as a partial unique index", () => {
    expect(migration).toContain("idx_sp_one_active_per_signal");
    expect(migration).toContain("where unpublished_at is null");
  });

  it("is registered in the migration ledger parity audit", () => {
    expect(parityScript).toContain('"20261120210000"');
    expect(parityScript).toContain("20261120210000_gateb_k2_signal_publications.sql");
  });
});

describe("publish event types: both closed vocabularies agree", () => {
  function listFrom(source: string, marker: RegExp): string[] {
    const match = source.match(marker);
    expect(match, "event type list found").not.toBeNull();
    return [...match![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  }

  const schemaTypes = listFrom(schema, /GOVERNANCE_EVENT_TYPES = \[([\s\S]*?)\] as const/);
  const validTypes = listFrom(governanceLog, /VALID_TYPES(?::[^=]+)? = \[([\s\S]*?)\];/);

  it("schema GOVERNANCE_EVENT_TYPES and governance-log VALID_TYPES are exactly equal", () => {
    expect(new Set(validTypes)).toEqual(new Set(schemaTypes));
    expect(validTypes.length).toBe(schemaTypes.length);
  });

  it("both lists carry the publication events", () => {
    for (const type of ["signal_published", "signal_unpublished"]) {
      expect(schemaTypes).toContain(type);
      expect(validTypes).toContain(type);
    }
  });
});

describe("router guard split and service discipline", () => {
  it("gate acts are adminProcedure; public reads are publicProcedure", () => {
    expect(routerSource).toContain("listPromoted: adminProcedure");
    expect(routerSource).toContain("publish: adminProcedure");
    expect(routerSource).toContain("unpublish: adminProcedure");
    expect(routerSource).toContain("listPublished: publicProcedure");
    expect(routerSource).toContain("getPublished: publicProcedure");
  });

  it("the service pins its canonical read to promoted and logs both acts", () => {
    expect(service).toContain('PROMOTED_GOVERNANCE_STATUS = "promoted"');
    expect(service).toContain("status: PROMOTED_GOVERNANCE_STATUS");
    expect(service).toContain('eventType: "signal_published"');
    expect(service).toContain('eventType: "signal_unpublished"');
    expect(service).toContain('component: PUBLICATION_COMPONENT');
    expect(service).toContain("db.transaction");
    expect(service).toContain("writeGovernanceLog");
  });

  it("the router is registered in the app router", () => {
    expect(routers).toContain("signalPublication: signalPublicationRouter");
  });
});

describe("exposure closure: candidate content is behind the gate", () => {
  it("unified signal procedures are protected, never public", () => {
    expect(unifiedRouter).toContain("get_unified_signals: protectedProcedure");
    expect(unifiedRouter).toContain("get_unified_signal_summary: protectedProcedure");
    expect(unifiedRouter).not.toContain("get_unified_signals: publicProcedure");
    expect(unifiedRouter).not.toContain("get_unified_signal_summary: publicProcedure");
  });

  it("the governance dashboard is protected, never public", () => {
    expect(signalGovernanceRouter).toContain("dashboard: protectedProcedure");
    expect(signalGovernanceRouter).not.toContain("dashboard: publicProcedure");
  });

  it("all three resolvers assert gate-content access (single-operator fallback cannot carry candidates)", () => {
    const unifiedGuards = unifiedRouter.match(/assertGateContentAccess\(ctx\)/g) ?? [];
    expect(unifiedGuards.length).toBe(2);
    expect(signalGovernanceRouter).toContain("assertGateContentAccess(ctx)");
  });

  it("the admin dashboard's canonical signal views are protected and guarded too", () => {
    expect(adminDashboardRouter).toContain("structuralSignals: protectedProcedure");
    expect(adminDashboardRouter).toContain("findingsBySeverity: protectedProcedure");
    expect(adminDashboardRouter).not.toContain("structuralSignals: publicProcedure");
    expect(adminDashboardRouter).not.toContain("findingsBySeverity: publicProcedure");
    const guards = adminDashboardRouter.match(/assertGateContentAccess\(ctx\)/g) ?? [];
    expect(guards.length).toBe(2);
  });
});

describe("client wiring", () => {
  it("the /signals public route exists and renders the published page", () => {
    expect(app).toContain('<Route path="/signals" component={PublishedSignals} />');
    expect(publishedPage).toContain("signalPublication.listPublished");
  });

  it("the gate's Publication card reads the promoted list", () => {
    expect(missionControl).toContain("function PublicationCard()");
    expect(missionControl).toContain("signalPublication.listPromoted");
    expect(missionControl).toContain("<PublicationCard />");
  });

  it("the Lighthouse hub links to the public page", () => {
    expect(lighthouse).toContain("navigate(`/signals`)");
  });
});
