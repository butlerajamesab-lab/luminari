import { afterEach, describe, expect, it, vi } from "vitest";

import { get_bill_text } from "./legiscan";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("LegiScan bill-text API client", () => {
  it("calls the authenticated getBillText operation with the document id", async () => {
    vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
    const fetch_mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "OK",
      text: {
        doc_id: 99,
        doc: "SGVsbG8=",
        mime: "text/plain",
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch_mock);

    await expect(get_bill_text(99)).resolves.toMatchObject({
      doc_id: 99,
      doc: "SGVsbG8=",
    });

    expect(fetch_mock).toHaveBeenCalledOnce();
    const requested_url = fetch_mock.mock.calls[0]?.[0] as URL;
    expect(requested_url.origin).toBe("https://api.legiscan.com");
    expect(requested_url.searchParams.get("op")).toBe("getBillText");
    expect(requested_url.searchParams.get("id")).toBe("99");
    expect(requested_url.searchParams.get("key")).toBe("test-legiscan-key");
    expect(fetch_mock.mock.calls[0]?.[1]).toMatchObject({
      signal: expect.any(AbortSignal),
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid document id %s without making a request",
    async (document_id) => {
      vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
      const fetch_mock = vi.fn();
      vi.stubGlobal("fetch", fetch_mock);

      await expect(get_bill_text(document_id)).rejects.toThrow(
        "invalid_legiscan_bill_text_document_id",
      );
      expect(fetch_mock).not.toHaveBeenCalled();
    },
  );

  it("rejects an OK response without an embedded document", async () => {
    vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "OK",
      text: { doc_id: 99 },
    }), { status: 200 })));

    await expect(get_bill_text(99)).rejects.toThrow(
      "invalid_legiscan_bill_text_payload",
    );
  });

  it("requires the response to identify the requested document", async () => {
    vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "OK",
      text: { doc: "SGVsbG8=" },
    }), { status: 200 })));

    await expect(get_bill_text(99)).rejects.toThrow(
      "invalid_legiscan_bill_text_response_document_id",
    );
  });

  it.each([undefined, "UNKNOWN"])(
    "rejects a non-OK response status %s",
    async (status) => {
      vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
        ...(status === undefined ? {} : { status }),
        text: { doc_id: 99, doc: "SGVsbG8=" },
      }), { status: 200 })));

      await expect(get_bill_text(99)).rejects.toThrow(
        "legiscan_invalid_status_while_calling_get_bill_text",
      );
    },
  );

  it("redacts the API key from provider error messages", async () => {
    vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ERROR",
      alert: {
        message: "Denied for key=test-legiscan-key&op=getBillText",
      },
    }), { status: 200 })));

    let failure: unknown;
    try {
      await get_bill_text(99);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("key=[redacted]");
    expect((failure as Error).message).not.toContain("test-legiscan-key");
  });
});
