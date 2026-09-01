import { afterEach, describe, expect, it, vi } from "vitest";

import { get_amendment, get_bill_text } from "./legiscan";

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

  it.each([
    "Document ID not found",
    "No bill text found for ID 99",
  ])("keeps the unavailable document alert '%s' record-scoped", async (message) => {
    vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ERROR",
      alert: { message },
    }), { status: 200 })));

    await expect(get_bill_text(99)).rejects.toThrow(
      "legiscan_record_api_error_while_calling_get_bill_text",
    );
  });

  it.each([
    "Invalid API key key=test-legiscan-key",
    "Daily request quota exhausted",
    "Provider returned an unexplained error",
  ])("keeps shared or ambiguous provider alert '%s' shared and private", async (message) => {
    vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ERROR",
      alert: {
        message,
      },
    }), { status: 200 })));

    let failure: unknown;
    try {
      await get_bill_text(99);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "legiscan_shared_api_error_while_calling_get_bill_text",
    );
    expect((failure as Error).message).not.toContain("test-legiscan-key");
    expect((failure as Error).message).not.toContain(message);
  });
});

describe("LegiScan amendment API client", () => {
  it("calls the authenticated getAmendment operation with the amendment id", async () => {
    vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
    const fetch_mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "OK",
      amendment: {
        amendment_id: 77,
        doc: "SGVsbG8=",
        mime: "text/plain",
        amendment_size: 5,
        amendment_hash: "8b1a9953c4611296a827abf8c47804d7",
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetch_mock);

    await expect(get_amendment(77)).resolves.toMatchObject({
      amendment_id: 77,
      doc: "SGVsbG8=",
    });

    const requested_url = fetch_mock.mock.calls[0]?.[0] as URL;
    expect(requested_url.searchParams.get("op")).toBe("getAmendment");
    expect(requested_url.searchParams.get("id")).toBe("77");
    expect(requested_url.searchParams.get("key")).toBe("test-legiscan-key");
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid amendment id %s without making a request",
    async (amendment_id) => {
      vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
      const fetch_mock = vi.fn();
      vi.stubGlobal("fetch", fetch_mock);

      await expect(get_amendment(amendment_id)).rejects.toThrow(
        "invalid_legiscan_amendment_id",
      );
      expect(fetch_mock).not.toHaveBeenCalled();
    },
  );

  it("rejects an OK response without an amendment document", async () => {
    vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "OK",
      amendment: { amendment_id: 77 },
    }), { status: 200 })));

    await expect(get_amendment(77)).rejects.toThrow(
      "invalid_legiscan_amendment_payload",
    );
  });

  it("requires the amendment envelope to identify the requested amendment", async () => {
    vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "OK",
      amendment: { amendment_id: 78, doc: "SGVsbG8=" },
    }), { status: 200 })));

    await expect(get_amendment(77)).rejects.toThrow(
      "invalid_legiscan_amendment_response_id",
    );
  });

  it("keeps an unavailable amendment alert record-scoped", async () => {
    vi.stubEnv("LEGISCAN_API_KEY", "test-legiscan-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ERROR",
      alert: {
        message: "Unknown amendment ID",
      },
    }), { status: 200 })));

    await expect(get_amendment(77)).rejects.toThrow(
      "legiscan_record_api_error_while_calling_get_amendment",
    );
  });
});
