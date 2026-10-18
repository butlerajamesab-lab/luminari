import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ getPool: () => ({ query }) }));
vi.mock("../_core/env", () => ({ ENV: {} }));
vi.mock("./resource-source-access", () => ({ resource_source_access: vi.fn() }));

const { get_publishable_resource_directory_summary } = await import("./resource-directory-fast-current");

describe("Resource Directory summary fail-closed aggregates", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("rejects missing SQL aggregate rows instead of publishing synthetic zero coverage", async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(get_publishable_resource_directory_summary()).rejects.toThrow(
      "resource_directory_summary_incomplete",
    );
  });

  it("accepts a genuine empty aggregate while retaining explicit empty categories", async () => {
    query.mockResolvedValue({
      rows: [{ totals: {
        total_resources: 0,
        contact_count: 0,
        resources_with_contacts: 0,
        location_count: 0,
        resources_with_locations: 0,
        jurisdiction_count: 0,
        direct_resource_count: 0,
        program_count: 0,
        person_facing_ready_count: 0,
        category_reviewed_count: 0,
        category_review_pending_count: 0,
        source_preserved_pending_count: 0,
      }, categories: [], jurisdictions: [] }],
    });
    const result = await get_publishable_resource_directory_summary();
    expect(result).toMatchObject({
      total_directory_records: 0,
      availability: "unavailable",
      categories: [],
      jurisdictions: [],
    });
  });
});
