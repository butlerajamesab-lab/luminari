import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("live adjacent runtime continuity", () => {
  it("keeps benefit application access on the live snake_case text contract", () => {
    const source = read("server/benefit-applications-live-compat.ts");
    expect(source).toContain('user_id as "userId"');
    expect(source).toContain('benefit_app_status as status');
    expect(source).toContain("JSON.stringify(data.documentsNeeded ?? [])");
    expect(source).toContain("delete from public.benefit_applications");
    expect(source).not.toContain('where "userId"');
  });

  it("keeps enforcement paths on snake_case and integer-boolean storage", () => {
    const source = read("server/enforcement-action-paths-live-compat.ts");
    expect(source).toContain('pipeline_type as "pipelineType"');
    expect(source).toContain('is_active as "isActive"');
    expect(source).toContain("is_active = 1");
    expect(source).not.toContain('"pipelineType" =');
  });

  it("queries full legal tables before compatibility views missing metadata", () => {
    const source = read("server/legal-library-runtime-db.ts");
    expect(source.indexOf("from public.legal_statutes ${where}")).toBeLessThan(source.indexOf("from public.v_paginated_statutes ${where}"));
    expect(source.indexOf("from public.legal_case_law ${where}")).toBeLessThan(source.indexOf("from public.v_runtime_case_law ${where}"));
  });

  it("joins the API source registry through its live source_name column", () => {
    const source = read("server/routers.ts");
    expect(source).toContain("api_source_registry!inner(source_key,source_name)");
    expect(source).not.toContain("api_source_registry!inner(source_key,name)");
  });
});
