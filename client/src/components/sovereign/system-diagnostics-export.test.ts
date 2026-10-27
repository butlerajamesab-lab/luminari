import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSystemDiagnosticExport,
  SYSTEM_DIAGNOSTIC_EXPORT_PATHS,
} from "./system-diagnostics-export";

const health = {
  status: "healthy",
  database: "connected",
  timestamp: "2026-10-27T14:00:00.000Z",
};
const routes = {
  timestamp: "2026-10-27T14:00:01.000Z",
  frontend: {
    total: 1,
    routes: [{ path: "/", component_slug: "home", layer: "L0", registered: true }],
  },
  backend: {
    total: 1,
    mounts: [{ method: "GET", path: "/api/health", source: "liveness" }],
  },
};
const schema = {
  timestamp: "2026-10-27T14:00:02.000Z",
  tables: { total: 1, items: [{ table_name: "cases", column_count: 11 }] },
  views: { total: 1, items: [{ view_name: "v_runtime_cases" }] },
  foreign_keys: {
    total: 1,
    items: [
      { source_table: "case_events", source_column: "case_id", target_table: "cases", target_column: "id" },
    ],
  },
};

function reply(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function stubResponses(...responses: Response[]) {
  const mock = vi.fn();
  for (const response of responses) mock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("authenticated system diagnostic JSON export", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("fetches all three exact existing endpoints sequentially and preserves native payloads", async () => {
    const requests = stubResponses(reply(health), reply(routes), reply(schema));
    const exported = await fetchSystemDiagnosticExport();

    expect(exported.format).toBe("lighthouse_system_diagnostics_v1");
    expect(exported.health).toEqual(health);
    expect(exported.routes).toEqual(routes);
    expect(exported.schema).toEqual(schema);
    expect(exported.source_paths).toEqual(SYSTEM_DIAGNOSTIC_EXPORT_PATHS);
    expect(new Date(exported.exported_at).toISOString()).toBe(exported.exported_at);
    expect(requests).toHaveBeenCalledTimes(3);
    for (const [index, path] of SYSTEM_DIAGNOSTIC_EXPORT_PATHS.entries()) {
      expect(requests).toHaveBeenNthCalledWith(index + 1, path, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
    }
  });

  it("does not fetch schema or return a snapshot when admin authentication fails", async () => {
    const requests = stubResponses(reply({ error: "authentication_required" }, 401));
    await expect(fetchSystemDiagnosticExport()).rejects.toThrow(
      "/api/system/health returned HTTP 401 (administrator authentication required)",
    );
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it("rejects a 403 on the schema endpoint, without returning a partial snapshot", async () => {
    const requests = stubResponses(
      reply(health), reply(routes), reply({ error: "administrator_required" }, 403),
    );
    await expect(fetchSystemDiagnosticExport()).rejects.toThrow(
      "/api/system/schema returned HTTP 403 (administrator authentication required)",
    );
    expect(requests).toHaveBeenCalledTimes(3);
  });

  it("rejects query-error rows hidden behind an HTTP 200 schema result", async () => {
    const broken = {
      ...schema,
      views: { total: 1, items: [{ error: "database connection timeout" }] },
    };
    stubResponses(reply(health), reply(routes), reply(broken));
    await expect(fetchSystemDiagnosticExport()).rejects.toThrow(
      "failed or incomplete schema inventory",
    );
  });

  it("rejects mismatched counts and malformed items instead of exporting false totals", async () => {
    const broken = { ...schema, tables: { total: 0, items: schema.tables.items } };
    stubResponses(reply(health), reply(routes), reply(broken));
    await expect(fetchSystemDiagnosticExport()).rejects.toThrow(
      "failed or incomplete schema inventory",
    );
  });

  it("rejects malformed route payloads even when HTTP status is 200", async () => {
    const broken = { ...routes, frontend: { total: 1, routes: [{ path: "/" }] } };
    stubResponses(reply(health), reply(broken));
    await expect(fetchSystemDiagnosticExport()).rejects.toThrow(
      "incomplete route inventory",
    );
  });

  it("rejects non-JSON responses", async () => {
    const invalid = {
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected HTML")),
    } as unknown as Response;
    stubResponses(invalid);
    await expect(fetchSystemDiagnosticExport()).rejects.toThrow(
      "did not return valid JSON",
    );
  });
});
