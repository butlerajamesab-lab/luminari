import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { read_benefits_resource_proof } from "./benefits-resource-proof";

const database = new PGlite();
const query = (sql: string, values: unknown[]) => database.query<any>(sql, values);

beforeAll(async () => {
  await database.exec(`
    create table api_source_registry (id text primary key, source_key text);
    create table normalized_civic_resource (
      id text primary key, source_id text, source_key text, resource_type text, name text,
      description text, organization_name text, agency_name text, address_line1 text,
      address_line2 text, city text, state text, postal_code text, latitude numeric,
      longitude numeric, geocode_precision text, phone text, email text, website_url text,
      eligibility_summary text, languages text[], accessibility_features text[],
      source_snapshot_hash text, updated_at timestamptz
    );
    insert into api_source_registry values ('dshs', 'wa_dshs_office_locator');
    insert into normalized_civic_resource (id, resource_type, name, source_key, latitude, longitude, geocode_precision)
      values ('office-1', 'benefits_office', 'Office A', 'wa_dshs_office_locator', 47, -122, 'rooftop'),
      ('office-2', 'benefits_office', 'Office B', 'wa_dshs_office_locator', null, null, null),
      ('other-office', 'benefits_office', 'Other state', 'different_source', 30, -80, 'street');
    insert into normalized_civic_resource (id, resource_type, name, source_id, latitude, longitude, geocode_precision)
      values ('office-3', 'benefits_office', 'Office C', 'dshs', 47, -122, 'street');
    insert into normalized_civic_resource (id, resource_type, name, phone, website_url, source_snapshot_hash)
      select 'food-' || n, 'food_bank', 'Food bank ' || lpad(n::text, 2, '0'), '555-0100', 'https://example.org/food', 'sample-hash'
      from generate_series(1, 23) n;
  `);
});
afterAll(() => database.close());

describe("Benefits resource proof over the recorded public source schema", () => {
  it("returns actual count and bounded cards, preserving contacts and source version", async () => {
    const result = await read_benefits_resource_proof("food_bank", "civicMapResourceProof", query);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(23);
    expect(result.resources).toHaveLength(20);
    expect(result.has_more).toBe(true);
    expect(result.resources[0]).toMatchObject({ id: "food-1", phone: "555-0100", source_snapshot_hash: "sample-hash" });
    expect(result.verification_status).toBe("source_attached_unverified");
    expect(result).not.toHaveProperty("verified_total");
  });

  it("counts unmapped offices and joins source identity without leaking another source", async () => {
    const result = await read_benefits_resource_proof("benefits_office", "benefitsDshsOfficeProof", query);
    expect(result).toMatchObject({ ok: true, total: 3, mapped: 2, unmapped: 1,
      precision_breakdown: { rooftop: 1, street: 1, other: 0 } });
    expect(result.offices.map((row: any) => row.id)).toEqual(["office-1", "office-2", "office-3"]);
  });

  it("distinguishes a failed read from a successful empty source", async () => {
    const unavailable = await read_benefits_resource_proof("food_bank", "civicMapResourceProof", async () => { throw new Error("database password must never reach the response"); });
    expect(unavailable).toMatchObject({ ok: false, total: null, mapped: null, precision_breakdown: null, rows: [] });
    expect(JSON.stringify(unavailable)).not.toContain("password");
    const empty = await read_benefits_resource_proof("food_bank", "civicMapResourceProof", async () => ({ rows: [{ total: 0, mapped: 0, rooftop: 0, street: 0, items: [] }] }));
    expect(empty).toMatchObject({ ok: true, total: 0, mapped: 0, precision_breakdown: { rooftop: 0, street: 0, other: 0 } });
  });
});
