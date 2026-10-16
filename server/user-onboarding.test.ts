import { afterEach, describe, expect, it, vi } from "vitest";
import { getPool } from "./db";
import { ensure_supabase_user_profile } from "./user-onboarding";

vi.mock("./db", () => ({ getPool: vi.fn() }));

function prepare_client(existing_role?: string, should_fail_insert = false) {
  const query = vi.fn(async (statement: string, _params?: unknown[]) => {
    if (statement.startsWith("select role from public.users")) {
      return { rows: existing_role ? [{ role: existing_role }] : [] };
    }
    if (statement.includes("insert into public.users") && should_fail_insert) {
      throw new Error("database write failed");
    }
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  vi.mocked(getPool).mockReturnValue({
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as ReturnType<typeof getPool>);
  return client;
}

describe("Supabase profile onboarding", () => {
  afterEach(() => vi.clearAllMocks());

  it("provisions free non-admin accounts from verified identity", async () => {
    const client = prepare_client();
    const result = await ensure_supabase_user_profile(
      "c09b0f42-e211-449f-a73d-5ec4d7060635",
      "NEW@EXAMPLE.COM",
    );
    expect(result).toEqual({ role: "user", created: true });
    const inserted = client.query.mock.calls.find(([query]) => query.includes("insert into public.users"));
    expect(inserted?.[0]).toContain("'user', 'free'");
    expect(inserted?.[1]).toEqual([
      "c09b0f42-e211-449f-a73d-5ec4d7060635",
      "new@example.com",
      "new",
      expect.any(Number),
    ]);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("preserves the existing administrator on sign-in", async () => {
    const client = prepare_client("admin");
    expect(await ensure_supabase_user_profile("existing", null)).toEqual({
      role: "admin",
      created: false,
    });
    expect(client.query.mock.calls.some(([query]) => query.includes("insert into public.users"))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back failures and releases the connection", async () => {
    const client = prepare_client(undefined, true);
    await expect(ensure_supabase_user_profile("new", null)).rejects.toThrow("database write failed");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
