import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

const { get_amendment_mock, get_bill_text_mock } = vi.hoisted(() => ({
  get_amendment_mock: vi.fn(),
  get_bill_text_mock: vi.fn(),
}));

vi.mock("./services/legiscan", () => ({
  get_amendment: get_amendment_mock,
  get_bill_text: get_bill_text_mock,
}));

import { extract_version_source } from "./civic-genome-legislative-version-pipeline";

function version_fixture(source: string, expected_md5: string) {
  return {
    bill_version_id: "11111111-1111-4111-8111-111111111111",
    genome_bill_id: "22222222-2222-4222-8222-222222222222",
    source_document_key: "VT:S0001:text:1",
    source_bill_id: 1,
    document_family: "text" as const,
    version_type: "introduced",
    provider_sequence: 1,
    stage_rank: 1,
    chamber: "S",
    predecessor_bill_version_id: null,
    base_bill_version_id: null,
    provider_document_id: "99",
    provider_document_type: "Bill Text",
    source_url: "https://legislature.vermont.gov/Documents/2026/Docs/BILLS/S-0001/S-0001%20As%20Introduced.pdf",
    provider_url: "https://legiscan.com/VT/text/S0001/id/99",
    provider_hash: expected_md5,
    provider_size: String(Buffer.byteLength(source)),
    provider_date: "2026-01-01",
    adopted: false,
    description: null,
    predecessor_source_document_key: null,
    base_source_document_key: null,
    latest_metadata: {},
    latest_observed_at: "2026-01-02T00:00:00.000Z",
    source_bill_number: "S 1",
    source_bill_title: "Fallback contract fixture",
  };
}

function html_source(): string {
  return `<!doctype html><html><body><main>${"Provider-preserved bill text. ".repeat(20)}</main></body></html>`;
}

function api_document(source: string) {
  return {
    doc_id: 99,
    doc: Buffer.from(source).toString("base64"),
    mime: "text/html",
    text_size: Buffer.byteLength(source),
    text_hash: createHash("md5").update(source).digest("hex"),
    url: "https://legiscan.com/VT/text/S0001/id/99",
  };
}

function amendment_version_fixture(source: string, expected_md5: string) {
  return {
    ...version_fixture(source, expected_md5),
    source_document_key: "VT:S0001:amendment:1",
    document_family: "amendment" as const,
    version_type: "senate_amendment",
    provider_document_type: "Senate Amendment 001",
    provider_url: "https://legiscan.com/VT/amendment/S0001/id/99",
  };
}

