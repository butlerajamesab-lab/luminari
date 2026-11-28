import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __testing } from "./context";

const { resolveSupabaseAuthUser, clearSupabaseAuthUserCache, supabaseAuthUserCacheSize } =
  __testing;

vi.mock("./user-resolver", () => ({
  get_user_by_open_id_snake: vi.fn(),
  get_user_by_email_snake: vi.fn(),
}));

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return {
    ...actual,
    classify_db_error: vi.fn(),
  };
});

const SUPABASE_USER = {
  id: "186ad6af-4528-4153-a466-5e3ee1a5165a",
  email: "test@example.com",
};

function reqWithToken(token: string) {
  return {
    headers: { "x-lighthouse-supabase-session": token },
  } as Parameters<typeof resolveSupabaseAuthUser>[0];
}

function okResponse(user: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => user,
  } as Response;
}

function rejectedResponse() {
  return {
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    json: async () => ({}),
  } as Response;
}

describe("resolveSupabaseAuthUser identity cache", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearSupabaseAuthUserCache();
    process.env.LIGHTHOUSE_SUPABASE_URL = "https://example.supabase.co";
    process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(okResponse(SUPABASE_USER));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearSupabaseAuthUserCache();
  });

  it("serves a second call within the TTL from cache without re-fetching", async () => {
    const first = await resolveSupabaseAuthUser(reqWithToken("token-a"), []);
    const second = await resolveSupabaseAuthUser(reqWithToken("token-a"), []);

    expect(first).toEqual(SUPABASE_USER);
    expect(second).toEqual(SUPABASE_USER);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches separately for different session tokens", async () => {
    await resolveSupabaseAuthUser(reqWithToken("token-a"), []);
    await resolveSupabaseAuthUser(reqWithToken("token-b"), []);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-fetches after the TTL expires", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    const start = Date.now();
    nowSpy.mockReturnValue(start);
    await resolveSupabaseAuthUser(reqWithToken("token-a"), []);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(start + 59_000);
    await resolveSupabaseAuthUser(reqWithToken("token-a"), []);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(start + 61_000);
    await resolveSupabaseAuthUser(reqWithToken("token-a"), []);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache rejected sessions", async () => {
    fetchMock.mockResolvedValue(rejectedResponse());

    const first = await resolveSupabaseAuthUser(reqWithToken("bad-token"), []);
    const second = await resolveSupabaseAuthUser(reqWithToken("bad-token"), []);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(supabaseAuthUserCacheSize()).toBe(0);
  });

  it("does not cache network failures and recovers on the next call", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const first = await resolveSupabaseAuthUser(reqWithToken("token-a"), []);
    expect(first).toBeNull();

    const second = await resolveSupabaseAuthUser(reqWithToken("token-a"), []);
    expect(second).toEqual(SUPABASE_USER);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds the cache and evicts the oldest entries first", async () => {
    for (let i = 0; i < 501; i += 1) {
      await resolveSupabaseAuthUser(reqWithToken(`token-${i}`), []);
    }
    expect(supabaseAuthUserCacheSize()).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(501);

    // token-0 was evicted, so resolving it again costs a new fetch.
    await resolveSupabaseAuthUser(reqWithToken("token-0"), []);
    expect(fetchMock).toHaveBeenCalledTimes(502);

    // token-500 is still cached.
    await resolveSupabaseAuthUser(reqWithToken("token-500"), []);
    expect(fetchMock).toHaveBeenCalledTimes(502);
  });

  it("returns null without fetching when no session is forwarded", async () => {
    const result = await resolveSupabaseAuthUser({ headers: {} } as Parameters<
      typeof resolveSupabaseAuthUser
    >[0], []);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
