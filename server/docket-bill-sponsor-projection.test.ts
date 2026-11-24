import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DOCKET_BILL_SPONSOR_PROJECTION_SQL,
  docket_bill_sponsor_projection_enabled,
} from "./docket-bill-sponsor-projection";

// Real corpus row: GA HB79 (LegiScan bill 1926416) as stored in
// docket_bill_detail_cache on 2026-11-11, sponsors exactly as provided.
const fixture = JSON.parse(readFileSync(
  new URL("./__fixtures__/docket_bill_detail_ga_hb79_sponsors.json", import.meta.url),
  "utf8",
));
const migration = readFileSync(new URL(
  "../supabase/migrations/20261124070000_docket_bill_sponsor_v1.sql",
  import.meta.url,
), "utf8");

let database: PGlite;

async function project(): Promise<number> {
  const result = await database.query(DOCKET_BILL_SPONSOR_PROJECTION_SQL, [fixture.bill_id]);
  return result.rows.length;
}

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.docket_bill_detail_cache (
      bill_id integer primary key, bill jsonb not null,
      fetched_at timestamptz not null, source text not null
    );
  `);
  await database.exec(migration);
  await database.query(
    "insert into public.docket_bill_detail_cache values ($1, $2::jsonb, $3::timestamptz, $4)",
    [fixture.bill_id, JSON.stringify(fixture.bill), fixture.fetched_at, fixture.source],
  );
});
afterAll(async () => { await database?.close(); });

describe("Docket bill sponsor projection (GA HB79, real corpus row)", () => {
  it("projects all seven sponsors in provider order with types and official pages", async () => {
    expect(await project()).toBe(7);
    const { rows } = await database.query<Record<string, unknown>>(
      `select people_id, sponsor_order, sponsor_type, name, role, party, district,
              official_page_url, state_code, docket_source
         from public.docket_bill_sponsor_v1 order by sponsor_order`,
    );
    expect(rows.map(row => row.name)).toEqual([
      "Mark Newton", "Sharon Cooper", "Matt Reeves", "Scott Hilton",
      "Deborah Silcox", "Sandy Donatucci", "Jason Anavitarte",
    ]);
    expect(rows[0]).toMatchObject({
      people_id: 18895, sponsor_type: "primary", role: "Rep", party: "R",
      district: "HD-127", state_code: "GA", docket_source: "legiscan_bulk_json",
      official_page_url: "https://www.legis.ga.gov/members/house/4902?session=1034",
    });
    // Empty official website: falls back to the legislature biography page.
    expect(rows[5].official_page_url).toBe("https://www.legis.ga.gov/members/house/5077?session=1034");
    // Senate joint sponsor on a House bill.
    expect(rows[6]).toMatchObject({ people_id: 22295, sponsor_type: "joint", role: "Sen" });
  });

  it("is idempotent and never lets an older snapshot overwrite a newer one", async () => {
    expect(await project()).toBe(7);
    await database.query(
      "update public.docket_bill_detail_cache set fetched_at = fetched_at - interval '30 days' where bill_id = $1",
      [fixture.bill_id],
    );
    expect(await project()).toBe(0);
    const { rows } = await database.query<{ docket_fetched_at: Date; n: number }>(
      "select min(docket_fetched_at) as docket_fetched_at, count(*)::int as n from public.docket_bill_sponsor_v1",
    );
    expect(rows[0].n).toBe(7);
    expect(new Date(rows[0].docket_fetched_at).toISOString()).toBe(new Date(fixture.fetched_at).toISOString());
  });

  it("is opt-in and the table is closed to public roles", async () => {
    expect(docket_bill_sponsor_projection_enabled({})).toBe(false);
    expect(docket_bill_sponsor_projection_enabled({ DOCKET_BILL_SPONSOR_PROJECTION_ENABLED: "true" })).toBe(true);
    const { rows } = await database.query<{ anon: boolean; service: boolean }>(
      `select has_table_privilege('anon', 'public.docket_bill_sponsor_v1', 'select') as anon,
              has_table_privilege('service_role', 'public.docket_bill_sponsor_v1', 'insert') as service`,
    );
    expect(rows[0]).toEqual({ anon: false, service: true });
  });
});
