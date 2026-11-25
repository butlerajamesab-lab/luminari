import { describe, expect, it } from "vitest";
import {
  invite_only_enabled,
  invite_only_roles,
  is_open_path,
  trpc_procedures,
} from "./invite-only-gate";

// Paths are real Lighthouse routes: the tRPC procedures the Legislators page
// and the sign-in check call, and the Express mounts in server/_core/index.ts.
describe("invite-only gate", () => {
  it("is off unless the env is exactly true", () => {
    expect(invite_only_enabled({})).toBe(false);
    expect(invite_only_enabled({ LIGHTHOUSE_INVITE_ONLY: "1" })).toBe(false);
    expect(invite_only_enabled({ LIGHTHOUSE_INVITE_ONLY: "true" })).toBe(true);
  });

  it("lets only listed roles through, admin by default", () => {
    expect([...invite_only_roles({})]).toEqual(["admin"]);
    expect([...invite_only_roles({ LIGHTHOUSE_INVITE_ONLY_ROLES: "admin, guest_reviewer" })])
      .toEqual(["admin", "guest_reviewer"]);
  });

  it("reads batched tRPC procedure names", () => {
    expect(trpc_procedures("/api/trpc/auth.me,legislators.tribal")).toEqual(["auth.me", "legislators.tribal"]);
    expect(trpc_procedures("/api/trpc/")).toEqual([]);
  });

  it("keeps only the sign-in path open", () => {
    expect(is_open_path("/native-nations")).toBe(true);
    expect(is_open_path("/api/health")).toBe(true);
    expect(is_open_path("/api/invites/redeem")).toBe(true);
    expect(is_open_path("/api/trpc/auth.me")).toBe(true);
    expect(is_open_path("/api/trpc/auth.me,legislators.tribal")).toBe(false);
    expect(is_open_path("/api/trpc/legislators.tribal")).toBe(false);
    expect(is_open_path("/api/offices/nearest")).toBe(false);
    expect(is_open_path("/api/civic-genome/export/bills")).toBe(false);
  });

  it("cannot be bypassed by capitals, doubled slashes or malformed encodings", () => {
    expect(is_open_path("/API/trpc/legislators.tribal")).toBe(false);
    expect(is_open_path("/Api/Offices/nearest")).toBe(false);
    expect(is_open_path("//api//trpc/legislators.tribal")).toBe(false);
    expect(trpc_procedures("/api/trpc/%")).toEqual(["<malformed>"]);
    expect(is_open_path("/api/trpc/%")).toBe(false);
  });

  it("keeps invite onboarding reachable (InviteLanding and Login)", () => {
    expect(is_open_path("/api/trpc/invites.validate")).toBe(true);
    expect(is_open_path("/api/trpc/auth.bootstrap")).toBe(true);
    expect(is_open_path("/api/trpc/auth.me,invites.validate")).toBe(true);
    expect(is_open_path("/api/trpc/invites.create")).toBe(false);
  });
});
