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
    create table luminari_corpus_source_artifact_v1 (artifact_key text primary key,object_name text);
    insert into luminari_corpus_source_artifact_v1 values ('source-a','Colorado source.json'),('source-c','Alaska source.json');
    create table v_lighthouse_graph_relationship_edges_v1 (
      edge_id text primary key,from_node_id text,to_node_id text,edge_type text,evidence_state text,evidence_hash text,metadata jsonb
    );
    insert into v_lighthouse_graph_relationship_edges_v1 values
      ('e1','object:a','object:b','administers','source_bound','hash1','{}'),
      ('e2','object:c','object:a','refers_to','review_pending','hash2','{}');
    create view v_lighthouse_graph_edges_v2 as select * from v_lighthouse_graph_relationship_edges_v1;
    create table v_lighthouse_graph_unresolved_relationships_v1 (
      declaration_id text primary key,from_node_id text,intended_edge_type text,source_field text,
      target_reference text,resolution_state text,target_match_count int,evidence_hash text,metadata jsonb
    );
    insert into v_lighthouse_graph_unresolved_relationships_v1 values
      ('u1','object:a','appeal_to','oversight','missing-office','unresolved',0,'uh1','{}'),
      ('u2','object:c','appeal_to','oversight','another-office','unresolved',0,'uh2','{}');
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
    await db.exec("insert into v_lighthouse_civic_object_current_v1 values ('b','ref-other','agency','Conflicting identity',null,'source-a','CO',null)");
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
});
