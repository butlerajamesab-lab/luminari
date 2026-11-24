import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TRIBAL_LEADERSHIP_INSERT_SQL,
  TRIBAL_LEADERSHIP_LATEST_SQL,
  parse_tribal_leadership_response,
  tribal_leadership_refresh_due,
} from "./tribal-leadership-refresh";

// Real rows from the BIA directory export received 2026-11-24: Agdaagux
// (past next election), Jena (new chief elected 2026-10-01) and Thlopthlocco
// (leadership dispute listed with several names).
const fixture = JSON.parse(readFileSync(
  new URL("./__fixtures__/tribal_leadership_bia_2026-11-24_three_nations.json", import.meta.url),
  "utf8",
));
const migration = readFileSync(new URL(
  "../supabase/migrations/20261124100000_tribal_leadership_snapshot_v1.sql",
  import.meta.url,
), "utf8");
let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.tribal_leaders (
      member_key text primary key, tribe_full_name text, full_name text, title text,
      date_elected text, next_election text, source text, fetched_date text
    );
    insert into public.tribal_leaders values
      ('2f4a48ba-eb3b-493a-ab0d-4975d52360b9', 'Agdaagux Tribe of King Cove', 'Etta P Kuzakin',
       'President', '2013-12-01', '2025-12-31', 'BIA Tribal Leaders Directory', '2026-10-28');
  `);
  await database.exec(migration);
});

afterAll(async () => {
  await database.close();
});

describe("tribal leadership refresh", () => {
  it("shapes each nation's directory record verbatim", () => {
    const rows = parse_tribal_leadership_response(fixture, 1);
    expect(rows).toHaveLength(3);
    const jena = rows.find(row => row.tribe_full_name === "Jena Band of Choctaw Indians")!;
    expect(jena.leader_full_name).toBe("B. Cheryl Smith");
    expect(jena.title).toBe("Tribal Chief");
    expect(jena.date_elected).toBe("2026-10-01");
    expect(jena.record.blmregion).toBe("Eastern States");
    const dispute = rows.find(row => row.tribe_full_name === "Thlopthlocco Tribal Town")!;
    expect(dispute.title).toContain("Subject to Tribal Leadership Dispute");
  });

  it("refuses a pull that is short, truncated or duplicated", () => {
    expect(() => parse_tribal_leadership_response(fixture)).toThrow("tribal_leadership_too_few_nations");
    expect(() => parse_tribal_leadership_response({ ...fixture, exceededTransferLimit: true }, 1))
      .toThrow("tribal_leadership_truncated");
    expect(() => parse_tribal_leadership_response(
      { features: [fixture.features[0], fixture.features[0]] }, 1,
    )).toThrow("tribal_leadership_duplicate_tribe_name");
  });

  it("is due weekly, measured from the latest snapshot", () => {
    expect(tribal_leadership_refresh_due(null, "2026-11-24")).toBe(true);
    expect(tribal_leadership_refresh_due("2026-10-28", "2026-11-24")).toBe(true);
    expect(tribal_leadership_refresh_due("2026-11-20", "2026-11-24")).toBe(false);
  });

  it("adds a dated snapshot beside the earlier one and never overwrites", async () => {
    expect((await database.query<{ latest: string }>(TRIBAL_LEADERSHIP_LATEST_SQL)).rows[0].latest)
      .toBe("2026-10-28");
    const rows = parse_tribal_leadership_response(fixture, 1);
    const params = ["bia_tld_2026-11-24", "BIA live service", "abc", "2026-11-24", JSON.stringify(rows)];
    expect((await database.query(TRIBAL_LEADERSHIP_INSERT_SQL, params)).rows).toHaveLength(3);
    expect((await database.query(TRIBAL_LEADERSHIP_INSERT_SQL, params)).rows).toHaveLength(0);
    const agdaagux = await database.query<{ snapshot_id: string; bia_global_id: string }>(`
      select snapshot_id, bia_global_id from public.tribal_leadership_snapshot_v1
      where tribe_full_name = 'Agdaagux Tribe of King Cove' order by snapshot_id
    `);
    expect(agdaagux.rows).toEqual([
      { snapshot_id: "bia_tld_2026-10-28", bia_global_id: "2f4a48ba-eb3b-493a-ab0d-4975d52360b9" },
      { snapshot_id: "bia_tld_2026-11-24", bia_global_id: "007c512d-9dd8-4ab7-9469-ab4913de72e9" },
    ]);
    expect((await database.query<{ latest: string }>(TRIBAL_LEADERSHIP_LATEST_SQL)).rows[0].latest)
      .toBe("2026-11-24");
  });
});
