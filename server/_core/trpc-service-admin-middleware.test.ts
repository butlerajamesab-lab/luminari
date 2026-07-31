import { afterEach, describe, expect, it, vi } from "vitest";

const adminGate = vi.hoisted(() => vi.fn());

vi.mock("./express-admin-middleware", () => ({
  requireExpressAdmin: adminGate,
}));

import {
  ADMIN_ONLY_TRPC_NAMESPACES,
  extractTrpcProcedurePaths,
  isAdminOnlyTrpcProcedure,
  requireAdminForServiceTrpcOperations,
} from "./trpc-service-admin-middleware";

describe("service tRPC administrator boundary", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("classifies every declared service namespace as administrator-only", () => {
    for (const namespace of ADMIN_ONLY_TRPC_NAMESPACES) {
      expect(isAdminOnlyTrpcProcedure(namespace)).toBe(true);
      expect(isAdminOnlyTrpcProcedure(`${namespace}.run`)).toBe(true);
    }
  });

  it("does not gate unrelated public civic-reference procedures", () => {
    expect(isAdminOnlyTrpcProcedure("docket.jurisdictions")).toBe(false);
    expect(isAdminOnlyTrpcProcedure("resourceDirectory.search")).toBe(false);
    expect(isAdminOnlyTrpcProcedure("system.stats")).toBe(false);
  });

  it("extracts and decodes batched procedure paths", () => {
    expect(
      extractTrpcProcedurePaths({
        path: "/system.stats%2Cactivation.start,setup.backfillConfidenceScores",
      } as any)
    ).toEqual([
      "system.stats",
      "activation.start",
      "setup.backfillConfidenceScores",
    ]);

    expect(
      extractTrpcProcedurePaths({
        path: "/system.stats,activation.start",
      } as any)
    ).toEqual(["system.stats", "activation.start"]);
  });

  it("passes unrelated procedures without invoking the administrator resolver", async () => {
    const req = { path: "/docket.jurisdictions" } as any;
    const res = {} as any;
    const next = vi.fn();

    await requireAdminForServiceTrpcOperations(req, res, next);

    expect(adminGate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("requires an administrator for an exact service procedure", async () => {
    const req = { path: "/sunam.enrichForm" } as any;
    const res = {} as any;
    const next = vi.fn();
    adminGate.mockResolvedValue(undefined);

    await requireAdminForServiceTrpcOperations(req, res, next);

    expect(adminGate).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("requires an administrator when any procedure in a batch is service-owned", async () => {
    const req = {
      path: "/system.stats,phase2PacketLoader.runPacketLoad",
    } as any;
    const res = {} as any;
    const next = vi.fn();
    adminGate.mockResolvedValue(undefined);

    await requireAdminForServiceTrpcOperations(req, res, next);

    expect(adminGate).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});
