import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("registry runtime database boundary", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./routers/registry.ts", import.meta.url)),
    "utf8",
  );

  it("contains no embedded external MySQL connection", () => {
    expect(source).not.toContain('from "mysql2/promise"');
    expect(source).not.toContain("mysql.createConnection");
    expect(source).not.toContain("tidbcloud");
    expect(source).not.toContain("luminari_registry");
  });

  it("reads registry references from the canonical Supabase tables", () => {
    expect(source).toContain("public.workflow_master");
    expect(source).toContain("public.workflow_steps");
    expect(source).toContain("public.escalation_routes");
    expect(source).toContain("public.legal_statutes");
  });

  it("uses the live Postgres resource columns and result contract", () => {
    expect(source).toContain("form_name, pipeline_category");
    expect(source).toContain("contact_phone_norm");
    expect(source).toContain("snapshot.mental_health.map");
    expect(source).toContain("snapshot.agencies.map");
    expect(source).toContain("registry_resources_snapshot");
    expect(source).not.toContain("formName as name");
    expect(source).not.toContain("category_rp");
    expect(source).not.toContain("const [forms] = await pool.query");
  });
});
