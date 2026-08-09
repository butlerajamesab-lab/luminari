import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("live Lighthouse case workflow continuity", () => {
  it("serializes every jsonb parameter before node-postgres can encode arrays", () => {
    const source = read("server/intake-layer-run-persistence.ts");
    expect(source).toContain('to_postgres_json(input.execution_envelope, "execution_envelope")');
    expect(source).toContain('to_postgres_json(input.output_data ?? null, "output_data")');
    expect(source).toContain('to_postgres_json(input_refs, "input_refs")');
    expect(source).toContain('to_postgres_json(unresolved_dependencies, "unresolved_dependencies")');
  });

  it("maps the case-facing workflow tables to their live snake_case columns", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toContain('caseId: integer("case_id").notNull()');
    expect(schema).toContain('checked: boolean_integer("checked")');
    expect(schema).toContain('foiaEligible: boolean_integer("foia_eligible")');
    expect(schema).toContain('status: text("foia_request_status")');
    expect(schema).toContain('requestFingerprint: varchar("request_fingerprint"');
    expect(schema).toContain('createdBy: integer("created_by").notNull()');
    expect(schema).toContain('linkUrl: varchar("link_url"');
  });

  it("keeps serial sequences aligned to imported live rows", () => {
    const migration = read(
      "supabase/migrations/20260809135046_align_lighthouse_case_workflow_sequences.sql",
    );
    expect(migration).toContain("pg_catalog.pg_get_serial_sequence");
    expect(migration).toContain("pg_catalog.setval");
    expect(migration).toContain("'checklist_items'");
    expect(migration).toContain("'missing_records'");
  });

  it("keeps FOIA notifications on the canonical case workspace route", () => {
    const source = read("server/foia-generator.ts");
    expect(source).toContain('linkUrl: `/guide/${caseId}`');
    expect(source).not.toContain('linkUrl: `/case/${caseId}`');
  });
});
