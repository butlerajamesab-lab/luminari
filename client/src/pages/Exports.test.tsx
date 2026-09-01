import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("@/contexts/CaseContext", () => ({ useCase: vi.fn() }));

import { validateExportDownloadResponse } from "./Exports";

function responseHeaders(values: Record<string, string>) {
  return { headers: new Headers(values) };
}

describe("export download response guard", () => {
  it.each([
    ["json-dump", "application/json; charset=utf-8", "Luminari_Case_Data.json"],
    ["full-bundle", "text/html; charset=utf-8", "Luminari_Case_Bundle.html"],
  ] as const)(
    "accepts a marked %s attachment",
    (type, contentType, filename) => {
      expect(() =>
        validateExportDownloadResponse(
          responseHeaders({
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            "X-Luminari-Export-Type": type,
          }),
          type,
        ),
      ).not.toThrow();
    },
  );

  it("rejects the 200 HTML SPA shell for both download types", () => {
    const spaShell = responseHeaders({
      "Content-Type": "text/html; charset=utf-8",
    });

    expect(() =>
      validateExportDownloadResponse(spaShell, "full-bundle"),
    ).toThrow("application page instead of a case export");
    expect(() => validateExportDownloadResponse(spaShell, "json-dump")).toThrow(
      "application page instead of a case export",
    );
  });

  it("rejects mismatched markers and inline responses", () => {
    expect(() =>
      validateExportDownloadResponse(
        responseHeaders({
          "Content-Type": "application/json",
          "Content-Disposition": "inline",
          "X-Luminari-Export-Type": "full-bundle",
        }),
        "json-dump",
      ),
    ).toThrow("application page instead of a case export");
  });
});
