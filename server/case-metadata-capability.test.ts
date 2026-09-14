import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyCaseOwnership } = vi.hoisted(() => ({
  verifyCaseOwnership: vi.fn(),
}));

vi.mock("./db", () => ({ verifyCaseOwnership, db: {} }));

import { appRouter } from "./routers";

const caller = () => appRouter.createCaller({
  user: { id: 7 },
  auth: { auth_status: "authenticated" },
} as never);

beforeEach(() => {
  verifyCaseOwnership.mockReset();
});

describe("cases.get metadata capability", () => {
  it.each([
    ["OWNER", true],
    ["WRITE", true],
    ["READ_ONLY", false],
    ["unknown_future_access", false],
    [undefined, false],
  ])("maps access %s to canEditMetadata=%s", async (accessLevel, expected) => {
    const caseData = { id: 41, userId: 1, name: "Case title" };
    verifyCaseOwnership.mockResolvedValue({ ...caseData, _accessLevel: accessLevel });

    const result = await caller().cases.get({ id: 41 });

    expect(verifyCaseOwnership).toHaveBeenCalledWith(41, 7);
    expect(result).toEqual({ ...caseData, canEditMetadata: expected });
    expect(result).not.toHaveProperty("_accessLevel");
  });

  it.each(["FORBIDDEN", "NOT_FOUND"] as const)("preserves %s access failures", async code => {
    verifyCaseOwnership.mockRejectedValue(new TRPCError({ code, message: "Case unavailable" }));

    await expect(caller().cases.get({ id: 41 })).rejects.toMatchObject({ code });
    expect(verifyCaseOwnership).toHaveBeenCalledWith(41, 7);
  });

  it("rejects unauthenticated callers before reading the case", async () => {
    const anonymous = appRouter.createCaller({
      user: null,
      auth: { auth_status: "unauthenticated" },
    } as never);

    await expect(anonymous.cases.get({ id: 41 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(verifyCaseOwnership).not.toHaveBeenCalled();
  });
});
