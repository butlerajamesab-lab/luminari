import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the production helper and generated SQL, replacing only its database
// connection. PGlite verifies transactions, but not independent-session blocking.
const connection = vi.hoisted(() => ({ database: null as any }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: () => connection.database }));
vi.mock("./pg-config", () => ({
  create_database_pool: () => ({}),
  get_database_host_label: () => "isolated-case-metadata-test",
}));

import { correctCaseMetadata, db, removeCollaborator, verifyCaseWriteAccess } from "./db-legacy";

let database: PGlite;
const statements: { sql: string; parameters: unknown[] }[] = [];
const original_name = "Original workspace";

beforeAll(async () => {
  database = new PGlite();
  connection.database = drizzle(database, {
    logger: { logQuery: (sql, parameters) => statements.push({ sql, parameters }) },
  });
  await database.exec(`
    CREATE TABLE cases (
      id serial PRIMARY KEY, user_id integer, name text, description text,
      status text, created_at bigint, updated_at bigint, domain text,
      container text, pipeline_type text, manual_lens_overrides text
    );
    CREATE TABLE case_collaborators (
      id serial PRIMARY KEY, "caseId" integer NOT NULL, "userId" integer NOT NULL,
      "accessLevel" text NOT NULL CHECK ("accessLevel" IN ('READ_ONLY', 'WRITE')),
      "grantedBy" integer NOT NULL, "grantedAt" bigint NOT NULL,
      UNIQUE ("caseId", "userId")
    );
    CREATE TABLE audit_trail (
      id serial PRIMARY KEY, case_id integer, user_id integer, action text NOT NULL,
      target_type text, target_id integer, details text, hash text NOT NULL,
      created_at bigint NOT NULL
    );
    CREATE TABLE documents (
      id integer PRIMARY KEY, case_id integer, sha256_hash text,
      text_content text, s3_key text, snapshot_id integer
    );
    CREATE TABLE corpus_snapshots (
      id integer PRIMARY KEY, case_id integer, document_hashes text,
      snapshot_status text, signature text
    );
    CREATE TABLE quotes (
      id uuid PRIMARY KEY, quote_text text NOT NULL, anchor_ref text
    );
  `);
}, 30_000);

afterAll(async () => { await database?.close(); });

beforeEach(async () => {
  await database.exec(`
    ALTER TABLE audit_trail DROP CONSTRAINT IF EXISTS reject_correction;
    TRUNCATE cases, case_collaborators, audit_trail, documents, corpus_snapshots, quotes RESTART IDENTITY;
    INSERT INTO cases VALUES (1, 10, 'Original workspace', 'Original summary',
      'active', 100, 100, 'housing', NULL, 'source-pipeline', 'source-lens');
    INSERT INTO case_collaborators ("caseId", "userId", "accessLevel", "grantedBy", "grantedAt")
      VALUES (1, 20, 'WRITE', 10, 100), (1, 30, 'READ_ONLY', 10, 100),
             (2, 40, 'WRITE', 10, 100);
    INSERT INTO documents VALUES (91, 1, repeat('a', 64), 'Unchanged source text', 'evidence/original.pdf', 7);
    INSERT INTO corpus_snapshots VALUES (7, 1, '{"91":"original-hash"}', 'sealed', 'original-signature');
    INSERT INTO quotes VALUES ('00000000-0000-0000-0000-000000000001', 'Unchanged quoted text', 'page:1');
  `);
  statements.length = 0;
});

async function stored_case() {
  return (await database.query("SELECT * FROM cases WHERE id = 1")).rows[0];
}

async function corrections() {
  return (await database.query("SELECT * FROM audit_trail WHERE action = 'correct_case_metadata' ORDER BY id")).rows;
}

async function evidence() {
  return {
    documents: (await database.query("SELECT * FROM documents ORDER BY id")).rows,
    snapshots: (await database.query("SELECT * FROM corpus_snapshots ORDER BY id")).rows,
    quotes: (await database.query("SELECT * FROM quotes ORDER BY id")).rows,
  };
}

