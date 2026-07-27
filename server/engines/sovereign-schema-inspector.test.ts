import { describe, expect, it } from "vitest";
import { assert_sovereign_table_name } from "./sovereign-schema-inspector";

describe("assert_sovereign_table_name", () => {
  it("accepts one ordinary public schema identifier", () => {
    expect(assert_sovereign_table_name("admin_change_log")).toBe(
      "admin_change_log",
    );
  });

  it("rejects qualified names and SQL fragments", () => {
    expect(() => assert_sovereign_table_name("public.users")).toThrow();
    expect(() =>
      assert_sovereign_table_name("users; drop table users"),
    ).toThrow();
    expect(() => assert_sovereign_table_name("users --")).toThrow();
  });
});
