import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db", () => ({ getPool: () => ({ query }) }));
vi.mock("../_core/env", () => ({
  ENV: { lighthouseSupabaseUrl: "https://example.supabase.co" },
}));
import {
  get_publishable_resource_directory_detail,
  search_publishable_resource_directory,
} from "./resource-directory-fast-current";

const row = {
  resource_entity_id: "c54c0888-b532-2c51-2045-67cad336b0ef",
  object_ref: "denver-source-candidate",
  name: "Source resource",
  category: "cash_assistance_income",
  ui_category: "cash_assistance",
  state_code: "USVI",
  jurisdiction: "USVI",
  address: "Source address",
  artifact_key: "source-artifact",
  source_locator: "lines:120-125",
  source_content_sha256: "a".repeat(64),
};

beforeEach(() => query.mockReset());

describe("resource search/detail continuity", () => {
  it("applies the same presentation category and territory to search and detail, without inventing structured address geography", async () => {
    query.mockResolvedValueOnce({ rows: [row] });
    const search = await search_publishable_resource_directory({
      jurisdiction: "USVI",
    });
    expect(query.mock.calls[0][1][0]).toBe("VI");
    query
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const detail = await get_publishable_resource_directory_detail(
      row.resource_entity_id,
    );
    expect(query.mock.calls[1][0]).toContain("as ui_category");
    expect(detail).toMatchObject({
      resource_entity_id: row.resource_entity_id,
      resource_category: search.items[0].resource_category,
      state: "VI",
      jurisdiction: "VI",
      source_state: "USVI",
      source_jurisdiction: "USVI",
      locations: [{ state: null }],
      source_access: { status: "source_not_registered", url: null },
    });
  });

  it("binds provenance lookup to the current row's candidate and artifact, with no request-supplied storage path", async () => {
    query
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await get_publishable_resource_directory_detail(row.resource_entity_id);
    expect(query.mock.calls[1][1]).toEqual([row.object_ref]);
    expect(query.mock.calls[2][1]).toEqual([row.artifact_key]);
    expect(query.mock.calls[2][0]).toContain("storage.buckets");
    expect(query.mock.calls[2][0]).toContain("storage.objects");
  });

  it("renders reviewed transcription while preserving original fields and the existing publication state", async () => {
    const correction = {
      revision_id: "source-review-revision",
      review_scope: "source_assertion_only",
      before_fields: { name: "Phone line accidentally used as a name" },
      after_fields: { name: "Denver Rescue Mission" },
    };
    query.mockResolvedValueOnce({
      rows: [
        {
          ...row,
          name: "Denver Rescue Mission",
          source_transcription_correction: correction,
          person_facing_ready: true,
          data_state: "current_typed",
        },
      ],
    });
    const result = await search_publishable_resource_directory({});
    expect(query.mock.calls[0][0]).toContain(
      "v_lighthouse_resource_program_transcribed_v1",
    );
    expect(query.mock.calls[0][0]).toContain("source_transcription_correction");
    expect(result.items[0]).toMatchObject({
      resource_entity_id: row.resource_entity_id,
      resource_name: "Denver Rescue Mission",
      source_resource_name: "Phone line accidentally used as a name",
      source_transcription_correction: correction,
      verification_status: "current_typed",
      person_facing_ready: true,
    });
  });
});
