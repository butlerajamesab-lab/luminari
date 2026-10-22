import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const proposal = readFileSync(new URL(
  "../supabase/proposals/20261020_civic_genome_rosetta_v12_admission_receipt.proposal.sql",
  import.meta.url,
), "utf8");
const bill_version_id = "11111111-1111-4111-8111-111111111111";
let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  // Isolated proposal unit harness: only the referenced parent key and roles.
  // This is not the full migration replay and never touches a Supabase project.
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.civic_genome_bill_version (bill_version_id uuid primary key);
    insert into public.civic_genome_bill_version values ('${bill_version_id}');
  `);
  await database.exec(proposal);
});
afterAll(async () => { await database?.close(); });

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    bill_version_id,
    source_document_key: "source:fixture",
    source_content_id: "22222222-2222-4222-8222-222222222222",
    source_document_id: 1,
    source_content_hash: "a".repeat(64),
    ruleset_version: "rosetta-rule-ref-v12",
    ruleset_sha256: "b".repeat(64),
    installed_ruleset_sha256: "b".repeat(64),
    read_contract_sha256: "c".repeat(64),
    selected_at: "2026-10-12T06:20:24Z",
    output_sha256: "d".repeat(64),
    certification_sha256: "e".repeat(64),
    admission_state: "admitted",
    admitted: true,
    reason: null,
    ...overrides,
  };
}
async function insert_receipt(row: Record<string, unknown>) {
  const keys = Object.keys(row);
  return database.query(
    `insert into public.civic_genome_rosetta_v12_admission_receipt
      (${keys.join(",")}) values (${keys.map((_, index) => "$" + (index + 1)).join(",")})
      returning admission_state, installed_ruleset_sha256, read_contract_sha256`,
    Object.values(row),
  );
}

describe("V12 admission SQL proposal executes and enforces its receipt contract", () => {
  it("accepts one complete admitted observation and retains mapped hashes", async () => {
    const result = await insert_receipt(receipt());
    expect(result.rows[0]).toEqual({
      admission_state: "admitted",
      installed_ruleset_sha256: "b".repeat(64),
      read_contract_sha256: "c".repeat(64),
    });
  });

  it.each([
    "source_content_id", "ruleset_version", "ruleset_sha256",
    "installed_ruleset_sha256", "read_contract_sha256", "selected_at",
    "output_sha256", "certification_sha256",
  ])("rejects admitted observations missing %s, including SQL NULL", async (key) => {
    await expect(insert_receipt(receipt({ [key]: null })))
      .rejects.toMatchObject({ code: "23514" });
  });

  it.each(["ruleset_sha256", "installed_ruleset_sha256", "read_contract_sha256"])(
    "rejects malformed %s hashes", async (key) => {
      await expect(insert_receipt(receipt({ [key]: "invalid" })))
        .rejects.toMatchObject({ code: "23514" });
    },
  );

  it("rejects installed/selected hash mismatches", async () => {
    await expect(insert_receipt(receipt({ installed_ruleset_sha256: "f".repeat(64) })))
      .rejects.toMatchObject({ code: "23514" });
  });

  it.each(["held", "failed", "rejected"])("retains explicit %s observations", async (state) => {
    const result = await insert_receipt(receipt({
      source_content_id: null, ruleset_version: null, ruleset_sha256: null,
      installed_ruleset_sha256: null, read_contract_sha256: null, selected_at: null,
      output_sha256: null, certification_sha256: null,
      admission_state: state, admitted: false, reason: "rosetta_v12_source_unavailable",
    }));
    expect(result.rows[0]).toMatchObject({ admission_state: state });
  });

  it("retains RLS and service-only read/append privileges", async () => {
    const result = await database.query(`
      select r.role_name,
        has_table_privilege(r.role_name, c.oid, 'SELECT') as can_select,
        has_table_privilege(r.role_name, c.oid, 'INSERT') as can_insert,
        has_table_privilege(r.role_name, c.oid, 'UPDATE,DELETE,TRUNCATE') as can_mutate,
        c.relrowsecurity as rls_enabled
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated'), ('service_role')) r(role_name)
      where n.nspname = 'public' and c.relname = 'civic_genome_rosetta_v12_admission_receipt'
      order by r.role_name
    `);
    expect(result.rows).toEqual([
      { role_name: "anon", can_select: false, can_insert: false, can_mutate: false, rls_enabled: true },
      { role_name: "authenticated", can_select: false, can_insert: false, can_mutate: false, rls_enabled: true },
      { role_name: "service_role", can_select: true, can_insert: true, can_mutate: false, rls_enabled: true },
    ]);
  });
});

