import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Never fall back to DATABASE_URL: this suite creates and drops only its own
// random schema, in an explicitly selected local test database. PR Test's
// existing PostgreSQL service supplies SCHEMA_GUARD_DB_URL in GitHub Actions.
const selected_url = process.env.CASE_METADATA_TEST_DATABASE_URL?.trim()
  || (process.env.GITHUB_ACTIONS === "true" ? process.env.SCHEMA_GUARD_DB_URL?.trim() : undefined);
function local_test_url(value: string | undefined) {
  if (!value) return undefined;
  const parsed = new URL(value);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    || parsed.searchParams.has("host") || parsed.searchParams.has("hostaddr")) {
    throw new Error("Case metadata concurrency tests require an explicit loopback PostgreSQL URL");
  }
  // Connection-string options override pg Pool's options field. Remove them
  // so the isolated search_path and bounded SQL timeouts below always win.
  parsed.searchParams.delete("options");
  return parsed.toString();
}
const test_url = local_test_url(selected_url);
const connection = vi.hoisted(() => ({ pool: null as Pool | null }));
vi.mock("./pg-config", () => ({
  create_database_pool: () => {
    if (!connection.pool) throw new Error("Isolated test pool has not been initialized");
    return connection.pool;
  },
  get_database_host_label: () => "isolated-case-metadata-test",
}));

// Keep the production helper, transaction implementation and pg driver intact.
import { correctCaseMetadata, removeCollaborator, verifyCaseWriteAccess } from "./db-legacy";

type Pause = {
  phase: "before" | "after";
  reached: (pid: number) => void;
  resume: Promise<void>;
};
let permission_pause: Pause | undefined;
let removal_pid: number | undefined;

