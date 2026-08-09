import { beforeEach, describe, expect, it, vi } from "vitest";

const { query_with_diagnostics_mock } = vi.hoisted(() => ({
  query_with_diagnostics_mock: vi.fn(),
}));

vi.mock("./db-legacy", () => ({
  query_with_diagnostics: query_with_diagnostics_mock,
}));

import {
  create_live_docket_entry,
  delete_live_docket_entry,
  get_live_docket_entry,
  list_live_docket_entries,
  update_live_docket_entry,
} from "./docket-live-read-compat";

const docket_id = "131f9f1e-b953-4f71-9df3-729d37fb7dbf";

const live_row = {
  id: docket_id,
  title: "Observed ordinance",
  entry_type: "ordinance",
  jurisdiction: "Seattle",
  status: "enacted",
  introduced_date: "2026-01-10",
  summary: "Observed summary",
  full_text: null,
  source_url: "https://example.gov/ordinance",
  domains: ["housing"],
  metadata: {
    key_changes: ["Observed change"],
    implementation_agencies: ["Observed agency"],
  },
  created_at: new Date("2026-01-10T00:00:00.000Z"),
  updated_at: "2026-01-11T00:00:00-08:00",
};

const write_input = {
  slug: "observed-ordinance",
  title: "Observed ordinance",
  shortTitle: "Observed",
  jurisdiction: "Seattle",
  jurisdictionLevel: "city",
  lawType: "ordinance",
  status: "enacted",
  dateIntroduced: "2026-01-10",
  summary: "Observed summary",
  keyChanges: ["Observed change"],
  implementationAgencies: ["Observed agency"],
  primarySourceUrl: "https://example.gov/ordinance",
};

describe("docket live UUID identity compatibility", () => {
  beforeEach(() => {
    query_with_diagnostics_mock.mockReset();
  });

  it("preserves UUID identity when listing exact live rows", async () => {
    query_with_diagnostics_mock.mockResolvedValue({
      rows: [live_row],
      rowCount: 1,
    });

    const entries = await list_live_docket_entries();

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(docket_id);
    expect(typeof entries[0].id).toBe("string");
    expect(entries[0].createdAt).toBe("2026-01-10T00:00:00.000Z");
    expect(entries[0].updatedAt).toBe("2026-01-11T08:00:00.000Z");
    expect(entries[0].keyChanges).toEqual(["Observed change"]);
    expect(entries[0].implementationAgencies).toEqual(["Observed agency"]);
    expect(query_with_diagnostics_mock).toHaveBeenCalledWith(
      expect.stringContaining("from public.docket_entries"),
      [50, 0],
      { label: "docket_live_list" },
    );
  });

  it("binds a UUID string for detail reads without numeric coercion", async () => {
    query_with_diagnostics_mock.mockResolvedValue({
      rows: [live_row],
      rowCount: 1,
    });

    const entry = await get_live_docket_entry(docket_id);

    expect(entry?.id).toBe(docket_id);
    expect(query_with_diagnostics_mock).toHaveBeenCalledWith(
      expect.stringContaining("where id = $1::uuid"),
      [docket_id],
      { label: "docket_live_get" },
    );
  });

  it("returns null when the live UUID has no row", async () => {
    query_with_diagnostics_mock.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(get_live_docket_entry(docket_id)).resolves.toBeNull();
  });

  it("creates a live row with exact snake-case columns and metadata", async () => {
    query_with_diagnostics_mock.mockResolvedValue({
      rows: [{ id: docket_id }],
      rowCount: 1,
    });

    await expect(create_live_docket_entry(write_input)).resolves.toBe(docket_id);

    const [sql, values, diagnostics] =
      query_with_diagnostics_mock.mock.calls[0];
    expect(sql).toContain("insert into public.docket_entries");
    expect(sql).toContain("entry_type");
    expect(sql).toContain("introduced_date");
    expect(sql).toContain("source_url");
    expect(sql).not.toContain("shortTitle");
    expect(values.slice(0, 7)).toEqual([
      write_input.title,
      write_input.lawType,
      write_input.jurisdiction,
      write_input.status,
      write_input.dateIntroduced,
      write_input.summary,
      write_input.primarySourceUrl,
    ]);
    expect(JSON.parse(values[7])).toMatchObject({
      slug: write_input.slug,
      short_title: write_input.shortTitle,
      jurisdiction_level: write_input.jurisdictionLevel,
      law_type: write_input.lawType,
      key_changes: write_input.keyChanges,
      implementation_agencies: write_input.implementationAgencies,
      analysis_version: "1.0",
    });
    expect(diagnostics).toEqual({ label: "docket_live_create" });
  });

  it("updates a UUID row through explicit physical and metadata mappings", async () => {
    query_with_diagnostics_mock.mockResolvedValue({
      rows: [{ id: docket_id }],
      rowCount: 1,
    });

    await expect(
      update_live_docket_entry(docket_id, {
        title: "Updated title",
        shortTitle: "Updated",
        keyChanges: ["Updated change"],
      }),
    ).resolves.toBe(true);

    const [sql, values, diagnostics] =
      query_with_diagnostics_mock.mock.calls[0];
    expect(sql).toContain("update public.docket_entries");
    expect(sql).toContain("title = $1");
    expect(sql).toContain("metadata = coalesce(metadata, '{}'::jsonb)");
    expect(sql).toContain("where id = $3::uuid");
    expect(values[0]).toBe("Updated title");
    expect(JSON.parse(values[1])).toEqual({
      short_title: "Updated",
      key_changes: ["Updated change"],
    });
    expect(values[2]).toBe(docket_id);
    expect(diagnostics).toEqual({ label: "docket_live_update" });
  });

  it("deletes only the requested UUID row", async () => {
    query_with_diagnostics_mock.mockResolvedValue({
      rows: [{ id: docket_id }],
      rowCount: 1,
    });

    await expect(delete_live_docket_entry(docket_id)).resolves.toBe(true);
    expect(query_with_diagnostics_mock).toHaveBeenCalledWith(
      expect.stringContaining("delete from public.docket_entries"),
      [docket_id],
      { label: "docket_live_delete" },
    );
  });
});
