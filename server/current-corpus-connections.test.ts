import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const bridge = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ query_with_diagnostics: bridge.query }));
vi.mock("./_core/env", () => ({ ENV: { lighthouseSupabaseUrl: "https://luminari.test" } }));
import {
  read_current_graph_source,
  read_current_graph_node_page,
  read_current_graph_edge_page,
  read_current_unresolved_relationship_page,
} from "./services/current-corpus-page-reader";
import { architecture_layer_route, current_object_inspection_route } from "../shared/architecture-routes";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  bridge.query.mockImplementation((query: string, values: unknown[]) => db.query(query, values));
  await db.exec(`
    create table v_lighthouse_graph_nodes_v1 (
      node_id text primary key,node_type text,label text,jurisdiction_code text,node_origin text,
      node_state text,object_ref text,artifact_key text,source_locator text,
      source_content_sha256 text,source_candidate_hash text,metadata jsonb
    );
    insert into v_lighthouse_graph_nodes_v1 values
      ('object:a','organization','Colorado agency','CO','civic_object','ready','ref-a','source-a','P12','sha-a','candidate-a','{}'),
      ('object:b','workflow','Colorado wage path','CO','civic_object','held','ref-b','source-a','P13','sha-a','candidate-b','{}'),
      ('object:c','organization','Alaska agency','AK','civic_object','ready','ref-c','source-c','P99','sha-c','candidate-c','{}');
    create table v_lighthouse_civic_object_current_v1 (
      civic_object_uid text,object_ref text,object_class text,name text,organization_name text,
      artifact_key text,state_code text,jurisdiction text
    );
    insert into v_lighthouse_civic_object_current_v1 values
      ('a','ref-a','organization','Colorado agency',null,'source-a','CO',null),
      ('b','ref-b','workflow','Colorado wage path',null,'source-a','CO',null),
      ('c','ref-c','organization','Alaska agency',null,'source-c','AK',null);
    alter table v_lighthouse_civic_object_current_v1 add column run_id text,add column source_content_sha256 text,
      add column source_candidate_hash text,add column source_locator text,add column category text;
    update v_lighthouse_civic_object_current_v1 set run_id='run-'||civic_object_uid,
      source_content_sha256='sha-'||civic_object_uid,source_candidate_hash='candidate-'||civic_object_uid;
    create table luminari_corpus_source_artifact_v1 (artifact_key text primary key,object_name text);
    insert into luminari_corpus_source_artifact_v1 values ('source-a','Colorado source.json'),('source-c','Alaska source.json');
    create table luminari_resource_transcription_revision_v1 (
      revision_id text primary key,civic_object_uid text,operation text,supersedes_revision_id text
    );
    create table luminari_resource_category_revision_v1 (
      revision_id text primary key,civic_object_uid text,operation text,supersedes_revision_id text
    );
    -- This fixture is the existing classified projection's read contract. Its
    -- ledger guard/migration behavior has separate PostgreSQL regression tests.
    create table v_lighthouse_resource_program_classified_v1 (
      civic_object_uid text,object_ref text,run_id text,artifact_key text,source_content_sha256 text,
      source_candidate_hash text,source_locator text,name text,organization_name text,
      reviewed_primary_category text,reviewed_category_memberships text[],source_transcription_correction jsonb,
      category_review jsonb,person_facing_ready boolean,object_class text
    );
    insert into luminari_resource_transcription_revision_v1 values ('tr-d','d','correct',null);
    insert into luminari_resource_category_revision_v1 values ('cat-d','d','classify',null);
    insert into v_lighthouse_graph_nodes_v1 values
      ('object:d','resource','📞 303-297-1815','CO','civic_object','held','ref-d','source-d','P10','sha-d','candidate-d','{"category":"cash_assistance_income","typed_ready":false}');
    insert into v_lighthouse_civic_object_current_v1 values
      ('d','ref-d','resource','📞 303-297-1815','📞 303-297-1815','source-d','CO',null,'run-d','sha-d','candidate-d','P10','cash_assistance_income');
    insert into luminari_corpus_source_artifact_v1 values ('source-d','Denver source.docx');
    alter table luminari_corpus_source_artifact_v1 add column artifact_role text,add column semantic_family text,
      add column content_sha256 text,add column extraction_status text,add column bucket_id text,
      add column storage_state text,add column storage_updated_at timestamptz;
    update luminari_corpus_source_artifact_v1 set artifact_role='canonical_source',semantic_family='registry',
      content_sha256='sha-'||right(artifact_key,1),extraction_status='fresh_complete',bucket_id='docs',storage_state='active',
      storage_updated_at='2026-09-14T12:00:00.123456Z';
    create schema storage;
    create table storage.buckets (id text primary key,public boolean);
    insert into storage.buckets values ('docs',true);
    create table storage.objects (id text,bucket_id text,name text,updated_at timestamptz);
    insert into storage.objects select artifact_key,bucket_id,object_name,storage_updated_at from luminari_corpus_source_artifact_v1;
    insert into v_lighthouse_resource_program_classified_v1 values
      ('d','ref-d','run-d','source-d','sha-d','candidate-d','P10','Denver Rescue Mission','Denver Rescue Mission',
       'housing',array['housing','food_nutrition'],'{"revision_id":"tr-d","review_scope":"source_assertion_only"}',
       '{"revision_id":"cat-d","review_scope":"navigation_classification_only"}',true,'resource');
    create table v_lighthouse_graph_relationship_edges_v1 (
      edge_id text primary key,from_node_id text,to_node_id text,edge_type text,evidence_state text,evidence_hash text,metadata jsonb
    );
    insert into v_lighthouse_graph_relationship_edges_v1 values
      ('e1','object:a','object:b','administers','source_bound','hash1','{}'),
      ('e2','object:c','object:a','refers_to','review_pending','hash2','{}'),
      ('ed','object:d','artifact:'||md5('source-d'),'sourced_from','source_bound','hash-d','{}');
    create view v_lighthouse_graph_edges_v2 as select * from v_lighthouse_graph_relationship_edges_v1;
    create table v_lighthouse_graph_unresolved_relationships_v1 (
      declaration_id text primary key,from_node_id text,intended_edge_type text,source_field text,
      target_reference text,resolution_state text,target_match_count int,evidence_hash text,metadata jsonb
    );
    insert into v_lighthouse_graph_unresolved_relationships_v1 values
      ('u1','object:a','appeal_to','oversight','missing-office','unresolved',0,'uh1','{}'),
      ('u2','object:c','appeal_to','oversight','another-office','unresolved',0,'uh2','{}'),
      ('ud','object:d','contact','agency','missing-office','unresolved',0,'uhd','{}');
  `);
}, 20_000);
afterAll(async () => { await db?.close(); });

