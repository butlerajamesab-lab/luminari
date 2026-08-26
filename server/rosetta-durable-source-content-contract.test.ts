import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "rosetta-owner/migrations/20260826090000_durable_source_content_registration_v1.sql",
  ),
  "utf8",
);
const pipeline = readFileSync(
  join(process.cwd(), "server/civic-genome-legislative-version-pipeline.ts"),
  "utf8",
);
const worker = readFileSync(
  join(process.cwd(), "server/civic-genome-legislative-version-queue-worker.ts"),
  "utf8",
);

describe("durable Rosetta source-content boundary", () => {
  it("registers the active 2.5.11 source identity without replacing a parser", () => {
    expect(migration).toContain("rosetta_register_source_content_v1");
    expect(migration).toContain("insert into public.source_document_content");
    expect(migration).toContain("on conflict (source_document_id, source_version) do nothing");
    expect(migration).toContain("'document_identifier', v_document_identifier");
    expect(migration).toContain("'source_content_hash', v_source_content_hash");
    expect(migration).toContain("'source_byte_hash', p_source_byte_hash");
    expect(migration).toContain("'media_type', p_media_type");
    expect(migration).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.run_rosetta_v3_extraction/i,
    );
  });

  it("fails closed on any immutable version identity conflict", () => {
    expect(migration).toContain("v_existing.source_content_hash is distinct from v_source_content_hash");
    expect(migration).toContain("v_existing.source_url is distinct from p_source_url");
    expect(migration).toContain("v_existing.source_identity_hash is distinct from v_source_identity_hash");
    expect(migration).toContain("message = 'source_version_content_conflict'");
  });

  it("pins the definer and exposes only its exact service-role signature", () => {
    expect(migration.match(/security definer/g)?.length).toBe(1);
    expect(migration.match(/set search_path = pg_catalog, public/g)?.length).toBe(1);
    expect(migration).toContain(
      "revoke all on function public.rosetta_register_source_content_v1(",
    );
    expect(migration).toContain(
      ") from public, anon, authenticated;",
    );
    expect(migration).toContain(
      ") to service_role;",
    );
  });

  it("commits source content before parsing and validates the returned identity", () => {
    const processStart = pipeline.indexOf("export async function process_legislative_version(");
    const processSource = pipeline.slice(processStart);
    const register = processSource.indexOf("await register_rosetta_source_content(");
    const record = processSource.indexOf("await record_source_ingested(");
    const extract = processSource.indexOf("await invoke_rosetta_extraction(");

    expect(register).toBeGreaterThanOrEqual(0);
    expect(record).toBeGreaterThan(register);
    expect(extract).toBeGreaterThan(record);
    expect(pipeline).toContain("rosetta-durable-source-content-v1");
    expect(pipeline).toContain("receipt.source_content_hash !== source.source_content_hash");
    expect(pipeline).toContain("legislative_version_content_registration_identity_mismatch");
  });

  it("retries an unbound recovery receipt only through a bounded ordinal", () => {
    expect(worker).toContain("DURABLE_CONTENT_RECOVERY_MAX_ATTEMPTS = 3");
    expect(worker).toContain("recovery_state.prior_recovery_attempts < $6::integer");
    expect(worker).toContain("candidate.prior_recovery_attempts + 1");
    expect(worker).toContain("make_interval(secs => $7::integer)");
  });
});
