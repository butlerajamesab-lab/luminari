#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import "dotenv/config";
import { create_pool, repo_root } from "./lib/corpus-audit-utils.mjs";

const SOURCE_TABLE = "resource_directory_docx_import";
const SOURCE_FAMILY_KEY = "address_audit_supplement";

function parseArgs(argv = process.argv.slice(2)) {
  const args = { input: null, apply: false, batchSize: 100, limit: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    else if (arg.startsWith("--input=")) args.input = arg.slice(8);
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--batch-size") args.batchSize = Number(argv[++i]);
    else if (arg.startsWith("--batch-size=")) args.batchSize = Number(arg.slice(13));
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice(8));
  }
  if (!args.input) throw new Error("missing --input <json-file>");
  return args;
}

function clean(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).replace(/\s+/g, " ").trim();
  if (!v) return null;
  if (/^not published/i.test(v)) return null;
  return v;
}

function makeSourcePk(row, index) {
  const jurisdiction = clean(row.jurisdiction) || "unknown";
  const base = clean(row.code) || clean(row.name) || `resource-${index + 1}`;
  return `${jurisdiction}:${base}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
}

function normalizeRow(row, index) {
  const source_pk = clean(row.source_pk) || makeSourcePk(row, index);
  const source_hash = clean(row.source_hash) || crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
  return {
    source_pk,
    source_hash,
    jurisdiction: clean(row.jurisdiction),
    name: clean(row.name),
    code: clean(row.code),
    service_type: clean(row.service_type),
    address: clean(row.address),
    phone: clean(row.phone),
    email: clean(row.email),
    website: clean(row.website),
    filing_portal: clean(row.filing_portal),
    description: clean(row.description),
    statutory_authority: clean(row.statutory_authority),
    city: clean(row.city),
    state: clean(row.addr_state || row.state),
    postal_code: clean(row.postal_code),
    source_file: clean(row.source_file),
    verified: Boolean(row.verified || String(row.raw_status || "").toLowerCase() === "verified"),
  };
}

function readRows(input, limit) {
  const file = path.isAbsolute(input) ? input : path.join(repo_root, input);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  if (!Array.isArray(rows)) throw new Error("input must be a JSON array or object with rows array");
  const normalized = rows.map(normalizeRow).filter((row) => row.name && row.source_pk);
  return limit ? normalized.slice(0, limit) : normalized;
}

function chunks(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function importBatch(pool, rows) {
  const sql = `
    with input as (
      select * from jsonb_to_recordset($1::jsonb) as x(
        source_pk text, source_hash text, jurisdiction text, name text, code text,
        service_type text, address text, phone text, email text, website text,
        filing_portal text, description text, statutory_authority text,
        city text, state text, postal_code text, source_file text, verified boolean
      )
    ), entity_insert as (
      insert into public.luminari_resource_entities (
        resource_entity_id, canonical_id, source_family_key, source_table, source_pk, source_hash,
        resource_name, resource_type, resource_category, layer, jurisdiction, jurisdiction_scope,
        state, city, description, apply_notes, service_categories, domains, metadata,
        verification_status, promotion_status, provenance_status, created_at, updated_at
      )
      select gen_random_uuid(), 'rd2026:' || source_pk, $2, $3, source_pk, source_hash,
        name, 'agency', service_type, 'verified_resource_directory', jurisdiction, 'state',
        state, city, description, filing_portal, array_remove(array[service_type], null),
        jsonb_build_object('filing_portal', filing_portal, 'statutory_authority', statutory_authority, 'source_code', code),
        jsonb_build_object('source_file', source_file, 'address', address, 'phone', phone, 'email', email, 'website', website, 'filing_portal', filing_portal),
        case when verified then 'verified' else 'unverified' end, 'runtime_readable', 'source_attached', now(), now()
      from input
      where not exists (select 1 from public.luminari_resource_entities e where e.source_table = $3 and e.source_pk = input.source_pk)
      returning resource_entity_id, source_pk
    ), all_entities as (
      select resource_entity_id, source_pk from entity_insert
      union all
      select e.resource_entity_id, e.source_pk from public.luminari_resource_entities e join input i on i.source_pk = e.source_pk where e.source_table = $3
    ), location_insert as (
      insert into public.luminari_resource_locations (location_id, resource_entity_id, address_line1, city, state, postal_code, country, coordinate_quality, geocode_source, source_table, source_pk, metadata, created_at)
      select gen_random_uuid(), e.resource_entity_id, i.address, i.city, i.state, i.postal_code, 'US', 'ungeocoded', $3, $3, i.source_pk, jsonb_build_object('source_file', i.source_file, 'source_code', i.code), now()
      from input i join all_entities e using (source_pk)
      where i.address is not null and not exists (select 1 from public.luminari_resource_locations l where l.source_table = $3 and l.source_pk = i.source_pk)
      returning location_id
    ), contact_rows as (
      select source_pk || ':phone' as source_pk, source_pk as parent_pk, 'phone' as contact_type, phone as contact_value, 'phone' as label from input where phone is not null
      union all select source_pk || ':email', source_pk, 'email', email, 'email' from input where email is not null
      union all select source_pk || ':website', source_pk, 'website', website, 'website' from input where website is not null
      union all select source_pk || ':filing_portal', source_pk, 'filing_portal', filing_portal, 'filing / complaint portal' from input where filing_portal is not null
    ), contact_insert as (
      insert into public.luminari_resource_contact_points (contact_point_id, resource_entity_id, canonical_id, contact_type, contact_value, label, is_primary, contact_quality, source_table, source_pk, source_hash, metadata, created_at)
      select gen_random_uuid(), e.resource_entity_id, 'rd2026:' || c.source_pk, c.contact_type, c.contact_value, c.label, c.contact_type in ('phone','website'), 'verified_source', $3, c.source_pk, i.source_hash, jsonb_build_object('source_resource_pk', i.source_pk, 'source_file', i.source_file, 'source_code', i.code), now()
      from contact_rows c join input i on i.source_pk = c.parent_pk join all_entities e on e.source_pk = c.parent_pk
      where not exists (select 1 from public.luminari_resource_contact_points cp where cp.source_table = $3 and cp.source_pk = c.source_pk)
      returning contact_point_id
    )
    select (select count(*)::int from input) as input_rows,
           (select count(*)::int from entity_insert) as inserted_entities,
           (select count(*)::int from location_insert) as inserted_locations,
           (select count(*)::int from contact_insert) as inserted_contact_points;
  `;
  const result = await pool.query(sql, [JSON.stringify(rows), SOURCE_FAMILY_KEY, SOURCE_TABLE]);
  return result.rows[0];
}

async function main() {
  const started = Date.now();
  const args = parseArgs();
  const rows = readRows(args.input, args.limit);
  const summary = { mode: args.apply ? "apply" : "dry_run", input_rows: rows.length, batches: [], inserted_entities: 0, inserted_locations: 0, inserted_contact_points: 0 };
  if (!args.apply) {
    console.log(JSON.stringify({ status: "completed", summary }, null, 2));
    return;
  }
  const { pool, databaseStatus } = create_pool("resource-directory-json-import");
  if (!pool) throw new Error(databaseStatus);
  try {
    for (const [index, batch] of chunks(rows, args.batchSize).entries()) {
      const result = await importBatch(pool, batch);
      summary.batches.push({ index, ...result });
      summary.inserted_entities += Number(result.inserted_entities || 0);
      summary.inserted_locations += Number(result.inserted_locations || 0);
      summary.inserted_contact_points += Number(result.inserted_contact_points || 0);
    }
  } finally {
    await pool.end();
  }
  summary.runtime_ms = Date.now() - started;
  console.log(JSON.stringify({ status: "completed", summary }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
