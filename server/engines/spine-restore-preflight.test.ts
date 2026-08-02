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

const registryRows = [
  {
    tableName: "engine_registry",
    rowCount: 1,
    truncated: false,
    rows: [{ engine_id_er: "pattern-engine" }],
  },
  {
    tableName: "data_stream_registry",
    rowCount: 1,
    truncated: false,
    rows: [{ stream_id_dsr: "census-acs" }],
  },
  {
    tableName: "signal_registry",
    rowCount: 1,
    truncated: false,
    rows: [{ signal_type: "deadline-risk" }],
  },
  {
    tableName: "pattern_registry",
    rowCount: 1,
    truncated: false,
    rows: [{ pattern_id: "pattern-1" }],
  },
];

const identityByTable: Record<string, string> = {
  engine_registry: "engine_id_er",
  data_stream_registry: "stream_id_dsr",
  signal_registry: "signal_type",
  pattern_registry: "pattern_id",
};

function bundle(bundleType: "full" | "schema" | "config" | "deployment") {
  return {
    _manifest: { bundleType },
    schema: { enums: [], tables: [schemaTable()] },
    config: {
      registryTables: structuredClone(registryRows),
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

function columnRow(table_name: string, column_name: string) {
  return {
    table_name,
    column_name,
    data_type: "text",
    udt_name: "text",
    is_nullable: "NO",
    column_default: null,
    is_identity: "NO",
    identity_generation: null,
    is_generated: "NEVER",
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
        rows: Object.entries(identityByTable).map(([tableName, columnName]) =>
          columnRow(tableName, columnName),
        ),
      };
    }
    if (text.includes("as identity_value")) return { rows: [] };
    if (text.includes("count(*) as row_count")) {
      return { rows: [{ row_count: 0 }] };
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

  it("validates schema, target identity, constraints, and data rows in one read-only preflight", async () => {
    const resolver = vi.fn((tableName: string) => identityByTable[tableName]);

    await expect(
      preflight_spine_restore_contents(bundle("full"), "full", resolver),
    ).resolves.toBeUndefined();

    expect(resolver).toHaveBeenCalledWith(
      "engine_registry",
      expect.anything(),
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

  it("rejects empty or incomplete registry inventory before mutation", () => {
    const empty = bundle("config");
    empty.config.registryTables = [];
    expect(() => preflight_spine_restore_request(empty, "config")).toThrow(
      "registryTables inventory is empty",
    );

    const incomplete = bundle("config");
    incomplete.config.registryTables = incomplete.config.registryTables.filter(
      (table) => table.tableName !== "pattern_registry",
    );
    expect(() => preflight_spine_restore_request(incomplete, "config")).toThrow(
      "missing required registry tables: pattern_registry",
    );
  });

  it("rejects unsupported registry tables before mutation", async () => {
    const value = bundle("config");
    value.config.registryTables.push({
      tableName: "users",
      rowCount: 1,
      truncated: false,
      rows: [{ id: 1 }],
    } as any);

    await expect(
      preflight_spine_restore_contents(
        value,
        "config",
        (tableName) => identityByTable[tableName] ?? "id",
      ),
    ).rejects.toThrow("Unsupported registry restore table");
    expect(queryMock.mock.calls.at(-1)?.[0]).toBe("rollback");
  });

  it("rejects truncated and unknown-column data before mutation", async () => {
    const truncated = bundle("full");
    truncated.data[0].truncated = true;
    await expect(
      preflight_spine_restore_contents(
        truncated,
        "full",
        (tableName) => identityByTable[tableName],
      ),
    ).rejects.toThrow("was truncated in the bundle");

    const unknown = bundle("full");
    unknown.data[0].rows = [{ engine_id_er: "pattern-engine", unknown_column: 1 }];
    await expect(
      preflight_spine_restore_contents(
        unknown,
        "full",
        (tableName) => identityByTable[tableName],
      ),
    ).rejects.toThrow("contains unknown column unknown_column");
  });

  it("rejects target-only required columns before mutation", async () => {
    queryMock.mockImplementation(async (text: string) => {
      if (text.includes("information_schema.columns")) {
        return {
          rows: [
            ...Object.entries(identityByTable).map(([tableName, columnName]) =>
              columnRow(tableName, columnName),
            ),
            {
              ...columnRow("engine_registry", "required_target_field"),
              column_name: "required_target_field",
            },
          ],
        };
      }
      if (text.includes("as identity_value")) return { rows: [] };
      if (text.includes("count(*) as row_count")) return { rows: [{ row_count: 0 }] };
      return { rows: [] };
    });

    await expect(
      preflight_spine_restore_contents(
        bundle("full"),
        "full",
        (tableName) => identityByTable[tableName],
      ),
    ).rejects.toThrow("cannot satisfy required target column");
  });

  it("requires every requested section before mutation", () => {
    const value = bundle("full");
    delete (value as any).data;
    expect(() => preflight_spine_restore_request(value, "full")).toThrow(
      "complete data section",
    );
  });
});
