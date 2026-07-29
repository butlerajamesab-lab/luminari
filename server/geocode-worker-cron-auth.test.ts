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
    expect(migration).toContain("?batch_size=25");
    expect(migration).toContain("'*/15 * * * *'");
  });

  it("replaces the five-second caller default with an explicit bounded timeout", () => {
    expect(timeoutMigration).toContain(
      "cron.unschedule('geocode-queue-worker-timer')",
    );
    expect(timeoutMigration).toContain("?batch_size=10");
    expect(timeoutMigration).toContain("timeout_milliseconds := 120000");
    expect(timeoutMigration).toContain("'x-cron-secret'");
    expect(timeoutMigration).toContain("'*/15 * * * *'");
  });

  it("authenticates before accessing queue data", () => {
    const headerIndex = worker.indexOf('request.headers.get("x-cron-secret")');
    const verifierIndex = worker.indexOf('"verify_geocode_worker_cron_secret"');
    const queueIndex = worker.indexOf('.from("coordinate_enrichment_queue_v1")');

    expect(headerIndex).toBeGreaterThan(-1);
    expect(verifierIndex).toBeGreaterThan(headerIndex);
    expect(queueIndex).toBeGreaterThan(verifierIndex);
    expect(worker).toContain('return json({ error: "unauthorized" }, 401)');
  });

  it("keeps privileged database access inside the authenticated worker", () => {
    expect(worker).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(worker).toContain('auth: { persistSession: false }');
    expect(worker).not.toMatch(
      /Deno\.env\.get\(["']GEOCODE_WORKER_CRON_SECRET["']\)/,
    );
    expect(worker).not.toContain("vault.decrypted_secrets");
  });

  it("requeues transient geocoder failures instead of terminally failing them", () => {
    expect(worker).toContain("response.status === 429");
    expect(worker).toContain("response.status >= 500");
    expect(worker).toContain('kind: "retryable_error"');
    expect(worker).toContain("recoverPending(supabase, row)");
    expect(worker).toContain("requeued");
  });

  it("checks final queue persistence before counting completion", () => {
    const transitionIndex = worker.indexOf(
      "const completionTransition = await transitionQueueStatus(",
    );
    const completedIndex = worker.indexOf("completed += 1;", transitionIndex);

    expect(transitionIndex).toBeGreaterThan(-1);
    expect(completedIndex).toBeGreaterThan(transitionIndex);
    expect(worker).toContain('currentStatus === "completed"');
    expect(worker).toContain("queue_update_failures");
  });
});