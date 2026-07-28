import { describe, expect, it } from "vitest";
import {
  validate_spine_row_against_target,
  type spine_target_table_contract,
} from "./spine-target-contract";

function contract(
  overrides: Partial<spine_target_table_contract> = {},
): spine_target_table_contract {
  return {
    tableName: "example_table",
    exists: true,
    columns: new Map([
      [
        "id",
        {
          columnName: "id",
          dataType: "integer",
          udtName: "int4",
          nullable: false,
          defaultSql: "nextval('example_table_id_seq'::regclass)",
          identity: "",
          identityGeneration: null,
          generated: "NEVER",
        },
      ],
      [
        "name",
        {
          columnName: "name",
          dataType: "text",
          udtName: "text",
          nullable: false,
          defaultSql: null,
          identity: "",
          identityGeneration: null,
          generated: "NEVER",
        },
      ],
      [
        "observed_at",
        {
          columnName: "observed_at",
          dataType: "timestamp with time zone",
          udtName: "timestamptz",
          nullable: true,
          defaultSql: null,
          identity: "",
          identityGeneration: null,
          generated: "NEVER",
        },
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

  it("rejects generated and ALWAYS identity writes", () => {
    const generated = contract({
      columns: new Map([
        [
          "computed",
          {
            columnName: "computed",
            dataType: "text",
            udtName: "text",
            nullable: true,
            defaultSql: null,
            identity: "",
            identityGeneration: null,
            generated: "ALWAYS",
          },
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
          {
            columnName: "id",
            dataType: "integer",
            udtName: "int4",
            nullable: false,
            defaultSql: null,
            identity: "YES",
            identityGeneration: "ALWAYS",
            generated: "NEVER",
          },
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
