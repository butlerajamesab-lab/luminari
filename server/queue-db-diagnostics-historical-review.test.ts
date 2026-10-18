import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  legacy_query: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./db-legacy", () => ({
  DbTimeoutDiagnosticError: class DbTimeoutDiagnosticError extends Error {
    code: string;
    detail: string;
    timeout_ms: number;

    constructor(code: string, message: string, timeout_ms: number, detail?: string) {
      super(message);
      this.code = code;
      this.detail = detail ?? message;
      this.timeout_ms = timeout_ms;
    }
  },
  classify_db_error: (error: any) => error?.code ?? "db_error",
  connect_with_pool_timeout: mocks.connect,
  query_with_diagnostics: mocks.legacy_query,
}));

const { query_with_diagnostics } = await import("./queue-db-diagnostics");

function saturated_pool_error() {
  return Object.assign(new Error("pool acquire timed out"), { code: "pool_acquire_timeout" });
}

describe("historical queue starvation reviews #428", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockImplementation(async ({ text }: { text: string }) => ({
      rows: text === "select 1" ? [{ answer: 1 }] : [],
      rowCount: 1,
    }));
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  });

  it("records acquisition saturation before queries and backs off the same claim label (#428 P2)", async () => {
    mocks.connect.mockRejectedValueOnce(saturated_pool_error());
    const label = "legislative_version_queue_claim";
    await expect(query_with_diagnostics("select 1", [], { label })).rejects.toMatchObject({
      code: "pool_acquire_timeout",
    });
    await expect(query_with_diagnostics("select 1", [], { label })).rejects.toMatchObject({
      code: "query_timeout",
      detail: "queue_query_circuit_open",
    });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("never converts completion writes into synthetic circuit-open failures (#428 P1)", async () => {
    const label = "legislative_version_queue_complete";
    mocks.connect.mockRejectedValueOnce(saturated_pool_error());
    await expect(query_with_diagnostics("select 1", [], { label })).rejects.toMatchObject({
      code: "pool_acquire_timeout",
    });
    const result = await query_with_diagnostics<{ answer: number }>("select 1", [], { label });
    expect(result.rows).toEqual([{ answer: 1 }]);
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls.map(([command]) => command.text)).toEqual([
      "begin",
      "select set_config('statement_timeout', $1, true)",
      "select 1",
      "commit",
    ]);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
