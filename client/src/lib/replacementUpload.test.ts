import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock("@/lib/session-token", () => ({ getAuthenticatedRequestHeaders: auth.headers }));
import { uploadReplacementDocument } from "./replacementUpload";

const request = vi.fn();
const file = new File(["replacement evidence"], "replacement.xml", { type: "application/xml" });
const success = { success: true, originalDocumentId: 41, newDocumentId: 42 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", request);
  auth.headers.mockResolvedValue(new Headers({ "x-lighthouse-supabase-session": "synthetic-current-session" }));
});
afterEach(() => vi.unstubAllGlobals());

describe("replacement upload transport", () => {
  it("attaches the current session directly and preserves the multipart file without setting its boundary", async () => {
    request.mockResolvedValue(Response.json(success));
    await expect(uploadReplacementDocument(41, file)).resolves.toEqual({ newDocumentId: 42 });
    expect(auth.headers).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("/api/upload/replace/41");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
    expect(options.headers.get("x-lighthouse-supabase-session")).toBe("synthetic-current-session");
    expect(options.headers.has("Content-Type")).toBe(false);
    expect(options.body.get("file").name).toBe("replacement.xml");
    expect(await options.body.get("file").text()).toBe("replacement evidence");
  });

  it("permits the server to authenticate a session cookie when no Supabase header is available", async () => {
    auth.headers.mockResolvedValue(new Headers());
    request.mockResolvedValue(Response.json(success));
    await expect(uploadReplacementDocument(41, file)).resolves.toEqual({ newDocumentId: 42 });
    expect(request).toHaveBeenCalledOnce();
    const [, options] = request.mock.calls[0];
    expect(options.credentials).toBe("include");
    expect(options.headers.has("x-lighthouse-supabase-session")).toBe(false);
    expect(options.body.get("file").name).toBe("replacement.xml");
  });

  it("reports a server rejection when neither session mechanism authenticates, without retrying", async () => {
    auth.headers.mockResolvedValue(new Headers());
    request.mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));
    await expect(uploadReplacementDocument(41, file)).rejects.toThrow("Sign in again");
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1].credentials).toBe("include");
  });

  it.each([Response.json({ error: "Unauthorized" }, { status: 401 }), new Response("Unauthorized", { status: 401 })])(
    "explains a server session rejection without retrying the write", async response => {
      request.mockResolvedValue(response);
      await expect(uploadReplacementDocument(41, file)).rejects.toThrow("Sign in again, then retry with the selected replacement file");
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [409, { error: "SAME_CONTENT", message: "This file has the same content as the original document." }, "This file has the same content"],
    [409, { error: "DUPLICATE_SOURCE", message: "This file already exists in this case as document #12." }, "already exists in this case as document #12"],
    [400, { error: "This source belongs to a sealed snapshot." }, "belongs to a sealed snapshot"],
    [403, { error: "Access denied" }, "Access denied"],
  ] as const)("preserves readable server guidance for HTTP %s", async (status, payload, expected) => {
    request.mockResolvedValue(Response.json(payload, { status }));
    await expect(uploadReplacementDocument(41, file)).rejects.toThrow(expected);
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    [413, "upload size limit"], [429, "Uploads are busy"],
    [502, "check its replacement chain before retrying"],
    [504, "check its replacement chain before retrying"],
    [400, "Replacement upload failed (HTTP 400)"],
  ])("handles non-JSON HTTP %s without exposing HTML or parse errors", async (status, expected) => {
    request.mockResolvedValue(new Response("<html>upstream failure</html>", { status: Number(status) }));
    await expect(uploadReplacementDocument(41, file)).rejects.toThrow(String(expected));
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    null, { success: true }, { ...success, originalDocumentId: 99 },
    { ...success, newDocumentId: 0 }, { ...success, newDocumentId: "42" },
  ])("does not report success for an invalid acknowledgement", async payload => {
    request.mockResolvedValue(Response.json(payload));
    await expect(uploadReplacementDocument(41, file)).rejects.toThrow("did not confirm the replacement");
    expect(request).toHaveBeenCalledOnce();
  });

  it("does not retry a lost response because the replacement may have committed", async () => {
    request.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(uploadReplacementDocument(41, file)).rejects.toThrow("check its replacement chain before retrying");
    expect(request).toHaveBeenCalledOnce();
  });
});
