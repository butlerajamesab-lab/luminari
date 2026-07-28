import { describe, expect, it } from "vitest";
import { sanitize_spine_export_value } from "./sovereign-export-spine-engine";

describe("Sovereign Spine export redaction", () => {
  it("removes URL authority credentials and redacts secret query parameters", () => {
    const sanitized = sanitize_spine_export_value(
      "https://operator:super-secret@example.com/feed?token=secret-token&view=public",
    );
    const url = new URL(sanitized);

    expect(url.username).toBe("");
    expect(url.password).toBe("");
    expect(url.searchParams.get("token")).toBe("ENV_PLACEHOLDER");
    expect(url.searchParams.get("view")).toBe("public");
  });

  it("redacts conventional bare key URL parameters", () => {
    const sanitized = sanitize_spine_export_value(
      "https://maps.example.com/geocode?key=live-map-key&address=Seattle",
    );
    const url = new URL(sanitized);

    expect(url.searchParams.get("key")).toBe("ENV_PLACEHOLDER");
    expect(url.searchParams.get("address")).toBe("Seattle");
  });

  it("removes credentials from PostgreSQL connection URLs", () => {
    const sanitized = sanitize_spine_export_value(
      "postgresql://db_user:db_password@example.com:5432/lighthouse",
    );
    const url = new URL(sanitized);

    expect(url.username).toBe("");
    expect(url.password).toBe("");
    expect(url.hostname).toBe("example.com");
    expect(url.pathname).toBe("/lighthouse");
  });

  it("redacts nested JSON-string credentials", () => {
    const sanitized = sanitize_spine_export_value(
      JSON.stringify({ endpoint: "https://user:pass@example.com", api_token: "secret" }),
    );
    const parsed = JSON.parse(sanitized);

    expect(new URL(parsed.endpoint).username).toBe("");
    expect(parsed.api_token).toBe("ENV_PLACEHOLDER");
  });

  it("preserves Date values as deterministic ISO strings", () => {
    const date = new Date("2026-07-27T16:00:00.000Z");
    expect(sanitize_spine_export_value(date)).toBe(
      "2026-07-27T16:00:00.000Z",
    );
    expect(sanitize_spine_export_value({ observedAt: date })).toEqual({
      observedAt: "2026-07-27T16:00:00.000Z",
    });
  });
});
