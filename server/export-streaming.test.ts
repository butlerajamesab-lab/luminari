import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {},
  getSnapshot: state.getSnapshot,
}));

vi.mock("./phase2-db", () => ({
  getPhase2ExportData: vi.fn(),
}));

vi.mock("./crypto-signing", () => ({
  getPublicKeyPem: vi.fn(),
  getPublicKeyFingerprint: vi.fn(),
}));

import {
  EXPORT_TYPE_HEADER,
  ExportRequestError,
  setExportDownloadHeaders,
  streamJsonExport,
} from "./export-streaming";

function responseDouble() {
  const headers = new Map<string, string>();
  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
      return res;
    }),
    removeHeader: vi.fn((name: string) => {
      headers.delete(name.toLowerCase());
    }),
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as Response;

  return { headers, res };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sovereign export response contract", () => {
  it.each([
    ["json-dump", "application/json; charset=utf-8", "Data.json"],
    ["full-bundle", "text/html; charset=utf-8", "Bundle.html"],
  ] as const)(
    "marks %s as a private attachment",
    (type, contentType, suffix) => {
      const { headers, res } = responseDouble();

      setExportDownloadHeaders(res, type, "A Case / Proof");

      expect(headers.get("content-type")).toBe(contentType);
      expect(headers.get("content-disposition")).toBe(
        `attachment; filename="Luminari_A_Case___Proof_${suffix}"`,
      );
      expect(headers.get(EXPORT_TYPE_HEADER.toLowerCase())).toBe(type);
      expect(headers.get("cache-control")).toContain("no-store");
      expect(headers.get("x-content-type-options")).toBe("nosniff");
      expect(headers.has("transfer-encoding")).toBe(false);
    },
  );

  it("rejects a snapshot outside the authorized case before writing a byte", async () => {
    state.getSnapshot.mockResolvedValue({
      id: 72,
      caseId: 99,
      status: "sealed",
    });
    const { headers, res } = responseDouble();

    await expect(
      streamJsonExport(res, { id: 44, name: "Authorized Case" }, 44, {
        snapshotId: 72,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ExportRequestError>>({
        name: "ExportRequestError",
        message: "Snapshot not found for this case",
        statusCode: 404,
      }),
    );

    expect(state.getSnapshot).toHaveBeenCalledWith(72);
    expect(res.write).not.toHaveBeenCalled();
    expect(headers.get(EXPORT_TYPE_HEADER.toLowerCase())).toBe("json-dump");
  });
});