function api_amendment(source: string) {
  return {
    amendment_id: 99,
    doc: Buffer.from(source).toString("base64"),
    mime: "text/html",
    amendment_size: Buffer.byteLength(source),
    amendment_hash: createHash("md5").update(source).digest("hex"),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Civic Genome provider-copy source fallback", () => {
  it("uses authenticated LegiScan bill text only after the official fetch fails", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    const fetch_mock = vi.fn().mockRejectedValueOnce(Object.assign(
      new TypeError("fetch failed"),
      { cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" } },
    ));
    vi.stubGlobal("fetch", fetch_mock);
    get_bill_text_mock.mockResolvedValueOnce(api_document(source));

    const extracted = await extract_version_source(
      version_fixture(source, expected_md5) as never,
    );

    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(fetch_mock.mock.calls[0]?.[0]).toContain("legislature.vermont.gov");
    expect(get_bill_text_mock).toHaveBeenCalledOnce();
    expect(get_bill_text_mock).toHaveBeenCalledWith(99);
    expect(extracted.source_url).toBe("https://legiscan.com/VT/text/S0001/id/99");
    expect(extracted.source_version).toContain(
      "legiscan-api-hash-checked-provider-copy-v2",
    );
    expect(extracted.source_metadata).toMatchObject({
      source_fetch_mode: "provider_copy_fallback",
      provider_copy_fallback_used: true,
      provider_copy_hash_verified: true,
      provider_copy_size_verified: true,
      provider_copy_retrieval_mode: "legiscan_api_get_bill_text",
      provider_copy_api_document_id: 99,
      docket_official_source_url: expect.stringContaining("legislature.vermont.gov"),
      provider_copy_locator_url: "https://legiscan.com/VT/text/S0001/id/99",
    });
  });

  it("routes amendment recovery through the amendment-specific API envelope", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")));
    get_amendment_mock.mockResolvedValueOnce(api_amendment(source));

    const extracted = await extract_version_source(
      amendment_version_fixture(source, expected_md5) as never,
    );

    expect(get_amendment_mock).toHaveBeenCalledOnce();
    expect(get_amendment_mock).toHaveBeenCalledWith(99);
    expect(get_bill_text_mock).not.toHaveBeenCalled();
    expect(extracted.source_metadata).toMatchObject({
      docket_document_family: "amendment",
      provider_copy_retrieval_mode: "legiscan_api_get_amendment",
      provider_copy_api_document_id: 99,
      provider_copy_hash_verified: true,
      provider_copy_size_verified: true,
    });
  });

  it("rejects an amendment response for a different provider amendment", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")));
    get_amendment_mock.mockResolvedValueOnce({
      ...api_amendment(source),
      amendment_id: 100,
    });

    await expect(extract_version_source(
      amendment_version_fixture(source, expected_md5) as never,
    )).rejects.toThrow(
      "legislative_version_provider_fallback_document_id_mismatch",
    );
  });

  it("fails closed when decoded provider bytes do not match the registered hash", async () => {
    const source = html_source();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")));
    get_bill_text_mock.mockResolvedValueOnce({
      ...api_document(source),
      text_hash: "0".repeat(32),
    });

    await expect(extract_version_source(
      version_fixture(source, "0".repeat(32)) as never,
    )).rejects.toThrow("legislative_version_provider_fallback_hash_mismatch");
  });

  it("does not call the API for an untrusted provider locator", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    const version = {
      ...version_fixture(source, expected_md5),
      provider_url: "https://example.test/untrusted-copy",
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(extract_version_source(version as never))
      .rejects.toThrow("legislative_version_provider_fallback_authority_invalid");
    expect(get_bill_text_mock).not.toHaveBeenCalled();
  });

  it("rejects malformed base64 before parsing or verification", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")));
    get_bill_text_mock.mockResolvedValueOnce({
      ...api_document(source),
      doc: "not-base64***=",
    });

    await expect(extract_version_source(
      version_fixture(source, expected_md5) as never,
    )).rejects.toThrow(
      "legislative_version_provider_fallback_document_base64_invalid",
    );
  });

  it("rejects a bill-text response for a different provider document", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")));
    get_bill_text_mock.mockResolvedValueOnce({
      ...api_document(source),
      doc_id: 100,
    });

    await expect(extract_version_source(
      version_fixture(source, expected_md5) as never,
    )).rejects.toThrow(
      "legislative_version_provider_fallback_document_id_mismatch",
    );
  });

  it("rejects a bill-text response that omits its document identity", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")));
    const { doc_id: _omitted, ...unidentified_document } = api_document(source);
    get_bill_text_mock.mockResolvedValueOnce(unidentified_document);

    await expect(extract_version_source(
      version_fixture(source, expected_md5) as never,
    )).rejects.toThrow(
      "legislative_version_provider_fallback_document_id_mismatch",
    );
  });

  it("fails closed when API metadata disagrees with the registered size", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")));
    get_bill_text_mock.mockResolvedValueOnce({
      ...api_document(source),
      text_size: Buffer.byteLength(source) + 1,
    });

    await expect(extract_version_source(
      version_fixture(source, expected_md5) as never,
    )).rejects.toThrow(
      "legislative_version_provider_fallback_api_size_mismatch",
    );
  });

  it("does not fall back when official bytes arrive but parsing rejects them", async () => {
    const provider_source = html_source();
    const expected_md5 = createHash("md5").update(provider_source).digest("hex");
    const fetch_mock = vi.fn().mockResolvedValue(new Response(
      "official response with no supported document format",
      { status: 200, headers: { "content-type": "text/plain" } },
    ));
    vi.stubGlobal("fetch", fetch_mock);

    await expect(extract_version_source(
      version_fixture(provider_source, expected_md5) as never,
    )).rejects.toThrow("legislative_version_source_format_unsupported");

    expect(fetch_mock).toHaveBeenCalledTimes(1);
    expect(fetch_mock.mock.calls[0]?.[0]).toContain("legislature.vermont.gov");
    expect(get_bill_text_mock).not.toHaveBeenCalled();
  });
});
