import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { load_query, queue_query, fetch_mock, ingest_mock, get_bill_text_mock } = vi.hoisted(() => ({
  load_query: vi.fn(),
  queue_query: vi.fn(),
  fetch_mock: vi.fn(),
  ingest_mock: vi.fn(),
  get_bill_text_mock: vi.fn(),
}));
vi.mock("./db", () => ({
  getPool: () => ({ query: load_query }),
  query_with_diagnostics: queue_query,
}));
vi.mock("./civic-genome-rosetta-source-ingestion", () => ({
  ingest_docket_bill_to_rosetta_source: ingest_mock,
}));
vi.mock("./civic-genome-rosetta-family-orchestration", () => ({
  assemble_rosetta_and_resolve_family: vi.fn(),
}));
vi.mock("./services/legiscan", () => ({
  get_bill: vi.fn(),
  get_bill_text: get_bill_text_mock,
  get_amendment: vi.fn(),
}));

import { assert_official_source_response } from "./official-source-response";
import { extract_version_source } from "./civic-genome-legislative-version-pipeline";
import { run_docket_bill_through_rosetta } from "./civic-genome-rosetta-extraction";
import {
  classify_legislative_version_failure,
  process_legislative_version_job,
} from "./civic-genome-legislative-version-queue-worker";

const fixtures = join(process.cwd(), "server", "fixtures", "official-source-transport");
const rejected_html = readFileSync(join(fixtures, "utah-http-200-request-rejected.html"));
const original_pdf = readFileSync(join(fixtures, "utah-hb0179s01-original.pdf"));
const original_pdf_hash = "c655c9453b6c759d00c218e9d06e3061893d3138938f758f45282b3e1514c4b8";
const rejection_error = "official_source_request_rejected_html:http_200";
const original_url = "https://le.utah.gov/Session/2026/bills/introduced/HB0179S01.pdf";
const legal_html = Buffer.from(`<html><head><title>HB 179</title></head><body><main>${
  "Section 1. An agency shall retain the requested public record. ".repeat(6)
}The requested URL was rejected.</main></body></html>`);

function version_fixture(provider_copy = false) {
  return {
    bill_version_id: "11111111-1111-4111-8111-111111111111",
    genome_bill_id: "22222222-2222-4222-8222-222222222222",
    source_document_key: "text:2067507:3329003",
    source_bill_id: 2067507,
    document_family: "text" as const,
    version_type: "committee_substitute",
    provider_sequence: 2,
    stage_rank: 200,
    chamber: null,
    predecessor_bill_version_id: null,
    base_bill_version_id: null,
    provider_document_id: "3329003",
    provider_document_type: "Substitute",
    source_url: original_url,
    provider_url: provider_copy ? "https://legiscan.com/UT/text/HB0179/id/3329003" : null,
    provider_hash: provider_copy ? createHash("md5").update(original_pdf).digest("hex") : null,
    provider_size: provider_copy ? String(original_pdf.length) : null,
    provider_date: "2026-01-28",
    adopted: null,
    description: null,
    predecessor_source_document_key: null,
    base_source_document_key: null,
    latest_metadata: {},
    latest_observed_at: "2026-09-13T00:00:00.000Z",
    source_bill_number: "HB179",
    source_bill_title: "Recorded source transport fixture",
    state_code: "UT",
    session_key: "2026",
  };
}

function cached_bill() {
  return {
    rows: [{
      bill: { texts: [{ doc_id: 3329003, type: "Substitute", state_link: original_url }] },
      fetched_at: "2026-09-13T00:00:00.000Z",
    }],
  };
}

function source_response(bytes: Buffer, content_type: string) {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": content_type } });
}

