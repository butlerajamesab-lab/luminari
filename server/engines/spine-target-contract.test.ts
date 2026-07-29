import { describe, expect, it } from "vitest";
import {
  validate_spine_row_against_target,
  type spine_target_column_contract,
  type spine_target_table_contract,
} from "./spine-target-contract";

function column(
  columnName: string,
  dataType: string,
  udtName: string,
  overrides: Partial<spine_target_column_contract> = {},
): spine_target_column_contract {
  return {
    columnName,
    dataType,
    udtName,
    nullable: false,
    defaultSql: null,
    identity: "",
    identityGeneration: null,
    generated: "NEVER",
    ...overrides,
  };
}

function contract(
  overrides: Partial<spine_target_table_contract> = {},
): spine_target_table_contract {
  return {
    tableName: "example_table",
    exists: true,
    columns: new Map([
      [
        "id",
        column("id", "integer", "int4", {
          defaultSql: "nextval('example_table_id_seq'::regclass)",
        }),
      ],
      ["name", column("name", "text", "text")],
      [
        "observed_at",
        column("observed_at", "timestamp with time zone", "timestamptz", {
          nullable: true,
        }),
      ],
    ]),
    ...overrides,
  };
}

describe("Sovereign Spine target contract validation", () => {
  it("requires target-only non-null columns when an insert is planned", () => {
    expect(() =>
      validate_spine_row_against_target(contract(), {}, {
        requireInsertCompleteness: true,
      }),
    ).toThrow("cannot satisfy required target column example_table.name");
  });

  it("does not require insert-only fields for a planned update", () => {
    expect(() =>
      validate_spine_row_against_target(contract(), {}, {
        requireInsertCompleteness: false,
      }),
    ).not.toThrow();
  });

  it("rejects incompatible and unknown values before mutation", () => {
    expect(() =>
      validate_spine_row_against_target(contract(), { name: { nested: true } }, {
        requireInsertCompleteness: true,
      }),
    ).toThrow("incompatible object value");

    expect(() =>
      validate_spine_row_against_target(contract(), { name: "valid", unknown: 1 }, {
        requireInsertCompleteness: true,
      }),
    ).toThrow("contains unknown column unknown");
  });

  it("accepts deterministic ISO timestamp values", () => {
    expect(() =>
      validate_spine_row_against_target(
        contract(),
        { name: "valid", observed_at: "2026-07-27T16:00:00.000Z" },
        { requireInsertCompleteness: true },
      ),
    ).not.toThrow();
  });

  it("enforces integrality and PostgreSQL ranges for integer targets", () => {
    const integerContract = contract({
      columns: new Map([
        ["small_value", column("small_value", "smallint", "int2")],
        ["ordinary_value", column("ordinary_value", "integer", "int4")],
        ["large_value", column("large_value", "bigint", "int8")],
      ]),
    });

    expect(() =>
      validate_spine_row_against_target(
        integerContract,
        {
          small_value: 32767,
          ordinary_value: "2147483647",
          large_value: "9223372036854775807",
        },
        { requireInsertCompleteness: true },
      ),
    ).not.toThrow();

    expect(() =>
      validate_spine_row_against_target(
        integerContract,
        { small_value: 1.5, ordinary_value: 1, large_value: 1 },
        { requireInsertCompleteness: true },
      ),
    ).toThrow("requires an integral smallint value");

    expect(() =>
      validate_spine_row_against_target(
        integerContract,
        { small_value: 32768, ordinary_value: 1, large_value: 1 },
        { requireInsertCompleteness: true },
      ),
    ).toThrow("outside PostgreSQL smallint range");

    expect(() =>
      validate_spine_row_against_target(
        integerContract,
        { small_value: 1, ordinary_value: "2147483648", large_value: 1 },
        { requireInsertCompleteness: true },
      ),
    ).toThrow("outside PostgreSQL integer range");

    expect(() =>
      validate_spine_row_against_target(
        integerContract,
        {
          small_value: 1,
          ordinary_value: 1,
          large_value: "9223372036854775808",
        },
        { requireInsertCompleteness: true },
      ),
    ).toThrow("outside PostgreSQL bigint range");
  });

  it("rejects generated and ALWAYS identity writes", () => {
    const generated = contract({
      columns: new Map([
        [
          "computed",
          column("computed", "text", "text", { generated: "ALWAYS", nullable: true }),
        ],
      ]),
    });
    expect(() =>
      validate_spine_row_against_target(
        generated,
        { computed: "do not write" },
        { requireInsertCompleteness: true },
      ),
    ).toThrow("cannot write generated column");

    const identity = contract({
      columns: new Map([
        [
          "id",
          column("id", "integer", "int4", {
            identity: "YES",
            identityGeneration: "ALWAYS",
          }),
        ],
      ]),
    });
    expect(() =>
      validate_spine_row_against_target(
        identity,
        { id: 1 },
        { requireInsertCompleteness: true },
      ),
    ).toThrow("cannot write ALWAYS identity column");
  });
});
