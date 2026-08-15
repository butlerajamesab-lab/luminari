import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260815123000_fresh_resource_address_projection_v2.sql";
const preservationMigrationPath = "supabase/migrations/20260815124500_fresh_resource_source_address_preservation_v3.sql";
const singlePassMigrationPath = "supabase/migrations/20260815134500_fresh_resource_single_pass_address_snapshot_v4.sql";
const deprecationMigrationPath = "supabase/migrations/20260815134700_deprecate_multipass_address_snapshot_builders.sql";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("fresh resource address projection v2", () => {
  it("uses PostgreSQL-compatible address boundaries", () => {
    const migration = source(migrationPath);

    expect(migration).toContain("luminari_source_address_publishable_v2");
    expect(migration).toContain("([^a-z]|$)");
    expect(migration).not.toContain("\\b(street");
    expect(migration).not.toContain("cir\\.?)\\b");
  });

  it("creates a new sealed snapshot without silently activating it", () => {
    const migration = source(migrationPath);

    expect(migration).toContain("create_luminari_resource_snapshot_v2_4");
    expect(migration).toContain("create_luminari_resource_snapshot_v2_3");
    expect(migration).toContain("best_source_attached_field_v2");
    expect(migration).toContain("resolved_resources_with_source_address");
    expect(migration).toContain("'activated',false");
    expect(migration).not.toContain("activate_luminari_resource_snapshot_v1(");
  });

  it("recomputes identity and snapshot receipts after field projection", () => {
    const migration = source(migrationPath);

    expect(migration).toContain("identity_receipt_hash=encode(digest(");
    expect(migration).toContain("string_agg(identity_receipt_hash,'|' order by identity_key)");
    expect(migration).toContain("address_candidate_key");
    expect(migration).toContain("publication_mutated',false");
  });

  it("preserves source address text independently from formatting quality", () => {
    const migration = source(preservationMigrationPath);

    expect(migration).toContain("luminari_source_address_preserved_v3");
    expect(migration).toContain("luminari_source_address_shape_v3");
    expect(migration).toContain("source_text_noncanonical");
    expect(migration).toContain("address_validation_state");
    expect(migration).toContain("preserve_source_address_v3");
    expect(migration).toContain("create_luminari_resource_snapshot_v2_5");
    expect(migration).not.toContain("activate_luminari_resource_snapshot_v1(");
  });

  it("builds the preserved address inside the primary snapshot pass", () => {
    const migration = source(singlePassMigrationPath);

    expect(migration).toContain("create_luminari_resource_snapshot_v2_6_core");
    expect(migration).toContain("create_luminari_resource_snapshot_v2_6");
    expect(migration).toContain("luminari_source_address_preserved_v3(c.address)");
    expect(migration).toContain("resource_snapshot_v2_3_address_filter_contract_changed");
    expect(migration).toContain("resolved_noncanonical_source_addresses");
    expect(migration).not.toContain("activate_luminari_resource_snapshot_v1(");
  });

  it("removes runtime authority from the unbounded multipass builders", () => {
    const migration = source(deprecationMigrationPath);

    expect(migration).toContain("create_luminari_resource_snapshot_v2_4");
    expect(migration).toContain("create_luminari_resource_snapshot_v2_5");
    expect(migration).toContain("from service_role");
    expect(migration).toContain("Use create_luminari_resource_snapshot_v2_6");
  });
});
