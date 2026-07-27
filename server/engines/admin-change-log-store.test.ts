import { describe, expect, it } from "vitest";
import {
  normalize_admin_change_log_timestamp,
  parse_admin_change_log_value,
  stringify_admin_change_log_value,
} from "./admin-change-log-store";

describe("admin change log normalization", () => {
  it("serializes structured values and bigint without losing the receipt", () => {
    expect(
      stringify_admin_change_log_value({ count: 12n, state: "complete" }),
    ).toBe('{"count":"12","state":"complete"}');
  });

  it("preserves existing text and parses valid JSON", () => {
    expect(stringify_admin_change_log_value("plain receipt")).toBe(
      "plain receipt",
    );
    expect(parse_admin_change_log_value('{"success":true}')).toEqual({
      success: true,
    });
    expect(parse_admin_change_log_value("plain receipt")).toBe(
      "plain receipt",
    );
  });

  it("normalizes timestamp inputs to PostgreSQL-compatible ISO values", () => {
    expect(normalize_admin_change_log_timestamp(0)).toBe(
      "1970-01-01T00:00:00.000Z",
    );
    expect(
      normalize_admin_change_log_timestamp(
        new Date("2026-07-27T12:00:00.000Z"),
      ),
    ).toBe("2026-07-27T12:00:00.000Z");
  });
});
