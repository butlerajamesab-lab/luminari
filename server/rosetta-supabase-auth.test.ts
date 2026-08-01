import { describe, expect, it } from "vitest";

import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";

function legacy_key(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("Rosetta Supabase server-key headers", () => {
  it("sends opaque secret keys on apikey only", () => {
    const key = "sb_secret_example_value";
    const headers = create_rosetta_supabase_headers(key, {
      accept: "application/json",
      authorization: "Bearer stale-value",
    });

    expect(headers.get("apikey")).toBe(key);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("accept")).toBe("application/json");
  });

  it("sends legacy service-role JWT keys on both required headers", () => {
    const key = legacy_key("service_role");
    const headers = create_rosetta_supabase_headers(key);

    expect(headers.get("apikey")).toBe(key);
    expect(headers.get("authorization")).toBe(`Bearer ${key}`);
  });

  it("rejects publishable keys before any network request", () => {
    expect(() => create_rosetta_supabase_headers("sb_publishable_example"))
      .toThrow("invalid_rosetta_server_key_publishable");
  });

  it("rejects legacy anon and malformed keys before any network request", () => {
    expect(() => create_rosetta_supabase_headers(legacy_key("anon")))
      .toThrow("invalid_rosetta_server_key_role:anon");
    expect(() => create_rosetta_supabase_headers("not-a-key"))
      .toThrow("invalid_rosetta_server_key_role:unknown");
  });
});
