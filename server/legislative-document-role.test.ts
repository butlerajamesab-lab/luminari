import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { load_query, queue_query, fetch_mock, assembly_mock } = vi.hoisted(() => ({
  load_query: vi.fn(),
  queue_query: vi.fn(),
  fetch_mock: vi.fn(),
  assembly_mock: vi.fn(),
}));

vi.mock("./db", () => ({
  getPool: () => ({ query: load_query }),
  query_with_diagnostics: queue_query,
}));
vi.mock("./civic-genome-rosetta-family-orchestration", () => ({
  assemble_rosetta_and_resolve_family: assembly_mock,
}));
vi.mock("./civic-genome-rosetta-extraction", () => ({
  derive_california_official_text_url: () => null,
  normalize_official_html: vi.fn(),
  normalize_wa_official_html: vi.fn(),
}));

import {
  classify_legislative_document_role,
  LEGISLATIVE_NON_LEGISLATIVE_DOCUMENT_ERROR_CODE,
} from "./legislative-document-role";
import {
  extract_version_source,
  process_legislative_version,
} from "./civic-genome-legislative-version-pipeline";
import {
  classify_legislative_version_failure,
  process_legislative_version_job,
} from "./civic-genome-legislative-version-queue-worker";

type source_fixture = {
  source_run_id: number;
  document_identifier: string;
  document_family: "amendment";
  source_url: string;
  provider_document_type: string;
  description: string;
  expected_role: "fiscal_note" | "unknown";
};
const fixtures = JSON.parse(readFileSync(join(
  process.cwd(), "server", "fixtures", "legislative-document-role-20260913.json",
), "utf8")).sources as source_fixture[];
const fiscal_note = fixtures.find(source => source.source_run_id === 1002170)!;
const amendment_controls = fixtures.filter(source => source.expected_role === "unknown");
const bill_version_id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetch_mock);
  vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta.example.test");
  vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  queue_query.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("legislative document role", () => {
  it.each(fixtures)("classifies retrieved source $source_run_id without changing evidence", (source) => {
    const before = JSON.stringify(source);
    expect(classify_legislative_document_role(Object.freeze(source))).toEqual({
      document_role: source.expected_role,
      classification_rule: source.expected_role === "fiscal_note"
        ? "ky-official-fiscal-note-v1"
        : null,
    });
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each([
    { source_url: fiscal_note.source_url, description: null },
    { source_url: fiscal_note.source_url, description: "House Committee Substitute 1" },
    { source_url: fiscal_note.source_url, description: "Amend fiscal note requirements" },
    { source_url: fiscal_note.source_url, description: "Fiscal Notebook" },
    { source_url: fiscal_note.source_url.replace("/note/", "/bill/"), description: fiscal_note.description },
    { source_url: fiscal_note.source_url.replace("HCS1FN.pdf", "HCS1.pdf"), description: fiscal_note.description },
    { source_url: fiscal_note.source_url.replace("ky.gov", "ky.gov.example.test"), description: fiscal_note.description },
    { source_url: fiscal_note.source_url.replace("https://", "https://user@"), description: fiscal_note.description },
    { source_url: fiscal_note.source_url.replace("https://", "http://"), description: fiscal_note.description },
    { source_url: "not a URL", description: fiscal_note.description },
  ])("requires corroborating official locator and explicit note description: %j", (source) => {
    expect(classify_legislative_document_role(source)).toEqual({
      document_role: "unknown",
      classification_rule: null,
    });
  });

  it("does not classify an amendment from fiscal-note words in statute text or a bill title", () => {
    const source = {
      ...amendment_controls[0],
      source_text: 'Amend section 1 to read: "A fiscal note shall accompany every bill."',
      source_bill_title: "Fiscal Note Act",
    };
    expect(classify_legislative_document_role(source).document_role).toBe("unknown");
  });

  it("blocks source creation, extraction, and assembly for a corroborated fiscal note", async () => {
    load_query.mockResolvedValueOnce({ rows: [fiscal_note] });
    await expect(process_legislative_version(bill_version_id)).rejects.toThrow(
      LEGISLATIVE_NON_LEGISLATIVE_DOCUMENT_ERROR_CODE,
    );
    expect(load_query).toHaveBeenCalledOnce();
    expect(load_query.mock.calls[0][0]).toMatch(/^select /);
    expect(fetch_mock).not.toHaveBeenCalled();
    expect(assembly_mock).not.toHaveBeenCalled();
    expect(queue_query).not.toHaveBeenCalled();
  });

  it("also guards callers of direct source extraction before any download", async () => {
    await expect(extract_version_source(fiscal_note as never)).rejects.toThrow(
      LEGISLATIVE_NON_LEGISLATIVE_DOCUMENT_ERROR_CODE,
    );
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it.each(amendment_controls)("keeps source $source_run_id on the existing processing path", async (source) => {
    load_query.mockResolvedValueOnce({ rows: [source] });
    fetch_mock.mockRejectedValueOnce(new Error("test transport stop"));
    await expect(process_legislative_version(bill_version_id)).rejects.toThrow(
      "legislative_version_rosetta_request_network_failed:Error",
    );
    expect(fetch_mock).toHaveBeenCalledOnce();
    expect(String(fetch_mock.mock.calls[0][0])).toContain("/rest/v1/corpus?");
    expect(fetch_mock.mock.calls[0][1].method).toBe("GET");
  });

  it("records an immediate visible terminal disposition through the actual queue path", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    load_query.mockResolvedValueOnce({ rows: [fiscal_note] });
    await process_legislative_version_job({
      queue_id: "22222222-2222-4222-8222-222222222222",
      bill_version_id,
      source_document_key: "amendment:2122615:289230",
      source_bill_id: 2122615,
      document_family: "amendment",
      version_type: "house_amendment",
      prior_queue_state: "eligible",
      attempt_count: 0,
      document_identifier: fiscal_note.document_identifier,
      durable_content_recovery: false,
    });
    expect(queue_query).toHaveBeenCalledTimes(2);
    expect(queue_query.mock.calls[0][1]).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "permanent_failure", "deterministic_contract",
      LEGISLATIVE_NON_LEGISLATIVE_DOCUMENT_ERROR_CODE,
      true, 0, expect.any(String),
    ]);
    expect(queue_query.mock.calls[1][1]).toEqual([
      bill_version_id,
      LEGISLATIVE_NON_LEGISLATIVE_DOCUMENT_ERROR_CODE,
      "deterministic_contract",
    ]);
    expect(fetch_mock).not.toHaveBeenCalled();
    expect(assembly_mock).not.toHaveBeenCalled();
  });

  it("keeps unknown document-role errors under the existing retry policy", () => {
    expect(classify_legislative_version_failure({
      error: new Error("legislative_version_non_legislative_document:unknown"),
      prior_attempt_count: 0,
    })).toMatchObject({ queue_state: "degraded", terminal: false });
  });
});