beforeEach(() => {
  vi.resetAllMocks();
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

describe("official source response integrity", () => {
  it.each(["US", "WA"])("preserves %s jurisdiction and session without changing text identity", async (state_code) => {
    const version = { ...version_fixture(), state_code, session_key: "119" };
    fetch_mock.mockImplementation(async () => source_response(legal_html, "text/html"));
    const first = await extract_version_source(version);
    const other_session = await extract_version_source({ ...version, session_key: "120" });
    expect(first.source_metadata).toMatchObject({
      jurisdiction: state_code,
      docket_session_key: "119",
      docket_source_document_key: version.source_document_key,
      docket_document_family: "text",
      docket_version_type: "committee_substitute",
    });
    expect(other_session.source_metadata.docket_session_key).toBe("120");
    expect(other_session.source_content_hash).toBe(first.source_content_hash);
    expect(other_session.source_byte_hash).toBe(first.source_byte_hash);
    expect(other_session.source_version).toBe(first.source_version);
    expect(first.source_metadata).not.toHaveProperty("admissibility_state");
    expect(first.source_metadata).not.toHaveProperty("live");
  });

  it("does not invent jurisdiction or session for missing historical metadata", async () => {
    fetch_mock.mockImplementation(async () => source_response(legal_html, "text/html"));
    const source = await extract_version_source({ ...version_fixture(), state_code: null, session_key: null });
    expect(source.source_metadata.jurisdiction).toBeNull();
    expect(source.source_metadata.docket_session_key).toBeNull();
  });

  it.each(["live", "action_approaching", "completed", "stalled", "freshness_unknown"])(
    "does not use observed procedural state %s to exclude a registered text",
    async (procedural_state) => {
      fetch_mock.mockImplementation(async () => source_response(legal_html, "text/html"));
      const source = await extract_version_source({
        ...version_fixture(),
        latest_metadata: { procedural_state },
      });
      expect(source.source_text).toContain("An agency shall retain");
      expect(source.source_metadata.registered_metadata).toEqual({ procedural_state });
      expect(source.source_metadata).not.toHaveProperty("admissibility_state");
    },
  );

  it("recognizes the exact retained block page while preserving HTTP 200 and its bytes", () => {
    expect(rejected_html.length).toBe(245);
    expect(() => assert_official_source_response(200, rejected_html)).toThrow(rejection_error);
    expect(createHash("sha256").update(rejected_html).digest("hex")).toBe(
      "598ff3844273de762a92322e38858b8cc29c0c76a1b76f60026992f0f6d2acb9",
    );
  });

  it.each([
    original_pdf,
    legal_html,
    Buffer.from("<html><head><title>Request Rejected</title></head><body>Section 1. An agency shall retain records.</body></html>"),
    Buffer.from("A statute quoting <title>Request Rejected</title> and The requested URL was rejected."),
    Buffer.from("%PDF-1.7\n<html><title>Request Rejected</title>The requested URL was rejected.</html>"),
  ])("requires the full HTML rejection signature and never rejects PDF magic", (bytes) => {
    expect(() => assert_official_source_response(200, bytes)).not.toThrow();
  });

  it("identifies the rejection template before a long explanation can pass text-length validation", async () => {
    const expanded = Buffer.from(rejected_html.toString("utf8").replace(
      "Your support ID is:", `${"Contact the source administrator. ".repeat(15)}Your support ID is:`,
    ));
    fetch_mock.mockResolvedValueOnce(source_response(expanded, "text/html"));
    await expect(extract_version_source(version_fixture())).rejects.toThrow(rejection_error);
    expect(get_bill_text_mock).not.toHaveBeenCalled();
  });

  it.each([
    { marker: "title", html: rejected_html.toString("utf8").replace("<title>", `<style>${"x".repeat(9000)}</style><title>`) },
    { marker: "message", html: rejected_html.toString("utf8").replace("<body>", `<body>${"Upstream diagnostics. ".repeat(500)}`) },
  ])("recognizes a rejection with its $marker beyond 8 KiB in the actual pipeline", async ({ html }) => {
    fetch_mock.mockResolvedValueOnce(source_response(Buffer.from(html), "text/html"));
    await expect(extract_version_source(version_fixture())).rejects.toThrow(rejection_error);
    expect(get_bill_text_mock).not.toHaveBeenCalled();
  });

  it("reports the observed rejection from the actual version pipeline before normalization", async () => {
    fetch_mock.mockResolvedValueOnce(source_response(rejected_html, "text/html; charset=utf-8"));
    await expect(extract_version_source(version_fixture())).rejects.toThrow(rejection_error);
    expect(fetch_mock).toHaveBeenCalledOnce();
    expect(get_bill_text_mock).not.toHaveBeenCalled();
  });

  it("reaches the existing identity-checked provider fallback after an HTTP-200 block", async () => {
    const version = version_fixture(true);
    fetch_mock.mockResolvedValueOnce(source_response(rejected_html, "text/html"));
    get_bill_text_mock.mockResolvedValueOnce({
      doc_id: 3329003,
      doc: original_pdf.toString("base64"),
      mime: "application/pdf",
      text_size: original_pdf.length,
      text_hash: version.provider_hash,
    });
    const extracted = await extract_version_source(version);
    expect(get_bill_text_mock).toHaveBeenCalledWith(3329003);
    expect(extracted.source_byte_hash).toBe(original_pdf_hash);
    expect(extracted.source_url).toBe(version.provider_url);
    expect(extracted.media_type).toBe("application/pdf");
    expect(extracted.source_metadata).toMatchObject({
      official_fetch_error: rejection_error,
      source_fetch_mode: "provider_copy_fallback",
      provider_copy_hash_verified: true,
      provider_copy_size_verified: true,
    });
  });

  it("does not relax provider byte verification when recovering from a block page", async () => {
    const version = version_fixture(true);
    fetch_mock.mockResolvedValueOnce(source_response(rejected_html, "text/html"));
    const altered = Buffer.from(original_pdf);
    altered[altered.length - 1] ^= 1;
    get_bill_text_mock.mockResolvedValueOnce({
      doc_id: 3329003, doc: altered.toString("base64"), mime: "application/pdf",
    });
    await expect(extract_version_source(version)).rejects.toThrow(
      "legislative_version_provider_fallback_hash_mismatch",
    );
  });

  it("preserves the original PDF and current request headers on a successful fetch", async () => {
    fetch_mock.mockResolvedValueOnce(source_response(original_pdf, "application/pdf"));
    const extracted = await extract_version_source(version_fixture());
    expect(extracted.source_byte_hash).toBe(original_pdf_hash);
    expect(extracted.media_type).toBe("application/pdf");
    expect(extracted.source_text.length).toBeGreaterThan(200);
    expect(fetch_mock.mock.calls[0][1].headers).toEqual({
      accept: "application/pdf,text/html;q=0.9,*/*;q=0.1",
    });
    expect(get_bill_text_mock).not.toHaveBeenCalled();
  });

  it("preserves legitimate HTML containing the rejection phrase as ordinary source text", async () => {
    fetch_mock.mockResolvedValueOnce(source_response(legal_html, "text/html"));
    const extracted = await extract_version_source(version_fixture());
    expect(extracted.media_type).toBe("text/html");
    expect(extracted.source_text).toContain("The requested URL was rejected.");
    expect(extracted.source_metadata.source_fetch_mode).toBe("official");
  });

  it("falls back to the retained official PDF when optional Washington HTML is blocked", async () => {
    const version = {
      ...version_fixture(),
      source_url: "https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Bills/House%20Bills/1000.pdf",
    };
    fetch_mock
      .mockResolvedValueOnce(source_response(original_pdf, "application/pdf"))
      .mockResolvedValueOnce(source_response(rejected_html, "text/html"));
    const extracted = await extract_version_source(version);
    expect(fetch_mock).toHaveBeenCalledTimes(2);
    expect(extracted.source_byte_hash).toBe(original_pdf_hash);
    expect(extracted.media_type).toBe("application/pdf");
    expect(extracted.source_metadata.extraction_text_url).toBe(version.source_url);
    expect(get_bill_text_mock).not.toHaveBeenCalled();
  });

  it("also guards the Docket fetch entrypoint before creating an ingestion handoff", async () => {
    load_query.mockResolvedValueOnce(cached_bill());
    fetch_mock.mockResolvedValueOnce(source_response(rejected_html, "text/html"));
    await expect(run_docket_bill_through_rosetta(2067507)).rejects.toThrow(rejection_error);
    expect(ingest_mock).not.toHaveBeenCalled();
    expect(load_query).toHaveBeenCalledOnce();
    expect(fetch_mock).toHaveBeenCalledOnce();
  });

  it.each([
    { bytes: original_pdf, mime: "application/pdf" },
    { bytes: legal_html, mime: "text/html" },
  ])("keeps legitimate $mime on the Docket processing path", async ({ bytes, mime }) => {
    load_query.mockResolvedValueOnce(cached_bill());
    fetch_mock.mockResolvedValueOnce(source_response(bytes, mime));
    ingest_mock.mockRejectedValueOnce(new Error("test ingestion boundary"));
    await expect(run_docket_bill_through_rosetta(2067507)).rejects.toThrow("test ingestion boundary");
    expect(ingest_mock).toHaveBeenCalledWith(2067507);
  });

  it.each([0, 4, 12, 100])("keeps a recognized transport block retryable after %i attempts", (prior_attempt_count) => {
    expect(classify_legislative_version_failure({
      error: new Error(rejection_error), prior_attempt_count,
    })).toMatchObject({
      queue_state: "degraded", failure_class: "transient", terminal: false,
      retry_delay_seconds: expect.any(Number),
    });
  });

  it("retains existing terminal rules for malformed source content and unknown errors", () => {
    expect(classify_legislative_version_failure({
      error: new Error("docket_html_text_incomplete"), prior_attempt_count: 0,
    })).toMatchObject({ queue_state: "permanent_failure", failure_class: "deterministic_contract" });
    expect(classify_legislative_version_failure({
      error: new Error("unknown_failure"), prior_attempt_count: 4,
    })).toMatchObject({ queue_state: "permanent_failure", failure_class: "unknown" });
  });

  it("records retryable transport failure through the actual queue and extraction path", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const version = version_fixture();
    load_query.mockResolvedValueOnce({ rows: [version] });
    fetch_mock
      .mockResolvedValueOnce(new Response('[{"id":1}]', { status: 200 }))
      .mockResolvedValueOnce(new Response('[{"id":41}]', { status: 200 }))
      .mockResolvedValueOnce(source_response(rejected_html, "text/html"));
    await process_legislative_version_job({
      queue_id: "33333333-3333-4333-8333-333333333333",
      bill_version_id: version.bill_version_id,
      source_document_key: version.source_document_key,
      source_bill_id: version.source_bill_id,
      document_family: "text",
      version_type: version.version_type,
      prior_queue_state: "degraded",
      attempt_count: 12,
      document_identifier: "docket:2067507:text:2067507:3329003",
      durable_content_recovery: false,
    });
    expect(queue_query.mock.calls[0][1]).toEqual([
      "33333333-3333-4333-8333-333333333333",
      "degraded", "transient", rejection_error, false, 3600, expect.any(String),
    ]);
    expect(queue_query.mock.calls[1][1]).toEqual([
      version.bill_version_id, rejection_error, "transient",
    ]);
    expect(fetch_mock).toHaveBeenCalledTimes(3);
    expect(fetch_mock.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
  });
});
