import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = read("../../supabase/migrations/20260821235951_atlas_domain3_integrity_review_projection.sql");
const router_source = read("../routers/integrity-routing.ts");
const service_source = read("./integrity-routing-service.ts");

describe("Atlas to Lighthouse integrity review contract", () => {
  it("projects only current Atlas Domain 3 integrity observation candidates", () => {
    expect(migration).toContain("detection_rule_id like 'atlas.domain3.integrity.%'");
    expect(migration).toContain("governance_status = 'observation_candidate'");
    expect(migration).toContain("project_atlas_integrity_candidate_v1");
  });

  it("preserves exact Atlas event hashes and source locators", () => {
    expect(migration).toContain("event_identity_hash");
    expect(migration).toContain("source_record_key");
    expect(migration).toContain("source_content_hash");
    expect(migration).toContain("atlas.signal_events/");
  });

  it("keeps browser roles out and grants projection RPCs only to the service role", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path to 'pg_catalog', 'private', 'public'");
  });

  it("contains no Lighthouse detector route", () => {
    expect(router_source).not.toMatch(/detect_preview|detect_and_persist/);
    expect(service_source).not.toMatch(/integrity-detector|detect_integrity|derive_integrity/);
    expect(router_source).toContain("sync_atlas_candidates");
  });

  it("never exposes a transmission endpoint", () => {
    expect(router_source).toContain("create_escalation_draft");
    expect(router_source).not.toMatch(/transmit|send_complaint|submit_complaint/);
    expect(service_source).toContain("transmission_authorized: false");
  });

  it("derives corroboration metrics and requires the latest verified assessment", () => {
    expect(migration).toContain("count(distinct e.source_relation)::integer");
    expect(migration).toContain("count(distinct e.source_class)::integer");
    expect(migration).toContain("max(latest.assessment_order)");
    expect(migration).toContain("integrity_transmission_not_supported");
    expect(migration).toContain("integrity packet must remain draft-only and human-reviewed");
    expect(service_source).toContain("max(latest.assessment_order)");
  });
});
