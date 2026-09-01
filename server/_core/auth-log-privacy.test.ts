import { afterEach, describe, expect, it, vi } from "vitest";
import { __testing, createContext } from "./context";
import { dedupe_user_lookup } from "./user-cache";

const TEST_UUID = "186ad6af-4528-4153-a466-5e3ee1a5165a";
const TEST_EMAIL = "person@example.com";

describe("authentication runtime security", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("redacts structured identifiers and identifiers embedded in diagnostic text", () => {
    const sanitized = __testing.sanitizeAuthLogDetails({
      supabase_user_id: TEST_UUID,
      supabase_email: TEST_EMAIL,
      cache_key: TEST_EMAIL,
      nested: {
        open_id: TEST_UUID,
        detail: `lookup failed for ${TEST_EMAIL} (${TEST_UUID})`,
      },
    });

    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain(TEST_UUID);
    expect(serialized).not.toContain(TEST_EMAIL);
    expect(sanitized.supabase_user_id).toBe("[redacted]");
    expect(sanitized.supabase_email).toBe("[redacted]");
    expect(sanitized.cache_key).toBe("[redacted]");
    expect(serialized).toContain("[redacted_email]");
    expect(serialized).toContain("[redacted_uuid]");
  });

  it("logs only lookup-key classification for in-flight cache diagnostics", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await dedupe_user_lookup(TEST_EMAIL, async () => null);

    const serialized = JSON.stringify(warn.mock.calls);
    expect(serialized).not.toContain(TEST_EMAIL);
    expect(serialized).not.toContain(TEST_UUID);
    expect(serialized).not.toContain("cache_key");
    expect(serialized).toContain("lookup_key_kind");
    expect(serialized).toContain("email");
  });

  it("does not create an artificial identity from the retired inspection flag", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LIGHTHOUSE_INSPECTION_MODE", "true");

    const context = await createContext({
      req: { headers: {} },
      res: {},
    } as any);

    expect(context.user).toBeNull();
    expect(context.auth.auth_status).toBe("unauthenticated");
  });
});
