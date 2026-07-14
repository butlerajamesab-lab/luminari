import { beforeEach, describe, expect, it, vi } from "vitest";
import { DbTimeoutDiagnosticError } from "../db";
import { __testing } from "./context";

const { resolveProfileFromSupabaseAuthUser } = __testing;

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

import { classify_db_error } from "../db";
import { get_user_by_email_snake, get_user_by_open_id_snake } from "./user-resolver";

const mockGetByOpenId = vi.mocked(get_user_by_open_id_snake);
const mockGetByEmail = vi.mocked(get_user_by_email_snake);
const mockClassifyDbError = vi.mocked(classify_db_error);

const makeUser = (overrides: Partial<{ id: number; open_id: string; email: string; role: string }> = {}) => ({
  id: overrides.id ?? 1,
  open_id: overrides.open_id ?? "186ad6af-4528-4153-a466-5e3ee1a5165a",
  name: "Test User",
  email: overrides.email ?? "test@example.com",
  login_method: "supabase",
  role: overrides.role ?? "user",
  plan: "free",
  created_at: 0,
  updated_at: 0,
  last_signed_in: 0,
});

describe("resolveProfileFromSupabaseAuthUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClassifyDbError.mockReturnValue("db_error");
  });

  describe("resolved — user found by open_id", () => {
    it("returns the user and resolved auth when open_id lookup succeeds", async () => {
      const user = makeUser({ role: "admin" });
      mockGetByOpenId.mockResolvedValue(user);

      const result = await resolveProfileFromSupabaseAuthUser(
        { id: user.open_id!, email: user.email! },
        []
      );

      expect(result.user).toBe(user);
      expect(result.auth.auth_status).toBe("authenticated_profile_resolved");
      expect(result.auth.profile_resolution_status).toBe("resolved");
      expect(result.auth.supabase_user_id).toBe(user.open_id);
      expect(mockGetByOpenId).toHaveBeenCalledWith(user.open_id);
      expect(mockGetByEmail).not.toHaveBeenCalled();
    });

    it("hydrates numeric user.id from the DB row, not Supabase UUID", async () => {
      const user = makeUser({ id: 42 });
      mockGetByOpenId.mockResolvedValue(user);

      const result = await resolveProfileFromSupabaseAuthUser(
        { id: user.open_id!, email: user.email! },
        []
      );

      expect(result.user!.id).toBe(42);
    });
  });

  describe("missed — open_id present but no matching row", () => {
    it("returns null user and unresolved auth with status missed", async () => {
      mockGetByOpenId.mockResolvedValue(null);

      const result = await resolveProfileFromSupabaseAuthUser(
        { id: "186ad6af-4528-4153-a466-5e3ee1a5165a", email: "test@example.com" },
        []
      );

      expect(result.user).toBeNull();
      expect(result.auth.auth_status).toBe("authenticated_profile_unresolved");
      expect(result.auth.profile_resolution_status).toBe("missed");
      expect(result.auth.profile_resolution_error).toBeNull();
      expect(mockGetByEmail).not.toHaveBeenCalled();
    });
  });

  describe("email fallback — Supabase id absent", () => {
    it("uses email lookup when Supabase id is absent", async () => {
      const user = makeUser();
      mockGetByEmail.mockResolvedValue(user);

      const result = await resolveProfileFromSupabaseAuthUser(
        { email: "test@example.com" },
        []
      );

      expect(result.user).toBe(user);
      expect(result.auth.profile_resolution_status).toBe("resolved");
      expect(mockGetByOpenId).not.toHaveBeenCalled();
      expect(mockGetByEmail).toHaveBeenCalledWith("test@example.com");
    });

    it("does NOT fall back to email after an open_id miss", async () => {
      mockGetByOpenId.mockResolvedValue(null);

      const result = await resolveProfileFromSupabaseAuthUser(
        { id: "some-uuid", email: "test@example.com" },
        []
      );

      expect(result.user).toBeNull();
      expect(result.auth.profile_resolution_status).toBe("missed");
      expect(mockGetByEmail).not.toHaveBeenCalled();
    });
  });

  describe("timed_out — DB timeout errors", () => {
    it("returns timed_out status for pool_acquire_timeout", async () => {
      const err = new DbTimeoutDiagnosticError("pool_acquire_timeout", "pool acquire timed out after 1000ms", 1000);
      mockGetByOpenId.mockRejectedValue(err);
      mockClassifyDbError.mockReturnValue("pool_acquire_timeout");

      const result = await resolveProfileFromSupabaseAuthUser(
        { id: "some-uuid", email: "test@example.com" },
        []
      );

      expect(result.user).toBeNull();
      expect(result.auth.profile_resolution_status).toBe("timed_out");
      expect(result.auth.profile_resolution_error).toBeTruthy();
    });

    it("returns timed_out status for query_timeout", async () => {
      const err = new DbTimeoutDiagnosticError("query_timeout", "query timed out after 2500ms", 2500);
      mockGetByOpenId.mockRejectedValue(err);
      mockClassifyDbError.mockReturnValue("query_timeout");

      const result = await resolveProfileFromSupabaseAuthUser(
        { id: "some-uuid", email: "test@example.com" },
        []
      );

      expect(result.user).toBeNull();
      expect(result.auth.profile_resolution_status).toBe("timed_out");
      expect(result.auth.auth_status).toBe("authenticated_profile_unresolved");
    });
  });

  describe("threw — unexpected DB errors", () => {
    it("returns threw status and error detail on unexpected errors", async () => {
      const err = new Error("connection refused");
      mockGetByOpenId.mockRejectedValue(err);
      mockClassifyDbError.mockReturnValue("db_error");

      const result = await resolveProfileFromSupabaseAuthUser(
        { id: "some-uuid", email: "test@example.com" },
        []
      );

      expect(result.user).toBeNull();
      expect(result.auth.profile_resolution_status).toBe("threw");
      expect(result.auth.profile_resolution_error).toBe("connection refused");
      expect(result.auth.auth_status).toBe("authenticated_profile_unresolved");
    });

    it("never grants access on error — user is always null", async () => {
      mockGetByOpenId.mockRejectedValue(new Error("unexpected"));
      mockClassifyDbError.mockReturnValue("db_error");

      const result = await resolveProfileFromSupabaseAuthUser(
        { id: "some-uuid", email: "test@example.com" },
        []
      );

      expect(result.user).toBeNull();
    });
  });

  describe("phase tracking", () => {
    it("appends a profile_lookup phase entry to phases array", async () => {
      mockGetByOpenId.mockResolvedValue(makeUser());
      const phases: any[] = [];

      await resolveProfileFromSupabaseAuthUser({ id: "some-uuid" }, phases);

      expect(phases).toHaveLength(1);
      expect(phases[0].phase).toBe("profile_lookup");
      expect(phases[0].status).toBe("completed");
    });

    it("marks phase as failed when the lookup throws", async () => {
      mockGetByOpenId.mockRejectedValue(new Error("db down"));
      mockClassifyDbError.mockReturnValue("db_error");
      const phases: any[] = [];

      await resolveProfileFromSupabaseAuthUser({ id: "some-uuid" }, phases);

      expect(phases[0].status).toBe("failed");
    });
  });
});
