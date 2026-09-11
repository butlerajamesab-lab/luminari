import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
}));

import {
  getRuntimeLegalLibraryStats,
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

  it("queries current reconciled legal authority objects before legacy compatibility rows", () => {
    const source = read("server/legal-library-runtime-db.ts");
    expect(source).toContain("public.v_lighthouse_legal_authority_catalog_v2");
    expect(source).toContain("public.luminari_corpus_candidate_v1");
    expect(source).toContain("'runtime_source','current_corpus'");
    expect(source).toContain("'publication_state',case when legal_catalog_ready then 'catalog_ready' else 'substrate_observed_not_catalog_ready' end");
    expect(source.indexOf("public.v_lighthouse_legal_authority_catalog_v2")).toBeLessThan(source.indexOf("from public.legal_statutes l"));
    expect(source.indexOf("const CURRENT_CASE_CTE")).toBeLessThan(source.indexOf("from public.legal_case_law l"));
    expect(source).not.toContain("from public.v_paginated_statutes ${where}");
    expect(source).not.toContain("from public.v_runtime_case_law ${where}");
  });

  it("binds statute and case-law pagination parameters in the current-corpus union query", async () => {
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

  it("uses one deterministic current-plus-legacy query per legal search with stable bind markers", async () => {
    query.mockResolvedValue({ rows: [] });

    await searchRuntimeStatutes({ jurisdiction: "WA", limit: 10, offset: 5 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("limit $2 offset $3"),
      ["WA", 10, 5],
    );

    query.mockReset();
    query.mockResolvedValue({ rows: [] });

    await searchRuntimeCaseLaw({ court: "9th", limit: 10, offset: 5 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("limit $2 offset $3"),
      ["%9th%", 10, 5],
    );
  });

  it("returns legal-library stats that account for stranded current-corpus authorities", async () => {
    query.mockResolvedValue({
      rows: [{
        statutes: 7,
        case_law: 3,
        enforcement_records: 2,
        weak_joints: 1,
        contradictions: 4,
        current_corpus_legal_authorities: 11,
        stranded_current_corpus_statutes: 5,
        stranded_current_corpus_case_law: 2,
        stranded_current_corpus_legal_authorities: 6,
      }],
    });

    await expect(getRuntimeLegalLibraryStats("WA")).resolves.toEqual({
      statutes: 7,
      caseLaw: 3,
      enforcementRecords: 2,
      weakJoints: 1,
      contradictions: 4,
      currentCorpusLegalAuthorities: 11,
      strandedCurrentCorpusStatutes: 5,
      strandedCurrentCorpusCaseLaw: 2,
      strandedCurrentCorpusLegalAuthorities: 6,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("stranded_current_corpus_legal_authorities"),
      ["WA"],
    );
  });

  it("preserves canonical legal ids while exposing a separate runtime entity key", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: null,
          runtime_entity_id: "xlsx:verified_statute:wa-rcw-1",
          citation: "RCW 1.00.010",
          short_title: "Test Statute",
          jurisdiction: "WA",
          domains: [],
          metadata: {},
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "00000000-0000-0000-0000-000000000123",
          runtime_entity_id: "00000000-0000-0000-0000-000000000123",
          citation: "123 Wn.2d 456",
          case_name: "State v. Example",
          jurisdiction: "WA",
          domains: [],
          metadata: {},
        }],
      });

    await expect(searchRuntimeStatutes({ limit: 1 })).resolves.toEqual([
      expect.objectContaining({
        id: null,
        runtime_entity_id: "xlsx:verified_statute:wa-rcw-1",
      }),
    ]);
    await expect(searchRuntimeCaseLaw({ limit: 1 })).resolves.toEqual([
      expect.objectContaining({
        id: "00000000-0000-0000-0000-000000000123",
        runtime_entity_id: "00000000-0000-0000-0000-000000000123",
      }),
    ]);
  });

  it("joins the API source registry through its live source_name column", () => {
    const source = read("server/routers.ts");
    expect(source).toContain("api_source_registry!inner(source_key,source_name)");
    expect(source).not.toContain("api_source_registry!inner(source_key,name)");
  });
});