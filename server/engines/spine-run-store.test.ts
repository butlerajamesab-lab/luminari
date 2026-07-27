import { describe, expect, it } from "vitest";
import { parse_spine_ledger_value } from "./spine-run-store";

describe("Sovereign Spine ledger JSON compatibility", () => {
  it("preserves objects and arrays already decoded from PostgreSQL jsonb", () => {
    const objectValue = { checksumValid: true, warnings: [] };
    const arrayValue = ["engine_registry", "data_stream_registry"];

    expect(parse_spine_ledger_value(objectValue, null)).toBe(objectValue);
    expect(parse_spine_ledger_value(arrayValue, [])).toBe(arrayValue);
  });

  it("parses text-backed compatibility columns", () => {
    expect(parse_spine_ledger_value('{"checksumValid":true}', null)).toEqual({
      checksumValid: true,
    });
    expect(parse_spine_ledger_value('["engine_registry"]', [])).toEqual([
      "engine_registry",
    ]);
  });

  it("uses the fallback for null, empty, and invalid text", () => {
    expect(parse_spine_ledger_value(null, [])).toEqual([]);
    expect(parse_spine_ledger_value("", [])).toEqual([]);
    expect(parse_spine_ledger_value("not-json", [])).toEqual([]);
  });
});
