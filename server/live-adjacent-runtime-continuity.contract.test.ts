import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
}));

import {
  searchRuntimeCaseLaw,
  searchRuntimeStatutes,
} from "./legal-library-runtime-db";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("live adjacent runtime continuity", () => {
  beforeEach(() => {
    query.mockReset();
  });

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

  it("binds statute and case-law pagination parameters in primary queries", async () => {
    query.mockResolvedValue({ rows: [] });

    await searchRuntimeStatutes({});
    await searchRuntimeCaseLaw({ limit: 12, offset: 8 });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("limit $1 offset $2"),
      [50, 0],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("limit $1 offset $2"),
      [12, 8],
    );
  });

  it("retains the same bind markers when legal compatibility fallbacks are reached", async () => {
    query
      .mockRejectedValueOnce(new Error('column "metadata" does not exist'))
      .mockResolvedValueOnce({ rows: [] });

    await searchRuntimeStatutes({ jurisdiction: "WA", limit: 10, offset: 5 });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("limit $2 offset $3"),
      ["WA", 10, 5],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("limit $2 offset $3"),
      ["WA", 10, 5],
    );

    query.mockReset();
    query
      .mockRejectedValueOnce(new Error('column "metadata" does not exist'))
      .mockResolvedValueOnce({ rows: [] });

    await searchRuntimeCaseLaw({ court: "9th", limit: 10, offset: 5 });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("limit $2 offset $3"),
      ["%9th%", 10, 5],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("limit $2 offset $3"),
      ["%9th%", 10, 5],
    );
  });

  it("joins the API source registry through its live source_name column", () => {
    const source = read("server/routers.ts");
    expect(source).toContain("api_source_registry!inner(source_key,source_name)");
    expect(source).not.toContain("api_source_registry!inner(source_key,name)");
  });
});
