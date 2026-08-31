import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  verifyCaseOwnership: vi.fn(),
  streamJsonExport: vi.fn(),
  streamHtmlBundle: vi.fn(),
  loadCurrentCaseExportData: vi.fn(),
  renderCaseReport: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: state.authenticateRequest },
}));

vi.mock("./db", () => ({
  verifyCaseOwnership: state.verifyCaseOwnership,
}));

vi.mock("./export-current", () => {
  class ExportRequestError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
    ) {
      super(message);
      this.name = "ExportRequestError";
    }
  }

  return {
    ExportRequestError,
    clearExportDownloadHeaders: (res: express.Response) => {
      res.removeHeader("Content-Disposition");
      res.removeHeader("X-Luminari-Export-Type");
    },
    streamJsonExport: state.streamJsonExport,
    streamHtmlBundle: state.streamHtmlBundle,
    loadCurrentCaseExportData: state.loadCurrentCaseExportData,
    renderCaseReport: state.renderCaseReport,
  };
});

import {
  parseOptionalSnapshotId,
  parsePositiveIntegerQuery,
  registerExportRoute,
} from "./export-production-route";

async function withExportServer(
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  registerExportRoute(app);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });

  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  state.authenticateRequest.mockResolvedValue({ id: 9 });
  state.verifyCaseOwnership.mockResolvedValue({
    id: 44,
    userId: 9,
    name: "Export Proof",
    _accessLevel: "OWNER",
  });
  state.streamJsonExport.mockImplementation(async (res: express.Response) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end('{"case":{"id":44}}');
  });
  state.streamHtmlBundle.mockImplementation(async (res: express.Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end("<!DOCTYPE html><title>Export Proof</title>");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("case export route", () => {
  it("accepts only strict positive integer case and snapshot identifiers", () => {
    expect(parsePositiveIntegerQuery("44")).toBe(44);
    expect(parsePositiveIntegerQuery("44junk")).toBeNull();
    expect(parsePositiveIntegerQuery("0")).toBeNull();
    expect(parsePositiveIntegerQuery(["44"])).toBeNull();
    expect(parseOptionalSnapshotId(undefined)).toBe(0);
    expect(parseOptionalSnapshotId("0")).toBe(0);
    expect(parseOptionalSnapshotId("72")).toBe(72);
    expect(parseOptionalSnapshotId("-1")).toBeNull();
  });

  it("authenticates and uses the authorized case row for JSON export", async () => {
    await withExportServer(async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/export/json-dump?caseId=44&snapshotId=72&includeText=true`,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ case: { id: 44 } });
    });

    expect(state.authenticateRequest).toHaveBeenCalledTimes(1);
    expect(state.verifyCaseOwnership).toHaveBeenCalledWith(44, 9);
    expect(state.streamJsonExport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 44, _accessLevel: "OWNER" }),
      44,
      { includeTextContent: true, snapshotId: 72 },
    );
  });

  it("never reaches an exporter without authentication and case access", async () => {
    state.authenticateRequest.mockRejectedValueOnce(new Error("no session"));
    await withExportServer(async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/export/full-bundle?caseId=44`,
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });

    expect(state.verifyCaseOwnership).not.toHaveBeenCalled();
    expect(state.streamHtmlBundle).not.toHaveBeenCalled();

    state.authenticateRequest.mockResolvedValueOnce({ id: 9 });
    state.verifyCaseOwnership.mockRejectedValueOnce(new Error("forbidden"));
    await withExportServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/export/json-dump?caseId=44`);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Access denied" });
    });

    expect(state.streamJsonExport).not.toHaveBeenCalled();
  });

  it("rejects a malformed snapshot id before streaming", async () => {
    await withExportServer(async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/export/json-dump?caseId=44&snapshotId=72junk`,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "snapshotId must be a positive integer",
      });
    });

    expect(state.verifyCaseOwnership).toHaveBeenCalledWith(44, 9);
    expect(state.streamJsonExport).not.toHaveBeenCalled();
  });
});
