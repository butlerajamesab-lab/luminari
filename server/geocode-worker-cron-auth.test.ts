import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const migration = read(
  "../supabase/migrations/20260729022000_geocode_worker_cron_auth.sql",
);
const timeoutMigration = read(
  "../supabase/migrations/20260729105500_geocode_worker_request_timeout.sql",
);
const worker = read("../supabase/functions/geocode-queue-worker/index.ts");

describe("geocode worker cron authentication", () => {
  it("creates a dedicated Vault secret without returning or committing plaintext", () => {
    expect(migration).toContain("extensions.gen_random_bytes(32)");
    expect(migration).toContain("vault.create_secret(");
    expect(migration).toContain("geocode_worker_cron_secret");
    expect(migration).toContain("extensions.digest(secret_value, 'sha256')");
    expect(migration).not.toContain("select secret_value");
  });

  it("limits the verifier to service_role", () => {
    expect(migration).toContain(
      "revoke all on function public.verify_geocode_worker_cron_secret(text)",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("rewires the cron with a purpose-specific secret header", () => {
    expect(migration).toContain("cron.unschedule('geocode-queue-worker-timer')");
    expect(migration).toContain("'x-cron-secret'");
    expect(migration).toContain("'*/15 * * * *'");
  });

  it("keeps the caller timeout explicit and the production batch bounded", () => {
    expect(timeoutMigration).toContain("?batch_size=10");
    expect(timeoutMigration).toContain("timeout_milliseconds := 120000");
    expect(timeoutMigration).toContain("'*/15 * * * *'");
  });

  it("authenticates before claiming queue data", () => {
    const headerIndex = worker.indexOf('request.headers.get("x-cron-secret")');
    const verifierIndex = worker.indexOf("verify_geocode_worker_cron_secret");
    const claimIndex = worker.indexOf("with picked as (");

    expect(headerIndex).toBeGreaterThan(-1);
    expect(verifierIndex).toBeGreaterThan(headerIndex);
    expect(claimIndex).toBeGreaterThan(verifierIndex);
    expect(worker).toContain('return json({ error: "unauthorized" }, 401)');
  });

  it("uses direct PostgreSQL instead of the suppressed PostgREST row boundary", () => {
    expect(worker).toContain('import postgres from "npm:postgres@3.4.5"');
    expect(worker).toContain('Deno.env.get("SUPABASE_DB_URL")');
    expect(worker).toContain("for update skip locked");
    expect(worker).toContain("returning q.id::text");
    expect(worker).not.toContain("@supabase/supabase-js");
    expect(worker).not.toContain('.from("coordinate_enrichment_queue_v1")');
  });

  it("bounds database concurrency and always closes the connection", () => {
    expect(worker).toContain("max: 1");
    expect(worker).toContain("prepare: false");
    expect(worker).toContain("connect_timeout: 10");
    expect(worker).toContain("await sql.end({ timeout: 5 })");
  });

  it("requeues transient geocoder failures instead of terminally failing them", () => {
    expect(worker).toContain("response.status >= 500");
    expect(worker).toContain('kind: "retryable_error"');
    expect(worker).toContain("set queue_status = 'pending'");
    expect(worker).toContain("requeued");
  });

  it("keeps canonical resource and queue completion in one transaction", () => {
    const resourceUpdateIndex = worker.indexOf(
      "update public.normalized_civic_resource",
    );
    const completionIndex = worker.indexOf(
      "update public.coordinate_enrichment_queue_v1",
      resourceUpdateIndex,
    );

    expect(worker).toContain("const finalized = await sql.begin");
    expect(resourceUpdateIndex).toBeGreaterThan(-1);
    expect(completionIndex).toBeGreaterThan(resourceUpdateIndex);
    expect(worker).toContain('return queueRows.length === 1 ? targetStatus : "finalize_failure"');
    expect(worker).toContain("finalize_failures");
  });
});
