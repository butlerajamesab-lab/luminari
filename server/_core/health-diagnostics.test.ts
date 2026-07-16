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
    const mock_query_result = <T>(rows: T[]) => {
      const result = { rows } as { rows: T[]; rowCount: number };
      result.rowCount = rows.length;
      return result;
    };
    dbMock.query_with_diagnostics.mockImplementation(async (text: string) => {
      if (text.includes("version()")) return mock_query_result([{ version: "PostgreSQL test" }]);
      if (text.includes("information_schema.tables")) {
        expect(text).toContain("table_type = 'BASE TABLE'");
        return mock_query_result([{ table_name: "alpha", column_count: 2 }]);
      }
      if (text.includes("information_schema.views")) return mock_query_result([{ view_name: "alpha_view" }]);
      return mock_query_result([{ table_name: "alpha", column_name: "beta", foreign_table_name: "gamma", foreign_column_name: "id" }]);
    });
  });

  it("shares one deep diagnostic refresh across concurrent requests", async () => {
    const [a, b] = await Promise.all([getDatabaseDiagnostic({ force: true }), getDatabaseDiagnostic({ force: true })]);
    expect(a.db_diagnostic.generated_at).toBeTruthy();
    expect(b.db_diagnostic.generated_at).toBe(a.db_diagnostic.generated_at);
    expect(dbMock.query_with_diagnostics.mock.calls.filter(([text]) => String(text).includes("information_schema.tables"))).toHaveLength(1);
  });

  it("keeps base-table and view totals separate", async () => {
    const response = await getDatabaseDiagnostic({ force: true });

    expect(response.public_tables).toBe(1);
    expect(response.db_diagnostic.tables.total).toBe(1);
    expect(response.db_diagnostic.views.total).toBe(1);
    expect(response.db_diagnostic.tables.inventory).toEqual([
      { table_name: "alpha", column_count: 2 },
    ]);
    expect(response.db_diagnostic.views.inventory).toEqual([
      { view_name: "alpha_view" },
    ]);
  });

  it("falls back to a stale snapshot after a refresh failure", async () => {
    const first = await getDatabaseDiagnostic({ force: true });
    dbMock.query_with_diagnostics.mockImplementation(async (text: string) => {
      if (text.includes("version()")) {
        const result = { rows: [{ version: "PostgreSQL test" }] } as { rows: { version: string }[]; rowCount: number };
        result.rowCount = 1;
        return result;
      }
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