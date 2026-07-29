import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const worker = read("../supabase/functions/geocode-queue-worker/index.ts");
const migration = read(
  "../supabase/migrations/20260729110000_geocode_worker_verifier_resilience.sql",
);

describe("geocode worker verifier resilience", () => {
  it("verifies the dedicated secret through the service-role-only RPC", () => {
    expect(worker).toContain(
      "/rest/v1/rpc/verify_geocode_worker_cron_secret",
    );
    expect(worker).toContain("Authorization: `Bearer ${serviceRoleKey}`");
    expect(worker).toContain("apikey: serviceRoleKey");
    expect(worker).toContain('JSON.stringify({ p_candidate: candidate })');
  });

  it("keeps all queue access behind successful authorization", () => {
    const verifierCall = worker.indexOf("const authorization = await verifyCronSecret(");
    const authorizedReceipt = worker.indexOf('outcome: "authorized"');
    const clientCreation = worker.indexOf("const supabase = createClient(");
    const firstQueueRead = worker.indexOf('.from("coordinate_enrichment_queue_v1")');

    expect(verifierCall).toBeGreaterThan(-1);
    expect(authorizedReceipt).toBeGreaterThan(verifierCall);
    expect(clientCreation).toBeGreaterThan(authorizedReceipt);
    expect(firstQueueRead).toBeGreaterThan(clientCreation);
  });

  it("distinguishes credential rejection from verifier unavailability", () => {
    expect(worker).toContain('kind: "rejected"');
    expect(worker).toContain('kind: "unavailable"');
    expect(worker).toContain(
      'error: "authorization_service_unavailable"',
    );
    expect(worker).toContain("}, 503)");
    expect(worker).toContain('diagnostic_code: "verifier_rejected"');
    expect(worker).toContain("}, 401)");
  });

  it("bounds verifier retries and records only safe diagnostics", () => {
    expect(worker).toContain("attempt <= 2");
    expect(worker).toContain("setTimeout(() => controller.abort(), 12000)");
    expect(worker).toContain("await sleep(250)");
    expect(worker).toContain('event: "geocode_worker_cron_auth"');
    expect(worker).not.toContain("cron_secret: cronSecret");
    expect(worker).not.toContain("candidate: candidate");
    expect(worker).not.toContain("service_role_key: serviceRoleKey");
  });

  it("preserves the existing cron contract with a 30-second pg_net timeout", () => {
    expect(migration).toContain("cron.unschedule('geocode-queue-worker-timer')");
    expect(migration).toContain("'*/15 * * * *'");
    expect(migration).toContain("?batch_size=25");
    expect(migration).toContain("'apikey'");
    expect(migration).toContain("'x-cron-secret'");
    expect(migration).toContain("timeout_milliseconds := 30000");
    expect(migration).not.toContain("select secret_value");
  });
});
