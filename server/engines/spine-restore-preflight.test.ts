import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}));

vi.mock("../db", () => ({
  getPool: () => ({ connect: connectMock }),
}));

import {
  preflight_spine_restore_contents,
  preflight_spine_restore_request,
} from "./spine-restore-preflight";

function schemaTable(tableName = "engine_registry", columnName = "engine_id_er") {
  return {
    tableName,
    rowCount: 0,
    rowCountMode: "estimate",
    columns: [
      {
        columnName,
        typeSql: "text",
        notNull: true,
        defaultSql: null,
        identity: "",
        generated: "",
      },
    ],
    constraints: [],
    indexes: [],
    createStatement: "",
    postCreateStatements: [],
  };
}

function bundle(bundleType: "full" | "schema" | "config" | "deployment") {
  return {
    _manifest: { bundleType },
    schema: { enums: [], tables: [schemaTable()] },
    config: {
      registryTables: [
        {
          tableName: "engine_registry",
          rowCount: 1,
          truncated: false,
          rows: [{ engine_id_er: "pattern-engine" }],
        },
      ],
    },
    data: [
      {
        tableName: "engine_registry",
        rowCount: 1,
        truncated: false,
        rows: [{ engine_id_er: "pattern-engine" }],
      },
    ],
  };
}

beforeEach(() => {
  connectMock.mockReset();
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
  queryMock.mockImplementation(async (text: string) => {
    if (text.includes("information_schema.columns")) {
      return {
        rows: [
          { table_name: "engine_registry", column_name: "engine_id_er" },
        ],
      };
    }
    return { rows: [] };
  });
});

describe("Sovereign Spine restore preflight", () => {
  it("allows only declared restore capabilities for each signed bundle type", () => {
    expect(preflight_spine_restore_request(bundle("full"), "full")).toEqual({
      manifestType: "full",
      restoreType: "full",
    });
    expect(preflight_spine_restore_request(bundle("deployment"), "config")).toEqual({
      manifestType: "deployment",
      restoreType: "config",
    });
    expect(() => preflight_spine_restore_request(bundle("schema"), "full")).toThrow(
      "cannot execute requested full restore",
    );
    expect(() => preflight_spine_restore_request(bundle("config"), "schema")).toThrow(
      "cannot execute requested schema restore",
    );
  });

  it("validates schema, target identity, and data rows in one read-only preflight", async () => {
    const resolver = vi.fn(() => "engine_id_er");

    await expect(
      preflight_spine_restore_contents(bundle("full"), "full", resolver),
    ).resolves.toBeUndefined();

    expect(resolver).toHaveBeenCalledWith(
      "engine_registry",
      expect.any(Set),
      [{ engine_id_er: "pattern-engine" }],
    );
    expect(queryMock.mock.calls[0][0]).toBe(
      "begin transaction isolation level repeatable read read only",
    );
    expect(queryMock.mock.calls.at(-1)?.[0]).toBe("commit");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed schema before acquiring a target client", async () => {
    const value = bundle("schema");
    value.schema.tables[0].columns = [];

    await expect(
      preflight_spine_restore_contents(value, "schema", vi.fn()),
    ).rejects.toThrow("has no columns");
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported registry tables before mutation", async () => {
    const value = bundle("config");
    value.config.registryTables[0].tableName = "users";

    await expect(
      preflight_spine_restore_contents(value, "config", vi.fn()),
    ).rejects.toThrow("Unsupported registry restore table");
    expect(queryMock.mock.calls.at(-1)?.[0]).toBe("rollback");
  });

  it("rejects truncated and unknown-column data before mutation", async () => {
    const truncated = bundle("full");
    truncated.data[0].truncated = true;
    await expect(
      preflight_spine_restore_contents(truncated, "full", () => "engine_id_er"),
    ).rejects.toThrow("was truncated in the bundle");

    const unknown = bundle("full");
    unknown.data[0].rows = [{ engine_id_er: "pattern-engine", unknown_column: 1 }];
    await expect(
      preflight_spine_restore_contents(unknown, "full", () => "engine_id_er"),
    ).rejects.toThrow("contains unknown column unknown_column");
  });

  it("requires every requested section before mutation", () => {
    const value = bundle("full");
    delete (value as any).data;
    expect(() => preflight_spine_restore_request(value, "full")).toThrow(
      "complete data section",
    );
  });
});
