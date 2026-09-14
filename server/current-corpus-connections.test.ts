import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const bridge = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ query_with_diagnostics: bridge.query }));
import {
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
