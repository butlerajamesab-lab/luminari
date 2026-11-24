import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DOCKET_BILL_SUPPLEMENT_PROJECTION_SQL,
  docket_bill_supplement_projection_enabled,
} from "./docket-bill-supplement-projection";

// Real corpus rows: supplements as stored in docket_bill_detail_cache for
// OR HJR201 (three analyses, one with LegiScan's "0000-00-00" date) and
// GA HB79 (one fiscal note).
const fixture = JSON.parse(readFileSync(
  new URL("./__fixtures__/docket_bill_supplements_or_hjr201_ga_hb79.json", import.meta.url),
  "utf8",
));
const migration = readFileSync(new URL(
  "../supabase/migrations/20261124090000_docket_bill_supplement_v1.sql",
  import.meta.url,
), "utf8");
let database: PGlite;

async function project(bill_id: number): Promise<number> {
  return (await database.query(DOCKET_BILL_SUPPLEMENT_PROJECTION_SQL, [bill_id])).rows.length;
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
  for (const row of fixture.rows) {
    await database.query(
      "insert into public.docket_bill_detail_cache values ($1, $2::jsonb, $3::timestamptz, $4)",
      [row.bill_id, JSON.stringify(row.bill), row.fetched_at, row.source],
    );
  }
});
afterAll(async () => { await database?.close(); });

describe("Docket bill supplement projection (real corpus rows)", () => {
  it("attaches each supplement to its bill with type, date, and official links", async () => {
    expect(await project(2101011)).toBe(3);
    expect(await project(1926416)).toBe(1);
    const { rows } = await database.query<Record<string, unknown>>(
      `select supplement_id::int as supplement_id, source_bill_id, state_code, supplement_type,
              title, supplement_date::text as supplement_date, state_link, supplement_hash,
              supplement_size::int as supplement_size
         from public.docket_bill_supplement_v1 order by supplement_id`,
    );
    expect(rows.map(row => row.supplement_id)).toEqual([650984, 659037, 659038, 663093]);
    // LegiScan's "0000-00-00" placeholder is no date, not an error.
    expect(rows[0]).toMatchObject({ title: "Open Government Impact", supplement_date: null });
    expect(rows[3]).toMatchObject({
      source_bill_id: 1926416, state_code: "GA", supplement_type: "Fiscal Note",
      supplement_date: "2026-02-09",
      state_link: "https://www.legis.ga.gov/api/legislation/document/20252026/241953",
      supplement_hash: "db28967373b0be985ea811c360a96ffb", supplement_size: 323175,
    });
  });

  it("is idempotent and an older snapshot cannot overwrite a newer one", async () => {
    expect(await project(1926416)).toBe(1);
    await database.query(
      "update public.docket_bill_detail_cache set fetched_at = fetched_at - interval '30 days' where bill_id = 1926416",
    );
    expect(await project(1926416)).toBe(0);
  });

  it("is opt-in and closed to public roles", async () => {
    expect(docket_bill_supplement_projection_enabled({})).toBe(false);
    expect(docket_bill_supplement_projection_enabled({ DOCKET_BILL_SUPPLEMENT_PROJECTION_ENABLED: "true" })).toBe(true);
    const { rows } = await database.query<{ anon: boolean; service: boolean }>(
      `select has_table_privilege('anon', 'public.docket_bill_supplement_v1', 'select') as anon,
              has_table_privilege('service_role', 'public.docket_bill_supplement_v1', 'insert') as service`,
    );
    expect(rows[0]).toEqual({ anon: false, service: true });
  });
});
