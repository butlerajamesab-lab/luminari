import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DOCKET_ROLL_CALL_PROJECTION_SQL,
  DOCKET_ROLL_CALL_VOTE_PROJECTION_SQL,
  docket_roll_call_projection_enabled,
} from "./docket-bill-roll-call-projection";

// Real corpus rows: GA HB79 (LegiScan bill 1926416) roll calls as stored in
// docket_bill_detail_cache, and the preserved archive record for roll call
// 1505526 (House passage, 2025-03-04) with all 180 individual votes.
const fixture = JSON.parse(readFileSync(
  new URL("./__fixtures__/docket_ga_hb79_roll_calls.json", import.meta.url),
  "utf8",
));
const migration = readFileSync(new URL(
  "../supabase/migrations/20261124080000_docket_roll_call_v1.sql",
  import.meta.url,
), "utf8");
const bill_id = fixture.cache_row.bill_id;
let database: PGlite;

async function project(): Promise<{ roll_calls: number; votes: number }> {
  const roll_calls = await database.query(DOCKET_ROLL_CALL_PROJECTION_SQL, [bill_id]);
  const votes = await database.query(DOCKET_ROLL_CALL_VOTE_PROJECTION_SQL, [bill_id]);
  return { roll_calls: roll_calls.rows.length, votes: votes.rows.length };
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
    create table public.docket_legiscan_bulk_member_receipt (
      archive_sha256 text not null, member_path text not null,
      member_sha256 text not null, member_kind text not null,
      provider_record_id bigint, bill_id integer, session_id integer,
      state text, change_hash text, payload_sha256 text, payload_json jsonb,
      source_observed_at timestamptz, imported_at timestamptz, disposition text,
      primary key (archive_sha256, member_path)
    );
  `);
  await database.exec(migration);
  const row = fixture.cache_row;
  await database.query(
    "insert into public.docket_bill_detail_cache values ($1, $2::jsonb, $3::timestamptz, $4)",
    [row.bill_id, JSON.stringify(row.bill), row.fetched_at, row.source],
  );
  const receipt = fixture.roll_call_receipt;
  await database.query(
    `insert into public.docket_legiscan_bulk_member_receipt
       (archive_sha256, member_path, member_sha256, member_kind, provider_record_id,
        state, payload_sha256, payload_json, disposition)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [receipt.archive_sha256, receipt.member_path, receipt.member_sha256, receipt.member_kind,
      receipt.provider_record_id, receipt.state, receipt.payload_sha256,
      JSON.stringify(receipt.payload_json), receipt.disposition],
  );
});
afterAll(async () => { await database?.close(); });