// Pause only at the permission query boundary. PostgreSQL itself takes and
// releases the row locks; pg_blocking_pids below proves the competing DELETE
// actually waits on that transaction, rather than inferring it from elapsed time.
function instrument(client: PoolClient) {
  const original_query = client.query.bind(client);
  client.query = ((...args: any[]) => {
    const text = typeof args[0] === "string" ? args[0] : args[0]?.text;
    const pid = (client as PoolClient & { processID: number }).processID;
    if (/^delete from "case_collaborators"/i.test(text ?? "")) removal_pid = pid;
    const pause = permission_pause;
    if (pause && /from "case_collaborators".*for update$/i.test(text ?? "")) {
      permission_pause = undefined;
      return (async () => {
        if (pause.phase === "before") {
          pause.reached(pid);
          await bounded(pause.resume, "release before permission lock");
        }
        const result = await (original_query as any)(...args);
        if (pause.phase === "after") {
          pause.reached(pid);
          await bounded(pause.resume, "release after permission lock");
        }
        return result;
      })();
    }
    return (original_query as any)(...args);
  }) as typeof client.query;
}

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function pause_permission(phase: Pause["phase"]) {
  let reached!: (pid: number) => void;
  let release!: () => void;
  const paused = new Promise<number>(resolve => { reached = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  permission_pause = { phase, reached, resume };
  return { paused, release };
}

function result_of<T>(operation: Promise<T>) {
  // Attach rejection handling immediately, including when an assertion fails
  // while a competing database operation is still in flight.
  return operation.then(value => ({ value }), error => ({ error }));
}

describe.skipIf(!test_url)("case metadata PostgreSQL permission races", () => {
  const schema = `case_metadata_test_${randomUUID().replaceAll("-", "")}`;
  let observer: Pool;
  let pool: Pool;

  beforeAll(async () => {
    observer = new Pool({
      connectionString: test_url,
      max: 1,
      connectionTimeoutMillis: 3_000,
      options: "-c statement_timeout=7000 -c lock_timeout=6000",
    });
    await observer.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: test_url,
      max: 2,
      connectionTimeoutMillis: 3_000,
      options: `-c search_path=${schema} -c statement_timeout=7000 -c lock_timeout=6000`,
    });
    pool.on("connect", instrument);
    connection.pool = pool;
    await pool.query(`
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
    `);
  }, 15_000);

  afterAll(async () => {
    await pool?.end();
    if (observer) {
      try { await observer.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
      finally { await observer.end(); }
    }
  }, 15_000);

  beforeEach(async () => {
    permission_pause = undefined;
    removal_pid = undefined;
    await pool.query(`
      TRUNCATE cases, case_collaborators, audit_trail RESTART IDENTITY;
      INSERT INTO cases VALUES (1, 10, 'Original workspace', 'Original summary',
        'active', 100, 100, 'housing', NULL, 'source-pipeline', 'source-lens');
      INSERT INTO case_collaborators ("caseId", "userId", "accessLevel", "grantedBy", "grantedAt")
        VALUES (1, 20, 'WRITE', 10, 100);
    `);
  });

  async function wait_for(check: () => Promise<boolean>, label: string) {
    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out: ${label}`);
  }

  async function preliminary_access() {
    const preliminary = await verifyCaseWriteAccess(1, 20);
    expect(preliminary.userId).toBe(10);
    // The existing preliminary helper emits a fire-and-forget access audit.
    // Observe its commit before staging the race or cleaning up the fixture.
    await wait_for(async () => (
      await pool.query("SELECT 1 FROM audit_trail WHERE action = 'collaborator_access'")
    ).rowCount === 1, "preliminary access audit commit");
    return preliminary;
  }

  async function corrections() {
    return (await pool.query("SELECT * FROM audit_trail WHERE action = 'correct_case_metadata' ORDER BY id")).rows;
  }

  it.each(["revoke", "downgrade"])("rejects a %s committed after precheck but before the transaction's permission lock", async change => {
    const preliminary = await preliminary_access();
    const before = (await pool.query("SELECT * FROM cases WHERE id = 1")).rows[0];
    const gate = pause_permission("before");
    const correction = result_of(correctCaseMetadata(1, preliminary.userId!, 20, { name: "Denied" }));
    try {
      await bounded(gate.paused, "metadata transaction reaches permission query");
      // The correction already holds the case lock on connection one. This
      // permission change commits on connection two before its permission read.
      if (change === "revoke") await removeCollaborator(1, 20);
      else await pool.query(`UPDATE case_collaborators SET "accessLevel" = 'READ_ONLY' WHERE "caseId" = 1 AND "userId" = 20`);
      gate.release();
      expect(await bounded(correction, "metadata rejection")).toMatchObject({ error: { code: "FORBIDDEN" } });
      expect((await pool.query("SELECT * FROM cases WHERE id = 1")).rows[0]).toEqual(before);
      expect(await corrections()).toEqual([]);
    } finally {
      gate.release();
      await correction;
    }
  }, 15_000);

  it("holds revocation until the authorized metadata correction and audit commit", async () => {
    await preliminary_access();
    const gate = pause_permission("after");
    const correction = result_of(correctCaseMetadata(1, 10, 20, { name: "Corrected workspace" }));
    let removal: ReturnType<typeof result_of<void>> | undefined;
    try {
      const correction_pid = await bounded(gate.paused, "permission row lock acquired");
      removal = result_of(removeCollaborator(1, 20));
      await wait_for(async () => {
        if (!removal_pid) return false;
        const result = await observer.query<{ blocked: boolean }>(
          "SELECT $1::integer = ANY(pg_blocking_pids($2::integer)) AS blocked",
          [correction_pid, removal_pid],
        );
        return result.rows[0].blocked;
      }, "PostgreSQL reports revocation blocked by the correction transaction");
      expect(removal_pid).not.toBe(correction_pid);
      gate.release();
      expect(await bounded(correction, "metadata commit")).toEqual({ value: true });
      expect(await bounded(removal, "revocation commit")).toEqual({ value: undefined });
      expect((await pool.query("SELECT name FROM cases WHERE id = 1")).rows[0].name).toBe("Corrected workspace");
      expect((await pool.query("SELECT * FROM case_collaborators")).rows).toEqual([]);
      const entries = await corrections();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ case_id: 1, user_id: 20, target_type: "case_metadata" });
      expect(JSON.parse(entries[0].details)).toEqual({
        changes: { name: { before: "Original workspace", after: "Corrected workspace" } },
        source_evidence_modified: false,
      });
    } finally {
      gate.release();
      await Promise.all([correction, removal]);
    }
  }, 15_000);
});
