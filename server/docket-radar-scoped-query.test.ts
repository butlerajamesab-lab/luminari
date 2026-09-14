import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const source = readFileSync("server/routes/docket.ts", "utf8");
// Execute the actual route SQL, not a separately maintained approximation.
const query = source.match(/`(with requested\(source_bill_id\)[\s\S]*?)`,\s*\[bill_ids\]/)![1];
const canonicalQuery = `with requested(source_bill_id) as (select unnest($1::integer[])),
bill_genome as (
 select distinct on (source_bill_id) source_bill_id, genome_bill_id
 from public.civic_genome_bill_version where source_bill_id = any($1::integer[])
 order by source_bill_id, stage_rank desc, provider_sequence desc
)
select requested.source_bill_id, velocity.velocity_score, velocity.events_14d,
 velocity.amended_7d, next_event.next_event_date, next_event.next_event_class,
 next_event.next_event_description, drift.trait_class, drift.base_count,
 drift.latest_count, drift.delta, drift.base_has_trait_coverage, drift.latest_has_trait_coverage
from requested
left join public.docket_bill_velocity velocity using (source_bill_id)
left join bill_genome using (source_bill_id)
left join public.docket_bill_next_floor_event next_event on next_event.bill_id = requested.source_bill_id
left join public.docket_bill_drift_delta drift on drift.genome_bill_id = bill_genome.genome_bill_id`;

let db: PGlite;
beforeAll(async () => {
 db = new PGlite();
 await db.exec(`
 create table civic_genome_bill_version (
  genome_bill_id text, bill_version_id text primary key, source_bill_id integer,
  base_bill_version_id text, stage_rank integer, provider_sequence integer,
  created_at integer, assembly_run_id text, prism_verification_run_id text, processing_state text
 );
 create table civic_genome_prism_verification_binding (assembly_run_id text, trait_id text);
 create table civic_genome_trait (trait_id text primary key, trait_class text);
 create table docket_bill_velocity (source_bill_id integer, velocity_score integer, events_14d integer, amended_7d integer);
 create table docket_bill_next_floor_event (bill_id integer, next_event_date text, next_event_class text, next_event_description text);
 insert into civic_genome_bill_version values
 ('a','a0',1,null,0,0,0,'a0','p','verified'),
 ('a','a1',1,'a0',1,1,1,'a1','p','verified_with_findings'),
 ('a','a2',1,'a1',2,2,2,'a2','p','verified'),
 ('a','anull',1,null,null,null,3,'anull',null,'pending'),
 ('b','b0',2,null,0,0,0,'b0',null,'pending'),
 ('b','b1',2,'b0',1,1,1,'b1','p','verified'),
 ('c','c0',3,null,0,0,0,'c0','p','verified'),
 ('d','d0',4,null,0,0,0,null,null,'pending'),
 ('outside','o0',99,null,0,0,0,'o0','p','verified');
 insert into civic_genome_trait values ('h0','HELP'),('h2','HELP'),('old','OVERRIDES'),('new','WORKFLOW'),('other','DEFINITIONS');
 insert into civic_genome_prism_verification_binding values
 ('a0','h0'),('a0','h0'),('a0','old'),('a1','other'),('a2','h2'),('a2','new'),
 ('anull','other'),('b0','h0'),('b1','new'),('c0','h0'),('o0','other');
 insert into docket_bill_velocity values (1,3,2,1),(99,100,100,100);
 insert into docket_bill_next_floor_event values (1,'2026-09-15','floor_action','fixture'),(99,'2026-09-16','floor_action','outside');
 `);
 await db.exec(readFileSync("supabase/migrations/20260914082817_docket_drift_completed_verification_coverage.sql", "utf8"));
}, 30_000);
afterAll(async () => { await db?.close(); });

const sorted = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).sort();
describe("request-scoped Docket radar SQL", () => {
 it("matches canonical drift for removed/new classes, duplicate bindings, missing coverage, null ranks and absent bills", async () => {
  const ids = [1,2,3,4,777];
  const actual = (await db.query<Record<string, unknown>>(query, [ids])).rows;
  const expected = (await db.query(canonicalQuery, [ids])).rows;
  expect(sorted(actual)).toEqual(sorted(expected));
  expect(actual.find(r => r.source_bill_id === 1 && r.trait_class === "OVERRIDES"))
   .toMatchObject({ base_count: 1, latest_count: 0, delta: -1, base_has_trait_coverage: true, latest_has_trait_coverage: true });
  expect(actual.find(r => r.source_bill_id === 2)).toMatchObject({ base_has_trait_coverage: false });
  expect(actual.some(r => r.source_bill_id === 99)).toBe(false);
 });
 it("preserves an empty request", async () => {
  expect((await db.query(query, [[]])).rows).toEqual([]);
 });
 it("scopes before aggregation and retains the five-second budget", () => {
  expect(query).toContain("scoped_versions as materialized");
  expect(query).toContain("from selected_ids i");
  expect(query).toContain("count(distinct t.trait_id)");
  expect(query).not.toContain("public.docket_bill_drift_delta");
  expect(query).toMatch(/public.docket_bill_velocity\s+where source_bill_id = any\(\$1/);
  expect(query).toMatch(/public.docket_bill_next_floor_event\s+where bill_id = any\(\$1/);
  expect(source).toMatch(/label: "docket_radar_state_projection",\s*pool_acquire_timeout_ms: 1_000,\s*query_timeout_ms: 5_000/);
 });
});
