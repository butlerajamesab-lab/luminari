import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./civic-genome-rosetta-evaluation", () => ({ get_rosetta_review_base_url: () => "https://rosetta.example.org" }));
import { get_rosetta_current_docket_structure } from "./civic-genome-rosetta-contract";
const fetch_mock = vi.fn();
const input = { source_document_key: "text:1921589:3249036", source_content_hash: "a".repeat(64), extraction_run_id: 42, output_content_hash: "b".repeat(64) };
const row = { extraction_run_id: 42, source_document_id: 6281, corpus_id: 1,
  document_name: "SB785", document_type: "bill", document_identifier: "exact-source", run_version: 1,
  run_status: "completed", confidence_threshold: 1, created_at: "2026-09-16T00:00:00Z", completed_at: "2026-09-16T00:00:01Z",
  objects: [], coverage: {}, provenance_state: "complete", source_content_hash: input.source_content_hash,
  output_content_hash: input.output_content_hash, engine_version: "rosetta-v3-deterministic-sql-2.5.28" };
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch",fetch_mock); vi.stubEnv("ROSETTA_CURRENT_HANDOFF_TOKEN","fixture-only-secret".repeat(3)); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("current structural handoff", () => {
  it("requests the exact current structure with server-only authentication", async () => {
    fetch_mock.mockResolvedValue(Response.json(row));
    expect((await get_rosetta_current_docket_structure(input)).extraction_run_id).toBe(42);
    expect(fetch_mock).toHaveBeenCalledOnce();
    const url = new URL(String(fetch_mock.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/internal/current-docket-structure");
    for (const [key,value] of Object.entries(input)) expect(url.searchParams.get(key)).toBe(String(value));
    expect(fetch_mock.mock.calls[0][1].headers["x-rosetta-handoff-token"]).toBe("fixture-only-secret".repeat(3));
    expect(fetch_mock.mock.calls[0][1].redirect).toBe("error");
  });
  it("fails before transport if its internal credential is absent", async () => {
    vi.stubEnv("ROSETTA_CURRENT_HANDOFF_TOKEN", "");
    await expect(get_rosetta_current_docket_structure(input)).rejects.toThrow("not_configured");
    expect(fetch_mock).not.toHaveBeenCalled();
  });
  it.each([401,409,503])("does not fall back after HTTP %s", async status => {
    fetch_mock.mockResolvedValue(new Response("private error",{status}));
    await expect(get_rosetta_current_docket_structure(input)).rejects.toThrow(`unavailable:${status}`);
    expect(fetch_mock).toHaveBeenCalledOnce();
  });
  it.each([{ extraction_run_id: 41 },{ source_content_hash: "c".repeat(64) },{ output_content_hash: "c".repeat(64) }])("rejects mismatched output %#", async change => {
    fetch_mock.mockResolvedValue(Response.json({ ...row,...change }));
    await expect(get_rosetta_current_docket_structure(input)).rejects.toThrow("identity_mismatch");
    expect(fetch_mock).toHaveBeenCalledOnce();
  });
});
