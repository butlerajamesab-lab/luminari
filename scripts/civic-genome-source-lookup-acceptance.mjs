/**
 * Disposable-PG-only planner/semantic proof for proposed source-ID indexes.
 * This does NOT replay the production lifecycle functions or certify any
 * Rosetta/Genome source publication. No live database credentials are allowed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";

const database = process.env.DATABASE_URL ?? "";
if (!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\//.test(database)) {
  throw new Error("civic_genome_lookup_acceptance_disposable_postgres_only");
}
if (process.env.LEGISCAN_API_KEY) throw new Error("provider_credential_not_allowed_in_acceptance");

const client = new pg.Client({ connectionString: database });
await client.connect();

const safeIntExpression = `case
  when coalesce(bill.structural_dna_json ->> 'source_bill_id', '') ~ '^[0-9]+$'
  then (bill.structural_dna_json ->> 'source_bill_id')::integer
  else null::integer
end`;
const textLookup = `select bill.bill_id from public.civic_genome_bill bill
  where bill.structural_dna_json ->> 'source_bill_id' = '1890233'`;
const numericLookup = `select bill.bill_id from public.civic_genome_bill bill
  join public.docket_bill_detail_cache cache
    on cache.bill_id = ${safeIntExpression}
  where cache.bill_id = 1890233`;

const explain = async sql =>
  (await client.query(`explain (analyze, buffers, format json) ${sql}`)).rows[0]["QUERY PLAN"][0];

const findScan = (node, indexName) =>
  (node["Index Name"] === indexName) ||
  (node.Plans ?? []).some(plan => findScan(plan, indexName));

try {
  await client.query(`create table public.civic_genome_bill (
    bill_id uuid primary key default gen_random_uuid(),
    structural_dna_json jsonb not null default '{}'::jsonb
  )`);
  await client.query(`create table public.docket_bill_detail_cache (bill_id integer primary key)`);
  await client.query(`insert into public.docket_bill_detail_cache values (1890233)`);
  await client.query(`insert into public.civic_genome_bill (structural_dna_json)
    select jsonb_build_object('source_bill_id',
      (case when source_id=40000 then 1890233 else source_id end)::text)
    from generate_series(1,40000) source_id`);
  await client.query(`insert into public.civic_genome_bill (structural_dna_json)
    values ('{"source_bill_id":"not_a_number"}'::jsonb), ('{}'::jsonb)`);
  await client.query("analyze public.civic_genome_bill");
  await client.query("analyze public.docket_bill_detail_cache");

  const beforeText = await explain(textLookup);
  const beforeNumeric = await explain(numericLookup);
  const source = readFileSync(
    "supabase/proposals/20261116_civic_genome_source_identity_lookup.proposal.sql",
    "utf8",
  );
  const statements = source.split(";").map(s => s.trim()).filter(Boolean);
  assert.equal(statements.length, 2, "only two no-write-content index proposals");
  for (const statement of statements) {
    assert.match(statement, /create index concurrently if not exists/i);
    await client.query(statement);
  }
  await client.query("analyze public.civic_genome_bill");

  const afterText = await explain(textLookup);
  const afterNumeric = await explain(numericLookup);
  assert.ok(findScan(afterText.Plan, "civic_genome_bill_source_id_text_lookup_v1"),
    "existing text source query should use expression index without rewriting");
  assert.ok(findScan(afterNumeric.Plan, "civic_genome_bill_source_id_safe_int_lookup_v1"),
    "existing guarded integer JOIN should use the safe-cast expression index");

  const count = async sql => Number((await client.query(sql)).rows[0].n);
  assert.equal(await count(`select count(*) n from public.civic_genome_bill`), 40002);
  assert.equal(await count(`select count(*) n from public.civic_genome_bill
      where structural_dna_json ->> 'source_bill_id' = '1890233'`), 1);
  assert.equal(await count(`select count(*) n from public.civic_genome_bill bill
      where ${safeIntExpression} = 1890233`), 1);
  assert.equal(await count(`select count(*) n from public.civic_genome_bill bill
      where ${safeIntExpression} is null`), 2);

  const validIndexes = await client.query(`
    select indexrelid::regclass::text as index_name,indisvalid,indisready
    from pg_index where indexrelid::regclass::text in
      ('civic_genome_bill_source_id_text_lookup_v1',
       'civic_genome_bill_source_id_safe_int_lookup_v1')`);
  assert.equal(validIndexes.rowCount, 2);
  for (const row of validIndexes.rows) {
    assert.equal(row.indisvalid, true);
    assert.equal(row.indisready, true);
  }
  console.log(JSON.stringify({
    acceptance: "passed",
    isolated_database_only: true,
    full_production_triggers_replayed: false,
    synthetic_rows: 40002,
    nonnumeric_source_ids_preserved: 2,
    proposal_indexes: validIndexes.rows,
    text_lookup: { before_ms: beforeText["Execution Time"], after_ms: afterText["Execution Time"] },
    numeric_join: { before_ms: beforeNumeric["Execution Time"], after_ms: afterNumeric["Execution Time"] },
  }));
} finally {
  await client.end();
}
