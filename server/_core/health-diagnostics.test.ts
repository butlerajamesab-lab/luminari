import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  query_with_diagnostics: vi.fn(),
  classify_db_error: vi.fn(() => "db_error"),
  get_pool_runtime_configuration: vi.fn(() => ({ pool_total_count: 25, pool_idle_count: 0, pool_waiting_count: 2, pool_max: 25, host: "test", connection_timeout_ms: 5000, idle_timeout_ms: 10000, max_uses: 7500, statement_timeout_ms: null, query_timeout_ms: null, keep_alive: true })),
}));

vi.mock("../db", () => dbMock);

const moduleUnderTest = await import("./health-diagnostics");
const { getDatabaseDiagnostic, __health_diagnostics_test } = moduleUnderTest;

describe("health diagnostics cache and semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __health_diagnostics_test.reset();
    dbMock.classify_db_error.mockReturnValue("db_error");
    dbMock.query_with_diagnostics.mockImplementation(async (text: string) => {
      if (text.includes("version()")) return { rows: [{ version: "PostgreSQL test" }], rowCount: 1 };
      if (text.includes("information_schema.columns")) return { rows: [{ table_name: "alpha", column_count: 2 }], rowCount: 1 };
      if (text.includes("information_schema.views")) return { rows: [{ view_name: "alpha_view" }], rowCount: 1 };
      return { rows: [{ table_name: "alpha", column_name: "beta", foreign_table_name: "gamma", foreign_column_name: "id" }], rowCount: 1 };
    });
  });

  it("shares one deep diagnostic refresh across concurrent requests", async () => {
    const [a, b] = await Promise.all([getDatabaseDiagnostic({ force: true }), getDatabaseDiagnostic({ force: true })]);
    expect(a.db_diagnostic.generated_at).toBeTruthy();
    expect(b.db_diagnostic.generated_at).toBe(a.db_diagnostic.generated_at);
    expect(dbMock.query_with_diagnostics.mock.calls.filter(([text]) => String(text).includes("information_schema.columns"))).toHaveLength(1);
  });

  it("falls back to a stale snapshot after a refresh failure", async () => {
    const first = await getDatabaseDiagnostic({ force: true });
    dbMock.query_with_diagnostics.mockImplementation(async (text: string) => {
      if (text.includes("version()")) return { rows: [{ version: "PostgreSQL test" }], rowCount: 1 };
      throw new Error("refresh failed");
    });
    const second = await getDatabaseDiagnostic({ force: true });
    expect(second.public_tables).toBe(first.public_tables);
    expect(second.db_diagnostic.last_refresh_error?.message).toContain("refresh failed");
  });

  it("classifies pool acquisition timeouts as application pool saturation", async () => {
    dbMock.classify_db_error.mockReturnValue("pool_acquire_timeout");
    dbMock.query_with_diagnostics.mockRejectedValue(new Error("pool acquire timed out"));
    const response = await getDatabaseDiagnostic({ force: true });
    expect(response.database_status).toBe("application_pool_saturated");
    expect(response.database).toBe("pool_saturated");
    expect(response.application_pool_saturated).toBe(true);
    expect(response.database_status).not.toBe("database_unreachable");
  });
});