describe("Docket roll call projection (GA HB79, real corpus rows)", () => {
  it("projects both roll calls and all 180 House passage votes with provenance", async () => {
    expect(await project()).toEqual({ roll_calls: 2, votes: 180 });
    const { rows: calls } = await database.query<Record<string, unknown>>(
      `select roll_call_id::int as roll_call_id, chamber, vote_date::text as vote_date,
              yea, nay, nv, absent, total, passed, state_link
         from public.docket_roll_call_v1 order by vote_date`,
    );
    expect(calls[0]).toMatchObject({
      roll_call_id: 1505526, chamber: "H", vote_date: "2025-03-04",
      yea: 165, nay: 8, nv: 2, absent: 5, total: 180, passed: true,
      state_link: "https://www.legis.ga.gov/legislation/69411#24987",
    });
    expect(calls[1]).toMatchObject({ roll_call_id: 1535487, chamber: "S", yea: 31, nay: 24 });

    // Individual votes reproduce the official tally exactly.
    const { rows: tally } = await database.query<{ vote_text: string; n: number }>(
      `select vote_text, count(*)::int as n from public.docket_roll_call_vote_v1
        where roll_call_id = 1505526 group by 1 order by 1`,
    );
    expect(Object.fromEntries(tally.map(row => [row.vote_text, row.n])))
      .toEqual({ Absent: 5, Nay: 8, NV: 2, Yea: 165 });

    // Sponsor Rep. Mark Newton (people_id 18895) voted Yea, traceable to the archive.
    const { rows: newton } = await database.query<Record<string, unknown>>(
      `select vote_text, member_path, member_sha256 from public.docket_roll_call_vote_v1
        where roll_call_id = 1505526 and people_id = 18895`,
    );
    expect(newton[0]).toEqual({
      vote_text: "Yea",
      member_path: "GA/2025-2026_Regular_Session/vote/1505526.json",
      member_sha256: "23eb4d62c6752aeaa08c47dbdb812c8e10a5cfedbd68a390dc7698f08f9e75f2",
    });
  });

  it("is idempotent and an older snapshot cannot overwrite a newer roll call", async () => {
    expect(await project()).toEqual({ roll_calls: 2, votes: 0 });
    await database.query(
      "update public.docket_bill_detail_cache set fetched_at = fetched_at - interval '30 days' where bill_id = $1",
      [bill_id],
    );
    expect(await project()).toEqual({ roll_calls: 0, votes: 0 });
  });

  it("never mixes archive copies: one copy per projection, newest import wins, pointer recorded", async () => {
    // A second, later copy of the same real roll call that lists one fewer vote.
    const receipt = fixture.roll_call_receipt;
    const later = { ...receipt.payload_json, votes: receipt.payload_json.votes.slice(1) };
    await database.query(
      "update public.docket_legiscan_bulk_member_receipt set imported_at = '2026-11-07T00:00:00Z'",
    );
    await database.query(
      `insert into public.docket_legiscan_bulk_member_receipt
         (archive_sha256, member_path, member_sha256, member_kind, provider_record_id,
          state, payload_json, disposition, imported_at)
       values ($1, $2, $3, 'roll_call', $4, 'GA', $5::jsonb, 'source_preserved', '2026-11-20T00:00:00Z')`,
      ["f".repeat(64), receipt.member_path, "e".repeat(64), receipt.provider_record_id, JSON.stringify(later)],
    );
    await database.query(
      "update public.docket_bill_detail_cache set fetched_at = fetched_at + interval '60 days' where bill_id = $1",
      [bill_id],
    );
    expect(await project()).toEqual({ roll_calls: 2, votes: 179 });
    const { rows: copies } = await database.query<{ member_sha256: string; n: number }>(
      `select member_sha256, count(*)::int as n from public.docket_roll_call_vote_v1
        where roll_call_id = 1505526 group by 1 order by 1`,
    );
    // Both complete copies kept side by side, nothing deleted, nothing mixed.
    expect(copies).toEqual([
      { member_sha256: receipt.member_sha256, n: 180 },
      { member_sha256: "e".repeat(64), n: 179 },
    ]);
    const { rows: pointer } = await database.query<{ vote_member_sha256: string }>(
      "select vote_member_sha256 from public.docket_roll_call_v1 where roll_call_id = 1505526",
    );
    expect(pointer[0].vote_member_sha256).toBe("e".repeat(64));
    await database.query(
      "delete from public.docket_legiscan_bulk_member_receipt where archive_sha256 = $1",
      ["f".repeat(64)],
    );
  });

  it("ignores an archive record that names a different bill", async () => {
    await database.query(
      `update public.docket_legiscan_bulk_member_receipt
          set payload_json = jsonb_set(payload_json, '{bill_id}', '999')`,
    );
    await database.query("delete from public.docket_roll_call_vote_v1");
    expect((await database.query(DOCKET_ROLL_CALL_VOTE_PROJECTION_SQL, [bill_id])).rows.length).toBe(0);
  });

  it("is opt-in and closed to public roles", async () => {
    expect(docket_roll_call_projection_enabled({})).toBe(false);
    expect(docket_roll_call_projection_enabled({ DOCKET_ROLL_CALL_PROJECTION_ENABLED: "true" })).toBe(true);
    const { rows } = await database.query<Record<string, boolean>>(
      `select has_table_privilege('anon', 'public.docket_roll_call_v1', 'select') as anon_calls,
              has_table_privilege('anon', 'public.docket_roll_call_vote_v1', 'select') as anon_votes,
              has_table_privilege('service_role', 'public.docket_roll_call_vote_v1', 'insert') as service_votes`,
    );
    expect(rows[0]).toEqual({ anon_calls: false, anon_votes: false, service_votes: true });
  });
});