describe("current object connection traversal", () => {
  it("uses current jurisdiction anchors without inventing a bound document", async () => {
    expect((await read_current_graph_node_page({ node_id: 'jurisdiction:CO' })).items[0]).toMatchObject({
      node_id: 'jurisdiction:CO',node_type: 'jurisdiction',label: 'CO',jurisdiction_code: 'CO',
      node_origin: 'derived_anchor',node_state: 'ready',artifact_key: null,source_content_sha256: null,
      metadata: { basis: 'current_civic_object_jurisdiction' },presentation: null,
    });
    expect((await read_current_graph_node_page({ node_type: 'jurisdiction' })).total).toBe(2);
    expect((await read_current_graph_node_page({ node_id: 'jurisdiction:missing' })).total).toBe(0);
    const calls_before = bridge.query.mock.calls.length;
    expect((await read_current_graph_source('jurisdiction:CO')).source_access).toEqual({ status: 'source_not_registered',url: null });
    expect(bridge.query.mock.calls.length).toBe(calls_before);
  });
  it("reads exact artifact anchors without hydrating civic object payloads or creating anchors for unused storage", async () => {
    const node_id = 'artifact:' + (await db.query<{ hash: string }>("select md5('source-d') as hash")).rows[0].hash;
    const page = await read_current_graph_node_page({ node_id, limit: 1 });
    expect(page).toMatchObject({ total: 1, items: [{ node_id, node_type: 'source_artifact',label: 'Denver source.docx',
      node_origin: 'derived_anchor',node_state: 'ready',object_ref: null,jurisdiction_code: null,
      artifact_key: 'source-d',source_locator: 'artifact:0',source_content_sha256: 'sha-d',source_candidate_hash: null,
      metadata: { artifact_role: 'canonical_source',semantic_family: 'registry',extraction_status: 'fresh_complete' },presentation: null }] });
    await db.exec("insert into luminari_corpus_source_artifact_v1 (artifact_key,object_name) values ('unused','Unused source.docx')");
    expect((await read_current_graph_node_page({ node_type: 'source_artifact' })).total).toBe(3);
    expect((await read_current_graph_node_page({ node_type: 'source_artifact',query: 'Denver',offset: 99 })).total).toBe(1);
    expect((await read_current_graph_node_page({ node_type: 'resource',node_id })).total).toBe(0);
    expect((await read_current_graph_node_page({ node_id: 'artifact:missing' })).total).toBe(0);
    await db.exec("delete from luminari_corpus_source_artifact_v1 where artifact_key='unused'");
  });
  it("retains an artifact anchor when its registry metadata is missing and preserves observed extraction state", async () => {
    await db.exec("insert into v_lighthouse_civic_object_current_v1 (civic_object_uid,object_ref,artifact_key) values ('missing-source','missing-ref','missing-registry')");
    expect((await read_current_graph_node_page({ node_type: 'source_artifact',query: 'missing-registry' })).items[0]).toMatchObject({
      label: 'missing-registry',node_state: 'ready',source_content_sha256: null,metadata: { extraction_status: null },
    });
    await db.exec("update luminari_corpus_source_artifact_v1 set extraction_status='stale_source' where artifact_key='source-d'");
    expect((await read_current_graph_node_page({ node_type: 'source_artifact',query: 'Denver' })).items[0].node_state).toBe('observed');
    await db.exec("update luminari_corpus_source_artifact_v1 set extraction_status='fresh_complete' where artifact_key='source-d'; delete from v_lighthouse_civic_object_current_v1 where civic_object_uid='missing-source'");
  });
  it("opens only a unique current source binding with public, active, exact-version storage", async () => {
    const artifact_node = 'artifact:' + (await db.query<{ hash: string }>("select md5('source-d') as hash")).rows[0].hash;
    for (const node_id of [artifact_node,'object:d']) {
      expect(await read_current_graph_source(node_id)).toMatchObject({ source_access: { status: 'public_source_available',url: 'https://luminari.test/storage/v1/object/public/docs/Denver%20source.docx' } });
    }
    await db.exec("update storage.buckets set public=false");
    expect((await read_current_graph_source(artifact_node)).source_access).toEqual({ status: 'source_access_restricted',url: null });
    await db.exec("update storage.buckets set public=true; update storage.objects set updated_at='2026-09-14T12:00:00.123457Z' where id='source-d'");
    expect((await read_current_graph_source(artifact_node)).source_access).toEqual({ status: 'source_version_unresolved',url: null });
    await db.exec("update storage.objects set updated_at='2026-09-14T12:00:00.123456Z' where id='source-d'; update luminari_corpus_source_artifact_v1 set content_sha256='changed' where artifact_key='source-d'");
    expect((await read_current_graph_source('object:d')).source_access.url).toBeNull();
    await db.exec("update luminari_corpus_source_artifact_v1 set content_sha256='sha-d' where artifact_key='source-d'; insert into v_lighthouse_civic_object_current_v1 (civic_object_uid,artifact_key,source_content_sha256) values ('d','source-c','sha-c')");
    expect((await read_current_graph_source('object:d')).source_access.url).toBeNull();
    await db.exec("delete from v_lighthouse_civic_object_current_v1 where civic_object_uid='d' and artifact_key='source-c'");
    expect((await read_current_graph_source('artifact:missing')).source_access.url).toBeNull();
  });
  it("traverses all 52 incoming source edges and returns to the reviewed resource without changing evidence", async () => {
    const node_id = 'artifact:' + (await db.query<{ hash: string }>("select md5('source-d') as hash")).rows[0].hash;
    await db.exec(`insert into v_lighthouse_civic_object_current_v1 (civic_object_uid,object_ref,object_class,name,artifact_key)
      select 'batch-'||i,'ref-batch-'||i,'resource','Other source resource '||i,'source-d' from generate_series(1,51) i;
      insert into v_lighthouse_graph_relationship_edges_v1
      select 'batch-edge-'||i,'object:batch-'||i,'artifact:'||md5('source-d'),'sourced_from','source_bound','batch-hash-'||i,'{}'::jsonb from generate_series(1,51) i`);
    const pages = await Promise.all([0,25,50].map(offset => read_current_graph_edge_page({ node_id,limit: 25,offset })));
    expect(pages.map(page => [page.total,page.items.length])).toEqual([[52,25],[52,25],[52,2]]);
    expect(new Set(pages.flatMap(page => page.items.map(item => item.edge_id))).size).toBe(52);
    expect(pages[2].items.find(item => item.edge_id === 'ed')).toMatchObject({
      from_node_id: 'object:d',from_label: 'Denver Rescue Mission',to_node_id: node_id,to_label: 'Denver source.docx',evidence_hash: 'hash-d',
      from_presentation: { source_transcription_correction: { revision_id: 'tr-d' },category_review: { revision_id: 'cat-d' } },
    });
    expect((await read_current_graph_node_page({ node_id: 'object:d' })).items[0].label).toBe('Denver Rescue Mission');
    await db.exec("delete from v_lighthouse_graph_relationship_edges_v1 where edge_id like 'batch-edge-%'; delete from v_lighthouse_civic_object_current_v1 where civic_object_uid like 'batch-%'");
  });
  it("filters the full class and retains its total beyond the last page", async () => {
    const first = await read_current_graph_node_page({ node_type: "organization", limit: 1 });
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    const beyond = await read_current_graph_node_page({ node_type: "organization", limit: 1, offset: 99 });
    expect(beyond).toMatchObject({ total: 2, items: [] });
  });
  it("opens an exact identity without replacing it with a similar label", async () => {
    const page = await read_current_graph_node_page({ node_id: "object:b" });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ node_id: "object:b", node_state: "held", source_locator: "P13" });
    expect((await read_current_graph_node_page({ node_id: "object:missing" })).items).toEqual([]);
  });
  it("binds search text as a parameter", async () => {
    expect((await read_current_graph_node_page({ query: "CO", node_type: "organization" })).total).toBe(1);
    expect((await read_current_graph_node_page({ query: "' OR true --" })).total).toBe(0);
  });
  it("includes incoming and outgoing edges with their original evidence states", async () => {
    const page = await read_current_graph_edge_page({ node_id: "object:a", semantic_only: true });
    expect(page.total).toBe(2);
    expect(page.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ from_node_id: "object:a", to_node_id: "object:b", to_label: "Colorado wage path", to_node_type: "workflow", evidence_state: "source_bound" }),
      expect.objectContaining({ from_node_id: "object:c", to_node_id: "object:a", from_label: "Alaska agency", evidence_state: "review_pending" }),
    ]));
    expect((await read_current_graph_edge_page({ node_id: "object:a", offset: 99 })).total).toBe(2);
  });
  it("pages edges before resolving thin endpoint labels and preserves an unknown target", async () => {
    await db.exec(`insert into v_lighthouse_graph_relationship_edges_v1 values
      ('e3','object:b','jurisdiction:CO','within_jurisdiction','source_bound','hash3','{}'),
      ('e4','object:b','artifact:' || md5('source-a'),'sourced_from','source_bound','hash4','{}'),
      ('e5','object:b','object:missing','unknown_target','unresolved','hash5','{}')`);
    const page = await read_current_graph_edge_page({ node_id: "object:b", limit: 10 });
    expect(page.total).toBe(4);
    expect(page.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ edge_id: "e3", to_label: "CO", to_node_type: "jurisdiction" }),
      expect.objectContaining({ edge_id: "e4", to_label: "Colorado source.json", to_node_type: "source_artifact" }),
      expect.objectContaining({ edge_id: "e5", to_node_id: "object:missing", to_label: null, to_node_type: null }),
    ]));
    const first = await read_current_graph_edge_page({ node_id: "object:b", limit: 1 });
    const second = await read_current_graph_edge_page({ node_id: "object:b", limit: 1, offset: 1 });
    expect(first.total).toBe(4);
    expect(first.items).toHaveLength(1);
    expect(first.items[0].edge_id).not.toBe(second.items[0].edge_id);
    const beyond = await read_current_graph_edge_page({ node_id: "object:b", offset: 99 });
    expect(beyond).toMatchObject({ total: 4, items: [] });
    await db.exec("delete from v_lighthouse_graph_relationship_edges_v1 where edge_id in ('e3','e4','e5')");
  });
  it("does not inflate the edge window when one endpoint has conflicting current identities", async () => {
    await db.exec("insert into v_lighthouse_civic_object_current_v1 (civic_object_uid,object_ref,object_class,name,organization_name,artifact_key,state_code,jurisdiction) values ('b','ref-other','agency','Conflicting identity',null,'source-a','CO',null)");
    const page = await read_current_graph_edge_page({ node_id: "object:a" });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items.find(item => item.edge_id === "e1")).toMatchObject({ to_label: null, to_node_type: null });
    await db.exec("delete from v_lighthouse_civic_object_current_v1 where object_ref='ref-other'");
  });
  it("scopes unresolved declarations to the selected identity", async () => {
    const page = await read_current_unresolved_relationship_page({ node_id: "object:a" });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ declaration_id: "u1", target_reference: "missing-office" });
    expect((await read_current_unresolved_relationship_page({ node_id: "object:a", offset: 99 })).total).toBe(1);
  });
  it("resolves a repeated unresolved source once without losing its label", async () => {
    await db.exec("insert into v_lighthouse_graph_unresolved_relationships_v1 values ('u3','object:a','contact','agency','missing-second','unresolved',0,'uh3','{}')");
    const page = await read_current_unresolved_relationship_page({ node_id: "object:a" });
    expect(page.total).toBe(2);
    expect(page.items.every(item => item.from_label === "Colorado agency")).toBe(true);
    await db.exec("delete from v_lighthouse_graph_unresolved_relationships_v1 where declaration_id='u3'");
  });
  it("shares identical in-flight reads without retaining a failed or completed snapshot", async () => {
    const calls_before = bridge.query.mock.calls.length;
    const [first, same] = await Promise.all([
      read_current_graph_edge_page({ node_id: "object:a", limit: 3 }),
      read_current_graph_edge_page({ node_id: "object:a", limit: 3 }),
    ]);
    expect(first).toEqual(same);
    expect(bridge.query.mock.calls.length - calls_before).toBe(1);
    await read_current_graph_edge_page({ node_id: "object:a", limit: 3 });
    expect(bridge.query.mock.calls.length - calls_before).toBe(2);
    bridge.query.mockRejectedValueOnce(new Error("temporary source failure"));
    await expect(read_current_graph_edge_page({ node_id: "object:a", limit: 3 })).rejects.toThrow("temporary source failure");
    expect((await read_current_graph_edge_page({ node_id: "object:a", limit: 3 })).total).toBe(2);
  });
  it("routes claim and proof layers to their actual pages and preserves object IDs", () => {
    expect(architecture_layer_route("claim_elements")).toBe("/claim-elements");
    expect(architecture_layer_route("proof_frameworks")).toBe("/proof-frameworks");
    const url = new URL(current_object_inspection_route("organization", "object:source/a?b=c"), "https://luminari.test");
    expect(url.searchParams.get("object_class")).toBe("organization");
    expect(url.searchParams.get("node_id")).toBe("object:source/a?b=c");
  });
  it("uses the exact reviewed resource label before search and retains raw fields, receipts and held state", async () => {
    const page = await read_current_graph_node_page({ node_type: "resource", query: "Denver Rescue Mission", limit: 1 });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      node_id: "object:d", label: "Denver Rescue Mission", node_state: "held", object_ref: "ref-d",
      source_content_sha256: "sha-d", source_candidate_hash: "candidate-d", source_locator: "P10",
      metadata: { category: "cash_assistance_income", typed_ready: false },
      presentation: { recorded_label: "📞 303-297-1815", recorded_category: "cash_assistance_income",
        reviewed_primary_category: "housing", reviewed_category_memberships: ["housing", "food_nutrition"],
        source_transcription_correction: { revision_id: "tr-d" }, category_review: { revision_id: "cat-d" } },
    });
    expect((await read_current_graph_node_page({ node_type: "resource", query: "303-297-1815" })).total).toBe(1);
    expect((await read_current_graph_node_page({ node_type: "resource", query: "food_nutrition" })).total).toBe(1);
    expect((await read_current_graph_node_page({ node_type: "resource", query: "food nutrition" })).total).toBe(1);
    expect(await read_current_graph_node_page({ query: "Denver Rescue Mission", offset: 99 })).toMatchObject({ total: 1, items: [] });
  });
  it("uses the same reviewed label and evidence on both edge and unresolved endpoints", async () => {
    const page = await read_current_graph_edge_page({ node_id: "object:d" });
    expect(page).toMatchObject({ total: 1, items: [{ edge_id: "ed", from_node_id: "object:d",
      from_label: "Denver Rescue Mission", evidence_hash: "hash-d", evidence_state: "source_bound",
      from_presentation: { recorded_label: "📞 303-297-1815", reviewed_primary_category: "housing",
        source_transcription_correction: { revision_id: "tr-d" }, category_review: { revision_id: "cat-d" } } }] });
    expect((await read_current_unresolved_relationship_page({ node_id: "object:d" })).items[0]).toMatchObject({
      declaration_id: "ud", from_label: "Denver Rescue Mission", from_presentation: { recorded_category: "cash_assistance_income" },
    });
  });
  it.each(["object_ref", "artifact_key", "source_content_sha256", "source_candidate_hash", "source_locator"])(
    "does not apply a classified resource whose %s differs from the graph source", async field => {
      const original = (await db.query<Record<string, string>>(`select ${field} from v_lighthouse_resource_program_classified_v1 where civic_object_uid='d'`)).rows[0][field];
      await db.query(`update v_lighthouse_resource_program_classified_v1 set ${field}=$1 where civic_object_uid='d'`, ["changed"]);
      expect((await read_current_graph_node_page({ node_id: "object:d" })).items[0]).toMatchObject({ label: "📞 303-297-1815", presentation: null });
      expect((await read_current_graph_edge_page({ node_id: "object:d" })).items[0]).toMatchObject({ from_label: "📞 303-297-1815", from_presentation: null });
      await db.query(`update v_lighthouse_resource_program_classified_v1 set ${field}=$1 where civic_object_uid='d'`, [original]);
    },
  );
  it("does not promote a non-admitted resource or revive a retracted revision", async () => {
    await db.exec("update v_lighthouse_resource_program_classified_v1 set person_facing_ready=false where civic_object_uid='d'");
    expect((await read_current_graph_node_page({ query: "Denver Rescue Mission" })).total).toBe(0);
    expect((await read_current_graph_edge_page({ node_id: "object:d" })).items[0].from_label).toBe("📞 303-297-1815");
    await db.exec("update v_lighthouse_resource_program_classified_v1 set person_facing_ready=true where civic_object_uid='d'");
    await db.exec(`insert into luminari_resource_transcription_revision_v1 values ('retract-tr-d','d','retract','tr-d');
      insert into luminari_resource_category_revision_v1 values ('retract-cat-d','d','retract','cat-d')`);
    expect((await read_current_graph_node_page({ query: "Denver Rescue Mission" })).total).toBe(0);
    expect((await read_current_graph_edge_page({ node_id: "object:d" })).items[0]).toMatchObject({ from_label: "📞 303-297-1815", from_presentation: null });
    await db.exec(`delete from luminari_resource_transcription_revision_v1 where revision_id='retract-tr-d';
      delete from luminari_resource_category_revision_v1 where revision_id='retract-cat-d'`);
  });
  it("does not use candidate receipt IDs when the validated projection withholds both receipts", async () => {
    await db.exec("update v_lighthouse_resource_program_classified_v1 set source_transcription_correction=null,category_review=null where civic_object_uid='d'");
    expect((await read_current_graph_node_page({ query: "Denver Rescue Mission" })).total).toBe(0);
    expect((await read_current_graph_edge_page({ node_id: "object:d" })).items[0].from_presentation).toBeNull();
    await db.exec(`update v_lighthouse_resource_program_classified_v1 set source_transcription_correction='{"revision_id":"tr-d"}',category_review='{"revision_id":"cat-d"}' where civic_object_uid='d'`);
  });
  it("withholds a review when the same current UID also identifies an unreviewed or held source", async () => {
    await db.exec(`insert into v_lighthouse_civic_object_current_v1 values
      ('d','ref-d-other','resource','Different held source',null,'source-other','CO',null,'run-other','sha-other','candidate-other','P999','other')`);
    expect((await read_current_graph_node_page({ node_id: "object:d" })).items[0]).toMatchObject({ label: "📞 303-297-1815", presentation: null });
    expect((await read_current_graph_edge_page({ node_id: "object:d" })).items[0]).toMatchObject({ from_label: null, from_presentation: null });
    await db.exec("delete from v_lighthouse_civic_object_current_v1 where object_ref='ref-d-other'");
  });
});