describe("case metadata transactional authorization", () => {
  it.each([10, 20])("allows authorized actor %s and atomically records only changed metadata", async actor => {
    const source_before = await evidence();
    expect(await correctCaseMetadata(1, 10, actor, { name: "Corrected workspace", description: null })).toBe(true);
    expect(await stored_case()).toMatchObject({
      name: "Corrected workspace", description: null, user_id: 10,
      status: "active", domain: "housing", pipeline_type: "source-pipeline", manual_lens_overrides: "source-lens",
    });
    const entries = await corrections();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ user_id: actor, case_id: 1, target_type: "case_metadata" });
    expect(JSON.parse(entries[0].details as string)).toEqual({
      changes: {
        name: { before: original_name, after: "Corrected workspace" },
        description: { before: "Original summary", after: null },
      },
      source_evidence_modified: false,
    });
    expect(await evidence()).toEqual(source_before);
  });

  it.each([30, 40, 50])("rejects read-only, other-case, or absent permission for actor %s", async actor => {
    const before = await stored_case();
    await expect(correctCaseMetadata(1, 10, actor, { name: "Denied" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await stored_case()).toEqual(before);
    expect(await corrections()).toEqual([]);
  });

  it.each(["revoke", "downgrade"])("rejects a %s committed after the preliminary write check", async change => {
    const preliminary = await verifyCaseWriteAccess(1, 20);
    expect(preliminary.userId).toBe(10);
    // Drain the existing non-blocking collaborator-access audit before making
    // the permission change; only correction entries are counted below.
    await db.transaction(async () => undefined);
    if (change === "revoke") await removeCollaborator(1, 20);
    else await database.exec(`UPDATE case_collaborators SET "accessLevel" = 'READ_ONLY' WHERE "caseId" = 1 AND "userId" = 20`);

    const before = await stored_case();
    await expect(correctCaseMetadata(1, preliminary.userId!, 20, { name: "Denied" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await stored_case()).toEqual(before);
    expect(await corrections()).toEqual([]);
  });

  it("issues case and actor-permission row locks before the metadata update and audit", async () => {
    await correctCaseMetadata(1, 10, 20, { name: "Corrected workspace" });
    const case_lock = statements.findIndex(entry => /from "cases"/.test(entry.sql));
    const permission_lock = statements.findIndex(entry => /from "case_collaborators"/.test(entry.sql));
    const update = statements.findIndex(entry => /^update "cases"/.test(entry.sql));
    const audit = statements.findIndex(entry => /^insert into "audit_trail"/.test(entry.sql));
    expect(case_lock).toBeGreaterThanOrEqual(0);
    expect(statements[case_lock].sql).toMatch(/for update$/i);
    expect(permission_lock).toBeGreaterThan(case_lock);
    expect(statements[permission_lock].sql).toMatch(/for update$/i);
    expect(statements[permission_lock].parameters).toEqual([1, 20]);
    expect(update).toBeGreaterThan(permission_lock);
    expect(audit).toBeGreaterThan(update);
  });

  it("authorizes even no-op requests, without changing timestamps or adding correction entries", async () => {
    const before = await stored_case();
    expect(await correctCaseMetadata(1, 10, 20, { name: original_name })).toBe(false);
    await expect(correctCaseMetadata(1, 10, 30, { name: original_name })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await stored_case()).toEqual(before);
    expect(await corrections()).toEqual([]);
  });

  it("fails closed if the supplied owner no longer matches the locked case", async () => {
    await expect(correctCaseMetadata(1, 20, 20, { name: "Denied" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await stored_case()).name).toBe(original_name);
    expect(await corrections()).toEqual([]);
  });

  it("rolls back metadata when the correction audit cannot be inserted", async () => {
    const before = await stored_case();
    const source_before = await evidence();
    await database.exec(`ALTER TABLE audit_trail ADD CONSTRAINT reject_correction CHECK (action <> 'correct_case_metadata')`);
    await expect(correctCaseMetadata(1, 10, 20, { name: "Must roll back" })).rejects.toThrow();
    expect(await stored_case()).toEqual(before);
    expect(await corrections()).toEqual([]);
    expect(await evidence()).toEqual(source_before);
  });
});
