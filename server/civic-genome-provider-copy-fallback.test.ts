import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Civic Genome provider-copy source fallback", () => {
  it("uses a LegiScan copy only after the official fetch fails and verifies bytes", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    const fetch_mock = vi.fn()
      .mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), {
        cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" },
      }))
      .mockResolvedValueOnce(new Response(source, {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    vi.stubGlobal("fetch", fetch_mock);

    const extracted = await extract_version_source(
      version_fixture(source, expected_md5) as never,
    );

    expect(fetch_mock).toHaveBeenCalledTimes(2);
    expect(fetch_mock.mock.calls[0]?.[0]).toContain("legislature.vermont.gov");
    expect(String(fetch_mock.mock.calls[1]?.[0])).toContain("legiscan.com");
    expect(extracted.source_url).toContain("legiscan.com");
    expect(extracted.source_version).toContain("hash-checked-provider-copy-v1");
    expect(extracted.source_metadata).toMatchObject({
      source_fetch_mode: "provider_copy_fallback",
      provider_copy_fallback_used: true,
      provider_copy_hash_verified: true,
      provider_copy_size_verified: true,
      docket_official_source_url: expect.stringContaining("legislature.vermont.gov"),
      provider_copy_retrieval_url: expect.stringContaining("legiscan.com"),
    });
  });

  it("fails closed when the provider bytes do not match the registered hash", async () => {
    const source = html_source();
    const fetch_mock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(source, {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    vi.stubGlobal("fetch", fetch_mock);

    await expect(extract_version_source(
      version_fixture(source, "0".repeat(32)) as never,
    )).rejects.toThrow("legislative_version_provider_fallback_hash_mismatch");
  });

  it("does not use an untrusted provider host", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    const version = {
      ...version_fixture(source, expected_md5),
      provider_url: "https://example.test/untrusted-copy",
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(extract_version_source(version as never))
      .rejects.toThrow("legislative_version_provider_fallback_authority_invalid");
  });

  it("rejects a provider redirect before it can leave the LegiScan boundary", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    const fetch_mock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/internal" },
      }));
    vi.stubGlobal("fetch", fetch_mock);

    await expect(extract_version_source(
      version_fixture(source, expected_md5) as never,
    )).rejects.toThrow("legislative_version_provider_fallback_authority_invalid");

    expect(fetch_mock).toHaveBeenCalledTimes(2);
  });

  it("allows a bounded redirect that remains inside the LegiScan boundary", async () => {
    const source = html_source();
    const expected_md5 = createHash("md5").update(source).digest("hex");
    const redirected_url = "https://www.legiscan.com/VT/text/S0001/id/99/download";
    const fetch_mock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: redirected_url },
      }))
      .mockResolvedValueOnce(new Response(source, {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    vi.stubGlobal("fetch", fetch_mock);

    const extracted = await extract_version_source(
      version_fixture(source, expected_md5) as never,
    );

    expect(fetch_mock).toHaveBeenCalledTimes(3);
    expect(fetch_mock.mock.calls[1]?.[1]).toMatchObject({ redirect: "manual" });
    expect(fetch_mock.mock.calls[2]?.[0]).toEqual(new URL(redirected_url));
    expect(extracted.source_url).toBe(redirected_url);
  });

  it("does not fall back when the official bytes arrive but parsing rejects them", async () => {
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
  });
});
